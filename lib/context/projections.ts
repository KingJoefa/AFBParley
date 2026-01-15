/**
 * Player Projections Context Builder
 * Loads player projections from local JSON files and builds context blocks.
 */

import fs from 'fs'
import path from 'path'
import { ProjectionsContext } from './types'

interface PlayerProjectionRecord {
  name: string
  team: string
  pos: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST'
  pass_yds?: number
  pass_tds?: number
  rush_yds?: number
  rush_tds?: number
  rec_yds?: number
  rec_tds?: number
  targets?: number
  proj_pts?: number
  rank?: number // Used for playoffs when proj_pts not available
}

interface ProjectionsFile {
  ts: number // Unix timestamp
  players: PlayerProjectionRecord[]
}

// Max players to include per context (to manage token budget)
const MAX_PLAYERS = 6

/**
 * Load player projections from local JSON file
 */
export async function fetchProjectionsContext(params: {
  year: number
  week: number
  teamCodes: string[] // Filter to only these teams
}): Promise<ProjectionsContext | null> {
  const w = String(params.week).padStart(2, '0')
  const file = path.join(
    process.cwd(),
    'my-parlaygpt',
    'data',
    'projections',
    String(params.year),
    `week-${w}.json`
  )

  try {
    if (!fs.existsSync(file)) return null

    const raw = fs.readFileSync(file, 'utf8')
    const data: ProjectionsFile = JSON.parse(raw)

    if (!data.players || !Array.isArray(data.players)) return null

    // Filter to relevant teams
    let relevant = data.players.filter(p => params.teamCodes.includes(p.team))

    // Sort by rank (lower first) or projected points (higher first), then by position importance
    const posOrder = { QB: 0, RB: 1, WR: 2, TE: 3, K: 4, DST: 5 }
    relevant.sort((a, b) => {
      // If rank is available, use it (lower is better)
      if (a.rank !== undefined && b.rank !== undefined) {
        if (a.rank !== b.rank) return a.rank - b.rank
      }
      // Otherwise use projected points (higher is better)
      const ptsA = a.proj_pts ?? 0
      const ptsB = b.proj_pts ?? 0
      if (ptsB !== ptsA) return ptsB - ptsA

      // Then by position importance
      return posOrder[a.pos] - posOrder[b.pos]
    })

    // Limit to top players
    relevant = relevant.slice(0, MAX_PLAYERS)

    if (relevant.length === 0) return null

    const ts = data.ts || Math.floor(Date.now() / 1000)

    return {
      type: 'projections',
      ts,
      data: relevant.map(p => ({
        name: p.name,
        team: p.team,
        pos: p.pos,
        pass_yds: p.pass_yds,
        pass_tds: p.pass_tds,
        rush_yds: p.rush_yds,
        rush_tds: p.rush_tds,
        rec_yds: p.rec_yds,
        rec_tds: p.rec_tds,
        targets: p.targets,
        proj_pts: p.proj_pts,
        rank: p.rank,
      })),
    }
  } catch {
    return null
  }
}

/**
 * Create projections context from manual data
 */
export function createProjectionsContext(
  players: Array<{
    name: string
    team: string
    pos: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST'
    pass_yds?: number
    pass_tds?: number
    rush_yds?: number
    rush_tds?: number
    rec_yds?: number
    rec_tds?: number
    targets?: number
    proj_pts?: number
  }>
): ProjectionsContext {
  return {
    type: 'projections',
    ts: Math.floor(Date.now() / 1000),
    data: players.slice(0, MAX_PLAYERS),
  }
}
