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
- `POST /api/terminal/scenario` accepts a current-week `game_id` and selected Game Agents.
- `POST /api/terminal/script` accepts a resolved scenario and compatible outcome anchors.
- The terminal has no free-text hypothesis, odds paste, output mode, future-week navigation, or parlay builder.

Game Agent output is currently labeled `scenario_assumptions`. It is causal scaffolding, not a claim that live weather, injuries, or team metrics have been verified. The script endpoint uses OpenAI when configured and a deterministic fallback otherwise.

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
NFL_SEASON=2026                   # Optional schedule override
NFL_WEEK=1                        # Optional schedule override
```

## Verification

```bash
npm run test:run
npm run type-check
npm run build
```

The active product contract is documented in [`docs/PRODUCT_CONTRACT.md`](docs/PRODUCT_CONTRACT.md). The data and product sequence is in [`docs/ROADMAP.md`](docs/ROADMAP.md).
