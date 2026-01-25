# Agents vs Signals: What Happens When You Click an Agent Button

## Key Distinction

**Agents** and **Signals** are **completely separate systems**:

- **Agents** = Backend analyzers that run statistical checks and produce `Finding[]` objects
- **Signals** = User-provided betting angles/tags (like "pace", "pressure") that get normalized and passed to Build

The code snippet you saw (`pace_skew`, `tempo_mismatch`, etc.) is **signal normalization** - it's for converting free-text user input into canonical tags. It has **nothing to do with agents**.

---

## What Happens When You Click an Agent Button

### 1. Frontend: Agent Selection
```
User clicks: [EPA ✓] [QB ✓] [WR ✗] [TE ✗] [HB ✗] [Pressure ✗] [Weather ✗]
↓
State: selectedAgents = ['epa', 'qb']
```

### 2. When Scan is Clicked
```
onScan() → POST /api/terminal/scan
Payload: {
  matchup: "NE @ DEN",
  agentIds: ['epa', 'qb'],  ← Only these agents run
  signals: [...],            ← Separate: user betting angles
  anchor: "..."
}
```

### 3. Backend: Agent Runner
Each selected agent runs **statistical threshold checks** against matchup data:

---

## Agent → What They Analyze

### 📊 **EPA Agent** (`epa`)
**Analyzes:** Expected Points Added efficiency mismatches

**Data it checks:**
- **Player stats:**
  - `receiving_epa_rank` (WR/TE receiving efficiency rank)
  - `rushing_epa_rank` (RB rushing efficiency rank)
  - `targets`, `rushes` (volume)
- **Opponent defense:**
  - `epa_allowed_to_wr_rank` (how bad is opponent vs WRs?)
  - `epa_allowed_to_rb_rank` (how bad is opponent vs RBs?)

**What it finds:** "Player X has top-10 receiving EPA vs opponent's bottom-10 WR defense → WR receptions/yards over"

---

### 💨 **Pressure Agent** (`pressure`)
**Analyzes:** Pass rush vs pass protection mismatches

**Data it checks:**
- **Opponent defense:**
  - `pressure_rate` (how often they pressure QBs)
  - `pressure_rate_rank` (rank among all defenses)
- **Your team offense:**
  - `pass_block_win_rate_rank` (how good is your O-line?)
  - `qb_passer_rating_under_pressure` (how does QB handle pressure?)
  - `qb_name` (for context)

**What it finds:** "Opponent has top-5 pressure rate vs your bottom-10 pass block → QB sacks over, pass yards under"

---

### 🌤️ **Weather Agent** (`weather`)
**Analyzes:** Game conditions impact

**Data it checks:**
- `temperature` (Fahrenheit)
- `wind_mph` (wind speed)
- `precipitation_chance` (%)
- `precipitation_type` (rain/snow/none)
- `indoor` (dome vs outdoor)

**What it finds:** "High wind + cold → game total under, pass yards under, field goals over"

---

### 🎯 **QB Agent** (`qb`)
**Analyzes:** Quarterback efficiency and matchup advantages

**Data it checks:**
- **QB player stats:**
  - `qb_rating_rank` (overall QB rating rank)
  - `yards_per_attempt_rank` (YPA efficiency)
  - `turnover_pct_rank` (ball security)
  - `attempts` (volume)
- **Opponent pass defense:**
  - `pass_defense_rank` (overall pass D rank)
  - `pass_yards_allowed_rank` (yards allowed rank)
  - `interception_rate_rank` (INT rate rank)

**What it finds:** "Top-10 QB vs bottom-10 pass defense → QB pass yards/TDs over"

---

### 🏃 **HB Agent** (`hb`)
**Analyzes:** Halfback workload and game script correlations

**Data it checks:**
- **RB player stats:**
  - `rush_yards_rank` (rushing yards rank)
  - `yards_per_carry_rank` (YPC efficiency)
  - `rush_td_rank` (TD production rank)
  - `reception_rank` (receiving rank)
  - `carries` (volume)
- **Opponent rush defense:**
  - `rush_defense_rank` (overall rush D rank)
  - `rush_yards_allowed_rank` (yards allowed rank)
  - `rush_td_allowed_rank` (TDs allowed rank)

**What it finds:** "Top-10 RB vs bottom-10 rush defense → RB rush yards/TDs over"

---

### 📡 **WR Agent** (`wr`)
**Analyzes:** Receiver target share and coverage exploits

**Data it checks:**
- **WR player stats:**
  - `target_share_rank` (target share rank)
  - `receiving_yards_rank` (yards rank)
  - `receiving_td_rank` (TD rank)
  - `separation_rank` (separation ability)
  - `targets` (volume)
- **Opponent WR defense:**
  - `pass_defense_rank` (overall pass D)
  - `yards_allowed_to_wr_rank` (WR yards allowed rank)
  - `td_allowed_to_wr_rank` (WR TDs allowed rank)

