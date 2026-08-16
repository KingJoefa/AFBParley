import {
  ObservationAgentIdSchema,
  type GameSnapshot,
  type Observation,
  type SnapshotAvailability,
} from '@/lib/data/contracts'
import { contentHash, stableId } from '@/lib/data/hash'
import {
  GAME_AGENT_CATALOG,
  GAME_AGENT_IDS,
  type AgentFinding,
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
  momentum: ['blowout'],
  pace: ['game_over', 'shootout'],
  injury: ['game_under', 'grind'],
  epa: ['blowout'],
  pressure: ['game_under', 'grind'],
  trenches: ['run_heavy', 'grind'],
  turnovers: ['high_variance'],
  qb: ['game_over', 'pass_heavy'],
  rest: ['grind'],
}

const AGENT_EVENTS: Record<GameAgentId, string> = {
  weather: 'Kickoff conditions interact with each offense\'s passing depth, handling, and kicking profile, potentially narrowing one playbook more than the other.',
  momentum: 'A durable change in opponent-adjusted execution, personnel, or scheme can reshape the matchup baseline beyond recent wins and losses.',
  pace: 'Neutral tempo, pass rate, and drive duration determine which offense can impose play volume and possession rhythm.',
  injury: 'An availability change matters when the replacement or scheme cannot preserve the missing function, forcing roles and responsibilities to move.',
  epa: 'The offense-versus-defense efficiency cross-match determines whether ordinary play-level success can repeat and compound across drives.',
  pressure: 'Pass-rush arrival meets protection and quarterback response, determining whether passing concepts develop or drives become fragile.',
  trenches: 'Each offensive line\'s run blocking and pass protection meet the opposing defensive line\'s pressure and disruption profile.',
  turnovers: 'Offensive ball risk meets repeatable defensive takeaway creation, creating the possibility of lost possessions and short fields.',
  qb: 'Quarterback decisions, accuracy, mobility, and sack avoidance meet the matchup\'s coverage, pressure, and down-and-distance demands.',
  rest: 'Turnaround, travel, and recent workload can modify a specific preparation, personnel, or unit-level matchup.',
}

type EventEvidence = Pick<ScenarioEvent,
  'statement' | 'finding' | 'evidence_state' | 'observations' | 'suggested_anchor_ids'
>

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
    { id: 'high_variance', category: 'shape', label: 'High variance', exclusive_group: 'shape' },
    { id: 'pass_heavy', category: 'style', label: 'Pass-heavy', exclusive_group: 'style' },
    { id: 'run_heavy', category: 'style', label: 'Run-heavy', exclusive_group: 'style' },
  ]
}

function recordValue(observation: Observation | undefined): Record<string, unknown> {
  return observation?.value && typeof observation.value === 'object' && !Array.isArray(observation.value)
    ? observation.value as Record<string, unknown>
    : {}
}

function numericValue(record: Record<string, unknown>, key: string): number | null {
  return typeof record[key] === 'number' && Number.isFinite(record[key]) ? record[key] as number : null
}

function teamObservation(observations: Observation[], team: string): Observation | undefined {
  return observations.find(observation => observation.subject.id === team)
}

function directionForTeam(team: string, game: ScenarioGame): AgentFinding['direction'] {
  if (team === game.away_team) return 'away'
  if (team === game.home_team) return 'home'
  return 'none'
}

function winnerAnchor(direction: AgentFinding['direction']): ScenarioAnchorId[] {
  if (direction === 'away') return ['away_win']
  if (direction === 'home') return ['home_win']
  return []
}

function rankStrength(rank: number | null, leagueSize: number | null): number {
  if (rank === null || leagueSize === null || leagueSize <= 1) return 0.5
  return (leagueSize - rank) / (leagueSize - 1)
}

function rankLabel(rank: number | null, leagueSize: number | null): string {
  return rank === null ? 'unavailable' : `#${rank}${leagueSize ? ` of ${leagueSize}` : ''}`
}

