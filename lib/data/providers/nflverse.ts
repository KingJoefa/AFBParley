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
  agentIds: ['injury'],
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
  passingAttempts: number
  dropbacks: number
  carries: number
  passingInterceptions: number
  fumblesLost: number
  giveawaysPerGame: number
  interceptionRate: number
  defensiveInterceptions: number
  opponentFumbleRecoveries: number
  takeawaysPerGame: number
  defensiveForcedFumbles: number
  sacksSuffered: number
  sackRateAllowed: number
  rushingEpa: number
  rushingEpaPerCarry: number
  defensiveSacks: number
  defensiveQbHits: number
  disruptionPerGame: number
  defensiveTacklesForLoss: number
  tacklesForLossPerGame: number
}

type TeamPerformanceTotal = Omit<TeamPerformance,
  | 'team'
  | 'offensiveEpaPerPlay'
  | 'giveawaysPerGame'
  | 'interceptionRate'
  | 'takeawaysPerGame'
  | 'sackRateAllowed'
  | 'rushingEpaPerCarry'
  | 'disruptionPerGame'
  | 'tacklesForLossPerGame'
>

function aggregateTeamPerformance(rows: CsvRow[], season: number, beforeWeek?: number): TeamPerformance[] {
  const totals = new Map<TeamCode, TeamPerformanceTotal>()
  for (const row of rows) {
    if (Number(row.season) !== season) continue
    if (beforeWeek !== undefined && Number(row.week) >= beforeWeek) continue
    if (row.season_type && row.season_type !== 'REG') continue
    const team = normalizeTeamCode(row.team)
    if (!team) continue
    const current = totals.get(team) ?? {
      games: 0,
      plays: 0,
      offensiveEpa: 0,
      passingAttempts: 0,
      dropbacks: 0,
      carries: 0,
      passingInterceptions: 0,
      fumblesLost: 0,
      defensiveInterceptions: 0,
      opponentFumbleRecoveries: 0,
      defensiveForcedFumbles: 0,
      sacksSuffered: 0,
      rushingEpa: 0,
      defensiveSacks: 0,
      defensiveQbHits: 0,
      defensiveTacklesForLoss: 0,
    }
    const attempts = numeric(row.attempts)
    const carries = numeric(row.carries)
    const sacksSuffered = numeric(row.sacks_suffered)
    current.games += numeric(row.games) || 1
    current.plays += attempts + carries + sacksSuffered
    current.offensiveEpa += numeric(row.passing_epa) + numeric(row.rushing_epa)
    current.passingAttempts += attempts
    current.dropbacks += attempts + sacksSuffered
    current.carries += carries
    current.passingInterceptions += numeric(row.passing_interceptions)
    current.fumblesLost += numeric(row.fumbles_lost_total)
    current.defensiveInterceptions += numeric(row.def_interceptions)
    current.opponentFumbleRecoveries += numeric(row.fumble_recovery_opp)
    current.defensiveForcedFumbles += numeric(row.def_fumbles_forced)
    current.sacksSuffered += sacksSuffered
    current.rushingEpa += numeric(row.rushing_epa)
    current.defensiveSacks += numeric(row.def_sacks)
    current.defensiveQbHits += numeric(row.def_qb_hits)
    current.defensiveTacklesForLoss += numeric(row.def_tackles_for_loss)
    totals.set(team, current)
  }
  return [...totals.entries()].map(([team, total]) => ({
    team,
    ...total,
    offensiveEpaPerPlay: total.plays ? total.offensiveEpa / total.plays : 0,
    giveawaysPerGame: total.games
      ? (total.passingInterceptions + total.fumblesLost) / total.games
      : 0,
    interceptionRate: total.passingAttempts
      ? total.passingInterceptions / total.passingAttempts
      : 0,
    takeawaysPerGame: total.games
      ? (total.defensiveInterceptions + total.opponentFumbleRecoveries) / total.games
      : 0,
    sackRateAllowed: total.dropbacks ? total.sacksSuffered / total.dropbacks : 0,
    rushingEpaPerCarry: total.carries ? total.rushingEpa / total.carries : 0,
    disruptionPerGame: total.games
      ? (total.defensiveSacks + total.defensiveQbHits) / total.games
      : 0,
    tacklesForLossPerGame: total.games
      ? total.defensiveTacklesForLoss / total.games
      : 0,
  }))
}

