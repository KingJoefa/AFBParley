'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SwantailResponse } from '@/lib/swantail/schema'
import { deriveYearWeekFromSchedule } from '@/lib/swantail/preflight'
import {
  type RunMode,
  type RunState,
  type AgentRunState,
  AGENT_META,
  createInitialRunState,
  resetRun,
} from '@/lib/terminal/run-state'
import { computeInputsHash, type AnalysisMeta } from '@/lib/terminal/terminal-state'

type CheckState = 'booting' | 'ready' | 'degraded' | 'error'

// Re-export for consumers
export type { RunMode, RunState, AgentRunState }

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

function parseMatchupSides(raw: string): { away?: string; home?: string } {
  const cleaned = raw.split('(')[0].trim()
  const parts = cleaned.split(/\s*@\s*/i)
  if (parts.length !== 2) return {}
  return { away: parts[0]?.trim(), home: parts[1]?.trim() }
}

export default function SwantailTerminalPanel(props: {
  matchup: string
  angles: string[]
  oddsPaste?: string
  isLoading: boolean
  runState?: RunState
  error?: string | null
  data: SwantailResponse | null
  // Split action props - enforces two-phase architecture
  analysisMeta: AnalysisMeta | null
  isBuilding: boolean                             // Build-in-flight flag (separate from scan loading)
  selectedAgents: AgentRunState['id'][]           // Lifted state for hash determinism
  anchors: string[]
  scriptBias: string[]
  onScan: (options?: { agentIds?: AgentRunState['id'][] }) => void // Phase 1 only
  onBuild: () => void                             // Phase 2 only
  onSelectedAgentsChange: (agents: AgentRunState['id'][]) => void // Agent toggle handler
  onChangeAnchors: (values: string[]) => void
  onChangeScriptBias: (values: string[]) => void
  // Other handlers
  onChangeMatchup: (value: string) => void
  onChangeAngles?: (value: string[]) => void
  onChangeOddsPaste?: (value: string) => void
  onRunStateChange?: (state: RunState) => void
  onStatus?: (status: SwantailSystemStatus) => void
}) {
  const {
    matchup, angles, oddsPaste, isLoading,
    runState: externalRunState, error, data,
    analysisMeta, isBuilding, selectedAgents, anchors, scriptBias,
    onScan, onBuild, onSelectedAgentsChange, onChangeAnchors, onChangeScriptBias,
    onChangeMatchup, onChangeAngles, onChangeOddsPaste,
    onRunStateChange, onStatus
  } = props

  const [phase, setPhase] = useState<SwantailSystemStatus['phase']>('booting')
  const [schedule, setSchedule] = useState<SwantailSystemStatus['schedule']>({ state: 'booting' })
  const [lines, setLines] = useState<SwantailSystemStatus['lines']>({ state: 'booting' })
  const [backend, setBackend] = useState<SwantailSystemStatus['backend']>({ state: 'booting' })

  // Shared run state for agent orchestration
  const [internalRunState, setInternalRunState] = useState<RunState>(createInitialRunState)
  const runState = externalRunState ?? internalRunState
  const [games, setGames] = useState<Array<{ id: string; display: string; time: string; isPopular?: boolean }>>([])

  const [buffer, setBuffer] = useState<OutputLine[]>(() => ([
    { id: uid(), text: 'initializing terminal…', tone: 'muted' },
  ]))
  const [draft, setDraft] = useState('')
  const [signalDraft, setSignalDraft] = useState('')
  const [oddsDraft, setOddsDraft] = useState('')
  const [matchupStatus, setMatchupStatus] = useState<'idle' | 'ok' | 'err'>('idle')
  const [oddsStatus, setOddsStatus] = useState<'idle' | 'ok' | 'err'>('idle')

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
    setDraft(matchup || '')
  }, [matchup])

  useEffect(() => {
    setSignalDraft(angles.length ? angles.join(', ') : '')
  }, [angles])

  useEffect(() => {
    setOddsDraft(oddsPaste || '')
  }, [oddsPaste])

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
    append('tip: pick a featured matchup below, then press Build (Story).', 'muted')
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

  const matchupSides = useMemo(() => parseMatchupSides(matchup), [matchup])
  const anchorGroups = useMemo(() => ([
    {
      id: 'total',
      label: 'TOTAL',
      options: [
        { id: 'total_over', label: 'Over' },
        { id: 'total_under', label: 'Under' },
      ],
    },
    {
      id: 'side',
      label: 'SIDE',
      options: [
        { id: 'side_home', label: matchupSides.home ? `${matchupSides.home} win` : 'Home win' },
        { id: 'side_away', label: matchupSides.away ? `${matchupSides.away} win` : 'Away win' },
      ],
    },
    {
      id: 'spread',
      label: 'SPREAD',
      options: [
        { id: 'spread_home', label: matchupSides.home ? `${matchupSides.home} cover` : 'Home cover' },
        { id: 'spread_away', label: matchupSides.away ? `${matchupSides.away} cover` : 'Away cover' },
      ],
    },
  ]), [matchupSides])
  const scriptBiasOptions = useMemo(() => ([
    'Shootout',
    'Grind',
    'Pass-heavy',
    'Run-heavy',
  ]), [])

  const canAct = Boolean(parseQuickMatchup(matchup) || matchup.trim()) && !isLoading && phase !== 'booting'

  // Update run state (internal or notify parent)
  const updateRunState = useCallback((newState: RunState) => {
    setInternalRunState(newState)
    onRunStateChange?.(newState)
  }, [onRunStateChange])

  // Compute current inputs hash for staleness detection
  const analysisPayloadHash = useMemo(() =>
    computeInputsHash(matchup, anchors, scriptBias, angles, oddsPaste || '', selectedAgents),
    [matchup, anchors, scriptBias, angles, oddsPaste, selectedAgents]
  )

  // Compute canBuild: requires successful scan with MATCHING hash (not stale)
  const canBuild = useMemo(() => {
    return canAct &&
      anchors.length > 0 &&
      analysisMeta?.status === 'success' &&
      analysisMeta?.scan_hash === analysisPayloadHash &&  // Enforce hash match
      !isBuilding
  }, [canAct, anchors.length, analysisMeta, analysisPayloadHash, isBuilding])

  const onHelp = useCallback(() => {
    append('help:', 'muted')
    append('- pick a matchup chip OR type one like "SF @ SEA"', 'muted')
    append('- toggle agents, then run Scan to execute selected agents', 'muted')
    append('- select at least one anchor, then add script bias if desired', 'muted')
    append('- BUILD SCRIPT commits your thesis + evidence', 'muted')
  }, [append])

  const onClear = useCallback(() => {
    setBuffer([{ id: uid(), text: 'cleared.', tone: 'muted' }])
    updateRunState(resetRun())
  }, [updateRunState])

  const onReset = useCallback(() => {
    onChangeMatchup('')
    setDraft('')
    onChangeAnchors([])
    onChangeScriptBias([])
    if (onChangeAngles) {
      onChangeAngles([])
      setSignalDraft('')
    }
    if (onChangeOddsPaste) {
      onChangeOddsPaste('')
      setOddsDraft('')
      setOddsStatus('idle')
    }
    onClear()
    updateRunState(resetRun())
    append('resetting…', 'muted')
    runPreflights()
  }, [append, onChangeAnchors, onChangeAngles, onChangeMatchup, onChangeOddsPaste, onChangeScriptBias, onClear, runPreflights, updateRunState])


  const applyMatchupContext = useCallback((nextMatchup: string) => {
    void nextMatchup
    onChangeAnchors([])
    onChangeScriptBias([])
    if (onChangeAngles) {
      onChangeAngles([])
      setSignalDraft('')
    }
    if (onChangeOddsPaste) {
      onChangeOddsPaste('')
      setOddsDraft('')
      setOddsStatus('idle')
    }
  }, [onChangeAnchors, onChangeAngles, onChangeOddsPaste, onChangeScriptBias])

  const onSubmitMatchup = useCallback((nextRaw: string) => {
    const trimmed = nextRaw.trim()
    if (trimmed === matchup.trim()) {
      setMatchupStatus('ok')
      return
    }
    if (!trimmed) {
      onChangeMatchup('')
      setMatchupStatus('ok')
      append('matchup cleared', 'muted')
      return
    }
    const parsed = parseQuickMatchup(trimmed)
    if (!parsed) {
      setMatchupStatus('err')
      append('matchup invalid (try "SF @ SEA").', 'warn')
      return
    }
    onChangeMatchup(parsed)
    setDraft(parsed)
    setMatchupStatus('ok')
    append(`matchup set: ${parsed}`, 'ok')
    void applyMatchupContext(parsed)
  }, [append, applyMatchupContext, matchup, onChangeMatchup])

  const onPickMatchup = useCallback((value: string) => {
    onChangeMatchup(value)
    setDraft(value)
    setMatchupStatus('ok')
    append(`matchup set: ${value}`, 'ok')
    void applyMatchupContext(value)
  }, [append, applyMatchupContext, onChangeMatchup])

  const onApplyOdds = useCallback((nextRaw: string) => {
    if (!onChangeOddsPaste) return
    const next = nextRaw.trim()
    if (next === (oddsPaste || '').trim()) {
      setOddsStatus('ok')
      return
    }
    onChangeOddsPaste(next)
    setOddsStatus('ok')
    append(next ? 'odds set' : 'odds cleared', next ? 'ok' : 'muted')
  }, [oddsPaste, onChangeOddsPaste, append])

  const badge = useMemo(() => {
    if (phase === 'running' || isLoading) return { label: 'BUSY', cls: 'bg-amber-500/15 text-amber-200 border-amber-400/20' }
    const anyError = schedule.state === 'error' || lines.state === 'error' || backend.state === 'error'
    const anyDegraded = schedule.state === 'degraded' || lines.state === 'degraded' || backend.state === 'degraded'
    if (anyError || phase === 'error') return { label: 'ATTN', cls: 'bg-red-500/15 text-red-200 border-red-400/20' }
    if (anyDegraded) return { label: 'DEGRADED', cls: 'bg-amber-500/15 text-amber-200 border-amber-400/20' }
    if (phase === 'ready') return { label: 'READY', cls: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/20' }
    return { label: 'BOOT', cls: 'bg-white/10 text-white/70 border-white/10' }
  }, [phase, isLoading])

  const toggleAgent = useCallback((agentId: AgentRunState['id']) => {
    const next = selectedAgents.includes(agentId)
      ? selectedAgents.filter(id => id !== agentId)
      : [...selectedAgents, agentId]
    onSelectedAgentsChange(next)
  }, [selectedAgents, onSelectedAgentsChange])

  const toggleAnchor = useCallback((groupId: string, label: string) => {
    const group = anchorGroups.find(g => g.id === groupId)
    if (!group) return
    const groupLabels = group.options.map(option => option.label)
    const isSelected = anchors.includes(label)
    const next = anchors.filter(value => !groupLabels.includes(value))
    onChangeAnchors(isSelected ? next : [...next, label])
  }, [anchorGroups, anchors, onChangeAnchors])

  const toggleBias = useCallback((label: string) => {
    const next = scriptBias.includes(label)
      ? scriptBias.filter(value => value !== label)
      : [...scriptBias, label]
    onChangeScriptBias(next)
  }, [scriptBias, onChangeScriptBias])

  const onCopySignals = useCallback(() => {
    const text = signalDraft.trim()
    if (!text) return
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => undefined)
      append('signals copied', 'muted')
    }
  }, [append, signalDraft])

  const selectedAgentLabels = useMemo(() => (
    selectedAgents.map(id => AGENT_META[id].label)
  ), [selectedAgents])

  const getFreshnessLabel = useCallback((scannedAt?: number) => {
    if (!scannedAt) return '--'
    const ageMs = Date.now() - scannedAt
    if (ageMs < 60_000) return 'LIVE'
    const mins = Math.max(1, Math.round(ageMs / 60_000))
    return `${mins}m`
  }, [])

  const onScanClick = useCallback(() => {
    if (!canAct) {
      append('hint: set matchup before scanning.', 'warn')
      return
    }
    if (!selectedAgents.length) {
      append('hint: select at least one agent.', 'warn')
      return
    }
    append(`[scan] agents: ${selectedAgentLabels.join(', ')}`, 'muted')
    onScan({ agentIds: selectedAgents })
  }, [append, canAct, onScan, selectedAgentLabels, selectedAgents])

  const statusDot = (status: 'idle' | 'ok' | 'err') => ({
    idle: 'bg-white/20',
    ok: 'bg-emerald-400/80',
    err: 'bg-red-400/80',
  }[status])

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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onHelp}
            className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/60 hover:text-white/80 hover:bg-white/10"
            aria-label="Help"
            title="Help"
          >
            ?
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/60 hover:text-white/80 hover:bg-white/10"
            aria-label="Clear"
            title="Clear"
          >
            ⌫
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/60 hover:text-white/80 hover:bg-white/10"
            aria-label="Reset"
            title="Reset"
          >
            ↺
          </button>
          <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${badge.cls}`}>
            {badge.label}
          </div>
        </div>
      </div>

      {/* terminal + execution context */}
      <div className="grid gap-4 p-4">
        <div
          ref={scrollerRef}
          className="h-[340px] overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-[12px] leading-relaxed"
        >
          {/* ASCII Art Logo */}
          <pre className="mb-4 text-[10px] leading-[1.1] text-emerald-400/80 select-none">
{`███████╗██╗    ██╗ █████╗ ███╗   ██╗████████╗ █████╗ ██╗██╗
██╔════╝██║    ██║██╔══██╗████╗  ██║╚══██╔══╝██╔══██╗██║██║
███████╗██║ █╗ ██║███████║██╔██╗ ██║   ██║   ███████║██║██║
╚════██║██║███╗██║██╔══██║██║╚██╗██║   ██║   ██╔══██║██║██║
███████║╚███╔███╔╝██║  ██║██║ ╚████║   ██║   ██║  ██║██║███████╗
╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝╚═╝╚══════╝`}
          </pre>
          {buffer.map(line => (
            <div key={line.id} className={fmtTone(line.tone)}>{line.text}</div>
          ))}
          <div className="mt-4 text-white/40">
            {matchup.trim() ? `current matchup: ${matchup}` : 'no matchup selected'}
            {anchors.length ? ` • anchors: ${anchors.join(' + ')}` : ''}
            {scriptBias.length ? ` • bias: ${scriptBias.join(', ')}` : ''}
            {angles.length ? ` • signals: ${angles.length}` : ''}
          </div>
        </div>

        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="grid gap-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">Matchup</div>
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setMatchupStatus('idle') }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.currentTarget.blur()
                  }
                }}
                onBlur={() => onSubmitMatchup(draft)}
                placeholder="SF @ SEA"
                className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-[12px] text-white placeholder:text-white/25 focus:outline-none"
              />
              <span className={`h-1.5 w-1.5 rounded-full ${statusDot(matchupStatus)}`} />
            </div>
            <div className="flex flex-wrap gap-2">
              {featuredGames.slice(0, 6).map(g => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onPickMatchup(g.display)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/70 hover:text-white/90 hover:bg-white/10"
                >
                  {g.display}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">Agents</div>
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-white/40">PROPS</span>
                <div className="flex flex-1 items-center gap-1.5 overflow-x-auto overflow-y-hidden md:pb-1 md:pr-1 md:snap-x">
                  {runState.agents.filter(a => ['qb', 'hb', 'wr', 'te'].includes(a.id)).map(agent => {
                    const meta = AGENT_META[agent.id]
                    const isDisabled = analysisMeta?.status === 'scanning'
                    const isSelected = selectedAgents.includes(agent.id)
                    const statusClass = {
                      idle: 'border-white/10 bg-white/5 text-white/55',
                      scanning: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200',
                      found: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
                      silent: 'border-white/10 bg-white/5 text-white/45',
                      error: 'border-red-400/30 bg-red-500/10 text-red-200',
                    }[agent.status]
                    const deltaValue = typeof agent.findings === 'number'
                      ? `${agent.findings > 0 ? '+' : ''}${agent.findings}`
                      : '--'
                    const freshness = getFreshnessLabel(analysisMeta?.scannedAt)
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => toggleAgent(agent.id)}
                        disabled={isDisabled}
                        title={`Δ ${deltaValue} • ${freshness}`}
                        className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium ${statusClass} md:snap-start ${isSelected ? '' : 'opacity-50'} disabled:cursor-not-allowed disabled:opacity-40`}
                      >
                        <span className={`text-[8px] ${isSelected ? 'text-emerald-400' : 'text-white/40'}`}>
                          {isSelected ? '●' : '○'}
                        </span>
                        <span>{meta.icon}</span>
                        <span className="font-mono uppercase">{meta.label}</span>
                        {agent.status === 'scanning' && <span className="ml-0.5 animate-pulse text-[8px]">::</span>}
                        {agent.status === 'found' && (
                          <span className="ml-0.5 rounded bg-emerald-500/20 px-1 text-[8px] font-mono">
                            {deltaValue}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-white/40">ANGLES</span>
                <div className="flex flex-1 items-center gap-1.5 overflow-x-auto overflow-y-hidden md:pb-1 md:pr-1 md:snap-x">
                  {runState.agents.filter(a => ['epa', 'pressure', 'weather'].includes(a.id)).map(agent => {
                    const meta = AGENT_META[agent.id]
                    const isDisabled = analysisMeta?.status === 'scanning'
                    const isSelected = selectedAgents.includes(agent.id)
                    const statusClass = {
                      idle: 'border-white/10 bg-white/5 text-white/55',
                      scanning: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200',
                      found: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
                      silent: 'border-white/10 bg-white/5 text-white/45',
                      error: 'border-red-400/30 bg-red-500/10 text-red-200',
                    }[agent.status]
                    const deltaValue = typeof agent.findings === 'number'
                      ? `${agent.findings > 0 ? '+' : ''}${agent.findings}`
                      : '--'
                    const freshness = getFreshnessLabel(analysisMeta?.scannedAt)
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => toggleAgent(agent.id)}
                        disabled={isDisabled}
                        title={`Δ ${deltaValue} • ${freshness}`}
                        className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium ${statusClass} md:snap-start ${isSelected ? '' : 'opacity-50'} disabled:cursor-not-allowed disabled:opacity-40`}
                      >
                        <span className={`text-[8px] ${isSelected ? 'text-emerald-400' : 'text-white/40'}`}>
                          {isSelected ? '●' : '○'}
                        </span>
                        <span>{meta.icon}</span>
                        <span className="font-mono uppercase">{meta.label}</span>
                        {agent.status === 'scanning' && <span className="ml-0.5 animate-pulse text-[8px]">::</span>}
                        {agent.status === 'found' && (
                          <span className="ml-0.5 rounded bg-emerald-500/20 px-1 text-[8px] font-mono">
                            {deltaValue}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onScanClick}
              disabled={!canAct || !selectedAgents.length || (analysisMeta?.status === 'scanning')}
              className="rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {analysisMeta?.status === 'scanning' ? 'Scanning…' : 'Scan'}
            </button>
            <div className={`rounded-full border px-2 py-1 text-[10px] font-mono ${analysisMeta?.scannedAt ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200' : 'border-white/10 text-white/40'}`}>
              DATA {getFreshnessLabel(analysisMeta?.scannedAt)}
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-white/50">
            <span className="font-mono">signals:</span>
            <span className="max-w-[320px] truncate font-mono text-white/70">{signalDraft.trim() || '--'}</span>
            <button
              type="button"
              onClick={onCopySignals}
              disabled={!signalDraft.trim()}
              className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/50 hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Copy signals"
              title="Copy signals"
            >
              ⎘
            </button>
          </div>

          <div className="grid gap-1.5">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">Anchors</div>
            <div className="grid gap-1.5">
              {anchorGroups.map(group => (
                <div key={group.id} className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-white/40">{group.label}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {group.options.map(option => {
                      const isSelected = anchors.includes(option.label)
                      const groupSelected = group.options.some(item => anchors.includes(item.label))
                      const isDisabled = groupSelected && !isSelected
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleAnchor(group.id, option.label)}
                          disabled={isDisabled}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                            isSelected
                              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                              : 'border-white/10 bg-white/5 text-white/60 hover:text-white/80'
                          } disabled:cursor-not-allowed disabled:opacity-40`}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">Script Bias</span>
              <div className="flex flex-wrap gap-1.5">
                {scriptBiasOptions.map(option => {
                  const isSelected = scriptBias.includes(option)
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleBias(option)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                        isSelected
                          ? 'border-white/20 bg-white/10 text-white'
                          : 'border-white/10 bg-white/5 text-white/55 hover:text-white/75'
                      }`}
                    >
                      {option}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">Odds (optional)</span>
            <input
              value={oddsDraft}
              onChange={(e) => { setOddsDraft(e.target.value); setOddsStatus('idle') }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.currentTarget.blur()
                }
              }}
              onBlur={() => onApplyOdds(oddsDraft)}
              placeholder="RB1 TD +120 | Alt O44.5 -110"
              className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px] text-white placeholder:text-white/25 focus:outline-none"
            />
            <span className={`h-1.5 w-1.5 rounded-full ${statusDot(oddsStatus)}`} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBuild}
              disabled={!canBuild}
              className="rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isBuilding ? 'Building…' : 'Build Script'}
            </button>
            {analysisMeta?.status === 'stale' && (
              <span className="text-[10px] text-amber-300/80 italic">
                scan stale — re-scan to update
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
