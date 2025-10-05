"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Info, Loader2, Search, Copy, ClipboardCheck, Keyboard, Gamepad2, Waves, Zap, Anchor, Gauge, Cloud, Activity, Shield, Download, Share2, Shuffle } from 'lucide-react'
import { useAfb } from '@/app/hooks/useAfb'
import { track } from '@/lib/telemetry'
// Dynamic import for html2canvas to avoid SSR issues
const html2canvas = typeof window !== 'undefined' ? require('html2canvas') : null

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
  const [summary, setSummary] = useState<string>('')
  const [json, setJson] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  const [imageGenerating, setImageGenerating] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'summary' | 'json' | 'slips'>('summary')
  const [scriptIndex, setScriptIndex] = useState(0)
  const comboRef = useRef<HTMLInputElement>(null)
  const comboWrapRef = useRef<HTMLDivElement>(null)
  const [focusAvailability, setFocusAvailability] = useState<Record<string, boolean>>({})
  const [games, setGames] = useState<{ id: string; display: string; isPopular?: boolean }[]>([])

  useEffect(() => {
    track('ui_view_loaded')
  }, [])

  // BYOA removed

  // Fetch weekly focus availability from backend
  useEffect(() => {
    let cancelled = false
    async function loadAvailability() {
      try {
        const res = await fetch('/api/focus/status')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data && data.availability) {
          setFocusAvailability(data.availability as Record<string, boolean>)
        }
      } catch {}
    }
    loadAvailability()
    return () => { cancelled = true }
  }, [])

  // Fetch NFL schedule (2025 Week 5 per backend seed)
  useEffect(() => {
    let cancelled = false
    async function loadSchedule() {
      try {
        const res = await fetch('/api/nfl/schedule')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data && Array.isArray(data.games)) {
          setGames(data.games)
        }
      } catch {}
    }
    loadSchedule()
    return () => { cancelled = true }
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

  const generateBetSlipImage = useCallback(async (slipElement: HTMLElement, slipTitle: string) => {
    try {
      track('ui_image_generation_started', { slipTitle })
      
      if (!html2canvas) {
        throw new Error('html2canvas not available - please refresh the page')
      }
      
      const canvas = await html2canvas(slipElement, {
        backgroundColor: '#0f0f16',
        scale: 2, // Higher quality for better sharing
        useCORS: true,
        allowTaint: true,
        width: slipElement.offsetWidth,
        height: slipElement.offsetHeight,
        logging: false
      })
      
      // Convert to blob for better sharing
      return new Promise<string>((resolve) => {
        canvas.toBlob((blob: Blob | null) => {
          if (blob) {
            const url = URL.createObjectURL(blob)
            resolve(url)
          }
        }, 'image/png', 0.95)
      })
    } catch (error) {
      console.error('Error generating bet slip image:', error)
      track('ui_image_generation_error', { error: (error as any)?.message })
      throw error
    }
  }, [])

  const downloadBetSlipImage = useCallback(async (slipElement: HTMLElement, slipTitle: string) => {
    try {
      setImageGenerating(slipTitle)
      const imageUrl = await generateBetSlipImage(slipElement, slipTitle)
      
      // Create download link
      const link = document.createElement('a')
      link.download = `${slipTitle.replace(/[^a-zA-Z0-9]/g, '-')}-bet-slip.png`
      link.href = imageUrl
      link.click()
      
      // Clean up the URL object
      setTimeout(() => URL.revokeObjectURL(imageUrl), 1000)
      
      track('ui_image_downloaded', { slipTitle })
    } catch (error) {
      console.error('Error downloading bet slip:', error)
    } finally {
      setImageGenerating(null)
    }
  }, [generateBetSlipImage])

  const shareBetSlipImage = useCallback(async (slipElement: HTMLElement, slipTitle: string) => {
    try {
      setImageGenerating(slipTitle)
      const imageUrl = await generateBetSlipImage(slipElement, slipTitle)
      
      // Check if Web Share API is available
      if (navigator.share && navigator.canShare) {
        const file = new File([await fetch(imageUrl).then(r => r.blob())], `${slipTitle}-bet-slip.png`, { type: 'image/png' })
        
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `${slipTitle} - Bet Slip`,
            text: `Check out this bet slip for ${slipTitle}`,
            files: [file]
          })
          track('ui_image_shared', { slipTitle, method: 'native' })
          return
        }
      }
      
      // Fallback: copy image to clipboard
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ])
      
      track('ui_image_shared', { slipTitle, method: 'clipboard' })
      
      // Clean up
      setTimeout(() => URL.revokeObjectURL(imageUrl), 1000)
    } catch (error) {
      console.error('Error sharing bet slip:', error)
      // Fallback to download
      downloadBetSlipImage(slipElement, slipTitle)
    } finally {
      setImageGenerating(null)
    }
  }, [generateBetSlipImage, downloadBetSlipImage])

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
      setScriptIndex(0)
      setActiveTab('summary')
      track('ui_build_success')
    } catch (e) {
      track('ui_build_error', { message: (e as any)?.message })
    }
  }, [selectedGame, lineFocus, focusAreas, chips, voice, build])

  useKeyShortcut('mod+enter', () => { if (!isLoading) onBuild() })
  useKeyShortcut('/', (e) => { e.preventDefault(); comboRef.current?.focus() })

  // Build options from backend schedule; fallback to local list if empty
  const gameOptions = useMemo(() => {
    if (games.length > 0) {
      // Use display from API, normalize to "Team A vs Team B" for consistency
      return games.map(g => g.display.replace('@', 'vs'))
    }
    return [
      'Browns vs Ravens', 'Bengals vs Cowboys', 'Saints vs Chiefs', 'Bills vs Raiders', 'Lions vs Broncos',
      'Jets vs Vikings', 'Bears vs Panthers', 'Texans vs Falcons', 'Colts vs Jaguars', 'Cardinals vs 49ers'
    ]
  }, [games])

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Hero Header */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 via-blue-600/20 to-purple-600/20"></div>
        <div className="relative mx-auto max-w-4xl px-4 py-8">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="p-3 rounded-2xl bg-gradient-to-r from-purple-500 to-blue-500 shadow-lg">
                <Gamepad2 className="text-white" size={24} />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
                ParlayGPT
              </h1>
            </div>
            <p className="text-lg text-slate-300 mb-2">AI-Powered Football Picks</p>
            <p className="text-sm text-slate-400">Generate correlated same-game parlays with professional analysis</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-8 space-y-6">
        {/* Game Selection - Hero Section */}
        <section className="space-y-6">
          <div className="relative z-50 overflow-visible rounded-3xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 p-6">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-blue-500/10"></div>
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500">
                  <Search className="text-white" size={20} />
                </div>
                <h2 className="text-xl font-semibold text-white">Choose Your Game</h2>
              </div>
              
              <div ref={comboWrapRef} className="relative z-50" role="combobox" aria-expanded={comboOpen} aria-controls="game-list">
                <div className="relative z-50">
                  <input
                    ref={comboRef}
                    id="game"
                    className="w-full rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 px-6 py-4 text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all duration-200 text-lg"
                    placeholder="Search for this week's games..."
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 inline-flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors"
                    onClick={() => { setComboOpen(o => !o); if (!comboOpen) comboRef.current?.focus() }}
                  >
                    <ChevronDown className="text-slate-300" size={20} />
                  </button>
                </div>
                
                {comboOpen && (
                  <div className="absolute z-50 mt-3 w-full max-h-80 overflow-auto overscroll-contain rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 shadow-2xl">
                    {filteredGames.length === 0 && (
                      <div className="px-6 py-4 text-slate-400">No matches found</div>
                    )}
                    {filteredGames.map((g, idx) => (
                      <button
                        key={g}
                        id={`game-opt-${idx}`}
                        role="option"
                        aria-selected={idx===highlight}
                        className={`w-full text-left px-6 py-3 hover:bg-slate-800/70 transition-colors first:rounded-t-2xl last:rounded-b-2xl ${idx===highlight?'bg-slate-800':''}`}
                        onMouseEnter={() => setHighlight(idx)}
                        onClick={() => { setSelectedGame(g); setGameQuery(g); setComboOpen(false) }}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {selectedGame && (
                <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/20">
                      <Check className="text-green-400" size={16} />
                    </div>
                    <div>
                      <p className="text-green-200 font-medium">Selected Game</p>
                      <p className="text-white text-lg">{selectedGame}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          

          {/* Quick Settings */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 p-6">
            <div className="absolute inset-0 bg-gradient-to-r from-slate-500/10 to-gray-500/10"></div>
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-gradient-to-r from-slate-500 to-gray-500">
                  <Gauge className="text-white" size={20} />
                </div>
                <h2 className="text-xl font-semibold text-white">Quick Settings</h2>
              </div>
              
              <div className="space-y-4">
                {/* Line Focus */}
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">Line Focus (Optional)</label>
                  <input 
                    id="line" 
                    className="w-full rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 px-4 py-3 text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all duration-200" 
                    placeholder="e.g., Over 54.5, -3.5 spread" 
                    value={lineFocus} 
                    onChange={(e) => setLineFocus(e.target.value)} 
                  />
                </div>

                {/* Voice Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">Analysis Style</label>
                  <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Voice">
                    {(['analyst','hype','coach'] as Voice[]).map(v => (
                      <button 
                        key={v} 
                        role="radio" 
                        aria-checked={voice === v} 
                        onClick={() => setVoice(v)} 
                        className={`px-4 py-3 rounded-xl border transition-all duration-200 ${
                          voice === v 
                            ? 'bg-gradient-to-r from-purple-500/30 to-blue-500/30 border-purple-400/50 text-white' 
                            : 'bg-white/10 border-white/20 text-slate-200 hover:bg-white/15'
                        }`}
                      >
                        {v.charAt(0).toUpperCase()+v.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Variance */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-slate-200">Risk Level</label>
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <Info size={14} />
                      <span>2-3 scripts always generated</span>
                    </div>
                  </div>
                  <div className="inline-flex rounded-xl border border-white/20 p-1 bg-white/5" role="tablist" aria-label="Variance">
                    {(['conservative','standard','longshot'] as Variance[]).map(v => (
                      <button 
                        key={v} 
                        role="tab" 
                        aria-selected={variance === v} 
                        onClick={() => setVariance(v)} 
                        className={`px-4 py-2 rounded-lg text-sm transition-all duration-200 ${
                          variance === v 
                            ? 'bg-gradient-to-r from-purple-500/30 to-blue-500/30 text-white' 
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {v.charAt(0).toUpperCase()+v.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Focus Areas - moved below Quick Settings and always selectable */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 p-6">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10"></div>
            <div className="relative">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500">
                  <Activity className="text-white" size={20} />
                </div>
                <h2 className="text-xl font-semibold text-white">Focus Areas</h2>
                <div className="ml-auto text-sm text-slate-300">
                  {focusAreas.length} selected
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {FOCUS_ITEMS.map(item => {
                  const selected = focusAreas.includes(item.key)
                  const available = !!focusAvailability[item.key]
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onToggleFocus(item.key, !selected)}
                      className={`relative overflow-hidden rounded-2xl p-4 transition-all duration-200 ${
                        selected 
                          ? 'bg-gradient-to-br from-purple-500/30 to-blue-500/30 border-2 border-purple-400/50' 
                          : 'bg-white/10 border border-white/20 hover:bg-white/15'
                      }`}
                      aria-pressed={selected}
                      title={item.hint}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${
                          selected 
                            ? 'bg-white/20' 
                            : 'bg-white/10'
                        }`}>
                          {item.icon}
                        </div>
                        <div className="flex-1 text-left">
                          <p className={`font-medium ${
                            selected ? 'text-white' : 'text-slate-200'
                          }`}>
                            {item.label}
                          </p>
                          <p className={`text-xs ${
                            selected ? 'text-white/80' : 'text-slate-400'
                          }`}>
                            {item.hint}
                          </p>
                        </div>
                        {selected && (
                          <div className="p-1 rounded-lg bg-green-500/20">
                            <Check className="text-green-400" size={16} />
                          </div>
                        )}
                        {!selected && available && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] border border-emerald-400/30 bg-emerald-400/15 text-emerald-300">
                            Recommended
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Generate Button - Hero CTA */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-600/20 to-blue-600/20 backdrop-blur-xl border border-purple-400/30 p-6">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-blue-500/10"></div>
            <div className="relative text-center">
              <button 
                onClick={onBuild} 
                disabled={isLoading || !(selectedGame || gameQuery)} 
                className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:from-slate-500 disabled:to-slate-600 text-white font-semibold px-8 py-4 text-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:scale-105 disabled:hover:scale-100"
              >
                <div className="flex items-center justify-center gap-3">
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      <span>Generating Scripts...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="text-white" size={20} />
                      <span>Generate Parlay Scripts</span>
                    </>
                  )}
                </div>
              </button>
              <p className="mt-3 text-sm text-slate-300">
                {selectedGame || gameQuery ? 'Ready to generate 2-3 correlated scripts' : 'Select a game to get started'}
              </p>
            </div>
          </div>

          {/* BYOA removed */}
        </section>

        {/* Results Section */}
        <section className="space-y-6">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 p-6" aria-live="polite">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-teal-500/10"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500">
                    <Activity className="text-white" size={20} />
                  </div>
                  <h2 className="text-xl font-semibold text-white">Results</h2>
                </div>
                
                {/* Tabs */}
                <div className="inline-flex rounded-xl border border-white/20 p-1 bg-white/5" role="tablist" aria-label="Result tabs">
                  <button 
                    role="tab" 
                    aria-selected={activeTab==='summary'} 
                    onClick={() => setActiveTab('summary')} 
                    className={`px-4 py-2 rounded-lg text-sm transition-all duration-200 ${
                      activeTab==='summary' 
                        ? 'bg-gradient-to-r from-emerald-500/30 to-teal-500/30 text-white' 
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Summary
                  </button>
                  <button 
                    role="tab" 
                    aria-selected={activeTab==='json'} 
                    onClick={() => setActiveTab('json')} 
                    className={`px-4 py-2 rounded-lg text-sm transition-all duration-200 ${
                      activeTab==='json' 
                        ? 'bg-gradient-to-r from-emerald-500/30 to-teal-500/30 text-white' 
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    JSON
                  </button>
                  <button 
                    role="tab" 
                    aria-selected={activeTab==='slips'} 
                    onClick={() => setActiveTab('slips')} 
                    className={`px-4 py-2 rounded-lg text-sm transition-all duration-200 ${
                      activeTab==='slips' 
                        ? 'bg-gradient-to-r from-emerald-500/30 to-teal-500/30 text-white' 
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Bet Slips
                  </button>
                </div>
              </div>

              {/* Copy Button */}
              {(summary || json) && (
                <div className="flex justify-end mb-4">
                  <button 
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-slate-200 hover:bg-white/15 hover:text-white transition-all duration-200" 
                    onClick={onCopy} 
                    aria-label="Copy"
                  >
                    {copied ? <ClipboardCheck size={16} /> : <Copy size={16} />}
                    <span className="text-sm">{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              )}

              {/* States */}
              {!summary && !json && !error && (
                <div className="text-center py-12">
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 inline-block mb-4">
                    <Activity className="text-slate-400" size={32} />
                  </div>
                  <p className="text-slate-300 text-lg">Your scripts will appear here</p>
                  <p className="text-slate-400 text-sm mt-1">Generate your first parlay to get started</p>
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-red-400/40 bg-red-500/10 p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-red-500/20">
                      <Activity className="text-red-400" size={20} />
                    </div>
                    <div className="font-medium text-red-200">Something went wrong</div>
                  </div>
                  <div className="text-sm text-red-300/90 mb-4">
                    We couldn't build scripts. Please check your inputs and try again.
                  </div>
                  <button 
                    className="px-4 py-2 rounded-xl bg-red-500/20 border border-red-400/30 text-red-200 hover:bg-red-500/30 transition-all duration-200" 
                    onClick={onBuild}
                  >
                    Try Again
                  </button>
                </div>
              )}

              {activeTab === 'summary' && summary && (
                <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
                  <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-200 font-mono">{summary}</pre>
                </div>
              )}
              
              {activeTab === 'json' && json && (
                <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
                  <pre className="overflow-auto text-xs leading-6 max-h-[60vh] text-slate-200 font-mono">
{JSON.stringify(json, null, 2)}
                  </pre>
                </div>
              )}

              {activeTab === 'slips' && (
                <div className="space-y-4">
                  {renderSlipSingle(json, summary, downloadBetSlipImage, shareBetSlipImage, imageGenerating, scriptIndex, setScriptIndex)}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function renderSlipSingle(
  json: any,
  summary: string,
  onDownload: (element: HTMLElement, title: string) => void,
  onShare: (element: HTMLElement, title: string) => void,
  imageGenerating: string | null,
  scriptIndex: number,
  setScriptIndex: (idx: number) => void
) {
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
    return <p className="text-sm text-slate-300">No slips yet. Generate first.</p>
  }

  const i = Math.min(Math.max(0, scriptIndex), scripts.length - 1)
  const s = scripts[i]
  const slipTitle = s.title || `Slip ${i+1}`
  const legCount = (s.legs || []).length
  return (
      <div className="share-card">
        {/* Action buttons */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-60 hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => onDownload(e.currentTarget.closest('.share-card') as HTMLElement, slipTitle)}
            disabled={imageGenerating === slipTitle}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download as image"
            aria-label={`Download ${slipTitle} as image`}
          >
            {imageGenerating === slipTitle ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          </button>
          <button
            onClick={() => setScriptIndex((i + 1) % scripts.length)}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            title="Switch script"
            aria-label="Switch script"
          >
            <Shuffle size={14} />
          </button>
          <button
            onClick={(e) => onShare(e.currentTarget.closest('.share-card') as HTMLElement, slipTitle)}
            disabled={imageGenerating === slipTitle}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Share image"
            aria-label={`Share ${slipTitle} image`}
          >
            {imageGenerating === slipTitle ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
          </button>
        </div>
        {/* Header */}
        <div className="share-card__header">
          <div className="share-card__title">{slipTitle}</div>
          <div className="share-card__badge">{legCount} legs</div>
        </div>

        {/* Body */}
        <div className="share-card__body">
          <div className="space-y-2 mb-4">
            {(s.legs || []).slice(0,5).map((l: any, idx: number) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-accent"></span>
                <div className="text-xs leading-5 opacity-90">{l.text || `${l.market}: ${l.selection} (${l.odds ?? '—'})`}</div>
              </div>
            ))}
          </div>

          {s.math?.steps && (
            <div>
              <div className="share-card__section-title">$1 Parlay Math</div>
              <div className="text-xs text-foreground/80">{s.math.steps.replace('product, payout, and profit', 'product; payout; profit')}</div>
            </div>
          )}
        </div>
      </div>
  )
}

function safeParseTextToScripts(text: string) {
  try {
    const pattern = /(?:^|\n)(Script\s+\d+[^\n]*)([\s\S]*?)(?=(?:\nScript\s+\d+)|$)/gi
    const scripts: any[] = []
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const heading = match[1]?.trim() ?? ''
      const body = match[2] ?? ''
      const titleMatch = heading.match(/^Script\s+\d+\s*[-:\u2013\u2014]?\s*(.*)$/i) || heading.match(/^Script\s+\d+\s*\((.*)\)$/i)
      const rawTitle = titleMatch && titleMatch[1] ? titleMatch[1].trim() : heading
      const title = rawTitle || heading || 'Script'
      const legs = (body.match(/\n\s*•\s+.*$/gm) || []).slice(0, 5).map(l => ({ text: l.replace(/^\s*•\s+/, '').trim() }))
      const mathMatch = body.match(/\$1\s*Parlay\s*Math:\s*([^\n]+)/i)
      const math = mathMatch ? { steps: mathMatch[1].trim() } : undefined
      scripts.push({ title, legs, math })
    }
    return scripts.length ? { scripts } : null
  } catch {
    return null
  }
}
