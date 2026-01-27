import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  LadderSchema,
  BetResultSchema,
  organizeLadders,
  type Ladder,
  type RiskTier,
  type Rung,
} from '@/lib/terminal/schemas'
import { hashObject, generateRequestId } from '@/lib/terminal/engine/provenance'
import { checkRequestLimits, estimateTokens } from '@/lib/terminal/engine/guardrails'

/**
 * /api/terminal/bet
 *
 * Organize alerts into risk-tiered betting ladders.
 * Groups bets by confidence/risk level for bankroll management.
 *
 * Input: Alert IDs + metadata
 * Output: Ladder[] (tiered prop bet recommendations)
 */

const BetRequestSchema = z.object({
  alert_ids: z.array(z.string()).min(1).describe('Alert IDs to organize into ladders'),
  // Alert metadata needed for ladder organization
  alert_metadata: z.array(z.object({
    id: z.string(),
    agent: z.enum(['epa', 'pressure', 'weather', 'qb', 'hb', 'wr', 'te', 'notes', 'injury', 'usage', 'pace']),
    market: z.string(),
    line: z.number().optional(),
    confidence: z.number().min(0).max(1),
    severity: z.enum(['high', 'medium']),
    claim: z.string().optional(), // Human-readable claim for rationale
  })),
  options: z.object({
    include_aggressive: z.boolean().default(true),
    max_rungs_per_ladder: z.number().min(1).max(5).default(3),
  }).optional(),
})

type BetRequest = z.infer<typeof BetRequestSchema>

/**
 * Calculate recommended stake percentage based on tier
 */
function calculateStakePct(tier: RiskTier, confidence: number): number {
  const baseStakes: Record<RiskTier, number> = {
    safe: 5,
    moderate: 3,
    aggressive: 1,
  }

  // Adjust by average confidence
  const adjustment = (confidence - 0.5) * 2 // -1 to +1 range
  const stake = baseStakes[tier] + adjustment

  // Clamp between 0.5% and 10%
  return Math.round(Math.max(0.5, Math.min(10, stake)) * 10) / 10
}

/**
 * Calculate total implied probability for rungs
 */
function calculateTotalImpliedProbability(rungs: Rung[]): number {
  const probabilities = rungs.map(r => r.implied_probability || 0.5)
  // Average probability for single bets (not parlay)
  const avg = probabilities.reduce((acc, p) => acc + p, 0) / probabilities.length
  return Math.round(avg * 100) / 100
}

/**
 * Build a rung from alert metadata
 */
function buildRung(meta: BetRequest['alert_metadata'][0]): Rung {
  return {
    alert_id: meta.id,
    market: meta.market,
    line: meta.line,
    implied_probability: meta.confidence,
    agent: meta.agent,
    rationale: meta.claim || `${meta.agent.toUpperCase()} agent signal - ${meta.severity} severity`,
  }
}

/**
 * Build a ladder from tier organization
 */
