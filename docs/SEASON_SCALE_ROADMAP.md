# Swantail Season-Scale Roadmap

This is the execution plan for moving Swantail from a single-week prototype to a season-wide product while reducing duplicate and legacy code.

## Ownership

- **Codex** owns repository analysis, implementation, migrations, automated tests, documentation, and deployment-readiness checks.
- **Project owner** owns credentials and secret rotation, provider and data-source contracts, product scope decisions, production approvals, and budget decisions.
- **Shared** tasks require Codex to prepare the change and evidence, followed by project-owner approval before production rollout.

## Execution Status (August 9, 2026)

- **Complete:** Milestone 0 repository security, dependency, test, typecheck, and CI baseline.
- **In progress:** Milestone 2 canonical team/game identity and multi-week schedule source are implemented; Scan and Build still need explicit `game_id` and `snapshot_id` request contracts.
- **Started:** Milestone 6 adapters now normalize legacy team codes on read; the remaining projections, lines, injuries, weather, and roster files still need relocation out of `my-parlaygpt/`.
- **Waiting on project owner:** Milestone 1 supported-route decisions and credential rotation; Milestone 3 provider, storage, freshness, and budget decisions.

## Milestone 0: Trustworthy Baseline

**Owner:** Codex, with project-owner secret rotation

1. Remove tracked environment backups and expand ignore rules.
2. Upgrade vulnerable production dependencies, including a framework-major update after compatibility verification.
3. Replace the accepted-failure test baseline with a normal zero-failure test gate.
4. Add and enforce a TypeScript check in CI.
5. Record any credentials that require project-owner rotation without exposing their values.

**Acceptance criteria**

- No environment or credential backup is tracked.
- Production dependency audit has no known high or critical issue with a non-breaking fix available.
- Tests and typecheck both pass locally and are mandatory in CI.

## Milestone 1: One Supported Product Surface

**Owner:** Shared

1. Declare `scan -> build story` as the primary supported workflow.
2. Add aggregate route-use telemetry for legacy terminal endpoints.
3. Decide whether prop, parlay, and bet are product modes or compatibility routes.
4. Remove dead client state, ignored inputs, duplicate agent state, and wrapper fallback code.
5. Publish a deprecation window before removing externally used routes.

**Acceptance criteria**

- One documented UI-to-API path exists for every supported user action.
- No UI control is silently ignored by the active build path.
- Deprecated routes are either measured compatibility adapters or deleted.

## Milestone 2: Canonical Game Identity

**Owner:** Codex

1. Introduce validated `Season`, `Week`, `Team`, `Game`, and `GameSnapshot` schemas.
2. Use stable `game_id` and `snapshot_id` values across schedule, scan, and build.
3. Consolidate team names, abbreviations, aliases, and matchup parsing in one module.
4. Carry season and week explicitly; remove calendar guessing from request execution.
5. Add fixture and contract tests for regular season, playoffs, neutral sites, and historical replay.

**Acceptance criteria**

- Any supported historical game is addressable without changing source code.
- The same snapshot and agent versions reproduce the same deterministic findings.
- No API route contains its own team-alias table.

## Milestone 3: Durable Data And Ingestion

**Owner:** Shared

1. Select and approve schedule, roster, stats, injuries, weather, and odds providers.
2. Store raw provider payloads and normalized game snapshots in Postgres/Supabase.
3. Import existing notes and fallback files into the canonical schema.
4. Replace server-start timers and deployment-filesystem writes with scheduled jobs.
5. Add freshness, provenance, idempotency, retry, and provider-health reporting.

**Acceptance criteria**

- Web requests read durable snapshots and never write deployment files.
- A failed provider refresh does not destroy the last known valid snapshot.
- Every normalized field has source and timestamp provenance.

## Milestone 4: Stored Scans And Efficient Builds

**Owner:** Codex

1. Cache deterministic findings by snapshot, selected agents, and agent version.
2. Store scan results server-side and return a `scan_id`.
3. Make Build accept `scan_id` plus anchors and preferences instead of browser-supplied findings.
4. Validate all API payloads with concrete schemas; remove `z.any()` contracts.
5. Add durable rate limits, cost budgets, and LLM outcome telemetry.

**Acceptance criteria**

- Repeated scans reuse deterministic work when inputs have not changed.
- Build cannot mutate or replace canonical findings supplied by Scan.
- LLM and odds costs can be attributed by game, week, and request.

## Milestone 5: Season-Wide Product Experience

**Owner:** Shared

1. Add season and week navigation with schedule search and game status.
2. Replace the featured-chip limit with a complete slate view.
3. Display snapshot freshness and source health before Scan.
4. Preserve a focused game workspace for agent selection, anchors, and builds.
5. Add responsive and accessibility coverage for full slates and historical navigation.

**Acceptance criteria**

- Users can navigate every game in a season without entering matchup text.
- Stale or incomplete data is visible before a paid or generated action.
- Mobile and desktop workflows remain usable for 16-game weeks.

## Milestone 6: Legacy Removal

**Owner:** Codex, with project-owner approval for externally visible removals

1. Relocate any still-used data out of `my-parlaygpt/`.
2. Remove the Express/Webpack application, wrapper auth, socket chat, and duplicate package tree.
3. Remove unused direct terminal routes, command parser, themes, memory SDK, and old context builder.
4. Archive historical implementation plans outside the active application surface.
5. Re-run dependency, import, test, typecheck, and production-build audits.

**Acceptance criteria**

- Active code has no import or filesystem reference to `my-parlaygpt/`.
- The repository contains one application runtime and one dependency tree.
- Historical documentation cannot be mistaken for current architecture.

## Project-Owner Decisions

These decisions should be made before Milestone 3 implementation is finalized:

1. Which data providers are licensed and budgeted for season-wide use?
2. Are prop and parlay separate products, or views of the story builder?
3. Should historical seasons be supported at launch, or only the current season?
4. What freshness requirements apply to schedules, injuries, weather, and odds?
5. What authentication, usage limits, and responsible-gaming controls are required for public launch?
