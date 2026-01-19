# Terminal-Native UI Design

**Date:** 2026-01-17
**Component:** SwantailTerminalPanel
**Objective:** Make the UI terminal-native by eliminating picker remnants, duplicate selectors, and hidden form affordances. Keep only required inputs accessible via minimal drawers.

## Definition of Done

Section 5 tests green + manual smoke (matchup set → Build/Prop/Parlay → drawers apply/close/focus → agent cards reflect invoked/silent → copy error details works).

---

## Section 1: Overall Architecture

The refactored **SwantailTerminalPanel** becomes a pure terminal appliance with three distinct zones:

### Top Zone - Terminal Chrome
- Window controls (red/yellow/green dots)
- Terminal title: `~/swantail terminal`
- System status badge (READY/BUSY/DEGRADED/ATTN)

### Middle Zone - Terminal Viewport
- **Agent status cards** (compact, collapsible, visually subordinate) - Live dashboard showing agent states
- **Output buffer** (primary surface) - Scrollable with ASCII logo, preflight messages, build output
- **State summary line** (reactive, store-derived) - Updates on every drawer apply: `current matchup: X • anchor: Y • signals: Z`

### Bottom Zone - Fixed Control Bar (two rows, always visible)
- **Row 1 (Input & Utilities)**: Matchup chips, "Change matchup" button, input buttons (⚓ Anchor, 📡 Signals, 📋 Odds), Help/Clear/Reset
- **Row 2 (Primary Actions)**: Build, Prop, Story, Parlay buttons (prominent, centered)

**Key Principle:** No text inputs visible in the main view. All data entry happens in minimal drawers that overlay the terminal when needed.

**Refinements:**
1. Agent cards visually subordinate to buffer (compact, collapsible) - narrative log remains primary surface
2. State summary line derived from store, updates on every drawer apply (not only on builds) - terminal always reflects truth

---

## Section 1.5: Execution Model

The Swantail Terminal operates in two distinct phases:

```
┌─────────────────────────────────────────────────────────┐
│  Swantail Terminal UI                                   │
│                                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                   │
│  │  PROP   │ │  STORY  │ │ PARLAY  │  ← Output Selector │
│  └────┬────┘ └────┬────┘ └────┬────┘     (view only)   │
└───────┼──────────┼──────────┼──────────────────────────┘
        │          │          │
        └──────────┴──────────┘
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Phase 1: Agent Scans (Re-Runnable)                     │
│                                                         │
│  Endpoints:                                             │
│    /api/agents/lines      → LineFindings[]              │
│    /api/agents/props      → PropFindings[]              │
│    /api/agents/trends     → TrendFindings[]             │
│    /api/agents/edges      → EdgeFindings[]              │
│                                                         │
│  Aggregated into:                                       │
│    terminalState.findings: Findings[]                   │
│    terminalState.alerts: Alerts[]                       │
│                                                         │
│  • Fully re-runnable, non-committal                     │
│  • Cancel in-flight on matchup change                   │
└─────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Phase 2: BUILD (Single Commit Action)                  │
│                                                         │
│  POST /api/build                                        │
│                                                         │
│  Payload Snapshot:                                      │
│  - matchup: string                                      │
│  - output_type: 'prop' | 'story' | 'parlay'             │
│  - findings: Findings[]                                 │
│  - alerts: Alerts[]                                     │
│  - anchor?: string                                      │
│  - signals?: string[]                                   │
│  - odds_paste?: string                                  │
│  - request_id: string (idempotency key)                 │
└─────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Script Panel                                           │
│                                                         │
│  Renders immutable buildResult as:                      │
│  • Story narrative                                      │
│  • Parlay slip                                          │
│  • Prop breakdown                                       │
│                                                         │
│  (Switching PROP / STORY / PARLAY                       │
│   re-renders view only; no re-build)                    │
└─────────────────────────────────────────────────────────┘
```

### Phase 1: Terminal Analysis (Pre-Build, Re-Runnable)

Agents run inside the Terminal to scan backend data sources and surface noteworthy insights **before** any payload is committed. This phase is:

