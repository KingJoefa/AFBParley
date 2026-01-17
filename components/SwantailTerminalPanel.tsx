'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SwantailResponse } from '@/lib/swantail/schema'
import { deriveYearWeekFromSchedule } from '@/lib/swantail/preflight'

type CheckState = 'booting' | 'ready' | 'degraded' | 'error'

export type SwantailSystemStatus = {
  phase: 'booting' | 'ready' | 'running' | 'error'
  schedule: { state: CheckState; games?: number; week?: number; season?: number; error?: string }
  lines: { state: CheckState; mode?: 'api' | 'fallback' | 'missing' | 'degraded'; expectedRel?: string; expectedAbs?: string; error?: string }
  backend: { state: CheckState; configured?: boolean; probeOk?: boolean; error?: string }
  lastChecked?: string
}

type OutputLine = { id: string; text: string; tone?: 'muted' | 'ok' | 'warn' | 'err' }

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function fmtTone(tone: OutputLine['tone']) {
  switch (tone) {
    case 'ok': return 'text-emerald-200'
    case 'warn': return 'text-amber-200'
    case 'err': return 'text-red-200'
    default: return 'text-white/70'
  }
}

function parseQuickMatchup(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  // Accept common patterns; we keep the user's text verbatim after light normalization.
  if (/[a-z0-9].*(@|vs\.?|v\.?| at ).*[a-z0-9]/i.test(v)) {
    return v.replace(/\s+@\s+/g, ' @ ').replace(/\s+vs\.?\s+/gi, ' vs ').replace(/\s+at\s+/gi, ' @ ')
  }
  // Accept "SF SEA" (two tokens) and coerce into "@"
  const tokens = v.split(/\s+/).filter(Boolean)
  if (tokens.length === 2) return `${tokens[0]} @ ${tokens[1]}`
  return null
}

