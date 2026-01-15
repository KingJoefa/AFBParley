/**
 * Injuries Context Builder
 * Loads injury data from local JSON files and builds context blocks.
 */

import fs from 'fs'
import path from 'path'
import {
  InjuriesContext,
  ContextStatus,
  FRESH_TTL_MIN,
  STALE_TTL_MIN,
} from './types'

interface InjuryRecord {
  player: string
  team: string
  status: 'OUT' | 'DOUBTFUL' | 'QUESTIONABLE' | 'PROBABLE'
  injury?: string
}

interface InjuriesFile {
  ts: number // Unix timestamp
  injuries: InjuryRecord[]
}

/**
 * Get freshness status based on timestamp age
 */
function getStatus(ts: number): ContextStatus {
  const ageMin = Math.floor((Date.now() - ts * 1000) / 60000)
  if (ageMin < FRESH_TTL_MIN) return 'FRESH'
  if (ageMin < STALE_TTL_MIN) return 'STALE'
  return 'UNAVAILABLE'
}

/**
 * Load injuries from local JSON file
 */
export async function fetchInjuriesContext(params: {
  week: number
  teamCodes: string[] // Filter to only these teams
}): Promise<InjuriesContext | null> {
  const w = String(params.week).padStart(2, '0')
  const file = path.join(process.cwd(), 'my-parlaygpt', 'data', 'injuries', `week-${w}.json`)

  try {
    if (!fs.existsSync(file)) return null

    const raw = fs.readFileSync(file, 'utf8')
    const data: InjuriesFile = JSON.parse(raw)

    if (!data.injuries || !Array.isArray(data.injuries)) return null

    // Filter to relevant teams and meaningful statuses (OUT, DOUBTFUL, QUESTIONABLE)
    const relevant = data.injuries.filter(inj =>
      params.teamCodes.includes(inj.team) &&
      ['OUT', 'DOUBTFUL', 'QUESTIONABLE'].includes(inj.status)
    )

    // Sort by status severity (OUT first, then DOUBTFUL, then QUESTIONABLE)
    const statusOrder: Record<string, number> = { OUT: 0, DOUBTFUL: 1, QUESTIONABLE: 2 }
    relevant.sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3))

    const ts = data.ts || Math.floor(Date.now() / 1000)

    return {
      type: 'injuries',
      ts,
      status: getStatus(ts),
      data: relevant.map(inj => ({
        player: inj.player,
        team: inj.team,
        status: inj.status as 'OUT' | 'DOUBTFUL' | 'QUESTIONABLE',
        injury: inj.injury,
      })),
    }
  } catch {
    return null
  }
}

/**
 * Create an empty/unavailable injuries context
 */
export function createUnavailableInjuriesContext(): InjuriesContext {
  return {
    type: 'injuries',
    ts: Math.floor(Date.now() / 1000),
    status: 'UNAVAILABLE',
    data: [],
  }
}