- **Non-committal**: No build artifacts created, only mutable `terminalState`
- **Re-runnable**: Changing matchups, odds, or inputs freely re-runs agent scans
- **Output-agnostic**: PROP / STORY / PARLAY selection doesn't affect scan computation

### Phase 2: Build (Single Commit, Deterministic Output)

The Build step snapshots terminal state into a canonical request that generates the final artifact:

- **Single commit point**: Only Build creates an artifact / commits a payload
- **Deterministic**: Identical terminal state + Build ⇒ identical build output
- **Immutable result**: `buildResult` frozen at commit time, never mutated

### Key Invariants

| Invariant | Description |
|-----------|-------------|
| **Agents do real work** | Terminal activity reflects live backend scans, not UI simulation |
| **Agents may run many times** | Changing matchups, odds, or inputs freely re-runs analysis |
| **Build is the only commit** | It snapshots terminal state into an immutable payload |
| **Output type is view concern** | PROP / STORY / PARLAY do not change computation, only presentation |
| **Determinism** | Identical terminal state + Build ⇒ identical build output |

### Why This Matters

This separation:
- **Prevents semantic drift** - exploration vs commitment are clearly delineated
- **Avoids duplicated telemetry** - one commit = one tracking event
- **Makes reasoning easier** - exploration in Terminal, commitment once, rendering is pure function of result

---

### Engineering Specifics

#### 1. State Contract

```typescript
// Mutable during Phase 1 - agent scans populate this
interface TerminalState {
  matchup: string
  anchor?: string
  signals: string[]
  oddsPaste?: string
  findings: Findings[]      // Aggregated from agent scans
  alerts: Alerts[]          // Surfaced warnings/edges
  agentStatus: AgentRunState[]
  scanRequestId?: string    // Current in-flight scan batch
}

// Immutable after Phase 2 - never mutated post-build
interface BuildResult {
  request_id: string        // Idempotency key
  payload_hash: string      // SHA256 of canonical payload
  output_type: 'prop' | 'story' | 'parlay'
  scripts: Script[]
  metadata: BuildMetadata
  created_at: string
}

// Clear separation: terminalState is draft, buildResult is committed
```

#### 2. Idempotency & Cancellation

```typescript
// Generate request_id for each scan batch
const scanRequestId = `scan_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`

// Cancel in-flight scans on matchup change
useEffect(() => {
  // Abort previous scan batch
  if (abortControllerRef.current) {
    abortControllerRef.current.abort()
  }
  abortControllerRef.current = new AbortController()

  runAgentScans(matchup, abortControllerRef.current.signal)
}, [matchup])

// Build idempotency: hash payload to detect duplicates
const payloadHash = sha256(JSON.stringify({
  matchup: terminalState.matchup,
  findings: terminalState.findings,
  alerts: terminalState.alerts,
  anchor: terminalState.anchor,
  signals: terminalState.signals,
}))

// Server rejects duplicate payload_hash within TTL (5 min)
```

#### 3. Telemetry Semantics

| Event | Phase | Frequency | Payload |
|-------|-------|-----------|---------|
| `agent_scan_started` | 1 | Per matchup change | `{ matchup, scan_request_id, agents: string[] }` |
| `agent_scan_completed` | 1 | Per agent | `{ agent_id, scan_request_id, findings_count, duration_ms }` |
| `agent_scan_cancelled` | 1 | On abort | `{ scan_request_id, reason: 'matchup_changed' \| 'user_reset' }` |
| `build_committed` | 2 | Once per Build click | `{ request_id, payload_hash, output_type, findings_count, alerts_count }` |
| `build_result_viewed` | 2 | On output type switch | `{ request_id, output_type, switched_from?: string }` |

**Key distinction**: Agent scans emit many events (fine-grained for debugging), Build emits one event (the commit).

#### 4. Route Deprecation Plan

Current routes `/api/terminal/{prop,story,parlay}` conflate scanning + building. Migration:

