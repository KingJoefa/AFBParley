# Agent Selection Piping Fix - Architectural Design

## Executive Summary

**Problem**: Agent selection is currently cosmetic - it affects UI state and hash calculation but does NOT control which agents actually execute. All 7 agents (EPA, Pressure, Weather, QB, HB, WR, TE) run on every scan regardless of user selection.

**Impact**:
- Users expect selecting 2 agents to run only those 2 agents
- Unnecessary computation and API costs from running unwanted agents
- Confusion when scan results include findings from unselected agents
- Build results include alerts from all agents, not just selected ones

**Root Cause**: The `agentIds` parameter is never passed through the scan pipeline:
- Frontend tracks selection in state
- Hash includes selection for staleness detection
- But the actual `/api/terminal/scan` endpoint doesn't accept or use `agentIds`
- `runAgents()` function has no filtering capability

---

## Current Architecture Analysis

### Data Flow (Current - BROKEN)

```
┌─────────────────────────────────────────────────────────────────┐
│ AssistedBuilder Component                                        │
│ - selectedAgents: ['epa', 'qb', 'wr']  <-- STATE TRACKED        │
│ - onScan() computes hash WITH selectedAgents  <-- HASH INCLUDES  │
│ - BUT: scan({ matchup, signals, anchor })  <-- NOT SENT         │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ useTerminalScan Hook                                             │
│ - ScanRequest: { matchup, signals?, anchor? }  <-- NO agentIds  │
│ - POST /api/terminal/scan with payload  <-- MISSING PARAM       │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ /api/terminal/scan Route Handler                                │
│ - ScanRequestSchema: { matchup, options? }  <-- NO agentIds     │
│ - Calls: runAgents(matchupContext)  <-- NO FILTER               │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ runAgents() Function                                             │
│ - ALL_AGENTS = ['epa', 'pressure', 'weather', 'qb', ...]        │
│ - Executes ALL 7 agents unconditionally  <-- PROBLEM            │
│ - Returns findings from ALL agents                              │
└─────────────────────────────────────────────────────────────────┘
```

### Type System (Current)

```typescript
// Frontend hook - NO agentIds
interface ScanRequest {
  matchup: string
  signals?: string[]
  anchor?: string
}

// Backend schema - NO agentIds
const ScanRequestSchema = z.object({
  matchup: z.string().min(3),
  options: z.object({
    includeWeather: z.boolean().default(true),
    includeProps: z.boolean().default(true),
  }).optional(),
})

// Agent runner - NO filtering capability
export async function runAgents(context: MatchupContext): Promise<AgentRunResult> {
  // Hardcoded to run ALL_AGENTS
  const ALL_AGENTS: AgentType[] = ['epa', 'pressure', 'weather', 'qb', 'hb', 'wr', 'te']
  // ... executes all unconditionally
}
```

---

## Solution Design

### Architecture Overview

The fix requires piping `agentIds` through 4 layers:

1. **Frontend**: `AssistedBuilder.onScan()` → pass `agentIds` to scan call
2. **Hook**: `useTerminalScan.scan()` → include `agentIds` in request payload
3. **API Route**: `/api/terminal/scan` → accept `agentIds` in schema, pass to runner
4. **Agent Runner**: `runAgents()` → filter agent execution based on `agentIds`

### Data Flow (Fixed)

```
┌─────────────────────────────────────────────────────────────────┐
│ AssistedBuilder Component                                        │
│ - selectedAgents: ['epa', 'qb', 'wr']                           │
│ - onScan() → scan({ matchup, signals, anchor,                  │
│                     agentIds: agentsToScan })  ✅ NOW SENT      │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ useTerminalScan Hook                                             │
│ - ScanRequest: { matchup, signals?, anchor?, agentIds? }  ✅    │
│ - Payload includes agentIds  ✅                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ /api/terminal/scan Route Handler                                │
│ - ScanRequestSchema: { matchup, agentIds?, options? }  ✅       │
│ - Calls: runAgents(matchupContext, agentIds)  ✅                │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ runAgents() Function                                             │
│ - Accepts: agentIds?: AgentType[]  ✅                           │
│ - agentsToRun = agentIds ?? ALL_AGENTS  ✅                      │
│ - Only executes selected agents  ✅                             │
│ - Returns filtered findings  ✅                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### 1. Update Frontend Hook (`app/hooks/useTerminalScan.ts`)

**Changes**:
- Add `agentIds?: string[]` to `ScanRequest` interface
- Include `agentIds` in request payload

```typescript
export interface ScanRequest {
  matchup: string
  signals?: string[]
  anchor?: string
  agentIds?: string[]  // ✅ NEW
}