export default function SwantailTerminalPanel(props: {
  matchup: string
  lineFocus: string
  angles: string[]
  oddsPaste?: string
  isLoading: boolean
  error?: string | null
  data: SwantailResponse | null
  onChangeMatchup: (value: string) => void
  onChangeLineFocus?: (value: string) => void
  onChangeAngles?: (value: string[]) => void
  onChangeOddsPaste?: (value: string) => void
  onBuild: () => void
  onStatus?: (status: SwantailSystemStatus) => void
}) {
  const { matchup, lineFocus, angles, oddsPaste, isLoading, error, data, onChangeMatchup, onChangeLineFocus, onChangeAngles, onChangeOddsPaste, onBuild, onStatus } = props

  const [phase, setPhase] = useState<SwantailSystemStatus['phase']>('booting')
  const [schedule, setSchedule] = useState<SwantailSystemStatus['schedule']>({ state: 'booting' })
  const [lines, setLines] = useState<SwantailSystemStatus['lines']>({ state: 'booting' })
  const [backend, setBackend] = useState<SwantailSystemStatus['backend']>({ state: 'booting' })
  const [games, setGames] = useState<Array<{ id: string; display: string; time: string; isPopular?: boolean }>>([])

  const [buffer, setBuffer] = useState<OutputLine[]>(() => ([
    { id: uid(), text: 'initializing terminal…', tone: 'muted' },
  ]))
  const [draft, setDraft] = useState('')
  const [anchorDraft, setAnchorDraft] = useState('')
  const [signalDraft, setSignalDraft] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [inputTouched, setInputTouched] = useState(false)

  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const didBootRef = useRef(false)

  const status: SwantailSystemStatus = useMemo(() => ({
    phase,
    schedule,
    lines,
    backend,
    lastChecked: new Date().toISOString(),
  }), [phase, schedule, lines, backend])

  useEffect(() => {
    onStatus?.(status)
  }, [status, onStatus])

  const append = useCallback((text: string, tone: OutputLine['tone'] = 'muted') => {
    setBuffer(prev => [...prev, { id: uid(), text, tone }])
  }, [])

  useEffect(() => {
    // Auto-scroll on new lines
    const el = scrollerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [buffer.length])

  useEffect(() => {
    setAnchorDraft(lineFocus || '')
  }, [lineFocus])

  useEffect(() => {
    if (angles.length) {
      setSignalDraft(angles.join(', '))
    }
  }, [angles])

  const runPreflights = useCallback(async () => {
    setPhase('booting')
    setSchedule({ state: 'booting' })
    setLines({ state: 'booting' })
    setBackend({ state: 'booting' })

    append('loading modules… done', 'muted')
    append('running preflight checks…', 'muted')

    let hardError = false
    let degraded = false
    let derivedYear = 2025
    let derivedWeek = 20
    let schedulePayload: any | null = null

    // Schedule
    try {
      const res = await fetch('/api/nfl/schedule', { cache: 'no-store' })
      if (!res.ok) throw new Error(`schedule status ${res.status}`)
      const json = await res.json()
      schedulePayload = json
      const list = Array.isArray(json?.games) ? json.games : []
      const derived = deriveYearWeekFromSchedule({ scheduleJson: json, fallbackYear: derivedYear, fallbackWeek: derivedWeek })
      derivedYear = derived.year
      derivedWeek = derived.week
      setGames(list)
      if (derived.degraded) {
        degraded = true
        setSchedule({ state: 'degraded', games: list.length, week: derivedWeek, season: derivedYear, error: 'missing season/week in schedule payload' })
        append(`schedule… degraded (using ${derivedYear} wk ${derivedWeek})`, 'warn')
      } else {
        setSchedule({ state: 'ready', games: list.length, week: derivedWeek, season: derivedYear })
        append(`schedule… ready (${list.length} games)`, 'ok')
      }
    } catch (e: any) {
      degraded = true
      // Fall back to safe defaults; keep terminal usable.
      derivedYear = 2025
      derivedWeek = 20
      setSchedule({ state: 'degraded', season: derivedYear, week: derivedWeek, error: e?.message || 'schedule failed' })
      append(`schedule… degraded (failed; using ${derivedYear} wk ${derivedWeek})`, 'warn')
    }

    // Lines
    try {
      // Use derived year/week from schedule. Include a matchup so API ping can be real.
      const sampleMatchup = matchup.trim() || (Array.isArray(schedulePayload?.games) && schedulePayload.games[0]?.display) || ''
      const u = new URL('/api/lines/status', window.location.origin)
      u.searchParams.set('year', String(derivedYear))
      u.searchParams.set('week', String(derivedWeek))
      if (sampleMatchup) u.searchParams.set('matchup', sampleMatchup)
      const res = await fetch(u.toString(), { cache: 'no-store' })
      if (!res.ok) throw new Error(`lines status ${res.status}`)
      const json = await res.json()
      const mode = (json?.mode as SwantailSystemStatus['lines']['mode']) || 'degraded'
      const expectedRel = String(json?.expected?.rel || '')
      const expectedAbs = String(json?.expected?.abs || '')
      if (mode === 'api') {
        setLines({ state: 'ready', mode, expectedRel, expectedAbs })
        append(`lines… ready (api wk-${String(derivedWeek).padStart(2, '0')})`, 'ok')
      } else if (mode === 'fallback') {
        setLines({ state: 'ready', mode, expectedRel, expectedAbs })
        append(`lines… ready (fallback ${expectedRel.split('/').pop()})`, 'warn')
      } else if (mode === 'missing') {
        setLines({ state: 'error', mode, expectedRel, expectedAbs })
        append(`lines… attention (missing ${expectedRel.split('/').pop()}; expected ${expectedRel})`, 'err')
        hardError = true
      } else {
        // degraded
        const hasFallback = Boolean(json?.fallback?.exists)
        setLines({ state: hasFallback ? 'degraded' : 'error', mode, expectedRel, expectedAbs, error: String(json?.api?.error || '') })
        append(
          hasFallback
            ? `lines… degraded (api unreachable; fallback ${expectedRel.split('/').pop()})`
            : `lines… attention (api unreachable; missing ${expectedRel.split('/').pop()}; expected ${expectedRel})`,
          hasFallback ? 'warn' : 'err'
        )
        if (!hasFallback) hardError = true
        else degraded = true
      }
    } catch (e: any) {
      setLines({ state: 'degraded', error: e?.message || 'lines status failed' })
      append('lines… unknown (status check failed)', 'warn')
      degraded = true
    }

    // Backend (wrapper health/config)
    try {
      const res = await fetch('/api/afb/health', { cache: 'no-store' })
      if (!res.ok) throw new Error(`afb health ${res.status}`)
      const json = await res.json()
      const configured = Boolean(json?.wrapper?.configured)
      const probeOk = Boolean(json?.wrapper?.probe?.ok)
      if (!configured) {
        setBackend({ state: 'error', configured, probeOk })
        append('builder… error (not configured)', 'err')
        hardError = true
      } else if (!probeOk) {
        setBackend({ state: 'degraded', configured, probeOk })
        append('builder… ready (degraded)', 'warn')
      } else {
        setBackend({ state: 'ready', configured, probeOk })
        append('builder… ready', 'ok')
      }
    } catch (e: any) {
      setBackend({ state: 'degraded', error: e?.message || 'health failed' })
      append('builder… unknown (health check failed)', 'warn')
    }

    setPhase(hardError ? 'error' : 'ready')
    append(
      hardError ? 'system: attention required' : (degraded ? 'system: DEGRADED' : 'system: READY'),
      hardError ? 'warn' : (degraded ? 'warn' : 'ok')
    )
    append('tip: pick a featured matchup below, then press Build.', 'muted')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [append])

  useEffect(() => {
    // React Strict Mode runs effects twice in dev; guard to avoid duplicate boot output.
    if (didBootRef.current) return
    didBootRef.current = true
    runPreflights()
  }, [runPreflights])

  useEffect(() => {
    if (isLoading) setPhase('running')
    else if (phase === 'running') setPhase('ready')
  }, [isLoading, phase])

  // Mirror build output into terminal buffer
  useEffect(() => {
    if (!data) return
    append('received scripts.', 'ok')
    for (const s of data.scripts.slice(0, 3)) {
      append(`- ${s.title}`, 'muted')
    }
    append('open “Scripts” tab to view the full cards.', 'muted')
  }, [data, append])

  useEffect(() => {
    if (!error) return
    append(`error: ${error}`, 'err')
  }, [error, append])

  const featuredGames = useMemo(() => {
    const featured = games.filter(g => g.isPopular)
    return featured.length ? featured : games
  }, [games])

  const canBuild = Boolean(parseQuickMatchup(matchup) || matchup.trim()) && !isLoading && phase !== 'booting'

  const onHelp = useCallback(() => {
    append('help:', 'muted')
    append('- pick a matchup chip OR type one like "SF @ SEA"', 'muted')
    append('- optionally set Market Anchor/Angles in the form on the left', 'muted')
    append('- press Build to generate scripts', 'muted')
  }, [append])

  const onClear = useCallback(() => {
    setBuffer([{ id: uid(), text: 'cleared.', tone: 'muted' }])
  }, [])

  const onReset = useCallback(() => {
    onChangeMatchup('')
    setDraft('')
    setInputTouched(false)
    onClear()
    append('resetting…', 'muted')
    runPreflights()
  }, [append, onChangeMatchup, onClear, runPreflights])

  const onSubmitMatchup = useCallback(() => {
    const parsed = parseQuickMatchup(draft)
    if (!parsed) {
      append('hint: try "SF @ SEA" or "49ers @ Seahawks".', 'warn')
      return
    }
    onChangeMatchup(parsed)
    append(`matchup set: ${parsed}`, 'ok')
  }, [append, draft, onChangeMatchup])

  const onPickMatchup = useCallback((value: string) => {
    onChangeMatchup(value)
    append(`matchup set: ${value}`, 'ok')
  }, [append, onChangeMatchup])

  const onApplyAnchor = useCallback(() => {
    if (!onChangeLineFocus) return
    const next = anchorDraft.trim()
    onChangeLineFocus(next)
    append(next ? `anchor set: ${next}` : 'anchor cleared', next ? 'ok' : 'muted')
  }, [anchorDraft, onChangeLineFocus, append])

  const onApplySignals = useCallback(() => {
    if (!onChangeAngles) return
    const next = signalDraft
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    onChangeAngles(next)
    append(next.length ? `signals set: ${next.join(', ')}` : 'signals cleared', next.length ? 'ok' : 'muted')
  }, [signalDraft, onChangeAngles, append])

  const badge = useMemo(() => {
    if (phase === 'running' || isLoading) return { label: 'BUSY', cls: 'bg-amber-500/15 text-amber-200 border-amber-400/20' }
    const anyError = schedule.state === 'error' || lines.state === 'error' || backend.state === 'error'
    const anyDegraded = schedule.state === 'degraded' || lines.state === 'degraded' || backend.state === 'degraded'
    if (anyError || phase === 'error') return { label: 'ATTN', cls: 'bg-red-500/15 text-red-200 border-red-400/20' }
    if (anyDegraded) return { label: 'DEGRADED', cls: 'bg-amber-500/15 text-amber-200 border-amber-400/20' }
    if (phase === 'ready') return { label: 'READY', cls: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/20' }
    return { label: 'BOOT', cls: 'bg-white/10 text-white/70 border-white/10' }
  }, [phase, isLoading])

  return (
    <div className="rounded-3xl border border-white/10 bg-black/30 shadow-xl">
      {/* chrome */}
      <div className="flex items-center justify-between gap-3 rounded-t-3xl border-b border-white/10 bg-black/40 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
          </div>
          <div className="text-xs text-white/50">~/swantail terminal</div>
        </div>
        <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${badge.cls}`}>
          {badge.label}
        </div>
      </div>

      {/* buffer */}
      <div className="grid gap-4 p-4">
        <div
          ref={scrollerRef}
          className="h-[380px] overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-[12px] leading-relaxed"
        >
          <div className="mb-3 text-white/60">SWANTAIL</div>
          {buffer.map(line => (
            <div key={line.id} className={fmtTone(line.tone)}>{line.text}</div>
          ))}
          <div className="mt-4 text-white/40">
            {matchup.trim() ? `current matchup: ${matchup}` : 'no matchup selected'}
            {lineFocus.trim() ? ` • anchor: ${lineFocus}` : ''}
            {angles.length ? ` • angles: ${angles.length}` : ''}
          </div>
        </div>

        {/* chips */}
        <div className="flex flex-wrap gap-2">
          {featuredGames.slice(0, 6).map(g => (
            <button
              key={g.id}
              type="button"
              onClick={() => onPickMatchup(g.display)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/80 hover:bg-white/10"
            >
              {g.display}
            </button>
          ))}
          <button
            type="button"
            onClick={() => runPreflights()}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/10"
          >
            Re-check
          </button>
        </div>

        {/* prompt + actions */}
        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onBuild} disabled={!canBuild} className="rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
              {isLoading ? 'Building…' : 'Build'}
            </button>
            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10"
            >
              {showAdvanced ? 'Hide inputs' : 'Inputs'}
            </button>
            <button type="button" onClick={onHelp} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10">
              Help
            </button>
            <button type="button" onClick={onClear} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10">
              Clear
            </button>
            <button type="button" onClick={onReset} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10">
              Reset
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-[11px] text-white/50">Matchup</div>
            <input
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setInputTouched(true) }}
              onKeyDown={(e) => { if (e.key === 'Enter') onSubmitMatchup() }}
              placeholder="Type a matchup (e.g., SF @ SEA)"
              className={`flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-400/30 ${inputTouched ? '' : 'opacity-70'}`}
            />
            <button
              type="button"
              onClick={onSubmitMatchup}
              className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white hover:bg-white/20"
            >
              Set
            </button>
          </div>

          {showAdvanced && (
            <div className="grid gap-3">
              <div className="grid gap-2">
                <div className="text-[11px] uppercase tracking-wide text-white/50">Market anchor</div>
                <div className="flex items-center gap-2">
                  <input
                    value={anchorDraft}
                    onChange={(e) => setAnchorDraft(e.target.value)}
                    placeholder="Over 44.5 · SEA -2.5 · First Half Under"
                    className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                  />
                  <button
                    type="button"
                    onClick={onApplyAnchor}
                    disabled={!onChangeLineFocus}
                    className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white hover:bg-white/20 disabled:opacity-50"
                  >
                    Set
                  </button>
                </div>
              </div>

              <div className="grid gap-2">
                <div className="text-[11px] uppercase tracking-wide text-white/50">Signals</div>
                <div className="flex items-center gap-2">
                  <input
                    value={signalDraft}
                    onChange={(e) => setSignalDraft(e.target.value)}
                    placeholder="Pace skew, Pressure mismatch"
                    className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                  />
                  <button
                    type="button"
                    onClick={onApplySignals}
                    disabled={!onChangeAngles}
                    className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white hover:bg-white/20 disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
              </div>

              <div className="grid gap-2">
                <div className="text-[11px] uppercase tracking-wide text-white/50">Book odds (optional)</div>
                <textarea
                  value={oddsPaste ?? ''}
                  onChange={(e) => onChangeOddsPaste?.(e.target.value)}
                  placeholder="RB1 Anytime TD +120&#10;Alt Total Over 44.5 -110"
                  className="min-h-[72px] w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

