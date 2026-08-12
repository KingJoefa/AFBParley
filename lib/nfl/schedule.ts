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
import { getTeamDisplayName } from '@/lib/nfl/teams'

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

type SeasonSchedule = z.infer<typeof SeasonScheduleSchema>

export type ScheduleGame = Game & {
  id: string
  external_id: string
  time: string
  date: string
  broadcast?: string
  isPopular: false
}

export type LoadedSchedule = {
  games: ScheduleGame[]
  season: number
  seasonLabel: string
  week: number
  round: 'Regular Season'
  source: 'season-schedule'
  dataVersion: string
  lastUpdated: string
  availableWeeks: number[]
  totalSeasonGames: number
}

export class ScheduleNotFoundError extends Error {}

const SCHEDULES_ROOT = path.join(process.cwd(), 'data', 'schedules')
const GAME_WINDOW_MS = 6 * 60 * 60 * 1000

function environmentInteger(value?: string): number | undefined {
  if (!value?.trim()) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) throw new Error(`Invalid schedule environment value: ${value}`)
  return parsed
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
  neutralSite: boolean
  status: z.infer<typeof GameStatusSchema>
  venue?: string
  externalId: string
  broadcast?: string
}): ScheduleGame {
  const gameId = createGameId({
    season: params.season,
    week: params.week,
    awayTeam: params.awayTeam,
    homeTeam: params.homeTeam,
  })
  const game = GameSchema.parse({
    game_id: gameId,
    season: params.season,
    week: params.week,
    round: 'Regular Season',
    away_team: params.awayTeam,
    home_team: params.homeTeam,
    kickoff: params.kickoff,
    neutral_site: params.neutralSite,
    status: params.status,
    venue: params.venue,
    display: `${getTeamDisplayName(params.awayTeam)} @ ${getTeamDisplayName(params.homeTeam)}`,
  })

  return {
    ...game,
    id: gameId,
    external_id: params.externalId,
    time: formatEasternTime(game.kickoff),
    date: formatEasternDate(game.kickoff),
    broadcast: params.broadcast,
    isPopular: false,
  }
}

export function loadSchedule(params: {
  season?: number
  week?: number
  now?: Date
} = {}): LoadedSchedule {
  const season = params.season ?? listSeasonScheduleYears().at(-1)
  const schedulePath = season === undefined ? '' : path.join(SCHEDULES_ROOT, `${season}.json`)
  if (season === undefined || !existsSync(schedulePath)) {
    throw new ScheduleNotFoundError(`No regular-season schedule found for ${season ?? 'the requested season'}`)
  }

  const schedule = SeasonScheduleSchema.parse(JSON.parse(readFileSync(schedulePath, 'utf8')))
  if (schedule.season !== season) {
    throw new Error(`Schedule metadata does not match filename: ${season}.json`)
  }

  const selectedWeek = params.week ?? priorityWeek(schedule, params.now ?? new Date())
  const weekGames = schedule.games
    .filter(game => game.week === selectedWeek)
    .sort((left, right) => Date.parse(left.kickoff) - Date.parse(right.kickoff))
  if (!weekGames.length) {
    throw new ScheduleNotFoundError(`No regular-season schedule found for ${season} week ${selectedWeek}`)
  }

  const games = weekGames.map(game => toScheduleGame({
    season,
    week: game.week,
    awayTeam: game.away_team,
    homeTeam: game.home_team,
    kickoff: game.kickoff,
    neutralSite: game.neutral_site,
    status: game.status,
    venue: game.venue,
    externalId: game.external_id,
    broadcast: game.broadcast,
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

export function loadOperationalSchedule(params: { now?: Date } = {}): LoadedSchedule {
  return loadSchedule({
    season: environmentInteger(process.env.NFL_SEASON ?? process.env.NFL_YEAR),
    week: environmentInteger(process.env.NFL_WEEK),
    now: params.now,
  })
}
