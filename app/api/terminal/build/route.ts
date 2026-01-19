import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  ScriptSchema,
  identifyCorrelations,
  type Script,
  type Alert,
  type Finding,
  type CorrelationType,
} from '@/lib/terminal/schemas'
import { hashObject, generateRequestId } from '@/lib/terminal/engine/provenance'
import { checkRequestLimits, estimateTokens } from '@/lib/terminal/engine/guardrails'
import type { BuildView, OutputType } from '@/lib/terminal/terminal-state'

/**
 * /api/terminal/build
 *
 * Phase 2: Build output views from scan results (alerts + findings)
 *
 * Accepts inline alerts/findings payload (not alert_ids)
 * Returns BuildView discriminated union:
 *   - 'terminal': Correlated parlay scripts (prop/parlay modes)
 *   - 'swantail': LLM-generated narrative scripts (story mode)
 */

const BuildRequestSchema = z.object({
  matchup: z.string().min(3).describe('e.g., "49ers @ Seahawks" or "SF @ SEA"'),
  alerts: z.array(z.any()).min(0), // Inline Alert[] from Phase 1
  findings: z.array(z.any()).min(0), // Inline Finding[] from Phase 1
  output_type: z.enum(['prop', 'story', 'parlay']),
  anchor: z.string().optional(),
  anchors: z.array(z.string()).optional(),
  script_bias: z.array(z.string()).optional(),
  signals: z.array(z.string()).optional(),
  odds_paste: z.string().optional(),
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
  alertMap: Map<string, Alert>,
  index: number
): Script | null {
  const legs = correlation.ids.map(id => {
    const alert = alertMap.get(id)
    if (!alert) return null
    return {
      alert_id: id,
      market: alert.claim, // Use claim as the market description
      implied_probability: alert.confidence,
      agent: alert.agent,
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

/**
 * Build terminal view (correlated parlays)
 */
async function buildTerminalView(
  alerts: Alert[],
  findings: Finding[],
  options?: BuildRequest['options']
): Promise<BuildView> {
  const maxLegs = options?.max_legs || 4

  if (alerts.length < 2) {
    return {
      kind: 'terminal',
      scripts: [],
      alerts,
    }
  }

  // Build maps for correlation analysis
  const alertIds = alerts.map(a => a.id)
  const alertAgents = new Map(alerts.map(a => [a.id, a.agent]))
  const alertImplications = new Map(alerts.map(a => [a.id, a.implications || []]))
  const alertMap = new Map(alerts.map(a => [a.id, a]))

  // Identify correlation patterns
  const correlations = identifyCorrelations(alertIds, alertAgents, alertImplications)

  // Build scripts from correlations
  const scripts: Script[] = []
  for (let i = 0; i < correlations.length; i++) {
    const correlation = correlations[i]

    // Limit legs per script
    const limitedCorrelation = {
      ...correlation,
      ids: correlation.ids.slice(0, maxLegs),
    }

    const script = buildScript(limitedCorrelation, alertMap, i)
    if (script) {
      // Validate against schema
      const validated = ScriptSchema.safeParse(script)
      if (validated.success) {
        scripts.push(validated.data)
      }
    }
  }

  return {
    kind: 'terminal',
    scripts,
    alerts,
  }
}

/**
 * Build swantail view (LLM narratives)
 */
async function buildSwantailView(
  matchup: string,
  anchor: string | undefined,
  signals: string[] | undefined,
  odds_paste: string | undefined
): Promise<BuildView> {
  // Call existing Swantail/AFB wrapper for LLM-generated narratives
  const payload = {
    matchup: matchup.trim(),
    lineFocus: anchor?.trim() || undefined,
    angles: signals || [],
    voice: 'analyst' as const,
    userSuppliedOdds: [], // TODO: Parse odds_paste if provided
  }

  const res = await fetch('http://localhost:3000/api/afb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    throw new Error(`Swantail build failed: ${res.status}`)
  }

  const data = await res.json()

  return {
    kind: 'swantail',
    data,
  }
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

    const { matchup, alerts, findings, output_type, anchor, signals, odds_paste, options } = parsed.data

    // Check guardrails
    const inputEstimate = estimateTokens(JSON.stringify({ alerts, findings }))
    checkRequestLimits({ inputTokens: inputEstimate })

    // Compute payload hash for idempotency
    const payloadHash = hashObject({
      matchup,
      alerts,
      findings,
      output_type,
      anchor,
      signals,
      odds_paste,
    })

    // Build appropriate view based on output_type
    let view: BuildView

    if (output_type === 'story') {
      // Story mode: LLM-generated narratives
      view = await buildSwantailView(matchup, anchor, signals, odds_paste)
    } else {
      // Prop/Parlay modes: Terminal correlated parlays
      view = await buildTerminalView(alerts, findings, options)
    }

    // Return BuildResult with discriminated union
    return Response.json({
      build_id: `build-${requestId}`,
      request_id: requestId,
      payload_hash: payloadHash,
      output_type,
      view,
      created_at: new Date().toISOString(),
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
    description: 'Build output views from scan results (Phase 2). Returns BuildView discriminated union.',
    schema: {
      matchup: 'string - e.g., "SF @ SEA"',
      alerts: 'Alert[] - inline from scan',
      findings: 'Finding[] - inline from scan',
      output_type: 'prop | story | parlay',
      anchor: 'string? - market anchor',
      signals: 'string[]? - betting angles',
      odds_paste: 'string? - user-supplied odds',
      options: {
        max_legs: 'number (2-6, default: 4)',
        risk_preference: 'conservative | moderate | aggressive',
      },
    },
    response: {
      kind: 'terminal | swantail',
      terminal: '{ scripts: Script[], alerts: Alert[] }',
      swantail: '{ data: SwantailResponse }',
    },
    example: {
      matchup: 'SF @ SEA',
      alerts: [],
      findings: [],
      output_type: 'story',
      anchor: 'Over 44.5',
      signals: ['pace_skew', 'pressure_mismatch'],
    },
  })
}
