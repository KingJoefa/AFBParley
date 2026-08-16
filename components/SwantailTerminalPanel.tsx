'use client'

import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ChartNoAxesCombined,
  Check,
  CloudSun,
  Crosshair,
  Gauge,
  HeartPulse,
  Info,
  LoaderCircle,
  Moon,
  Play,
  RefreshCcw,
  Shield,
  Sparkles,
  TimerReset,
  TrendingUp,
  X,
} from 'lucide-react'
import {
  GAME_AGENT_CATALOG,
  GAME_AGENT_IDS,
  TERMINAL_CONTRACT_VERSION,
  type GameAgentId,
  type ScenarioAnchorId,
  type ScenarioGame,
  type ScenarioResolution,
} from '@/lib/terminal/contracts'

type ScheduleSummary = {
  season: number
  seasonLabel?: string
  week: number
  round?: string
  games: ScenarioGame[]
  totalGames: number
}
const AGENT_ICONS: Record<GameAgentId, LucideIcon> = {
  weather: CloudSun,
  momentum: TrendingUp,
  pace: TimerReset,
  injury: HeartPulse,
  epa: ChartNoAxesCombined,
  pressure: Gauge,
  trenches: Shield,
  turnovers: RefreshCcw,
  qb: Crosshair,
  rest: Moon,
}

const ANCHOR_CATEGORY_LABELS = {
  total: 'Score',
  winner: 'Winner',
  spread: 'Cover',
  shape: 'Shape',
  style: 'Style',
} as const

const FINDING_STYLES = {
  material: 'border-amber-200/30 bg-amber-200/10 text-amber-100',
  contextual: 'border-cyan-200/25 bg-cyan-200/10 text-cyan-100',
  balanced: 'border-emerald-200/25 bg-emerald-200/10 text-emerald-100',
  unavailable: 'border-white/10 bg-white/5 text-white/45',
} as const

const AGENT_GUIDE_STORAGE_KEY = 'swantail:agent-guide'

type Props = {
  schedule: ScheduleSummary | null
  scheduleLoading: boolean
  selectedGameId: string
  selectedGame: ScenarioGame | null
  selectedAgentIds: GameAgentId[]
  scenario: ScenarioResolution | null
  selectedAnchorIds: ScenarioAnchorId[]
  scenarioLoading: boolean
  scriptLoading: boolean
  error: string | null
  onGameChange: (gameId: string) => void
  onAgentToggle: (agentId: GameAgentId) => void
  onResolveScenario: () => void
  onAnchorToggle: (anchorId: ScenarioAnchorId) => void
  onGenerateScript: () => void
}