function rankBy(
  performance: TeamPerformance[],
  team: TeamCode,
  value: (candidate: TeamPerformance) => number,
  direction: 'ascending' | 'descending',
): number {
  const ranked = [...performance].sort((left, right) => (
    direction === 'ascending' ? value(left) - value(right) : value(right) - value(left)
  ))
  return ranked.findIndex(candidate => candidate.team === team) + 1
}

export const nflverseTeamStatsProvider: ObservationProvider = {
  agentIds: ['epa', 'turnovers', 'trenches'],
  async collect(context): Promise<IngestionFeedResult> {
    const checkedAt = context.now.toISOString()
    const useCurrentSeason = context.week > 1
    const dataSeason = useCurrentSeason ? context.season : context.season - 1
    const file = `stats_team_week_${dataSeason}.csv`
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

    const performance = aggregateTeamPerformance(rows, dataSeason, useCurrentSeason ? context.week : undefined)
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
        const shared = {
          sample_games: teamPerformance.games,
          data_season: dataSeason,
          through_week: useCurrentSeason ? context.week - 1 : 'final',
        }
        observations.push(createObservation({
          gameId: game.game_id,
          agentId: 'epa',
          kind: 'measurement',
          subject: { type: 'team', id: team, label: team, team },
          metric: 'team.offensive_epa_per_play',
          value: {
            value: Number(teamPerformance.offensiveEpaPerPlay.toFixed(4)),
            rank: rankBy(performance, team, candidate => candidate.offensiveEpaPerPlay, 'descending'),
            league_size: performance.length,
            ...shared,
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
          providerRecordId: `${dataSeason}:${team}:${useCurrentSeason ? context.week - 1 : 'final'}:epa`,
        }))
        observations.push(createObservation({
          gameId: game.game_id,
          agentId: 'turnovers',
          kind: 'measurement',
          subject: { type: 'team', id: team, label: team, team },
          metric: 'team.turnover_profile',
          value: {
            giveaways_per_game: Number(teamPerformance.giveawaysPerGame.toFixed(3)),
            giveaway_rank: rankBy(performance, team, candidate => candidate.giveawaysPerGame, 'ascending'),
            interception_rate: Number(teamPerformance.interceptionRate.toFixed(4)),
            fumbles_lost: teamPerformance.fumblesLost,
            takeaways_per_game: Number(teamPerformance.takeawaysPerGame.toFixed(3)),
            takeaway_rank: rankBy(performance, team, candidate => candidate.takeawaysPerGame, 'descending'),
            forced_fumbles_per_game: Number((teamPerformance.defensiveForcedFumbles / teamPerformance.games).toFixed(3)),
            league_size: performance.length,
            ...shared,
          },
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
          providerRecordId: `${dataSeason}:${team}:${useCurrentSeason ? context.week - 1 : 'final'}:turnovers`,
        }))
        observations.push(createObservation({
          gameId: game.game_id,
          agentId: 'trenches',
          kind: 'measurement',
          subject: { type: 'team', id: team, label: team, team },
          metric: 'team.trenches_proxy',
          value: {
            sack_rate_allowed: Number(teamPerformance.sackRateAllowed.toFixed(4)),
            pass_protection_rank: rankBy(performance, team, candidate => candidate.sackRateAllowed, 'ascending'),
            rushing_epa_per_carry: Number(teamPerformance.rushingEpaPerCarry.toFixed(4)),
            rushing_efficiency_rank: rankBy(performance, team, candidate => candidate.rushingEpaPerCarry, 'descending'),
            defensive_disruptions_per_game: Number(teamPerformance.disruptionPerGame.toFixed(3)),
            front_disruption_rank: rankBy(performance, team, candidate => candidate.disruptionPerGame, 'descending'),
            tackles_for_loss_per_game: Number(teamPerformance.tacklesForLossPerGame.toFixed(3)),
            run_disruption_rank: rankBy(performance, team, candidate => candidate.tacklesForLossPerGame, 'descending'),
            proxy: true,
            league_size: performance.length,
            ...shared,
          },
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
          providerRecordId: `${dataSeason}:${team}:${useCurrentSeason ? context.week - 1 : 'final'}:trenches`,
        }))
        gameCounts.set(game.game_id, (gameCounts.get(game.game_id) ?? 0) + 3)
      }
    }

    const gameStates = Object.fromEntries(context.games.map(game => {
      const count = gameCounts.get(game.game_id) ?? 0
      return [game.game_id, availability({
        state: count === 6 ? 'available' : count ? 'degraded' : 'missing',
        checkedAt,
        count,
        ...(count !== 6 ? { message: 'A two-team performance baseline is incomplete' } : {}),
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
