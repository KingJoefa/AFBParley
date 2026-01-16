# Swantail Terminal Design

> **Status:** Approved
> **Date:** 2026-01-16
> **Replaces:** Current Next.js form-based builder + Render wrapper

---

## Product Overview

**Swantail Terminal** - A web-based CLI interface for sports betting analysis powered by specialized AI agents.

**Core loop:**
1. User selects or types a matchup
2. Agents scan their domains against matchup data
3. Only agents with statistically significant + betting-relevant findings surface alerts
4. User runs `build` for correlated longshot parlays or `bet [prop]` for ladder analysis

**Key differentiators:**
- Alert-driven (agents stay silent unless something's interesting)
- Skill MDs define each agent's expertise and voice
- Typed code defines thresholds (testable, not prompt-debugged)
- Single analyst LLM synthesizes all findings (cost-efficient, cross-referenced)
- Team color theming per matchup
- Hybrid data: automated feeds + manual overrides + web search fallback

**Not a form. Not a chatbot. A terminal with specialists hunting edges.**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     VERCEL (Next.js)                            │
│                                                                 │
│  FRONTEND                                                       │
│  └─ Terminal emulator (React)                                   │
│     └─ Team color theming                                       │
│     └─ Command parser                                           │
│     └─ Streaming output display                                 │
│     └─ Heartbeat events                                         │
│                                                                 │
│  API ROUTES                                                     │
│  ├─ POST /api/scan      → agents scan, return alerts (stream)   │
│  ├─ POST /api/build     → generate parlays from alerts (stream) │
│  ├─ POST /api/bet       → prop ladder analysis (stream)         │
│  ├─ GET  /api/matchups  → list games                            │
│  └─ GET  /api/theme     → team colors                           │
│                                                                 │
│  AGENT ENGINE (lib/)                                            │
│  ├─ skills/agents/*.md  → agent voice & metric definitions      │
│  ├─ agents/*/thresholds.ts → typed threshold logic (testable)   │
│  ├─ engine/filter.ts    → threshold checks → Finding[]          │
│  ├─ engine/confidence.ts → code-derived confidence              │
│  ├─ engine/search.ts    → web search fallback                   │
│  ├─ engine/analyst.ts   → LLM call (Finding[] → Alert[])        │
│  └─ engine/validate.ts  → validator chain                       │
│                                                                 │
│  DATA (JSON files, refreshed weekly)                            │
│  └─ data/{epa,pressure,projections,lines,weather}/*.json        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

External:
- OpenAI API (direct calls with streaming, JSON mode)
- Web search API (Tavily/Perplexity for fallback)
- Weather API (automated refresh)
```

**What gets deleted:**
- `my-parlaygpt/` folder (entire wrapper service)
- Render deployment
- All WRAPPER_* env vars
- Inter-service auth logic

---

## Agents

| Agent | Domain | Key Metrics |
|-------|--------|-------------|
| EPA | Expected Points Added | receiving_epa, rushing_epa, red_zone_epa |
| Pressure | Pass rush & protection | pressure_rate, pass_block_win_rate, sack_rate |
| Weather | Environmental factors | temperature, wind, precipitation |
| QB | Quarterback analysis | completion_rate, yards_per_attempt, passer_rating |
| HB | Halfback/RB analysis | rush_yards, yards_after_contact, target_share |
| WR | Wide receiver analysis | target_share, separation, contested_catch_rate |
| TE | Tight end analysis | route_participation, red_zone_targets |

---

## Data Pipeline

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  AUTOMATED  │  │   MANUAL    │  │  WEB SEARCH │
│             │  │             │  │  (fallback) │
│ -FantasyPros│  │ -Your angles│  │             │
│ -Weather API│  │ -Injury intel│ │ -Triggered  │
│ -Lines feeds│  │ -Prop values│  │  when stale │
│ -EPA sources│  │ -Overrides  │  │  or missing │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        ▼
            ┌───────────────────────┐
            │   MATCHUP CONTEXT DB  │
            │   (weekly refresh)    │
            └───────────────────────┘
```

### Web Search Guardrails

```typescript
const SEARCH_CONFIG = {
  enabled: true,                    // kill-switch
  budgetPerMatchup: 5,              // max searches per scan
  budgetPerAgent: 2,                // max per agent per scan
  cacheTTL: 3600 * 4,               // 4 hours
  noiseThreshold: 0.3,              // if confidence < 0.3, don't use
}
```

---

## Contract Layer

### Finding (Pre-LLM, Deterministic)

```typescript
interface Finding {
  id: string                        // "epa-jsn-recv-001"
  agent: AgentType
  type: string                      // "receiving_epa_mismatch"
  stat: string
  value_num?: number
  value_str?: string
  value_type: "numeric" | "string"
  threshold_met: string             // "rank <= 10"
  comparison_context: string        // "3rd in league"
  source_ref: string                // normalized path or URL
  source_type: "local" | "web"
  source_timestamp: number
  quote_snippet?: string            // if web
}
```

### LLM Output (Keyed by Finding ID)

```typescript
// LLM outputs keyed map - cannot relabel id/agent
const LLMOutputSchema = z.record(
  z.string(),  // finding_id
  z.object({
    severity: z.enum(["high", "medium"]),
    claim_parts: ClaimPartsSchema,
    implications: z.array(z.string()),
    suppressions: z.array(z.string()),
  }).strict()
)
```

### ClaimParts (Structured, No Free Text)

```typescript
const ClaimPartsSchema = z.object({
  metrics: z.array(z.enum([
    "receiving_epa", "rushing_epa", "pass_block_win_rate",
    "pressure_rate", "target_share", "snap_count",
    "red_zone_epa", "epa_allowed", "completion_rate",
    "yards_per_attempt", "sack_rate",
  ])).min(1),
  direction: z.enum(["positive", "negative", "neutral"]),
  comparator: z.enum(["ranks", "exceeds", "trails", "matches", "diverges_from"]),
  rank_or_percentile: z.object({
    type: z.enum(["rank", "percentile"]),
    value: z.number(),
    scope: z.enum(["league", "position", "conference", "division"]),
    direction: z.enum(["top", "bottom"]),
  }).optional(),
  comparison_target: z.enum([
    "league_average", "opponent_average", "position_average",
    "season_baseline", "historical_self"
  ]).optional(),
  context_qualifier: z.enum([
    "in_division", "at_home", "as_underdog", "in_primetime",
    "vs_top_10_defense", "with_current_qb"
  ]).optional(),
}).strict()
```

### Alert (Final Output)

```typescript
interface Alert {
  // FROM CODE (immutable)
  id: string
  agent: AgentType
  evidence: (Evidence | LineEvidence)[]
  sources: Source[]
  confidence: number                // code-derived
  freshness: "live" | "weekly" | "stale"

  // FROM LLM (constrained)
  severity: "high" | "medium"
  claim: string                     // rendered from claim_parts
  implications: string[]            // validated against allowlist
  suppressions: string[]
}
```

### Evidence Types

```typescript
interface Evidence {
  stat: string
  value_num?: number
  value_str?: string
  value_type: "numeric" | "string"
  comparison: string
  source_type: "local" | "web"
  source_ref: string
  quote_snippet?: string
}

interface LineEvidence extends Evidence {
  line_type: "spread" | "total" | "prop" | "moneyline"
  line_value: number
  line_odds: number
  book: string
  line_timestamp: number
  line_ttl: number
}
```

### Line Freshness TTL

```typescript
const LINE_TTL = {
  spread: 30 * 60 * 1000,      // 30 min
  total: 30 * 60 * 1000,       // 30 min
  prop: 15 * 60 * 1000,        // 15 min (more volatile)
  moneyline: 60 * 60 * 1000,   // 1 hr
}
```

---

## Confidence Calculation (Code-Derived)

```typescript
function calculateConfidence(inputs: ConfidenceInputs): number {
  let score = 0.5  // baseline

  // Evidence quantity
  if (inputs.evidenceCount >= 3) score += 0.15
  else if (inputs.evidenceCount >= 2) score += 0.08

  // Source quality
  if (inputs.hasLocalSource) score += 0.10
  if (inputs.hasWebSource && inputs.webSourceAge < 4 * 3600 * 1000) {
    score += 0.08
  }

  // Sample size
  if (inputs.sampleSize !== null) {
    if (inputs.sampleSize >= 100) score += 0.12
    else if (inputs.sampleSize >= 50) score += 0.06
    else score -= 0.10
  }

  // Line freshness
  if (inputs.hasLineEvidence) {
    if (inputs.lineAge < 30 * 60 * 1000) score += 0.10
    else if (inputs.lineAge < 2 * 3600 * 1000) score += 0.05
    else score -= 0.15
  }

  // Data freshness
  if (inputs.localDataAge > 7 * 24 * 3600 * 1000) score -= 0.20

  return Math.max(0, Math.min(1, score))
}
```

---

## Implications Allowlist

```typescript
const AGENT_IMPLICATIONS: Record<AgentType, string[]> = {
  epa: [
    "wr_receptions_over", "wr_receptions_under",
    "wr_yards_over", "wr_yards_under",
    "rb_yards_over", "rb_yards_under",
    "team_total_over", "team_total_under",
  ],
  pressure: [
    "qb_sacks_over", "qb_sacks_under",
    "qb_ints_over", "qb_pass_yards_under",
    "def_sacks_over",
  ],
  weather: [
    "game_total_under", "pass_yards_under", "field_goals_over",
  ],
  qb: [
    "qb_pass_yards_over", "qb_pass_yards_under",
    "qb_pass_tds_over", "qb_pass_tds_under",
    "qb_completions_over", "qb_completions_under",
    "qb_ints_over",
  ],
  hb: [
    "rb_rush_yards_over", "rb_rush_yards_under",
    "rb_receptions_over", "rb_rush_attempts_over",
    "rb_tds_over",
  ],
  wr: [
    "wr_receptions_over", "wr_receptions_under",
    "wr_yards_over", "wr_yards_under",
    "wr_tds_over", "wr_longest_reception_over",
  ],
  te: [
    "te_receptions_over", "te_receptions_under",
    "te_yards_over", "te_yards_under",
    "te_tds_over",
  ],
}
```

---

## Validator Chain

All validators must pass before Alert is returned:

1. **Zod .strict()** - no extra fields anywhere
2. **ID/Agent match** - must equal Finding values
3. **Confidence immutable** - must equal code-derived value
4. **Source integrity** - no orphan sources, all evidence refs have sources
5. **LineEvidence freshness** - within TTL per line type
6. **ClaimParts structured** - must parse against schema
7. **Implications allowlist** - must be in agent + finding allowlist
8. **No edge language without line** - blocks "edge", "value", "mispriced" without LineEvidence

---

## Reproducibility

Every response includes provenance:

```typescript
interface Provenance {
  request_id: string
  prompt_hash: string
  skill_md_hashes: Record<AgentType, string>
  findings_hash: string
  data_version: string
  data_timestamp: number
  search_timestamps: number[]
  agents_invoked: AgentType[]
  agents_silent: AgentType[]
  cache_hits: number
  cache_misses: number
  llm_model: string
  llm_temperature: number  // should be 0
}
```

---

## Operational Guardrails

```typescript
const REQUEST_LIMITS = {
  maxInputTokens: 8000,
  maxOutputTokens: 2000,
  maxCostPerRequest: 0.15,
  timeoutMs: 45000,
}

const STREAM_CONFIG = {
  heartbeatIntervalMs: 3000,
  heartbeatPayload: { type: "heartbeat", status: "processing" },
}
```

### Fallback Renderer (No LLM)

If analyst LLM fails, terminal displays raw findings:

```
⚠️  Analyst offline. Raw findings:

   [epa] receiving_epa_rank: 3 (top 5 in league)
         → local://data/epa/week-20.json

   [pressure] pressure_rate: 42% (top 3 in league)
              → local://data/pressure/week-20.json

   Type "retry" or "build --raw" to continue.
```

---

## Terminal UI

### Commands

| Command | Action |
|---------|--------|
| `[matchup]` | Select game, trigger agent scan |
| `build` | Generate correlated parlay scripts from alerts |
| `bet [prop]` | Generate prop ladder with agent commentary |
| `help` | Show available commands |
| `theme [team]` | Switch color theme |
| `retry` | Re-run last command |

### Example Flow

```
~/swantail terminal                                    Opus 4.5
─────────────────────────────────────────────────────────────────
initializing agents...
├─ weather    ready
├─ pressure   ready
├─ epa        ready
├─ qb         ready
├─ hb         ready
├─ wr         ready
└─ te         ready

∴ 49ers @ seahawks

🔍 Scanning agents...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚨 EPA Agent
   Receiving EPA + Target Share ranks top 5 in league vs opponent average
   → JSN receptions/yards worth investigating

🚨 Pressure Agent
   Pressure Rate ranks top 3 in league
   → SF sacks, Darnold INTs correlate

⏸ Weather Agent — nothing notable
⏸ HB Agent — nothing notable
⏸ TE Agent — nothing notable

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2 alerts. type "build" or "bet jsn receptions"

∴ build

┌─────────────────────────────────────────────────────────────────┐
│  SCRIPT 1: "Seattle Collapses Under Pressure"                  │
│                                                                 │
│  ├─ Darnold Under 224.5 pass yds                               │
│  ├─ JSN Over 6.5 receptions                                    │
│  └─ SF Over 2.5 sacks                                          │
│                                                                 │
│  Correlation: Pressure forces quick throws → JSN volume,       │
│  but capped yardage. Sacks compound.                           │
│                                                                 │
│  $1 → $14.80 (illustrative)                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Team Color Theming

Load team colors dynamically per matchup:
- Primary: #AA0000 (49ers red) or #002244 (Seahawks navy)
- Accent: #B3995D (49ers gold) or #69BE28 (Seahawks green)
- User can toggle home/away theme

---

## What LLM Controls vs Code Controls

| LLM Controls | Code Controls |
|--------------|---------------|
| severity | id |
| claim_parts (structured) | agent |
| implications (allowlist) | evidence |
| suppressions | sources |
| | confidence |
| | freshness |
| | line validation |
| | all hashes |

---

## Migration Path

1. **Delete wrapper** - Remove `my-parlaygpt/`, Render deployment, WRAPPER_* env vars
2. **Build terminal UI** - React terminal emulator with command parser
3. **Build agent engine** - Threshold code + skill MDs + analyst LLM
4. **Build validators** - Zod schemas + custom validation chain
5. **Wire data pipeline** - Local JSON + web search fallback
6. **Add team theming** - Extend `lib/nfl/teams.ts` with hex colors

---

## Open Questions (For Implementation)

1. Which web search API? (Tavily vs Perplexity vs raw Google)
2. Terminal library? (xterm.js vs custom React)
3. Streaming format? (SSE vs WebSocket)
4. Data refresh automation? (cron vs manual trigger)
