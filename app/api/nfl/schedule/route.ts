import { NextResponse } from "next/server"

const GAMES = [
  { id: "chargers-chiefs", display: "Los Angeles Chargers @ Kansas City Chiefs", time: "Thu 5:15 PM PDT", week: 7, date: "2025-10-16" },
  { id: "patriots-dolphins", display: "New England Patriots @ Miami Dolphins", time: "Sun 10:00 AM PDT", week: 7, date: "2025-10-19" },
  { id: "packers-bears", display: "Green Bay Packers @ Chicago Bears", time: "Sun 10:00 AM PDT", week: 7, date: "2025-10-19" },
  { id: "lions-vikings", display: "Detroit Lions @ Minnesota Vikings", time: "Sun 10:00 AM PDT", week: 7, date: "2025-10-19" },
  { id: "jets-bills", display: "New York Jets @ Buffalo Bills", time: "Sun 10:00 AM PDT", week: 7, date: "2025-10-19" },
  { id: "panthers-buccaneers", display: "Carolina Panthers @ Tampa Bay Buccaneers", time: "Sun 10:00 AM PDT", week: 7, date: "2025-10-19" },
  { id: "titans-colts", display: "Tennessee Titans @ Indianapolis Colts", time: "Sun 10:00 AM PDT", week: 7, date: "2025-10-19" },
  { id: "ravens-giants", display: "Baltimore Ravens @ New York Giants", time: "Sun 10:00 AM PDT", week: 7, date: "2025-10-19" },
  { id: "browns-bengals", display: "Cleveland Browns @ Cincinnati Bengals", time: "Sun 10:00 AM PDT", week: 7, date: "2025-10-19" },
  { id: "commanders-broncos", display: "Washington Commanders @ Denver Broncos", time: "Sun 1:05 PM PDT", week: 7, date: "2025-10-19" },
  { id: "seahawks-49ers", display: "Seattle Seahawks @ San Francisco 49ers", time: "Sun 1:05 PM PDT", week: 7, date: "2025-10-19" },
  { id: "rams-cardinals", display: "Los Angeles Rams @ Arizona Cardinals", time: "Sun 1:05 PM PDT", week: 7, date: "2025-10-19" },
  { id: "cowboys-eagles", display: "Dallas Cowboys @ Philadelphia Eagles", time: "Sun 1:25 PM PDT", week: 7, date: "2025-10-19" },
  { id: "falcons-saints", display: "Atlanta Falcons @ New Orleans Saints", time: "Sun 1:25 PM PDT", week: 7, date: "2025-10-19" },
  { id: "steelers-raiders", display: "Pittsburgh Steelers @ Las Vegas Raiders", time: "Sun 5:20 PM PDT", week: 7, date: "2025-10-19" },
  { id: "texans-jaguars", display: "Houston Texans @ Jacksonville Jaguars", time: "Mon 5:15 PM PDT", week: 7, date: "2025-10-20" },
]

const POPULAR = new Set(["chargers-chiefs", "jets-bills", "cowboys-eagles", "steelers-raiders"])

export async function GET() {
  const gamesWithFlag = GAMES.map(game => ({
    ...game,
    isPopular: POPULAR.has(game.id),
  }))

  return NextResponse.json({
    games: gamesWithFlag,
    week: 7,
    season: 2025,
    lastUpdated: new Date().toISOString(),
    totalGames: gamesWithFlag.length,
  })
}
