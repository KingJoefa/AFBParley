# Swantail Roadmap

## Current Baseline

**Owner: Codex**

- One Next.js application and one dependency tree.
- Canonical NFL team, game, schedule, and active-week selection.
- One terminal path: matchup, Game Agents, scenario, anchors, Game Script.
- Script-only contract with model and deterministic generation.
- Provider-neutral observations, immutable game snapshots, and scenario/script lineage.
- Postgres migrations and a secured daily ingestion boundary.
- Official NWS weather, schedule-derived Rest/Travel, and research-grade nflverse Injury, Efficiency, Turnovers, and Trenches-proxy adapters.
- Ten game-level selectable Game Agents with specialist specifications, explicit data support, causal assumptions, failure modes, and anchor behavior.
- Position-market choices separated from Game Story selection through a versioned Bet Station handoff contract; Usage retained as internal allocation logic and Volatility retained as a derived script property.
- Old wrapper app, hard-coded 2025 context, manual odds fallback, mode APIs, betting schemas, and historical implementation plans removed.

## 1. Live Scenario Data

**Owner: Shared**

1. **Owner pending:** select the licensed production football/odds provider and refresh budget.
2. **Implemented:** provider-neutral observations with source, observed time, game ID, subject, value, freshness, and source quality.
3. **Implemented, configuration pending:** Postgres migration, immutable storage, last-valid carry-forward, and secured daily Vercel ingestion.
4. **Pilot implemented:** Weather, Injury, Efficiency, Turnovers, Trenches, and Rest/Travel can attach observations without changing the user-facing hypothesis flow.
5. **Implemented:** terminal output presents matchup-specific Agent Findings with material, contextual, balanced, and unavailable states plus source freshness.

**Release gate:** every displayed factual claim has source and freshness provenance, and provider failure preserves the last valid snapshot.

## 2. Directional Agents

**Owner: Codex**

1. **Implemented:** define one bounded specialist question, required input set, causal assumptions, failure modes, and pairings for each current Game Agent. See `docs/agents/README.md`.
2. Extend agent selection with optional subject and direction, such as home pass rush, away quarterback response, or game-level wind suppression.
3. Keep one-click defaults while allowing lightweight agent configuration.
4. **Implemented for data-backed agents:** generate anchors from resolved material findings rather than static agent identity.
5. Add contradiction handling when selected agents imply incompatible game shapes.
6. **Pilot data-backed:** Trenches, Turnovers, and Rest/Travel. **Assumption-only:** Momentum. Derive volatility from resolved mechanisms instead of exposing another selector.
7. Hold Scheme and Special Teams until their data, boundaries, and anchor needs are approved.

**Release gate:** a user can express the common one-sentence thesis patterns without a free-text hypothesis box.

## 3. Script Quality And Memory

**Owner: Codex**

1. **Foundation implemented:** fixture-based checks cover selected-agent representation, unsupported numeric facts, anchor validity, and useful failure conditions.
2. **Implemented except user ownership:** store scenarios and scripts by game, snapshot, contract version, and input hash.
3. Add agent-specific synthesis guidance and checks for causal specificity, cross-agent interaction, contradiction handling, and generic restatement.
4. Support script revisions by changing agents or anchors while retaining lineage.
5. Add shareable, read-only script views after authentication and privacy decisions.

**Release gate:** repeated inputs are reproducible, revisions are traceable, and model changes pass the evaluation suite.

## 4. Bet Station

**Owner: Shared**

1. **Drafted, owner approval pending:** spreads and totals only, supported books, jurisdictions, responsible-gaming requirements, and product language. See `docs/BET_STATION_GUARDRAILS.md`.
2. **Contract boundary implemented:** a Bet Station handoff preserves script, scenario revision, snapshot, game, and anchor lineage without adding markets to the Game Script.
3. Codex maps Game Script causal steps to currently available markets using fresh lines.
4. Rank candidate positions by story fit and dependency, not by fabricated expected value.
5. Add QB, RB, WR, and TE market-family filters only when the approved market scope reaches player outcomes; power them with internal Usage and role data.
6. Explain correlation, duplicated exposure, pricing time, and invalidation risk.
7. Keep pricing and market availability out of the Script Builder.

**Release gate:** every suggested market is currently available, time-stamped, attributable to a source, and linked to a specific causal step.

## 5. Operations

**Owner: Shared**

1. Add authentication, usage limits, error monitoring, model cost telemetry, and provider health dashboards.
2. Run Monday slate initialization and increasingly frequent refreshes toward kickoff.
3. Define degraded behavior for missing lines, late injury news, weather revisions, and postponed games.
4. Add production smoke tests for the active slate, scenario generation, and script generation.

**Release gate:** the Monday-to-game-day workflow is observable, recoverable, and does not depend on deployment filesystem state.
