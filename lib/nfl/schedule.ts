import { existsSync, readdirSync, readFileSync } from 'fs'
import path from 'path'
import { z } from 'zod'
import {
  createGameId,
  GameSchema,
  GameStatusSchema,
  SeasonSchema,
  TeamCodeSchema,
  WeekSchema,
  type Game,
} from '@/lib/nfl/game'
import { getTeamDisplayName, parseMatchup } from '@/lib/nfl/teams'

const ScheduleFixtureSchema = z.object({
  season: SeasonSchema,
  week: WeekSchema,
  round: z.string().min(1).optional(),
  games: z.record(z.object({
    kickoff: z.string().datetime({ offset: true }),
  }).passthrough()),
}).passthrough()

const SeasonScheduleSchema = z.object({
  schema_version: z.number().int().positive(),
  season: SeasonSchema,
  season_label: z.string().min(1),
  season_type: z.literal('regular'),
  imported_at: z.string().datetime({ offset: true }),
  sources: z.array(z.object({
    name: z.string().min(1),
    url: z.string().url(),
    role: z.string().min(1),
  })).min(1),
  games: z.array(z.object({
    external_id: z.string().min(1),
    week: WeekSchema.max(18),
    away_team: TeamCodeSchema,
    home_team: TeamCodeSchema,
    kickoff: z.string().datetime({ offset: true }),
    status: GameStatusSchema,
    neutral_site: z.boolean(),
    venue: z.string().min(1).optional(),
    broadcast: z.string().min(1).optional(),
  })).min(1),
})

type ScheduleReference = {
  season: number
  week: number
  filename: string
}

type SeasonSchedule = z.infer<typeof SeasonScheduleSchema>

export type ScheduleGame = Game & {
  id: string
  external_id?: string
  time: string
  date: string
  broadcast?: string
  isPopular: boolean
}

export type LoadedSchedule = {
  games: ScheduleGame[]
  season: number
  seasonLabel?: string
  week: number
  round?: string
  source: 'season-schedule' | 'curated-notes'
  dataVersion: string
  lastUpdated: string
  availableWeeks: number[]
  totalSeasonGames: number
}

export class ScheduleNotFoundError extends Error {}

const NOTES_ROOT = path.join(process.cwd(), 'data', 'notes')
const SCHEDULES_ROOT = path.join(process.cwd(), 'data', 'schedules')
const GAME_WINDOW_MS = 6 * 60 * 60 * 1000

function listScheduleReferences(): ScheduleReference[] {
  return readdirSync(NOTES_ROOT, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .flatMap(entry => {
      const match = /^(\d{4})-wk(\d{1,2})\.json$/.exec(entry.name)
      if (!match) return []
      return [{ season: Number(match[1]), week: Number(match[2]), filename: entry.name }]
    })
    .sort((left, right) => left.season - right.season || left.week - right.week)
}

function listSeasonScheduleYears(): number[] {
  if (!existsSync(SCHEDULES_ROOT)) return []
  return readdirSync(SCHEDULES_ROOT, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .flatMap(entry => {
      const match = /^(\d{4})\.json$/.exec(entry.name)
      return match ? [Number(match[1])] : []
    })
    .sort((left, right) => left - right)
}

function formatEasternTime(kickoff: string): string {
  const date = new Date(kickoff)
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'America/New_York',
  }).format(date)
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(date)
  return `${weekday} ${time} ET`
}

function formatEasternDate(kickoff: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/New_York',
  }).formatToParts(new Date(kickoff))
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function priorityWeek(schedule: SeasonSchedule, now: Date): number {
  const chronological = [...schedule.games].sort((left, right) => (
    Date.parse(left.kickoff) - Date.parse(right.kickoff)
  ))
  return chronological.find(game => Date.parse(game.kickoff) + GAME_WINDOW_MS >= now.getTime())?.week
    ?? chronological.at(-1)?.week
    ?? 1
}

function toScheduleGame(params: {
  season: number
  week: number
  awayTeam: z.infer<typeof TeamCodeSchema>
  homeTeam: z.infer<typeof TeamCodeSchema>
  kickoff: string
  round?: string
  neutralSite: boolean
  status: z.infer<typeof GameStatusSchema>
  venue?: string
  externalId?: string
  broadcast?: string
  isPopular: boolean
}): ScheduleGame {
  const gameId = createGameId({
    season: params.season,
    week: params.week,
    awayTeam: params.awayTeam,
    homeTeam: params.homeTeam,
  })
  const display = `${getTeamDisplayName(params.awayTeam)} @ ${getTeamDisplayName(params.homeTeam)}`
  const game = GameSchema.parse({
    game_id: gameId,
    season: params.season,
    week: params.week,
    round: params.round,
    away_team: params.awayTeam,
    home_team: params.homeTeam,
    kickoff: params.kickoff,
    neutral_site: params.neutralSite,
    status: params.status,
    venue: params.venue,
    display,
  })

  return {
    ...game,
    id: gameId,
    external_id: params.externalId,
    time: formatEasternTime(game.kickoff),
    date: formatEasternDate(game.kickoff),
    broadcast: params.broadcast,
    isPopular: params.isPopular,
  }
}

