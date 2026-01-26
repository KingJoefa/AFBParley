import { z } from 'zod'

// =============================================================================
// Agent Type Schema
// =============================================================================

export const AgentTypeSchema = z.enum([
  // Existing agents
  'epa', 'pressure', 'weather', 'qb', 'hb', 'wr', 'te', 'notes',
  // New agents (2026-01-25)
  'injury', 'usage', 'pace',
])
export type AgentType = z.infer<typeof AgentTypeSchema>

// =============================================================================
// Implication Schema (market-centric, shared across all agents)
// =============================================================================

export const ImplicationSchema = z.enum([
  // Game-level
  'game_total_over', 'game_total_under',
  // Team-level
  'team_total_over', 'team_total_under',
  // QB
  'qb_pass_yards_over', 'qb_pass_yards_under',
  'qb_pass_tds_over', 'qb_pass_tds_under',
  'qb_completions_over', 'qb_completions_under',
  'qb_ints_over', 'qb_sacks_over',
  // RB
  'rb_rush_yards_over', 'rb_rush_yards_under',
  'rb_receptions_over', 'rb_rush_attempts_over', 'rb_tds_over',
  // WR
  'wr_receptions_over', 'wr_receptions_under',
  'wr_yards_over', 'wr_yards_under',
  'wr_tds_over', 'wr_longest_reception_over',
  // TE
  'te_receptions_over', 'te_receptions_under',
  'te_yards_over', 'te_yards_under', 'te_tds_over',
  // Defense
  'def_sacks_over', 'field_goals_over',
])
export type Implication = z.infer<typeof ImplicationSchema>

// =============================================================================
// Scope Schema
// =============================================================================

export const ScopeSchema = z.enum(['game', 'team', 'player'])
export type Scope = z.infer<typeof ScopeSchema>

// =============================================================================
// Metric Key Schema (typed replacement for freeform stat/threshold_met)
// =============================================================================

export const MetricKeySchema = z.enum([
  // EPA metrics
  'offensive_epa', 'defensive_epa', 'epa_differential',
  // Pressure metrics
  'pressure_rate', 'sack_rate', 'blitz_rate', 'hurry_rate',
  // Weather metrics
  'wind_mph', 'temperature', 'precipitation', 'dome',
  // QB metrics
  'pass_yards', 'pass_tds', 'completion_pct', 'int_rate', 'qb_rating',
  // RB metrics
  'rush_yards', 'rush_attempts', 'yards_per_carry', 'rb_receptions', 'rb_targets',
  // WR metrics
  'wr_receptions', 'wr_yards', 'wr_targets', 'target_share', 'route_participation',
  // TE metrics
  'te_receptions', 'te_yards', 'te_targets',
  // Injury metrics
  'player_status', 'practice_status', 'designation',
  // Usage metrics
  'snap_pct', 'target_share_season', 'target_share_l4', 'usage_trend',
  // Pace metrics
  'pace_rank', 'plays_per_game', 'seconds_per_play', 'projected_plays',
])
export type MetricKey = z.infer<typeof MetricKeySchema>

// =============================================================================
// Threshold Schema (for new agents)
// =============================================================================

export const ThresholdSchema = z.object({
  key: z.string(),
  operator: z.enum(['gt', 'lt', 'gte', 'lte', 'eq', 'in']),
  value: z.union([z.number(), z.string(), z.array(z.string())]),
  met: z.boolean(),
})
export type Threshold = z.infer<typeof ThresholdSchema>

// =============================================================================
// Finding Type Schemas (per-agent types)
// =============================================================================

// Injury finding types
export const InjuryFindingTypeSchema = z.enum([
  'qb_unavailable',
  'skill_player_unavailable',
  'oline_unavailable',
  'defensive_playmaker_unavailable',
])
export type InjuryFindingType = z.infer<typeof InjuryFindingTypeSchema>

