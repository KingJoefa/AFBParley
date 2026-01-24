import type {
  Finding,
  Alert,
  AgentType,
  LLMOutput,
  LLMFindingOutput,
  ClaimParts,
  AnyImplication,
} from '../schemas'
import {
  assembleAlerts,
  buildCodeDerivedFields,
} from '../schemas/alert'
import { validateImplicationsForAgent } from '../schemas/implications'
import { renderClaim } from '../schemas/claim'
import { calculateFindingConfidence } from '../engine/confidence'
import { readFileSync } from 'fs'
import { join } from 'path'
import OpenAI from 'openai'

/**
 * LLM Analyst
 *
 * Transforms Finding[] → Alert[] using an LLM.
 * The LLM output is constrained to a keyed map by finding_id,
 * and code-derived fields (id, agent, confidence, evidence) are preserved.
 */

// Skill MD paths
const SKILL_MD_DIR = join(process.cwd(), 'lib/terminal/agents')

/**
 * Load skill.md for an agent
 */
export function loadSkillMd(agent: AgentType): string {
  try {
    const path = join(SKILL_MD_DIR, agent, 'skill.md')
    return readFileSync(path, 'utf-8')
  } catch {
    return `# ${agent.toUpperCase()} Agent\n\nNo skill file available.`
  }
}

/**
 * Load all relevant skill.md files for findings
 */
export function loadRelevantSkillMds(
  findings: Finding[]
): Partial<Record<AgentType, string>> {
  const agents = new Set(findings.map(f => f.agent))
  const skillMds: Partial<Record<AgentType, string>> = {}

  for (const agent of agents) {
    skillMds[agent] = loadSkillMd(agent)
  }

  return skillMds
}

export interface TPRRMatchup {
  player: string
  team?: string
  tprr: number
  coverage: string
  vs_overall_delta?: number
  opp_rate?: number
  routes_10wk?: number
  routes_last?: number
  note?: string
}

export interface Analytics {
  source?: string
  model_spread?: { team: string; line: number; adjusted?: number; note?: string }
  model_scores?: Record<string, number>
  pressure?: Record<string, unknown>
  qb_grades?: Record<string, Record<string, unknown>>
  tprr_matchups?: TPRRMatchup[]
  insights?: string[]
}

export interface SGP {
  name?: string
  legs: string[]
  odds: string | null
  confidence: string
  rationale?: string
}

export interface GameNotesContext {
  notes?: string
  injuries?: Record<string, string[]>
  keyMatchups?: string[]
  totals?: { home: number; away: number }
  spread?: { favorite: string; line: number }
  analytics?: Analytics
  sgps?: SGP[]
}

/**
 * Build the prompt for the LLM analyst
 */
