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
  const [lineFocus, setLineFocus] = useState('')
  const [voice, setVoice] = useState<Voice>('analyst')
  const [variance, setVariance] = useState<Variance>('standard')
  const [focusAreas, setFocusAreas] = useState<string[]>([])
  const [advancedAngles, setAdvancedAngles] = useState('')
  const [summary, setSummary] = useState<string>('')
  const [json, setJson] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'summary' | 'json'>('summary')
  const comboRef = useRef<HTMLInputElement>(null)

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
    if (!selectedGame) return
    track('ui_build_clicked', { voice, variance, focusAreasCount: focusAreas.length })
    try {
      const req = {
        matchup: selectedGame,
        lineFocus: lineFocus || undefined,
        angles: [...focusAreas, ...chips],
        voice,
        wantJson: true,
      }
      const data = await build(req)
      setJson(data)
      const plain = data?.scripts ?
        [
          `Assumptions: matchup ${data?.assumptions?.matchup ?? selectedGame}${data?.assumptions?.lineFocus ? `; line ${data.assumptions.lineFocus}` : ''}; voice ${data?.assumptions?.voice ?? voice}.`,
          ...data.scripts.map((s: any, i: number) => `Script ${i + 1}: ${s.title}\n${s.narrative}\nLegs:\n${s.legs.map((l: any) => `• ${l.market}: ${l.selection}, odds ${l.odds} (${l.oddsLabel})`).join('\n')}\n$1 Parlay Math: ${s.math?.steps}\nNotes: ${s.notes?.join(' ')}`)
        ].join('\n\n')
        : (typeof data === 'string' ? data : JSON.stringify(data, null, 2))
      setSummary(plain)
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
    return gameOptions.filter(g => g.toLowerCase().includes(q)).slice(0, 20)
  }, [gameOptions, gameQuery])

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
            <div className="relative mt-1" role="combobox" aria-expanded="true" aria-controls="game-list">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-2 top-2.5 text-muted" />
                  <input
                    ref={comboRef}
                    id="game"
                    className="input pl-8"
                    placeholder="Choose this week's game…"
                    value={gameQuery}
                    onChange={(e) => setGameQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && filteredGames[0]) {
                        setSelectedGame(filteredGames[0])
                        setGameQuery(filteredGames[0])
                      }
                    }}
                    aria-autocomplete="list"
                  />
                </div>
                <button className="btn-ghost" type="button" aria-label="Open list"><ChevronDown size={16} /></button>
              </div>
              {gameQuery && (
                <ul id="game-list" className="mt-2 max-h-56 overflow-auto rounded-lg border border-border bg-card">
                  {filteredGames.length === 0 && (
                    <li className="px-3 py-2 text-sm text-muted">No matches</li>
                  )}
                  {filteredGames.map(g => (
                    <li key={g}>
                      <button className="w-full text-left px-3 py-2 text-sm hover:bg-white/5" onClick={() => { setSelectedGame(g); setGameQuery(g) }}>{g}</button>
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

            {/* Advanced angles */}
            <div className="mt-4">
              <label className="label" htmlFor="angles">Advanced angles</label>
              <textarea id="angles" className="input mt-1 min-h-[84px]" placeholder="Comma-separated, e.g., early-down EPA, PROE, coverage shells" value={advancedAngles} onChange={(e) => setAdvancedAngles(e.target.value)} />
              {chips.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {chips.map(c => (
                    <span key={c} className="px-2 py-1 text-xs rounded-full bg-white/10 border border-border">{c}</span>
                  ))}
                </div>
              )}
            </div>

            {/* CTA */}
            <div className="mt-6">
              <button onClick={onBuild} disabled={isLoading || !selectedGame} className="btn-primary w-full">
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
          </div>
        </section>
      </main>
    </div>
  )
}