const scan = useCallback(async (req: ScanRequest): Promise<ScanResult> => {
  // ...
  const payload = {
    matchup: req.matchup,
    signals: req.signals,
    anchor: req.anchor,
    agentIds: req.agentIds,  // ✅ NEW
  }

  const res = await fetch('/api/terminal/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
  // ...
}, [abort])
```

**Impact**: Hook signature changes but is backward compatible (agentIds is optional)

---

### 2. Update API Route Schema (`app/api/terminal/scan/route.ts`)

**Changes**:
- Add `agentIds?: string[]` to `ScanRequestSchema`
- Validate agentIds against allowed agent types
- Pass agentIds to `runAgents()`

```typescript
import { AgentTypeSchema } from '@/lib/terminal/schemas/finding'

const ScanRequestSchema = z.object({
  matchup: z.string().min(3).describe('e.g., "49ers @ Seahawks" or "SF @ SEA"'),
  agentIds: z.array(AgentTypeSchema).optional()
    .describe('Optional agent filter: ["epa", "qb", "wr"]'),  // ✅ NEW
  options: z
    .object({
      includeWeather: z.boolean().default(true),
      includeProps: z.boolean().default(true),
    })
    .optional(),
})

type ScanRequest = z.infer<typeof ScanRequestSchema>

export async function POST(req: NextRequest) {
  // ... parsing and validation ...

  const matchupContext = await loadMatchupContext(teams.homeTeam, teams.awayTeam)

  // Pass agentIds to runner
  const { findings, agentsInvoked, agentsSilent } = await runAgents(
    matchupContext,
    parsed.data.agentIds  // ✅ NEW - pass filter
  )

  // ... rest of handler ...
}
```

**Key Design Decisions**:
- Use Zod schema validation to ensure only valid agent IDs are accepted
- Optional parameter - defaults to ALL agents if not provided (backward compatible)
- Reuse `AgentTypeSchema` for type safety

---

### 3. Update Agent Runner (`lib/terminal/engine/agent-runner.ts`)

**Changes**:
- Add `agentIds?: AgentType[]` parameter to `runAgents()`
- Filter agent execution based on provided agentIds
- Update provenance to reflect which agents were requested vs invoked

```typescript
export interface AgentRunResult {
  findings: Finding[]
  agentsInvoked: AgentType[]    // Agents that produced findings
  agentsSilent: AgentType[]      // Agents that ran but had no findings
  agentsSkipped?: AgentType[]    // ✅ NEW - Agents not in filter
}

/**
 * Run agents against the matchup context
 *
 * @param context - Matchup data
 * @param agentIds - Optional filter of which agents to run.
 *                   If undefined, runs all agents.
 */
export async function runAgents(
  context: MatchupContext,
  agentIds?: AgentType[]  // ✅ NEW
): Promise<AgentRunResult> {
  const findings: Finding[] = []
  const agentsWithFindings = new Set<AgentType>()

  // Determine which agents to run
  const agentsToRun = agentIds ?? ALL_AGENTS  // ✅ NEW
  const agentsSkipped = agentIds
    ? ALL_AGENTS.filter(a => !agentIds.includes(a))
    : []

  const thresholdContext = {
    dataTimestamp: context.dataTimestamp,
    dataVersion: context.dataVersion,
  }

  // Only run EPA agent if in filter
  if (agentsToRun.includes('epa')) {  // ✅ NEW - conditional execution
    for (const team of [context.homeTeam, context.awayTeam]) {
      const opponent = team === context.homeTeam ? context.awayTeam : context.homeTeam
      const players = context.players[team] || []
      const opponentStats = context.teamStats[opponent] || {}

      for (const player of players) {
        const epaFindings = checkEpaThresholds(
          // ... existing params ...
        )
        if (epaFindings.length > 0) {
          findings.push(...epaFindings)
          agentsWithFindings.add('epa')
        }
      }
    }
  }

  // Only run Pressure agent if in filter
  if (agentsToRun.includes('pressure')) {  // ✅ NEW
    // ... existing pressure logic ...
  }

  // Only run Weather agent if in filter
  if (agentsToRun.includes('weather')) {  // ✅ NEW
    // ... existing weather logic ...
  }

  // Only run QB agent if in filter
  if (agentsToRun.includes('qb')) {  // ✅ NEW
    // ... existing QB logic ...
  }

  // Only run HB agent if in filter
  if (agentsToRun.includes('hb')) {  // ✅ NEW
    // ... existing HB logic ...
  }

  // Only run WR agent if in filter
  if (agentsToRun.includes('wr')) {  // ✅ NEW
    // ... existing WR logic ...
  }

  // Only run TE agent if in filter
  if (agentsToRun.includes('te')) {  // ✅ NEW
    // ... existing TE logic ...
  }

  // Calculate invoked vs silent (only among agents that ran)
  const agentsInvoked = agentsToRun.filter(a => agentsWithFindings.has(a))
  const agentsSilent = agentsToRun.filter(a => !agentsWithFindings.has(a))

  return {
    findings,
    agentsInvoked,
    agentsSilent,
    agentsSkipped,  // ✅ NEW - for transparency in debugging
  }
}
```

**Optimization Opportunity**:
- Wrapping each agent in a conditional prevents unnecessary computation
- Could save significant API costs when only 1-2 agents are selected
- Performance improvement scales linearly with number of agents skipped

---

### 4. Update Frontend Component (`components/AssistedBuilder.tsx`)

**Changes**:
- Pass `agentIds` to `scan()` call in `onScan()`

```typescript
const onScan = useCallback(async (options?: { agentIds?: string[] }) => {
  if (!matchup.trim()) return

  // Use passed agentIds or fall back to current selection
  const agentsToScan = options?.agentIds ?? selectedAgents
  const scanHash = computeInputsHash(matchup, lineFocus, signals_raw, oddsPaste, agentsToScan)
  track('ui_scan_clicked', { anglesCount: signals.length, agentIds: agentsToScan })

  // Clear previous build results on new scan
  setBuildResult(null)
  setViewCache(new Map())

  // Mark scanning state
  setTerminalState(prev => markScanning(prev, scanHash))

  try {
    const res = await scan({
      matchup: matchup.trim(),
      signals,
      anchor: lineFocus.trim() || undefined,
      agentIds: agentsToScan,  // ✅ NEW - pass selected agents
    })

    if (res.ok) {
      setTerminalState(prev => updateStateFromScan(prev, {
        alerts: res.data.alerts,
        findings: res.data.findings,
        request_id: res.data.request_id,
        scan_hash: scanHash,
      }))
      track('ui_scan_success', { alertCount: res.data.alerts.length })
    } else {
      setTerminalState(prev => markScanError(prev, res.error.message))
      track('ui_scan_error', { message: res.error.message })
    }
  } catch (e) {
    setTerminalState(prev => markScanError(prev, (e as Error).message))
    track('ui_scan_error', { message: (e as Error).message })
  }
}, [matchup, lineFocus, signals, signals_raw, oddsPaste, selectedAgents, scan])
```

**Key Points**:
- Already has the infrastructure to pass `options.agentIds`
- Only change is adding `agentIds: agentsToScan` to the scan call
- Maintains backward compatibility with optional parameter pattern

---

## Verification & Testing Strategy

### 1. Manual Testing Checklist

**Test Case 1: Select 2 agents (EPA + QB)**
```
1. Select only EPA and QB agents
2. Enter matchup: "NE @ DEN"
3. Click Scan
4. Verify:
   - Scan request includes agentIds: ["epa", "qb"]
   - Only EPA and QB findings in results
   - Build uses only EPA/QB alerts
   - Other agents show as "skipped" in debug
```

**Test Case 2: Select all agents**
```
1. Select all 7 agents
2. Enter matchup: "LAR @ SEA"
3. Click Scan
4. Verify:
   - agentIds includes all 7
   - All applicable findings appear
   - Behavior identical to no filter
```

**Test Case 3: Toggle agents mid-session**
```
1. Run scan with EPA, QB, WR
2. Toggle to only Pressure, Weather
3. Verify:
   - Scan marked as stale (hash changed)
   - Re-scan shows only Pressure/Weather findings
   - Previous EPA/QB/WR findings cleared
```

**Test Case 4: Backward compatibility**
```
1. Call /api/terminal/scan without agentIds
2. Verify:
   - All agents run (default behavior)
   - No errors or warnings
```

### 2. API Contract Testing

```bash
# Test with agentIds filter
curl -X POST http://localhost:3000/api/terminal/scan \
  -H "Content-Type: application/json" \
  -d '{
    "matchup": "NE @ DEN",
    "agentIds": ["epa", "qb"]
  }'

