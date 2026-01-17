'use client'
import { useCallback, useMemo, useState } from 'react'
import { useAfb } from '@/app/hooks/useAfb'
import SwantailBuilderForm from '@/components/SwantailBuilderForm'
import SwantailOddsPaste from '@/components/SwantailOddsPaste'
import SwantailScriptsView from '@/components/SwantailScriptsView'
import SwantailTerminalPanel, { type SwantailSystemStatus } from '@/components/SwantailTerminalPanel'
import { matchOdds, parseOddsPaste } from '@/lib/swantail/odds'
import type { SwantailResponse } from '@/lib/swantail/schema'
import { track } from '@/lib/telemetry'

function invertLineFocus(value: string): string {
  if (!value) return value
  let next = value
  next = next.replace(/\bOver\b/gi, (m) => (m.toLowerCase() === 'over' ? 'Under' : 'Over'))
  next = next.replace(/\bUnder\b/gi, (m) => (m.toLowerCase() === 'under' ? 'Over' : 'Under'))
  next = next.replace(/([+-])(\d+(?:\.\d+)?)/g, (_, sign, num) => (sign === '-' ? `+${num}` : `-${num}`))
  return next
}

export default function AssistedBuilder() {
  const { build, isLoading, error } = useAfb()
  const [matchup, setMatchup] = useState('')
  const [lineFocus, setLineFocus] = useState('')
  const [angles, setAngles] = useState<string[]>([])
  const voice: 'analyst' = 'analyst'
  const [oddsPaste, setOddsPaste] = useState('')
  const [data, setData] = useState<SwantailResponse | null>(null)
  const [rightTab, setRightTab] = useState<'terminal' | 'scripts' | 'stats'>('terminal')
  const [systemStatus, setSystemStatus] = useState<SwantailSystemStatus | null>(null)

  const oddsEntries = useMemo(() => parseOddsPaste(oddsPaste), [oddsPaste])

  const onBuild = useCallback(async () => {
    if (!matchup.trim()) return
    track('ui_build_clicked', { voice, anglesCount: angles.length })
    try {
      setData(null)
      const res = await build({
        matchup: matchup.trim(),
        lineFocus: lineFocus.trim() || undefined,
        angles,
        voice,
        userSuppliedOdds: oddsEntries.map(o => ({ leg: o.selectionText, americanOdds: o.americanOdds }))
      })
      setData(res as SwantailResponse)
      // After a successful build, move the user to results immediately.
      setRightTab('scripts')
      track('ui_build_success')
    } catch (e) {
      track('ui_build_error', { message: (e as any)?.message })
    }
  }, [matchup, lineFocus, angles, voice, oddsEntries, build])

  const onOpposite = useCallback(async (scriptIndex: number) => {
    if (!matchup.trim()) return
    const oppositeAngles = Array.from(new Set([
      ...angles,
      'opposite case',
      'invert assumptions'
    ]))
    const oppositeLine = invertLineFocus(lineFocus)
    track('ui_build_clicked', { voice, anglesCount: oppositeAngles.length, opposite: true, scriptIndex })
    try {
      setData(null)
      const res = await build({
        matchup: matchup.trim(),
        lineFocus: oppositeLine.trim() || undefined,
        angles: oppositeAngles,
        voice,
        userSuppliedOdds: oddsEntries.map(o => ({ leg: o.selectionText, americanOdds: o.americanOdds }))
      })
      setData(res as SwantailResponse)
      // After a successful build, move the user to results immediately.
      setRightTab('scripts')
      track('ui_build_success')
    } catch (e) {
      track('ui_build_error', { message: (e as any)?.message })
    }
  }, [matchup, lineFocus, angles, voice, oddsEntries, build])

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <SwantailBuilderForm
              matchup={matchup}
              lineFocus={lineFocus}
              angles={angles}
              isLoading={isLoading}
              onChangeMatchup={setMatchup}
              onChangeLineFocus={setLineFocus}
              onChangeAngles={setAngles}
              onBuild={onBuild}
            />

            <SwantailOddsPaste value={oddsPaste} onChange={setOddsPaste} />

            {showNoMatches && (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                No matches applied.
              </div>
            )}
          </div>

          <div className="space-y-4">
            {error && (
              <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            {/* Right panel tabs */}
            <div className="flex items-center gap-2">
              {(['terminal', 'scripts', 'stats'] as const).map(tab => (
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
                  {tab === 'terminal' ? 'Terminal' : tab === 'scripts' ? 'Scripts' : 'Stats'}
                </button>
              ))}
            </div>

            {rightTab === 'terminal' && (
              <SwantailTerminalPanel
                matchup={matchup}
                lineFocus={lineFocus}
                angles={angles}
                isLoading={isLoading}
                error={error}
                data={data}
                onChangeMatchup={setMatchup}
                onBuild={onBuild}
                onStatus={(s) => setSystemStatus(s)}
              />
            )}

            {rightTab === 'scripts' && (
              <SwantailScriptsView data={data} oddsEntries={oddsEntries} onOpposite={onOpposite} />
            )}

            {rightTab === 'stats' && (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
                <div className="text-xs uppercase tracking-wide text-white/50">System status</div>
                {!systemStatus ? (
                  <div className="mt-3 text-white/60">Open Terminal to run preflights.</div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/50">Schedule</div>
                        <div className="mt-1 text-white/80">
                          {systemStatus.schedule.state.toUpperCase()}
                          {typeof systemStatus.schedule.games === 'number' ? ` • ${systemStatus.schedule.games} games` : ''}
                        </div>
                        <div className="mt-1 text-[12px] text-white/50">
                          {systemStatus.schedule.season ? `Season ${systemStatus.schedule.season}` : ''}{systemStatus.schedule.week ? ` • Week ${systemStatus.schedule.week}` : ''}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/50">Lines</div>
                        <div className="mt-1 text-white/80">
                          {systemStatus.lines.state.toUpperCase()}
                          {systemStatus.lines.mode ? ` • ${systemStatus.lines.mode}` : ''}
                        </div>
                        <div className="mt-1 text-[12px] text-white/50">
                          {systemStatus.lines.mode === 'fallback' ? 'Using fallback/manual pricing.' : ''}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-white/50">Builder</div>
                      <div className="mt-1 text-white/80">
                        {systemStatus.backend.state.toUpperCase()}
                        {typeof systemStatus.backend.configured === 'boolean' ? ` • configured: ${systemStatus.backend.configured ? 'yes' : 'no'}` : ''}
                        {typeof systemStatus.backend.probeOk === 'boolean' ? ` • health: ${systemStatus.backend.probeOk ? 'ok' : 'no'}` : ''}
                      </div>
                      <div className="mt-1 text-[12px] text-white/50">
                        {systemStatus.backend.state === 'degraded' ? 'Health probe failed; builds may still work.' : ''}
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
