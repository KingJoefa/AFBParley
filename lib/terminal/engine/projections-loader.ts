/**
 * Projections Loader for Build Endpoint
 *
 * Loads full player roster from projections files for roster validation.
 * Unlike context/projections.ts, this returns ALL players (not limited for token budget).
 */

import fs from 'fs'
import path from 'path'
import { createLogger } from '@/lib/logger'
import type { Player } from './roster-validator'
import { loadSchedule } from '@/lib/nfl/schedule'
import { normalizeTeamCode } from '@/lib/nfl/teams'

const log = createLogger('projections')
const PROJECTIONS_ROOT = path.join(process.cwd(), 'my-parlaygpt', 'data', 'projections')

interface ProjectionsFile {
  ts: number
  source?: string
  note?: string
  players: Array<{
    name: string
    team: string
    pos: string
    rank?: number
    pass_yds?: number
    rush_yds?: number
    rec_yds?: number
    proj_pts?: number
  }>
}

/**
 * Load all players from projections file for a given week
 */
export async function loadProjections(params: {
  year: number
  week: number
}): Promise<Player[]> {
  const { year, week } = params

  // Try with and without zero-padding
  const files = [
    path.join(PROJECTIONS_ROOT, String(year), `week-${week}.json`),
    path.join(PROJECTIONS_ROOT, String(year), `week-${String(week).padStart(2, '0')}.json`),
  ]

  for (const file of files) {
    try {
      if (!fs.existsSync(file)) continue

      const raw = fs.readFileSync(file, 'utf8')
      const data: ProjectionsFile = JSON.parse(raw)

      if (!data.players || !Array.isArray(data.players)) continue

      return data.players.map(p => ({
        name: p.name,
        team: normalizeTeamCode(p.team) ?? p.team.toUpperCase(),
        pos: p.pos,
        rank: p.rank,
      }))
    } catch {
      continue
    }
  }

  return []
}

/**
 * Get current week/year from schedule endpoint or use defaults
 */
export async function getCurrentWeekYear(): Promise<{ week: number; year: number }> {
  try {
    const schedule = loadSchedule()
    return { week: schedule.week, year: schedule.season }
  } catch {
    const year = Number(process.env.NFL_SEASON ?? process.env.NFL_YEAR)
    const week = Number(process.env.NFL_WEEK)
    return {
      year: Number.isInteger(year) ? year : 2025,
      week: Number.isInteger(week) ? week : 20,
    }
  }
}

/**
 * Load projections for a specific matchup
 * Returns all players for both teams
 */
export async function loadMatchupProjections(
  homeTeam: string,
  awayTeam: string,
  week?: number,
  year?: number
): Promise<Player[]> {
  const schedule = week && year ? { week, year } : await getCurrentWeekYear()
  const allPlayers = await loadProjections(schedule)

  if (allPlayers.length === 0) {
    log.warn('No projections found')
    return []
  }

  // Normalize team codes for comparison
  const normalizeTeam = (team: string) => normalizeTeamCode(team) ?? team.toUpperCase()
  const home = normalizeTeam(homeTeam)
  const away = normalizeTeam(awayTeam)

  // Filter to matchup teams
  const matchupPlayers = allPlayers.filter(p => {
    const team = normalizeTeam(p.team)
    return team === home || team === away
  })

  log.debug('Loaded players for matchup', { count: matchupPlayers.length })

  return matchupPlayers
}
