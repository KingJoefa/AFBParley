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
import {
  extractPlayers,
  validatePlayers,
  buildRetryPrompt,
} from '@/lib/terminal/engine/roster-validator'
import {
  buildPropsRoster,
  formatPropsRosterForPrompt,
  type RosterOverrides,
  type PropsRosterResult,
} from '@/lib/terminal/engine/props-roster'

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

const RosterOverridesSchema = z.object({
  add: z.array(z.string()).optional().describe('Players to add (e.g., props not posted yet)'),
  remove: z.array(z.string()).optional().describe('Players to remove (e.g., late scratches)'),
}).optional()

const BuildRequestSchema = z.object({
  matchup: z.string().min(3).describe('e.g., "49ers @ Seahawks" or "SF @ SEA"'),
  alerts: z.array(z.any()).min(0), // Inline Alert[] from Phase 1
  findings: z.array(z.any()).min(0), // Inline Finding[] from Phase 1
  output_type: z.enum(['prop', 'story', 'parlay']),
  payload_hash: z.string().optional().describe('Hash from client - validated server-side for staleness'),
  selected_agents: z.array(z.string()).optional().describe('Agent IDs that were selected'),
  roster_overrides: RosterOverridesSchema.describe('Manual roster add/remove overrides'),
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
 * NOTE: roster_overrides are included server-side for Build validation
 */
function computeBuildPayloadHash(params: {
  matchup: string
  selected_agents?: string[]
  anchors?: string[]
  script_bias?: string[]
  signals?: string[]
  odds_paste?: string
  roster_overrides?: RosterOverrides
}): string {
  const { matchup, selected_agents, anchors, script_bias, signals, odds_paste, roster_overrides } = params

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

  // Normalize roster overrides - only include if non-empty to match client hash
  const hasOverrides = roster_overrides &&
    ((roster_overrides.add && roster_overrides.add.length > 0) ||
     (roster_overrides.remove && roster_overrides.remove.length > 0))

  const overridesSuffix = hasOverrides
    ? `|overrides:add:${(roster_overrides!.add || []).slice().sort().join(',')};rm:${(roster_overrides!.remove || []).slice().sort().join(',')}`
    : ''

  // Build payload string - matches client format, only adds overrides suffix if present
  const payload = `${matchup}|anchors:${anchorKey}|bias:${biasKey}|${signalsKey}|${odds_paste || ''}|agents:${agentKey}${overridesSuffix}`

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
  script_bias?: string[],
  rosterBlock?: string,
  retryInstruction?: string
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
  const rosterSection = rosterBlock ? `\n${rosterBlock}\n` : ''
  const retrySection = retryInstruction ? `\n## IMPORTANT RETRY INSTRUCTION\n\n${retryInstruction}\n` : ''

  return `You are a sports betting analyst generating narrative-driven parlay scripts.
${retrySection}
## Matchup

${matchup}
${anchorSection}${signalsSection}${biasSection}
${rosterSection}
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
${rosterBlock ? '9. ONLY use player names from the Allowed Players list. Do NOT invent player names.' : ''}

Respond with ONLY the JSON object, no surrounding text.`
}

/**
 * Call LLM and parse response
 */
async function callLLM(
  client: OpenAI,
  prompt: string
): Promise<SwantailResponse> {
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

  return validated.data
}

/**
 * Parse matchup string to extract team codes
 * e.g., "Texans @ Patriots" → { home: "NE", away: "HOU" }
 */
function parseMatchupTeams(matchup: string): { home: string; away: string } | null {
  // Common patterns: "Team1 @ Team2", "Team1 vs Team2", "Team1 at Team2"
  const match = matchup.match(/^(.+?)\s*[@vs]+\s*(.+)$/i)
  if (!match) return null

  const away = match[1].trim()
  const home = match[2].trim()

  // Map team names to codes (simplified)
  const teamCodes: Record<string, string> = {
    'patriots': 'NE', 'new england': 'NE', 'ne': 'NE',
    'texans': 'HOU', 'houston': 'HOU', 'hou': 'HOU',
    'broncos': 'DEN', 'denver': 'DEN', 'den': 'DEN',
    'bills': 'BUF', 'buffalo': 'BUF', 'buf': 'BUF',
    '49ers': 'SF', 'niners': 'SF', 'san francisco': 'SF', 'sf': 'SF',
    'seahawks': 'SEA', 'seattle': 'SEA', 'sea': 'SEA',
    'rams': 'LA', 'los angeles rams': 'LA', 'la': 'LA', 'lar': 'LA',
    'bears': 'CHI', 'chicago': 'CHI', 'chi': 'CHI',
    'chiefs': 'KC', 'kansas city': 'KC', 'kc': 'KC',
    'raiders': 'LV', 'las vegas': 'LV', 'lv': 'LV',
    'chargers': 'LAC', 'los angeles chargers': 'LAC', 'lac': 'LAC',
    'cowboys': 'DAL', 'dallas': 'DAL', 'dal': 'DAL',
    'eagles': 'PHI', 'philadelphia': 'PHI', 'phi': 'PHI',
    'giants': 'NYG', 'new york giants': 'NYG', 'nyg': 'NYG',
    'commanders': 'WAS', 'washington': 'WAS', 'was': 'WAS',
    'lions': 'DET', 'detroit': 'DET', 'det': 'DET',
    'packers': 'GB', 'green bay': 'GB', 'gb': 'GB',
    'vikings': 'MIN', 'minnesota': 'MIN', 'min': 'MIN',
    'falcons': 'ATL', 'atlanta': 'ATL', 'atl': 'ATL',
    'panthers': 'CAR', 'carolina': 'CAR', 'car': 'CAR',
    'saints': 'NO', 'new orleans': 'NO', 'no': 'NO',
    'buccaneers': 'TB', 'bucs': 'TB', 'tampa bay': 'TB', 'tb': 'TB',
    'ravens': 'BAL', 'baltimore': 'BAL', 'bal': 'BAL',
    'bengals': 'CIN', 'cincinnati': 'CIN', 'cin': 'CIN',
    'browns': 'CLE', 'cleveland': 'CLE', 'cle': 'CLE',
    'steelers': 'PIT', 'pittsburgh': 'PIT', 'pit': 'PIT',
    'colts': 'IND', 'indianapolis': 'IND', 'ind': 'IND',
    'jaguars': 'JAX', 'jacksonville': 'JAX', 'jax': 'JAX',
    'titans': 'TEN', 'tennessee': 'TEN', 'ten': 'TEN',
    'dolphins': 'MIA', 'miami': 'MIA', 'mia': 'MIA',
    'jets': 'NYJ', 'new york jets': 'NYJ', 'nyj': 'NYJ',
    'cardinals': 'ARI', 'arizona': 'ARI', 'ari': 'ARI',
  }

  const normalizeTeam = (t: string): string => {
    const lower = t.toLowerCase()
    return teamCodes[lower] || t.toUpperCase().slice(0, 3)
  }

  return {
    home: normalizeTeam(home),
    away: normalizeTeam(away),
  }
}

interface BuildSwantailResult {
  view: BuildView
  roster_info: {
    allowed_roster_source: 'xo_props' | 'fallback_projections' | 'none'
    allowed_players: string[]
    player_props_enabled: boolean
    debug?: PropsRosterResult['debug']
  }
  validation?: {
    players_checked: number
    invalid_players?: string[]
    regenerated?: boolean
    fallback_to_game_level?: boolean
  }
}

/**
 * Build swantail view using direct LLM call (default)
 * With props-based roster and validation/retry logic
 */
async function buildSwantailViewDirect(
  matchup: string,
  alerts: Alert[],
  findings: Finding[],
  requestId: string,
  rosterOverrides?: RosterOverrides,
  anchor?: string,
  signals?: string[],
  script_bias?: string[]
): Promise<BuildSwantailResult> {
  const client = getOpenAIClient()

  // Step 1: Load roster from XO props (with fallback to projections)
  const rosterResult = await buildPropsRoster(matchup, rosterOverrides)
  const teams = parseMatchupTeams(matchup)
  const homeTeam = teams?.home || 'HOME'
  const awayTeam = teams?.away || 'AWAY'

  console.log(`[Build] Roster source: ${rosterResult.source}, players: ${rosterResult.players.length}, props_enabled: ${rosterResult.player_props_enabled}`)

  // Build roster block for prompt
  const rosterBlock = formatPropsRosterForPrompt(rosterResult, homeTeam, awayTeam)

  // Prepare roster info for response
  const rosterInfo: BuildSwantailResult['roster_info'] = {
    allowed_roster_source: rosterResult.source,
    allowed_players: rosterResult.players.map(p => p.name),
    player_props_enabled: rosterResult.player_props_enabled,
    debug: rosterResult.debug,
  }

  // Step 2: Initial LLM call with roster grounding
  const initialPrompt = buildStoryModePrompt(matchup, alerts, findings, anchor, signals, script_bias, rosterBlock)
  let result = await callLLM(client, initialPrompt)

  // Step 3: Validate players if roster available
  if (rosterResult.player_props_enabled && rosterResult.players.length > 0) {
    const extractedPlayers = extractPlayers(result.scripts, rosterResult.aliasSet)
    const validation = validatePlayers(extractedPlayers, {
      home: rosterResult.players.filter(p => p.team === homeTeam),
      away: rosterResult.players.filter(p => p.team === awayTeam),
      all: rosterResult.players,
      aliasSet: rosterResult.aliasSet,
    })

    console.log(`[Build] Player validation: ${validation.matched.length} matched, ${validation.invalid.length} invalid`)

    if (!validation.valid) {
      // Log invalid players for drift tracking
      console.warn('[Build] llm_invalid_player', {
        request_id: requestId,
        matchup,
        roster_source: rosterResult.source,
        invalid_players: validation.invalid,
      })

      // Step 4: Retry with explicit forbidden list
      const retryInstruction = buildRetryPrompt(validation.invalid)
      const retryPrompt = buildStoryModePrompt(
        matchup, alerts, findings, anchor, signals, script_bias,
        rosterBlock, retryInstruction
      )

      try {
        const retryResult = await callLLM(client, retryPrompt)
        const retryExtracted = extractPlayers(retryResult.scripts, rosterResult.aliasSet)
        const retryValidation = validatePlayers(retryExtracted, {
          home: rosterResult.players.filter(p => p.team === homeTeam),
          away: rosterResult.players.filter(p => p.team === awayTeam),
          all: rosterResult.players,
          aliasSet: rosterResult.aliasSet,
        })

        if (retryValidation.valid) {
          console.log('[Build] Retry succeeded, all players valid')
          return {
            view: { kind: 'swantail', data: retryResult },
            roster_info: rosterInfo,
            validation: {
              players_checked: retryExtracted.length,
              invalid_players: validation.invalid,
              regenerated: true,
            },
          }
        } else {
          // Still invalid after retry - log and return with warning
          console.warn('[Build] Retry still has invalid players:', retryValidation.invalid)
          return {
            view: { kind: 'swantail', data: retryResult },
            roster_info: rosterInfo,
            validation: {
              players_checked: retryExtracted.length,
              invalid_players: retryValidation.invalid,
              regenerated: true,
              fallback_to_game_level: false,
            },
          }
        }
      } catch (retryError) {
        console.error('[Build] Retry failed:', (retryError as Error).message)
        return {
          view: { kind: 'swantail', data: result },
          roster_info: rosterInfo,
          validation: {
            players_checked: extractedPlayers.length,
            invalid_players: validation.invalid,
            regenerated: false,
          },
        }
      }
    }

    // Validation passed on first attempt
    return {
      view: { kind: 'swantail', data: result },
      roster_info: rosterInfo,
      validation: {
        players_checked: extractedPlayers.length,
      },
    }
  }

  // No roster or props disabled - return without validation
  return {
    view: { kind: 'swantail', data: result },
    roster_info: rosterInfo,
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

    const { matchup, alerts, findings, output_type, anchor, anchors, signals, signals_raw, odds_paste, script_bias, selected_agents, roster_overrides, payload_hash, options } = parsed.data

    // Validate payload_hash if provided (staleness check)
    // Use signals_raw for hash validation (matches client-side hash computation)
    // Include roster_overrides in hash so toggling overrides invalidates prior builds
    if (payload_hash) {
      const expectedHash = computeBuildPayloadHash({
        matchup,
        selected_agents,
        anchors,
        script_bias,
        signals: signals_raw || signals, // Prefer raw signals for hash, fallback to normalized
        odds_paste,
        roster_overrides,
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
    let rosterInfo: BuildSwantailResult['roster_info'] | undefined
    let rosterValidation: BuildSwantailResult['validation'] | undefined

    if (output_type === 'story') {
      // Story mode: LLM-generated narratives
      // Use direct LLM call by default; wrapper as fallback only
      const useWrapper = process.env.USE_WRAPPER_FALLBACK === 'true'

      if (useWrapper) {
        console.log('[Build] Using wrapper fallback for story mode')
        view = await buildSwantailView(matchup, anchor, signals, odds_paste)
      } else {
        console.log('[Build] Using direct LLM for story mode with props-based roster')
        const result = await buildSwantailViewDirect(
          matchup, alerts, findings, requestId,
          roster_overrides, anchor, signals, script_bias
        )
        view = result.view
        rosterInfo = result.roster_info
        rosterValidation = result.validation
      }
    } else {
      // Prop/Parlay modes: Terminal correlated parlays
      view = await buildTerminalView(alerts, findings, options)
    }

    // Return BuildResult with roster_info for debugging
    return Response.json({
      build_id: `build-${requestId}`,
      request_id: requestId,
      payload_hash: payloadHash,
      output_type,
      view,
      created_at: new Date().toISOString(),
      timing_ms: Date.now() - startTime,
      ...(rosterInfo && { roster_info: rosterInfo }),
      ...(rosterValidation && { roster_validation: rosterValidation }),
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
