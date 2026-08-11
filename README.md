# Swantail

Swantail is a current-week football Game Script terminal. A user selects a matchup, toggles Game Agents that express the scenario they want to explore, confirms the resulting outcome anchors, and generates one causal story for how the game reaches that outcome.

Swantail does not validate a user's thesis or claim betting confidence. It turns a selected set of causal assumptions into a structured story with explicit conditions and failure modes. Converting that story into correlated markets belongs to the later Bet Station product.

## Product Flow

```text
Active-week matchup
  -> Game Agents (implicit hypothesis)
  -> Scenario assumptions
  -> Suggested and user-confirmed anchors
  -> Game Script
  -> Bet Station (deferred)
```

## Supported Surface

- `GET /api/nfl/schedule` returns only the operational week while the full released schedule remains backend reference data.
- `POST /api/terminal/scenario` accepts a current-week `game_id` and selected Game Agents, then reads the latest stored snapshot when configured.
- `POST /api/terminal/script` accepts a resolved scenario and compatible outcome anchors.
- `GET /api/cron/ingest` is the secured scheduled boundary for provider imports and immutable snapshots.
- The terminal has no free-text hypothesis, odds paste, output mode, future-week navigation, or parlay builder.

Game Agent output is labeled by evidence state. Without a stored snapshot it remains `scenario_assumptions`; with sourced data it can report observed context, support, conflict, stale data, or missing data. The script endpoint uses OpenAI when configured and a deterministic fallback otherwise.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

```bash
OPENAI_API_KEY=sk-...              # Optional; deterministic script fallback is built in
SWANTAIL_SCRIPT_MODEL=gpt-4o-mini # Optional model override
POSTGRES_URL=postgres://...        # Managed Postgres for snapshots and lineage
CRON_SECRET=...                    # Protects scheduled ingestion
SWANTAIL_NWS_USER_AGENT=...        # App identity and owner contact for NWS
NFL_SEASON=2026                   # Optional schedule override
NFL_WEEK=1                        # Optional schedule override
```

After attaching Postgres, apply the schema with `npm run db:migrate`. Until both Postgres and `CRON_SECRET` are configured, the daily cron exits successfully without ingesting data.

## Verification

```bash
npm run test:run
npm run type-check
npm run build
```

The active product contract is documented in [`docs/PRODUCT_CONTRACT.md`](docs/PRODUCT_CONTRACT.md). The data and product sequence is in [`docs/ROADMAP.md`](docs/ROADMAP.md).
Provider status, setup, and owner decisions are in [`docs/DATA_FOUNDATION.md`](docs/DATA_FOUNDATION.md).
The proposed initial market scope and responsible-gaming gate are in [`docs/BET_STATION_GUARDRAILS.md`](docs/BET_STATION_GUARDRAILS.md).