export default function SwantailTerminalPanel({
  schedule,
  scheduleLoading,
  selectedGameId,
  selectedGame,
  selectedAgentIds,
  scenario,
  selectedAnchorIds,
  scenarioLoading,
  scriptLoading,
  error,
  onGameChange,
  onAgentToggle,
  onResolveScenario,
  onAnchorToggle,
  onGenerateScript,
}: Props) {
  const [agentGuideEnabled, setAgentGuideEnabled] = useState(true)
  const [infoAgentId, setInfoAgentId] = useState<GameAgentId | null>(null)

  useEffect(() => {
    try {
      setAgentGuideEnabled(window.localStorage.getItem(AGENT_GUIDE_STORAGE_KEY) !== 'off')
    } catch {
      // Keep guidance enabled when storage is unavailable.
    }
  }, [])

  const toggleAgentGuide = () => {
    setAgentGuideEnabled(current => {
      const next = !current
      try {
        window.localStorage.setItem(AGENT_GUIDE_STORAGE_KEY, next ? 'on' : 'off')
      } catch {
        // The preference can remain session-only when storage is unavailable.
      }
      if (!next) setInfoAgentId(null)
      return next
    })
  }

  const infoAgent = infoAgentId ? GAME_AGENT_CATALOG[infoAgentId] : null
  const categories = scenario
    ? Object.entries(ANCHOR_CATEGORY_LABELS).map(([category, label]) => ({
        category,
        label,
        anchors: scenario.anchors.filter(anchor => anchor.category === category),
      }))
    : []

  return (
    <section className="overflow-hidden rounded-lg border border-white/10 bg-[#101211] lg:rounded-r-none" aria-label="Game Script Terminal">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#151816] px-4 py-3">
        <div className="flex items-center gap-2 font-mono text-xs uppercase text-white/65">
          <span className="h-2 w-2 rounded-full bg-emerald-300" />
          {TERMINAL_CONTRACT_VERSION}
        </div>
        <span className="font-mono text-[11px] text-white/35">CURRENT WEEK ONLY</span>
      </div>

      <div className="border-b border-white/10 p-4 sm:p-5">
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="matchup" className="font-mono text-[11px] uppercase text-white/45">Active matchup</label>
          <span className="font-mono text-[11px] text-white/35">
            {schedule ? `${schedule.totalGames} games` : 'connecting'}
          </span>
        </div>
        <select
          id="matchup"
          value={selectedGameId}
          onChange={event => onGameChange(event.target.value)}
          disabled={scheduleLoading || !schedule?.games.length}
          className="h-11 w-full rounded-md border border-white/15 bg-[#0a0c0b] px-3 text-sm text-white outline-none transition focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/10 disabled:opacity-50"
        >
          {scheduleLoading && <option>Loading active week...</option>}
          {schedule?.games.map(game => (
            <option key={game.game_id} value={game.game_id}>
              {game.display} / {game.time}
            </option>
          ))}
        </select>
      </div>

      <div className="border-b border-white/10 p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-[11px] uppercase text-white/45">Game Agents</h2>
          <span className="font-mono text-[11px] text-emerald-200/70">{selectedAgentIds.length} selected</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {GAME_AGENT_IDS.map((agentId, index) => {
            const agent = GAME_AGENT_CATALOG[agentId]
            const Icon = AGENT_ICONS[agentId]
            const selected = selectedAgentIds.includes(agentId)
            const tooltipAlignment = index % 5 === 0
              ? 'left-0'
              : index % 5 === 4
                ? 'right-0'
                : 'left-1/2 -translate-x-1/2'
            return (
              <div
                key={agentId}
                className={`group relative min-h-[76px] rounded-md border transition focus-within:ring-2 focus-within:ring-emerald-300/30 ${
                  selected
                    ? 'border-emerald-300/45 bg-emerald-300/10 text-white'
                    : 'border-white/10 bg-black/15 text-white/55 hover:border-white/20 hover:text-white/80'
                }`}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-describedby={agentGuideEnabled ? `agent-tooltip-${agentId}` : undefined}
                  onClick={() => onAgentToggle(agentId)}
                  className="min-h-[74px] w-full rounded-md p-2.5 text-left focus:outline-none"
                >
                  <div className="flex items-center justify-between pr-7">
                    <Icon className={`h-4 w-4 ${selected ? 'text-emerald-200' : 'text-white/35'}`} aria-hidden />
                    {selected && <Check className="h-3.5 w-3.5 text-emerald-200" aria-hidden />}
                  </div>
                  <div className="mt-3 text-xs font-medium">{agent.label}</div>
                </button>

                {agentGuideEnabled && (
                  <>
                    <button
                      type="button"
                      aria-label={`About ${agent.label}`}
                      aria-expanded={infoAgentId === agentId}
                      aria-controls="agent-guide-detail"
                      onClick={() => setInfoAgentId(current => current === agentId ? null : agentId)}
                      className="absolute right-1.5 top-1.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white focus:outline-none focus:ring-2 focus:ring-cyan-200/30 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                    >
                      <Info className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <div
                      id={`agent-tooltip-${agentId}`}
                      role="tooltip"
                      className={`invisible absolute top-[calc(100%+8px)] z-30 hidden w-64 rounded-md border border-white/15 bg-[#171a18] p-3 text-left opacity-0 shadow-xl transition sm:block sm:group-hover:visible sm:group-hover:opacity-100 sm:group-focus-within:visible sm:group-focus-within:opacity-100 ${tooltipAlignment}`}
                    >
                      <div className="text-xs font-semibold leading-5 text-white">{agent.question}</div>
                      <p className="mt-1 text-[11px] leading-4 text-white/60">{agent.description}</p>
                      <div className="mt-2 font-mono text-[9px] uppercase text-cyan-200/55">
                        {agent.dataSupport === 'pilot_observations' ? 'Sourced context available' : 'Scenario framing lens'}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {agentGuideEnabled && infoAgent && (
          <div id="agent-guide-detail" role="region" aria-live="polite" className="mt-3 border-l-2 border-cyan-200/45 bg-cyan-200/[0.06] px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase text-cyan-100/65">{infoAgent.label} agent</div>
                <div className="mt-1 text-sm font-medium leading-5 text-white/90">{infoAgent.question}</div>
              </div>
              <button
                type="button"
                aria-label="Close agent information"
                onClick={() => setInfoAgentId(null)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-200/30"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            <p className="mt-1 text-xs leading-5 text-white/55">{infoAgent.description}</p>
            <div className="mt-2 font-mono text-[9px] uppercase text-cyan-200/50">
              {infoAgent.dataSupport === 'pilot_observations' ? 'Sourced context available' : 'Scenario framing lens'}
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
          <div>
            <div className="text-xs font-medium text-white/70">Agent guide</div>
            <div className="mt-0.5 text-[10px] text-white/35">Descriptions and data status</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={agentGuideEnabled}
            aria-label="Show agent guidance"
            onClick={toggleAgentGuide}
            className={`relative h-5 w-9 rounded-full border transition focus:outline-none focus:ring-2 focus:ring-emerald-300/30 ${
              agentGuideEnabled ? 'border-emerald-300/45 bg-emerald-300/25' : 'border-white/15 bg-white/5'
            }`}
          >
            <span
              className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition ${
                agentGuideEnabled ? 'left-[18px] bg-emerald-200' : 'left-0.5 bg-white/45'
              }`}
            />
          </button>
        </div>
        <button
          type="button"
          onClick={onResolveScenario}
          disabled={!selectedGame || !selectedAgentIds.length || scenarioLoading || scriptLoading}
          className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-300 px-4 text-sm font-semibold text-[#07110c] transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {scenarioLoading
            ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
            : <Play className="h-4 w-4 fill-current" aria-hidden />}
          {scenarioLoading ? 'Resolving scenario' : scenario ? 'Run agents again' : 'Run agents'}
        </button>
      </div>

      <div className="min-h-[230px] border-b border-white/10 bg-[#080a09] p-4 font-mono text-xs leading-6 sm:p-5" aria-live="polite">
        <div className="text-white/35">swantail://active-week</div>
        {schedule && <div className="text-cyan-200/75">schedule  {schedule.seasonLabel ?? schedule.season} week {schedule.week} ready</div>}
        {selectedGame && <div className="text-white/65">matchup   {selectedGame.display}</div>}
        <div className="text-white/65">agents    {selectedAgentIds.length ? selectedAgentIds.join(' + ') : 'none'}</div>
        {scenarioLoading && <div className="text-amber-200/80">dispatch  analyzing matchup data...</div>}
        {scenario?.events.map(event => {
          const providers = [...new Set(event.observations.map(observation => observation.source.provider))]
          const observedAt = event.observations
            .map(observation => Date.parse(observation.observed_at))
            .filter(Number.isFinite)
            .sort((left, right) => right - left)[0]
          return (
            <article key={event.id} className="border-b border-white/10 py-4 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase text-emerald-200/80">{event.label}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[9px] uppercase leading-none ${FINDING_STYLES[event.finding.state]}`}>
                  {event.finding.state}
                </span>
                {event.finding.direction !== 'none' && (
                  <span className="text-[10px] uppercase text-white/35">
                    {event.finding.direction === 'away' ? selectedGame?.away_team : selectedGame?.home_team} path
                  </span>
                )}
              </div>
              <h3 className="mt-1.5 font-sans text-sm font-medium leading-5 text-white/90">{event.finding.headline}</h3>
              <p className="mt-1 font-sans text-xs leading-5 text-white/55">{event.finding.detail}</p>
              {event.finding.signals.length > 0 && (
                <div className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-3">
                  {event.finding.signals.slice(0, 3).map(signal => (
                    <div key={signal.label} className="min-w-0 border-l border-white/10 pl-2.5">
                      <div className="text-[9px] uppercase text-white/30">{signal.label}</div>
                      {signal.value && <div className="mt-0.5 break-words text-[11px] leading-4 text-white/70">{signal.value}</div>}
                      {(signal.away_value || signal.home_value) && (
                        <div className="mt-0.5 break-words text-[10px] leading-4 text-white/65">
                          {selectedGame?.away_team} {signal.away_value ?? '-'} <span className="text-white/25">/</span> {selectedGame?.home_team} {signal.home_value ?? '-'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] uppercase text-white/25">
                <span>{event.evidence_state.replace(/_/g, ' ')}</span>
                {providers.length > 0 && <span>source {providers.join(' + ')}</span>}
                {observedAt && <span>as of {new Date(observedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
              </div>
              {event.finding.caveats[0] && (
                <p className="mt-1 font-sans text-[10px] leading-4 text-white/30">{event.finding.caveats[0]}</p>
              )}
            </article>
          )
        })}
        {scenario && (
          <div className="mt-2 text-cyan-200/75">
            scenario  {scenario.events.length} agents / {scenario.evidence_state.replace(/_/g, ' ')} / {scenario.suggested_anchor_ids.length} anchors
          </div>
        )}
        {!scenario && !scenarioLoading && (
          <div className="mt-2 flex items-center gap-2 text-white/30">
            <span className="inline-block h-3 w-1.5 animate-pulse bg-emerald-300/70" />
            awaiting dispatch
          </div>
        )}
      </div>

      {scenario && (
        <div className="p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-[11px] uppercase text-white/45">Outcome Anchors</h2>
            <span className="font-mono text-[11px] text-cyan-200/60">agent suggestions applied</span>
          </div>
          <div className="space-y-3">
            {categories.map(group => (
              <div key={group.category} className="grid gap-2 sm:grid-cols-[64px_1fr] sm:items-center">
                <span className="font-mono text-[10px] uppercase text-white/30">{group.label}</span>
                <div className="flex flex-wrap gap-2">
                  {group.anchors.map(anchor => {
                    const selected = selectedAnchorIds.includes(anchor.id)
                    const suggested = scenario.suggested_anchor_ids.includes(anchor.id)
                    return (
                      <button
                        key={anchor.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onAnchorToggle(anchor.id)}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition ${
                          selected
                            ? 'border-cyan-200/45 bg-cyan-200/10 text-cyan-100'
                            : 'border-white/10 bg-black/20 text-white/50 hover:border-white/20 hover:text-white/75'
                        }`}
                      >
                        {selected && <Check className="h-3 w-3" aria-hidden />}
                        {anchor.label}
                        {suggested && <span className="sr-only">Agent suggested</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onGenerateScript}
            disabled={!selectedAnchorIds.length || scriptLoading}
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-cyan-200/40 bg-cyan-200/10 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-200/15 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {scriptLoading
              ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              : <Sparkles className="h-4 w-4" aria-hidden />}
            {scriptLoading ? 'Generating script' : 'Generate Game Script'}
          </button>
        </div>
      )}

      {error && (
        <div className="border-t border-red-300/20 bg-red-300/5 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </div>
      )}
    </section>
  )
}
