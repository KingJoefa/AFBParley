import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  ScriptSchema,
  BuildResultSchema,
  identifyCorrelations,
  type Script,
  type CorrelationType,
} from '@/lib/terminal/schemas'
import { hashObject, generateRequestId } from '@/lib/terminal/engine/provenance'
import { checkRequestLimits, estimateTokens } from '@/lib/terminal/engine/guardrails'

/**
 * /api/terminal/build
 *
 * Build correlated parlay scripts from alerts.
 * Identifies correlation patterns and groups alerts into parlays.
 *
 * Input: Alert IDs + metadata
 * Output: Script[] (correlated parlay recommendations)
 */

const BuildRequestSchema = z.object({
  alert_ids: z.array(z.string()).min(2).describe('Alert IDs to build parlays from'),
  // Alert metadata needed for correlation analysis
  alert_metadata: z.array(z.object({
    id: z.string(),
    agent: z.enum(['epa', 'pressure', 'weather', 'qb', 'hb', 'wr', 'te']),
    market: z.string(),
    confidence: z.number().min(0).max(1),
    implications: z.array(z.string()).optional(),
  })),
  options: z.object({
    max_legs: z.number().min(2).max(6).default(4),
    risk_preference: z.enum(['conservative', 'moderate', 'aggressive']).default('moderate'),
  }).optional(),
})

type BuildRequest = z.infer<typeof BuildRequestSchema>

/**
 * Calculate combined confidence for a parlay script
 */
function calculateCombinedConfidence(
  legConfidences: number[],
  correlationBonus: number = 0
): number {
  // Base: product of individual confidences (independent events)
  const baseConfidence = legConfidences.reduce((acc, c) => acc * c, 1)

  // Correlation bonus adjusts for positive correlation (events more likely together)
  // Capped to prevent overconfidence
  const adjusted = Math.min(baseConfidence + correlationBonus * 0.1, 0.95)

  return Math.round(adjusted * 100) / 100
}

/**
 * Determine risk level based on confidence and leg count
 */
function determineRiskLevel(
  confidence: number,
  legCount: number
): 'conservative' | 'moderate' | 'aggressive' {
  if (legCount <= 2 && confidence >= 0.5) {
    return 'conservative'
  }
  if (legCount <= 4 && confidence >= 0.3) {
    return 'moderate'
  }
  return 'aggressive'
}

/**
 * Build a script from a correlation match
 */
function buildScript(
  correlation: { type: CorrelationType; ids: string[]; explanation: string },
  alertMetadata: Map<string, BuildRequest['alert_metadata'][0]>,
  index: number
): Script | null {
  const legs = correlation.ids.map(id => {
    const meta = alertMetadata.get(id)
    if (!meta) return null
    return {
      alert_id: id,
      market: meta.market,
      implied_probability: meta.confidence,
      agent: meta.agent,
    }
  }).filter(Boolean)

  if (legs.length < 2) return null

  const confidences = legs.map(l => l!.implied_probability || 0.5)
  const combinedConfidence = calculateCombinedConfidence(confidences, 0.15)
  const riskLevel = determineRiskLevel(combinedConfidence, legs.length)

  const script: Script = {
    id: `script-${correlation.type}-${index}-${Date.now()}`,
    name: formatScriptName(correlation.type),
    legs: legs as Script['legs'],
    correlation_type: correlation.type,
    correlation_explanation: correlation.explanation,
    combined_confidence: combinedConfidence,
    risk_level: riskLevel,
    provenance_hash: hashObject({ type: correlation.type, ids: correlation.ids }),
  }

  return script
}

/**
 * Format human-readable script name from correlation type
 */
function formatScriptName(type: CorrelationType): string {
  const names: Record<CorrelationType, string> = {
    game_script: 'Game Script Stack',
    player_stack: 'Player Stack Parlay',
    weather_cascade: 'Weather Impact Parlay',
    defensive_funnel: 'Defensive Pressure Stack',
    volume_share: 'Target Volume Parlay',
  }
  return names[type] || 'Custom Parlay'
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  try {
    // Parse request body
    const body = await req.json()
    const parsed = BuildRequestSchema.safeParse(body)

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
    const maxLegs = options?.max_legs || 4

    // Check guardrails
    const inputEstimate = estimateTokens(JSON.stringify(alert_metadata))
    checkRequestLimits({ inputTokens: inputEstimate })

    // Build metadata maps for correlation analysis
    const alertAgents = new Map(alert_metadata.map(m => [m.id, m.agent]))
    const alertImplications = new Map(alert_metadata.map(m => [m.id, m.implications || []]))
    const alertMetadataMap = new Map(alert_metadata.map(m => [m.id, m]))

    // Identify correlation patterns
    const correlations = identifyCorrelations(alert_ids, alertAgents, alertImplications)

    if (correlations.length === 0) {
      return Response.json({
        request_id: requestId,
        scripts: [],
        alerts_used: [],
        alerts_excluded: alert_ids,
        message: 'No correlation patterns identified. Alerts may not have compatible relationships.',
        build_timestamp: Date.now(),
        provenance_hash: hashObject({ alert_ids, timestamp: Date.now() }),
        timing_ms: Date.now() - startTime,
      })
    }

    // Build scripts from correlations
    const scripts: Script[] = []
    const alertsUsed = new Set<string>()

    for (let i = 0; i < correlations.length; i++) {
      const correlation = correlations[i]

      // Limit legs per script
      const limitedCorrelation = {
        ...correlation,
        ids: correlation.ids.slice(0, maxLegs),
      }

      const script = buildScript(limitedCorrelation, alertMetadataMap, i)
      if (script) {
        // Validate against schema
        const validated = ScriptSchema.safeParse(script)
        if (validated.success) {
          scripts.push(validated.data)
          limitedCorrelation.ids.forEach(id => alertsUsed.add(id))
        }
      }
    }

    // Determine excluded alerts
    const alertsExcluded = alert_ids.filter(id => !alertsUsed.has(id))

    // Build result
    const result = {
      request_id: requestId,
      scripts,
      alerts_used: Array.from(alertsUsed),
      alerts_excluded: alertsExcluded,
      build_timestamp: Date.now(),
      provenance_hash: hashObject({ scripts, alert_ids, timestamp: Date.now() }),
    }

    // Validate result against schema
    const validatedResult = BuildResultSchema.safeParse(result)
    if (!validatedResult.success) {
      return Response.json(
        {
          error: 'Build result validation failed',
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
        error: 'Build failed',
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
    endpoint: '/api/terminal/build',
    method: 'POST',
    description: 'Build correlated parlay scripts from alerts',
    schema: {
      alert_ids: 'string[] - Alert IDs to build parlays from (min 2)',
      alert_metadata: '[{ id, agent, market, confidence, implications? }]',
      options: {
        max_legs: 'number (2-6, default: 4)',
        risk_preference: 'conservative | moderate | aggressive',
      },
    },
    correlation_types: [
      'game_script - EPA + rushing patterns',
      'player_stack - QB + receiver combos',
      'weather_cascade - weather affects passing',
      'defensive_funnel - pressure + QB metrics',
      'volume_share - target concentration',
    ],
    example: {
      alert_ids: ['epa-123', 'pressure-456', 'qb-789'],
      alert_metadata: [
        { id: 'epa-123', agent: 'epa', market: 'Chase Over 85.5', confidence: 0.72 },
        { id: 'pressure-456', agent: 'pressure', market: 'Burrow Under 275.5', confidence: 0.68 },
        { id: 'qb-789', agent: 'qb', market: 'Burrow Under 2.5 TDs', confidence: 0.65 },
      ],
    },
  })
}