function priorSeasonCaveat(observations: Observation[], game: ScenarioGame): string[] {
  const dataSeason = numericValue(recordValue(observations[0]), 'data_season')
  return dataSeason !== null && dataSeason !== game.season
    ? [`Uses the ${dataSeason} regular season as an explicitly labeled Week 1 baseline.`]
    : []
}

function unavailableEvidence(params: {
  agentId: GameAgentId
  statement: string
  evidenceState: ScenarioEvent['evidence_state']
  observations?: Observation[]
  caveat: string
}): EventEvidence {
  return {
    statement: params.statement,
    finding: {
      state: 'unavailable',
      direction: 'none',
      headline: `${GAME_AGENT_CATALOG[params.agentId].label} does not have a current matchup finding`,
      detail: params.statement,
      signals: [],
      caveats: [params.caveat],
    },
    evidence_state: params.evidenceState,
    observations: params.observations ?? [],
    suggested_anchor_ids: params.evidenceState === 'assumption_only' ? AGENT_ANCHORS[params.agentId] : [],
  }
}

function weatherEvidence(observations: Observation[]): EventEvidence {
  const value = recordValue(observations[0])
  const wind = numericValue(value, 'wind_mph')
  const precipitation = numericValue(value, 'precipitation_probability')
  const summary = typeof value.summary === 'string' ? value.summary : 'available conditions'
  const detail = [
    wind !== null ? `${wind} mph wind` : null,
    precipitation !== null ? `${precipitation}% precipitation probability` : null,
    summary,
  ].filter(Boolean).join(', ')
  const suppressive = (wind ?? 0) >= 15 || (precipitation ?? 0) >= 40
  const statement = suppressive
    ? `The kickoff forecast shows ${detail}; those conditions can constrain clean passing and kicking execution.`
    : `The kickoff forecast shows ${detail}; current conditions do not create a material weather constraint.`
  return {
    statement,
    finding: {
      state: suppressive ? 'material' : 'balanced',
      direction: 'none',
      headline: suppressive ? 'Kickoff weather can narrow the available playbook' : 'Kickoff weather is not a material constraint',
      detail: statement,
      signals: [{
        label: 'Kickoff forecast',
        value: detail,
        observation_ids: observations.map(observation => observation.observation_id),
      }],
      caveats: ['Forecast conditions can change before kickoff.'],
    },
    evidence_state: suppressive ? 'observed_support' : 'observed_context',
    observations,
    suggested_anchor_ids: suppressive ? AGENT_ANCHORS.weather : [],
  }
}

function injuryEvidence(observations: Observation[]): EventEvidence {
  const material = observations.filter(observation => {
    const status = String(recordValue(observation).report_status ?? '').toLowerCase()
    return ['out', 'doubtful', 'questionable'].includes(status)
  })
  const names = material.slice(0, 3).map(observation => observation.subject.label).filter(Boolean)
  const statement = material.length
    ? `${material.length} material player availability report${material.length === 1 ? '' : 's'} are attached${names.length ? `, including ${names.join(', ')}` : ''}; their role effects still require matchup context.`
    : 'Current reports contain practice or contextual statuses, but no material game designation.'
  return {
    statement,
    finding: {
      state: material.length ? 'material' : 'balanced',
      direction: 'none',
      headline: material.length ? 'Availability can redistribute meaningful roles' : 'No material availability designation is attached',
      detail: statement,
      signals: [{
        label: 'Material reports',
        value: `${material.length} attached`,
        observation_ids: material.map(observation => observation.observation_id),
      }],
      caveats: ['A designation alone does not establish replacement quality or expected workload.'],
    },
    evidence_state: material.length ? 'observed_support' : 'observed_context',
    observations,
    suggested_anchor_ids: material.length ? AGENT_ANCHORS.injury : [],
  }
}

