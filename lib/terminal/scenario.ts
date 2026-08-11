import type { GameSnapshot, Observation, SnapshotAvailability } from '@/lib/data/contracts'
import { contentHash, stableId } from '@/lib/data/hash'
import {
  GAME_AGENT_CATALOG,
  GAME_AGENT_IDS,
  type GameAgentId,
  type ScenarioAnchor,
  type ScenarioAnchorId,
  type ScenarioEvent,
  type ScenarioGame,
  type ScenarioResolution,
  ScenarioResolutionSchema,
  TERMINAL_CONTRACT_VERSION,
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

function recordValue(observation: Observation | undefined): Record<string, unknown> {
  return observation?.value && typeof observation.value === 'object' && !Array.isArray(observation.value)
    ? observation.value as Record<string, unknown>
    : {}
}

function eventEvidence(params: {
  agentId: GameAgentId
  observations: Observation[]
  availability?: SnapshotAvailability
  now: Date
}): Pick<ScenarioEvent, 'statement' | 'evidence_state' | 'observations'> {
  const assumption = AGENT_EVENTS[params.agentId]
  if (!params.availability) {
    return { statement: assumption, evidence_state: 'assumption_only', observations: [] }
  }
  if (!params.observations.length) {
    const enclosedVenue = params.agentId === 'weather'
      && params.availability.state === 'available'
      && params.availability.message?.startsWith('Enclosed venue')
    return {
      statement: enclosedVenue
        ? `${params.availability.message}; this conflicts with a material exterior weather-suppression scenario.`
        : `${assumption} No current sourced observation is attached, so this remains a scenario assumption.`,
      evidence_state: enclosedVenue ? 'observed_conflict' : 'missing',
      observations: [],
    }
  }
  const allStale = params.observations.every(observation => (
    observation.expires_at && Date.parse(observation.expires_at) <= params.now.getTime()
  ))
  if (allStale) {
    return {
      statement: `${assumption} The latest attached observations are stale and should not be treated as current support.`,
      evidence_state: 'stale',
      observations: params.observations,
    }
  }

  if (params.agentId === 'weather') {
    const value = recordValue(params.observations[0])
    const wind = typeof value.wind_mph === 'number' ? value.wind_mph : null
    const precipitation = typeof value.precipitation_probability === 'number'
      ? value.precipitation_probability
      : null
    const summary = typeof value.summary === 'string' ? value.summary : 'available conditions'
    const detail = [
      wind !== null ? `${wind} mph wind` : null,
      precipitation !== null ? `${precipitation}% precipitation probability` : null,
      summary,
    ].filter(Boolean).join(', ')
    const suppressive = (wind ?? 0) >= 15 || (precipitation ?? 0) >= 40
    return {
      statement: suppressive
        ? `The NWS kickoff forecast shows ${detail}; those conditions support the selected weather-suppression scenario.`
        : `The NWS kickoff forecast shows ${detail}; current conditions do not support a material weather-suppression scenario.`,
      evidence_state: suppressive ? 'observed_support' : 'observed_conflict',
      observations: params.observations,
    }
  }

  if (params.agentId === 'injury') {
    const material = params.observations.filter(observation => {
      const status = String(recordValue(observation).report_status ?? '').toLowerCase()
      return ['out', 'doubtful', 'questionable'].includes(status)
    })
    const names = material.slice(0, 3).map(observation => observation.subject.label).filter(Boolean)
    return {
      statement: material.length
        ? `${material.length} material player availability report${material.length === 1 ? '' : 's'} are attached${names.length ? `, including ${names.join(', ')}` : ''}; role and efficiency changes are a supported scenario input.`
        : 'Current injury observations contain practice or contextual statuses, but no material game designation supporting the selected injury scenario.',
      evidence_state: material.length ? 'observed_support' : 'observed_context',
      observations: params.observations,
    }
  }

  if (params.agentId === 'epa') {
    const ranked = params.observations
      .map(observation => ({ observation, value: recordValue(observation) }))
      .filter(item => typeof item.value.rank === 'number')
      .sort((left, right) => Number(left.value.rank) - Number(right.value.rank))
    if (ranked.length >= 2) {
      const stronger = ranked[0]
      const weaker = ranked[1]
      const gap = Number(weaker.value.rank) - Number(stronger.value.rank)
      return {
        statement: `${stronger.observation.subject.id} ranks ${stronger.value.rank} and ${weaker.observation.subject.id} ranks ${weaker.value.rank} in the attached offensive EPA-per-play baseline; ${gap >= 8 ? 'the gap supports an efficiency-mismatch scenario' : 'the gap is not large enough to establish a strong mismatch'}.`,
        evidence_state: gap >= 8 ? 'observed_support' : 'observed_context',
        observations: params.observations,
      }
    }
  }

  return {
    statement: assumption,
    evidence_state: 'observed_context',
    observations: params.observations,
  }
}

function scenarioEvidenceState(events: ScenarioEvent[]): ScenarioResolution['evidence_state'] {
  const states = events.map(event => event.evidence_state)
  if (states.every(state => state === 'assumption_only')) return 'scenario_assumptions'
  const degraded = states.some(state => state === 'missing' || state === 'stale')
  const assumptions = states.some(state => state === 'assumption_only')
  const observed = states.some(state => state.startsWith('observed_'))
  if (degraded && !observed) return 'degraded'
  if (degraded || assumptions) return 'mixed'
  return 'observations_available'
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
  snapshot?: GameSnapshot | null
  now?: Date
}): ScenarioResolution {
  if (params.snapshot && params.snapshot.game_id !== params.game.game_id) {
    throw new Error('Scenario snapshot does not belong to the selected game')
  }
  const now = params.now ?? new Date()
  const selectedAgentIds = GAME_AGENT_IDS.filter(id => params.agentIds.includes(id))
  const anchors = createAnchorCatalog(params.game)
  const snapshotId = params.snapshot?.snapshot_id ?? stableId('snapshot', {
    game_id: params.game.game_id,
    kickoff: params.game.kickoff,
    source: 'schedule-only',
  })
  const events: ScenarioEvent[] = selectedAgentIds.map(agentId => {
    const observations = params.snapshot?.observations.filter(item => item.agent_id === agentId) ?? []
    const availability = params.snapshot && ['weather', 'injury', 'epa'].includes(agentId)
      ? params.snapshot.availability[agentId as keyof GameSnapshot['availability']]
      : undefined
    return {
      id: stableId('event', { game_id: params.game.game_id, agent_id: agentId, snapshot_id: snapshotId }),
      agent_id: agentId,
      label: GAME_AGENT_CATALOG[agentId].label,
      assumption: AGENT_EVENTS[agentId],
      ...eventEvidence({ agentId, observations, availability, now }),
      suggested_anchor_ids: AGENT_ANCHORS[agentId],
    }
  })
  const scenarioId = stableId('scenario', {
    game_id: params.game.game_id,
    selected_agent_ids: selectedAgentIds,
  })
  const inputHash = contentHash({
    contract_version: TERMINAL_CONTRACT_VERSION,
    scenario_id: scenarioId,
    snapshot_id: snapshotId,
    selected_agent_ids: selectedAgentIds,
  })

  return ScenarioResolutionSchema.parse({
    scenario_id: scenarioId,
    scenario_revision_id: stableId('scenario_revision', inputHash),
    snapshot_id: snapshotId,
    snapshot_captured_at: params.snapshot?.captured_at ?? now.toISOString(),
    contract_version: TERMINAL_CONTRACT_VERSION,
    input_hash: inputHash,
    game: params.game,
    selected_agent_ids: selectedAgentIds,
    events,
    anchors,
    suggested_anchor_ids: suggestAnchors(selectedAgentIds, anchors),
    resolved_at: now.toISOString(),
    evidence_state: scenarioEvidenceState(events),
  })
}
