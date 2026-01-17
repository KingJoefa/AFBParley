'use client'
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { useAfb } from '@/app/hooks/useAfb'
import { useTerminal } from '@/app/hooks/useTerminal'
import SwantailScriptsView from '@/components/SwantailScriptsView'
import SwantailTerminalPanel from '@/components/SwantailTerminalPanel'
import { matchOdds, parseOddsPaste } from '@/lib/swantail/odds'
import { initialSwantailState, swantailReducer, type PreflightChecks, type PreflightStatus } from '@/lib/swantail/store'
import { normalizeSignals } from '@/lib/swantail/signals'
import { track } from '@/lib/telemetry'
import type { RunMode } from '@/lib/terminal/run-state'
import type { TerminalResponse, Alert } from '@/lib/terminal/schemas'

function invertLineFocus(value: string): string {
  if (!value) return value
  let next = value
  next = next.replace(/\bOver\b/gi, (m) => (m.toLowerCase() === 'over' ? 'Under' : 'Over'))
  next = next.replace(/\bUnder\b/gi, (m) => (m.toLowerCase() === 'under' ? 'Over' : 'Under'))
  next = next.replace(/([+-])(\d+(?:\.\d+)?)/g, (_, sign, num) => (sign === '-' ? `+${num}` : `-${num}`))
  return next
}

