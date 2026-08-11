'use client'

import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  ChartNoAxesCombined,
  Check,
  CloudSun,
  Crosshair,
  Gauge,
  HeartPulse,
  LoaderCircle,
  Play,
  RadioTower,
  Route,
  ScanSearch,
  Sparkles,
  TimerReset,
} from 'lucide-react'
import {
  GAME_AGENT_CATALOG,
  GAME_AGENT_IDS,
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
  pressure: Gauge,
  pace: TimerReset,
  injury: HeartPulse,
  epa: ChartNoAxesCombined,
  qb: Crosshair,
  hb: Route,
  wr: RadioTower,
  te: Activity,
  usage: ScanSearch,
}

const ANCHOR_CATEGORY_LABELS = {
  total: 'Score',
  winner: 'Winner',
  spread: 'Cover',
  shape: 'Shape',
  style: 'Style',
} as const

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
          Terminal contract 2.0
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
          {GAME_AGENT_IDS.map(agentId => {
            const agent = GAME_AGENT_CATALOG[agentId]
            const Icon = AGENT_ICONS[agentId]
            const selected = selectedAgentIds.includes(agentId)
            return (
              <button
                key={agentId}
                type="button"
                aria-pressed={selected}
                title={agent.description}
                onClick={() => onAgentToggle(agentId)}
                className={`min-h-[76px] rounded-md border p-2.5 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-300/30 ${
                  selected
                    ? 'border-emerald-300/45 bg-emerald-300/10 text-white'
                    : 'border-white/10 bg-black/15 text-white/55 hover:border-white/20 hover:text-white/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Icon className={`h-4 w-4 ${selected ? 'text-emerald-200' : 'text-white/35'}`} aria-hidden />
                  {selected && <Check className="h-3.5 w-3.5 text-emerald-200" aria-hidden />}
                </div>
                <div className="mt-3 text-xs font-medium">{agent.label}</div>
              </button>
            )
          })}
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
        {scenarioLoading && <div className="text-amber-200/80">dispatch  resolving selected assumptions...</div>}
        {scenario?.events.map(event => (
          <div key={event.id} className="grid grid-cols-[72px_1fr] gap-2">
            <span className="text-emerald-200/70">{event.agent_id}</span>
            <span className="text-white/75">
              {event.statement}
              <span className="ml-2 text-[10px] uppercase text-white/30">[{event.evidence_state.replace(/_/g, ' ')}]</span>
            </span>
          </div>
        ))}
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
