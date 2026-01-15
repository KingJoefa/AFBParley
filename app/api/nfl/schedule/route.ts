import { NextResponse } from "next/server"
import { existsSync, readFileSync } from "fs"
import path from "path"

// 2025 Season - Divisional Round (Sat Jan 17 - Sun Jan 18, 2026)
// Note: post-season games are surfaced as "week 20" for downstream odds/combos APIs that expect a numeric week.
const WEEK = 20
const SEASON = 2025

const GAMES = [
  // Saturday, Jan 17
  { id: "bills-broncos", display: "Buffalo Bills @ Denver Broncos", time: "Sat 4:30 PM ET", week: WEEK, date: "2026-01-17" },
  { id: "49ers-seahawks", display: "San Francisco 49ers @ Seattle Seahawks", time: "Sat 8:00 PM ET", week: WEEK, date: "2026-01-17" },
  // Sunday, Jan 18
  { id: "texans-patriots", display: "Houston Texans @ New England Patriots", time: "Sun 3:00 PM ET", week: WEEK, date: "2026-01-18" },
  { id: "rams-bears", display: "Los Angeles Rams @ Chicago Bears", time: "Sun 6:30 PM ET", week: WEEK, date: "2026-01-18" },
]

// With only 6 games, treat them all as featured.
const POPULAR = new Set(GAMES.map(g => g.id))

export async function GET() {
  let games = GAMES
  try {
    const overridePath = path.join(process.cwd(), 'my-parlaygpt', 'data', 'schedule.override.json')
    if (existsSync(overridePath)) {
      const raw = readFileSync(overridePath, 'utf8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.games)) {
        games = parsed.games as typeof GAMES
      }
    }
  } catch {}

  const gamesWithFlag = games.map(game => ({
    ...game,
    isPopular: POPULAR.has(game.id),
  }))

  return NextResponse.json({
    games: gamesWithFlag,
    week: WEEK,
    season: SEASON,
    lastUpdated: new Date().toISOString(),
    totalGames: gamesWithFlag.length,
  })
}
