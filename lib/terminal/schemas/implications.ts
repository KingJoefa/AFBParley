import { z } from 'zod'
import type { AgentType } from './finding'

// Per-agent implication enums - deterministic validation
export const EpaImplicationSchema = z.enum([
  'wr_receptions_over', 'wr_receptions_under',
  'wr_yards_over', 'wr_yards_under',
  'rb_yards_over', 'rb_yards_under',
  'te_receptions_over', 'te_yards_over',
  'team_total_over', 'team_total_under',
])

export const PressureImplicationSchema = z.enum([
  'qb_sacks_over', 'qb_sacks_under',
  'qb_ints_over', 'qb_pass_yards_under',
  'def_sacks_over',
])

export const WeatherImplicationSchema = z.enum([
  'game_total_under', 'pass_yards_under', 'field_goals_over',
])

export const QbImplicationSchema = z.enum([
  'qb_pass_yards_over', 'qb_pass_yards_under',
  'qb_pass_tds_over', 'qb_pass_tds_under',
  'qb_completions_over', 'qb_completions_under',
  'qb_ints_over',
])

export const HbImplicationSchema = z.enum([
  'rb_rush_yards_over', 'rb_rush_yards_under',
  'rb_receptions_over', 'rb_rush_attempts_over',
  'rb_tds_over',
])

export const WrImplicationSchema = z.enum([
  'wr_receptions_over', 'wr_receptions_under',
  'wr_yards_over', 'wr_yards_under',
  'wr_tds_over', 'wr_longest_reception_over',
])

export const TeImplicationSchema = z.enum([
  'te_receptions_over', 'te_receptions_under',
  'te_yards_over', 'te_yards_under',
  'te_tds_over',
])

// Map agent → implication schema
export const IMPLICATION_SCHEMAS: Record<AgentType, z.ZodEnum<[string, ...string[]]>> = {
  epa: EpaImplicationSchema,
  pressure: PressureImplicationSchema,
  weather: WeatherImplicationSchema,
  qb: QbImplicationSchema,
  hb: HbImplicationSchema,
  wr: WrImplicationSchema,
  te: TeImplicationSchema,
}

// Get allowed implications for an agent
export function getImplicationSchema(agent: AgentType) {
  return IMPLICATION_SCHEMAS[agent]
}

// Validate implications against agent's allowlist
export function validateImplicationsForAgent(
  agent: AgentType,
  implications: string[]
): { valid: boolean; invalid: string[] } {
  const schema = IMPLICATION_SCHEMAS[agent]
  const allowedValues = schema.options as readonly string[]
  const invalid = implications.filter(imp => !allowedValues.includes(imp))
  return { valid: invalid.length === 0, invalid }
}

// All possible implications (union)
export const AnyImplicationSchema = z.enum([
  ...EpaImplicationSchema.options,
  ...PressureImplicationSchema.options,
  ...WeatherImplicationSchema.options,
  ...QbImplicationSchema.options,
  ...HbImplicationSchema.options,
  ...WrImplicationSchema.options,
  ...TeImplicationSchema.options,
])

export type EpaImplication = z.infer<typeof EpaImplicationSchema>
export type PressureImplication = z.infer<typeof PressureImplicationSchema>
export type WeatherImplication = z.infer<typeof WeatherImplicationSchema>
export type QbImplication = z.infer<typeof QbImplicationSchema>
export type HbImplication = z.infer<typeof HbImplicationSchema>
export type WrImplication = z.infer<typeof WrImplicationSchema>
export type TeImplication = z.infer<typeof TeImplicationSchema>
export type AnyImplication = z.infer<typeof AnyImplicationSchema>
