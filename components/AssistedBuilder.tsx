'use client'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useTerminalScan } from '@/app/hooks/useTerminalScan'
import SwantailScriptsView from '@/components/SwantailScriptsView'
import TerminalAlertsView from '@/components/TerminalAlertsView'
import SwantailTerminalPanel from '@/components/SwantailTerminalPanel'
import { matchOdds, parseOddsPaste } from '@/lib/swantail/odds'
import { initialSwantailState, swantailReducer, type PreflightChecks, type PreflightStatus } from '@/lib/swantail/store'
import { normalizeSignals } from '@/lib/swantail/signals'
import { track } from '@/lib/telemetry'
import { ALL_AGENT_IDS, type AgentRunState } from '@/lib/terminal/run-state'
import {
  type OutputType,
  type TerminalState,
  type BuildView,
  type BuildResult,
  type OddsTelemetry,
  type DebugContextUsed,
  createInitialTerminalState,
  updateStateFromScan,
  markScanning,
  markScanError,
  markScanStale,
  computeInputsHash,
} from '@/lib/terminal/terminal-state'

function invertLineFocus(value: string): string {
  if (!value) return value
  let next = value
  next = next.replace(/\bOver\b/gi, (m) => (m.toLowerCase() === 'over' ? 'Under' : 'Over'))
  next = next.replace(/\bUnder\b/gi, (m) => (m.toLowerCase() === 'under' ? 'Over' : 'Under'))
  next = next.replace(/([+-])(\d+(?:\.\d+)?)/g, (_, sign, num) => (sign === '-' ? `+${num}` : `-${num}`))
  return next
}

