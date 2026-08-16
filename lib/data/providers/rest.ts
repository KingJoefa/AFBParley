import {
  GameSnapshotSchema,
  IngestionFeedResultSchema,
  OBSERVATION_AGENT_IDS,
  OBSERVATION_CONTRACT_VERSION,
  type GameSnapshot,
  type IngestionFeedResult,
  type Observation,
  type SnapshotAvailability,
} from '@/lib/data/contracts'
import { contentHash, stableId } from '@/lib/data/hash'
import { createObservation, createRawImport } from '@/lib/data/providers/shared'
import type { ObservationProvider, WeekProviderContext } from '@/lib/data/providers/types'
import { loadSeasonGames, type ScheduleGame } from '@/lib/nfl/schedule'
import type { TeamCode } from '@/lib/nfl/teams'
import { getVenueWeatherProfile } from '@/lib/nfl/venues'

const EARTH_RADIUS_MILES = 3958.8

export type TeamRestContext = {
  team: TeamCode
  previous_game_id: string | null
  previous_kickoff: string | null
  turnaround_hours: number | null
  turnaround_days: number | null
  schedule_spot: 'opening_week' | 'short_week' | 'standard' | 'extended_rest'
  current_site: 'home' | 'away' | 'neutral'
  consecutive_road_games: boolean
  travel_miles_from_home: number | null
  data_scope: 'regular_season_schedule'
}

function availability(checkedAt: string, count: number): SnapshotAvailability {
  return {
    state: count === 2 ? 'available' : count ? 'degraded' : 'missing',
    checked_at: checkedAt,
    observation_count: count,
    ...(count !== 2 ? { message: 'Two-team schedule context is incomplete' } : {}),
  }
}

function radians(value: number): number {
  return value * Math.PI / 180
}

