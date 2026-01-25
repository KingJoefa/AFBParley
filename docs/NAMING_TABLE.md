# Swantail Terminal 2.0 — Naming Table

> **Internal document (engineer-facing).** The product-facing documentation is `README.md`. This migration guide exists to help contributors execute renames without reintroducing legacy terms.

---

## Acceptance Check

Before merging any documentation or UI copy changes, verify:

```bash
# Must return zero matches
grep -iE "AFB|XO|Socket\.io|chat app|ParlayGPT" README.md
```

If any matches appear, the change reintroduces legacy terminology.

---

## UI Copy / Code Terminology (Old → New)

| Old Term | New Term | Scope | Notes |
|----------|----------|-------|-------|
| **ANGLES** | **Factors** | UI + Code | Game-level agents (pace, pressure, scheme, weather). Visible to users as selectable agents. |
| `angles` (variable) | `factors` | Code | Rename state variables, props, API fields |
| `anglesCount` | `factorsCount` | Telemetry | Update telemetry event properties |
| **Signals** (user-facing) | **User Insight** | UI only | Advanced, optional free-text input. Label as "Advanced" in UI. |
| `signals` (internal) | `signals` | Code | **Keep as-is internally.** Signals are agent-discovered artifacts (EPA trends, usage shifts). Not exposed to users. |
| `signals_raw` | `userInsight` or `user_insight` | Code | Rename to clarify this is user-provided text, not agent output |
| **Script Bias** | **Build Preferences** | UI + Code | Shapes narrative (Shootout, Grind, Pass-heavy, Run-heavy) |
| `scriptBias` | `buildPreference` | Code | Rename state variable |
| `script_bias` | `build_preference` | API | Rename API field |
| **Scan** (button) | **Run Agents** | UI | Button label change. Can keep "(Scan)" as subtitle if needed for continuity. |
| **Build** (button) | **Build Scripts** | UI | Button label change. Outcome-conditioned interpretation. |
| `useAfb` | — | Code | **Remove.** Legacy AFB wrapper, already deleted. |
| `/api/afb` | — | API | **Remove.** Legacy route, already deleted. |
| `AFB Prompt` | — | Code | **Remove.** Legacy prompt construction. |
| `WRAPPER_*` env vars | — | Env | **Remove from Vercel.** Legacy wrapper configuration. |
| `XO_*` env vars | — | Env | **Remove from Vercel.** Legacy XO fallback. |
| **Counter-Story** | **Exploration** | UI | User-driven what-if navigation (A/B × Over/Under). Not a system feature. |

---

## Detailed Mapping

### Agents & Factors

**Before:**
```
Game Angle Agents: EPA, Pressure, Weather
```

**After:**
```
Factors: EPA, Pressure, Weather, Pace, Scheme
```

Factors are a **type of Agent** that analyze game-level dynamics. The distinction is internal; users just see "Agents" with some being Factors.

### Signals → User Insight (UI) / signals (internal)

**User-facing change:**
- Remove "Signals" from UI labels
- Add "User Insight (Advanced)" as optional free-text
- This does NOT unlock agents or trigger special logic
- Passed to LLM as supplemental context only

**Internal (no change):**
- `signals` array remains as agent-discovered artifacts
- Used in LLM payloads and hash computation
- Never shown to users as "signals"

### Build Preferences (formerly Script Bias)

**Before:**
```tsx
<label>Script Bias</label>
<select value={scriptBias} onChange={...}>
  <option value="shootout">Shootout</option>
  ...
</select>
```

**After:**
```tsx
<label>Build Preferences</label>
<select value={buildPreference} onChange={...}>
  <option value="shootout">Shootout</option>
  ...
</select>
```

### Button Labels

| Location | Old | New |
|----------|-----|-----|
| Scan button | "Scan" | "Run Agents" |
| Build button | "Build (Story)" / "Build (Parlay)" | "Build Scripts (Story)" / "Build Scripts (Parlay)" |

---

## Files Requiring Updates

### High Priority (User-Facing)

| File | Changes |
|------|---------|
| `components/AssistedBuilder.tsx` | Button labels, `scriptBias` → `buildPreference`, `signals_raw` → `userInsight` |
| `components/SwantailTerminalPanel.tsx` | "signals" label → "User Insight (Advanced)" |
| `components/TerminalAlertsView.tsx` | "signals" → "factors" in empty state message |

### Medium Priority (API + State)

| File | Changes |
|------|---------|
| `lib/swantail/store.ts` | State field renames |
| `lib/swantail/signals.ts` | Consider rename to `lib/swantail/user-insight.ts` or keep as internal |
| `app/api/terminal/scan/route.ts` | API field `script_bias` → `build_preference` |
| `app/api/terminal/build/route.ts` | API field `script_bias` → `build_preference` |

### Low Priority (Internal / Telemetry)

| File | Changes |
|------|---------|
| `lib/telemetry.ts` | `anglesCount` → `factorsCount` in event properties |
| `lib/terminal/engine/*.ts` | Internal references (may keep `signals` as-is) |

---

## API Field Changes

### Scan Request
```diff
{
  matchup: string,
- signals?: string[],
+ factors?: string[],        // Game-level analysis modifiers
+ user_insight?: string,     // Optional free-text context
  anchor?: string,
  agentIds?: string[]
}
```

### Build Request
```diff
{
  matchup: string,
  alerts: Alert[],
  findings: Finding[],
  output_type: string,
  anchors?: string[],
- script_bias?: string,
+ build_preference?: string,
- signals?: string[],
+ factors?: string[],
- signals_raw?: string,
+ user_insight?: string,
  odds_paste?: string,
  selected_agents?: string[],
  payload_hash?: string
}
```

---

## Migration Strategy

1. **Phase 1: UI Labels** — Change button text and labels (no code logic changes)
2. **Phase 2: State/Props** — Rename internal variables with find-replace
3. **Phase 3: API Fields** — Update API contracts (coordinate frontend + backend)
4. **Phase 4: Cleanup** — Remove any remaining legacy references

Each phase can be a separate commit for clean rollback if needed.
