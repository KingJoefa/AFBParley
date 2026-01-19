# Agent Selection Fix - Implementation Guide

## Quick Reference

**Problem**: Agent selection is cosmetic - all agents run regardless of selection.
**Solution**: Pipe `agentIds` from frontend → hook → API → runner to filter execution.
**Files**: 4 files, ~50 lines of changes
**Risk**: Medium (core execution logic)
**Backward Compatible**: Yes (agentIds optional)

---

## Implementation Steps

### Step 1: Update Frontend Hook

**File**: `/Users/zfarleymacstudio/AFBParlay/app/hooks/useTerminalScan.ts`

**Changes**:
1. Add `agentIds?: string[]` to `ScanRequest` interface (line 4)
2. Include `agentIds` in request payload (line 82)

**Diff**:
```typescript
// Line 4-8: Update interface
export interface ScanRequest {
  matchup: string
  signals?: string[]
  anchor?: string
  agentIds?: string[]  // ← ADD THIS LINE
}

// Line 82-86: Update payload construction
const payload = {
  matchup: req.matchup,
  signals: req.signals,
  anchor: req.anchor,
  agentIds: req.agentIds,  // ← ADD THIS LINE
}
```

**Full Modified Function**:
```typescript
const scan = useCallback(async (req: ScanRequest): Promise<ScanResult> => {
  // Abort any previous request
  abort()

  // Create new AbortController for this request
  const controller = new AbortController()
  abortControllerRef.current = controller

  setIsLoading(true)
  setError(null)
  setErrorDetails(null)

  try {
    const payload = {
      matchup: req.matchup,
      signals: req.signals,
      anchor: req.anchor,
      agentIds: req.agentIds,  // ← ADD THIS
    }

    const res = await fetch('/api/terminal/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const json = await res.json().catch(() => null)

    if (!res.ok) {
      const err = decodeScanError(res, json)
      setError(err.message)
      setErrorDetails(err)
      return { ok: false, error: err }
    }

    // Transform response to include findings if present
    const data: ScanResponse = {
      request_id: json.request_id,
      alerts: json.alerts || [],
      findings: json.findings || [],
      matchup: json.matchup,
      agents: json.agents,
      payload_hash: json.payload_hash || json.provenance?.payload_hash || json.request_id,
      timing_ms: json.timing_ms,
      fallback: json.fallback,
      warnings: json.warnings,
    }

    return { ok: true, data }
  } catch (e: unknown) {
    const err = e as Error
    // Handle abort specifically
    if (err.name === 'AbortError') {
      const abortErr: ScanError = {
        code: 'SCAN_ABORTED',
        status: null,
        message: 'Scan was cancelled',
        recoverable: true,
      }
      // Don't set error state for intentional abort
      return { ok: false, error: abortErr }
    }

    const scanErr: ScanError = {
      code: 'NETWORK_ERROR',
      status: null,
      message: err.message ?? 'Network error',
      recoverable: true,
    }
    setError(scanErr.message)
    setErrorDetails(scanErr)
    return { ok: false, error: scanErr }
  } finally {
    setIsLoading(false)
    // Clear controller reference
    if (abortControllerRef.current === controller) {
      abortControllerRef.current = null
    }
  }
}, [abort])
```

---

### Step 2: Update API Route Schema

**File**: `/Users/zfarleymacstudio/AFBParlay/app/api/terminal/scan/route.ts`

**Changes**:
1. Import `AgentTypeSchema` from schemas (line 3)
2. Add `agentIds` to schema definition (line 19-21)
3. Pass `agentIds` to `runAgents()` call (line 387)
4. Update GET endpoint documentation (line 503-508)