export default function AssistedBuilder() {
  const { scan, abort: abortScan, isLoading: scanLoading, error: scanError } = useTerminalScan()
  const [state, dispatch] = useReducer(swantailReducer, initialSwantailState)
  const voice: 'analyst' = 'analyst'
  const [rightTab, setRightTab] = useState<'scripts' | 'context'>('scripts')

  // Two-phase terminal state
  const [terminalState, setTerminalState] = useState<TerminalState>(createInitialTerminalState)
  const [outputType] = useState<OutputType>('story')
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null)
  const [viewCache, setViewCache] = useState<Map<OutputType, BuildView>>(new Map())
  const [isBuilding, setIsBuilding] = useState(false)

  // Agent selection state (hydrate from session storage after mount)
  const [selectedAgents, setSelectedAgents] = useState<AgentRunState['id'][]>(ALL_AGENT_IDS)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = sessionStorage.getItem('swantail:agents')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSelectedAgents(parsed)
        }
      }
    } catch {}
  }, [])

  // Persist agent selection to session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('swantail:agents', JSON.stringify(selectedAgents))
    }
  }, [selectedAgents])

  // Mark scan stale when agent selection changes after a successful scan
  const prevAgentsRef = useRef(selectedAgents)
  useEffect(() => {
    if (prevAgentsRef.current !== selectedAgents && terminalState.analysisMeta?.status === 'success') {
      setTerminalState(prev => markScanStale(prev))
    }
    prevAgentsRef.current = selectedAgents
  }, [selectedAgents, terminalState.analysisMeta?.status])

  // Unified loading/error state
  const isLoading = scanLoading || isBuilding
  const error = scanError

  const matchup = state.matchup
  const lineFocus = state.anchor
  const anchors = state.anchors
  const scriptBias = state.scriptBias
  const signals = state.signals           // Normalized tags for API calls
  const signals_raw = state.signals_raw   // Original text for display
  const oddsPaste = state.oddsPaste
  const data = state.data

  const oddsEntries = useMemo(() => parseOddsPaste(oddsPaste), [oddsPaste])

  const anchorSummary = useMemo(() => anchors.join(' + '), [anchors])

  // Current inputs hash available for future UI cues (scan staleness handled in panel).

  // Phase 1: Scan handler
  const onScan = useCallback(async (options?: { agentIds?: string[] }) => {
    if (!matchup.trim()) return

    // Use passed agentIds or fall back to current selection
    const agentsToScan = options?.agentIds ?? selectedAgents
    const scanHash = computeInputsHash(matchup, anchors, scriptBias, signals_raw, oddsPaste, agentsToScan)
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
        anchor: anchorSummary.trim() || undefined,
        agentIds: agentsToScan,
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
  }, [matchup, anchors, scriptBias, anchorSummary, signals, signals_raw, oddsPaste, selectedAgents, scan])

  // Handler for agent selection changes from terminal panel
  const onSelectedAgentsChange = useCallback((agents: AgentRunState['id'][]) => {
    setSelectedAgents(agents)
  }, [])

  // Phase 2: Build handler
  const onBuild = useCallback(async () => {
    if (!matchup.trim()) return
    // Block build if scan is not successful (includes stale state)
    if (!terminalState.analysisMeta || (terminalState.analysisMeta.status !== 'success')) return
    if (!anchors.length) return

    track('ui_build_clicked', { outputType, alertCount: terminalState.alerts.length })
    setIsBuilding(true)

    try {
      // Compute payload_hash for staleness validation (must match server computation)
      const buildPayloadHash = computeInputsHash(matchup, anchors, scriptBias, signals_raw, oddsPaste, selectedAgents)

      // Call Phase 2 endpoint with inline alerts/findings
      // Note: signals_raw is sent for hash validation (matches client hash computation)
      // signals (normalized) is used for script generation
      const res = await fetch('/api/terminal/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchup: matchup.trim(),
          alerts: terminalState.alerts,
          findings: terminalState.findings,
          output_type: outputType,
          anchor: anchorSummary.trim() || undefined,
          signals,
          signals_raw,
          odds_paste: oddsPaste || undefined,
          anchors,
          script_bias: scriptBias,
          selected_agents: selectedAgents,
          payload_hash: buildPayloadHash,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        track('ui_build_error', { message: json.error || 'Build failed' })
        return
      }

      // Store build result (include odds_telemetry / debug_context for Context panel)
      const result: BuildResult = {
        build_id: json.build_id,
        request_id: json.request_id,
        payload_hash: json.payload_hash,
        output_type: json.output_type,
        view: json.view,
        created_at: json.created_at,
        ...(json.odds_telemetry && { odds_telemetry: json.odds_telemetry as OddsTelemetry }),
        ...(json.debug_context_used && { debug_context_used: json.debug_context_used as DebugContextUsed }),
      }
      setBuildResult(result)

      // Cache this view
      setViewCache(prev => new Map(prev).set(result.output_type, result.view))

      // Switch to scripts tab to show result
      setRightTab('scripts')
      track('ui_build_success', { outputType: result.output_type })
    } catch (e) {
      track('ui_build_error', { message: (e as Error).message })
    } finally {
      setIsBuilding(false)
    }
  }, [matchup, anchorSummary, anchors, scriptBias, signals, signals_raw, oddsPaste, outputType, terminalState, selectedAgents])

  // Abort scan on input change
  useEffect(() => {
    return () => {
      abortScan()
    }
  }, [matchup, anchors, scriptBias, signals_raw, oddsPaste, abortScan])

  // Counter-story feature (legacy AFB) - deprecated, can be re-implemented with Terminal API
  const onOpposite = useCallback(async (_scriptIndex: number) => {
    console.log('[AssistedBuilder] Counter-story feature not yet implemented in Terminal 2.0')
    track('ui_action_clicked', { action: 'opposite_deprecated' })
  }, [])

  const showNoMatches = useMemo(() => {
    if (!data || oddsEntries.length === 0) return false
    let matched = 0
    for (const script of data.scripts) {
      for (const leg of script.legs) {
        if (matchOdds(leg.selection, oddsEntries)) matched += 1
      }
    }
    return matched === 0
  }, [data, oddsEntries])

  // Memoized status handler to prevent infinite re-render loop
  const handleStatus = useCallback((s: import('@/components/SwantailTerminalPanel').SwantailSystemStatus) => {
    const checks: PreflightChecks = {
      schedule: s.schedule,
      lines: s.lines,
      backend: s.backend,
    }
    const derived = (s.schedule.season && s.schedule.week)
      ? { year: s.schedule.season, week: s.schedule.week }
      : { year: 2025, week: 20 }
    const anyDegraded = s.schedule.state === 'degraded' || s.lines.state === 'degraded' || s.backend.state === 'degraded'
    let value: PreflightStatus
    if (s.phase === 'error') {
      value = {
        state: 'error',
        checks,
        derived,
        error: s.schedule.error || s.lines.error || s.backend.error || 'preflight error',
      }
    } else if (s.phase === 'ready' && anyDegraded) {
      value = {
        state: 'degraded',
        checks,
        derived,
        reason: 'preflight degraded',
      }
    } else if (s.phase === 'ready') {
      value = {
        state: 'ready',
        checks,
        derived,
      }
    } else {
      value = {
        state: 'booting',
        checks,
      }
    }
    dispatch({ type: 'set_preflight', value })
  }, [])

  useEffect(() => {
    if (isLoading) {
      dispatch({ type: 'set_build', value: { state: 'running', startedAt: Date.now() } })
      return
    }
    if (error) {
      dispatch({ type: 'set_build', value: { state: 'error', error } })
      return
    }
    if (data || buildResult) {
      dispatch({ type: 'set_build', value: { state: 'success', receivedAt: Date.now() } })
      return
    }
    if (matchup.trim()) {
      dispatch({ type: 'set_build', value: { state: 'ready' } })
    } else {
      dispatch({ type: 'set_build', value: { state: 'idle' } })
    }
  }, [isLoading, error, data, buildResult, matchup])

  // Get current view from cache for rendering
  const currentView = viewCache.get(outputType)
  const oddsCacheStatus = buildResult?.odds_telemetry?.cache_status

  // Render script panel based on view kind
  const renderScriptPanel = () => {
    // If we have a cached view for the current output type, render based on kind
    if (currentView) {
      if (currentView.kind === 'swantail') {
        return <SwantailScriptsView data={currentView.data} oddsEntries={oddsEntries} oddsCacheStatus={oddsCacheStatus} />
      } else {
        // terminal kind - render alerts/scripts
        return <TerminalAlertsView data={{ alerts: currentView.alerts, mode: outputType, request_id: buildResult?.request_id || '', matchup: { home: '', away: '' }, agents: { invoked: [], silent: [] }, provenance: {} as any, timing_ms: 0 }} />
      }
    }

    // Fallback to legacy data if no build result
    if (data) {
      return <SwantailScriptsView data={data} oddsEntries={oddsEntries} oddsCacheStatus={oddsCacheStatus} />
    }

    // Empty state
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-white/70">
        <div className="text-base">No scripts yet.</div>
        <div className="mt-2 text-sm text-white/50">Run a scan, then build to see results.</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            {error && (
              <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}
            <SwantailTerminalPanel
              matchup={matchup}
              angles={signals_raw}
              oddsPaste={oddsPaste}
              isLoading={isLoading}
              error={error}
              data={data}
              analysisMeta={terminalState.analysisMeta}
              isBuilding={isBuilding}
              selectedAgents={selectedAgents}
              anchors={anchors}
              scriptBias={scriptBias}
              onScan={onScan}
              onBuild={onBuild}
              onSelectedAgentsChange={onSelectedAgentsChange}
              onChangeMatchup={(value) => dispatch({ type: 'set_matchup', value })}
              onChangeAnchors={(values) => dispatch({ type: 'set_anchors', values })}
              onChangeScriptBias={(values) => dispatch({ type: 'set_script_bias', values })}
              onChangeAngles={(value) => {
                // Normalize free-text signals to canonical tags
                const { signals, signals_raw } = normalizeSignals(value.join(', '))
                dispatch({ type: 'set_signals', signals, raw: signals_raw })
              }}
              onChangeOddsPaste={(value) => dispatch({ type: 'set_odds', value })}
              onStatus={handleStatus}
            />
            {showNoMatches && (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                No matches applied.
              </div>
            )}
          </div>

          <div className="space-y-4">
            {/* Right panel tabs */}
            <div className="flex items-center gap-2">
              {(['scripts', 'context'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setRightTab(tab)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                    rightTab === tab
                      ? 'bg-white/15 text-white'
                      : 'border border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {tab === 'scripts' ? 'Scripts' : 'Context'}
                </button>
              ))}
            </div>

            {rightTab === 'scripts' && renderScriptPanel()}

            {rightTab === 'context' && (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
                <div className="text-xs uppercase tracking-wide text-white/50">Odds &amp; build context</div>
                {(buildResult?.odds_telemetry || buildResult?.debug_context_used) ? (
                  <div className="mt-3 space-y-3">
                    {buildResult.odds_telemetry && (
                      <div className="space-y-2">
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="text-[11px] uppercase tracking-wide text-white/50">Odds</div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-white/80">
                            <span>source: {buildResult.odds_telemetry.source}</span>
                            <span>cache: {buildResult.odds_telemetry.cache_status}</span>
                            {buildResult.odds_telemetry.credits_spent >= 0 && (
                              <span>credits: {buildResult.odds_telemetry.credits_spent}</span>
                            )}
                            {buildResult.odds_telemetry.bookmaker && (
                              <span>book: {buildResult.odds_telemetry.bookmaker}</span>
                            )}
                          </div>
                          <div className="mt-1 text-[12px] text-white/50">
                            {buildResult.odds_telemetry.prop_lines_count} prop lines • {buildResult.odds_telemetry.players_with_lines} players
                            {buildResult.odds_telemetry.incomplete_line_count > 0 && ` • ${buildResult.odds_telemetry.incomplete_line_count} incomplete`}
                            {buildResult.odds_telemetry.unresolved_team_count > 0 && ` • ${buildResult.odds_telemetry.unresolved_team_count} unresolved team`}
                          </div>
                        </div>
                      </div>
                    )}
                    {buildResult.debug_context_used && (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/50">Context used</div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-white/80">
                          {buildResult.debug_context_used.analytics_source && (
                            <span>analytics: {buildResult.debug_context_used.analytics_source}</span>
                          )}
                          {typeof buildResult.debug_context_used.tprr_matchups_count === 'number' && (
                            <span>TPRR: {buildResult.debug_context_used.tprr_matchups_count}</span>
                          )}
                          {typeof buildResult.debug_context_used.sgps_count === 'number' && (
                            <span>SGPs: {buildResult.debug_context_used.sgps_count}</span>
                          )}
                          {buildResult.debug_context_used.used_analytics && <span>analytics ✓</span>}
                          {buildResult.debug_context_used.used_sgps && <span>sgps ✓</span>}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 text-white/60">
                    Run <strong>Build (Story)</strong> to see odds source, cache status, and context used for this matchup.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
