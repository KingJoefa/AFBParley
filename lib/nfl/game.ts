import { z } from 'zod'
import { NFL_TEAM_CODES, type TeamCode } from '@/lib/nfl/teams'

export const SeasonSchema = z.number().int().min(2000).max(2100)
export const WeekSchema = z.number().int().min(1).max(25)
export const TeamCodeSchema = z.enum(NFL_TEAM_CODES as [TeamCode, ...TeamCode[]])
export const GameStatusSchema = z.enum(['scheduled', 'live', 'final', 'postponed', 'canceled'])
export const AvailabilitySchema = z.enum(['available', 'degraded', 'missing'])

export const GameSchema = z.object({
  game_id: z.string().regex(/^\d{4}-wk\d{2}-[A-Z]{2,3}-at-[A-Z]{2,3}$/),
  season: SeasonSchema,
  week: WeekSchema,
  round: z.string().min(1).optional(),
  away_team: TeamCodeSchema,
  home_team: TeamCodeSchema,
  kickoff: z.string().datetime({ offset: true }),
  neutral_site: z.boolean().default(false),
  status: GameStatusSchema.default('scheduled'),
  venue: z.string().min(1).optional(),
  display: z.string().min(1),
}).refine(game => game.away_team !== game.home_team, {
  message: 'A game must contain two different teams',
  path: ['home_team'],
})

export const SnapshotProvenanceSchema = z.object({
  source: z.string().min(1),
  observed_at: z.string().datetime({ offset: true }),
  source_version: z.string().min(1).optional(),
})

export const GameSnapshotSchema = z.object({
  snapshot_id: z.string().min(1),
  game_id: z.string().min(1),
  captured_at: z.string().datetime({ offset: true }),
  data_version: z.string().min(1),
  game: GameSchema,
  availability: z.object({
    schedule: AvailabilitySchema,
    odds: AvailabilitySchema,
    injuries: AvailabilitySchema,
    projections: AvailabilitySchema,
    notes: AvailabilitySchema,
  }),
  provenance: z.array(SnapshotProvenanceSchema).min(1),
}).refine(snapshot => snapshot.game_id === snapshot.game.game_id, {
  message: 'Snapshot game_id must match its game',
  path: ['game_id'],
})

export type Game = z.infer<typeof GameSchema>
export type GameSnapshot = z.infer<typeof GameSnapshotSchema>

export function createGameId(params: {
  season: number
  week: number
  awayTeam: TeamCode
  homeTeam: TeamCode
}): string {
  const week = String(params.week).padStart(2, '0')
  return `${params.season}-wk${week}-${params.awayTeam}-at-${params.homeTeam}`
}

export function createSnapshotId(gameId: string, dataVersion: string): string {
  return `${gameId}:${dataVersion}`
}