function buildLadder(
  organization: { tier: RiskTier; ids: string[]; name: string },
  alertMetadataMap: Map<string, BetRequest['alert_metadata'][0]>,
  index: number,
  maxRungs: number
): Ladder | null {
  const rungs = organization.ids
    .slice(0, maxRungs)
    .map(id => {
      const meta = alertMetadataMap.get(id)
      if (!meta) return null
      return buildRung(meta)
    })
    .filter(Boolean) as Rung[]

  if (rungs.length === 0) return null

  const totalProb = calculateTotalImpliedProbability(rungs)
  const avgConfidence = rungs.reduce((acc, r) => acc + (r.implied_probability || 0.5), 0) / rungs.length

  const ladder: Ladder = {
    id: `ladder-${organization.tier}-${index}-${Date.now()}`,
    name: organization.name,
    tier: organization.tier,
    rungs,
    total_implied_probability: totalProb,
    recommended_stake_pct: calculateStakePct(organization.tier, avgConfidence),
    provenance_hash: hashObject({ tier: organization.tier, ids: organization.ids }),
  }

  return ladder
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  try {
    // Parse request body
    const body = await req.json()
    const parsed = BetRequestSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        {
          error: 'Invalid request',
          details: parsed.error.flatten(),
          request_id: requestId,
        },
        { status: 400 }
      )
    }

    const { alert_ids, alert_metadata, options } = parsed.data
    const includeAggressive = options?.include_aggressive ?? true
    const maxRungs = options?.max_rungs_per_ladder ?? 3

    // Check guardrails
    const inputEstimate = estimateTokens(JSON.stringify(alert_metadata))
    checkRequestLimits({ inputTokens: inputEstimate })

    // Build metadata maps
    const alertConfidences = new Map(alert_metadata.map(m => [m.id, m.confidence]))
    const alertSeverities = new Map(alert_metadata.map(m => [m.id, m.severity]))
    const alertMetadataMap = new Map(alert_metadata.map(m => [m.id, m]))

    // Organize into tiers
    const organizations = organizeLadders(alert_ids, alertConfidences, alertSeverities)

    if (organizations.length === 0) {
      return Response.json({
        request_id: requestId,
        ladders: [],
        alerts_used: [],
        alerts_excluded: alert_ids,
        message: 'No alerts qualify for betting ladders. Confidence levels may be too low.',
        bet_timestamp: Date.now(),
        provenance_hash: hashObject({ alert_ids, timestamp: Date.now() }),
        timing_ms: Date.now() - startTime,
      })
    }

    // Filter out aggressive if not included
    const filteredOrgs = includeAggressive
      ? organizations
      : organizations.filter(o => o.tier !== 'aggressive')

    // Build ladders
    const ladders: Ladder[] = []
    const alertsUsed = new Set<string>()

    for (let i = 0; i < filteredOrgs.length; i++) {
      const org = filteredOrgs[i]
      const ladder = buildLadder(org, alertMetadataMap, i, maxRungs)

      if (ladder) {
        // Validate against schema
        const validated = LadderSchema.safeParse(ladder)
        if (validated.success) {
          ladders.push(validated.data)
          org.ids.slice(0, maxRungs).forEach(id => alertsUsed.add(id))
        }
      }
    }

    // Determine excluded alerts
    const alertsExcluded = alert_ids.filter(id => !alertsUsed.has(id))

    // Build result
    const result = {
      request_id: requestId,
      ladders,
      alerts_used: Array.from(alertsUsed),
      alerts_excluded: alertsExcluded,
      bet_timestamp: Date.now(),
      provenance_hash: hashObject({ ladders, alert_ids, timestamp: Date.now() }),
    }

    // Validate result against schema
    const validatedResult = BetResultSchema.safeParse(result)
    if (!validatedResult.success) {
      return Response.json(
        {
          error: 'Bet result validation failed',
          details: validatedResult.error.flatten(),
          request_id: requestId,
        },
        { status: 500 }
      )
    }

    return Response.json({
      ...validatedResult.data,
      timing_ms: Date.now() - startTime,
    })
  } catch (error) {
    return Response.json(
      {
        error: 'Bet organization failed',
        message: (error as Error).message,
        request_id: requestId,
      },
      { status: 500 }
    )
  }
}

// GET for health check / discovery
export async function GET() {
  return Response.json({
    endpoint: '/api/terminal/bet',
    method: 'POST',
    description: 'Organize alerts into risk-tiered betting ladders',
    schema: {
      alert_ids: 'string[] - Alert IDs to organize (min 1)',
      alert_metadata: '[{ id, agent, market, line?, confidence, severity, claim? }]',
      options: {
        include_aggressive: 'boolean (default: true)',
        max_rungs_per_ladder: 'number (1-5, default: 3)',
      },
    },
    risk_tiers: {
      safe: 'High confidence (>=0.7) + high severity - Lower risk, consistent value',
      moderate: 'Medium confidence (0.5-0.7) or medium severity - Balanced approach',
      aggressive: 'Lower confidence (0.3-0.5) - Higher risk, higher potential',
    },
    stake_recommendations: {
      safe: '~5% of bankroll',
      moderate: '~3% of bankroll',
      aggressive: '~1% of bankroll',
    },
    example: {
      alert_ids: ['epa-123', 'pressure-456'],
      alert_metadata: [
        {
          id: 'epa-123',
          agent: 'epa',
          market: 'Chase Over 85.5 Yards',
          line: 85.5,
          confidence: 0.75,
          severity: 'high',
          claim: 'Elite efficiency vs weak coverage',
        },
        {
          id: 'pressure-456',
          agent: 'pressure',
          market: 'Bosa 1+ Sacks',
          confidence: 0.55,
          severity: 'medium',
        },
      ],
    },
  })
}
