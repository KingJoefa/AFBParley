import { NextResponse } from "next/server"
import { existsSync, readFileSync } from "fs"
import path from "path"

// 2025 Season - Conference Championships (Sun Jan 25, 2026)
// Note: post-season games are surfaced as "week 21" for downstream odds/combos APIs that expect a numeric week.
const WEEK = 21
const SEASON = 2025

const GAMES = [
  // Sunday, Jan 25 - AFC Championship
  { id: "patriots-broncos", display: "New England Patriots @ Denver Broncos", time: "Sun 3:00 PM ET", week: WEEK, date: "2026-01-25" },
  // Sunday, Jan 25 - NFC Championship
  { id: "rams-seahawks", display: "Los Angeles Rams @ Seattle Seahawks", time: "Sun 6:30 PM ET", week: WEEK, date: "2026-01-25" },
]

// Both conference championships are featured games
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
