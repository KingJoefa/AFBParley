# Swantail Terminal • NFL Parlay Builder

Agent-driven NFL parlay analysis terminal. Runs threshold-based agents to identify edges, then surfaces correlated betting opportunities through three distinct modes.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Swantail Terminal UI                                   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                   │
│  │  PROP   │ │  STORY  │ │ PARLAY  │  ← Action Buttons │
│  └────┬────┘ └────┬────┘ └────┬────┘                   │
└───────┼──────────┼──────────┼──────────────────────────┘
        │          │          │
        ▼          ▼          ▼
┌─────────────────────────────────────────────────────────┐
│  /api/terminal/{prop,story,parlay}                      │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Agent Runner                                    │   │
│  │  EPA | Pressure | Weather | QB | HB | WR | TE   │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│                         ▼                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Analyst (LLM + Fallback)                       │   │
│  │  Finding[] → Alert[]                            │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│                         ▼                               │
│              Unified Alert[] Response                   │
└─────────────────────────────────────────────────────────┘
```

## Terminal Modes

| Mode | Endpoint | Purpose | Output |
|------|----------|---------|--------|
| **PROP** | `/api/terminal/prop` | Find mispriced player tails | `Alert[]` - standalone selections |
| **STORY** | `/api/terminal/story` | Build single-game narratives | `Alert[]` + correlated leg scripts |
| **PARLAY** | `/api/terminal/parlay` | Cross-game portfolio | `Alert[]` + risk-tiered scripts |

All modes return a unified `Alert[]` contract so the UI never branches on action type.

## Agents

Seven threshold-based agents scan matchup context:

- **EPA** - Expected points added efficiency mismatches
- **Pressure** - Pass rush and protection edges
- **Weather** - Wind/precipitation impact chains
- **QB** - Quarterback efficiency and matchup advantages
- **HB** - Halfback workload and game script correlations
- **WR** - Receiver target share and coverage exploits
- **TE** - Tight end red zone and usage patterns

Each agent returns `Finding[]` when thresholds are met, which the analyst transforms into actionable `Alert[]`.

## Requirements

- Node.js 18+
- Environment variables (see below)

## Quick Start

```bash
npm install
npm run dev
```

Visit `http://localhost:3000/terminal` for the Swantail Terminal.

## Environment Variables

```bash
# Required for LLM analysis (falls back to rule-based if missing)
OPENAI_API_KEY=sk-...

# Optional: Lines API for live odds
LINES_API_URL=https://...
LINES_API_KEY=...

# Optional: Feature flags (all enabled by default)
TERMINAL_PROP_ENABLED=true
TERMINAL_STORY_ENABLED=true
TERMINAL_PARLAY_ENABLED=true
TERMINAL_LIVE_DATA=false      # Use real data vs mock
TERMINAL_LLM_ANALYST=true     # Use LLM vs fallback
```

## API Reference

### Terminal Routes
- `POST /api/terminal/prop` - Player prop analysis
- `POST /api/terminal/story` - Single-game narrative builder
- `POST /api/terminal/parlay` - Cross-game portfolio constructor
- `POST /api/terminal/scan` - Raw agent scan (development)

### Supporting Routes
- `GET /api/nfl/schedule` - Current week schedule
- `GET /api/lines/status` - Lines source health check
- `POST /api/afb` - Legacy AFB script generator
- `GET/POST /api/memory` - Profile memory (dev only)

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

## License

MIT