function distanceMiles(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
): number {
  const latitudeDelta = radians(right.latitude - left.latitude)
  const longitudeDelta = radians(right.longitude - left.longitude)
  const latitudeA = radians(left.latitude)
  const latitudeB = radians(right.latitude)
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function gameIncludesTeam(game: ScheduleGame, team: TeamCode): boolean {
  return game.away_team === team || game.home_team === team
}

function isRoadGame(game: ScheduleGame, team: TeamCode): boolean {
  return game.neutral_site || game.away_team === team
}

function homeVenue(games: ScheduleGame[], team: TeamCode): string | undefined {
  return games.find(game => game.home_team === team && !game.neutral_site && game.venue)?.venue
}

export function deriveTeamRestContext(params: {
  game: ScheduleGame
  team: TeamCode
  seasonGames: ScheduleGame[]
}): TeamRestContext {
  const previousGame = params.seasonGames
    .filter(game => gameIncludesTeam(game, params.team))
    .filter(game => Date.parse(game.kickoff) < Date.parse(params.game.kickoff))
    .at(-1)
  const turnaroundHours = previousGame
    ? (Date.parse(params.game.kickoff) - Date.parse(previousGame.kickoff)) / (60 * 60 * 1000)
    : null
  const scheduleSpot = turnaroundHours === null
    ? 'opening_week'
    : turnaroundHours < 6.5 * 24
      ? 'short_week'
      : turnaroundHours >= 9.5 * 24
        ? 'extended_rest'
        : 'standard'
  const currentSite = params.game.neutral_site
    ? 'neutral'
    : params.game.home_team === params.team
      ? 'home'
      : 'away'
  const baseVenue = homeVenue(params.seasonGames, params.team)
  const baseLocation = getVenueWeatherProfile(baseVenue)
  const gameLocation = getVenueWeatherProfile(params.game.venue)
  const travelMiles = currentSite === 'home'
    ? 0
    : baseLocation && gameLocation
      ? Math.round(distanceMiles(baseLocation, gameLocation))
      : null

  return {
    team: params.team,
    previous_game_id: previousGame?.game_id ?? null,
    previous_kickoff: previousGame?.kickoff ?? null,
    turnaround_hours: turnaroundHours === null ? null : Number(turnaroundHours.toFixed(1)),
    turnaround_days: turnaroundHours === null ? null : Number((turnaroundHours / 24).toFixed(1)),
    schedule_spot: scheduleSpot,
    current_site: currentSite,
    consecutive_road_games: Boolean(previousGame && isRoadGame(previousGame, params.team) && isRoadGame(params.game, params.team)),
    travel_miles_from_home: travelMiles,
    data_scope: 'regular_season_schedule',
  }
}

export const scheduleRestProvider: ObservationProvider = {
  agentIds: ['rest'],
  async collect(context: WeekProviderContext): Promise<IngestionFeedResult> {
    const checkedAt = context.now.toISOString()
    const sourceUrl = `https://www.nfl.com/schedules/${context.season}/REG${context.week}/`
    const seasonGames = loadSeasonGames(context.season)
    const contexts = context.games.flatMap(game => (
      [game.away_team, game.home_team].map(team => ({
        game,
        context: deriveTeamRestContext({ game, team, seasonGames }),
      }))
    ))
    const rawImport = createRawImport({
      provider: 'swantail',
      feed: 'schedule-derived-rest',
      sourceUrl,
      fetchedAt: checkedAt,
      payload: contexts.map(item => ({ game_id: item.game.game_id, ...item.context })),
    })
    const observations: Observation[] = contexts.map(item => createObservation({
      gameId: item.game.game_id,
      agentId: 'rest',
      kind: 'measurement',
      subject: {
        type: 'team',
        id: item.context.team,
        label: item.context.team,
        team: item.context.team,
      },
      metric: 'team.schedule_rest_context',
      value: item.context,
      source: {
        provider: 'swantail',
        feed: 'schedule-derived-rest',
        quality: 'internal',
        source_url: sourceUrl,
      },
      observedAt: checkedAt,
      effectiveAt: checkedAt,
      expiresAt: new Date(Date.parse(item.game.kickoff) + 6 * 60 * 60 * 1000).toISOString(),
      importedAt: checkedAt,
      rawImportId: rawImport.raw_import_id,
      providerRecordId: `${item.game.game_id}:${item.context.team}`,
    }))
    const gameStates = Object.fromEntries(context.games.map(game => {
      const count = observations.filter(observation => observation.game_id === game.game_id).length
      return [game.game_id, availability(checkedAt, count)]
    }))

    return IngestionFeedResultSchema.parse({
      provider: 'swantail',
      feed: 'schedule-derived-rest',
      state: observations.length ? 'available' : 'missing',
      checked_at: checkedAt,
      raw_imports: [rawImport],
      observations,
      game_states: gameStates,
    })
  },
}

export async function attachScheduleRestSnapshot(params: {
  game: ScheduleGame
  snapshot: GameSnapshot | null
  now?: Date
}): Promise<GameSnapshot> {
  const now = params.now ?? new Date()
  const feed = await scheduleRestProvider.collect({
    games: [params.game],
    season: params.game.season,
    week: params.game.week,
    now,
    fetch,
  })
  const restObservations = feed.observations.filter(observation => observation.game_id === params.game.game_id)
  const observations = [
    ...(params.snapshot?.observations.filter(observation => observation.agent_id !== 'rest') ?? []),
    ...restObservations,
  ].sort((left, right) => left.observation_id.localeCompare(right.observation_id))
  const missingAvailability = {
    state: 'missing' as const,
    checked_at: now.toISOString(),
    observation_count: 0,
  }
  const availability = Object.fromEntries(OBSERVATION_AGENT_IDS.map(agentId => [
    agentId,
    agentId === 'rest'
      ? feed.game_states[params.game.game_id]
      : params.snapshot?.availability[agentId] ?? missingAvailability,
  ])) as GameSnapshot['availability']
  const snapshotContent = {
    game: params.snapshot?.game ?? params.game,
    observations,
    availability,
  }
  const hash = contentHash(snapshotContent)
  return GameSnapshotSchema.parse({
    snapshot_id: stableId('snapshot', {
      game_id: params.game.game_id,
      source: 'schedule-rest-fallback',
      content_hash: hash,
    }),
    game_id: params.game.game_id,
    captured_at: now.toISOString(),
    contract_version: OBSERVATION_CONTRACT_VERSION,
    ...snapshotContent,
    content_hash: hash,
  })
}
