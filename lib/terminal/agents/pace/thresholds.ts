/**
 * Pace Agent
 *
 * Combines both teams' pace tendencies to signal over/under mechanisms.
 * Computes projected plays for the matchup using team data or league fallbacks.
 *
 * Source: MatchupContext.teamStats
 * Source Type: matchupContext
 */

import type { AgentType } from '../../schemas'
import type {
  PaceFinding,
  PaceFindingType,
  PacePayload,
  Implication,
} from '../../schemas/finding'
import { PACE_IMPLICATIONS } from '../../schemas/finding'
import type { TeamStats, WeatherData } from '../../engine/agent-runner'
import { getLeagueStats } from './league_constants'
import { createLogger } from '@/lib/logger'

const log = createLogger('PaceAgent')
const AGENT: AgentType = 'pace'

// =============================================================================
// Thresholds
// =============================================================================

export const PACE_THRESHOLDS = {
  // Per-team thresholds (vs league)
  fast_pace_rank: 10,
  slow_pace_rank: 23,
  seconds_delta_significant: 2.5,

  // Projected plays thresholds (matchup level)
  projected_plays_high: 68,
  projected_plays_low: 58,
  projected_plays_delta: 5,

  // Weather impact
  wind_mph_penalty_threshold: 20,
  wind_confidence_penalty: 0.3,
} as const

// =============================================================================
// Types
// =============================================================================

interface PaceContext {
  homeTeam: string
  awayTeam: string
  teamStats: Record<string, TeamStats>
  weather?: WeatherData
  dataTimestamp: number
  dataVersion: string
  seasonYear?: number
}

interface ProjectedPlaysResult {
  plays: number
  data_quality: 'full' | 'partial' | 'fallback'
  home_contrib: number
  away_contrib: number
}

// =============================================================================
// Matchup Blend Computation
// =============================================================================

/**
 * Compute projected plays for the matchup
 * Uses team-specific data when available, falls back to league averages
 */
function computeProjectedPlays(
  home: TeamStats | undefined,
  away: TeamStats | undefined,
  year: number
): ProjectedPlaysResult {
  const league = getLeagueStats(year)
  let data_quality: 'full' | 'partial' | 'fallback' = 'full'

  // Home team contribution
  let homeContrib = home?.plays_per_game
  if (!homeContrib && home?.seconds_per_play) {
    // Rough conversion: ~30 minutes of possession, convert seconds to plays
    homeContrib = (1800 / home.seconds_per_play) // Half of game time per team
    data_quality = 'partial'
  }
  if (!homeContrib) {
    homeContrib = league.avg_plays_per_game
    data_quality = 'fallback'
  }

  // Away team contribution
  let awayContrib = away?.plays_per_game
  if (!awayContrib && away?.seconds_per_play) {
    awayContrib = (1800 / away.seconds_per_play)
    if (data_quality === 'full') data_quality = 'partial'
  }
  if (!awayContrib) {
    awayContrib = league.avg_plays_per_game
    data_quality = 'fallback'
  }

  return {
    plays: (homeContrib + awayContrib) / 2,
    data_quality,
    home_contrib: homeContrib,
    away_contrib: awayContrib,
  }
}

// =============================================================================
// Finding Type Determination
// =============================================================================

/**
 * Determine finding type based on projected plays
 */
function determineMatchupFindingType(
  projectedPlays: number,
  leagueAvg: number
): PaceFindingType | null {
  if (projectedPlays >= PACE_THRESHOLDS.projected_plays_high) {
    return 'pace_over_signal'
  }

  if (projectedPlays <= PACE_THRESHOLDS.projected_plays_low) {
    return 'pace_under_signal'
  }

  // Check for significant delta vs league
  const delta = projectedPlays - leagueAvg
  if (Math.abs(delta) >= PACE_THRESHOLDS.projected_plays_delta) {
    return delta > 0 ? 'pace_over_signal' : 'pace_under_signal'
  }

  return null
}

/**
 * Determine finding type for a single team
 */
function determineTeamFindingType(
  team: TeamStats | undefined,
  leagueAvg: number
): PaceFindingType | null {
  if (!team?.pace_rank && !team?.plays_per_game) return null

  // Check pace rank
  if (team.pace_rank !== undefined) {
    if (team.pace_rank <= PACE_THRESHOLDS.fast_pace_rank) {
      return 'team_plays_above_avg'
    }
    if (team.pace_rank >= PACE_THRESHOLDS.slow_pace_rank) {
      return 'team_plays_below_avg'
    }
  }

  // Check plays per game vs league
  if (team.plays_per_game !== undefined) {
    const delta = team.plays_per_game - leagueAvg
    if (delta >= PACE_THRESHOLDS.projected_plays_delta) {
      return 'team_plays_above_avg'
    }
    if (delta <= -PACE_THRESHOLDS.projected_plays_delta) {
      return 'team_plays_below_avg'
    }
  }

  return null
}

/**
 * Check for pace mismatch (one fast, one slow team)
 */