# Verify response includes only EPA and QB findings
# Check agents.invoked = ["epa", "qb"] or subset
# Check agents.skipped = ["pressure", "weather", "hb", "wr", "te"]

# Test with invalid agentIds
curl -X POST http://localhost:3000/api/terminal/scan \
  -H "Content-Type: application/json" \
  -d '{
    "matchup": "NE @ DEN",
    "agentIds": ["invalid", "fake"]
  }'

# Verify returns 400 with Zod validation error
```

### 3. Integration Tests

Add test file: `app/api/terminal/scan/__tests__/agent-filtering.test.ts`

```typescript
describe('/api/terminal/scan agent filtering', () => {
  it('should run only selected agents', async () => {
    const response = await POST({
      json: async () => ({
        matchup: 'NE @ DEN',
        agentIds: ['epa', 'qb'],
      }),
    })

    const data = await response.json()

    // All findings should be from selected agents
    expect(data.findings.every(f =>
      f.agent === 'epa' || f.agent === 'qb'
    )).toBe(true)

    // Invoked agents should be subset of selected
    expect(data.agents.invoked.every(a =>
      ['epa', 'qb'].includes(a)
    )).toBe(true)
  })

  it('should run all agents when agentIds not provided', async () => {
    const response = await POST({
      json: async () => ({
        matchup: 'LAR @ SEA',
      }),
    })

    const data = await response.json()

    // Should have findings from multiple agents
    const agentTypes = new Set(data.findings.map(f => f.agent))
    expect(agentTypes.size).toBeGreaterThan(1)
  })

  it('should reject invalid agent IDs', async () => {
    const response = await POST({
      json: async () => ({
        matchup: 'NE @ DEN',
        agentIds: ['invalid'],
      }),
    })

    expect(response.status).toBe(400)
  })
})
```

---

## Performance Impact Analysis

### Computational Savings

**Scenario**: User selects 2 out of 7 agents (EPA + QB)

**Current State (All agents run)**:
- EPA: Iterates 2 teams × 5 players avg = 10 checks
- Pressure: Iterates 2 teams = 2 checks
- Weather: 1 check
- QB: Iterates 2 teams × 1 QB = 2 checks
- HB: Iterates 2 teams × 2 HBs avg = 4 checks
- WR: Iterates 2 teams × 3 WRs avg = 6 checks
- TE: Iterates 2 teams × 1 TE = 2 checks
- **Total: 27 threshold checks**

**Fixed State (2 agents selected)**:
- EPA: 10 checks
- QB: 2 checks
- **Total: 12 threshold checks**
- **Savings: 55% reduction**

### Cost Savings

**LLM Analyst Stage**:
- Currently: Analyzes findings from ALL agents
- Fixed: Analyzes findings from SELECTED agents only
- **Token savings**: Proportional to findings reduction
- **Example**: 7 findings → 3 findings = ~60% token reduction in analyst prompt

**Infrastructure**:
- Fewer findings = smaller payload to Build endpoint
- Faster response times for users
- Reduced API gateway costs

---

## Edge Cases & Error Handling

### Edge Case 1: Empty agentIds Array

```typescript
// Request
{ matchup: "NE @ DEN", agentIds: [] }