| Current Route | Action |
|---------------|--------|
| `/api/terminal/prop` | Deprecate → alias to `/api/build?output_type=prop` |
| `/api/terminal/story` | Deprecate → alias to `/api/build?output_type=story` |
| `/api/terminal/parlay` | Deprecate → alias to `/api/build?output_type=parlay` |

**New routes:**

```
POST /api/agents/scan     → Runs all agents, returns { findings, alerts, scan_id }
POST /api/build           → Commits payload, returns { buildResult }
```

**Migration steps:**
1. Add `/api/build` route accepting `output_type` parameter
2. Add `/api/agents/scan` route for explicit agent triggering
3. Update UI to use new routes
4. Add deprecation warning to old `/api/terminal/*` routes
5. Remove old routes after 2 release cycles

---

### Implementation Implications

1. **Remove duplicate Story button** - Build is the only primary action
2. **Output selector is post-build** - PROP/STORY/PARLAY switch rendering, not API calls
3. **Agent scanning is cheap** - Can re-run without commit consequences
4. **Build payload includes output_type** - Server knows requested presentation format
5. **Cancel in-flight scans** - Matchup change aborts pending agent requests
6. **Idempotent builds** - Duplicate payload_hash within TTL returns cached result

---

## Section 2: Component Refactoring

### SwantailTerminalPanel.tsx Changes

**Remove from main render:**
- The matchup text input field (lines 560-576)
- The "showAdvanced" toggle and conditional panel (lines 543-548, 578-630)
- All form inputs currently in the "advanced" section

**Extract into new drawer components:**
- `MatchupDrawer.tsx` - Text input for manual matchup entry, triggered by "Change matchup" button
- `AnchorDrawer.tsx` - Single text input for market anchor, triggered by "⚓ Anchor" button
- `SignalsDrawer.tsx` - Text input for comma-separated signals, triggered by "📡 Signals" button
- `OddsDrawer.tsx` - Textarea for odds paste, triggered by "📋 Odds" button

**Agent cards collapsibility:**
- Add collapse state: `const [agentsCollapsed, setAgentsCollapsed] = useState(false)`
- Render collapsed view as single line: `"7 agents • 3 found • 2 silent • 2 idle"` with expand arrow
- Clicking toggles between compact single-line and full card grid

**State summary reactivity:**
- Move state summary from buffer into separate component that reads directly from props
- Update immediately when `matchup`, `lineFocus`, or `angles` props change
- No dependency on build/data state

**Implementation notes:**
- Drawers controlled by store (draft → apply) - closing never mutates state
- Focus management: ESC-close returns focus to control bar for keyboard flow
- Agent summary computed from real run-state (invoked/silent/found/error/idle) - can't drift from reality

---

## Section 3: Drawer Implementation Pattern

### Shared Drawer Behavior

All four drawers follow this pattern:

```typescript
interface DrawerProps {
  isOpen: boolean
  currentValue: string
  onClose: () => void
  onApply: (value: string) => void
  returnFocusRef?: React.RefObject<HTMLElement>  // Button that opened drawer
}

function TextInputDrawer({ isOpen, currentValue, onClose, onApply, returnFocusRef }: DrawerProps) {
  const [draft, setDraft] = useState(currentValue)

  // Sync draft ONLY when drawer opens (not on currentValue change while open)
  useEffect(() => {
    if (isOpen) setDraft(currentValue)
  }, [isOpen]) // Only depend on isOpen

  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  const handleClose = () => {
    onClose()
    returnFocusRef?.current?.focus() // Return focus to triggering button
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onApply(draft)
      handleClose()
    }
  }

  return isOpen ? (
    <div className="overlay" data-testid="example-drawer" aria-hidden={!isOpen}>
      <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={handleKeyDown} />
      <button onClick={() => { onApply(draft); handleClose() }}>Apply</button>
      <button data-testid="example-drawer-close" onClick={handleClose}>Cancel</button>
    </div>
  ) : null
}
```

### OddsDrawer Special Handling