function checkPaceMismatch(
  home: TeamStats | undefined,
  away: TeamStats | undefined
): boolean {
  if (!home?.pace_rank || !away?.pace_rank) return false

  const homeIsFast = home.pace_rank <= PACE_THRESHOLDS.fast_pace_rank
  const homeIsSlow = home.pace_rank >= PACE_THRESHOLDS.slow_pace_rank
  const awayIsFast = away.pace_rank <= PACE_THRESHOLDS.fast_pace_rank
  const awayIsSlow = away.pace_rank >= PACE_THRESHOLDS.slow_pace_rank

  return (homeIsFast && awayIsSlow) || (homeIsSlow && awayIsFast)
}

// =============================================================================
// Weather Modifier
// =============================================================================

/**
 * Apply weather modifier to confidence
 * Wind > 20 mph: downgrade confidence, suppress totals implications
 */
function applyWeatherModifier(
  confidence: number,
  weather: WeatherData | undefined,
  implications: Implication[]
): { confidence: number; implications: Implication[] } {
  if (!weather || weather.indoor) {
    return { confidence, implications }
  }

  if (weather.wind_mph > PACE_THRESHOLDS.wind_mph_penalty_threshold) {
    const newConfidence = confidence * (1 - PACE_THRESHOLDS.wind_confidence_penalty)
    // Filter out totals implications in high wind
    const filteredImplications = implications.filter(
      imp => !imp.includes('total')
    )
    return { confidence: newConfidence, implications: filteredImplications }
  }

  return { confidence, implications }
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Run the Pace agent against MatchupContext team data
 */
export function checkPaceThresholds(context: PaceContext): PaceFinding[] {
  const findings: PaceFinding[] = []
  const year = context.seasonYear || new Date().getFullYear()
  const league = getLeagueStats(year)

  if (!context.teamStats || Object.keys(context.teamStats).length === 0) {
    log.debug('No team stats provided')
    return findings
  }

  const homeStats = context.teamStats[context.homeTeam]
  const awayStats = context.teamStats[context.awayTeam]

  // Compute projected plays for matchup
  const projected = computeProjectedPlays(homeStats, awayStats, year)
  const deltaVsLeague = projected.plays - league.avg_plays_per_game

  // Check for matchup-level finding
  const matchupFindingType = determineMatchupFindingType(projected.plays, league.avg_plays_per_game)

  if (matchupFindingType) {
    let implications = PACE_IMPLICATIONS[matchupFindingType]
    let confidence = calculateConfidence(projected.data_quality, matchupFindingType)

    // Apply weather modifier
    const modified = applyWeatherModifier(confidence, context.weather, implications)
    confidence = modified.confidence
    implications = modified.implications

    const payload: PacePayload = {
      projected_plays: projected.plays,
      home_plays_per_game: projected.home_contrib,
      away_plays_per_game: projected.away_contrib,
      seconds_per_play: homeStats?.seconds_per_play || awayStats?.seconds_per_play,
      delta_vs_league: deltaVsLeague,
      data_quality: projected.data_quality,
    }

    findings.push({
      id: `pace-matchup-${context.homeTeam.toLowerCase()}-${context.awayTeam.toLowerCase()}-${context.dataTimestamp}`,
      agent: AGENT,
      scope: 'game',
      metric: 'projected_plays',
      value: projected.plays,
      thresholds: [
        {
          key: 'projected_plays',
          operator: matchupFindingType.includes('over') ? 'gte' : 'lte',
          value: matchupFindingType.includes('over') ? PACE_THRESHOLDS.projected_plays_high : PACE_THRESHOLDS.projected_plays_low,
          met: true,
        },
      ],
      comparison_context: `Projected ${projected.plays.toFixed(1)} plays (${deltaVsLeague > 0 ? '+' : ''}${deltaVsLeague.toFixed(1)} vs league avg)`,
      confidence,
      source_ref: `matchupContext://teamStats/${context.homeTeam}+${context.awayTeam}`,
      source_type: 'matchupContext',
      source_timestamp: context.dataTimestamp,
      implication: implications[0],
      finding_type: matchupFindingType,
      payload,
      // Legacy fields
      type: matchupFindingType,
      stat: 'projected_plays',
      value_num: projected.plays,
      value_type: 'numeric',
      threshold_met: `projected_plays ${matchupFindingType.includes('over') ? '>=' : '<='} threshold`,
    } as PaceFinding)

    log.debug(`Found pace signal: ${matchupFindingType} (${projected.plays.toFixed(1)} plays)`)
  }

  // Check for pace mismatch
  if (checkPaceMismatch(homeStats, awayStats)) {
    const payload: PacePayload = {
      projected_plays: projected.plays,
      home_plays_per_game: projected.home_contrib,
      away_plays_per_game: projected.away_contrib,
      delta_vs_league: deltaVsLeague,
      data_quality: projected.data_quality,
    }

    findings.push({
      id: `pace-mismatch-${context.homeTeam.toLowerCase()}-${context.awayTeam.toLowerCase()}-${context.dataTimestamp}`,
      agent: AGENT,
      scope: 'game',
      metric: 'pace_rank',
      value: `${homeStats?.pace_rank || 'N/A'} vs ${awayStats?.pace_rank || 'N/A'}`,
      thresholds: [
        {
          key: 'pace_rank_delta',
          operator: 'gte',
          value: PACE_THRESHOLDS.slow_pace_rank - PACE_THRESHOLDS.fast_pace_rank,
          met: true,
        },
      ],
      comparison_context: `Pace mismatch: ${context.homeTeam} (${homeStats?.pace_rank || '?'}) vs ${context.awayTeam} (${awayStats?.pace_rank || '?'})`,
      confidence: 0.65, // Lower confidence for mismatch (context-dependent)
      source_ref: `matchupContext://teamStats/${context.homeTeam}+${context.awayTeam}`,
      source_type: 'matchupContext',
      source_timestamp: context.dataTimestamp,
      finding_type: 'pace_mismatch',
      payload,
      // Legacy fields
      type: 'pace_mismatch',
      stat: 'pace_rank',
      value_str: 'mismatch',
      value_type: 'string',
      threshold_met: 'pace_mismatch detected',
    } as PaceFinding)

    log.debug('Found pace mismatch')
  }

  // Check for team-level findings
  for (const [team, stats] of Object.entries(context.teamStats)) {
    const teamFindingType = determineTeamFindingType(stats, league.avg_plays_per_game)
    if (!teamFindingType) continue

    // Skip if we already have a stronger matchup finding
    if (matchupFindingType) continue

    let implications = PACE_IMPLICATIONS[teamFindingType]
    let confidence = 0.7

    // Apply weather modifier
    const modified = applyWeatherModifier(confidence, context.weather, implications)
    confidence = modified.confidence
    implications = modified.implications

    const payload: PacePayload = {
      projected_plays: stats.plays_per_game || league.avg_plays_per_game,
      delta_vs_league: (stats.plays_per_game || league.avg_plays_per_game) - league.avg_plays_per_game,
      data_quality: stats.plays_per_game ? 'full' : 'fallback',
    }

    findings.push({
      id: `pace-team-${team.toLowerCase()}-${context.dataTimestamp}`,
      agent: AGENT,
      scope: 'team',
      metric: 'plays_per_game',
      value: stats.plays_per_game || stats.pace_rank || 0,
      thresholds: [
        {
          key: stats.pace_rank !== undefined ? 'pace_rank' : 'plays_per_game',
          operator: teamFindingType.includes('above') ? 'lte' : 'gte',
          value: stats.pace_rank !== undefined
            ? (teamFindingType.includes('above') ? PACE_THRESHOLDS.fast_pace_rank : PACE_THRESHOLDS.slow_pace_rank)
            : PACE_THRESHOLDS.projected_plays_delta,
          met: true,
        },
      ],
      comparison_context: `${team}: ${stats.pace_rank ? `${ordinal(stats.pace_rank)} in pace` : `${stats.plays_per_game?.toFixed(1)} plays/game`}`,
      confidence,
      source_ref: `matchupContext://teamStats/${team}`,
      source_type: 'matchupContext',
      source_timestamp: context.dataTimestamp,
      implication: implications[0],
      finding_type: teamFindingType,
      payload,
      // Legacy fields
      type: teamFindingType,
      stat: 'pace',
      value_num: stats.plays_per_game || stats.pace_rank || 0,
      value_type: 'numeric',
      threshold_met: formatThresholdMet(teamFindingType, stats),
    } as PaceFinding)

    log.debug(`Found team pace: ${team} (${teamFindingType})`)
  }

  return findings
}

// =============================================================================
// Helper Functions
// =============================================================================

function calculateConfidence(
  dataQuality: 'full' | 'partial' | 'fallback',
  findingType: PaceFindingType
): number {
  let base = 0.75

  // Adjust for data quality
  switch (dataQuality) {
    case 'full':
      base += 0.1
      break
    case 'partial':
      break
    case 'fallback':
      base -= 0.15
      break
  }

  // Boost for extreme findings
  if (findingType === 'pace_over_signal' || findingType === 'pace_under_signal') {
    base += 0.05
  }

  return Math.min(Math.max(base, 0.5), 0.9)
}

function formatThresholdMet(findingType: PaceFindingType, stats: TeamStats): string {
  if (stats.pace_rank !== undefined) {
    const threshold = findingType.includes('above')
      ? PACE_THRESHOLDS.fast_pace_rank
      : PACE_THRESHOLDS.slow_pace_rank
    return `pace_rank ${findingType.includes('above') ? '<=' : '>='} ${threshold}`
  }
  return `plays_per_game delta >= ${PACE_THRESHOLDS.projected_plays_delta}`
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/**
 * Get all implications for the pace agent
 */
export function getPaceImplications(findingType: PaceFindingType): Implication[] {
  return PACE_IMPLICATIONS[findingType]
}