// Behavior
// Option A: Treat as "run all agents" (empty = no filter)
// Option B: Return empty results (no agents = no findings)

// Recommendation: Option B - explicit empty selection
const agentsToRun = agentIds?.length ? agentIds : ALL_AGENTS
```

### Edge Case 2: Partial Agent Failure

```typescript
// Scenario: Weather agent throws error, but EPA and QB succeed
// Current: Entire scan fails
// Fixed: Should continue with successful agents

try {
  if (agentsToRun.includes('weather')) {
    const weatherFindings = checkWeatherThresholds(...)
    findings.push(...weatherFindings)
  }
} catch (err) {
  // Log error but continue
  console.error('Weather agent failed:', err)
  agentErrors.push({ agent: 'weather', error: err.message })
}

// Return partial results with warnings
return {
  findings,
  agentsInvoked,
  agentsSilent,
  agentsSkipped,
  agentErrors,  // NEW - for debugging
}
```

### Edge Case 3: Agent Selection Persistence

**Scenario**: User selects agents, closes tab, reopens
- Current: Session storage restores selection ✅
- Fixed: Scan request should use restored selection ✅
- **No changes needed** - already handled by `AssistedBuilder`

### Edge Case 4: Conflicting Hash

**Scenario**:
1. User scans with agents A, B, C
2. Changes selection to D, E, F (scan marked stale)
3. User presses Build without re-scanning

**Behavior**:
- Build button should be disabled (scan stale)
- Already handled by existing staleness detection ✅

---

## Migration & Rollout Strategy

### Phase 1: Backend Implementation (Low Risk)
1. Add `agentIds` parameter to `runAgents()` with default
2. Add filtering logic with feature flag
3. Deploy to staging
4. Test with manual API calls

**Rollback**: Remove parameter, revert to unconditional execution

### Phase 2: API Contract Update (Medium Risk)
1. Update `/api/terminal/scan` schema to accept `agentIds`
2. Wire through to `runAgents()`
3. Deploy to staging
4. Test with Postman/curl

**Rollback**: Remove schema field, ignore parameter

### Phase 3: Frontend Integration (High Risk - User Facing)
1. Update `useTerminalScan` hook interface
2. Update `AssistedBuilder.onScan()` to pass agentIds
3. Deploy to staging
4. QA testing with all scenarios
5. Monitor error rates, performance metrics
6. Gradual rollout to production (10% → 50% → 100%)

**Rollback**: Remove `agentIds` from scan calls, revert to default behavior

### Monitoring & Observability

**Metrics to Track**:
- Average agents per scan (expect: 2-3 instead of 7)
- Scan latency (expect: 30-50% reduction)
- LLM analyst token usage (expect: 40-60% reduction)
- Error rate by agent type
- User engagement with agent selection UI

**Logging**:
```typescript
console.log('[SCAN] Request:', {
  matchup,
  agentsRequested: agentIds?.length || 'all',
  agentsInvoked: agentsInvoked.length,
  agentsSilent: agentsSilent.length,
  agentsSkipped: agentsSkipped?.length || 0,
  findingsCount: findings.length,
})
```

---

## Future Enhancements

### 1. Agent Presets
```typescript
const AGENT_PRESETS = {
  'passing-game': ['epa', 'qb', 'wr', 'te', 'pressure'],
  'rushing-attack': ['epa', 'hb', 'pressure'],
  'weather-dependent': ['weather', 'hb', 'qb'],
  'full-analysis': ALL_AGENTS,
}
```

### 2. Smart Agent Suggestions
```typescript
// Based on matchup context, suggest relevant agents
function suggestAgents(context: MatchupContext): AgentType[] {
  const suggestions: AgentType[] = []

  if (context.weather.precipitation_chance > 40) {
    suggestions.push('weather', 'hb')
  }

  if (context.gameNotes?.includes('injury')) {
    suggestions.push('qb', 'pressure')
  }

  return suggestions
}
```

### 3. Agent Dependencies
```typescript
// Some agents require others (e.g., QB needs Pressure context)
const AGENT_DEPS: Record<AgentType, AgentType[]> = {
  qb: ['pressure'],
  wr: ['qb'],
  te: ['qb'],
  hb: [],
  epa: [],
  weather: [],
  pressure: [],
}

