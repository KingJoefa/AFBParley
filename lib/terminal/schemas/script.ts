import { z } from 'zod'
import { AgentTypeSchema } from './finding'

/**
 * Script Schema
 *
 * A Script is a correlated parlay recommendation.
 * Built from Alert[] by identifying correlation patterns.
 *
 * "build" command output: Alert[] → Script[]
 */

// Individual leg in a parlay
export const LegSchema = z.object({
  alert_id: z.string(),
  market: z.string(), // e.g., "WR Receiving Yards Over 75.5"
  implied_probability: z.number().min(0).max(1).optional(),
  correlation_factor: z.number().min(-1).max(1).optional(),
  agent: AgentTypeSchema,
}).strict()

// Correlation type between legs
export const CorrelationTypeSchema = z.enum([
  'game_script',      // e.g., if team is trailing, more passing
  'player_stack',     // e.g., QB + WR same team
  'weather_cascade',  // e.g., wind affects multiple props
  'defensive_funnel', // e.g., pressure forces quick throws
  'volume_share',     // e.g., target share concentration
])

// A complete parlay script
export const ScriptSchema = z.object({
  id: z.string(),
  name: z.string().max(100),
  legs: z.array(LegSchema).min(2).max(6),
  correlation_type: CorrelationTypeSchema,
  correlation_explanation: z.string().max(300),
  combined_confidence: z.number().min(0).max(1),
  risk_level: z.enum(['conservative', 'moderate', 'aggressive']),
  provenance_hash: z.string(),
}).strict()

export type Leg = z.infer<typeof LegSchema>
export type CorrelationType = z.infer<typeof CorrelationTypeSchema>
export type Script = z.infer<typeof ScriptSchema>

/**
 * Build result from build command
 */
export const BuildResultSchema = z.object({
  request_id: z.string(),
  scripts: z.array(ScriptSchema),
  alerts_used: z.array(z.string()), // Alert IDs included
  alerts_excluded: z.array(z.string()), // Alert IDs not correlated
  build_timestamp: z.number(),
  provenance_hash: z.string(),
}).strict()

export type BuildResult = z.infer<typeof BuildResultSchema>

/**
 * Identify correlation patterns between alerts
 */
export function identifyCorrelations(
  alertIds: string[],
  alertAgents: Map<string, string>,
  alertImplications: Map<string, string[]>
): { type: CorrelationType; ids: string[]; explanation: string }[] {
  const correlations: { type: CorrelationType; ids: string[]; explanation: string }[] = []

  // Weather cascade: weather + any passing-related alert
  const weatherAlerts = alertIds.filter(id => alertAgents.get(id) === 'weather')
  const passingAlerts = alertIds.filter(id => {
    const agent = alertAgents.get(id)
    return agent === 'qb' || agent === 'wr' || agent === 'te'
  })

  if (weatherAlerts.length > 0 && passingAlerts.length > 0) {
    correlations.push({
      type: 'weather_cascade',
      ids: [...weatherAlerts, ...passingAlerts.slice(0, 2)],
      explanation: 'Weather conditions affect passing game metrics across multiple positions',
    })
  }

  // Defensive funnel: pressure + QB metrics
  const pressureAlerts = alertIds.filter(id => alertAgents.get(id) === 'pressure')
  const qbAlerts = alertIds.filter(id => alertAgents.get(id) === 'qb')

  if (pressureAlerts.length > 0 && qbAlerts.length > 0) {
    correlations.push({
      type: 'defensive_funnel',
      ids: [...pressureAlerts, ...qbAlerts],
      explanation: 'Pass rush pressure correlates with QB performance metrics',
    })
  }

  // Player stack: same position group (e.g., multiple WRs)
  const wrAlerts = alertIds.filter(id => alertAgents.get(id) === 'wr')
  if (wrAlerts.length >= 2) {
    correlations.push({
      type: 'volume_share',
      ids: wrAlerts.slice(0, 3),
      explanation: 'Target share concentration among receiving options',
    })
  }

  // EPA-based game script
  const epaAlerts = alertIds.filter(id => alertAgents.get(id) === 'epa')
  const hbAlerts = alertIds.filter(id => alertAgents.get(id) === 'hb')

  if (epaAlerts.length > 0 && hbAlerts.length > 0) {
    correlations.push({
      type: 'game_script',
      ids: [...epaAlerts.slice(0, 2), ...hbAlerts.slice(0, 2)],
      explanation: 'EPA efficiency patterns predict game script and usage',
    })
  }

  return correlations
}
