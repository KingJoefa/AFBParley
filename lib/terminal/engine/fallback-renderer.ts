import type { Finding, AgentType } from '../schemas'

/**
 * Fallback Renderer
 *
 * When the LLM analyst call fails, render findings directly
 * so the terminal never hard-stalls.
 */

export interface FallbackLine {
  agent: AgentType
  line: string
  source: string
  severity: 'raw'
}

/**
 * Render findings without LLM processing
 */
export function renderFindingsFallback(findings: Finding[]): FallbackLine[] {
  return findings.map(f => ({
    agent: f.agent,
    line: `${f.stat}: ${f.value_num ?? f.value_str} (${f.comparison_context})`,
    source: f.source_ref,
    severity: 'raw' as const,
  }))
}

/**
 * Format fallback output for terminal display
 */
export function formatFallbackForTerminal(lines: FallbackLine[]): string {
  const header = '\u26A0\uFE0F  Analyst offline. Raw findings:\n'

  const body = lines
    .map(
      l =>
        `   [${l.agent}] ${l.line}\n         \u2192 ${l.source}`
    )
    .join('\n\n')

  const footer = '\n\n   Type "retry" or "build --raw" to continue with raw findings.'

  return header + '\n' + body + footer
}

/**
 * Agent display names
 */
const AGENT_DISPLAY: Record<AgentType, string> = {
  epa: 'EPA Agent',
  pressure: 'Pressure Agent',
  weather: 'Weather Agent',
  qb: 'QB Agent',
  hb: 'HB Agent',
  wr: 'WR Agent',
  te: 'TE Agent',
  notes: 'Notes Agent',
  // New agents (2026-01-25)
  injury: 'Injury Agent',
  usage: 'Usage Agent',
  pace: 'Pace Agent',
}

/**
 * Format raw findings for JSON API response
 */
export function formatFallbackForApi(findings: Finding[]): {
  mode: 'fallback'
  message: string
  raw_findings: Array<{
    id: string
    agent: string
    agent_display: string
    stat: string
    value: number | string | undefined
    context: string
    source: string
  }>
} {
  return {
    mode: 'fallback',
    message: 'LLM analyst unavailable. Returning raw findings.',
    raw_findings: findings.map(f => ({
      id: f.id,
      agent: f.agent,
      agent_display: AGENT_DISPLAY[f.agent],
      stat: f.stat,
      value: f.value_num ?? f.value_str,
      context: f.comparison_context,
      source: f.source_ref,
    })),
  }
}

/**
 * Determine if we should use fallback mode
 */
export function shouldUseFallback(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    // Use fallback for LLM-related errors
    if (
      msg.includes('timeout') ||
      msg.includes('rate limit') ||
      msg.includes('context length') ||
      msg.includes('api error') ||
      msg.includes('network') ||
      msg.includes('503') ||
      msg.includes('502') ||
      msg.includes('500')
    ) {
      return true
    }
  }
  return false
}
