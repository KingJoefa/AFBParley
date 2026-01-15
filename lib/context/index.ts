/**
 * Context Module
 * Main entry point for building GPT context with game data.
 */

// Types
export * from './types'

// Builders
export { buildContext, buildContextWithInstruction, parseContextString, getContextSummary, estimateTokens } from './builder'
export { fetchLinesContext, fetchLinesContextCached, buildLinesContext, clearLinesCache } from './lines'
export { fetchInjuriesContext, createUnavailableInjuriesContext } from './injuries'
export { fetchWeatherContext, createWeatherContext, isIndoorGame } from './weather'
export { fetchTeamStatsContext, fetchTeamStatsContextBatch, createTeamStatsContext } from './team'
export { fetchProjectionsContext, createProjectionsContext } from './projections'
export { createBYOAContext, sanitizeBYOA, validateBYOA, estimateBYOATokens } from './byoa'

import { ContextBlock, BuiltContext } from './types'
import { buildContext, buildContextWithInstruction } from './builder'
import { fetchLinesContextCached } from './lines'
import { fetchInjuriesContext } from './injuries'
import { fetchWeatherContext } from './weather'
import { fetchTeamStatsContextBatch } from './team'
import { fetchProjectionsContext } from './projections'
import { createBYOAContext } from './byoa'
import { teamNameToCode } from '@/lib/nfl/teams'

/**
 * Parse team codes from a matchup string
 * e.g., "Buffalo Bills @ Denver Broncos" -> ["BUF", "DEN"]
 */
export function parseMatchupTeams(matchup: string): { away: string | null; home: string | null } {
  const parts = matchup.split('@').map(s => s.trim())
  if (parts.length !== 2) {
    return { away: null, home: null }
  }

  const [awayRaw, homeRaw] = parts

  const away = teamNameToCode[awayRaw] ||
    Object.entries(teamNameToCode).find(([name]) => awayRaw?.includes(name))?.[1] ||
    null

  const home = teamNameToCode[homeRaw] ||
    Object.entries(teamNameToCode).find(([name]) => homeRaw?.includes(name))?.[1] ||
    null

  return { away, home }
}

/**
 * Build complete game context for a matchup
 * Fetches all available data and assembles with token budget
 */
export async function buildGameContext(params: {
  year: number
  week: number
  matchup: string
  byoaData?: string // Optional user-provided data
  tokenBudget?: number
}): Promise<BuiltContext & { instruction: string }> {
  const { year, week, matchup, byoaData, tokenBudget } = params
  const blocks: ContextBlock[] = []

  // Parse team codes from matchup
  const { away, home } = parseMatchupTeams(matchup)
  const teamCodes = [away, home].filter((t): t is string => t !== null)

  // Fetch all context in parallel
  const [linesCtx, injuriesCtx, weatherCtx, teamStatsCtx, projectionsCtx] = await Promise.all([
    fetchLinesContextCached({ year, week, matchup }),
    teamCodes.length > 0 ? fetchInjuriesContext({ week, teamCodes }) : null,
    home ? fetchWeatherContext({ week, matchup, homeTeamCode: home }) : null,
    teamCodes.length > 0 ? fetchTeamStatsContextBatch({ year, week, teamCodes }) : [],
    teamCodes.length > 0 ? fetchProjectionsContext({ year, week, teamCodes }) : null,
  ])

  // Add lines (always)
  blocks.push(linesCtx)

  // Add injuries if available
  if (injuriesCtx && injuriesCtx.data.length > 0) {
    blocks.push(injuriesCtx)
  }

  // Add weather if available (outdoor games only)
  if (weatherCtx) {
    blocks.push(weatherCtx)
  }

  // Add team stats
  for (const teamCtx of teamStatsCtx) {
    blocks.push(teamCtx)
  }

  // Add projections
  if (projectionsCtx) {
    blocks.push(projectionsCtx)
  }

  // Add BYOA if provided
  if (byoaData) {
    const byoaCtx = createBYOAContext(byoaData)
    if (byoaCtx) {
      blocks.push(byoaCtx)
    }
  }

  return buildContextWithInstruction(blocks, tokenBudget)
}