export function buildAnalystPrompt(
  findings: Finding[],
  skillMds: Partial<Record<AgentType, string>>,
  gameNotes?: GameNotesContext
): string {
  const skillSections = Object.entries(skillMds)
    .map(([agent, content]) => `## ${agent.toUpperCase()} Agent Skill\n\n${content}`)
    .join('\n\n---\n\n')

  const findingsJson = JSON.stringify(findings, null, 2)

  // Build game notes section if available
  let gameNotesSection = ''
  if (gameNotes?.notes || gameNotes?.injuries || gameNotes?.keyMatchups || gameNotes?.analytics) {
    const parts: string[] = []

    if (gameNotes.totals || gameNotes.spread) {
      const lines: string[] = []
      if (gameNotes.totals) lines.push(`Team Totals: Home ${gameNotes.totals.home}, Away ${gameNotes.totals.away}`)
      if (gameNotes.spread) lines.push(`Spread: ${gameNotes.spread.favorite} ${gameNotes.spread.line}`)
      parts.push(lines.join(' | '))
    }

    if (gameNotes.notes) {
      parts.push(`Scout Report: ${gameNotes.notes}`)
    }

    if (gameNotes.injuries) {
      const injuryLines = Object.entries(gameNotes.injuries)
        .map(([team, list]) => `${team}: ${list.join(', ')}`)
        .join('\n')
      parts.push(`Injuries:\n${injuryLines}`)
    }

    if (gameNotes.keyMatchups?.length) {
      parts.push(`Key Matchups:\n- ${gameNotes.keyMatchups.join('\n- ')}`)
    }

    // Build analytics section if available
    if (gameNotes.analytics) {
      const analyticsParts: string[] = []
      const analytics = gameNotes.analytics

      if (analytics.source) {
        analyticsParts.push(`Source: ${analytics.source}`)
      }

      if (analytics.model_spread) {
        const ms = analytics.model_spread
        let spreadLine = `Model Spread: ${ms.team} ${ms.line}`
        if (ms.adjusted) spreadLine += ` (Adjusted: ${ms.adjusted})`
        if (ms.note) spreadLine += ` - ${ms.note}`
        analyticsParts.push(spreadLine)
      }

      if (analytics.model_scores) {
        const scores = Object.entries(analytics.model_scores)
          .map(([team, score]) => `${team}: ${score}`)
          .join(', ')
        analyticsParts.push(`Predicted Scores: ${scores}`)
      }

      if (analytics.qb_grades) {
        const qbLines = Object.entries(analytics.qb_grades)
          .map(([qb, grades]) => {
            const gradeStr = Object.entries(grades)
              .filter(([k]) => k.endsWith('_pctl'))
              .map(([k, v]) => `${k.replace('_pctl', '')}: ${v}th`)
              .join(', ')
            const note = (grades as Record<string, unknown>).note as string | undefined
            return `${qb}: ${gradeStr}${note ? ` (${note})` : ''}`
          })
          .join('\n')
        analyticsParts.push(`QB Grades (Percentile):\n${qbLines}`)
      }

      if (analytics.tprr_matchups?.length) {
        const tprrLines = analytics.tprr_matchups
          .map(m => {
            let line = `${m.player} (${m.team || '?'}): ${(m.tprr * 100).toFixed(0)}% TPRR vs ${m.coverage}`
            if (m.opp_rate) line += `, opp plays ${m.coverage} ${(m.opp_rate * 100).toFixed(0)}%`
            if (m.vs_overall_delta) line += ` (+${m.vs_overall_delta} vs baseline)`
            if (m.note) line += ` [${m.note}]`
            return line
          })
          .join('\n')
        analyticsParts.push(`TPRR Matchups:\n${tprrLines}`)
      }

      if (analytics.insights?.length) {
        analyticsParts.push(`Insights:\n- ${analytics.insights.join('\n- ')}`)
      }

      if (analyticsParts.length > 0) {
        parts.push(`\n### Analytics\n${analyticsParts.join('\n\n')}`)
      }
    }

    // Build SGP suggestions if available
    if (gameNotes.sgps?.length) {
      const sgpLines = gameNotes.sgps
        .map(sgp => {
          let line = sgp.name ? `**${sgp.name}**: ` : ''
          line += sgp.legs.join(' + ')
          if (sgp.odds) line += ` → ${sgp.odds}`
          line += ` [${sgp.confidence}]`
          if (sgp.rationale) line += `\n  Rationale: ${sgp.rationale}`
          return line
        })
        .join('\n\n')
      parts.push(`\n### Suggested SGPs\n${sgpLines}`)
    }

    gameNotesSection = `
---

## Game Notes (Scout Report)

${parts.join('\n\n')}
`
  }

  return `You are a sports betting analyst terminal. Your job is to transform raw statistical findings into actionable alerts.

## Your Skills

${skillSections}
${gameNotesSection}
---

## Findings to Analyze

${findingsJson}

---

## Output Format

For EACH finding, provide a JSON object keyed by the finding's \`id\`. Each entry must follow this exact schema:

\`\`\`json
{
  "finding_id_here": {
    "severity": "high" | "medium",
    "claim_parts": {
      "metrics": ["receiving_epa", "target_share"],
      "direction": "positive" | "negative" | "neutral",
      "comparator": "ranks" | "exceeds" | "trails" | "matches" | "diverges_from",
      "rank_or_percentile": {
        "type": "rank" | "percentile",
        "value": 5,
        "scope": "league" | "position" | "conference" | "division",
        "direction": "top" | "bottom"
      },
      "comparison_target": "league_average" | "opponent_average" | "position_average" | "season_baseline" | "historical_self",
      "context_qualifier": "in_division" | "at_home" | "as_underdog" | "in_primetime" | "vs_top_10_defense" | "with_current_qb"
    },
    "implications": ["wr_yards_over", "te_receptions_over"],
    "suppressions": []
  }
}
\`\`\`

## Valid Metrics
receiving_epa, rushing_epa, pass_block_win_rate, pressure_rate, target_share, snap_count, red_zone_epa, epa_allowed, completion_rate, yards_per_attempt, sack_rate, passer_rating, yards_after_contact, separation, contested_catch_rate, route_participation, red_zone_targets

## Valid Implications by Agent
- EPA: wr_receptions_over/under, wr_yards_over/under, rb_yards_over/under, te_receptions_over, te_yards_over, team_total_over/under
- PRESSURE: qb_sacks_over/under, qb_ints_over, qb_pass_yards_under, def_sacks_over
- WEATHER: game_total_under, pass_yards_under, field_goals_over
- QB: qb_pass_yards_over/under, qb_pass_tds_over/under, qb_completions_over/under, qb_ints_over
- HB: rb_rush_yards_over/under, rb_receptions_over, rb_rush_attempts_over, rb_tds_over
- WR: wr_receptions_over/under, wr_yards_over/under, wr_tds_over, wr_longest_reception_over
- TE: te_receptions_over/under, te_yards_over/under, te_tds_over
- NOTES: any implication from the lists above

## Rules

1. Use ONLY implications from each agent's valid list above
2. severity: "high" for elite mismatch (top 5 vs bottom 5), "medium" for solid edge (top 10 vs bottom 10)
3. metrics array must contain at least one valid metric
4. rank_or_percentile is optional but useful for context
5. comparison_target is optional
6. context_qualifier is optional
7. Do NOT hallucinate statistics - use only what's in the finding
8. Output valid JSON only - no markdown, no explanation

Respond with ONLY the JSON object, no surrounding text.`
}

