import { z } from 'zod'
import { ObservationSchema } from '@/lib/data/contracts'

export const TERMINAL_CONTRACT_VERSION = 'game-script-v5'

export const GAME_AGENT_IDS = [
  'weather',
  'momentum',
  'pace',
  'injury',
  'epa',
  'pressure',
  'trenches',
  'turnovers',
  'qb',
  'rest',
] as const

export const GameAgentIdSchema = z.enum(GAME_AGENT_IDS)

export type GameAgentId = z.infer<typeof GameAgentIdSchema>

export type GameAgentDataSupport = 'pilot_observations' | 'assumption_only'

export type GameAgentCatalogEntry = {
  label: string
  shortLabel: string
  question: string
  description: string
  dataSupport: GameAgentDataSupport
  specPath: `docs/agents/${string}.md`
}

export const GAME_AGENT_CATALOG: Record<GameAgentId, GameAgentCatalogEntry> = {
  weather: {
    label: 'Weather',
    shortLabel: 'WX',
    question: 'Do kickoff conditions remove or weaken either team\'s preferred way to play?',
    description: 'Cross-matches wind, precipitation, temperature, and roof state with passing depth, kicking, ball security, and offensive exposure.',
    dataSupport: 'pilot_observations',
    specPath: 'docs/agents/weather.md',
  },
  momentum: {
    label: 'Momentum',
    shortLabel: 'MOM',
    question: 'Has recent opponent-adjusted execution changed enough to carry into this matchup?',
    description: 'Separates durable changes in efficiency, personnel, or scheme from streaks driven by schedule and unstable results.',
    dataSupport: 'assumption_only',
    specPath: 'docs/agents/momentum.md',
  },
  pace: {
    label: 'Pace',
    shortLabel: 'PC',
    question: 'Which offense can control play volume, clock pressure, and possession count?',
    description: 'Uses neutral tempo, no-huddle rate, pass rate, and drive length to frame how many plays each side can access.',
    dataSupport: 'assumption_only',
    specPath: 'docs/agents/pace.md',
  },
  injury: {
    label: 'Injuries',
    shortLabel: 'IN',
    question: 'Which availability change removes a function the replacement or scheme cannot preserve?',
    description: 'Measures role loss and replacement quality, then traces redistributed snaps, touches, protection, or coverage.',
    dataSupport: 'pilot_observations',
    specPath: 'docs/agents/injuries.md',
  },
  epa: {
    label: 'Efficiency',
    shortLabel: 'EPA',
    question: 'Where does offensive efficiency collide with the opposing defense\'s ability to suppress it?',
    description: 'Cross-matches EPA, success rate, explosives, and drive finishing by pass and run to find repeatable advantages.',
    dataSupport: 'pilot_observations',
    specPath: 'docs/agents/efficiency-epa.md',
  },
  pressure: {
    label: 'Pressure',
    shortLabel: 'PR',
    question: 'Can either pass rush disrupt the quarterback before the offense reaches its answers?',
    description: 'Cross-matches pressure creation, protection, time to throw, sack avoidance, and quarterback response under pressure.',
    dataSupport: 'assumption_only',
    specPath: 'docs/agents/pressure.md',
  },
  trenches: {
    label: 'Trenches',
    shortLabel: 'OL/DL',
    question: 'Which offensive line wins or loses its matchup with the opposing defensive line?',
    description: 'Compares pass protection, pressure, run blocking, and disruption rankings to identify each line-matchup edge.',
    dataSupport: 'pilot_observations',
    specPath: 'docs/agents/trenches.md',
  },
  turnovers: {
    label: 'Turnovers',
    shortLabel: 'TO',
    question: 'Does one offense\'s ball-risk profile collide with repeatable takeaway creation?',
    description: 'Cross-matches interceptions, fumbles, sacks, and defensive disruption while discounting recovery luck.',
    dataSupport: 'pilot_observations',
    specPath: 'docs/agents/turnovers.md',
  },
  qb: {
    label: 'Quarterback',
    shortLabel: 'QB',
    question: 'Which quarterback can solve this specific coverage, pressure, and down-and-distance environment?',
    description: 'Profiles accuracy, decisions, depth, mobility, sack avoidance, and performance by pocket and coverage state.',
    dataSupport: 'assumption_only',
    specPath: 'docs/agents/quarterback.md',
  },
  rest: {
    label: 'Rest / Travel',
    shortLabel: 'RST',
    question: 'Does turnaround, travel, time-zone change, or workload modify a real football matchup?',
    description: 'Compares recovery windows, travel burden, road sequencing, and snap load without treating rest as a standalone edge.',
    dataSupport: 'pilot_observations',
    specPath: 'docs/agents/rest-travel.md',
  },
}

export const SCENARIO_ANCHOR_IDS = [
  'game_over',
  'game_under',
  'home_win',
  'away_win',
  'home_cover',
  'away_cover',
  'shootout',
  'grind',
  'blowout',
  'high_variance',
  'pass_heavy',
  'run_heavy',
] as const

export const ScenarioAnchorIdSchema = z.enum(SCENARIO_ANCHOR_IDS)
export type ScenarioAnchorId = z.infer<typeof ScenarioAnchorIdSchema>

