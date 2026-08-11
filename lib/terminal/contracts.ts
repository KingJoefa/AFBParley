import { z } from 'zod'
import { ObservationSchema } from '@/lib/data/contracts'

export const TERMINAL_CONTRACT_VERSION = 'game-script-v2'

export const GAME_AGENT_IDS = [
  'weather',
  'pressure',
  'pace',
  'injury',
  'epa',
  'qb',
  'hb',
  'wr',
  'te',
  'usage',
] as const

export const GameAgentIdSchema = z.enum(GAME_AGENT_IDS)

export type GameAgentId = z.infer<typeof GameAgentIdSchema>

export const GAME_AGENT_CATALOG: Record<GameAgentId, {
  label: string
  shortLabel: string
  description: string
}> = {
  weather: {
    label: 'Weather',
    shortLabel: 'WX',
    description: 'Conditions constrain efficiency and play calling.',
  },
  pressure: {
    label: 'Pressure',
    shortLabel: 'PR',
    description: 'Pass rush disrupts timing and drive success.',
  },
  pace: {
    label: 'Pace',
    shortLabel: 'PC',
    description: 'Tempo changes play volume and scoring chances.',
  },
  injury: {
    label: 'Injuries',
    shortLabel: 'IN',
    description: 'Availability changes roles and team efficiency.',
  },
  epa: {
    label: 'Efficiency',
    shortLabel: 'EPA',
    description: 'An efficiency mismatch shapes possession value.',
  },
  qb: {
    label: 'Quarterback',
    shortLabel: 'QB',
    description: 'Quarterback play becomes the central game driver.',
  },
  hb: {
    label: 'Backfield',
    shortLabel: 'HB',
    description: 'Rushing volume and control shape the game.',
  },
  wr: {
    label: 'Receivers',
    shortLabel: 'WR',
    description: 'Target concentration drives explosive plays.',
  },
  te: {
    label: 'Tight Ends',
    shortLabel: 'TE',
    description: 'Middle-field and red-zone usage create leverage.',
  },
  usage: {
    label: 'Usage',
    shortLabel: 'USG',
    description: 'Role concentration determines who captures volume.',
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

export const ScenarioEventSchema = z.object({
  id: z.string().min(1),
  agent_id: GameAgentIdSchema,
  label: z.string().min(1),
  assumption: z.string().min(1),
  statement: z.string().min(1),
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
  suggested_anchor_ids: z.array(ScenarioAnchorIdSchema).min(1),
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
  causal_chain: z.array(CausalStepSchema).min(2).max(8),
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
export type ScenarioEvent = z.infer<typeof ScenarioEventSchema>
export type ScenarioResolution = z.infer<typeof ScenarioResolutionSchema>
export type GameScript = z.infer<typeof GameScriptSchema>
export type ScriptEvaluation = z.infer<typeof ScriptEvaluationSchema>