```typescript
// OddsDrawer: Enter = newline, Cmd/Ctrl+Enter = apply
function OddsDrawer({ isOpen, currentValue, onClose, onApply, returnFocusRef }: DrawerProps) {
  const [draft, setDraft] = useState(currentValue)

  useEffect(() => {
    if (isOpen) setDraft(currentValue)
  }, [isOpen])

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (isOpen) textareaRef.current?.focus()
  }, [isOpen])

  const handleClose = () => {
    onClose()
    returnFocusRef?.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose()
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onApply(draft)
      handleClose()
    }
    // Regular Enter adds newline (default textarea behavior)
  }

  return isOpen ? (
    <div className="overlay" data-testid="odds-drawer" aria-hidden={!isOpen}>
      <textarea ref={textareaRef} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={handleKeyDown} />
      <button onClick={() => { onApply(draft); handleClose() }}>Apply</button>
      <button data-testid="odds-drawer-close" onClick={handleClose}>Cancel</button>
    </div>
  ) : null
}
```

### Agent Card Collapsible Summary

```typescript
// Compute from runState.agents (real data)
const agentSummary = useMemo(() => {
  const counts = runState.agents.reduce((acc, agent) => {
    acc[agent.status] = (acc[agent.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return {
    total: runState.agents.length,
    found: counts.found || 0,
    silent: counts.silent || 0,
    scanning: counts.scanning || 0,
    idle: counts.idle || 0,
    error: counts.error || 0,
  }
}, [runState.agents])

// Collapsed view
{agentsCollapsed ? (
  <div onClick={() => setAgentsCollapsed(false)} className="cursor-pointer">
    {agentSummary.total} agents • {agentSummary.found} found • {agentSummary.silent} silent • {agentSummary.idle} idle
    {agentSummary.error > 0 && ` • ${agentSummary.error} error`}
    <ChevronDownIcon />
  </div>
) : (
  <div>
    <button onClick={() => setAgentsCollapsed(true)}><ChevronUpIcon /></button>
    {runState.agents.map(agent => <AgentCard key={agent.id} agent={agent} />)}
  </div>
)}
```

**Key Refinements:**
- Don't auto-apply on Enter for Odds textarea (Enter = newline, Cmd/Ctrl+Enter = apply)
- Only sync draft on open (not on currentValue change while open) - don't overwrite user mid-edit
- Return focus to triggering button via `returnFocusRef` (not assuming automatic focus return)

---

## Section 4: Two-Row Control Bar Layout

### Bottom Control Panel Structure