/**
 * Validate edge language in claim
 */
function validateEdgeLanguage(claim: string): { valid: boolean; violations: string[] } {
  const EDGE_PATTERNS = [
    /\bedge\b/i,
    /\bvalue\b/i,
    /\bmispriced\b/i,
    /\bexploit\b/i,
    /\bsharp\b/i,
    /\block\b/i,
  ]
  const violations = EDGE_PATTERNS.filter(p => p.test(claim)).map(p => p.toString())
  return { valid: violations.length === 0, violations }
}

/**
 * Parse LLM output and validate against schemas
 */
export function parseLLMOutput(
  raw: string,
  findings: Finding[]
): { output: LLMOutput; errors: string[] } {
  const errors: string[] = []

  // Parse JSON
  let parsed: Record<string, unknown>
  try {
    // Strip markdown code blocks if present
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    parsed = JSON.parse(cleaned)
  } catch (e) {
    return {
      output: {},
      errors: [`Failed to parse LLM output as JSON: ${(e as Error).message}`],
    }
  }

  const output: LLMOutput = {}
  const findingIds = new Set(findings.map(f => f.id))

  for (const [findingId, value] of Object.entries(parsed)) {
    // Validate finding_id exists
    if (!findingIds.has(findingId)) {
      errors.push(`Unknown finding_id: ${findingId}`)
      continue
    }

    const finding = findings.find(f => f.id === findingId)!
    const entry = value as Record<string, unknown>

    // Validate severity
    const severity = entry.severity as string
    if (!['high', 'medium'].includes(severity)) {
      errors.push(`Invalid severity for ${findingId}: ${severity}`)
      continue
    }

    // Validate claim_parts
    const claimParts = entry.claim_parts as ClaimParts | undefined
    if (!claimParts || !claimParts.metrics || !Array.isArray(claimParts.metrics) || claimParts.metrics.length === 0) {
      errors.push(`Missing or invalid claim_parts for ${findingId}`)
      continue
    }

    // Validate implications against agent allowlist
    const implications = (entry.implications as string[]) || []
    const implValidation = validateImplicationsForAgent(finding.agent, implications)
    if (!implValidation.valid) {
      errors.push(`Invalid implications for ${findingId}: ${implValidation.invalid.join(', ')}`)
    }

    // Validate edge language in rendered claim
    const renderedClaim = renderClaim(claimParts)
    const edgeValidation = validateEdgeLanguage(renderedClaim)
    if (!edgeValidation.valid) {
      errors.push(
        `Edge language detected in ${findingId}: ${edgeValidation.violations.join(', ')}`
      )
    }

    // Build output entry with validated implications only
    const validatedImplications = implications.filter(imp => {
      const v = validateImplicationsForAgent(finding.agent, [imp])
      return v.valid
    }) as AnyImplication[]

    output[findingId] = {
      severity: severity as 'high' | 'medium',
      claim_parts: claimParts,
      implications: validatedImplications,
      suppressions: (entry.suppressions as string[]) || [],
    }
  }

  return { output, errors }
}