**Diff**:
```typescript
// Line 1-8: Update imports
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { runAgents, type MatchupContext } from '@/lib/terminal/engine/agent-runner'
import { buildProvenance, generateRequestId, hashObject } from '@/lib/terminal/engine/provenance'
import { shouldUseFallback } from '@/lib/terminal/engine/fallback-renderer'
import { checkRequestLimits, estimateTokens } from '@/lib/terminal/engine/guardrails'
import { analyzeFindings, generateFallbackAlerts } from '@/lib/terminal/analyst'
import { AgentTypeSchema } from '@/lib/terminal/schemas/finding'  // ← ADD THIS LINE

// Line 19-27: Update schema
const ScanRequestSchema = z.object({
  matchup: z.string().min(3).describe('e.g., "49ers @ Seahawks" or "SF @ SEA"'),
  agentIds: z.array(AgentTypeSchema).optional()  // ← ADD THIS LINE
    .describe('Optional agent filter: ["epa", "qb", "wr"]'),  // ← ADD THIS LINE
  options: z
    .object({
      includeWeather: z.boolean().default(true),
      includeProps: z.boolean().default(true),
    })
    .optional(),
})

// Line 387: Pass agentIds to runAgents
const { findings, agentsInvoked, agentsSilent } = await runAgents(
  matchupContext,
  parsed.data.agentIds  // ← ADD THIS LINE
)

// Line 503-510: Update GET documentation
schema: {
  matchup: 'string - e.g., "SF @ SEA" or "49ers @ Seahawks"',
  agentIds: 'string[]? - Optional filter: ["epa", "qb", "wr"]',  // ← ADD THIS LINE
  options: {
    includeWeather: 'boolean (default: true)',
    includeProps: 'boolean (default: true)',
  },
},
```

**Complete POST Handler Context** (lines 345-495):
```typescript
export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  try {
    // Parse request body
    const body = await req.json()
    const parsed = ScanRequestSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        {
          error: 'Invalid request',
          details: parsed.error.flatten(),
          request_id: requestId,
        },
        { status: 400 }
      )
    }

    // Parse matchup string
    const teams = parseMatchup(parsed.data.matchup)
    if (!teams) {
      return Response.json(
        {
          error: 'Invalid matchup format',
          message: 'Use format: "Team1 @ Team2" or "Team1 vs Team2"',
          examples: ['SF @ SEA', '49ers @ Seahawks', 'Chiefs vs Raiders'],
          request_id: requestId,
        },
        { status: 400 }
      )
    }

    // Load matchup context
    const matchupContext = await loadMatchupContext(teams.homeTeam, teams.awayTeam)

    // Check guardrails
    const inputEstimate = estimateTokens(JSON.stringify(matchupContext))
    checkRequestLimits({ inputTokens: inputEstimate })

    // Run threshold checks (deterministic) - NOW WITH FILTER
    const { findings, agentsInvoked, agentsSilent } = await runAgents(
      matchupContext,
      parsed.data.agentIds  // ← ADD THIS - pass agent filter
    )

    // ... rest of handler unchanged ...
  } catch (error) {
    // ... error handling unchanged ...
  }
}
```

---

### Step 3: Update Agent Runner Function

**File**: `/Users/zfarleymacstudio/AFBParlay/lib/terminal/engine/agent-runner.ts`

**Changes**:
1. Add `agentIds?: AgentType[]` parameter to `runAgents()` (line 109)
2. Wrap each agent execution in conditional check (lines 119, 149, 177, 184, 215, 246, 279)
3. Calculate agents to run and skipped agents (lines 110-116)
4. Update result calculation for filtered execution (lines 311-318)

