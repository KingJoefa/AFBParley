import { z } from 'zod'
import { AgentTypeSchema } from './finding'

/**
 * Ladder Schema
 *
 * A Ladder is a tiered prop bet recommendation.
 * Built from Alert[] by organizing into risk tiers.
 *
 * "bet" command output: Alert[] → Ladder[]
 */

// Individual rung on the ladder (a single prop bet)
export const RungSchema = z.object({
  alert_id: z.string(),
  market: z.string(), // e.g., "Jamar Chase Over 85.5 Receiving Yards"
  line: z.number().optional(), // e.g., 85.5
  implied_probability: z.number().min(0).max(1).optional(),
  agent: AgentTypeSchema,
  rationale: z.string().max(200),
}).strict()

// Risk tier for grouping rungs
export const RiskTierSchema = z.enum([
  'safe',       // High probability, lower payout
  'moderate',   // Balanced risk/reward
  'aggressive', // Lower probability, higher payout
])

// A complete betting ladder
export const LadderSchema = z.object({
  id: z.string(),
  name: z.string().max(100),
  tier: RiskTierSchema,
  rungs: z.array(RungSchema).min(1).max(5),
  total_implied_probability: z.number().min(0).max(1).optional(),
  recommended_stake_pct: z.number().min(0).max(100).optional(), // % of bankroll
  provenance_hash: z.string(),
}).strict()

export type Rung = z.infer<typeof RungSchema>
export type RiskTier = z.infer<typeof RiskTierSchema>
export type Ladder = z.infer<typeof LadderSchema>

/**
 * Bet result from bet command
 */
export const BetResultSchema = z.object({
  request_id: z.string(),
  ladders: z.array(LadderSchema),
  alerts_used: z.array(z.string()), // Alert IDs included
  alerts_excluded: z.array(z.string()), // Alert IDs not suitable for ladders
  bet_timestamp: z.number(),
  provenance_hash: z.string(),
}).strict()

export type BetResult = z.infer<typeof BetResultSchema>

/**
 * Organize alerts into risk-tiered ladders
 */
export function organizeLadders(
  alertIds: string[],
  alertConfidences: Map<string, number>,
  alertSeverities: Map<string, 'high' | 'medium'>
): { tier: RiskTier; ids: string[]; name: string }[] {
  const ladders: { tier: RiskTier; ids: string[]; name: string }[] = []

  // Safe tier: high confidence (>= 0.7) + high severity
  const safeIds = alertIds.filter(id => {
    const conf = alertConfidences.get(id) || 0
    const sev = alertSeverities.get(id)
    return conf >= 0.7 && sev === 'high'
  })

  if (safeIds.length > 0) {
    ladders.push({
      tier: 'safe',
      ids: safeIds.slice(0, 3),
      name: 'High Confidence Picks',
    })
  }

  // Moderate tier: medium confidence (0.5-0.7) or medium severity
  const moderateIds = alertIds.filter(id => {
    const conf = alertConfidences.get(id) || 0
    const sev = alertSeverities.get(id)
    return (conf >= 0.5 && conf < 0.7) || sev === 'medium'
  })

  if (moderateIds.length > 0) {
    ladders.push({
      tier: 'moderate',
      ids: moderateIds.slice(0, 4),
      name: 'Balanced Value Plays',
    })
  }

  // Aggressive tier: lower confidence but actionable
  const aggressiveIds = alertIds.filter(id => {
    const conf = alertConfidences.get(id) || 0
    return conf < 0.5 && conf >= 0.3
  })

  if (aggressiveIds.length > 0) {
    ladders.push({
      tier: 'aggressive',
      ids: aggressiveIds.slice(0, 3),
      name: 'High Upside Longshots',
    })
  }

  return ladders
}
