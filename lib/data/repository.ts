import {
  GameSnapshotSchema,
  type GameSnapshot,
  type IngestionFeedResult,
} from '@/lib/data/contracts'
import { getDatabase, isDatabaseConfigured } from '@/lib/data/database'
import {
  GameScriptSchema,
  ScenarioResolutionSchema,
  ScriptEvaluationSchema,
  type GameScript,
  type ScenarioResolution,
  type ScriptEvaluation,
} from '@/lib/terminal/contracts'

type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue }

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

export type IngestionBundle = {
  runId: string
  season: number
  week: number
  startedAt: string
  completedAt: string
  feeds: IngestionFeedResult[]
  snapshots: GameSnapshot[]
}

function requireDatabase() {
  const sql = getDatabase()
  if (!sql) throw new Error('POSTGRES_URL or DATABASE_URL is not configured')
  return sql
}

export { isDatabaseConfigured }

export async function loadLatestGameSnapshot(gameId: string): Promise<GameSnapshot | null> {
  const sql = getDatabase()
  if (!sql) return null
  const rows = await sql<{ payload: unknown }[]>`
    select payload
    from game_snapshots
    where game_id = ${gameId}
    order by captured_at desc
    limit 1
  `
  return rows[0] ? GameSnapshotSchema.parse(rows[0].payload) : null
}

export async function persistIngestionBundle(bundle: IngestionBundle): Promise<void> {
  const sql = requireDatabase()
  await sql.begin(async transaction => {
    await transaction`
      insert into ingestion_runs (
        run_id, season, week, status, started_at, completed_at, summary
      ) values (
        ${bundle.runId}, ${bundle.season}, ${bundle.week}, 'completed',
        ${bundle.startedAt}, ${bundle.completedAt},
        ${transaction.json(jsonValue({
          feeds: bundle.feeds.map(feed => ({
            provider: feed.provider,
            feed: feed.feed,
            state: feed.state,
            observations: feed.observations.length,
            message: feed.message,
          })),
          snapshots: bundle.snapshots.length,
        }))}
      )
      on conflict (run_id) do nothing
    `

    for (const feed of bundle.feeds) {
      for (const rawImport of feed.raw_imports) {
        await transaction`
          insert into raw_imports (
            raw_import_id, provider, feed, source_url, fetched_at, content_hash, payload
          ) values (
            ${rawImport.raw_import_id}, ${rawImport.provider}, ${rawImport.feed},
            ${rawImport.source_url}, ${rawImport.fetched_at}, ${rawImport.content_hash},
            ${transaction.json(jsonValue(rawImport.payload))}
          )
          on conflict (raw_import_id) do nothing
        `
        await transaction`
          insert into ingestion_run_imports (run_id, raw_import_id)
          values (${bundle.runId}, ${rawImport.raw_import_id})
          on conflict do nothing
        `
      }
      for (const observation of feed.observations) {
        await transaction`
          insert into observations (
            observation_id, game_id, agent_id, metric, observed_at, effective_at,
            expires_at, raw_import_id, payload
          ) values (
            ${observation.observation_id}, ${observation.game_id}, ${observation.agent_id},
            ${observation.metric}, ${observation.observed_at}, ${observation.effective_at},
            ${observation.expires_at ?? null}, ${observation.raw_import_id},
            ${transaction.json(jsonValue(observation))}
          )
          on conflict (observation_id) do nothing
        `
      }
    }

    for (const snapshot of bundle.snapshots) {
      await transaction`
        insert into game_snapshots (
          snapshot_id, game_id, captured_at, contract_version, content_hash, payload
        ) values (
          ${snapshot.snapshot_id}, ${snapshot.game_id}, ${snapshot.captured_at},
          ${snapshot.contract_version}, ${snapshot.content_hash},
          ${transaction.json(jsonValue(snapshot))}
        )
        on conflict (snapshot_id) do nothing
      `
      for (const observation of snapshot.observations) {
        await transaction`
          insert into snapshot_observations (snapshot_id, observation_id)
          values (${snapshot.snapshot_id}, ${observation.observation_id})
          on conflict do nothing
        `
      }
    }
  })
}

export async function recordFailedIngestionRun(params: {
  runId: string
  season?: number
  week?: number
  startedAt: string
  failedAt: string
  error: string
}): Promise<void> {
  const sql = getDatabase()
  if (!sql) return
  await sql`
    insert into ingestion_runs (
      run_id, season, week, status, started_at, completed_at, error
    ) values (
      ${params.runId}, ${params.season ?? null}, ${params.week ?? null}, 'failed',
      ${params.startedAt}, ${params.failedAt}, ${params.error}
    )
    on conflict (run_id) do update set
      status = excluded.status,
      completed_at = excluded.completed_at,
      error = excluded.error
  `
}

export async function persistScenario(scenario: ScenarioResolution): Promise<'stored' | 'not_configured'> {
  const sql = getDatabase()
  if (!sql) return 'not_configured'
  await sql`
    insert into scenarios (
      scenario_revision_id, scenario_id, game_id, snapshot_id, contract_version,
      resolved_at, input_hash, payload
    ) values (
      ${scenario.scenario_revision_id}, ${scenario.scenario_id}, ${scenario.game.game_id},
      ${scenario.snapshot_id}, ${scenario.contract_version}, ${scenario.resolved_at},
      ${scenario.input_hash}, ${sql.json(jsonValue(scenario))}
    )
    on conflict (scenario_revision_id) do nothing
  `
  return 'stored'
}

export async function loadScenarioRevision(revisionId: string): Promise<ScenarioResolution | null> {
  const sql = getDatabase()
  if (!sql) return null
  const rows = await sql<{ payload: unknown }[]>`
    select payload
    from scenarios
    where scenario_revision_id = ${revisionId}
    limit 1
  `
  if (!rows[0]) return null
  const parsed = ScenarioResolutionSchema.safeParse(rows[0].payload)
  return parsed.success ? parsed.data : null
}

export async function persistScript(params: {
  script: GameScript
  evaluation: ScriptEvaluation
}): Promise<'stored' | 'not_configured'> {
  const sql = getDatabase()
  if (!sql) return 'not_configured'
  const script = GameScriptSchema.parse(params.script)
  const evaluation = ScriptEvaluationSchema.parse(params.evaluation)
  await sql`
    insert into scripts (
      script_id, scenario_revision_id, parent_script_id, contract_version,
      created_at, input_hash, generation, model_id, payload, evaluation
    ) values (
      ${script.script_id}, ${script.scenario_revision_id}, ${script.parent_script_id ?? null},
      ${script.contract_version}, ${script.created_at}, ${script.input_hash},
      ${script.generation}, ${script.model_id}, ${sql.json(jsonValue(script))},
      ${sql.json(jsonValue(evaluation))}
    )
    on conflict (script_id) do update set
      payload = excluded.payload,
      evaluation = excluded.evaluation,
      model_id = excluded.model_id
  `
  return 'stored'
}