function epaEvidence(observations: Observation[], game: ScenarioGame): EventEvidence | null {
  const awayObservation = teamObservation(observations, game.away_team)
  const homeObservation = teamObservation(observations, game.home_team)
  if (!awayObservation || !homeObservation) return null
  const away = recordValue(awayObservation)
  const home = recordValue(homeObservation)
  const awayRank = numericValue(away, 'rank')
  const homeRank = numericValue(home, 'rank')
  if (awayRank === null || homeRank === null) return null
  const gap = Math.abs(awayRank - homeRank)
  const strongerTeam = awayRank < homeRank ? game.away_team : game.home_team
  const direction = directionForTeam(strongerTeam, game)
  const state: AgentFinding['state'] = gap >= 8 ? 'material' : gap >= 4 ? 'contextual' : 'balanced'
  const statement = state === 'material'
    ? `${strongerTeam} owns the stronger offensive EPA baseline by ${gap} ranking positions, creating a repeatable possession-value mechanism.`
    : `The offensive EPA baselines are separated by ${gap} ranking positions, which is not enough to establish a major efficiency mismatch.`
  return {
    statement,
    finding: {
      state,
      direction: state === 'balanced' ? 'none' : direction,
      headline: state === 'material' ? `${strongerTeam} has the clearer efficiency path` : 'The efficiency profiles are relatively close',
      detail: statement,
      signals: [{
        label: 'Offensive EPA rank',
        away_value: rankLabel(awayRank, numericValue(away, 'league_size')),
        home_value: rankLabel(homeRank, numericValue(home, 'league_size')),
        observation_ids: [awayObservation.observation_id, homeObservation.observation_id],
      }],
      caveats: priorSeasonCaveat(observations, game),
    },
    evidence_state: state === 'material' ? 'observed_support' : 'observed_context',
    observations,
    suggested_anchor_ids: state === 'material' ? [...winnerAnchor(direction), 'blowout'] : [],
  }
}

function turnoversEvidence(observations: Observation[], game: ScenarioGame): EventEvidence | null {
  const awayObservation = teamObservation(observations, game.away_team)
  const homeObservation = teamObservation(observations, game.home_team)
  if (!awayObservation || !homeObservation) return null
  const away = recordValue(awayObservation)
  const home = recordValue(homeObservation)
  const leagueSize = numericValue(away, 'league_size') ?? numericValue(home, 'league_size')
  const awayGiveawayRank = numericValue(away, 'giveaway_rank')
  const homeGiveawayRank = numericValue(home, 'giveaway_rank')
  const awayTakeawayRank = numericValue(away, 'takeaway_rank')
  const homeTakeawayRank = numericValue(home, 'takeaway_rank')
  const awayRisk = (1 - rankStrength(awayGiveawayRank, leagueSize) + rankStrength(homeTakeawayRank, leagueSize)) / 2
  const homeRisk = (1 - rankStrength(homeGiveawayRank, leagueSize) + rankStrength(awayTakeawayRank, leagueSize)) / 2
  const gap = Math.abs(awayRisk - homeRisk)
  const advantagedTeam = awayRisk < homeRisk ? game.away_team : game.home_team
  const direction = directionForTeam(advantagedTeam, game)
  const state: AgentFinding['state'] = gap >= 0.2 ? 'material' : gap >= 0.1 ? 'contextual' : 'balanced'
  const riskLabel = (risk: number) => risk >= 0.62 ? 'elevated' : risk <= 0.38 ? 'contained' : 'typical'
  const statement = state === 'material'
    ? `${advantagedTeam} has the cleaner turnover exchange when each offense's ball security is crossed with the opposing takeaway profile.`
    : 'The two turnover cross-matches are close enough that variance matters more than a stable team advantage.'
  return {
    statement,
    finding: {
      state,
      direction: state === 'balanced' ? 'none' : direction,
      headline: state === 'material' ? `${advantagedTeam} has the cleaner ball-security matchup` : 'Turnover exposure is broadly balanced',
      detail: statement,
      signals: [
        {
          label: 'Giveaways / game',
          away_value: String(numericValue(away, 'giveaways_per_game') ?? 'unavailable'),
          home_value: String(numericValue(home, 'giveaways_per_game') ?? 'unavailable'),
          observation_ids: [awayObservation.observation_id, homeObservation.observation_id],
        },
        {
          label: 'Takeaways / game',
          away_value: String(numericValue(away, 'takeaways_per_game') ?? 'unavailable'),
          home_value: String(numericValue(home, 'takeaways_per_game') ?? 'unavailable'),
          observation_ids: [awayObservation.observation_id, homeObservation.observation_id],
        },
        {
          label: 'Cross-match exposure',
          away_value: riskLabel(awayRisk),
          home_value: riskLabel(homeRisk),
          observation_ids: [awayObservation.observation_id, homeObservation.observation_id],
        },
      ],
      caveats: [
        ...priorSeasonCaveat(observations, game),
        'Turnover outcomes are noisy; this compares repeatable team profiles rather than projecting a turnover count.',
      ],
    },
    evidence_state: state === 'material' ? 'observed_support' : 'observed_context',
    observations,
    suggested_anchor_ids: state === 'material' ? [...winnerAnchor(direction), 'high_variance'] : [],
  }
}