```tsx
{/* Mode-specific validation with preflight awareness */}
// Read from typed preflightStatus to avoid naming desync
const preflightOk = status.phase === 'ready' || status.phase === 'running'
const hasMatchup = Boolean(parseQuickMatchup(matchup) || matchup.trim())
const hasExtraInput = Boolean(lineFocus.trim() || angles.length > 0 || oddsPaste?.trim())

const canRunProp = hasMatchup && !isLoading && preflightOk
const canRunStory = hasMatchup && !isLoading && preflightOk
const canRunParlay = hasMatchup && hasExtraInput && !isLoading && preflightOk

{/* Fixed bottom control bar - always visible */}
<div className="border-t border-white/10 bg-black/40 p-3" data-testid="control-bar">
  {/* Row 1: Input & Utility Controls */}
  <div className="flex items-center gap-2 mb-3">
    {/* Matchup chips - horizontal scroll on overflow */}
    <div className="flex items-center gap-2 overflow-x-auto flex-1 min-w-0 scrollbar-thin">
      {featuredGames.slice(0, 6).map(g => (
        <button key={g.id} onClick={() => onPickMatchup(g.display)} className="chip shrink-0">
          {g.display}
        </button>
      ))}
    </div>

    <div className="h-4 w-px bg-white/10 shrink-0" />

    {/* Change matchup drawer trigger */}
    <button
      ref={matchupButtonRef}
      onClick={() => setMatchupDrawerOpen(true)}
      disabled={isLoading}
      className="control-btn shrink-0"
      data-testid="matchup-drawer-trigger"
    >
      Change matchup
    </button>

    <div className="h-4 w-px bg-white/10 shrink-0" />

    {/* Input drawer triggers */}
    <button
      ref={anchorButtonRef}
      onClick={() => setAnchorDrawerOpen(true)}
      disabled={isLoading}
      className="control-btn shrink-0"
      data-testid="anchor-drawer-trigger"
    >
      ⚓ Anchor
    </button>
    <button
      ref={signalsButtonRef}
      onClick={() => setSignalsDrawerOpen(true)}
      disabled={isLoading}
      className="control-btn shrink-0"
      data-testid="signals-drawer-trigger"
    >
      📡 Signals
    </button>
    <button
      ref={oddsButtonRef}
      onClick={() => setOddsDrawerOpen(true)}
      disabled={isLoading}
      className="control-btn shrink-0"
      data-testid="odds-drawer-trigger"
    >
      📋 Odds
    </button>

    <div className="h-4 w-px bg-white/10 shrink-0" />

    {/* Utility buttons (always enabled) */}
    <button onClick={onHelp} className="control-btn shrink-0">Help</button>
    <button onClick={onClear} className="control-btn shrink-0">Clear</button>
    <button onClick={onReset} className="control-btn shrink-0">Reset</button>
  </div>

  {/* Row 2: Primary Action Buttons */}
  <div className="flex items-center justify-center gap-3">
    {/* Build = primary Story mode */}
    <button
      onClick={() => handleAction('story')}
      disabled={!canRunStory}
      className="action-btn primary"
      data-testid="action-build"
    >
      {isLoading && runState.mode === 'story' ? 'Building…' : 'Build'}
    </button>

    <button
      onClick={() => handleAction('prop')}
      disabled={!canRunProp}
      className="action-btn"
      data-testid="action-prop"
    >
      {isLoading && runState.mode === 'prop' ? 'Scanning…' : 'Prop'}
    </button>

    <button
      onClick={() => handleAction('parlay')}
      disabled={!canRunParlay}
      className="action-btn"
      data-testid="action-parlay"
      title={!hasExtraInput ? 'Parlay requires anchor, signals, or odds' : ''}
    >
      {isLoading && runState.mode === 'parlay' ? 'Composing…' : 'Parlay'}
    </button>
  </div>
</div>

{/* Drawers (overlay when open) */}
<MatchupDrawer
  isOpen={matchupDrawerOpen}
  currentValue={matchup}
  onClose={() => setMatchupDrawerOpen(false)}
  onApply={(val) => {
    const parsed = parseQuickMatchup(val)
    if (parsed) {
      onChangeMatchup(parsed)
      append(`matchup set: ${parsed}`, 'ok')
      setMatchupDrawerOpen(false)
    } else {
      append('hint: try "SF @ SEA" or "49ers @ Seahawks".', 'warn')
      setMatchupDrawerOpen(false) // Close drawer, don't trap user
    }
  }}
  returnFocusRef={matchupButtonRef}
/>
<AnchorDrawer
  isOpen={anchorDrawerOpen}
  currentValue={lineFocus}
  onClose={() => setAnchorDrawerOpen(false)}
  onApply={(val) => {
    const trimmed = val.trim()
    onChangeLineFocus?.(trimmed)
    append(trimmed ? `anchor set: ${trimmed}` : 'anchor cleared', trimmed ? 'ok' : 'muted')
  }}
  returnFocusRef={anchorButtonRef}
/>
<SignalsDrawer
  isOpen={signalsDrawerOpen}
  currentValue={angles.join(', ')}
  onClose={() => setSignalsDrawerOpen(false)}
  onApply={(val) => {
    const parsed = val.split(',').map(s => s.trim()).filter(Boolean)
    onChangeAngles?.(parsed)
    append(parsed.length ? `signals set: ${parsed.join(', ')}` : 'signals cleared', parsed.length ? 'ok' : 'muted')
  }}
  returnFocusRef={signalsButtonRef}
/>
<OddsDrawer
  isOpen={oddsDrawerOpen}
  currentValue={oddsPaste ?? ''}
  onClose={() => setOddsDrawerOpen(false)}
  onApply={(val) => {
    onChangeOddsPaste?.(val)
    append(val.trim() ? 'odds updated' : 'odds cleared', val.trim() ? 'ok' : 'muted')
  }}
  returnFocusRef={oddsButtonRef}
/>
```

