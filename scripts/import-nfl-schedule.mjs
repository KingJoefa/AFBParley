import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const season = Number(process.argv[2] ?? 2026)
if (!Number.isInteger(season) || season < 2000 || season > 2100) {
  throw new Error('Season must be an integer between 2000 and 2100')
}

const ESPN_API = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
const NFL_SCHEDULE_URL = 'https://www.nfl.com/schedules/2026/REG1/'
const TEAM_CODE_OVERRIDES = { WSH: 'WAS' }

function canonicalTeamCode(code) {
  return TEAM_CODE_OVERRIDES[code] ?? code
}

function statusFromCompetition(competition) {
  const status = competition.status?.type
  if (status?.completed) return 'final'
  if (status?.state === 'in') return 'live'
  if (status?.name === 'STATUS_POSTPONED') return 'postponed'
  if (status?.name === 'STATUS_CANCELED') return 'canceled'
  return 'scheduled'
}

const games = []

for (let week = 1; week <= 18; week += 1) {
  const url = new URL(ESPN_API)
  url.searchParams.set('dates', String(season))
  url.searchParams.set('seasontype', '2')
  url.searchParams.set('week', String(week))

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Schedule request failed for week ${week}: ${response.status}`)

  const payload = await response.json()
  if (payload.season?.year !== season || payload.week?.number !== week) {
    throw new Error(`Schedule response metadata mismatch for week ${week}`)
  }

  for (const event of payload.events ?? []) {
    const competition = event.competitions?.[0]
    const home = competition?.competitors?.find(team => team.homeAway === 'home')
    const away = competition?.competitors?.find(team => team.homeAway === 'away')
    if (!competition || !home?.team?.abbreviation || !away?.team?.abbreviation) {
      throw new Error(`Incomplete matchup in week ${week}: ${event.id ?? 'unknown event'}`)
    }

    games.push({
      external_id: String(event.id),
      week,
      away_team: canonicalTeamCode(away.team.abbreviation),
      home_team: canonicalTeamCode(home.team.abbreviation),
      kickoff: new Date(competition.date ?? event.date).toISOString(),
      status: statusFromCompetition(competition),
      neutral_site: Boolean(competition.neutralSite),
      venue: competition.venue?.fullName || undefined,
      broadcast: competition.broadcast || undefined,
    })
  }
}

const uniqueEvents = new Set(games.map(game => game.external_id))
if (games.length !== 272 || uniqueEvents.size !== games.length) {
  throw new Error(`Expected 272 unique regular-season games, received ${games.length}`)
}

const document = {
  schema_version: 1,
  season,
  season_label: `${season}-${String(season + 1).slice(-2)}`,
  season_type: 'regular',
  imported_at: new Date().toISOString(),
  sources: [
    {
      name: 'NFL schedule',
      url: NFL_SCHEDULE_URL.replace('2026', String(season)),
      role: 'official verification',
    },
    {
      name: 'ESPN scoreboard API',
      url: `${ESPN_API}?dates=${season}&seasontype=2&week={week}`,
      role: 'structured game data',
    },
  ],
  games,
}

const outputDir = path.join(process.cwd(), 'data', 'schedules')
const outputPath = path.join(outputDir, `${season}.json`)
await mkdir(outputDir, { recursive: true })
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')

console.log(`Imported ${games.length} games to ${outputPath}`)