function trenchesEvidence(observations: Observation[], game: ScenarioGame): EventEvidence | null {
  const awayObservation = teamObservation(observations, game.away_team)
  const homeObservation = teamObservation(observations, game.home_team)
  if (!awayObservation || !homeObservation) return null
  const away = recordValue(awayObservation)
  const home = recordValue(homeObservation)
  const leagueSize = numericValue(away, 'league_size') ?? numericValue(home, 'league_size')
  const awayPass = rankStrength(numericValue(away, 'pass_protection_rank'), leagueSize)
    - rankStrength(numericValue(home, 'front_disruption_rank'), leagueSize)
  const homePass = rankStrength(numericValue(home, 'pass_protection_rank'), leagueSize)
    - rankStrength(numericValue(away, 'front_disruption_rank'), leagueSize)
  const awayRun = rankStrength(numericValue(away, 'rushing_efficiency_rank'), leagueSize)
    - rankStrength(numericValue(home, 'run_disruption_rank'), leagueSize)
  const homeRun = rankStrength(numericValue(home, 'rushing_efficiency_rank'), leagueSize)
    - rankStrength(numericValue(away, 'run_disruption_rank'), leagueSize)
  const awayControl = (awayPass + awayRun) / 2
  const homeControl = (homePass + homeRun) / 2
  const gap = Math.abs(awayControl - homeControl)
  const advantagedTeam = awayControl > homeControl ? game.away_team : game.home_team
  const direction = directionForTeam(advantagedTeam, game)
  const state: AgentFinding['state'] = gap >= 0.2 ? 'material' : gap >= 0.1 ? 'contextual' : 'balanced'
  const runDriven = Math.abs(awayRun - homeRun) >= Math.abs(awayPass - homePass)
  const statement = state === 'material'
    ? `${advantagedTeam} has the stronger result-based line-of-scrimmage cross-match across protection, rushing efficiency, and front disruption.`
    : 'The result-based protection and front metrics do not establish a major line-of-scrimmage mismatch.'
  return {
    statement,
    finding: {
      state,
      direction: state === 'balanced' ? 'none' : direction,
      headline: state === 'material' ? `${advantagedTeam} has the clearer trench-control path` : 'The trench proxies are relatively balanced',
      detail: statement,
      signals: [
        {
          label: 'Pass protection rank',
          away_value: rankLabel(numericValue(away, 'pass_protection_rank'), leagueSize),
          home_value: rankLabel(numericValue(home, 'pass_protection_rank'), leagueSize),
          observation_ids: [awayObservation.observation_id, homeObservation.observation_id],
        },
        {
          label: 'Rushing efficiency rank',
          away_value: rankLabel(numericValue(away, 'rushing_efficiency_rank'), leagueSize),
          home_value: rankLabel(numericValue(home, 'rushing_efficiency_rank'), leagueSize),
          observation_ids: [awayObservation.observation_id, homeObservation.observation_id],
        },
        {
          label: 'Front disruption rank',
          away_value: rankLabel(numericValue(away, 'front_disruption_rank'), leagueSize),
          home_value: rankLabel(numericValue(home, 'front_disruption_rank'), leagueSize),
          observation_ids: [awayObservation.observation_id, homeObservation.observation_id],
        },
      ],
      caveats: [
        ...priorSeasonCaveat(observations, game),
        'This is a transparent result-based proxy, not an assignment-level offensive-line grade.',
      ],
    },
    evidence_state: state === 'material' ? 'observed_support' : 'observed_context',
    observations,
    suggested_anchor_ids: state === 'material'
      ? [...winnerAnchor(direction), runDriven ? 'run_heavy' : 'pass_heavy']
      : [],
  }
}

