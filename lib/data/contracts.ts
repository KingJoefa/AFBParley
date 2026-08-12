import { z } from 'zod'
import { GameSchema } from '@/lib/nfl/game'

export const OBSERVATION_CONTRACT_VERSION = 'observation-v1'

export const ObservationAgentIdSchema = z.enum(['weather', 'injury', 'epa'])
export const ObservationKindSchema = z.enum(['forecast', 'report', 'measurement', 'venue'])
export const SourceQualitySchema = z.enum(['official', 'licensed', 'research', 'internal'])
export const SnapshotFeedStateSchema = z.enum([
  'available',
  'degraded',
  'missing',
  'not_configured',
])

export const ObservationSourceSchema = z.object({
  provider: z.string().min(1),
  feed: z.string().min(1),
  quality: SourceQualitySchema,
  source_url: z.string().url(),
  terms_url: z.string().url().optional(),
})

export const ObservationSubjectSchema = z.object({
  type: z.enum(['game', 'team', 'player', 'venue']),
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  team: z.string().min(2).optional(),
})

export const ObservationValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
  z.record(z.unknown()),
])

export const ObservationSchema = z.object({
  observation_id: z.string().min(1),
  game_id: z.string().min(1),
  agent_id: ObservationAgentIdSchema,
  kind: ObservationKindSchema,
  subject: ObservationSubjectSchema,
  metric: z.string().min(1),
  value: ObservationValueSchema,
  unit: z.string().min(1).optional(),
  source: ObservationSourceSchema,
  observed_at: z.string().datetime({ offset: true }),
  effective_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }).optional(),
  imported_at: z.string().datetime({ offset: true }),
  raw_import_id: z.string().min(1),
  provider_record_id: z.string().min(1).optional(),
  schema_version: z.literal(1),
})

export const SnapshotAvailabilitySchema = z.object({
  state: SnapshotFeedStateSchema,
  checked_at: z.string().datetime({ offset: true }),
  observation_count: z.number().int().nonnegative(),
  message: z.string().min(1).optional(),
})

export const GameSnapshotSchema = z.object({
  snapshot_id: z.string().min(1),
  game_id: z.string().min(1),
  captured_at: z.string().datetime({ offset: true }),
  contract_version: z.literal(OBSERVATION_CONTRACT_VERSION),
  game: GameSchema,
  observations: z.array(ObservationSchema),
  availability: z.object({
    weather: SnapshotAvailabilitySchema,
    injury: SnapshotAvailabilitySchema,
    epa: SnapshotAvailabilitySchema,
  }),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((snapshot, context) => {
  if (snapshot.game_id !== snapshot.game.game_id) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Snapshot game_id must match its game',
      path: ['game_id'],
    })
  }
  snapshot.observations.forEach((observation, index) => {
    if (observation.game_id !== snapshot.game_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Observation game_id must match its snapshot',
        path: ['observations', index, 'game_id'],
      })
    }
  })
})

export const RawImportSchema = z.object({
  raw_import_id: z.string().min(1),
  provider: z.string().min(1),
  feed: z.string().min(1),
  source_url: z.string().url(),
  fetched_at: z.string().datetime({ offset: true }),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  payload: z.unknown(),
})

export const IngestionFeedResultSchema = z.object({
  provider: z.string().min(1),
  feed: z.string().min(1),
  state: SnapshotFeedStateSchema,
  checked_at: z.string().datetime({ offset: true }),
  message: z.string().min(1).optional(),
  raw_imports: z.array(RawImportSchema),
  observations: z.array(ObservationSchema),
  game_states: z.record(SnapshotAvailabilitySchema),
})

export type ObservationAgentId = z.infer<typeof ObservationAgentIdSchema>
export type Observation = z.infer<typeof ObservationSchema>
export type SnapshotFeedState = z.infer<typeof SnapshotFeedStateSchema>
export type SnapshotAvailability = z.infer<typeof SnapshotAvailabilitySchema>
export type GameSnapshot = z.infer<typeof GameSnapshotSchema>
export type RawImport = z.infer<typeof RawImportSchema>
export type IngestionFeedResult = z.infer<typeof IngestionFeedResultSchema>
