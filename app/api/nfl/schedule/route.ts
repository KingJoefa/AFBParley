import { NextResponse } from "next/server"

const GAMES = [
  { id: "vikings-browns", display: "Minnesota Vikings @ Cleveland Browns", time: "Sun 6:30 AM PDT", week: 5, date: "2025-10-05" },
  { id: "cowboys-jets", display: "Dallas Cowboys @ New York Jets", time: "Sun 10:00 AM PDT", week: 5, date: "2025-10-05" },
  { id: "broncos-eagles", display: "Denver Broncos @ Philadelphia Eagles", time: "Sun 10:00 AM PDT", week: 5, date: "2025-10-05" },
  { id: "texans-ravens", display: "Houston Texans @ Baltimore Ravens", time: "Sun 10:00 AM PDT", week: 5, date: "2025-10-05" },
  { id: "giants-saints", display: "New York Giants @ New Orleans Saints", time: "Sun 10:00 AM PDT", week: 5, date: "2025-10-05" },
  { id: "raiders-colts", display: "Las Vegas Raiders @ Indianapolis Colts", time: "Sun 10:00 AM PDT", week: 5, date: "2025-10-05" },
  { id: "dolphins-panthers", display: "Miami Dolphins @ Carolina Panthers", time: "Sun 10:00 AM PDT", week: 5, date: "2025-10-05" },
  { id: "buccaneers-seahawks", display: "Tampa Bay Buccaneers @ Seattle Seahawks", time: "Sun 1:05 PM PDT", week: 5, date: "2025-10-05" },
  { id: "titans-cardinals", display: "Tennessee Titans @ Arizona Cardinals", time: "Sun 1:05 PM PDT", week: 5, date: "2025-10-05" },
  { id: "commanders-chargers", display: "Washington Commanders @ Los Angeles Chargers", time: "Sun 1:25 PM PDT", week: 5, date: "2025-10-05" },
  { id: "lions-bengals", display: "Detroit Lions @ Cincinnati Bengals", time: "Sun 1:25 PM PDT", week: 5, date: "2025-10-05" },
  { id: "patriots-bills", display: "New England Patriots @ Buffalo Bills", time: "Sun 5:20 PM PDT", week: 5, date: "2025-10-05" },
]

const POPULAR = new Set(["giants-saints", "patriots-bills", "lions-bengals", "cowboys-jets"])

export async function GET() {
  const gamesWithFlag = GAMES.map(game => ({
    ...game,
    isPopular: POPULAR.has(game.id),
  }))

  return NextResponse.json({
    games: gamesWithFlag,
    week: 5,
    season: 2025,
    lastUpdated: new Date().toISOString(),
    totalGames: gamesWithFlag.length,
  })
}
