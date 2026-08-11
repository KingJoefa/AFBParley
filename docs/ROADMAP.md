# Swantail Roadmap

## Current Baseline

**Owner: Codex**

- One Next.js application and one dependency tree.
- Canonical NFL team, game, schedule, and active-week selection.
- One terminal path: matchup, Game Agents, scenario, anchors, Game Script.
- Script-only contract with model and deterministic generation.
- Old wrapper app, hard-coded 2025 context, manual odds fallback, mode APIs, betting schemas, and historical implementation plans removed.

## 1. Live Scenario Data

**Owner: Shared**

1. Project owner selects licensed schedule, injuries, weather, team metrics, roster, and odds providers with refresh budgets.
2. Codex defines provider-neutral observations with source, observed time, game ID, subject, value, and freshness.
3. Codex builds scheduled ingestion into durable Postgres storage; web requests remain read-only.
4. Game Agents attach verified observations to scenario events without changing the user-facing hypothesis flow.
5. Terminal output distinguishes assumption, observed support, conflicting observation, stale data, and missing data.

**Release gate:** every displayed factual claim has source and freshness provenance, and provider failure preserves the last valid snapshot.

## 2. Directional Agents

**Owner: Codex**

1. Extend agent selection with optional subject and direction, such as home pass rush, away receiver usage, or game-level wind suppression.
2. Keep one-click defaults while allowing lightweight agent configuration.
3. Generate anchors from resolved agent directions and explain why each was suggested.
4. Add contradiction handling when selected agents imply incompatible game shapes.

**Release gate:** a user can express the common one-sentence thesis patterns without a free-text hypothesis box.

## 3. Script Quality And Memory

**Owner: Codex**

1. Add fixture-based evaluations for causal coherence, unsupported facts, anchor consistency, and useful failure conditions.
2. Store scenarios and scripts by user, game, week, contract version, and input hash.
3. Support script revisions by changing agents or anchors while retaining lineage.
4. Add shareable, read-only script views after authentication and privacy decisions.

**Release gate:** repeated inputs are reproducible, revisions are traceable, and model changes pass the evaluation suite.

## 4. Bet Station

**Owner: Shared**

1. Project owner defines supported books, jurisdictions, responsible-gaming requirements, and product language.
2. Codex maps Game Script causal steps to currently available markets using fresh lines.
3. Rank candidate positions by story fit and dependency, not by fabricated expected value.
4. Explain correlation, duplicated exposure, pricing time, and invalidation risk.
5. Keep pricing and market availability out of the Script Builder.

**Release gate:** every suggested market is currently available, time-stamped, attributable to a source, and linked to a specific causal step.

## 5. Operations

**Owner: Shared**

1. Add authentication, usage limits, error monitoring, model cost telemetry, and provider health dashboards.
2. Run Monday slate initialization and increasingly frequent refreshes toward kickoff.
3. Define degraded behavior for missing lines, late injury news, weather revisions, and postponed games.
4. Add production smoke tests for the active slate, scenario generation, and script generation.

**Release gate:** the Monday-to-game-day workflow is observable, recoverable, and does not depend on deployment filesystem state.
