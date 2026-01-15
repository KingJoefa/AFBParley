/**
 * Weather Context Builder
 * Loads weather data from local JSON files and builds context blocks.
 * Only includes weather for outdoor games (indoor games are skipped).
 */

import fs from 'fs'
import path from 'path'
import { WeatherContext } from './types'

interface WeatherRecord {
  matchup: string       // e.g., "BUF @ DEN"
  gameId?: string       // e.g., "bills-broncos"
  temp_f: number
  wind_mph: number
  precip?: string       // "rain", "snow", "clear", etc.
  indoor: boolean
}

interface WeatherFile {
  ts: number // Unix timestamp
  games: WeatherRecord[]
}

// Teams with indoor/dome stadiums
const INDOOR_TEAMS = new Set([
  'ARI', 'ATL', 'DAL', 'DET', 'HOU', 'IND', 'LV', 'LAC', 'LAR', 'MIN', 'NO',
])

/**
 * Check if a game is indoors based on home team
 */
export function isIndoorGame(homeTeamCode: string): boolean {
  return INDOOR_TEAMS.has(homeTeamCode)
}

/**
 * Load weather context from local JSON file
 * Returns null for indoor games (no weather impact)
 */
export async function fetchWeatherContext(params: {
  week: number
  matchup: string
  homeTeamCode: string
}): Promise<WeatherContext | null> {
  // Skip indoor games entirely
  if (isIndoorGame(params.homeTeamCode)) {
    return null
  }

  const w = String(params.week).padStart(2, '0')
  const file = path.join(process.cwd(), 'my-parlaygpt', 'data', 'weather', `week-${w}.json`)

  try {
    if (!fs.existsSync(file)) return null

    const raw = fs.readFileSync(file, 'utf8')
    const data: WeatherFile = JSON.parse(raw)

    if (!data.games || !Array.isArray(data.games)) return null

    // Find matching game
    const matchupLower = params.matchup.toLowerCase()
    const game = data.games.find(g => {
      if (g.matchup && matchupLower.includes(g.matchup.toLowerCase())) return true
      if (g.gameId && matchupLower.includes(g.gameId.replace('-', ' '))) return true
      return false
    })

    if (!game) return null

    // If the file says indoor, skip
    if (game.indoor) return null

    const ts = data.ts || Math.floor(Date.now() / 1000)

    return {
      type: 'weather',
      ts,
      data: {
        temp_f: game.temp_f,
        wind_mph: game.wind_mph,
        precip: game.precip,
        indoor: false,
      },
    }
  } catch {
    return null
  }
}

/**
 * Create a basic weather context from manual parameters
 */
export function createWeatherContext(params: {
  temp_f: number
  wind_mph: number
  precip?: string
  indoor?: boolean
}): WeatherContext | null {
  if (params.indoor) return null

  return {
    type: 'weather',
    ts: Math.floor(Date.now() / 1000),
    data: {
      temp_f: params.temp_f,
      wind_mph: params.wind_mph,
      precip: params.precip,
      indoor: false,
    },
  }
}
