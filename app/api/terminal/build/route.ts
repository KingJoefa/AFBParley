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
import { SwantailResponseSchema, type SwantailResponse } from '@/lib/swantail/schema'
import OpenAI from 'openai'

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
  payload_hash: z.string().optional().describe('Hash from client - validated server-side for staleness'),
  selected_agents: z.array(z.string()).optional().describe('Agent IDs that were selected'),
  anchor: z.string().optional(),
  anchors: z.array(z.string()).optional(),
  script_bias: z.array(z.string()).optional(),
  signals: z.array(z.string()).optional().describe('Normalized signal tags for script generation'),
  signals_raw: z.array(z.string()).optional().describe('Raw signals for hash validation'),
  odds_paste: z.string().optional(),
  options: z.object({
    max_legs: z.number().min(2).max(6).default(4),
    risk_preference: z.enum(['conservative', 'moderate', 'aggressive']).default('moderate'),
  }).optional(),
})

type BuildRequest = z.infer<typeof BuildRequestSchema>

/**
 * Compute expected payload hash for staleness validation
 * MUST exactly mirror client-side computation in terminal-state.ts:computeInputsHash
 */
function computeBuildPayloadHash(params: {
  matchup: string
  selected_agents?: string[]
  anchors?: string[]
  script_bias?: string[]
  signals?: string[]
  odds_paste?: string
}): string {
  const { matchup, selected_agents, anchors, script_bias, signals, odds_paste } = params

  // Normalize arrays with sort() - must match client
  const agentKey = selected_agents && selected_agents.length > 0
    ? selected_agents.slice().sort().join(',')
    : 'all'

  const anchorKey = anchors && anchors.length > 0
    ? anchors.slice().sort().join(',')
    : ''

  const biasKey = script_bias && script_bias.length > 0
    ? script_bias.slice().sort().join(',')
    : ''

  const signalsKey = signals && signals.length > 0
    ? signals.slice().sort().join(',')
    : ''

  // Build payload string - MUST match client format exactly
  const payload = `${matchup}|anchors:${anchorKey}|bias:${biasKey}|${signalsKey}|${odds_paste || ''}|agents:${agentKey}`

  // Simple 32-bit hash - MUST match client algorithm
  let hash = 0
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return `h_${Math.abs(hash).toString(16)}`
}

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

// Lazy-init OpenAI client
let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured')
    }
    openaiClient = new OpenAI({ apiKey })
  }
  return openaiClient
}

/**
 * Build prompt for story mode script generation
 */
function buildStoryModePrompt(
  matchup: string,
  alerts: Alert[],
  findings: Finding[],
  anchor?: string,
  signals?: string[],
  script_bias?: string[]
): string {
  const alertsSection = alerts.length > 0
    ? `## Alerts from Scan\n\n${alerts.map(a => `- ${a.claim} (${a.agent}, confidence: ${a.confidence})`).join('\n')}`
    : '## Alerts from Scan\n\nNo alerts generated. Build general parlays based on the matchup.'

  const findingsSection = findings.length > 0
    ? `## Raw Findings\n\n${JSON.stringify(findings.slice(0, 5), null, 2)}`
    : ''

  const anchorSection = anchor ? `\n## Line Focus\n\n${anchor}` : ''
  const signalsSection = signals && signals.length > 0 ? `\n## Betting Angles\n\n${signals.join(', ')}` : ''
  const biasSection = script_bias && script_bias.length > 0 ? `\n## Script Bias\n\n${script_bias.join(', ')}` : ''

  return `You are a sports betting analyst generating narrative-driven parlay scripts.

## Matchup

${matchup}
${anchorSection}${signalsSection}${biasSection}

${alertsSection}

${findingsSection}

## Your Task

Generate 3 narrative-driven parlay scripts for this matchup. Each script should:
1. Tell a coherent story about how the game might unfold
2. Include 3-4 legs that support the narrative
3. Use illustrative American odds (typically -110)
4. Include parlay math showing the payout calculation

## Output Format

Return ONLY valid JSON matching this exact schema:

\`\`\`json
{
  "assumptions": {
    "matchup": "${matchup}",
    "line_focus": "${anchor || ''}",
    "angles": ${JSON.stringify(signals || [])},
    "voice": "analyst"
  },
  "scripts": [
    {
      "title": "Descriptive Title",
      "narrative": "2-3 sentence story explaining the betting thesis",
      "legs": [
        {
          "market": "Game Total",
          "selection": "Under 44.5",
          "american_odds": -110,
          "odds_source": "illustrative"
        },
        {
          "market": "Player Props",
          "selection": "Drake Maye Over 245.5 Passing Yards",
          "american_odds": -110,
          "odds_source": "illustrative"
        },
        {
          "market": "Player Props",
          "selection": "DeMario Douglas Over 5.5 Receptions",
          "american_odds": -110,
          "odds_source": "illustrative"
        }
      ],
      "parlay_math": {
        "stake": 1,
        "leg_decimals": [1.91, 1.91, 1.91],
        "product_decimal": 6.97,
        "payout": 6.97,
        "profit": 5.97,
        "steps": "1.91 × 1.91 × 1.91 = 6.97"
      },
      "notes": [
        "No guarantees; high variance by design.",
        "Odds are illustrative."
      ],
      "offer_opposite": "Want the other side of this story?"
    }
  ]
}
\`\`\`

## Rules

1. Output ONLY valid JSON - no markdown, no explanation
2. Generate exactly 3 scripts
3. Each script must have 3-4 legs
4. All odds_source should be "illustrative" unless user provided specific odds
5. Parlay math must be accurate (decimal odds, product, payout, profit)
6. Narratives should be specific to this matchup, not generic
7. Use the alerts and findings to inform your scripts
8. Always include the two standard notes about guarantees and odds

Respond with ONLY the JSON object, no surrounding text.`
}

