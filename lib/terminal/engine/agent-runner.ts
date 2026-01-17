import type { Finding, AgentType } from '../schemas'
import { checkEpaThresholds } from '../agents/epa/thresholds'
import { checkPressureThresholds } from '../agents/pressure/thresholds'
import { checkWeatherThresholds } from '../agents/weather/thresholds'
import { checkQbThresholds } from '../agents/qb/thresholds'
import { checkHbThresholds } from '../agents/hb/thresholds'
import { checkWrThresholds } from '../agents/wr/thresholds'
import { checkTeThresholds } from '../agents/te/thresholds'

/**
 * Agent Runner
 *
 * Orchestrates all specialized agents and aggregates their findings.
 * Each agent runs independently and produces Finding[] or stays silent.
 */

const ALL_AGENTS: AgentType[] = ['epa', 'pressure', 'weather', 'qb', 'hb', 'wr', 'te']

interface PlayerData {
  name: string
  team: string
  position: string
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
}

interface TeamStats {
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
}

interface WeatherData {
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
}

export interface AgentRunResult {
  findings: Finding[]
  agentsInvoked: AgentType[]
  agentsSilent: AgentType[]
}

/**
 * Run all agents against the matchup context
 */
export async function runAgents(context: MatchupContext): Promise<AgentRunResult> {
  const findings: Finding[] = []
  const agentsWithFindings = new Set<AgentType>()

  const thresholdContext = {
    dataTimestamp: context.dataTimestamp,
    dataVersion: context.dataVersion,
  }

  // Run EPA agent for all players
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

  // Run Pressure agent (team-level)
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

  // Run Weather agent
  const weatherFindings = checkWeatherThresholds(context.weather, thresholdContext)
  if (weatherFindings.length > 0) {
    findings.push(...weatherFindings)
    agentsWithFindings.add('weather')
  }

  // Run QB agent
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

  // Run HB agent
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

  // Run WR agent
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

  // Run TE agent
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

  // Calculate invoked vs silent
  const agentsInvoked = ALL_AGENTS.filter(a => agentsWithFindings.has(a))
  const agentsSilent = ALL_AGENTS.filter(a => !agentsWithFindings.has(a))

  return {
    findings,
    agentsInvoked,
    agentsSilent,
  }
}
