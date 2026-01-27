import { NextResponse } from "next/server"
import { existsSync, readFileSync } from "fs"
import path from "path"

// 2025 Season - Super Bowl LX (Sun Feb 8, 2026)
// Note: post-season games are surfaced as "week 22" for downstream odds/combos APIs that expect a numeric week.
const WEEK = 22
const SEASON = 2025

const GAMES = [
  // Sunday, Feb 8 - Super Bowl LX at Levi's Stadium, Santa Clara
  { id: "patriots-seahawks", display: "New England Patriots @ Seattle Seahawks", time: "Sun 6:30 PM ET", week: WEEK, date: "2026-02-08" },
]

// Super Bowl is the featured game
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
