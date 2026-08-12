import {
  ObservationSchema,
  RawImportSchema,
  type Observation,
  type ObservationAgentId,
  type RawImport,
} from '@/lib/data/contracts'
import { contentHash, stableId } from '@/lib/data/hash'

export function createRawImport(params: {
  provider: string
  feed: string
  sourceUrl: string
  fetchedAt: string
  payload: unknown
}): RawImport {
  const hash = contentHash(params.payload)
  return RawImportSchema.parse({
    raw_import_id: stableId('raw', {
      provider: params.provider,
      feed: params.feed,
      source_url: params.sourceUrl,
      content_hash: hash,
    }),
    provider: params.provider,
    feed: params.feed,
    source_url: params.sourceUrl,
    fetched_at: params.fetchedAt,
    content_hash: hash,
    payload: params.payload,
  })
}

export function createObservation(params: {
  gameId: string
  agentId: ObservationAgentId
  kind: Observation['kind']
  subject: Observation['subject']
  metric: string
  value: Observation['value']
  unit?: string
  source: Observation['source']
  observedAt: string
  effectiveAt: string
  expiresAt?: string
  importedAt: string
  rawImportId: string
  providerRecordId?: string
}): Observation {
  const identity = {
    game_id: params.gameId,
    agent_id: params.agentId,
    subject: params.subject,
    metric: params.metric,
    value: params.value,
    source: params.source,
    observed_at: params.observedAt,
    effective_at: params.effectiveAt,
    provider_record_id: params.providerRecordId,
  }
  return ObservationSchema.parse({
    observation_id: stableId('obs', identity),
    game_id: params.gameId,
    agent_id: params.agentId,
    kind: params.kind,
    subject: params.subject,
    metric: params.metric,
    value: params.value,
    unit: params.unit,
    source: params.source,
    observed_at: params.observedAt,
    effective_at: params.effectiveAt,
    expires_at: params.expiresAt,
    imported_at: params.importedAt,
    raw_import_id: params.rawImportId,
    provider_record_id: params.providerRecordId,
    schema_version: 1,
  })
}
