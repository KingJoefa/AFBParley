# Swantail Terminal — Agent-First Script Builder

Terminal-first, agent-driven execution surface for discovering game insights, forming a clear game script, and generating a story-driven betting output. Agents surface evidence, anchors express the user thesis, and Build Script commits it all into one coherent payload. The product is anchored on a strict Scan → Build contract.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Swantail Terminal UI                                   │
│  Matchup → Agents → Scan → Anchors → Bias → Build        │
└─────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  /api/terminal/scan                                     │
│  Agent Runner → Analyst (Finding[] → Alert[])           │
└─────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  /api/terminal/build                                    │
│  Thesis + Evidence → Script View                         │
└─────────────────────────────────────────────────────────┘
```

## Execution Flow

1. Matchup selection
2. Agent selection (scope only, session-persistent)
3. Scan (runs selected agents; logs evidence)
4. Anchors (user thesis; required)
5. Script Bias (optional modifier)
6. Build Script (commit action)

Build Script is disabled unless a scan has run, at least one anchor is selected, and the scan hash matches the current inputs (matchup, anchors, script bias, signals, odds paste, selected agents).

## Agents

Agents surface evidence; they never define the story. Two categories:

**Prop Discovery Agents**
- **QB** - Quarterback efficiency and matchup advantages
- **HB** - Halfback workload and game script correlations
- **WR** - Receiver target share and coverage exploits
- **TE** - Tight end red zone and usage patterns

**Game Angle Agents**
- **EPA** - Expected points added efficiency mismatches
- **Pressure** - Pass rush and protection edges
- **Weather** - Wind/precipitation impact chains

Each agent returns `Finding[]` when thresholds are met, which the analyst transforms into actionable `Alert[]`. Alert[] is the only terminal contract between Scan and Build.

## Anchors (Required)

Anchors express user thesis and are required before Build Script:

- Totals: Over / Under (mutually exclusive)
- Side: Home win / Away win (mutually exclusive)
- Spread: Home cover / Away cover (mutually exclusive)

Multiple compatible anchors may be selected (e.g., Away win + Under).

## Script Bias (Optional)

Script bias shapes the narrative without selecting markets:

- Shootout
- Grind
- Pass-heavy
- Run-heavy

## Signals and Odds (Optional)

- Signals (aka angles) are free-form tags that modify the analysis and narrative.
- Odds paste allows optional leg context and correlations for script building.

## Requirements

- Node.js 18+
- Environment variables (see below)

## Quick Start

```bash
npm install
npm run dev
```

Visit `http://localhost:3000/` for the Swantail Terminal (root page).

## Environment Variables

```bash
# Required for LLM analysis (falls back to rule-based if missing)
OPENAI_API_KEY=sk-...

# Optional: Lines API for live odds
LINES_API_URL=https://...
LINES_API_KEY=...

# Optional: The Odds API for live sportsbook prop lines
THE_ODDS_API_KEY=...  # Get from https://the-odds-api.com

# Optional: Feature flags
TERMINAL_PROP_ENABLED=true    # Enable /api/terminal/prop
TERMINAL_STORY_ENABLED=true   # Enable /api/terminal/story
TERMINAL_PARLAY_ENABLED=true  # Enable /api/terminal/parlay
TERMINAL_LIVE_DATA=false      # Use real data vs mock
TERMINAL_LLM_ANALYST=true     # Use LLM vs fallback
TERMINAL_AGENT_CARDS=true     # Render agent cards in UI
TERMINAL_SCRIPTS_METADATA=true # Add metadata in scripts view
```

## API Reference

### Terminal Routes
- `POST /api/terminal/scan` - Phase 1. Run selected agents and return `Alert[]` + `Finding[]`
- `POST /api/terminal/build` - Phase 2. Build script view from anchors + evidence
- `POST /api/terminal/prop` - Direct action route (prop mode)
- `POST /api/terminal/story` - Direct action route (story mode)
- `POST /api/terminal/parlay` - Direct action route (parlay mode)
- `POST /api/terminal/bet` - Betting ladder output

### Supporting Routes
- `GET /api/nfl/schedule` - Current week schedule
- `GET /api/lines/status` - Lines source health check
- `GET/POST /api/memory` - Profile memory (dev only)

## Scan → Build Contract (Essentials)

### Scan Request (Phase 1)
- Required: `matchup`
- Optional: `signals`, `anchor`, `agentIds`

### Scan Response (Phase 1)
- `alerts`: Alert[]
- `findings`: Finding[]
- `request_id`, `scan_hash`

### Build Request (Phase 2)
- Required: `matchup`, `alerts`, `findings`, `output_type`
- Optional: `anchors`, `anchor`, `script_bias`, `signals`, `odds_paste`, `selected_agents`, `payload_hash`, `options`

### Build Response (Phase 2)
- `view`: BuildView (terminal or swantail narrative output)
- `payload_hash` used for staleness validation

## Project Structure

```
app/
├── api/terminal/       # Terminal route handlers
├── hooks/              # useTerminal, useAfb
├── terminal/           # Terminal page
components/
├── SwantailTerminalPanel.tsx   # Main terminal UI
├── AssistedBuilder.tsx         # Builder orchestration
lib/
├── terminal/
│   ├── agents/         # EPA, Pressure, Weather, QB, HB, WR, TE
│   ├── analyst/        # Finding[] → Alert[] transformation
│   ├── engine/         # Agent runner, provenance
│   ├── schemas/        # Alert, Finding, Script types
│   ├── feature-flags.ts
│   └── run-state.ts    # Agent orchestration state
├── swantail/           # Store, signals, odds parsing
```

## Scripts

```bash
npm run dev      # Development server (3000)
npm run build    # Production build
npm run test     # Run test suite
npm start        # Production server
```

## Testing

```bash
npm test              # Run all tests
npm test -- --watch   # Watch mode
```

Tests cover:
- Terminal route contracts and invariants
- Agent threshold logic
- Analyst transformation
- Schema validation
- Provenance tracking

## Future / Legacy Context

- `/api/afb` is legacy AFB script generation and is not the primary product flow.
- README focuses on the Scan → Build terminal contract and current UI path.

## License

MIT