// Usage finding types
export const UsageFindingTypeSchema = z.enum([
  'volume_workhorse',
  'target_share_alpha',
  'target_share_elite',
  'usage_trending_up',
  'usage_trending_down',
  'snap_share_committee',
])
export type UsageFindingType = z.infer<typeof UsageFindingTypeSchema>

// Pace finding types
export const PaceFindingTypeSchema = z.enum([
  'pace_over_signal',
  'pace_under_signal',
  'pace_mismatch',
  'team_plays_above_avg',
  'team_plays_below_avg',
])
export type PaceFindingType = z.infer<typeof PaceFindingTypeSchema>

// =============================================================================
// Position Group Schema (for Injury agent)
// =============================================================================

export const InjuryPositionSchema = z.enum([
  'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'
])
export type InjuryPosition = z.infer<typeof InjuryPositionSchema>

export const InjuryDesignationSchema = z.enum([
  'starter', 'rotation', 'depth', 'unknown'
])
export type InjuryDesignation = z.infer<typeof InjuryDesignationSchema>

// =============================================================================
// Agent-Specific Payloads
// =============================================================================

export const InjuryPayloadSchema = z.object({
  status: z.enum(['OUT', 'DOUBTFUL', 'QUESTIONABLE', 'PROBABLE', 'ACTIVE']),
  practice_status: z.string().optional(),
  player: z.string(),
  team: z.string(),
  position: InjuryPositionSchema,
  designation: InjuryDesignationSchema,
})
export type InjuryPayload = z.infer<typeof InjuryPayloadSchema>

export const UsagePayloadSchema = z.object({
  snap_pct_season: z.number().optional(),
  snap_pct_l4: z.number().optional(),
  route_participation_season: z.number().optional(),
  route_participation_l4: z.number().optional(),
  target_share_season: z.number().optional(),
  target_share_l4: z.number().optional(),
  trend: z.enum(['rising', 'stable', 'falling']).optional(),
  window: z.enum(['season', 'l4']),
  games_in_window: z.number().optional(),
  routes_sample: z.number().optional(),
  targets_sample: z.number().optional(),
})
export type UsagePayload = z.infer<typeof UsagePayloadSchema>

export const PacePayloadSchema = z.object({
  projected_plays: z.number(),
  home_plays_per_game: z.number().optional(),
  away_plays_per_game: z.number().optional(),
  seconds_per_play: z.number().optional(),
  delta_vs_league: z.number().optional(),
  data_quality: z.enum(['full', 'partial', 'fallback']),
})
export type PacePayload = z.infer<typeof PacePayloadSchema>

// =============================================================================
// Finding Schema (backward compatible + extensible)
// =============================================================================

// Core Finding schema - maintains backward compatibility with existing agents
// while supporting new agent fields as optional extensions
export const FindingSchema = z.object({
  id: z.string(),
  agent: AgentTypeSchema,
  type: z.string(),
  stat: z.string(),
  value_num: z.number().optional(),
  value_str: z.string().optional(),
  value_type: z.enum(['numeric', 'string']),
  threshold_met: z.string(),
  comparison_context: z.string(),
  source_ref: z.string(),
  source_type: z.enum(['local', 'web', 'notes', 'matchupContext']),
  source_timestamp: z.number(),
  quote_snippet: z.string().optional(),
  // Extended fields for NotesAgent (optional, additive to base schema)
  confidence: z.number().min(0).max(1).optional(),
  raw_text: z.string().optional(),
  players_mentioned: z.array(z.string()).optional(),

  // NEW: Extended fields for new agents (2026-01-25)
  // These are optional on the base schema for backward compatibility
  scope: ScopeSchema.optional(),
  metric: MetricKeySchema.optional(),
  value: z.union([z.number(), z.string()]).optional(),
  thresholds: z.array(ThresholdSchema).optional(),
  implication: ImplicationSchema.optional(),
  finding_type: z.string().optional(),  // Typed per-agent, validated separately
  payload: z.record(z.unknown()).optional(),  // Typed per-agent, validated separately
}).strict()

export type Finding = z.infer<typeof FindingSchema>