### Visual Hierarchy

- **Row 1**: Smaller, utility-focused (text-xs, subtle bg)
- **Row 2**: Prominent action buttons (larger, gradient backgrounds, centered)

### CSS for Chip Scrolling

```css
.scrollbar-thin {
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}
```

**Key Refinements:**
- No duplicate Story button (Build is primary Story mode)
- Mode-aware validation: Prop requires matchup only, Parlay requires anchor/signals/odds
- Disable only buttons that can't run - UI never feels broken
- Chips overflow gracefully (horizontal scroll on small widths)
- `handleAction('story')` for Build is the only primary call path
- Preflight check: `status.phase === 'ready' || 'running'` (not just `!== 'booting'`)
- Parlay allows oddsPaste to satisfy "extra input" requirement
- Disable drawer triggers during `isLoading` (prevent state mutations)
- Keep buffer scrollable, text selectable, utilities enabled

---

## Section 5: Testing & Telemetry

### Testing Requirements (Deploy Phase)

**1. Invariant tests** - Run existing terminal route tests:
```bash
npm test -- --grep "terminal"
```

**2. UI snapshot test** - Add new test to verify terminal-native structure:

```typescript
describe('SwantailTerminalPanel - Terminal Native UI', () => {
  it('renders only terminal viewport + bottom control bar (no picker UI)', () => {
    render(<SwantailTerminalPanel {...defaultProps} />)

    // Bottom control bar exists (use stable data-testid)
    expect(screen.getByTestId('control-bar')).toBeInTheDocument()
    expect(screen.getByTestId('matchup-drawer-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('anchor-drawer-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('signals-drawer-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('odds-drawer-trigger')).toBeInTheDocument()

    // Primary actions exist
    expect(screen.getByTestId('action-build')).toBeInTheDocument()
    expect(screen.getByTestId('action-prop')).toBeInTheDocument()
    expect(screen.getByTestId('action-parlay')).toBeInTheDocument()

    // All drawers closed by default (explicit aria-hidden)
    expect(screen.getByTestId('matchup-drawer')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('anchor-drawer')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('signals-drawer')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('odds-drawer')).toHaveAttribute('aria-hidden', 'true')

    // No advanced/inputs toggle remnants
    expect(screen.queryByTestId('advanced-toggle')).not.toBeInTheDocument()
  })

  it('all required inputs reachable from control bar buttons', () => {
    render(<SwantailTerminalPanel {...defaultProps} />)

    // Matchup drawer
    fireEvent.click(screen.getByTestId('matchup-drawer-trigger'))
    expect(screen.getByTestId('matchup-drawer')).toHaveAttribute('aria-hidden', 'false')
    expect(screen.getByPlaceholderText(/Type a matchup/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('matchup-drawer-close'))
    expect(screen.getByTestId('matchup-drawer')).toHaveAttribute('aria-hidden', 'true')

    // Anchor drawer
    fireEvent.click(screen.getByTestId('anchor-drawer-trigger'))
    expect(screen.getByTestId('anchor-drawer')).toHaveAttribute('aria-hidden', 'false')
    fireEvent.click(screen.getByTestId('anchor-drawer-close'))

    // Signals drawer
    fireEvent.click(screen.getByTestId('signals-drawer-trigger'))
    expect(screen.getByTestId('signals-drawer')).toHaveAttribute('aria-hidden', 'false')
    fireEvent.click(screen.getByTestId('signals-drawer-close'))

    // Odds drawer
    fireEvent.click(screen.getByTestId('odds-drawer-trigger'))
    expect(screen.getByTestId('odds-drawer')).toHaveAttribute('aria-hidden', 'false')
    fireEvent.click(screen.getByTestId('odds-drawer-close'))
  })
})
```