**Diff**:
```typescript
// Line 109-119: Update function signature and add filtering logic
export async function runAgents(
  context: MatchupContext,
  agentIds?: AgentType[]  // ← ADD THIS PARAMETER
): Promise<AgentRunResult> {
  const findings: Finding[] = []
  const agentsWithFindings = new Set<AgentType>()

  // Determine which agents to run - ALL if not specified, otherwise filter
  const agentsToRun = agentIds ?? ALL_AGENTS  // ← ADD THIS LINE

  const thresholdContext = {
    dataTimestamp: context.dataTimestamp,
    dataVersion: context.dataVersion,
  }

  // Line 119-146: Wrap EPA agent in conditional
  if (agentsToRun.includes('epa')) {  // ← ADD THIS IF STATEMENT
    // Run EPA agent for all players
    for (const team of [context.homeTeam, context.awayTeam]) {
      const opponent = team === context.homeTeam ? context.awayTeam : context.homeTeam
      const players = context.players[team] || []
      const opponentStats = context.teamStats[opponent] || {}

      for (const player of players) {
        const epaFindings = checkEpaThresholds(
          {
            name: player.name,
            team: player.team,
            receiving_epa_rank: player.receiving_epa_rank,
            rushing_epa_rank: player.rushing_epa_rank,
            targets: player.targets,
            rushes: player.rushes,
          },
          {
            team: opponent,
            epa_allowed_to_wr_rank: opponentStats.epa_allowed_to_wr_rank,
            epa_allowed_to_rb_rank: opponentStats.epa_allowed_to_rb_rank,
          },
          thresholdContext
        )
        if (epaFindings.length > 0) {
          findings.push(...epaFindings)
          agentsWithFindings.add('epa')
        }
      }
    }
  }  // ← ADD THIS CLOSING BRACE

  // Line 149-174: Wrap Pressure agent in conditional
  if (agentsToRun.includes('pressure')) {  // ← ADD THIS IF STATEMENT
    // Run Pressure agent (team-level)
    for (const team of [context.homeTeam, context.awayTeam]) {
      const opponent = team === context.homeTeam ? context.awayTeam : context.homeTeam
      const teamStats = context.teamStats[team] || {}
      const opponentStats = context.teamStats[opponent] || {}

      if (opponentStats.pressure_rate_rank !== undefined) {
        const pressureFindings = checkPressureThresholds(
          {
            team: opponent,
            pressure_rate: opponentStats.pressure_rate,
            pressure_rate_rank: opponentStats.pressure_rate_rank,
          },
          {
            team: team,
            qb_name: teamStats.qb_name || 'Unknown QB',
            pass_block_win_rate_rank: teamStats.pass_block_win_rate_rank,
            qb_passer_rating_under_pressure: teamStats.qb_passer_rating_under_pressure,
          },
          thresholdContext
        )
        if (pressureFindings.length > 0) {
          findings.push(...pressureFindings)
          agentsWithFindings.add('pressure')
        }
      }
    }
  }  // ← ADD THIS CLOSING BRACE

  // Line 177-181: Wrap Weather agent in conditional
  if (agentsToRun.includes('weather')) {  // ← ADD THIS IF STATEMENT
    // Run Weather agent
    const weatherFindings = checkWeatherThresholds(context.weather, thresholdContext)
    if (weatherFindings.length > 0) {
      findings.push(...weatherFindings)
      agentsWithFindings.add('weather')
    }
  }  // ← ADD THIS CLOSING BRACE

  // Line 184-212: Wrap QB agent in conditional
  if (agentsToRun.includes('qb')) {  // ← ADD THIS IF STATEMENT
    // Run QB agent
    for (const team of [context.homeTeam, context.awayTeam]) {
      const opponent = team === context.homeTeam ? context.awayTeam : context.homeTeam
      const players = context.players[team] || []
      const opponentStats = context.teamStats[opponent] || {}

      for (const player of players.filter(p => p.position === 'QB')) {
        const qbFindings = checkQbThresholds(
          {
            name: player.name,
            team: player.team,
            qb_rating_rank: player.qb_rating_rank,
            yards_per_attempt_rank: player.yards_per_attempt_rank,
            turnover_pct_rank: player.turnover_pct_rank,
            attempts: player.attempts,
          },
          {
            team: opponent,
            pass_defense_rank: opponentStats.pass_defense_rank,
            pass_yards_allowed_rank: opponentStats.pass_yards_allowed_rank,
            interception_rate_rank: opponentStats.interception_rate_rank,
          },
          thresholdContext
        )
        if (qbFindings.length > 0) {
          findings.push(...qbFindings)
          agentsWithFindings.add('qb')
        }
      }
    }
  }  // ← ADD THIS CLOSING BRACE

  // Line 215-244: Wrap HB agent in conditional
  if (agentsToRun.includes('hb')) {  // ← ADD THIS IF STATEMENT
    // Run HB agent
    for (const team of [context.homeTeam, context.awayTeam]) {
      const opponent = team === context.homeTeam ? context.awayTeam : context.homeTeam
      const players = context.players[team] || []
      const opponentStats = context.teamStats[opponent] || {}

      for (const player of players.filter(p => p.position === 'HB' || p.position === 'RB')) {
        const hbFindings = checkHbThresholds(
          {
            name: player.name,
            team: player.team,
            rush_yards_rank: player.rush_yards_rank,
            yards_per_carry_rank: player.yards_per_carry_rank,
            rush_td_rank: player.rush_td_rank,
            reception_rank: player.reception_rank,
            carries: player.carries,
          },
          {
            team: opponent,
            rush_defense_rank: opponentStats.rush_defense_rank,
            rush_yards_allowed_rank: opponentStats.rush_yards_allowed_rank,
            rush_td_allowed_rank: opponentStats.rush_td_allowed_rank,
          },
          thresholdContext
        )
        if (hbFindings.length > 0) {
          findings.push(...hbFindings)
          agentsWithFindings.add('hb')
        }
      }
    }
  }  // ← ADD THIS CLOSING BRACE

  // Line 246-275: Wrap WR agent in conditional
  if (agentsToRun.includes('wr')) {  // ← ADD THIS IF STATEMENT
    // Run WR agent
    for (const team of [context.homeTeam, context.awayTeam]) {
      const opponent = team === context.homeTeam ? context.awayTeam : context.homeTeam
      const players = context.players[team] || []
      const opponentStats = context.teamStats[opponent] || {}

      for (const player of players.filter(p => p.position === 'WR')) {
        const wrFindings = checkWrThresholds(
          {
            name: player.name,
            team: player.team,
            target_share_rank: player.target_share_rank,
            receiving_yards_rank: player.receiving_yards_rank,
            receiving_td_rank: player.receiving_td_rank,
            separation_rank: player.separation_rank,
            targets: player.targets,
          },
          {
            team: opponent,
            pass_defense_rank: opponentStats.pass_defense_rank,
            yards_allowed_to_wr_rank: opponentStats.yards_allowed_to_wr_rank,
            td_allowed_to_wr_rank: opponentStats.td_allowed_to_wr_rank,
          },
          thresholdContext
        )
        if (wrFindings.length > 0) {
          findings.push(...wrFindings)
          agentsWithFindings.add('wr')
        }
      }
    }
  }  // ← ADD THIS CLOSING BRACE

  // Line 279-308: Wrap TE agent in conditional
  if (agentsToRun.includes('te')) {  // ← ADD THIS IF STATEMENT
    // Run TE agent
    for (const team of [context.homeTeam, context.awayTeam]) {
      const opponent = team === context.homeTeam ? context.awayTeam : context.homeTeam
      const players = context.players[team] || []
      const opponentStats = context.teamStats[opponent] || {}

      for (const player of players.filter(p => p.position === 'TE')) {
        const teFindings = checkTeThresholds(
          {
            name: player.name,
            team: player.team,
            target_share_rank: player.target_share_rank,
            receiving_yards_rank: player.receiving_yards_rank,
            receiving_td_rank: player.receiving_td_rank,
            red_zone_target_rank: player.red_zone_target_rank,
            targets: player.targets,
          },
          {
            team: opponent,
            te_defense_rank: opponentStats.te_defense_rank,
            yards_allowed_to_te_rank: opponentStats.yards_allowed_to_te_rank,
            td_allowed_to_te_rank: opponentStats.td_allowed_to_te_rank,
          },
          thresholdContext
        )
        if (teFindings.length > 0) {
          findings.push(...teFindings)
          agentsWithFindings.add('te')
        }
      }
    }
  }  // ← ADD THIS CLOSING BRACE

  // Line 311-318: Update result calculation
  // Calculate invoked vs silent (only among agents that actually ran)
  const agentsInvoked = agentsToRun.filter(a => agentsWithFindings.has(a))  // ← CHANGE from ALL_AGENTS
  const agentsSilent = agentsToRun.filter(a => !agentsWithFindings.has(a))  // ← CHANGE from ALL_AGENTS

  return {
    findings,
    agentsInvoked,
    agentsSilent,
  }
}
```

