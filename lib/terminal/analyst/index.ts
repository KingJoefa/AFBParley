import type {
  Finding,
  Alert,
  AgentType,
  LLMOutput,
  LLMFindingOutput,
  ClaimParts,
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

/**
 * Build the prompt for the LLM analyst
 */
export function buildAnalystPrompt(
  findings: Finding[],
  skillMds: Partial<Record<AgentType, string>>
): string {
  const skillSections = Object.entries(skillMds)
    .map(([agent, content]) => `## ${agent.toUpperCase()} Agent Skill\n\n${content}`)
    .join('\n\n---\n\n')

  const findingsJson = JSON.stringify(findings, null, 2)

  return `You are a sports betting analyst terminal. Your job is to transform raw statistical findings into actionable alerts.

## Your Skills

${skillSections}

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
    output[findingId] = {
      severity: severity as 'high' | 'medium',
      claim_parts: claimParts,
      implications: implications.filter(imp => {
        const v = validateImplicationsForAgent(finding.agent, [imp])
        return v.valid
      }),
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

/**
 * Placeholder for actual LLM call
 * This will be implemented with OpenAI SDK
 */
export async function callLLM(
  prompt: string,
  options: LLMCallOptions = {}
): Promise<string> {
  // TODO: Implement actual LLM call with OpenAI SDK
  // For now, throw an error indicating not implemented
  throw new Error('LLM integration not yet implemented. Use fallback mode.')
}

/**
 * Full analyst pipeline: Finding[] → Alert[]
 */
export async function analyzeFindings(
  findings: Finding[],
  dataVersion: string,
  options: LLMCallOptions = {}
): Promise<{
  alerts: Alert[]
  llmOutput: LLMOutput
  errors: string[]
  skillMds: Partial<Record<AgentType, string>>
  prompt: string
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

  // Build prompt
  const prompt = buildAnalystPrompt(findings, skillMds)

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
    // LLM call failed - return empty with error
    return {
      alerts: [],
      llmOutput: {},
      errors: [(error as Error).message],
      skillMds,
      prompt,
    }
  }
}