function restEvidence(observations: Observation[], game: ScenarioGame): EventEvidence | null {
  const awayObservation = teamObservation(observations, game.away_team)
  const homeObservation = teamObservation(observations, game.home_team)
  if (!awayObservation || !homeObservation) return null
  const away = recordValue(awayObservation)
  const home = recordValue(homeObservation)
  const awayDays = numericValue(away, 'turnaround_days')
  const homeDays = numericValue(home, 'turnaround_days')
  const awayTravel = numericValue(away, 'travel_miles_from_home')
  const homeTravel = numericValue(home, 'travel_miles_from_home')
  const restGap = awayDays !== null && homeDays !== null ? Math.abs(awayDays - homeDays) : null
  const advantagedTeam = restGap !== null && restGap > 0
    ? awayDays! > homeDays! ? game.away_team : game.home_team
    : null
  const direction = advantagedTeam ? directionForTeam(advantagedTeam, game) : 'none'
  const openingWeek = awayDays === null || homeDays === null
  const state: AgentFinding['state'] = openingWeek
    ? 'contextual'
    : restGap! >= 1.5
      ? 'material'
      : restGap! >= 0.75
        ? 'contextual'
        : 'balanced'
  const statement = openingWeek
    ? 'The regular-season schedule establishes travel context, but Week 1 does not have a prior regular-season turnaround baseline.'
    : state === 'material'
      ? `${advantagedTeam} has the cleaner recovery and preparation window entering this matchup.`
      : 'The two teams enter with comparable turnaround windows, so rest is not a standalone matchup edge.'
  const scheduleSpot = (value: Record<string, unknown>) => (
    typeof value.schedule_spot === 'string' ? value.schedule_spot.replace(/_/g, ' ') : 'unavailable'
  )
  return {
    statement,
    finding: {
      state,
      direction: state === 'material' ? direction : 'none',
      headline: openingWeek
        ? 'Week 1 rest is not established by the regular-season schedule'
        : state === 'material'
          ? `${advantagedTeam} has the stronger rest profile`
          : 'Rest windows are effectively even',
      detail: statement,
      signals: [
        {
          label: 'Turnaround',
          away_value: awayDays === null ? 'opening week' : `${awayDays} days`,
          home_value: homeDays === null ? 'opening week' : `${homeDays} days`,
          observation_ids: [awayObservation.observation_id, homeObservation.observation_id],
        },
        {
          label: 'Schedule spot',
          away_value: scheduleSpot(away),
          home_value: scheduleSpot(home),
          observation_ids: [awayObservation.observation_id, homeObservation.observation_id],
        },
        {
          label: 'Travel from home',
          away_value: awayTravel === null ? 'unavailable' : `${Math.round(awayTravel)} mi`,
          home_value: homeTravel === null ? 'unavailable' : `${Math.round(homeTravel)} mi`,
          observation_ids: [awayObservation.observation_id, homeObservation.observation_id],
        },
      ],
      caveats: openingWeek
        ? ['Preseason games are intentionally excluded from the rest calculation.']
        : ['Schedule-derived rest does not yet include overtime or player snap load.'],
    },
    evidence_state: state === 'material' ? 'observed_support' : 'observed_context',
    observations,
    suggested_anchor_ids: state === 'material' ? winnerAnchor(direction) : [],
  }
}