**Key Implementation Notes**:
- Each agent block gets wrapped in `if (agentsToRun.includes('agentName'))`
- No changes to the internal logic of each agent
- `agentsInvoked` and `agentsSilent` now filter from `agentsToRun` instead of `ALL_AGENTS`
- This ensures only selected agents appear in the response metadata

---

### Step 4: Update AssistedBuilder Component

**File**: `/Users/zfarleymacstudio/AFBParlay/components/AssistedBuilder.tsx`

**Changes**:
1. Add `agentIds: agentsToScan` to scan call (line 114-118)

**Diff**:
```typescript
// Line 114-118: Update scan call to include agentIds
const res = await scan({
  matchup: matchup.trim(),
  signals,
  anchor: lineFocus.trim() || undefined,
  agentIds: agentsToScan,  // ← ADD THIS LINE
})
```

**Complete onScan Function Context** (lines 98-136):
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
      agentIds: agentsToScan,  // ← ADD THIS LINE
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

---

## Testing Checklist

### Before Deployment

- [ ] TypeScript compiles without errors: `npm run build`
- [ ] No linting errors: `npm run lint`
- [ ] Local dev server runs: `npm run dev`

### Manual Testing

**Test 1: Select 2 agents (EPA + QB)**
- [ ] Open app, select only EPA and QB
- [ ] Enter matchup: "NE @ DEN"
- [ ] Click Scan
- [ ] Open Network tab → verify POST body includes `"agentIds": ["epa", "qb"]`
- [ ] Verify response `agents.invoked` only contains EPA/QB (or subset)
- [ ] Verify response `findings` only have `agent: "epa"` or `agent: "qb"`
- [ ] Click Build → verify scripts use only EPA/QB alerts