// Auto-include dependencies when agent selected
function resolveAgentDeps(selected: AgentType[]): AgentType[] {
  const resolved = new Set(selected)
  for (const agent of selected) {
    AGENT_DEPS[agent]?.forEach(dep => resolved.add(dep))
  }
  return Array.from(resolved)
}
```

---

## Summary

### Changes Required

| File | Changes | Risk | Impact |
|------|---------|------|--------|
| `useTerminalScan.ts` | Add `agentIds` to interface & payload | Low | Hook signature change (backward compatible) |
| `scan/route.ts` | Add `agentIds` to schema, pass to runner | Medium | API contract change (backward compatible) |
| `agent-runner.ts` | Add `agentIds` param, filter execution | Medium | Core execution logic change |
| `AssistedBuilder.tsx` | Pass `agentIds` to scan call | Low | 1-line change |

### Expected Outcomes

✅ **Functional**: Agent selection controls which agents execute
✅ **Performance**: 40-70% reduction in unnecessary computation
✅ **Cost**: Proportional reduction in LLM token usage
✅ **UX**: Consistent behavior between UI and backend
✅ **Backward Compatible**: Works with and without agentIds parameter

### Success Criteria

1. Selected agents match executed agents (verified in response)
2. Build results only include alerts from selected agents
3. Performance improvement measurable (scan latency down 30%+)
4. Zero regression in existing functionality
5. Clean rollback path if issues arise

---

## Files Modified

1. `/Users/zfarleymacstudio/AFBParlay/app/hooks/useTerminalScan.ts`
2. `/Users/zfarleymacstudio/AFBParlay/app/api/terminal/scan/route.ts`
3. `/Users/zfarleymacstudio/AFBParlay/lib/terminal/engine/agent-runner.ts`
4. `/Users/zfarleymacstudio/AFBParlay/components/AssistedBuilder.tsx`

**Total Lines Changed**: ~50 lines across 4 files
**Complexity**: Medium (requires threading parameter through multiple layers)
**Testing Effort**: High (integration testing critical for verification)