### Telemetry (Support Phase)

```typescript
// Generate session ID once per component mount
const [sessionId] = useState(() => `terminal_${Date.now()}_${Math.random().toString(36).slice(2)}`)

// Debounced drawer usage tracking (500ms debounce)
const trackControlUsed = useMemo(() =>
  debounce((control: string, metadata: any) => {
    track('terminal_control_used', {
      session_id: sessionId,
      control,
      ...metadata
    })
  }, 500),
  [sessionId]
)

// Enhanced drawer usage tracking (called in onApply handlers)
trackControlUsed('matchup_drawer', {
  matchup_set: Boolean(val),
  mode: runState.mode || null,
  preflight_kind: status.phase,
  lines_mode: status.lines.mode || 'unknown'
})

trackControlUsed('anchor_drawer', {
  matchup_set: Boolean(matchup.trim()),
  hasValue: Boolean(val),
  mode: runState.mode || null,
  preflight_kind: status.phase
})

trackControlUsed('signals_drawer', {
  matchup_set: Boolean(matchup.trim()),
  count: parsed.length,
  mode: runState.mode || null,
  preflight_kind: status.phase
})

trackControlUsed('odds_drawer', {
  matchup_set: Boolean(matchup.trim()),
  hasValue: Boolean(val.trim()),
  mode: runState.mode || null,
  preflight_kind: status.phase
})

// Track action clicks with context (no debounce - immediate tracking)
track('terminal_action_clicked', {
  session_id: sessionId,
  mode,
  matchup_set: Boolean(matchup.trim()),
  has_anchor: Boolean(lineFocus.trim()),
  signals_count: signals.length,
  has_odds: Boolean(oddsPaste?.trim()),
  preflight_kind: status.phase,
  lines_mode: status.lines.mode || 'unknown',
  build_status: state.build?.state || 'unknown'
})

// Track drawer interactions (debounced)
const trackDrawerInteraction = useMemo(() =>
  debounce((event: string, drawer: string, metadata: any) => {
    track(event, { session_id: sessionId, drawer, ...metadata })
  }, 500),
  [sessionId]
)

trackDrawerInteraction('terminal_drawer_opened', 'matchup', { mode: runState.mode || null })
trackDrawerInteraction('terminal_drawer_closed', 'matchup', { applied: wasApplied, mode: runState.mode || null })
```

### UX Polish Pass

- **Spacing**: 8px gap between controls (`gap-2`), 12px between rows (`mb-3`)
- **Labels**: Keep emoji + text for clarity (⚓ Anchor, 📡 Signals, 📋 Odds)
- **Focus rings**: Add `focus:ring-2 focus:ring-blue-400/50 focus:outline-none` to all interactive controls
- **Loading states**:
  - Disable drawer triggers during `isLoading` (prevent state mutations)
  - Disable action buttons during `isLoading` or when validation fails
  - Keep buffer scrollable, text selectable, and utility buttons (Help/Clear) enabled
- **Disabled state styling**: Use `disabled:opacity-40 disabled:cursor-not-allowed` consistently
- **Drawer accessibility**: Set `aria-hidden="true"` when closed, `aria-hidden="false"` when open

### Data-testid Assignments

