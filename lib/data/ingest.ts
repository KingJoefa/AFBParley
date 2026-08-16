import {
  GameSnapshotSchema,
  OBSERVATION_CONTRACT_VERSION,
  type GameSnapshot,
  type IngestionFeedResult,
  type ObservationAgentId,
  type SnapshotAvailability,
} from '@/lib/data/contracts'
import { contentHash, stableId } from '@/lib/data/hash'
import {
  isDatabaseConfigured,
  loadLatestGameSnapshot,
  persistIngestionBundle,
  recordFailedIngestionRun,
} from '@/lib/data/repository'
import { nflverseInjuryProvider, nflverseTeamStatsProvider } from '@/lib/data/providers/nflverse'
import { nwsWeatherProvider } from '@/lib/data/providers/nws'
import { scheduleRestProvider } from '@/lib/data/providers/rest'
import { GameSchema } from '@/lib/nfl/game'
import { loadOperationalSchedule } from '@/lib/nfl/schedule'

const PROVIDERS = [
  nwsWeatherProvider,
  nflverseInjuryProvider,
  nflverseTeamStatsProvider,
  scheduleRestProvider,
]

function carryForward(params: {
  agentId: ObservationAgentId
  current: IngestionFeedResult
  previous: GameSnapshot | null
  gameId: string
}): {
  observations: GameSnapshot['observations']
  availability: SnapshotAvailability
} {
  const observations = params.current.observations.filter(item => item.game_id === params.gameId)
  const currentAvailability = params.current.game_states[params.gameId]
  const availability = {
    ...currentAvailability,
    observation_count: observations.length,
  }
  if (observations.length || !params.previous || !['missing', 'degraded'].includes(availability.state)) {
    return { observations, availability }
  }
  const previous = params.previous.observations.filter(item => item.agent_id === params.agentId)
  if (!previous.length) return { observations, availability }
  return {
    observations: previous,
    availability: {
      state: 'degraded',
      checked_at: availability.checked_at,
      observation_count: previous.length,
      message: `Last valid ${params.agentId} observations retained; ${availability.message ?? 'refresh unavailable'}`,
    },
  }
}

export type IngestionSummary = {
  run_id: string
  season: number
  week: number
  snapshots: number
  observations: number
  feeds: Array<{
    provider: string
    feed: string
    state: string
    observations: number
    message?: string
  }>
}

export async function runActiveWeekIngestion(params: {
  now?: Date
  fetch?: typeof fetch
} = {}): Promise<IngestionSummary> {
  if (!isDatabaseConfigured()) {
    throw new Error('Durable ingestion requires POSTGRES_URL or DATABASE_URL')
  }
  const now = params.now ?? new Date()
  const startedAt = now.toISOString()
  const runId = stableId('run', { started_at: startedAt })
  let season: number | undefined
  let week: number | undefined

  try {
    const schedule = loadOperationalSchedule({ now })
    season = schedule.season
    week = schedule.week
    const context = {
      games: schedule.games,
      season,
      week,
      now,
      fetch: params.fetch ?? fetch,
    }
    const feeds = await Promise.all(PROVIDERS.map(provider => provider.collect(context)))
    const feedByAgent = new Map<ObservationAgentId, IngestionFeedResult>()
    PROVIDERS.forEach((provider, index) => {
      provider.agentIds.forEach(agentId => feedByAgent.set(agentId, feeds[index]))
    })
    const capturedAt = new Date().toISOString()
    const snapshots: GameSnapshot[] = []

    for (const scheduledGame of schedule.games) {
      const previous = await loadLatestGameSnapshot(scheduledGame.game_id)
      const weather = carryForward({
        agentId: 'weather', current: feedByAgent.get('weather')!, previous, gameId: scheduledGame.game_id,
      })
      const injury = carryForward({
        agentId: 'injury', current: feedByAgent.get('injury')!, previous, gameId: scheduledGame.game_id,
      })
      const epa = carryForward({
        agentId: 'epa', current: feedByAgent.get('epa')!, previous, gameId: scheduledGame.game_id,
      })
      const trenches = carryForward({
        agentId: 'trenches', current: feedByAgent.get('trenches')!, previous, gameId: scheduledGame.game_id,
      })
      const turnovers = carryForward({
        agentId: 'turnovers', current: feedByAgent.get('turnovers')!, previous, gameId: scheduledGame.game_id,
      })
      const rest = carryForward({
        agentId: 'rest', current: feedByAgent.get('rest')!, previous, gameId: scheduledGame.game_id,
      })
      const observations = [
        ...weather.observations,
        ...injury.observations,
        ...epa.observations,
        ...trenches.observations,
        ...turnovers.observations,
        ...rest.observations,
      ]
        .sort((left, right) => left.observation_id.localeCompare(right.observation_id))
      const game = GameSchema.parse(scheduledGame)
      const snapshotContent = {
        game,
        observations,
        availability: {
          weather: weather.availability,
          injury: injury.availability,
          epa: epa.availability,
          trenches: trenches.availability,
          turnovers: turnovers.availability,
          rest: rest.availability,
        },
      }
      const hash = contentHash(snapshotContent)
      snapshots.push(GameSnapshotSchema.parse({
        snapshot_id: stableId('snapshot', {
          game_id: game.game_id,
          captured_at: capturedAt,
          content_hash: hash,
        }),
        game_id: game.game_id,
        captured_at: capturedAt,
        contract_version: OBSERVATION_CONTRACT_VERSION,
        ...snapshotContent,
        content_hash: hash,
      }))
    }

    const completedAt = new Date().toISOString()
    await persistIngestionBundle({
      runId,
      season,
      week,
      startedAt,
      completedAt,
      feeds,
      snapshots,
    })
    return {
      run_id: runId,
      season,
      week,
      snapshots: snapshots.length,
      observations: snapshots.reduce((total, snapshot) => total + snapshot.observations.length, 0),
      feeds: feeds.map(feed => ({
        provider: feed.provider,
        feed: feed.feed,
        state: feed.state,
        observations: feed.observations.length,
        ...(feed.message ? { message: feed.message } : {}),
      })),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ingestion failure'
    await recordFailedIngestionRun({
      runId,
      season,
      week,
      startedAt,
      failedAt: new Date().toISOString(),
      error: message,
    })
    throw error
  }
}
