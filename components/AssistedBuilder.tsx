"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Info, Loader2, Search, Copy, ClipboardCheck, Keyboard, Gamepad2, Waves, Zap, Anchor, Gauge, Cloud, Activity, Shield } from 'lucide-react'
import { useAfb } from '@/app/hooks/useAfb'
import { track } from '@/lib/telemetry'

type Voice = 'analyst' | 'hype' | 'coach'
type Variance = 'conservative' | 'standard' | 'longshot'

type FocusItem = { key: string, label: string, icon: React.ReactNode, hint: string }

const FOCUS_ITEMS: FocusItem[] = [
  { key: 'pace', label: 'Pace of play', icon: <Waves size={18} />, hint: 'Tempo, seconds/play, no-huddle rate' },
  { key: 'redzone', label: 'Red zone efficiency', icon: <Shield size={18} />, hint: 'TD% inside the 20' },
  { key: 'explosive', label: 'Explosive plays', icon: <Zap size={18} />, hint: '20+ yard plays rate' },
  { key: 'pressure', label: 'Pressure rate', icon: <Gauge size={18} />, hint: 'Pass rush pressure and sacks' },
  { key: 'ol_dl', label: 'OL/DL matchups', icon: <Anchor size={18} />, hint: 'Trench mismatches' },
  { key: 'weather', label: 'Weather conditions', icon: <Cloud size={18} />, hint: 'Wind, rain, temperature' },
  { key: 'injuries', label: 'Injuries/Rest', icon: <Activity size={18} />, hint: 'Inactives, rest, travel' },
]

function useKeyShortcut(key: string, handler: (e: KeyboardEvent) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((key === 'mod+enter' && ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) || (key === '/' && e.key === '/')) {
        handler(e)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [key, handler])
}

