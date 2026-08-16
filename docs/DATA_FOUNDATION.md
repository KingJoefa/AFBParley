# Data Foundation

## Current Provider Scope

The code supports a transparent pilot without treating public research feeds as a commercial license:

| Domain | Current source | Quality label | Production status |
| --- | --- | --- | --- |
| Schedule | Versioned 2026 season file | Internal bootstrap | Replace or reconcile with licensed feed |
| Weather | National Weather Service hourly API | Official | Suitable for US venues; global fallback still required |
| Injuries | nflverse release data | Research | Pilot only; licensed game-day feed required |
| Team performance | nflverse weekly team statistics | Research | Powers Efficiency, Turnovers, and a transparent Trenches proxy for research/backtesting |
| Rest/Travel | Full-season schedule plus venue geography | Internal derived | Turnaround, schedule spot, road sequence, and travel context available now |
| Odds | None | Not configured | Required for Bet Station |

The nflverse adapters retain its terms URL on every observation. They should not be promoted to the contractual production source without an explicit licensing review.

## Owner Decision

For a public 2026 regular-season product, choose one licensed football provider that covers schedules, rosters, injuries, depth charts, and team statistics. Evaluate SportsDataIO and Sportradar against these requirements:

- commercial display and redistribution rights;
- injury and inactive update timing;
- historical access and replay support;
- source IDs that remain stable across corrections;
- rate limits at Monday, Friday, and game-day cadence;
- odds coverage or compatibility with a separate odds provider;
- monthly cost through the regular season and playoffs.

SportsDataIO's self-serve Discovery Lab is useful for development but is next-day delayed and not licensed for commercial redistribution. A season product therefore needs a commercial agreement or an equivalent licensed provider, not merely the $99-$149 hobby tier.

Initial production scope should remain narrow: schedule, rosters, injuries/inactives, weather, team efficiency, turnover profiles, line/front metrics, spreads, and totals. Player props and live play-by-play should not be part of the first agreement unless the price difference is negligible.

The current Trenches finding is explicitly a result-based proxy built from sack rate allowed, rushing EPA, defensive sacks/QB hits, and tackles for loss. Do not market it as an assignment-level blocking grade. Production-grade Trenches analysis requires licensed pressure, blocking, lineup-continuity, and run-front data.

## Storage Contract

`db/migrations/001_observation_foundation.sql` creates:

- ingestion runs and raw provider imports;
- normalized observations with provenance and expiry;
- immutable game snapshots and their observation membership;
- snapshot-bound scenario revisions;
- scripts with lineage and stored evaluations.

Run the migration only after attaching a managed Postgres database:

```bash
POSTGRES_URL=postgres://... npm run db:migrate
```

## Scheduled Ingestion

Vercel calls `GET /api/cron/ingest` daily at 10:00 UTC. The route returns a successful skipped state until both `CRON_SECRET` and a database URL are configured, so merging the foundation does not create a failing production job.

The daily schedule is only the bootstrap cadence. Before regular-season launch, increase refreshes around official injury reports and kickoff. That may require Vercel Pro or an external scheduler. Remote provider calls remain isolated to ingestion; user-facing scenario requests read the latest stored snapshot. Rest/Travel is the exception because it is deterministically derived from the local schedule and can be attached without a remote request.

Required production variables:

```bash
POSTGRES_URL=postgres://...
CRON_SECRET=long-random-secret
SWANTAIL_NWS_USER_AGENT=Swantail/1.0 (owner-contact@example.com)
```

## Bet Station Gate

Do not build a numerical recommendation layer until the owner has approved:

- spreads and totals as the initial market scope;
- supported books and jurisdiction;
- display language for model probability, market probability, and uncertainty;
- a frequent "no edge" outcome;
- responsible-gaming language, account requirements, and usage limits;
- timestamped quote retention and closing-line capture.

Only then should prediction, market quote, recommendation, settlement, calibration, and closing-line-value tables be added.