function eventEvidence(params: {
  agentId: GameAgentId
  game: ScenarioGame
  observations: Observation[]
  availability?: SnapshotAvailability
  now: Date
}): EventEvidence {
  const assumption = AGENT_EVENTS[params.agentId]
  if (!params.availability) {
    return unavailableEvidence({
      agentId: params.agentId,
      statement: assumption,
      evidenceState: 'assumption_only',
      caveat: 'No current observation adapter is configured for this lens.',
    })
  }
  if (!params.observations.length) {
    const enclosedVenue = params.agentId === 'weather'
      && params.availability.state === 'available'
      && params.availability.message?.startsWith('Enclosed venue')
    const statement = enclosedVenue
      ? `${params.availability.message}; exterior weather is not a material game condition.`
      : `${assumption} No current sourced observation is attached.`
    return unavailableEvidence({
      agentId: params.agentId,
      statement,
      evidenceState: enclosedVenue ? 'observed_conflict' : 'missing',
      caveat: params.availability.message ?? 'The current snapshot does not contain this feed.',
    })
  }
  const allStale = params.observations.every(observation => (
    observation.expires_at && Date.parse(observation.expires_at) <= params.now.getTime()
  ))
  if (allStale) {
    return unavailableEvidence({
      agentId: params.agentId,
      statement: `${assumption} The latest attached observations are stale.`,
      evidenceState: 'stale',
      observations: params.observations,
      caveat: 'Refresh the data snapshot before treating this lens as current.',
    })
  }

  if (params.agentId === 'weather') return weatherEvidence(params.observations)
  if (params.agentId === 'injury') return injuryEvidence(params.observations)
  if (params.agentId === 'epa') {
    return epaEvidence(params.observations, params.game)
      ?? unavailableEvidence({
        agentId: params.agentId,
        statement: 'A complete two-team efficiency comparison is unavailable.',
        evidenceState: 'missing',
        observations: params.observations,
        caveat: 'Both team baselines are required.',
      })
  }
  if (params.agentId === 'turnovers') {
    return turnoversEvidence(params.observations, params.game)
      ?? unavailableEvidence({
        agentId: params.agentId,
        statement: 'A complete two-team turnover comparison is unavailable.',
        evidenceState: 'missing',
        observations: params.observations,
        caveat: 'Both team turnover profiles are required.',
      })
  }
  if (params.agentId === 'trenches') {
    return trenchesEvidence(params.observations, params.game)
      ?? unavailableEvidence({
        agentId: params.agentId,
        statement: 'A complete two-team trenches comparison is unavailable.',
        evidenceState: 'missing',
        observations: params.observations,
        caveat: 'Both team proxy profiles are required.',
      })
  }
  if (params.agentId === 'rest') {
    return restEvidence(params.observations, params.game)
      ?? unavailableEvidence({
        agentId: params.agentId,
        statement: 'A complete two-team rest comparison is unavailable.',
        evidenceState: 'missing',
        observations: params.observations,
        caveat: 'Both team schedule contexts are required.',
      })
  }

  return {
    statement: assumption,
    finding: {
      state: 'contextual',
      direction: 'none',
      headline: `${GAME_AGENT_CATALOG[params.agentId].label} has sourced context`,
      detail: assumption,
      signals: [],
      caveats: [],
    },
    evidence_state: 'observed_context',
    observations: params.observations,
    suggested_anchor_ids: [],
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

export function suggestAnchors(events: ScenarioEvent[], anchors: ScenarioAnchor[]): ScenarioAnchorId[] {
  const scores = new Map<ScenarioAnchorId, number>()
  const firstSeen = new Map<ScenarioAnchorId, number>()
  let sequence = 0

  for (const event of events) {
    for (const anchorId of event.suggested_anchor_ids) {
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
    const observedAgent = ObservationAgentIdSchema.safeParse(agentId)
    const availability = params.snapshot && observedAgent.success
      ? params.snapshot.availability[observedAgent.data]
      : undefined
    return {
      id: stableId('event', { game_id: params.game.game_id, agent_id: agentId, snapshot_id: snapshotId }),
      agent_id: agentId,
      label: GAME_AGENT_CATALOG[agentId].label,
      assumption: AGENT_EVENTS[agentId],
      ...eventEvidence({ agentId, game: params.game, observations, availability, now }),
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
    suggested_anchor_ids: suggestAnchors(events, anchors),
    resolved_at: now.toISOString(),
    evidence_state: scenarioEvidenceState(events),
  })
}