**What it finds:** "Top-10 WR target share vs bottom-10 WR defense → WR receptions/yards/TDs over"

---

### 🔒 **TE Agent** (`te`)
**Analyzes:** Tight end red zone and usage patterns

**Data it checks:**
- **TE player stats:**
  - `target_share_rank` (target share rank)
  - `receiving_yards_rank` (yards rank)
  - `receiving_td_rank` (TD rank)
  - `red_zone_target_rank` (RZ target rank) ← **Key differentiator**
  - `targets` (volume)
- **Opponent TE defense:**
  - `te_defense_rank` (overall TE D rank)
  - `yards_allowed_to_te_rank` (TE yards allowed rank)
  - `td_allowed_to_te_rank` (TE TDs allowed rank)

**What it finds:** "Top-10 TE red zone targets vs bottom-10 TE defense → TE receptions/yards/TDs over"

---

### 📝 **Notes Agent** (`notes`)
**Analyzes:** Curated game intelligence (always runs, not toggleable)

**Data it checks:**
- Loads from `data/notes/{year}-wk{week}.json`
- `keyMatchups[]` → `note_key_matchup` findings
- `notes` (stat patterns) → `note_tendency` findings
- `injuries{}` → `note_injury_context` findings
- `weather{}` → `note_weather_context` findings

**What it finds:** Curated context like "Drake Maye vs DEN's 47-sack pass rush", injury narratives, weather context

---

## Agent Output: Finding[] → Alert[]

1. **Agent runs** → Produces `Finding[]` (raw statistical observations)
2. **Analyst (LLM)** → Transforms `Finding[]` → `Alert[]` (actionable betting implications)
3. **Build** → Uses `Alert[]` + signals + anchors → Generates scripts

---

## Signals (Separate System)

**Signals** are user-provided betting angles that get normalized:

```typescript
// User types: "pace, pressure, weather"
// Gets normalized to: ['pace_skew', 'pressure_mismatch', 'weather_impact']
```

**Signal normalization** (the code you saw):
- Maps free-text → canonical tags
- Examples: "pace" → `pace_skew`, "pressure" → `pressure_mismatch`
- Used in **Build phase** to shape narrative, NOT in agent execution

**Signal categories:**
- Pace & tempo (`pace_skew`, `tempo_mismatch`)
- Pressure (`pressure_mismatch`, `blitz_tendency`)
- Weather (`weather_impact`, `wind_factor`)
- Matchups (`cb_wr_mismatch`, `te_coverage_gap`)
- Volume (`target_share`, `snap_count_trend`)
- Game script (`game_script`, `blowout_risk`)
- Variance (`high_variance`, `stack_potential`)

---

## Summary: Agent Button Click Flow

```
1. User clicks [QB] button
   ↓
2. selectedAgents = ['qb'] (state updated)
   ↓
3. User clicks [Scan]
   ↓
4. POST /api/terminal/scan { agentIds: ['qb'] }
   ↓
5. Backend: runAgents() → checkQbThresholds()
   ↓
6. Checks QB stats vs opponent pass defense stats
   ↓
7. If thresholds met → Finding[] produced
   ↓
8. Analyst transforms Finding[] → Alert[]
   ↓
9. Build uses Alert[] + signals + anchors → Scripts
```

**Agents ≠ Signals:**
- **Agents** = Statistical analyzers (backend, automatic)
- **Signals** = User betting angles (frontend input, normalized)

---

## Where to Find Detailed Threshold Logic

Each agent has:
1. **`skill.md`** = LLM prompt context (what the agent "knows")
2. **`thresholds.ts`** = Actual statistical checks (the code that runs)

**Example: QB Agent**
- `lib/terminal/agents/qb/skill.md` = LLM context for analyst
- `lib/terminal/agents/qb/thresholds.ts` = Threshold checks:
  - `QB_THRESHOLDS.qbRatingRank: 10` (top 10 QB)
  - `QB_THRESHOLDS.defensePassRank: 22` (bottom 10 defense)
  - `QB_THRESHOLDS.minAttempts: 150` (sample size)

**Threshold files show:**
- Exact rank cutoffs (top 10, bottom 10, etc.)
- Minimum sample sizes
- What stats trigger findings
- Finding types produced

---

## Best Way to Document This?

**Recommendation:** This document + inline code comments

1. **This document** = High-level explanation (what you're reading)
2. **Agent `thresholds.ts` files** = Exact statistical checks (code)
3. **Agent `skill.md` files** = LLM context (what agent "knows")
4. **Signal normalization** = Already documented in `lib/swantail/signals.ts` comments

**For UI:** Could add tooltips on agent buttons showing what stats they check, but the descriptions in `AGENT_META` are already concise and accurate.

**For developers:** Read `lib/terminal/engine/agent-runner.ts` to see the full orchestration flow.
