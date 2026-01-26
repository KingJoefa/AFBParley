import type { Finding, AgentType } from '../schemas'
import { createLogger } from '@/lib/logger'
import { checkEpaThresholds } from '../agents/epa/thresholds'
import { checkPressureThresholds } from '../agents/pressure/thresholds'
import { checkWeatherThresholds } from '../agents/weather/thresholds'
import { checkQbThresholds } from '../agents/qb/thresholds'
import { checkHbThresholds } from '../agents/hb/thresholds'
import { checkWrThresholds } from '../agents/wr/thresholds'
import { checkTeThresholds } from '../agents/te/thresholds'
import { runNotesAgent } from '../agents/notes/thresholds'
// New agents (2026-01-25)
import { checkInjuryThresholds } from '../agents/injury/thresholds'
import { checkUsageThresholds } from '../agents/usage/thresholds'
import { checkPaceThresholds } from '../agents/pace/thresholds'

const log = createLogger('scan')

/**
 * Agent Runner
 *
 * Orchestrates all specialized agents and aggregates their findings.
 * Each agent runs independently and produces Finding[] or stays silent.
 */

const ALL_AGENTS: AgentType[] = [
  'epa', 'pressure', 'weather', 'qb', 'hb', 'wr', 'te',
  'injury', 'usage', 'pace',  // New agents (2026-01-25)
]

export interface PlayerData {
  name: string
  team: string
  position: string
  // Stable identifier (optional for backward compatibility)
  player_id?: string

  // EPA fields
  receiving_epa_rank?: number
  rushing_epa_rank?: number
  targets?: number
  rushes?: number
  // QB fields
  qb_rating_rank?: number
  yards_per_attempt_rank?: number
  turnover_pct_rank?: number
  attempts?: number
  // HB fields
  rush_yards_rank?: number
  yards_per_carry_rank?: number
  rush_td_rank?: number
  carries?: number
  reception_rank?: number
  // WR fields
  target_share_rank?: number
  receiving_yards_rank?: number
  receiving_td_rank?: number
  separation_rank?: number
  // TE fields
  red_zone_target_rank?: number

  // NEW: Usage fields (2026-01-25) - 0-1 scale
  snap_pct_season?: number
  snap_pct_l4?: number
  route_participation_season?: number
  route_participation_l4?: number
  target_share_season?: number
  target_share_l4?: number

  // Sample size for suppression
  games_in_window?: number
  routes_sample?: number
  targets_sample?: number
  injury_limited?: boolean
}

export interface TeamStats {
  // EPA defense
  epa_allowed_to_wr_rank?: number
  epa_allowed_to_rb_rank?: number
  // Pressure
  pressure_rate?: number
  pressure_rate_rank?: number
  pass_block_win_rate_rank?: number
  qb_name?: string
  qb_passer_rating_under_pressure?: number
  // QB defense
  pass_defense_rank?: number
  pass_yards_allowed_rank?: number
  interception_rate_rank?: number
  // HB defense
  rush_defense_rank?: number
  rush_yards_allowed_rank?: number
  rush_td_allowed_rank?: number
  // WR defense
  yards_allowed_to_wr_rank?: number
  td_allowed_to_wr_rank?: number
  // TE defense
  te_defense_rank?: number
  yards_allowed_to_te_rank?: number
  td_allowed_to_te_rank?: number

  // NEW: Pace fields (2026-01-25) - raw inputs only
  pace_rank?: number             // 1-32
  plays_per_game?: number        // e.g., 64.5
  seconds_per_play?: number      // e.g., 26.8
  neutral_pace?: number          // pace when score within 7
}

export interface WeatherData {
  temperature: number
  wind_mph: number
  precipitation_chance: number
  precipitation_type?: 'rain' | 'snow' | 'none'
  indoor: boolean
  stadium?: string
}

export interface MatchupContext {
  homeTeam: string
  awayTeam: string
  players: Record<string, PlayerData[]>
  teamStats: Record<string, TeamStats>
  weather: WeatherData
  dataTimestamp: number
  dataVersion: string
  // Game notes from scout reports (enriches analyst output)
  gameNotes?: string
  injuries?: Record<string, string[]>
  keyMatchups?: string[]
  totals?: { home: number; away: number }
  spread?: { favorite: string; line: number }
  // Week/year for NotesAgent lookup
  year?: number
  week?: number
}

export interface AgentRunResult {
  findings: Finding[]
  agentsInvoked: AgentType[]
  agentsSilent: AgentType[]
}

/**
 * Run all agents against the matchup context
 * @param context - Matchup data and statistics
 * @param agentIds - Optional list of agent IDs to run (defaults to all agents)
 */