/**
 * Build swantail view using direct LLM call (default)
 */
async function buildSwantailViewDirect(
  matchup: string,
  alerts: Alert[],
  findings: Finding[],
  anchor?: string,
  signals?: string[],
  script_bias?: string[]
): Promise<BuildView> {
  const client = getOpenAIClient()

  const prompt = buildStoryModePrompt(matchup, alerts, findings, anchor, signals, script_bias)

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.7,
    max_tokens: 3000,
    messages: [
      {
        role: 'system',
        content: 'You are a sports betting analyst. Output only valid JSON matching the SwantailResponse schema. No markdown, no explanation.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('LLM returned empty response')
  }

  // Parse and validate response
  let parsed: unknown
  try {
    // Strip markdown code blocks if present
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    parsed = JSON.parse(cleaned)
  } catch (e) {
    throw new Error(`Failed to parse LLM output as JSON: ${(e as Error).message}`)
  }

  const validated = SwantailResponseSchema.safeParse(parsed)
  if (!validated.success) {
    console.error('[Build] SwantailResponse validation failed:', validated.error.flatten())
    throw new Error('LLM output does not match SwantailResponse schema')
  }

  return {
    kind: 'swantail',
    data: validated.data,
  }
}

/**
 * Build swantail view using wrapper (fallback only)
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

    const { matchup, alerts, findings, output_type, anchor, anchors, signals, signals_raw, odds_paste, script_bias, selected_agents, payload_hash, options } = parsed.data

    // Validate payload_hash if provided (staleness check)
    // Use signals_raw for hash validation (matches client-side hash computation)
    if (payload_hash) {
      const expectedHash = computeBuildPayloadHash({
        matchup,
        selected_agents,
        anchors,
        script_bias,
        signals: signals_raw || signals, // Prefer raw signals for hash, fallback to normalized
        odds_paste,
      })

      if (payload_hash !== expectedHash) {
        console.warn('[Build] Stale build attempt:', {
          provided: payload_hash,
          expected: expectedHash,
          payload_debug: {
            matchup,
            selected_agents,
            anchors,
            script_bias,
            signals,
            odds_paste,
          },
        })
        return Response.json(
          {
            error: 'Stale build',
            message: 'The scan inputs have changed since the last scan. Please run Scan again.',
            stale: true,
            provided_hash: payload_hash,
            expected_hash: expectedHash,
            request_id: requestId,
          },
          { status: 409 }
        )
      }
    }

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
      // Use direct LLM call by default; wrapper as fallback only
      const useWrapper = process.env.USE_WRAPPER_FALLBACK === 'true'

      if (useWrapper) {
        console.log('[Build] Using wrapper fallback for story mode')
        view = await buildSwantailView(matchup, anchor, signals, odds_paste)
      } else {
        console.log('[Build] Using direct LLM for story mode')
        view = await buildSwantailViewDirect(matchup, alerts, findings, anchor, signals, script_bias)
      }
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
