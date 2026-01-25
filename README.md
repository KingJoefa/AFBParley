# Swantail Terminal 2.0

Swantail Terminal 2.0 is an agent-driven parlay builder where users run specialized Agents (including Factors) to discover game-specific findings, then choose Build Preferences and an outcome framing (e.g., Team A wins under) to generate scripts; the Build step interprets the selected outcome by emphasizing the most relevant agent findings, while suggestions are explainable and non-binding, and optional Advanced User Insight can be provided as supplemental context.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Swantail Terminal UI                                       │
│  Matchup → Select Agents → Run Agents → Anchors → Build     │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  /api/terminal/scan                                         │
│  Agent Runner → Analyst (Finding[] → Alert[])               │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  /api/terminal/build                                        │
│  Outcome Framing + Agent Findings → Script View             │
└─────────────────────────────────────────────────────────────┘
```

## Core Concepts

### Agents
Agents are the primary discovery mechanism. They run code, analyze data, and produce findings. Users select which agents to run; findings are the source of truth.

**Prop Discovery Agents**
- **QB** — Quarterback efficiency and matchup advantages
- **HB** — Halfback workload and game script correlations
- **WR** — Receiver target share and coverage exploits
- **TE** — Tight end red zone and usage patterns

**Factors** (Game-Level Agents)
- **EPA** — Expected points added efficiency mismatches
- **Pressure** — Pass rush and protection edges
- **Weather** — Wind/precipitation impact chains

Each agent returns `Finding[]` when thresholds are met. The analyst transforms these into actionable `Alert[]`.

### Anchors (Required)
Anchors express the user's outcome framing and are required before Build Scripts:

- Totals: Over / Under (mutually exclusive)
- Side: Home win / Away win (mutually exclusive)
- Spread: Home cover / Away cover (mutually exclusive)

Multiple compatible anchors may be selected (e.g., Away win + Under).

### Build Preferences (Optional)
Build Preferences shape the narrative without selecting markets:

- Shootout
- Grind
- Pass-heavy
- Run-heavy

### User Insight (Advanced, Optional)
Free-text input for power users to inject external context ("I heard X..."). This does not unlock agents or trigger special logic—it's passed to the LLM as supplemental context only.

## Execution Flow

1. **Matchup Selection** — Pick the game
2. **Agent Selection** — Choose which agents to run (session-persistent)
3. **Run Agents** — Execute selected agents; produces findings
4. **Anchors** — Select outcome framing (required)
5. **Build Preferences** — Optional narrative modifier
6. **Build Scripts** — Generate outcome-conditioned script

Build Scripts is disabled unless agents have run, at least one anchor is selected, and the inputs match the current state.

## Outcome-Conditioned Build (Key Behavior)

When a user selects a Build like "Team A wins under", the system:

1. Treats the selection as a hypothesis, not a label
2. Re-ranks and emphasizes agent findings that best support that outcome
3. Expresses *how* that outcome happens (run-heavy, stalled red zone, FG volume, clock bleed)
4. Never invents facts or overrides agent outputs

**Rule:** Build may reweight, emphasize, and suppress findings—but may not fabricate or contradict agents.

## Quick Start

```bash
npm install
npm run dev
```

Visit `http://localhost:3000/` for the Swantail Terminal.

## Environment Variables

### Required

```bash
OPENAI_API_KEY=sk-...           # LLM analysis (falls back to rule-based if missing)
THE_ODDS_API_KEY=...            # Live sportsbook prop lines
```

### Optional

```bash
LINES_API_URL=https://...       # Game-level lines (spreads, totals)
LINES_API_KEY=...

# Feature flags
TERMINAL_PROP_ENABLED=true
TERMINAL_STORY_ENABLED=true
TERMINAL_PARLAY_ENABLED=true
TERMINAL_LIVE_DATA=false
TERMINAL_LLM_ANALYST=true
TERMINAL_AGENT_CARDS=true
TERMINAL_SCRIPTS_METADATA=true

# Logging
LOG_LEVEL=warn                  # debug/info/warn/error (default: warn in prod, debug in dev)
```

## API Reference

### Terminal Routes
- `POST /api/terminal/scan` — Run selected agents, return `Alert[]` + `Finding[]`
- `POST /api/terminal/build` — Build script from anchors + agent findings
- `POST /api/terminal/prop` — Direct prop mode
- `POST /api/terminal/story` — Direct story mode
- `POST /api/terminal/parlay` — Direct parlay mode

### Supporting Routes
- `GET /api/nfl/schedule` — Current week schedule
- `GET /api/lines/status` — Lines source health check

## Project Structure

```
app/
├── api/terminal/       # Terminal route handlers
├── page.tsx            # Root page (Terminal UI)
components/
├── SwantailTerminalPanel.tsx   # Main terminal UI
├── AssistedBuilder.tsx         # Builder orchestration
lib/
├── terminal/
│   ├── agents/         # EPA, Pressure, Weather, QB, HB, WR, TE
│   ├── analyst/        # Finding[] → Alert[] transformation
│   ├── engine/         # Agent runner, provenance
│   ├── schemas/        # Alert, Finding, Script types
│   └── feature-flags.ts
├── swantail/           # Store, user insight parsing, odds
├── logger.ts           # Production-safe logging
├── telemetry.ts        # Dev-only telemetry
```

## Scripts

```bash
npm run dev      # Development server (3000)
npm run build    # Production build
npm run test     # Run test suite
npm start        # Production server
```

## License

MIT
