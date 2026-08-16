import type { IngestionFeedResult, ObservationAgentId } from '@/lib/data/contracts'
import type { ScheduleGame } from '@/lib/nfl/schedule'

export type ProviderContext = {
  game: ScheduleGame
  now: Date
  fetch: typeof fetch
}

export type WeekProviderContext = {
  games: ScheduleGame[]
  season: number
  week: number
  now: Date
  fetch: typeof fetch
}

export type ObservationProvider = {
  agentIds: readonly ObservationAgentId[]
  collect(context: WeekProviderContext): Promise<IngestionFeedResult>
}
