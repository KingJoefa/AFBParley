'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import SwantailScriptsView from '@/components/SwantailScriptsView'
import SwantailTerminalPanel from '@/components/SwantailTerminalPanel'
import {
  GAME_AGENT_IDS,
  GameScriptSchema,
  ScenarioResolutionSchema,
  type GameAgentId,
  type GameScript,
  type ScenarioAnchorId,
  type ScenarioGame,
  type ScenarioResolution,
} from '@/lib/terminal/contracts'

type ScheduleResponse = {
  season: number
  seasonLabel?: string
  week: number
  round?: string
  games: ScenarioGame[]
  totalGames: number
}

const DEFAULT_AGENTS: GameAgentId[] = ['weather', 'pressure']

function isGameAgentId(value: unknown): value is GameAgentId {
  return typeof value === 'string' && GAME_AGENT_IDS.includes(value as GameAgentId)
}

export default function AssistedBuilder() {
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null)
  const [selectedGameId, setSelectedGameId] = useState('')
  const [selectedAgentIds, setSelectedAgentIds] = useState<GameAgentId[]>(DEFAULT_AGENTS)
  const [scenario, setScenario] = useState<ScenarioResolution | null>(null)
  const [selectedAnchorIds, setSelectedAnchorIds] = useState<ScenarioAnchorId[]>([])
  const [script, setScript] = useState<GameScript | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(true)
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [scriptLoading, setScriptLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem('swantail:game-agents')
      if (!stored) return
      const parsed = JSON.parse(stored)
      if (!Array.isArray(parsed)) return
      const valid = parsed.filter(isGameAgentId)
      if (valid.length) setSelectedAgentIds(valid)
    } catch {
      // A malformed session preference should never block the terminal.
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function loadActiveWeek() {
      setScheduleLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/nfl/schedule', {
          cache: 'no-store',
          signal: controller.signal,
        })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? 'Active week is unavailable')

        const nextSchedule: ScheduleResponse = {
          season: body.season,
          seasonLabel: body.seasonLabel,
          week: body.week,
          round: body.round,
          games: body.games,
          totalGames: body.totalGames,
        }
        setSchedule(nextSchedule)
        setSelectedGameId(current => current || nextSchedule.games[0]?.game_id || '')
      } catch (loadError) {
        if ((loadError as Error).name !== 'AbortError') {
          setError((loadError as Error).message)
        }
      } finally {
        if (!controller.signal.aborted) setScheduleLoading(false)
      }
    }

    void loadActiveWeek()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    window.sessionStorage.setItem('swantail:game-agents', JSON.stringify(selectedAgentIds))
  }, [selectedAgentIds])

  const selectedGame = useMemo(
    () => schedule?.games.find(game => game.game_id === selectedGameId) ?? null,
    [schedule, selectedGameId],
  )

  const resetScenario = useCallback(() => {
    setScenario(null)
    setSelectedAnchorIds([])
    setScript(null)
    setError(null)
  }, [])

  const handleGameChange = useCallback((gameId: string) => {
    setSelectedGameId(gameId)
    resetScenario()
  }, [resetScenario])

  const handleAgentToggle = useCallback((agentId: GameAgentId) => {
    setSelectedAgentIds(current => (
      current.includes(agentId)
        ? current.filter(id => id !== agentId)
        : GAME_AGENT_IDS.filter(id => [...current, agentId].includes(id))
    ))
    resetScenario()
  }, [resetScenario])

  const handleResolveScenario = useCallback(async () => {
    if (!selectedGame || !selectedAgentIds.length) return
    setScenarioLoading(true)
    setError(null)
    setScenario(null)
    setScript(null)

    try {
      const response = await fetch('/api/terminal/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_id: selectedGame.game_id,
          agent_ids: selectedAgentIds,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Game Agents could not resolve this scenario')

      const nextScenario = ScenarioResolutionSchema.parse(body.scenario)
      setScenario(nextScenario)
      setSelectedAnchorIds(nextScenario.suggested_anchor_ids)
    } catch (scenarioError) {
      setError((scenarioError as Error).message)
    } finally {
      setScenarioLoading(false)
    }
  }, [selectedAgentIds, selectedGame])

  const handleAnchorToggle = useCallback((anchorId: ScenarioAnchorId) => {
    if (!scenario) return
    const anchor = scenario.anchors.find(item => item.id === anchorId)
    if (!anchor) return

    setSelectedAnchorIds(current => {
      if (current.includes(anchorId)) return current.filter(id => id !== anchorId)
      const conflictingIds = scenario.anchors
        .filter(item => item.exclusive_group === anchor.exclusive_group)
        .map(item => item.id)
      const next = new Set([...current.filter(id => !conflictingIds.includes(id)), anchorId])
      return scenario.anchors.map(item => item.id).filter(id => next.has(id))
    })
    setScript(null)
  }, [scenario])

  const handleGenerateScript = useCallback(async () => {
    if (!scenario || !selectedAnchorIds.length) return
    setScriptLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/terminal/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario, anchor_ids: selectedAnchorIds }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'The Game Script could not be generated')
      setScript(GameScriptSchema.parse(body.script))
    } catch (scriptError) {
      setError((scriptError as Error).message)
    } finally {
      setScriptLoading(false)
    }
  }, [scenario, selectedAnchorIds])

  return (
    <main className="swantail-shell min-h-screen text-[#fbf6ee]">
      <header className="swantail-header sticky top-0 z-40 border-b">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="swantail-wordmark flex h-10 w-10 items-center justify-center rounded-md font-mono text-sm font-black">
              ST
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight text-[#fffaf1]">Swantail</h1>
              <p className="font-mono text-[10px] uppercase text-[#d7c7b3]/65 sm:text-[11px]">Game Script Builder</p>
            </div>
          </div>
          <div className="rounded-md border border-[#fffaf1]/10 bg-[#fffaf1]/5 px-2.5 py-1.5 text-right font-mono text-[10px] uppercase text-[#e8d9c5]/70 sm:text-[11px]">
            {schedule ? `${schedule.seasonLabel ?? schedule.season} / Week ${schedule.week}` : 'Schedule connecting'}
          </div>
        </div>
      </header>

      <div className="swantail-workspace mx-auto grid max-w-[1480px] gap-3 px-3 py-4 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)] lg:gap-0 lg:px-8">
        <SwantailTerminalPanel
          schedule={schedule}
          scheduleLoading={scheduleLoading}
          selectedGameId={selectedGameId}
          selectedGame={selectedGame}
          selectedAgentIds={selectedAgentIds}
          scenario={scenario}
          selectedAnchorIds={selectedAnchorIds}
          scenarioLoading={scenarioLoading}
          scriptLoading={scriptLoading}
          error={error}
          onGameChange={handleGameChange}
          onAgentToggle={handleAgentToggle}
          onResolveScenario={handleResolveScenario}
          onAnchorToggle={handleAnchorToggle}
          onGenerateScript={handleGenerateScript}
        />
        <SwantailScriptsView
          script={script}
          scenario={scenario}
          selectedAnchorIds={selectedAnchorIds}
          isLoading={scriptLoading}
        />
      </div>
    </main>
  )
}