**Test 2: Select all agents**
- [ ] Select all 7 agents
- [ ] Scan matchup: "LAR @ SEA"
- [ ] Verify request includes all 7 agentIds
- [ ] Verify behavior identical to before (no regression)

**Test 3: Toggle agents mid-session**
- [ ] Scan with EPA, QB, WR selected
- [ ] Note the findings count
- [ ] Toggle to only Pressure, Weather
- [ ] Verify scan button shows "STALE" indicator
- [ ] Re-scan → verify new findings only from Pressure/Weather

**Test 4: No agents selected (edge case)**
- [ ] Deselect all agents (if UI allows, or use dev tools)
- [ ] Attempt scan
- [ ] Verify either:
  - Scan blocked at frontend (button disabled), OR
  - Backend runs all agents (empty array = no filter)

**Test 5: Backward compatibility (API direct)**
```bash
# Call API without agentIds
curl -X POST http://localhost:3000/api/terminal/scan \
  -H "Content-Type: application/json" \
  -d '{"matchup": "NE @ DEN"}'

# Verify:
# - Returns 200 OK
# - All agents run (default behavior)
# - No errors or warnings
```

**Test 6: Invalid agentIds**
```bash
# Call API with invalid agent type
curl -X POST http://localhost:3000/api/terminal/scan \
  -H "Content-Type: application/json" \
  -d '{"matchup": "NE @ DEN", "agentIds": ["invalid", "fake"]}'

# Verify:
# - Returns 400 Bad Request
# - Error message indicates Zod validation failure
```

