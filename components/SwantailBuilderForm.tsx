'use client'
import { useEffect, useMemo, useState } from 'react'
import SwantailLogo from '@/components/SwantailLogo'

const QUICK_ANGLES = [
  'Pace skew',
  'Red-zone conversion',
  'Explosive bias',
  'Pressure mismatch',
  'Trench edge',
  'Environment',
]

type Props = {
  matchup: string
  lineFocus: string
  angles: string[]
  isLoading: boolean
  onChangeMatchup: (value: string) => void
  onChangeLineFocus: (value: string) => void
  onChangeAngles: (value: string[]) => void
  onBuild: () => void
}

export default function SwantailBuilderForm({
  matchup,
  lineFocus,
  angles,
  isLoading,
  onChangeMatchup,
  onChangeLineFocus,
  onChangeAngles,
  onBuild,
}: Props) {
  const [angleInput, setAngleInput] = useState('')
	const [games, setGames] = useState<{ id: string; display: string; time: string; isPopular?: boolean }[]>([])
	const [hasSchedule, setHasSchedule] = useState(false)
		const [customMode, setCustomMode] = useState(false)
	const [autoAnchor, setAutoAnchor] = useState(false)
	const [anchorSuggestions, setAnchorSuggestions] = useState<string[]>([])
	const [anchorMeta, setAnchorMeta] = useState<{ source?: string; timestamp?: number } | null>(null)

  const angleList = useMemo(() => {
    const combined = [...angles]
    if (angleInput.trim()) {
      angleInput
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .forEach(a => {
          if (!combined.includes(a)) combined.push(a)
        })
    }
    return combined
  }, [angles, angleInput])

	useEffect(() => {
		let cancelled = false
		async function load() {
			try {
				const res = await fetch('/api/nfl/schedule', { cache: 'no-store' })
				if (!res.ok) throw new Error(`status ${res.status}`)
				const json = await res.json()
				if (cancelled) return
				const list = Array.isArray(json?.games) ? json.games : []
				setGames(list)
				setHasSchedule(list.length > 0)
			} catch {
				setHasSchedule(false)
			}
		}
		load()
		// if schedule is not available, force custom mode
		if (!hasSchedule) setCustomMode(true)
		return () => {
			cancelled = true
		}
	}, [])

	function onPickGame(e: React.ChangeEvent<HTMLSelectElement>) {
		const value = e.target.value
		if (!value) return
		if (value === '__custom__') {
			setCustomMode(true)
			return
		}
		setCustomMode(false)
		// Use the raw display text, e.g. "Cowboys @ Commanders"
		onChangeMatchup(value)
		// Reset anchor on matchup change so the new game's line is applied
		if (autoAnchor) {
			onChangeLineFocus('')
			setAnchorSuggestions([])
			setAnchorMeta(null)
		}
	}

	// Fetch market anchor suggestions when autoAnchor is enabled and matchup present
	useEffect(() => {
		let cancelled = false
		async function load() {
			if (!autoAnchor || !matchup.trim()) { setAnchorSuggestions([]); setAnchorMeta(null); return }
			try {
				const u = new URL('/api/market/suggest', window.location.origin)
				u.searchParams.set('matchup', matchup)
				const res = await fetch(u.toString(), { cache: 'no-store' })
				if (!res.ok) throw new Error('suggest failed')
				const json = await res.json()
				if (cancelled) return
				setAnchorSuggestions(Array.isArray(json?.suggestions) ? json.suggestions : [])
				setAnchorMeta(json?.meta || null)
				// If we have at least one suggestion and input is empty, prefill
				if (!lineFocus && Array.isArray(json?.suggestions) && json.suggestions.length > 0) {
					onChangeLineFocus(json.suggestions[0])
				}
			} catch {
				if (!cancelled) { setAnchorSuggestions([]); setAnchorMeta(null) }
			}
		}
		load()
		return () => { cancelled = true }
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [autoAnchor, matchup])

  function toggleQuickAngle(label: string) {
    if (angles.includes(label)) {
      onChangeAngles(angles.filter(a => a !== label))
    } else {
      onChangeAngles([...angles, label])
    }
  }

  function commitAngleInput() {
    const next = angleInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    if (next.length) {
      onChangeAngles(Array.from(new Set([...angles, ...next])))
      setAngleInput('')
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <SwantailLogo className="h-12 w-12" />
          <div>
            <div className="text-sm uppercase tracking-[0.2em] text-white/50">Swantail</div>
            <h1 className="mt-1 text-3xl font-semibold text-white">Scripts for tail outcomes.</h1>
          </div>
        </div>
        <p className="mt-3 text-sm text-white/70">
          Model how a game breaks — then express it with correlated legs and a clean counter-story.
        </p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="grid gap-4">
					{hasSchedule && (
						<div>
							<label className="text-xs uppercase tracking-wide text-white/60">This Week's NFL Games</label>
							<select
								className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-400/40"
								onChange={onPickGame}
								defaultValue=""
							>
								<option value="" disabled>Choose a game…</option>
								{games.some(g => g.isPopular) && (
									<optgroup label="Featured">
										{games.filter(g => g.isPopular).map(g => (
											<option key={g.id} value={g.display}>{g.display} ({g.time})</option>
										))}
									</optgroup>
								)}
								<optgroup label="All games">
									{games.filter(g => !g.isPopular).map(g => (
										<option key={g.id} value={g.display}>{g.display} ({g.time})</option>
									))}
								</optgroup>
								<option value="__custom__">Enter custom matchup</option>
							</select>
						</div>
					)}
					{(!hasSchedule || customMode) && (
						<div>
							<label className="text-xs uppercase tracking-wide text-white/60">Matchup</label>
							<input
								className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-400/40"
								placeholder="Lions @ Eagles"
								value={matchup}
								onChange={(e) => onChangeMatchup(e.target.value)}
							/>
						</div>
					)}

          <div>
            <label className="text-xs uppercase tracking-wide text-white/60">Market anchor</label>
						<div className="mt-2 flex items-center gap-3">
							<label className="inline-flex items-center gap-2 text-xs text-white/70">
								<input
									type="checkbox"
									className="h-4 w-4 rounded border-white/20 bg-black/20"
									checked={autoAnchor}
									onChange={(e) => setAutoAnchor(e.target.checked)}
								/>
								<span>Auto-anchor from book combos</span>
							</label>
							{autoAnchor && anchorSuggestions.length > 0 && (
								<div className="flex flex-wrap gap-1">
									{anchorSuggestions.map(s => (
										<button
											key={s}
											type="button"
											onClick={() => onChangeLineFocus(s)}
											className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10"
										>
											{s}
										</button>
									))}
								</div>
							)}
						</div>
						{autoAnchor && anchorMeta && (
							<div className="mt-1 text-[11px] text-white/50">
								{(() => {
									const ts = anchorMeta.timestamp
									let when = ''
									if (typeof ts === 'number' && ts > 0) {
										const ms = ts > 1e12 ? ts : ts * 1000
										when = new Date(ms).toLocaleString()
									}
									return `Source: ${anchorMeta.source ?? 'lines'}${when ? ` • ${when}` : ''}`
								})()}
							</div>
						)}
            <input
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-400/40"
              placeholder="Over 41.5 · Eagles -3.5 · First Half Under"
							value={lineFocus}
							onChange={(e) => onChangeLineFocus(e.target.value)}
							disabled={autoAnchor}
            />
            <div className="mt-2 text-xs text-white/50">The price or total your story leans against.</div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-white/60">Tail signals</label>
            <div className="mt-1 text-xs text-white/50">Factors that push the game away from the median.</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_ANGLES.map(angle => (
                <button
                  key={angle}
                  type="button"
                  onClick={() => toggleQuickAngle(angle)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${angles.includes(angle) ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}
                >
                  {angle}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                placeholder="Add a signal (e.g. turnover volatility, WR1 funnel)"
                value={angleInput}
                onChange={(e) => setAngleInput(e.target.value)}
                onBlur={commitAngleInput}
              />
              <button
                className="rounded-xl border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/20"
                type="button"
                onClick={commitAngleInput}
              >
                Add signal
              </button>
            </div>
            {angleList.length > 0 && (
              <div className="mt-2 text-xs text-white/60">{angleList.join(', ')}</div>
            )}
          </div>

          <div className="flex items-end">
            <button
              onClick={onBuild}
              disabled={isLoading || !matchup.trim()}
              className="w-full rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-blue-600 hover:to-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? 'Reading the game…' : 'Reveal scripts'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