export const ScenarioGameSchema = z.object({
  game_id: z.string().min(1),
  season: z.number().int(),
  week: z.number().int(),
  away_team: z.string().min(2),
  home_team: z.string().min(2),
  kickoff: z.string().datetime({ offset: true }),
  display: z.string().min(1),
  time: z.string().min(1),
})

export const ScenarioAnchorSchema = z.object({
  id: ScenarioAnchorIdSchema,
  category: z.enum(['total', 'winner', 'spread', 'shape', 'style']),
  label: z.string().min(1),
  exclusive_group: z.string().min(1),
})

export const AgentSignalSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1).optional(),
  away_value: z.string().min(1).optional(),
  home_value: z.string().min(1).optional(),
  observation_ids: z.array(z.string().min(1)),
}).refine(signal => Boolean(signal.value || signal.away_value || signal.home_value), {
  message: 'An agent signal must contain a value',
})

export const AgentFindingSchema = z.object({
  state: z.enum(['material', 'contextual', 'balanced', 'unavailable']),
  direction: z.enum(['away', 'home', 'none']),
  headline: z.string().min(1),
  detail: z.string().min(1),
  signals: z.array(AgentSignalSchema).max(4),
  caveats: z.array(z.string().min(1)).max(3),
})

export const ScenarioEventSchema = z.object({
  id: z.string().min(1),
  agent_id: GameAgentIdSchema,
  label: z.string().min(1),
  assumption: z.string().min(1),
  statement: z.string().min(1),
  finding: AgentFindingSchema,
  suggested_anchor_ids: z.array(ScenarioAnchorIdSchema),
  evidence_state: z.enum([
    'assumption_only',
    'observed_context',
    'observed_support',
    'observed_conflict',
    'stale',
    'missing',
  ]),
  observations: z.array(ObservationSchema),
})

export const ScenarioResolutionSchema = z.object({
  scenario_id: z.string().min(1),
  scenario_revision_id: z.string().min(1),
  snapshot_id: z.string().min(1),
  snapshot_captured_at: z.string().datetime({ offset: true }),
  contract_version: z.literal(TERMINAL_CONTRACT_VERSION),
  input_hash: z.string().regex(/^[a-f0-9]{64}$/),
  game: ScenarioGameSchema,
  selected_agent_ids: z.array(GameAgentIdSchema).min(1),
  events: z.array(ScenarioEventSchema).min(1),
  anchors: z.array(ScenarioAnchorSchema).min(1),
  suggested_anchor_ids: z.array(ScenarioAnchorIdSchema),
  resolved_at: z.string().datetime({ offset: true }),
  evidence_state: z.enum([
    'scenario_assumptions',
    'observations_available',
    'mixed',
    'degraded',
  ]),
})

export const ScenarioRequestSchema = z.object({
  game_id: z.string().min(1),
  agent_ids: z.array(GameAgentIdSchema).min(1).max(GAME_AGENT_IDS.length),
})

export const CausalStepSchema = z.object({
  order: z.number().int().positive(),
  agent_id: GameAgentIdSchema.optional(),
  statement: z.string().min(1),
})

export const GameScriptSchema = z.object({
  script_id: z.string().min(1),
  scenario_id: z.string().min(1),
  scenario_revision_id: z.string().min(1),
  snapshot_id: z.string().min(1),
  contract_version: z.literal(TERMINAL_CONTRACT_VERSION),
  input_hash: z.string().regex(/^[a-f0-9]{64}$/),
  parent_script_id: z.string().min(1).optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  causal_chain: z.array(CausalStepSchema).min(2).max(GAME_AGENT_IDS.length + 1),
  key_conditions: z.array(z.string().min(1)).min(1).max(6),
  failure_conditions: z.array(z.string().min(1)).min(1).max(6),
  anchor_ids: z.array(ScenarioAnchorIdSchema).min(1),
  created_at: z.string().datetime({ offset: true }),
  generation: z.enum(['model', 'deterministic']),
  model_id: z.string().min(1),
})

export const ScriptRequestSchema = z.object({
  scenario: ScenarioResolutionSchema,
  anchor_ids: z.array(ScenarioAnchorIdSchema).min(1),
  parent_script_id: z.string().min(1).optional(),
})

export const ScriptEvaluationSchema = z.object({
  evaluation_version: z.literal('script-eval-v1'),
  passed: z.boolean(),
  checks: z.object({
    selected_agents_represented: z.boolean(),
    anchors_valid: z.boolean(),
    failure_conditions_present: z.boolean(),
    numeric_claims_sourced: z.boolean(),
  }),
  issues: z.array(z.string()),
})

export type ScenarioGame = z.infer<typeof ScenarioGameSchema>
export type ScenarioAnchor = z.infer<typeof ScenarioAnchorSchema>
export type AgentSignal = z.infer<typeof AgentSignalSchema>
export type AgentFinding = z.infer<typeof AgentFindingSchema>
export type ScenarioEvent = z.infer<typeof ScenarioEventSchema>
export type ScenarioResolution = z.infer<typeof ScenarioResolutionSchema>
export type GameScript = z.infer<typeof GameScriptSchema>
export type ScriptEvaluation = z.infer<typeof ScriptEvaluationSchema>
