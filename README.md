# Swantail Terminal — Agent-First Script Builder

Terminal-first tool for discovering game insights, forming a clear game script, and generating a story-driven betting output. Agents surface evidence, anchors express the user thesis, and Build Script commits it all into one coherent payload.

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
│  Thesis + Evidence → Unified Script Output              │
└─────────────────────────────────────────────────────────┘
```

## Execution Flow

1. Matchup selection
2. Agent selection (scope only, session-persistent)
3. Scan (runs selected agents; logs evidence)
4. Anchors (user thesis; required)
5. Script Bias (optional modifier)
6. Build Script (commit action)

Build Script is disabled unless a scan has run, at least one anchor is selected, and the scan hash matches current flags + selected agents.

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

Each agent returns `Finding[]` when thresholds are met, which the analyst transforms into actionable `Alert[]`.

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

# Optional: Feature flags
TERMINAL_LIVE_DATA=false      # Use real data vs mock
TERMINAL_LLM_ANALYST=true     # Use LLM vs fallback
```

## API Reference

### Terminal Routes
- `POST /api/terminal/scan` - Run selected agents and return `Alert[]`
- `POST /api/terminal/build` - Build script output from anchors + evidence

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