export async function runAgents(
  context: MatchupContext,
  agentIds?: AgentType[]
): Promise<AgentRunResult> {
  // Determine which agents to run (default to all if not specified)
  const agentsToRun = agentIds || ALL_AGENTS

  // Log which agents are running for verification
  log.debug('Running agents', { count: agentsToRun.length })

  const findings: Finding[] = []
  const agentsWithFindings = new Set<AgentType>()

  const thresholdContext = {
    dataTimestamp: context.dataTimestamp,
    dataVersion: context.dataVersion,
  }

  // Run EPA agent for all players (if enabled)
  if (agentsToRun.includes('epa')) {
    for (const team of [context.homeTeam, context.awayTeam]) {
      const opponent = team === context.homeTeam ? context.awayTeam : context.homeTeam
      const players = context.players[team] || []
      const opponentStats = context.teamStats[opponent] || {}

      for (const player of players) {
        const epaFindings = checkEpaThresholds(
          {
            name: player.name,
            team: player.team,
            receiving_epa_rank: player.receiving_epa_rank,
            rushing_epa_rank: player.rushing_epa_rank,
            targets: player.targets,
            rushes: player.rushes,
          },
          {
            team: opponent,
            epa_allowed_to_wr_rank: opponentStats.epa_allowed_to_wr_rank,
            epa_allowed_to_rb_rank: opponentStats.epa_allowed_to_rb_rank,
          },
          thresholdContext
        )
        if (epaFindings.length > 0) {
          findings.push(...epaFindings)
          agentsWithFindings.add('epa')
        }
      }
    }
  }

  // Run Pressure agent (team-level) (if enabled)
  if (agentsToRun.includes('pressure')) {
    for (const team of [context.homeTeam, context.awayTeam]) {
      const opponent = team === context.homeTeam ? context.awayTeam : context.homeTeam
      const teamStats = context.teamStats[team] || {}
      const opponentStats = context.teamStats[opponent] || {}

      if (opponentStats.pressure_rate_rank !== undefined) {
        const pressureFindings = checkPressureThresholds(
          {
            team: opponent,
            pressure_rate: opponentStats.pressure_rate,
            pressure_rate_rank: opponentStats.pressure_rate_rank,
          },
          {
            team: team,
            qb_name: teamStats.qb_name || 'Unknown QB',
            pass_block_win_rate_rank: teamStats.pass_block_win_rate_rank,
            qb_passer_rating_under_pressure: teamStats.qb_passer_rating_under_pressure,
          },
          thresholdContext
        )
        if (pressureFindings.length > 0) {
          findings.push(...pressureFindings)
          agentsWithFindings.add('pressure')
        }
      }
    }
  }

  // Run Weather agent (if enabled)
  if (agentsToRun.includes('weather')) {
    const weatherFindings = checkWeatherThresholds(context.weather, thresholdContext)
    if (weatherFindings.length > 0) {
      findings.push(...weatherFindings)
      agentsWithFindings.add('weather')
    }
  }

  // Run QB agent (if enabled)
  if (agentsToRun.includes('qb')) {
    for (const team of [context.homeTeam, context.awayTeam]) {
      const opponent = team === context.homeTeam ? context.awayTeam : context.homeTeam
      const players = context.players[team] || []
      const opponentStats = context.teamStats[opponent] || {}

      for (const player of players.filter(p => p.position === 'QB')) {
        const qbFindings = checkQbThresholds(
          {
            name: player.name,
            team: player.team,
            qb_rating_rank: player.qb_rating_rank,
            yards_per_attempt_rank: player.yards_per_attempt_rank,
            turnover_pct_rank: player.turnover_pct_rank,
            attempts: player.attempts,
          },
          {
            team: opponent,
            pass_defense_rank: opponentStats.pass_defense_rank,
            pass_yards_allowed_rank: opponentStats.pass_yards_allowed_rank,
            interception_rate_rank: opponentStats.interception_rate_rank,
          },
          thresholdContext
        )
        if (qbFindings.length > 0) {
          findings.push(...qbFindings)
          agentsWithFindings.add('qb')
        }
      }
    }
  }

  // Run HB agent (if enabled)
  if (agentsToRun.includes('hb')) {
    for (const team of [context.homeTeam, context.awayTeam]) {
      const opponent = team === context.homeTeam ? context.awayTeam : context.homeTeam
      const players = context.players[team] || []
      const opponentStats = context.teamStats[opponent] || {}

      for (const player of players.filter(p => p.position === 'HB' || p.position === 'RB')) {
        const hbFindings = checkHbThresholds(
          {
            name: player.name,
            team: player.team,
            rush_yards_rank: player.rush_yards_rank,
            yards_per_carry_rank: player.yards_per_carry_rank,
            rush_td_rank: player.rush_td_rank,
            reception_rank: player.reception_rank,
            carries: player.carries,
          },
          {
            team: opponent,
            rush_defense_rank: opponentStats.rush_defense_rank,
            rush_yards_allowed_rank: opponentStats.rush_yards_allowed_rank,
            rush_td_allowed_rank: opponentStats.rush_td_allowed_rank,
          },
          thresholdContext
        )
        if (hbFindings.length > 0) {
          findings.push(...hbFindings)
          agentsWithFindings.add('hb')
        }
      }
    }
  }

  // Run WR agent (if enabled)
  if (agentsToRun.includes('wr')) {
    for (const team of [context.homeTeam, context.awayTeam]) {
      const opponent = team === context.homeTeam ? context.awayTeam : context.homeTeam
      const players = context.players[team] || []
      const opponentStats = context.teamStats[opponent] || {}

      for (const player of players.filter(p => p.position === 'WR')) {
        const wrFindings = checkWrThresholds(
          {
            name: player.name,
            team: player.team,
            target_share_rank: player.target_share_rank,
            receiving_yards_rank: player.receiving_yards_rank,
            receiving_td_rank: player.receiving_td_rank,
            separation_rank: player.separation_rank,
            targets: player.targets,
          },
          {
            team: opponent,
            pass_defense_rank: opponentStats.pass_defense_rank,
            yards_allowed_to_wr_rank: opponentStats.yards_allowed_to_wr_rank,
            td_allowed_to_wr_rank: opponentStats.td_allowed_to_wr_rank,
          },
          thresholdContext
        )
        if (wrFindings.length > 0) {
          findings.push(...wrFindings)
          agentsWithFindings.add('wr')
        }
      }
    }
  }

  // Run TE agent (if enabled)
  if (agentsToRun.includes('te')) {
    for (const team of [context.homeTeam, context.awayTeam]) {
      const opponent = team === context.homeTeam ? context.awayTeam : context.homeTeam
      const players = context.players[team] || []
      const opponentStats = context.teamStats[opponent] || {}

      for (const player of players.filter(p => p.position === 'TE')) {
        const teFindings = checkTeThresholds(
          {
            name: player.name,
            team: player.team,
            target_share_rank: player.target_share_rank,
            receiving_yards_rank: player.receiving_yards_rank,
            receiving_td_rank: player.receiving_td_rank,
            red_zone_target_rank: player.red_zone_target_rank,
            targets: player.targets,
          },
          {
            team: opponent,
            te_defense_rank: opponentStats.te_defense_rank,
            yards_allowed_to_te_rank: opponentStats.yards_allowed_to_te_rank,
            td_allowed_to_te_rank: opponentStats.td_allowed_to_te_rank,
          },
          thresholdContext
        )
        if (teFindings.length > 0) {
          findings.push(...teFindings)
          agentsWithFindings.add('te')
        }
      }
    }
  }

  // Run Notes agent (unconditionally - provides curated context)
  // Note: NotesAgent runs regardless of agentIds since it's curated intelligence, not toggleable
  if (context.year && context.week) {
    const notesFindings = runNotesAgent({
      year: context.year,
      week: context.week,
      matchup: `${context.awayTeam} @ ${context.homeTeam}`,
      homeTeam: context.homeTeam,
      awayTeam: context.awayTeam,
    })
    if (notesFindings.length > 0) {
      findings.push(...notesFindings)
      agentsWithFindings.add('notes')
    }
  }

  // =========================================================================
  // New Agents (2026-01-25)
  // =========================================================================

  // Run Injury agent (if enabled)
  // Parses Notes JSON injuries to identify material absences
  if (agentsToRun.includes('injury') && context.injuries) {
    const injuryFindings = checkInjuryThresholds({
      homeTeam: context.homeTeam,
      awayTeam: context.awayTeam,
      injuries: context.injuries,
      dataTimestamp: context.dataTimestamp,
      dataVersion: context.dataVersion,
    })
    if (injuryFindings.length > 0) {
      findings.push(...injuryFindings)
      agentsWithFindings.add('injury')
    }
  }

  // Run Usage agent (if enabled)
  // Analyzes player snap share and target volume trends
  if (agentsToRun.includes('usage')) {
    const usageFindings = checkUsageThresholds({
      homeTeam: context.homeTeam,
      awayTeam: context.awayTeam,
      players: context.players,
      dataTimestamp: context.dataTimestamp,
      dataVersion: context.dataVersion,
    })
    if (usageFindings.length > 0) {
      findings.push(...usageFindings)
      agentsWithFindings.add('usage')
    }
  }

  // Run Pace agent (if enabled)
  // Combines team pace data to project total plays
  if (agentsToRun.includes('pace')) {
    const paceFindings = checkPaceThresholds({
      homeTeam: context.homeTeam,
      awayTeam: context.awayTeam,
      teamStats: context.teamStats,
      weather: context.weather,
      dataTimestamp: context.dataTimestamp,
      dataVersion: context.dataVersion,
      seasonYear: context.year,
    })
    if (paceFindings.length > 0) {
      findings.push(...paceFindings)
      agentsWithFindings.add('pace')
    }
  }

  // Calculate invoked vs silent (only among agents that were selected to run)
  const agentsInvoked = agentsToRun.filter(a => agentsWithFindings.has(a))
  const agentsSilent = agentsToRun.filter(a => !agentsWithFindings.has(a))

  return {
    findings,
    agentsInvoked,
    agentsSilent,
  }
}