```tsx
// Control bar
<div data-testid="control-bar" className="...">

// Drawer triggers
<button data-testid="matchup-drawer-trigger" ref={matchupButtonRef} ...>
<button data-testid="anchor-drawer-trigger" ref={anchorButtonRef} ...>
<button data-testid="signals-drawer-trigger" ref={signalsButtonRef} ...>
<button data-testid="odds-drawer-trigger" ref={oddsButtonRef} ...>

// Actions
<button data-testid="action-build" onClick={() => handleAction('story')} ...>
<button data-testid="action-prop" onClick={() => handleAction('prop')} ...>
<button data-testid="action-parlay" onClick={() => handleAction('parlay')} ...>

// Drawers
<div data-testid="matchup-drawer" aria-hidden={!isOpen} className={isOpen ? 'block' : 'hidden'}>
<div data-testid="anchor-drawer" aria-hidden={!isOpen} className={isOpen ? 'block' : 'hidden'}>
<div data-testid="signals-drawer" aria-hidden={!isOpen} className={isOpen ? 'block' : 'hidden'}>
<div data-testid="odds-drawer" aria-hidden={!isOpen} className={isOpen ? 'block' : 'hidden'}>

// Drawer close buttons
<button data-testid="matchup-drawer-close" onClick={handleClose}>
<button data-testid="anchor-drawer-close" onClick={handleClose}>
<button data-testid="signals-drawer-close" onClick={handleClose}>
<button data-testid="odds-drawer-close" onClick={handleClose}>
```

**Key Refinements:**
- Assert `aria-hidden="true"` for closed drawers (not just `.toBeVisible()`) - explicit intent, resilient to CSS changes
- Debounce `terminal_control_used` events (500ms) for rapid open/close
- Add `session_id` to all telemetry for flow reconstruction across multiple actions

---

## Implementation Checklist

Following the Discover→Design→Build→Deploy→Support framework:

### Discover ✓
- [x] Audited current SwantailTerminalPanel for non-terminal controls
- [x] Identified duplicate inputs: matchup chips + text field
- [x] Identified hidden affordances: "Inputs" toggle panel with 3 inputs
- [x] Confirmed required inputs: Matchup, Anchor, Signals, Odds

### Design ✓
- [x] Defined terminal appliance model: viewport + fixed control bar
- [x] Specified control bar layout: two rows (inputs top, actions bottom)
- [x] Designed drawer pattern: draft→apply, focus management, keyboard shortcuts
- [x] Defined mode-aware validation: Prop (matchup), Story (matchup), Parlay (matchup + extra input)

### Build
- [ ] Refactor SwantailTerminalPanel to remove inline inputs
- [ ] Create MatchupDrawer.tsx with parseQuickMatchup validation
- [ ] Create AnchorDrawer.tsx with simple text input
- [ ] Create SignalsDrawer.tsx with comma-separated parsing
- [ ] Create OddsDrawer.tsx with Cmd/Ctrl+Enter apply
- [ ] Add collapsible agent cards with runState-derived summary
- [ ] Implement two-row control bar with mode-aware enable/disable
- [ ] Add focus management with returnFocusRef pattern
- [ ] Wire all drawers to append() buffer feedback

### Deploy
- [ ] Add UI snapshot test for terminal-native structure
- [ ] Run invariant tests: `npm test -- --grep "terminal"`
- [ ] Verify all tests pass
- [ ] Add telemetry with session tracking and debounced events
- [ ] UX polish pass: spacing, labels, focus rings, disabled states

### Support
- [ ] Manual smoke test: matchup set → Build/Prop/Parlay → drawers apply/close/focus → agent cards reflect invoked/silent → copy error details works
- [ ] Monitor telemetry for control usage patterns
- [ ] Gather feedback on drawer UX (open/close friction, keyboard flow)
- [ ] Iterate on spacing/labels based on real usage

---

## Files to Modify

- `components/SwantailTerminalPanel.tsx` - Main refactor
- `components/drawers/MatchupDrawer.tsx` - New file
- `components/drawers/AnchorDrawer.tsx` - New file
- `components/drawers/SignalsDrawer.tsx` - New file
- `components/drawers/OddsDrawer.tsx` - New file
- `components/SwantailTerminalPanel.test.tsx` - Add UI snapshot test
- `lib/telemetry.ts` - Add session tracking (if not present)

---

## Success Metrics

1. **Zero visible text inputs** in default terminal view (all in drawers)
2. **All tests green** - invariant tests + new UI snapshot test
3. **Manual smoke test passes** - matchup → actions → drawers → agents → copy errors
4. **Telemetry tracking** - session flows, control usage, drawer interactions
5. **No picker remnants** - no "Inputs" toggle, no duplicate selectors, no hidden forms