### Performance Verification

**Before Fix**:
- [ ] Run scan with all agents selected
- [ ] Note timing_ms in response (e.g., 1500ms)
- [ ] Note findings count (e.g., 12 findings)

**After Fix**:
- [ ] Run scan with 2 agents selected (EPA + QB)
- [ ] Note timing_ms (expect 40-60% reduction, e.g., 600-900ms)
- [ ] Note findings count (expect proportional reduction)

---

## Deployment Steps

### 1. Pre-Deployment
```bash
# Create feature branch
git checkout -b fix/agent-selection-piping

# Make changes to all 4 files
# (Use diffs above)

# Test locally
npm run dev
# (Run manual tests)

# Build for production
npm run build

# Commit changes
git add app/hooks/useTerminalScan.ts
git add app/api/terminal/scan/route.ts
git add lib/terminal/engine/agent-runner.ts
git add components/AssistedBuilder.tsx
git commit -m "Fix: Wire agent selection through scan pipeline

- Add agentIds param to useTerminalScan hook
- Update /api/terminal/scan schema to accept agentIds
- Implement agent filtering in runAgents()
- Pass selected agents from AssistedBuilder to scan
- Resolves agent selection being cosmetic only

Performance: 40-60% reduction in unnecessary agent execution
Backward compatible: agentIds parameter is optional"
```

### 2. Staging Deployment
```bash
# Push to staging
git push origin fix/agent-selection-piping

# Deploy to Vercel staging environment
vercel --prod=false

# Run smoke tests on staging URL
# - Test all 6 manual test cases above
# - Monitor error logs
# - Verify no regression in existing functionality
```

### 3. Production Deployment
```bash
# Merge to main
git checkout main
git merge fix/agent-selection-piping

# Deploy to production
git push origin main
# (Vercel auto-deploys)

# Monitor production
# - Watch error rates in Vercel dashboard
# - Check response times (expect improvement)
# - Monitor user sessions for issues
```

### 4. Rollback Plan (If Needed)
```bash
# Revert commit
git revert HEAD

# Push revert
git push origin main

# Vercel auto-deploys rollback
# - System returns to previous behavior (all agents run)
# - No data loss (cosmetic change only)
# - User sessions unaffected
```

---

## Verification Commands

### API Contract Verification
```bash
# Test basic scan (no agentIds)
curl -X POST http://localhost:3000/api/terminal/scan \
  -H "Content-Type: application/json" \
  -d '{"matchup": "NE @ DEN"}' | jq .

# Test with agentIds filter
curl -X POST http://localhost:3000/api/terminal/scan \
  -H "Content-Type: application/json" \
  -d '{"matchup": "NE @ DEN", "agentIds": ["epa", "qb"]}' | jq .

# Test with invalid agentIds (should fail)
curl -X POST http://localhost:3000/api/terminal/scan \
  -H "Content-Type: application/json" \
  -d '{"matchup": "NE @ DEN", "agentIds": ["invalid"]}' | jq .

# Test with empty agentIds array
curl -X POST http://localhost:3000/api/terminal/scan \
  -H "Content-Type: application/json" \
  -d '{"matchup": "NE @ DEN", "agentIds": []}' | jq .
```

### Response Inspection
```bash
# Verify findings are filtered
curl -X POST http://localhost:3000/api/terminal/scan \
  -H "Content-Type: application/json" \
  -d '{"matchup": "LAR @ SEA", "agentIds": ["weather", "qb"]}' \
  | jq '.findings[] | .agent' \
  | sort -u

# Expected output:
# "qb"
# "weather"
# (Only these two agent types, no others)

# Verify agents metadata
curl -X POST http://localhost:3000/api/terminal/scan \
  -H "Content-Type: application/json" \
  -d '{"matchup": "LAR @ SEA", "agentIds": ["epa"]}' \
  | jq '.agents'

# Expected output:
# {
#   "invoked": ["epa"],  // or [] if no EPA findings
#   "silent": []         // or ["epa"] if no findings
# }
```

