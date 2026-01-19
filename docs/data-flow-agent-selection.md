# Agent Selection → Build Data Flow Analysis

## ✅ Current State (FIXED - Agent Selection Fully Wired)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER INTERACTION                                             │
│    • Clicks agent chips (EPA, QB, WR, etc.)                     │
│    • Toggles selection on/off                                    │
│    • State stored in: selectedAgents (AssistedBuilder)          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. SCAN BUTTON CLICKED                                           │
│    AssistedBuilder.onScan()                                      │
│    • agentsToScan = options?.agentIds ?? selectedAgents         │
│    • scanHash = computeInputsHash(..., agentsToScan)            │
│    • Calls: scan({ matchup, signals, anchor, agentIds })      │
│    ✅ FIXED: agentIds passed to scan()                          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. SCAN HOOK (useTerminalScan)                                   │
│    • Payload: { matchup, signals, anchor, agentIds }           │
│    ✅ FIXED: agentIds included in payload                      │
│    • POST /api/terminal/scan                                    │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. SCAN ENDPOINT (/api/terminal/scan)                           │
│    • Schema: { matchup, agentIds?: string[] }                  │
│    ✅ FIXED: agentIds in schema                                │
│    • Validation: Rejects empty/unknown agentIds                │
│    • Calls: runAgents(matchupContext, agentIds)                 │
│    • runAgents() filters by agentIds                            │
│      - Only runs selected agents (e.g., EPA, QB, WR)          │
│    • Payload hash includes sorted agentIds                      │
│    • Returns: { alerts, findings, agents: { invoked, silent } } │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. SCAN RESULTS STORED                                           │
│    terminalState = {                                             │
│      alerts: Alert[],        // From SELECTED agents only       │
│      findings: Finding[],     // From SELECTED agents only       │
│      analysisMeta: {                                            │
│        scan_hash: "...",     // Includes selectedAgents         │
│        status: 'success'                                         │
│      }                                                           │
│    }                                                             │
│    ✅ FIXED: Results only include findings from selected agents │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. BUILD BUTTON CLICKED                                          │
│    AssistedBuilder.onBuild()                                     │
│    • Checks: analysisMeta.status === 'success'                  │
│    • Checks: scan_hash matches current hash                    │
│    • Payload: {                                                 │
│        matchup,                                                 │
│        alerts: terminalState.alerts,    // SELECTED agents only  │
│        findings: terminalState.findings, // SELECTED agents only  │
│        output_type,                                             │
│        anchor, signals, odds_paste                             │
│      }                                                           │
│    • POST /api/terminal/build                                   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. BUILD ENDPOINT (/api/terminal/build)                          │
│    • Receives: alerts[] (from SELECTED agents only)             │
│    • Filters alerts by output_type if needed                    │
│    • Generates scripts/parlays from filtered alerts             │
│    • Returns: { scripts, view, ... }                            │
└─────────────────────────────────────────────────────────────────┘
```

## Intended Behavior

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER SELECTS AGENTS                                           │
│    • selectedAgents = ['epa', 'qb', 'wr']                       │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. SCAN WITH AGENT FILTER                                        │
│    • scan({ matchup, signals, anchor, agentIds: ['epa','qb','wr']})│
│    • POST /api/terminal/scan with agentIds                       │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. SCAN ENDPOINT FILTERS AGENTS                                  │
│    • runAgents(context, { agentIds: ['epa','qb','wr'] })        │
│    • Only runs: EPA, QB, WR agents                              │
│    • Skips: Pressure, Weather, HB, TE                          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. FILTERED RESULTS STORED                                      │
│    terminalState = {                                             │
│      alerts: Alert[],        // Only from EPA, QB, WR           │
│      findings: Finding[],     // Only from EPA, QB, WR           │
│      analysisMeta: {                                            │
│        scan_hash: "...",     // Includes selectedAgents         │
│        status: 'success'                                         │
│      }                                                           │
│    }                                                             │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. BUILD USES FILTERED RESULTS                                   │
│    • Build receives only alerts from selected agents            │
│    • Scripts generated from filtered alert pool                 │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Status

| Component | Intended | Actual | Status |
|-----------|----------|--------|--------|
| **Agent Selection UI** | Toggle which agents run | Toggle tracked in state | ✅ **FIXED** |
| **Scan Hash** | Include selectedAgents | Includes selectedAgents (sorted) | ✅ **FIXED** |
| **Scan Payload** | Include agentIds | agentIds in payload | ✅ **FIXED** |
| **Scan Endpoint** | Accept agentIds filter | Validates and accepts agentIds | ✅ **FIXED** |
| **runAgents()** | Filter by agentIds | Filters by agentIds parameter | ✅ **FIXED** |
| **Staleness Detection** | Hash mismatch on toggle | Hash mismatch works | ✅ **FIXED** |
| **Build Payload** | Use filtered alerts | Uses filtered alerts | ✅ **FIXED** |

## What Actually Happens (Current Implementation)

1. ✅ User toggles agents → `selectedAgents` state updates
2. ✅ Scan hash includes `selectedAgents` (sorted) → staleness detection works
3. ✅ **Scan runs ONLY selected agents** → selection is respected
4. ✅ Scan results stored in `terminalState` (filtered by selection)
5. ✅ Build sends filtered alerts (from selected agents) to `/api/terminal/build`
6. ✅ Build generates scripts from filtered alerts

## Implementation Details

### 1. Server-side Validation ✅
- **File**: `app/api/terminal/scan/route.ts:368-394`
- Rejects empty `agentIds` list
- Rejects unknown agent IDs
- Returns 400 with helpful error message

### 2. Payload Hash Includes Sorted agentIds ✅
- **Files**: `app/api/terminal/scan/route.ts:443-448, 490-495`
- Sorted `agentIds` included in hash
- Ensures toggles invalidate prior scans

### 3. Agent Selection Wiring ✅
- **Files Modified**:
  - `app/hooks/useTerminalScan.ts:4-9, 83-88` - Added `agentIds` to request interface and payload
  - `app/api/terminal/scan/route.ts:8-9, 21-23, 419-422` - Accept and validate `agentIds`, pass to `runAgents`
  - `lib/terminal/engine/agent-runner.ts:106-120, 130-337` - Filter agents based on `agentIds` parameter
  - `components/AssistedBuilder.tsx:114-119` - Pass `selectedAgents` to scan hook

### 4. Verification Logging ✅
- **File**: `lib/terminal/engine/agent-runner.ts:119`
- `console.log('[scan] agents:', agentsToRun.join(', '))` for verification

## Files Modified (Completed)

- ✅ `app/hooks/useTerminalScan.ts` - Added `agentIds` to payload
- ✅ `app/api/terminal/scan/route.ts` - Accept `agentIds` in schema, validate, pass to `runAgents()`
- ✅ `lib/terminal/engine/agent-runner.ts` - Added `agentIds` filter to `runAgents()`
- ✅ `components/AssistedBuilder.tsx` - Pass `agentsToScan` to `scan()` call