function loadSeasonSchedule(season: number, week: number | undefined, now: Date): LoadedSchedule | null {
  const schedulePath = path.join(SCHEDULES_ROOT, `${season}.json`)
  if (!existsSync(schedulePath)) return null

  const schedule = SeasonScheduleSchema.parse(JSON.parse(readFileSync(schedulePath, 'utf8')))
  if (schedule.season !== season) {
    throw new Error(`Schedule metadata does not match filename: ${season}.json`)
  }

  const selectedWeek = week ?? priorityWeek(schedule, now)
  const weekGames = schedule.games
    .filter(game => game.week === selectedWeek)
    .sort((left, right) => Date.parse(left.kickoff) - Date.parse(right.kickoff))
  if (!weekGames.length) return null

  const games = weekGames.map(game => toScheduleGame({
    season,
    week: game.week,
    awayTeam: game.away_team,
    homeTeam: game.home_team,
    kickoff: game.kickoff,
    round: 'Regular Season',
    neutralSite: game.neutral_site,
    status: game.status,
    venue: game.venue,
    externalId: game.external_id,
    broadcast: game.broadcast,
    isPopular: false,
  }))
  const importVersion = schedule.imported_at.replace(/\D/g, '').slice(0, 14)

  return {
    games,
    season,
    seasonLabel: schedule.season_label,
    week: selectedWeek,
    round: 'Regular Season',
    source: 'season-schedule',
    dataVersion: `${season}-regular-${importVersion}`,
    lastUpdated: schedule.imported_at,
    availableWeeks: [...new Set(schedule.games.map(game => game.week))].sort((a, b) => a - b),
    totalSeasonGames: schedule.games.length,
  }
}

function loadNotesSchedule(reference: ScheduleReference): LoadedSchedule {
  const fixturePath = path.join(NOTES_ROOT, reference.filename)
  const fixture = ScheduleFixtureSchema.parse(JSON.parse(readFileSync(fixturePath, 'utf8')))
  if (fixture.season !== reference.season || fixture.week !== reference.week) {
    throw new Error(`Schedule metadata does not match filename: ${reference.filename}`)
  }

  const entries = Object.entries(fixture.games)
  const games = entries.map(([matchup, details]) => {
    const parsed = parseMatchup(matchup)
    if (!parsed) throw new Error(`Invalid matchup key in ${reference.filename}: ${matchup}`)
    return toScheduleGame({
      season: fixture.season,
      week: fixture.week,
      awayTeam: parsed.awayTeam,
      homeTeam: parsed.homeTeam,
      kickoff: details.kickoff,
      round: fixture.round,
      neutralSite: fixture.round?.toLowerCase().includes('super bowl') ?? false,
      status: 'scheduled',
      isPopular: entries.length === 1,
    })
  })

  return {
    games,
    season: fixture.season,
    week: fixture.week,
    round: fixture.round,
    source: 'curated-notes',
    dataVersion: reference.filename.replace(/\.json$/, ''),
    lastUpdated: new Date().toISOString(),
    availableWeeks: listScheduleReferences()
      .filter(item => item.season === fixture.season)
      .map(item => item.week),
    totalSeasonGames: games.length,
  }
}

export function loadSchedule(params: {
  season?: number
  week?: number
  now?: Date
} = {}): LoadedSchedule {
  const references = listScheduleReferences()
  const seasonYears = listSeasonScheduleYears()
  const candidateYears = params.week !== undefined && params.week > 18
    ? references.filter(reference => reference.week === params.week).map(reference => reference.season)
    : [...seasonYears, ...references.map(reference => reference.season)]
  const season = params.season ?? candidateYears.sort((a, b) => a - b).at(-1)

  if (season !== undefined) {
    const fullSchedule = loadSeasonSchedule(season, params.week, params.now ?? new Date())
    if (fullSchedule) return fullSchedule

    const reference = references.filter(item => (
      item.season === season && (params.week === undefined || item.week === params.week)
    )).at(-1)
    if (reference) return loadNotesSchedule(reference)
  }

  const requested = [params.season, params.week && `week ${params.week}`].filter(Boolean).join(' ')
  throw new ScheduleNotFoundError(`No schedule fixture found for ${requested || 'the requested range'}`)
}
