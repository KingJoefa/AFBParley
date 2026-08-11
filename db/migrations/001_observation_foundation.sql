create table if not exists schema_migrations (
  migration_id text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists ingestion_runs (
  run_id text primary key,
  season integer,
  week integer,
  status text not null check (status in ('completed', 'failed')),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  summary jsonb,
  error text
);

create table if not exists raw_imports (
  raw_import_id text primary key,
  provider text not null,
  feed text not null,
  source_url text not null,
  fetched_at timestamptz not null,
  content_hash text not null,
  payload jsonb not null
);

create table if not exists ingestion_run_imports (
  run_id text not null references ingestion_runs(run_id) on delete cascade,
  raw_import_id text not null references raw_imports(raw_import_id),
  primary key (run_id, raw_import_id)
);

create table if not exists observations (
  observation_id text primary key,
  game_id text not null,
  agent_id text not null,
  metric text not null,
  observed_at timestamptz not null,
  effective_at timestamptz not null,
  expires_at timestamptz,
  raw_import_id text not null references raw_imports(raw_import_id),
  payload jsonb not null
);

create index if not exists observations_game_agent_time_idx
  on observations (game_id, agent_id, observed_at desc);

create table if not exists game_snapshots (
  snapshot_id text primary key,
  game_id text not null,
  captured_at timestamptz not null,
  contract_version text not null,
  content_hash text not null,
  payload jsonb not null
);

create index if not exists game_snapshots_latest_idx
  on game_snapshots (game_id, captured_at desc);

create table if not exists snapshot_observations (
  snapshot_id text not null references game_snapshots(snapshot_id) on delete cascade,
  observation_id text not null references observations(observation_id),
  primary key (snapshot_id, observation_id)
);

create table if not exists scenarios (
  scenario_revision_id text primary key,
  scenario_id text not null,
  game_id text not null,
  snapshot_id text not null,
  contract_version text not null,
  resolved_at timestamptz not null,
  input_hash text not null,
  payload jsonb not null
);

create index if not exists scenarios_lineage_idx
  on scenarios (scenario_id, resolved_at desc);

create table if not exists scripts (
  script_id text primary key,
  scenario_revision_id text not null references scenarios(scenario_revision_id),
  parent_script_id text references scripts(script_id),
  contract_version text not null,
  created_at timestamptz not null,
  input_hash text not null,
  generation text not null,
  model_id text not null,
  payload jsonb not null,
  evaluation jsonb not null
);

create index if not exists scripts_scenario_idx
  on scripts (scenario_revision_id, created_at desc);