export default function AssistedBuilder() {
  const { build, isLoading: afbLoading, error: afbError, errorDetails } = useAfb()
  const { run: runTerminal, isLoading: terminalLoading, error: terminalError, errorDetails: terminalErrorDetails } = useTerminal()
  const [state, dispatch] = useReducer(swantailReducer, initialSwantailState)
  const voice: 'analyst' = 'analyst'
  const [rightTab, setRightTab] = useState<'scripts' | 'stats'>('scripts')
  const [terminalData, setTerminalData] = useState<TerminalResponse | null>(null)

  // Unified loading/error state
  const isLoading = afbLoading || terminalLoading
  const error = afbError || terminalError

  const matchup = state.matchup
  const lineFocus = state.anchor
  const signals = state.signals           // Normalized tags for API calls
  const signals_raw = state.signals_raw   // Original text for display
  const oddsPaste = state.oddsPaste
  const data = state.data

  const oddsEntries = useMemo(() => parseOddsPaste(oddsPaste), [oddsPaste])

  // Unified action handler for Prop / Story / Parlay
  // Calls distinct terminal routes: /api/terminal/prop, /api/terminal/story, /api/terminal/parlay
  const onAction = useCallback(async (mode: RunMode) => {
    if (!matchup.trim()) return
    track('ui_action_clicked', { mode, voice, anglesCount: signals.length })
    try {
      dispatch({ type: 'set_data', value: null })
      setTerminalData(null)

      const res = await runTerminal(mode, {
        matchup: matchup.trim(),
        signals,
        anchor: lineFocus.trim() || undefined,
        odds_paste: oddsPaste || undefined,
      })

      if (res.ok) {
        setTerminalData(res.data)
        setRightTab('scripts')
        track('ui_action_success', { mode, alertCount: res.data.alerts.length })
      } else {
        track('ui_action_error', { mode, message: res.error?.message })
      }
    } catch (e) {
      track('ui_action_error', { mode, message: (e as any)?.message })
    }
  }, [matchup, lineFocus, signals, oddsPaste, runTerminal])

  const onOpposite = useCallback(async (scriptIndex: number) => {
    if (!matchup.trim()) return
    // Add contrarian signals for opposite case
    const oppositeSignals = Array.from(new Set([
      ...signals,
      'contrarian' as const,
      'game_script' as const,
    ]))
    const oppositeLine = invertLineFocus(lineFocus)
    track('ui_build_clicked', { voice, anglesCount: oppositeSignals.length, opposite: true, scriptIndex })
    try {
      dispatch({ type: 'set_data', value: null })
      const res = await build({
        matchup: matchup.trim(),
        lineFocus: oppositeLine.trim() || undefined,
        angles: oppositeSignals,
        voice,
        userSuppliedOdds: oddsEntries.map(o => ({ leg: o.selectionText, americanOdds: o.americanOdds }))
      })
      if (res.ok) {
        dispatch({ type: 'set_data', value: res.data })
        // After a successful build, move the user to results immediately.
        setRightTab('scripts')
        track('ui_build_success')
      } else {
        track('ui_build_error', { message: res.error?.message })
      }
    } catch (e) {
      track('ui_build_error', { message: (e as any)?.message })
    }
  }, [matchup, lineFocus, signals, voice, oddsEntries, build])

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

  useEffect(() => {
    if (isLoading) {
      dispatch({ type: 'set_build', value: { state: 'running', startedAt: Date.now() } })
      return
    }
    if (errorDetails || terminalErrorDetails) {
      const err = errorDetails || (terminalErrorDetails ? {
        code: terminalErrorDetails.code,
        status: terminalErrorDetails.status,
        message: terminalErrorDetails.message,
      } : null)
      if (err) dispatch({ type: 'set_build', value: { state: 'error', error: err } })
      return
    }
    if (data || terminalData) {
      dispatch({ type: 'set_build', value: { state: 'success', receivedAt: Date.now() } })
      return
    }
    if (matchup.trim()) {
      dispatch({ type: 'set_build', value: { state: 'ready' } })
    } else {
      dispatch({ type: 'set_build', value: { state: 'idle' } })
    }
  }, [isLoading, errorDetails, terminalErrorDetails, data, terminalData, matchup])

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
              lineFocus={lineFocus}
              angles={signals_raw}
              oddsPaste={oddsPaste}
              isLoading={isLoading}
              error={error}
              data={data}
              onChangeMatchup={(value) => dispatch({ type: 'set_matchup', value })}
              onChangeLineFocus={(value) => dispatch({ type: 'set_anchor', value })}
              onChangeAngles={(value) => {
                // Normalize free-text signals to canonical tags
                const { signals, signals_raw } = normalizeSignals(value.join(', '))
                dispatch({ type: 'set_signals', signals, raw: signals_raw })
              }}
              onChangeOddsPaste={(value) => dispatch({ type: 'set_odds', value })}
              onAction={onAction}
              onStatus={(s) => {
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
              }}
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
              {(['scripts', 'stats'] as const).map(tab => (
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
                  {tab === 'scripts' ? 'Scripts' : 'Stats'}
                </button>
              ))}
            </div>

            {rightTab === 'scripts' && (
              <SwantailScriptsView data={data} oddsEntries={oddsEntries} onOpposite={onOpposite} />
            )}

            {rightTab === 'stats' && (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
                <div className="text-xs uppercase tracking-wide text-white/50">System status</div>
                {state.preflight.state === 'booting' ? (
                  <div className="mt-3 text-white/60">Open Terminal to run preflights.</div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/50">Schedule</div>
                        <div className="mt-1 text-white/80">
                          {state.preflight.checks.schedule.state.toUpperCase()}
                          {typeof state.preflight.checks.schedule.games === 'number' ? ` • ${state.preflight.checks.schedule.games} games` : ''}
                        </div>
                        <div className="mt-1 text-[12px] text-white/50">
                          {state.preflight.checks.schedule.season ? `Season ${state.preflight.checks.schedule.season}` : ''}{state.preflight.checks.schedule.week ? ` • Week ${state.preflight.checks.schedule.week}` : ''}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/50">Lines</div>
                        <div className="mt-1 text-white/80">
                          {state.preflight.checks.lines.state.toUpperCase()}
                          {state.preflight.checks.lines.mode ? ` • ${state.preflight.checks.lines.mode}` : ''}
                        </div>
                        <div className="mt-1 text-[12px] text-white/50">
                          {state.preflight.checks.lines.mode === 'fallback' ? 'Using fallback/manual pricing.' : ''}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-white/50">Builder</div>
                      <div className="mt-1 text-white/80">
                        {state.preflight.checks.backend.state.toUpperCase()}
                        {typeof state.preflight.checks.backend.configured === 'boolean' ? ` • configured: ${state.preflight.checks.backend.configured ? 'yes' : 'no'}` : ''}
                        {typeof state.preflight.checks.backend.probeOk === 'boolean' ? ` • health: ${state.preflight.checks.backend.probeOk ? 'ok' : 'no'}` : ''}
                      </div>
                      <div className="mt-1 text-[12px] text-white/50">
                        {state.preflight.checks.backend.state === 'degraded' ? 'Health probe failed; builds may still work.' : ''}
                      </div>
                    </div>
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
