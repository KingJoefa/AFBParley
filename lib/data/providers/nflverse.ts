import { parse } from 'csv-parse/sync'
import {
  IngestionFeedResultSchema,
  type IngestionFeedResult,
  type Observation,
  type SnapshotAvailability,
} from '@/lib/data/contracts'
import { createObservation, createRawImport } from '@/lib/data/providers/shared'
import type { ObservationProvider, WeekProviderContext } from '@/lib/data/providers/types'
import { normalizeTeamCode, type TeamCode } from '@/lib/nfl/teams'

const NFLVERSE_TERMS_URL = 'https://github.com/nflverse/nflreadr#terms-of-use'
const NFLVERSE_RELEASE_ROOT = 'https://github.com/nflverse/nflverse-data/releases/download'

type CsvRow = Record<string, string>

function parseCsv(body: string): CsvRow[] {
  return parse(body, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  }) as CsvRow[]
}

function numeric(value: string | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function fetchedObservationTime(response: Response, fallback: string): string {
  const lastModified = response.headers.get('last-modified')
  if (!lastModified) return fallback
  const timestamp = new Date(lastModified)
  return Number.isNaN(timestamp.getTime()) ? fallback : timestamp.toISOString()
}

function availability(params: {
  state: SnapshotAvailability['state']
  checkedAt: string
  count?: number
  message?: string
}): SnapshotAvailability {
  return {
    state: params.state,
    checked_at: params.checkedAt,
    observation_count: params.count ?? 0,
    ...(params.message ? { message: params.message } : {}),
  }
}

async function fetchCsv(context: WeekProviderContext, url: string): Promise<{
  response: Response
  rows: CsvRow[]
}> {
  const response = await context.fetch(url, {
    headers: { 'User-Agent': 'Swantail/0.1' },
  })
  if (!response.ok) throw new Error(`nflverse returned ${response.status}`)
  return { response, rows: parseCsv(await response.text()) }
}

function failedFeed(params: {
  context: WeekProviderContext
  feed: string
  state: 'missing' | 'degraded'
  message: string
}): IngestionFeedResult {
  const checkedAt = params.context.now.toISOString()
  return IngestionFeedResultSchema.parse({
    provider: 'nflverse',
    feed: params.feed,
    state: params.state,
    checked_at: checkedAt,
    message: params.message,
    raw_imports: [],
    observations: [],
    game_states: Object.fromEntries(params.context.games.map(game => [
      game.game_id,
      availability({ state: params.state, checkedAt, message: params.message }),
    ])),
  })
}

export const nflverseInjuryProvider: ObservationProvider = {
  agentId: 'injury',
  async collect(context): Promise<IngestionFeedResult> {
    const checkedAt = context.now.toISOString()
    const url = `${NFLVERSE_RELEASE_ROOT}/injuries/injuries_${context.season}.csv`
    let response: Response
    let rows: CsvRow[]
    try {
      ({ response, rows } = await fetchCsv(context, url))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'nflverse injury feed failed'
      return failedFeed({
        context,
        feed: 'injuries',
        state: message.includes('404') ? 'missing' : 'degraded',
        message,
      })
    }

    const teams = new Set(context.games.flatMap(game => [game.away_team, game.home_team]))
    const relevantRows = rows.filter(row => {
      const team = normalizeTeamCode(row.team)
      return Number(row.season) === context.season
        && Number(row.week) === context.week
        && team !== null
        && teams.has(team)
        && Boolean(row.report_status || row.practice_status)
    })
    const rawImport = createRawImport({
      provider: 'nflverse',
      feed: 'injuries',
      sourceUrl: url,
      fetchedAt: checkedAt,
      payload: relevantRows,
    })
    const observedAt = fetchedObservationTime(response, checkedAt)
    const observations: Observation[] = []
    const gameCounts = new Map<string, number>()

    for (const row of relevantRows) {
      const team = normalizeTeamCode(row.team)
      if (!team) continue
      const game = context.games.find(candidate => (
        candidate.away_team === team || candidate.home_team === team
      ))
      if (!game) continue
      observations.push(createObservation({
        gameId: game.game_id,
        agentId: 'injury',
        kind: 'report',
        subject: {
          type: 'player',
          id: row.gsis_id || `${team}:${row.full_name}`,
          label: row.full_name,
          team,
        },
        metric: 'player.availability_report',
        value: {
          position: row.position || null,
          report_status: row.report_status || null,
          primary_injury: row.report_primary_injury || row.practice_primary_injury || null,
          practice_status: row.practice_status || null,
        },
        source: {
          provider: 'nflverse',
          feed: 'injuries',
          quality: 'research',
          source_url: url,
          terms_url: NFLVERSE_TERMS_URL,
        },
        observedAt,
        effectiveAt: game.kickoff,
        expiresAt: new Date(Date.parse(game.kickoff) + 6 * 60 * 60 * 1000).toISOString(),
        importedAt: checkedAt,
        rawImportId: rawImport.raw_import_id,
        providerRecordId: `${context.season}:${context.week}:${row.gsis_id || row.full_name}`,
      }))
      gameCounts.set(game.game_id, (gameCounts.get(game.game_id) ?? 0) + 1)
    }

    const gameStates = Object.fromEntries(context.games.map(game => {
      const count = gameCounts.get(game.game_id) ?? 0
      return [game.game_id, availability({
        state: count ? 'available' : 'missing',
        checkedAt,
        count,
        ...(!count ? { message: 'No current-week injury report is present in the pilot feed' } : {}),
      })]
    }))

    return IngestionFeedResultSchema.parse({
      provider: 'nflverse',
      feed: 'injuries',
      state: observations.length ? 'available' : 'missing',
      checked_at: checkedAt,
      raw_imports: [rawImport],
      observations,
      game_states: gameStates,
    })
  },
}

type TeamPerformance = {
  team: TeamCode
  games: number
  plays: number
  offensiveEpa: number
  offensiveEpaPerPlay: number
}

function aggregateTeamPerformance(rows: CsvRow[], season: number, beforeWeek?: number): TeamPerformance[] {
  const totals = new Map<TeamCode, Omit<TeamPerformance, 'team' | 'offensiveEpaPerPlay'>>()
  for (const row of rows) {
    if (Number(row.season) !== season) continue
    if (beforeWeek !== undefined && Number(row.week) >= beforeWeek) continue
    const team = normalizeTeamCode(row.team)
    if (!team) continue
    const current = totals.get(team) ?? { games: 0, plays: 0, offensiveEpa: 0 }
    current.games += numeric(row.games) || 1
    current.plays += numeric(row.attempts) + numeric(row.carries) + numeric(row.sacks_suffered)
    current.offensiveEpa += numeric(row.passing_epa) + numeric(row.rushing_epa)
    totals.set(team, current)
  }
  return [...totals.entries()].map(([team, total]) => ({
    team,
    ...total,
    offensiveEpaPerPlay: total.plays ? total.offensiveEpa / total.plays : 0,
  }))
}

export const nflverseEpaProvider: ObservationProvider = {
  agentId: 'epa',
  async collect(context): Promise<IngestionFeedResult> {
    const checkedAt = context.now.toISOString()
    const useCurrentSeason = context.week > 1
    const dataSeason = useCurrentSeason ? context.season : context.season - 1
    const file = useCurrentSeason
      ? `stats_team_week_${dataSeason}.csv`
      : `stats_team_reg_${dataSeason}.csv`
    const url = `${NFLVERSE_RELEASE_ROOT}/stats_team/${file}`
    let response: Response
    let rows: CsvRow[]
    try {
      ({ response, rows } = await fetchCsv(context, url))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'nflverse team stats feed failed'
      return failedFeed({
        context,
        feed: 'team-stats',
        state: message.includes('404') ? 'missing' : 'degraded',
        message,
      })
    }

    const performance = aggregateTeamPerformance(
      rows,
      dataSeason,
      useCurrentSeason ? context.week : undefined,
    ).sort((left, right) => right.offensiveEpaPerPlay - left.offensiveEpaPerPlay)
    const rawImport = createRawImport({
      provider: 'nflverse',
      feed: 'team-stats',
      sourceUrl: url,
      fetchedAt: checkedAt,
      payload: performance,
    })
    const observedAt = fetchedObservationTime(response, checkedAt)
    const observations: Observation[] = []
    const gameCounts = new Map<string, number>()

    for (const game of context.games) {
      for (const team of [game.away_team, game.home_team]) {
        const teamPerformance = performance.find(candidate => candidate.team === team)
        if (!teamPerformance) continue
        const rank = performance.findIndex(candidate => candidate.team === team) + 1
        observations.push(createObservation({
          gameId: game.game_id,
          agentId: 'epa',
          kind: 'measurement',
          subject: { type: 'team', id: team, label: team, team },
          metric: 'team.offensive_epa_per_play',
          value: {
            value: Number(teamPerformance.offensiveEpaPerPlay.toFixed(4)),
            rank,
            league_size: performance.length,
            sample_games: teamPerformance.games,
            data_season: dataSeason,
            through_week: useCurrentSeason ? context.week - 1 : null,
          },
          unit: 'epa_per_play',
          source: {
            provider: 'nflverse',
            feed: 'team-stats',
            quality: 'research',
            source_url: url,
            terms_url: NFLVERSE_TERMS_URL,
          },
          observedAt,
          effectiveAt: observedAt,
          expiresAt: new Date(context.now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          importedAt: checkedAt,
          rawImportId: rawImport.raw_import_id,
          providerRecordId: `${dataSeason}:${team}:${useCurrentSeason ? context.week - 1 : 'final'}`,
        }))
        gameCounts.set(game.game_id, (gameCounts.get(game.game_id) ?? 0) + 1)
      }
    }

    const gameStates = Object.fromEntries(context.games.map(game => {
      const count = gameCounts.get(game.game_id) ?? 0
      return [game.game_id, availability({
        state: count === 2 ? 'available' : count ? 'degraded' : 'missing',
        checkedAt,
        count,
        ...(count !== 2 ? { message: 'A two-team performance baseline is incomplete' } : {}),
      })]
    }))

    return IngestionFeedResultSchema.parse({
      provider: 'nflverse',
      feed: 'team-stats',
      state: observations.length ? 'available' : 'missing',
      checked_at: checkedAt,
      raw_imports: [rawImport],
      observations,
      game_states: gameStates,
    })
  },
}
