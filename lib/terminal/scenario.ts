import { createHash } from 'crypto'
import {
  GAME_AGENT_CATALOG,
  GAME_AGENT_IDS,
  type GameAgentId,
  type ScenarioAnchor,
  type ScenarioAnchorId,
  type ScenarioEvent,
  type ScenarioGame,
  type ScenarioResolution,
} from '@/lib/terminal/contracts'

const AGENT_ANCHORS: Record<GameAgentId, ScenarioAnchorId[]> = {
  weather: ['game_under', 'grind', 'run_heavy'],
  pressure: ['game_under', 'grind'],
  pace: ['game_over', 'shootout'],
  injury: ['game_under', 'grind'],
  epa: ['blowout'],
  qb: ['game_over', 'pass_heavy'],
  hb: ['run_heavy', 'grind'],
  wr: ['game_over', 'pass_heavy'],
  te: ['pass_heavy'],
  usage: ['pass_heavy'],
}
const AGENT_EVENTS: Record<GameAgentId, string> = {
  weather: 'Game conditions suppress clean execution, pushing play calling toward lower-variance outcomes.',
  pressure: 'Pressure shortens quarterback timing, increasing stalled drives and reducing downfield efficiency.',
  pace: 'A faster possession cycle creates more plays, more scoring chances, and more paths to volume.',
  injury: 'Material availability changes redistribute responsibility and lower the margin for failed execution.',
  epa: 'The stronger efficiency profile compounds across possessions and can create scoreboard separation.',
  qb: 'Quarterback efficiency becomes the hinge for sustained drives and explosive scoring outcomes.',
  hb: 'Backfield volume controls possession length and makes rushing success central to the result.',
  wr: 'Concentrated receiver usage turns passing success into repeatable explosive-play opportunities.',
  te: 'Middle-field and red-zone access make tight-end involvement a key conversion mechanism.',
  usage: 'A concentrated role funnels opportunities toward the players most likely to capture game volume.',
}

function stableId(prefix: string, values: string[]): string {
  return `${prefix}_${createHash('sha256').update(values.join('|')).digest('hex').slice(0, 12)}`
}

export function createAnchorCatalog(game: ScenarioGame): ScenarioAnchor[] {
  return [
    { id: 'game_over', category: 'total', label: 'Game over', exclusive_group: 'total' },
    { id: 'game_under', category: 'total', label: 'Game under', exclusive_group: 'total' },
    { id: 'home_win', category: 'winner', label: `${game.home_team} wins`, exclusive_group: 'winner' },
    { id: 'away_win', category: 'winner', label: `${game.away_team} wins`, exclusive_group: 'winner' },
    { id: 'home_cover', category: 'spread', label: `${game.home_team} covers`, exclusive_group: 'spread' },
    { id: 'away_cover', category: 'spread', label: `${game.away_team} covers`, exclusive_group: 'spread' },
    { id: 'shootout', category: 'shape', label: 'Shootout', exclusive_group: 'shape' },
    { id: 'grind', category: 'shape', label: 'Grind', exclusive_group: 'shape' },
    { id: 'blowout', category: 'shape', label: 'Blowout', exclusive_group: 'shape' },
    { id: 'pass_heavy', category: 'style', label: 'Pass-heavy', exclusive_group: 'style' },
    { id: 'run_heavy', category: 'style', label: 'Run-heavy', exclusive_group: 'style' },
  ]
}

export function suggestAnchors(agentIds: GameAgentId[], anchors: ScenarioAnchor[]): ScenarioAnchorId[] {
  const scores = new Map<ScenarioAnchorId, number>()
  const firstSeen = new Map<ScenarioAnchorId, number>()
  let sequence = 0

  for (const agentId of GAME_AGENT_IDS) {
    if (!agentIds.includes(agentId)) continue
    for (const anchorId of AGENT_ANCHORS[agentId]) {
      scores.set(anchorId, (scores.get(anchorId) ?? 0) + 1)
      if (!firstSeen.has(anchorId)) firstSeen.set(anchorId, sequence++)
    }
  }

  const winners = new Map<string, ScenarioAnchorId>()
  for (const anchor of anchors) {
    if (!scores.has(anchor.id)) continue
    const current = winners.get(anchor.exclusive_group)
    if (!current) {
      winners.set(anchor.exclusive_group, anchor.id)
      continue
    }
    const score = scores.get(anchor.id) ?? 0
    const currentScore = scores.get(current) ?? 0
    if (score > currentScore || (score === currentScore && (firstSeen.get(anchor.id) ?? 0) < (firstSeen.get(current) ?? 0))) {
      winners.set(anchor.exclusive_group, anchor.id)
    }
  }

  return anchors.map(anchor => anchor.id).filter(id => [...winners.values()].includes(id))
}

export function resolveScenario(params: {
  game: ScenarioGame
  agentIds: GameAgentId[]
  now?: Date
}): ScenarioResolution {
  const selectedAgentIds = GAME_AGENT_IDS.filter(id => params.agentIds.includes(id))
  const anchors = createAnchorCatalog(params.game)
  const events: ScenarioEvent[] = selectedAgentIds.map(agentId => ({
    id: stableId('event', [params.game.game_id, agentId]),
    agent_id: agentId,
    label: GAME_AGENT_CATALOG[agentId].label,
    statement: AGENT_EVENTS[agentId],
    suggested_anchor_ids: AGENT_ANCHORS[agentId],
  }))

  return {
    scenario_id: stableId('scenario', [params.game.game_id, ...selectedAgentIds]),
    game: params.game,
    selected_agent_ids: selectedAgentIds,
    events,
    anchors,
    suggested_anchor_ids: suggestAnchors(selectedAgentIds, anchors),
    resolved_at: (params.now ?? new Date()).toISOString(),
    evidence_state: 'scenario_assumptions',
  }
}