/**
 * Interface for LLM call
 */
export interface LLMCallOptions {
  model?: string
  temperature?: number
  maxTokens?: number
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
 * Call LLM using OpenAI SDK
 */
export async function callLLM(
  prompt: string,
  options: LLMCallOptions = {}
): Promise<string> {
  const client = getOpenAIClient()
  const model = options.model ?? 'gpt-4o-mini'
  const temperature = options.temperature ?? 0.2
  const maxTokens = options.maxTokens ?? 2000

  const response = await client.chat.completions.create({
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'system',
        content: 'You are a sports betting analyst. Output only valid JSON. No markdown, no explanation.',
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

  return content
}

/**
 * Map agent type to default implications for fallback
 */
const DEFAULT_IMPLICATIONS: Record<AgentType, AnyImplication[]> = {
  epa: ['team_total_over'],
  pressure: ['qb_sacks_over'],
  weather: ['game_total_under'],
  qb: ['qb_pass_yards_over'],
  hb: ['rb_rush_yards_over'],
  wr: ['wr_yards_over'],
  te: ['te_receptions_over'],
  notes: ['team_total_over'],
}

/**
 * Map agent type to default metric for fallback claims
 */
const DEFAULT_METRICS: Record<AgentType, string> = {
  epa: 'receiving_epa',
  pressure: 'pressure_rate',
  weather: 'snap_count',
  qb: 'yards_per_attempt',
  hb: 'yards_after_contact',
  wr: 'target_share',
  te: 'target_share',
  notes: 'snap_count',
}

/**
 * Generate minimal Alert[] from Finding[] when LLM fails
 * Ensures terminal always gets Alert[] contract, never raw findings
 */
export function generateFallbackAlerts(
  findings: Finding[],
  dataVersion: string
): Alert[] {
  return findings.map(f => {
    const confidence = calculateFindingConfidence(f)
    const codeDerived = buildCodeDerivedFields(f, confidence, dataVersion)

    // Build minimal claim from finding data
    const metric = DEFAULT_METRICS[f.agent] || 'snap_count'
    const claim = `${f.stat}: ${f.value_num ?? f.value_str} (${f.comparison_context})`

    return {
      ...codeDerived,
      severity: confidence >= 0.7 ? 'high' : 'medium',
      claim,
      implications: DEFAULT_IMPLICATIONS[f.agent] || [],
      suppressions: [],
    } as Alert
  })
}

/**
 * Full analyst pipeline: Finding[] → Alert[]
 */
export async function analyzeFindings(
  findings: Finding[],
  dataVersion: string,
  options: LLMCallOptions = {},
  gameNotes?: GameNotesContext
): Promise<{
  alerts: Alert[]
  llmOutput: LLMOutput
  errors: string[]
  skillMds: Partial<Record<AgentType, string>>
  prompt: string
  fallback?: boolean
}> {
  if (findings.length === 0) {
    return {
      alerts: [],
      llmOutput: {},
      errors: [],
      skillMds: {},
      prompt: '',
    }
  }

  // Load skill MDs
  const skillMds = loadRelevantSkillMds(findings)

  // Build prompt (with game notes if available)
  const prompt = buildAnalystPrompt(findings, skillMds, gameNotes)

  try {
    // Call LLM
    const raw = await callLLM(prompt, options)

    // Parse and validate output
    const { output, errors } = parseLLMOutput(raw, findings)

    // Calculate confidences
    const confidences = new Map<string, number>()
    for (const finding of findings) {
      confidences.set(finding.id, calculateFindingConfidence(finding))
    }

    // Filter to only non-suppressed findings
    const filteredOutput: LLMOutput = {}
    for (const [id, entry] of Object.entries(output)) {
      if (entry.suppressions.length === 0) {
        filteredOutput[id] = entry
      }
    }

    // Filter findings to match
    const filteredFindings = findings.filter(f => filteredOutput[f.id])

    // Assemble alerts using schema function
    const alerts = assembleAlerts(filteredFindings, filteredOutput, confidences, dataVersion)

    return {
      alerts,
      llmOutput: output,
      errors,
      skillMds,
      prompt,
    }
  } catch (error) {
    // LLM call failed - use fallback to produce minimal Alert[]
    const fallbackAlerts = generateFallbackAlerts(findings, dataVersion)
    return {
      alerts: fallbackAlerts,
      llmOutput: {},
      errors: [(error as Error).message],
      skillMds,
      prompt,
      fallback: true,
    }
  }
}