---

## Troubleshooting

### Issue: TypeScript error on `agentIds` parameter

**Symptom**: TS2345: Argument of type 'string[] | undefined' not assignable to 'AgentType[]'

**Solution**: The schema validation ensures agentIds are valid AgentTypes. Cast is safe:
```typescript
const { findings, agentsInvoked, agentsSilent } = await runAgents(
  matchupContext,
  parsed.data.agentIds as AgentType[] | undefined
)
```

### Issue: Scan returns all agents despite filter

**Check**:
1. Verify request payload includes agentIds: Open Network tab → POST body
2. Verify API receives agentIds: Add console.log in route.ts
3. Verify runAgents() uses filter: Add console.log in agent-runner.ts

**Debug logging**:
```typescript
// In route.ts POST handler
console.log('[SCAN] agentIds received:', parsed.data.agentIds)

// In agent-runner.ts runAgents()
console.log('[AGENT-RUNNER] agentsToRun:', agentsToRun)
console.log('[AGENT-RUNNER] agentsInvoked:', agentsInvoked)
```

### Issue: Build uses findings from unselected agents

**Root Cause**: Likely cached terminalState from previous scan

**Solution**: Verify scan is re-run after changing agent selection (staleness detection)
- Check analysisMeta.status === 'stale'
- Ensure Build button is disabled when stale
- User must click Scan again with new selection

### Issue: Performance doesn't improve

**Check**:
1. Verify agents are actually skipped (not just silent)
2. Add timing logs around each agent block
3. Measure before/after with same matchup and agent count

**Profiling**:
```typescript
// In agent-runner.ts
console.time('EPA agent')
if (agentsToRun.includes('epa')) {
  // ... EPA logic ...
}
console.timeEnd('EPA agent')
```

---

## Post-Deployment Monitoring

### Metrics to Track (Week 1)

1. **Agent Selection Distribution**
   - Average agents selected per scan
   - Most common agent combinations
   - % of scans with <5 agents selected

2. **Performance Metrics**
   - Average scan latency (before vs after)
   - p95 scan latency
   - Token usage reduction in analyst phase

3. **Error Rates**
   - 400 errors (invalid agentIds)
   - 500 errors (agent execution failures)
   - Client-side errors in onScan()

4. **User Behavior**
   - % of users toggling agents
   - Average time to first scan after agent change
   - Build success rate (should remain unchanged)

### Success Criteria

✅ **Functional**:
- Agent selection matches executed agents (100% of scans)
- No increase in error rate (<0.1% regression allowed)

✅ **Performance**:
- 30%+ reduction in average scan latency for filtered scans
- 40%+ reduction in analyst token usage for <4 agents selected

✅ **Adoption**:
- 50%+ of users actively toggle agent selection
- 70%+ of scans use filtered agent set (<7 agents)

### Rollback Triggers

🔴 **Immediate rollback if**:
- Error rate increases >5%
- Scan latency increases (performance regression)
- Build success rate drops >10%
- User complaints about incorrect results

🟡 **Investigate if**:
- <10% of users toggle agents (UI unclear)
- Performance improvement <10% (implementation bug)
- High rate of empty agentIds requests (frontend bug)

---

## Summary

**Total Changes**: 4 files, ~50 lines
**Risk Level**: Medium (core execution path)
**Backward Compatible**: Yes
**Rollback**: Simple (revert single commit)
**Testing**: Manual + API contract tests
**Monitoring**: Performance + error rates
**Expected Impact**: 40-60% performance improvement for filtered scans

**Deployment Order**:
1. Backend (hook + API + runner) - safe, backward compatible
2. Frontend (AssistedBuilder) - enables user-facing feature
3. Monitor metrics for 48 hours
4. Rollback if success criteria not met
