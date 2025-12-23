import { NextResponse } from "next/server"
import { existsSync, readFileSync } from "fs"
import path from "path"

// 2025 Regular Season - Week 17 (Thu Dec 25 - Mon Dec 29, 2025)
const GAMES = [
  // Thursday, Dec 25
  { id: "cowboys-commanders", display: "Dallas Cowboys @ Washington Commanders", time: "Thu 1:00 PM ET", week: 17, date: "2025-12-25" },
  { id: "lions-vikings", display: "Detroit Lions @ Minnesota Vikings", time: "Thu 4:30 PM ET", week: 17, date: "2025-12-25" },
  { id: "broncos-chiefs", display: "Denver Broncos @ Kansas City Chiefs", time: "Thu 8:15 PM ET", week: 17, date: "2025-12-25" },
  // Saturday, Dec 27
  { id: "texans-chargers", display: "Houston Texans @ Los Angeles Chargers", time: "Sat 4:30 PM ET", week: 17, date: "2025-12-27" },
  { id: "ravens-packers", display: "Baltimore Ravens @ Green Bay Packers", time: "Sat 8:00 PM ET", week: 17, date: "2025-12-27" },
  // Sunday, Dec 28
  { id: "cardinals-bengals", display: "Arizona Cardinals @ Cincinnati Bengals", time: "Sun 1:00 PM ET", week: 17, date: "2025-12-28" },
  { id: "steelers-browns", display: "Pittsburgh Steelers @ Cleveland Browns", time: "Sun 1:00 PM ET", week: 17, date: "2025-12-28" },
  { id: "saints-titans", display: "New Orleans Saints @ Tennessee Titans", time: "Sun 1:00 PM ET", week: 17, date: "2025-12-28" },
  { id: "jaguars-colts", display: "Jacksonville Jaguars @ Indianapolis Colts", time: "Sun 1:00 PM ET", week: 17, date: "2025-12-28" },
  { id: "buccaneers-dolphins", display: "Tampa Bay Buccaneers @ Miami Dolphins", time: "Sun 1:00 PM ET", week: 17, date: "2025-12-28" },
  { id: "patriots-jets", display: "New England Patriots @ New York Jets", time: "Sun 1:00 PM ET", week: 17, date: "2025-12-28" },
  { id: "seahawks-panthers", display: "Seattle Seahawks @ Carolina Panthers", time: "Sun 1:00 PM ET", week: 17, date: "2025-12-28" },
  { id: "giants-raiders", display: "New York Giants @ Las Vegas Raiders", time: "Sun 4:05 PM ET", week: 17, date: "2025-12-28" },
  { id: "eagles-bills", display: "Philadelphia Eagles @ Buffalo Bills", time: "Sun 4:25 PM ET", week: 17, date: "2025-12-28" },
  { id: "bears-49ers", display: "Chicago Bears @ San Francisco 49ers", time: "Sun 8:20 PM ET", week: 17, date: "2025-12-28" },
  // Monday, Dec 29
  { id: "rams-falcons", display: "Los Angeles Rams @ Atlanta Falcons", time: "Mon 8:15 PM ET", week: 17, date: "2025-12-29" },
]

const POPULAR = new Set([
  "broncos-chiefs",
  "eagles-bills",
  "bears-49ers",
  "patriots-jets",
  "cowboys-commanders",
])

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
    week: 17,
    season: 2025,
    lastUpdated: new Date().toISOString(),
    totalGames: gamesWithFlag.length,
  })
}