export default function AssistedBuilder() {
  const { build, isLoading, error } = useAfb()
  const [gameQuery, setGameQuery] = useState('')
  const [selectedGame, setSelectedGame] = useState<string>('')
  const [comboOpen, setComboOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [lineFocus, setLineFocus] = useState('')
  const [voice, setVoice] = useState<Voice>('analyst')
  const [variance, setVariance] = useState<Variance>('standard')
  const [focusAreas, setFocusAreas] = useState<string[]>([])
  const [advancedAngles, setAdvancedAngles] = useState('')
  const [byoaFiles, setByoaFiles] = useState<{ filename: string; content: string; size: number }[]>([])
  const [summary, setSummary] = useState<string>('')
  const [json, setJson] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'summary' | 'json' | 'slips'>('summary')
  const comboRef = useRef<HTMLInputElement>(null)
  const comboWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    track('ui_view_loaded')
  }, [])

  const chips = useMemo(() => {
    return Array.from(new Set(advancedAngles.split(',').map(s => s.trim()).filter(Boolean)))
  }, [advancedAngles])

  const onToggleFocus = useCallback((key: string, checked: boolean) => {
    setFocusAreas(prev => {
      if (checked) return Array.from(new Set([...prev, key]))
      return prev.filter(k => k !== key)
    })
  }, [])

  const onCopy = useCallback(async () => {
    const text = activeTab === 'summary' ? summary : JSON.stringify(json, null, 2)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }, [activeTab, summary, json])

  const onBuild = useCallback(async () => {
    const matchup = selectedGame || gameQuery
    if (!matchup) return
    track('ui_build_clicked', { voice, variance, focusAreasCount: focusAreas.length })
    try {
      const req = {
        matchup,
        lineFocus: lineFocus || undefined,
        angles: [...focusAreas, ...chips],
        voice,
        wantJson: true,
        byoa: byoaFiles.map(f => ({ filename: f.filename, content: f.content })),
      }
      const data = await build(req)

      // Normalize outputs so all tabs can render
      let normalizedSummary = ''
      let normalizedJson: any = null

      if (typeof data === 'string') {
        normalizedSummary = data
        normalizedJson = safeParseTextToScripts(data)
      } else if (data && typeof data === 'object' && 'scripts' in data) {
        const d: any = data
        normalizedJson = d
        normalizedSummary = [
          `Assumptions: matchup ${d?.assumptions?.matchup ?? matchup}${d?.assumptions?.lineFocus ? `; line ${d.assumptions.lineFocus}` : ''}; voice ${d?.assumptions?.voice ?? voice}.`,
          ...d.scripts.map((s: any, i: number) => `Script ${i + 1}: ${s.title}\n${s.narrative}\nLegs:\n${s.legs.map((l: any) => `• ${l.market}: ${l.selection}, odds ${l.odds} (${l.oddsLabel})`).join('\n')}\n$1 Parlay Math: ${s.math?.steps}\nNotes: ${s.notes?.join(' ')}`)
        ].join('\n\n')
      } else if (data && typeof data === 'object' && 'raw' in (data as any)) {
        const raw = (data as any).raw as string
        normalizedSummary = raw
        normalizedJson = safeParseTextToScripts(raw)
      } else {
        normalizedSummary = JSON.stringify(data, null, 2)
      }

      setJson(normalizedJson)
      setSummary(normalizedSummary)
      setActiveTab('summary')
      track('ui_build_success')
    } catch (e) {
      track('ui_build_error', { message: (e as any)?.message })
    }
  }, [selectedGame, lineFocus, focusAreas, chips, voice, build])

  useKeyShortcut('mod+enter', () => { if (!isLoading) onBuild() })
  useKeyShortcut('/', (e) => { e.preventDefault(); comboRef.current?.focus() })

  // Simple local list for demo; could be fetched from backend schedule
  const gameOptions = useMemo(() => [
    'Ravens vs Chiefs', 'Packers vs Cowboys', 'Eagles vs Buccaneers', 'Jaguars vs 49ers', 'Saints vs Bills',
    'Vikings vs Steelers', 'Browns vs Lions', 'Chargers vs Giants', 'Colts vs Rams', 'Bears vs Raiders'
  ], [])

  const filteredGames = useMemo(() => {
    const q = gameQuery.toLowerCase()
    const list = q ? gameOptions.filter(g => g.toLowerCase().includes(q)) : gameOptions
    return list.slice(0, 20)
  }, [gameOptions, gameQuery])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!comboWrapRef.current) return
      if (!comboWrapRef.current.contains(e.target as Node)) {
        setComboOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Gamepad2 className="text-accent" size={20} />
            <h1 className="text-base font-semibold">ParlayGPT • AFB Builder</h1>
            <span className="ml-2 text-xs bg-white/5 border border-border px-2 py-1 rounded-md text-foreground/80">Assisted mode</span>
          </div>
          <div className="hidden md:flex items-center gap-3 text-xs text-muted">
            <Keyboard size={16} />
            <span>Cmd/Ctrl+Enter to build</span>
            <span className="opacity-60">•</span>
            <span>/ focuses game</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left column */}
        <section className="space-y-6">
          <div className="card p-5">
            <div className="heading mb-4">Selections</div>
            {/* Game combobox */}
            <label className="label" htmlFor="game">Game</label>
            <div ref={comboWrapRef} className="relative mt-1" role="combobox" aria-expanded={comboOpen} aria-controls="game-list">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
                <input
                  ref={comboRef}
                  id="game"
                  className="input input--with-icons"
                  placeholder="Choose this week's game…"
                  value={gameQuery}
                  onChange={(e) => { setGameQuery(e.target.value); setComboOpen(true); setHighlight(0) }}
                  onFocus={() => setComboOpen(true)}
                  onKeyDown={(e) => {
                    if (!comboOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) setComboOpen(true)
                    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, Math.max(filteredGames.length - 1, 0))) }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
                    if (e.key === 'Enter') {
                      const choice = filteredGames[highlight] || filteredGames[0]
                      if (choice) { setSelectedGame(choice); setGameQuery(choice); setComboOpen(false) }
                    }
                    if (e.key === 'Escape' || e.key === 'Tab') { setComboOpen(false) }
                  }}
                  aria-autocomplete="list"
                  aria-activedescendant={comboOpen ? `game-opt-${highlight}` : undefined}
                />
                <button
                  type="button"
                  aria-label="Open list"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-white/5"
                  onClick={() => { setComboOpen(o => !o); if (!comboOpen) comboRef.current?.focus() }}
                >
                  <ChevronDown size={16} />
                </button>
              </div>
              {comboOpen && (
                <ul id="game-list" role="listbox" className="absolute z-10 mt-2 w-full max-h-56 overflow-auto rounded-lg border border-border bg-card">
                  {filteredGames.length === 0 && (
                    <li className="px-3 py-2 text-sm text-muted">No matches</li>
                  )}
                  {filteredGames.map((g, idx) => (
                    <li key={g} id={`game-opt-${idx}`} role="option" aria-selected={idx===highlight}>
                      <button
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-white/5 ${idx===highlight?'bg-white/10':''}`}
                        onMouseEnter={() => setHighlight(idx)}
                        onClick={() => { setSelectedGame(g); setGameQuery(g); setComboOpen(false) }}
                      >
                        {g}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted">Selected: {selectedGame || '—'}</p>
            </div>

            {/* Line focus */}
            <div className="mt-4">
              <label className="label" htmlFor="line">Line focus</label>
              <input id="line" className="input mt-1" placeholder="Examples: Over 54.5, -3.5 spread" value={lineFocus} onChange={(e) => setLineFocus(e.target.value)} />
              <p className="mt-1 text-xs text-muted">Examples: Over 54.5, -3.5 spread</p>
            </div>

            {/* Voice radio cards */}
            <div className="mt-4">
              <label className="label">Voice</label>
              <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Voice">
                {(['analyst','hype','coach'] as Voice[]).map(v => (
                  <button key={v} role="radio" aria-checked={voice === v} onClick={() => setVoice(v)} className={`px-3 py-2 rounded-lg border border-border text-sm hover:bg-white/5 ${voice===v?'bg-white/10':''}`}>
                    {v.charAt(0).toUpperCase()+v.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Variance tabs */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <label className="label">Variance</label>
                <div className="flex items-center gap-1 text-xs text-muted"><Info size={14} /><span>We always produce 2–3 scripts; variance nudges alt lines and ladders.</span></div>
              </div>
              <div className="mt-2 inline-flex rounded-lg border border-border p-1" role="tablist" aria-label="Variance">
                {(['conservative','standard','longshot'] as Variance[]).map(v => (
                  <button key={v} role="tab" aria-selected={variance === v} onClick={() => setVariance(v)} className={`tab ${variance===v?'bg-white/10 text-white':''}`}>{v.charAt(0).toUpperCase()+v.slice(1)}</button>
                ))}
              </div>
            </div>

            {/* Focus areas pills */}
            <div className="mt-4">
              <div className="flex items-center gap-2">
                <label className="label">Focus Areas</label>
              </div>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                {FOCUS_ITEMS.map(item => {
                  const selected = focusAreas.includes(item.key)
                  return (
                    <button key={item.key} type="button" onClick={() => onToggleFocus(item.key, !selected)} className={`pill ${selected ? 'bg-white/10' : ''}`} aria-pressed={selected} title={item.hint}>
                      {item.icon}
                      <span>{item.label}</span>
                      {selected && <Check size={16} className="ml-auto text-accent" />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* BYOA Upload */}
            <div className="mt-4">
              <label className="label" htmlFor="byoa">Bring Your Own Analytics (optional)</label>
              <input
                id="byoa"
                type="file"
                accept=".csv,.tsv,.txt,.md,.json"
                multiple
                className="mt-1 block w-full text-xs text-muted"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || [])
                  const next: { filename: string; content: string; size: number }[] = []
                  for (const f of files) {
                    const text = await f.text()
                    const capped = text.length > 64 * 1024 ? text.slice(0, 64 * 1024) : text
                    next.push({ filename: f.name, content: capped, size: f.size })
                  }
                  setByoaFiles(prev => [...prev, ...next].slice(0, 5))
                  e.currentTarget.value = ''
                }}
              />
              {byoaFiles.length > 0 && (
                <div className="mt-2 space-y-2">
                  {byoaFiles.map((f, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs rounded-lg border border-border bg-white/5 px-2 py-1">
                      <span className="truncate max-w-[70%]">{f.filename}</span>
                      <div className="flex items-center gap-2">
                        <span className="opacity-70">{Math.round(f.size/1024)} KB</span>
                        <button className="btn-ghost" onClick={() => setByoaFiles(files => files.filter((_, i) => i !== idx))}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-1 text-xs text-muted">We include exact file chunks in the prompt (size-capped; up to 5 files).</p>
            </div>

            {/* CTA */}
            <div className="mt-6">
              <button onClick={onBuild} disabled={isLoading || !(selectedGame || gameQuery)} className="btn-primary w-full">
                {isLoading ? (<><Loader2 className="animate-spin" size={16} /> Generating…</>) : 'Generate Parlay Scripts'}
              </button>
              <p className="mt-2 text-xs text-muted">2–3 correlated scripts with $1 parlay math.</p>
            </div>
          </div>
        </section>

        {/* Right column */}
        <section className="space-y-6">
          <div className="card p-5" aria-live="polite">
            <div className="heading mb-4">Result</div>

            {/* Tabs + copy */}
            <div className="flex items-center justify-between mb-3">
              <div className="inline-flex rounded-lg border border-border p-1" role="tablist" aria-label="Result tabs">
                <button role="tab" aria-selected={activeTab==='summary'} onClick={() => setActiveTab('summary')} className={`tab ${activeTab==='summary'?'bg-white/10 text-white':''}`}>Summary</button>
                <button role="tab" aria-selected={activeTab==='json'} onClick={() => setActiveTab('json')} className={`tab ${activeTab==='json'?'bg-white/10 text-white':''}`}>JSON</button>
                <button role="tab" aria-selected={activeTab==='slips'} onClick={() => setActiveTab('slips')} className={`tab ${activeTab==='slips'?'bg-white/10 text-white':''}`}>Bet Slips</button>
              </div>
              <button className="btn-ghost" onClick={onCopy} aria-label="Copy">
                {copied ? <ClipboardCheck size={16} /> : <Copy size={16} />}
                <span className="ml-1 text-xs">Copy</span>
              </button>
            </div>

            {/* States */}
            {!summary && !json && !error && (
              <p className="text-sm text-muted">Your scripts will appear here after generation.</p>
            )}

            {error && (
              <div className="mt-2 border border-danger/40 bg-danger/10 text-danger rounded-lg p-3">
                <div className="font-medium">Something went wrong</div>
                <div className="text-sm opacity-90">We couldn’t build scripts. Please tweak inputs and try again.</div>
                <div className="mt-2">
                  <button className="btn-ghost" onClick={onBuild}>Try again</button>
                </div>
              </div>
            )}

            {activeTab === 'summary' && summary && (
              <pre className="mt-2 whitespace-pre-wrap text-sm leading-6">{summary}</pre>
            )}
            {activeTab === 'json' && json && (
              <pre className="mt-2 overflow-auto text-xs leading-6 max-h-[60vh]">
{JSON.stringify(json, null, 2)}
              </pre>
            )}

            {activeTab === 'slips' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {renderSlips(json, summary)}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

function renderSlips(json: any, summary: string) {
  // Prefer structured JSON; fallback to parse summary heuristically
  let scripts: any[] = []
  if (json && typeof json === 'object' && Array.isArray(json.scripts)) {
    scripts = json.scripts
  } else {
    // minimal parser: split by Script blocks
    const blocks = summary ? summary.split(/\n\s*Script\s+\d+:/i).slice(1) : []
    scripts = blocks.map((b, idx) => ({
      title: `Script ${idx + 1}`,
      legs: b.split(/\n\s*•\s*/).slice(1, 6).map(t => ({ text: t }))
    }))
  }

  if (!scripts || scripts.length === 0) {
    return <p className="text-sm text-muted">No slips yet. Generate first.</p>
  }

  return scripts.slice(0, 3).map((s, i) => (
    <div key={i} className="rounded-2xl border border-border bg-[#0f0f16] p-4 shadow-soft">
      <div className="text-xs uppercase tracking-wide text-muted mb-1">Bet Slip</div>
      <div className="text-sm font-semibold mb-2">{s.title || `Slip ${i+1}`}</div>
      <div className="space-y-2">
        {(s.legs || []).slice(0,5).map((l: any, idx: number) => (
          <div key={idx} className="flex items-start gap-2">
            <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-accent"></span>
            <div className="text-xs leading-5 opacity-90">{l.text || `${l.market}: ${l.selection} (${l.odds ?? '—'})`}</div>
          </div>
        ))}
      </div>
      {s.math?.steps && (
        <div className="mt-3 text-xs text-foreground/80">{s.math.steps.replace('product, payout, and profit', 'product; payout; profit')}</div>
      )}
    </div>
  ))
}

function safeParseTextToScripts(text: string) {
  try {
    const blocks = text.split(/\n\s*Script\s+\d+\s*[:\-]/i)
    if (blocks.length <= 1) return null
    const scripts: any[] = []
    for (let i = 1; i < blocks.length; i++) {
      const b = blocks[i]
      const titleMatch = b.match(/^\s*"?([^\n"]{3,80})"?/)
      const title = titleMatch ? titleMatch[1].trim() : `Script ${i}`
      const legs = (b.match(/\n\s*•\s+.*$/gm) || []).slice(0,5).map(l => ({ text: l.replace(/^\s*•\s+/, '').trim() }))
      const mathMatch = b.match(/\$1\s*Parlay\s*Math:\s*([^\n]+)/i)
      const math = mathMatch ? { steps: mathMatch[1].trim() } : undefined
      scripts.push({ title, legs, math })
    }
    return { scripts }
  } catch {
    return null
  }
}