// =============================================================================
// Typed Finding Interfaces (for new agents with strict typing)
// =============================================================================

export interface InjuryFinding extends Omit<Finding, 'finding_type' | 'payload'> {
  agent: 'injury'
  scope: 'player' | 'team'
  finding_type: InjuryFindingType
  payload: InjuryPayload
  source_type: 'notes' | 'matchupContext' | 'web'
}

export interface UsageFinding extends Omit<Finding, 'finding_type' | 'payload'> {
  agent: 'usage'
  scope: 'player' | 'team'
  finding_type: UsageFindingType
  payload: UsagePayload
  source_type: 'notes' | 'matchupContext' | 'web'
}

export interface PaceFinding extends Omit<Finding, 'finding_type' | 'payload'> {
  agent: 'pace'
  scope: 'game' | 'team'
  finding_type: PaceFindingType
  payload: PacePayload
  source_type: 'notes' | 'matchupContext' | 'web'
}

// =============================================================================
// Type Guards
// =============================================================================

export function isInjuryFinding(finding: Finding): finding is InjuryFinding {
  return finding.agent === 'injury'
}

export function isUsageFinding(finding: Finding): finding is UsageFinding {
  return finding.agent === 'usage'
}

export function isPaceFinding(finding: Finding): finding is PaceFinding {
  return finding.agent === 'pace'
}

export function isNewAgentFinding(finding: Finding): finding is InjuryFinding | UsageFinding | PaceFinding {
  return ['injury', 'usage', 'pace'].includes(finding.agent)
}

// =============================================================================
// Validation Helpers (for creating new agent findings with strict types)
// =============================================================================

export function createInjuryFinding(data: Omit<InjuryFinding, 'agent'>): InjuryFinding {
  // Validate payload
  InjuryPayloadSchema.parse(data.payload)
  InjuryFindingTypeSchema.parse(data.finding_type)
  return { ...data, agent: 'injury' } as InjuryFinding
}

export function createUsageFinding(data: Omit<UsageFinding, 'agent'>): UsageFinding {
  // Validate payload
  UsagePayloadSchema.parse(data.payload)
  UsageFindingTypeSchema.parse(data.finding_type)
  return { ...data, agent: 'usage' } as UsageFinding
}

export function createPaceFinding(data: Omit<PaceFinding, 'agent'>): PaceFinding {
  // Validate payload
  PacePayloadSchema.parse(data.payload)
  PaceFindingTypeSchema.parse(data.finding_type)
  return { ...data, agent: 'pace' } as PaceFinding
}

// =============================================================================
// Implication Maps (typed finding_type → implications)
// =============================================================================

export const INJURY_IMPLICATIONS: Record<InjuryFindingType, Implication[]> = {
  qb_unavailable: ['qb_pass_yards_under', 'qb_ints_over', 'team_total_under'],
  skill_player_unavailable: ['team_total_under'],
  oline_unavailable: ['qb_sacks_over', 'rb_rush_yards_under'],
  defensive_playmaker_unavailable: ['team_total_over'],
}

export const USAGE_IMPLICATIONS: Record<UsageFindingType, Implication[]> = {
  volume_workhorse: ['rb_rush_attempts_over', 'rb_receptions_over'],
  target_share_alpha: ['wr_receptions_over', 'wr_yards_over'],
  target_share_elite: ['wr_receptions_over', 'wr_yards_over', 'wr_tds_over'],
  usage_trending_up: ['wr_receptions_over'],
  usage_trending_down: ['wr_receptions_under', 'wr_yards_under'],
  snap_share_committee: ['rb_rush_yards_under'],
}

export const PACE_IMPLICATIONS: Record<PaceFindingType, Implication[]> = {
  pace_over_signal: ['game_total_over', 'qb_pass_yards_over'],
  pace_under_signal: ['game_total_under', 'rb_rush_attempts_over'],
  pace_mismatch: [], // Context-dependent, no default
  team_plays_above_avg: ['team_total_over'],
  team_plays_below_avg: ['team_total_under'],
}
