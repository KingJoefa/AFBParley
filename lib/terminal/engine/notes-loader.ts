import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { GameNotesContext } from '../analyst'

/**
 * Game Notes Loader
 *
 * Loads scout reports from data/notes/{season}-wk{week}.json fixtures.
 * Returns undefined if notes unavailable (graceful degradation).
 */

interface TPRRMatchup {
  player: string
  team?: string
  tprr: number
  coverage: string
  vs_overall_delta?: number
  opp_rate?: number
  routes_10wk?: number
  routes_last?: number
  note?: string
}

interface Analytics {
  source?: string
  model_spread?: { team: string; line: number; adjusted?: number; note?: string }
  model_scores?: Record<string, number>
  pressure?: Record<string, unknown>
  qb_grades?: Record<string, Record<string, unknown>>
  tprr_matchups?: TPRRMatchup[]
  insights?: string[]
}

interface SGP {
  name?: string
  legs: string[]
  odds: string | null
  confidence: string
  rationale?: string
}

interface GameNotesFixture {
  week: number
  season: number
  round?: string
  games: Record<string, {
    kickoff?: string
    totals?: { home: number; away: number }
    spread?: { favorite: string; line: number }
    notes?: string
    injuries?: Record<string, string[]>
    keyMatchups?: string[]
    weather?: { temp_f?: number; wind_mph?: number; snow_chance_pct?: number }
    prediction?: { home: number; away: number }
    analytics?: Analytics
    sgps?: SGP[]
  }>
}

const NOTES_DIR = join(process.cwd(), 'data/notes')

/**
 * Get current NFL week (rough estimate)
 *
 * NFL Postseason Schedule (typical):
 * - Week 19: Wild Card (mid-January)
 * - Week 20: Divisional (3rd week of January)
 * - Week 21: Conference Championships (4th week of January)
 * - Week 22: Super Bowl (early February)
 */
function getCurrentWeek(): { season: number; week: number } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-indexed (0 = January)
  const day = now.getDate()

  // NFL season starts around Sept 1
  const seasonStart = new Date(year, 8, 1) // Sept 1

  if (now < seasonStart) {
    // Before September = previous year's season
    // Determine postseason week based on calendar date
    if (month === 0) {
      // January: Wild Card (week 19) through Conference Championships (week 21)
      if (day <= 13) return { season: year - 1, week: 19 } // Wild Card
      if (day <= 20) return { season: year - 1, week: 20 } // Divisional
      return { season: year - 1, week: 21 } // Conference Championships
    } else if (month === 1) {
      // February: Super Bowl (week 22) or offseason
      if (day <= 15) return { season: year - 1, week: 22 } // Super Bowl
      return { season: year - 1, week: 22 } // Post-Super Bowl
    }
    // March-August: Offseason, default to last available
    return { season: year - 1, week: 22 }
  }

  // September onwards: current season
  const weeksSinceStart = Math.ceil((now.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
  return { season: year, week: Math.min(weeksSinceStart + 1, 22) }
}

/**
 * Load notes fixture for a given week
 */
function loadNotesFixture(season: number, week: number): GameNotesFixture | null {
  const filename = `${season}-wk${week}.json`
  const filepath = join(NOTES_DIR, filename)

  if (!existsSync(filepath)) {
    return null
  }

  try {
    const content = readFileSync(filepath, 'utf-8')
    return JSON.parse(content) as GameNotesFixture
  } catch (e) {
    console.warn(`[notes-loader] Failed to parse ${filename}:`, e)
    return null
  }
}

/**
 * Normalize matchup key to "AWAY@HOME" format
 */
function normalizeMatchupKey(homeTeam: string, awayTeam: string): string {
  return `${awayTeam.toUpperCase()}@${homeTeam.toUpperCase()}`
}

/**
 * Load game notes for a specific matchup
 *
 * @param homeTeam - Home team abbreviation (e.g., "DEN")
 * @param awayTeam - Away team abbreviation (e.g., "BUF")
 * @param week - Optional week override (defaults to current week)
 * @param season - Optional season override (defaults to current season)
 * @returns GameNotesContext or undefined if not found
 */
export function loadGameNotes(
  homeTeam: string,
  awayTeam: string,
  week?: number,
  season?: number
): GameNotesContext | undefined {
  const current = getCurrentWeek()
  const targetWeek = week ?? current.week
  const targetSeason = season ?? current.season

  const fixture = loadNotesFixture(targetSeason, targetWeek)
  if (!fixture) {
    return undefined
  }

  const key = normalizeMatchupKey(homeTeam, awayTeam)
  const game = fixture.games[key]

  if (!game) {
    // Try reverse key (in case home/away are swapped in fixture)
    const reverseKey = normalizeMatchupKey(awayTeam, homeTeam)
    const reverseGame = fixture.games[reverseKey]
    if (reverseGame) {
      return {
        notes: reverseGame.notes,
        injuries: reverseGame.injuries,
        keyMatchups: reverseGame.keyMatchups,
        totals: reverseGame.totals,
        spread: reverseGame.spread,
        analytics: reverseGame.analytics,
        sgps: reverseGame.sgps,
      }
    }
    return undefined
  }

  return {
    notes: game.notes,
    injuries: game.injuries,
    keyMatchups: game.keyMatchups,
    totals: game.totals,
    spread: game.spread,
    analytics: game.analytics,
    sgps: game.sgps,
  }
}

/**
 * Check if notes are available for current week
 */
export function hasNotesForCurrentWeek(): boolean {
  const { season, week } = getCurrentWeek()
  return loadNotesFixture(season, week) !== null
}

/**
 * List available notes fixtures
 */
export function listAvailableNotes(): Array<{ season: number; week: number; filename: string }> {
  const { readdirSync } = require('fs')

  if (!existsSync(NOTES_DIR)) {
    return []
  }

  const files = readdirSync(NOTES_DIR) as string[]
  return files
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const match = f.match(/(\d{4})-wk(\d+)\.json/)
      if (!match) return null
      return {
        season: parseInt(match[1]),
        week: parseInt(match[2]),
        filename: f,
      }
    })
    .filter((x): x is { season: number; week: number; filename: string } => x !== null)
}
