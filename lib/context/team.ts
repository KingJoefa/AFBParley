/**
 * Team Analytics Context Builder
 * Loads team analytics from local JSON files and builds context blocks.
 */

import fs from 'fs'
import path from 'path'
import { TeamStatsContext } from './types'

interface TeamAnalyticsRecord {
  teamCode: string
  epa?: number
  pace?: number           // Plays per game
  pass_rate?: number      // Neutral pass rate (0-1)
  rz_td_rate?: number     // Red zone TD rate (0-1)
  pressure_rate?: number  // Pressure rate generated (0-1)
}

interface AnalyticsFile {
  ts: number // Unix timestamp
  teams: TeamAnalyticsRecord[]
}

/**
 * Load team analytics from local JSON file
 */
export async function fetchTeamStatsContext(params: {
  year: number
  week: number
  teamCode: string
}): Promise<TeamStatsContext | null> {
  const w = String(params.week).padStart(2, '0')
  const file = path.join(
    process.cwd(),
    'my-parlaygpt',
    'data',
    'analytics',
    String(params.year),
    `week-${w}.json`
  )

  try {
    if (!fs.existsSync(file)) return null

    const raw = fs.readFileSync(file, 'utf8')
    const data: AnalyticsFile = JSON.parse(raw)

    if (!data.teams || !Array.isArray(data.teams)) return null

    const team = data.teams.find(t => t.teamCode === params.teamCode)
    if (!team) return null

    const ts = data.ts || Math.floor(Date.now() / 1000)

    return {
      type: 'team_stats',
      team: params.teamCode,
      ts,
      data: {
        epa: team.epa,
        pace: team.pace,
        pass_rate: team.pass_rate,
        rz_td_rate: team.rz_td_rate,
        pressure_rate: team.pressure_rate,
      },
    }
  } catch {
    return null
  }
}

/**
 * Load analytics for multiple teams at once
 */
export async function fetchTeamStatsContextBatch(params: {
  year: number
  week: number
  teamCodes: string[]
}): Promise<TeamStatsContext[]> {
  const results: TeamStatsContext[] = []

  for (const teamCode of params.teamCodes) {
    const ctx = await fetchTeamStatsContext({
      year: params.year,
      week: params.week,
      teamCode,
    })
    if (ctx) results.push(ctx)
  }

  return results
}

/**
 * Create a team stats context from manual parameters
 */
export function createTeamStatsContext(params: {
  teamCode: string
  epa?: number
  pace?: number
  pass_rate?: number
  rz_td_rate?: number
  pressure_rate?: number
}): TeamStatsContext {
  return {
    type: 'team_stats',
    team: params.teamCode,
    ts: Math.floor(Date.now() / 1000),
    data: {
      epa: params.epa,
      pace: params.pace,
      pass_rate: params.pass_rate,
      rz_td_rate: params.rz_td_rate,
      pressure_rate: params.pressure_rate,
    },
  }
}
