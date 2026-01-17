import { z } from 'zod'

export const MetricSchema = z.enum([
  'receiving_epa', 'rushing_epa', 'pass_block_win_rate',
  'pressure_rate', 'target_share', 'snap_count',
  'red_zone_epa', 'epa_allowed', 'completion_rate',
  'yards_per_attempt', 'sack_rate', 'passer_rating',
  'yards_after_contact', 'separation', 'contested_catch_rate',
  'route_participation', 'red_zone_targets',
])

export const ClaimPartsSchema = z.object({
  metrics: z.array(MetricSchema).min(1),
  direction: z.enum(['positive', 'negative', 'neutral']),
  comparator: z.enum(['ranks', 'exceeds', 'trails', 'matches', 'diverges_from']),
  rank_or_percentile: z.object({
    type: z.enum(['rank', 'percentile']),
    value: z.number(),
    scope: z.enum(['league', 'position', 'conference', 'division']),
    direction: z.enum(['top', 'bottom']),
  }).strict().optional(),
  comparison_target: z.enum([
    'league_average', 'opponent_average', 'position_average',
    'season_baseline', 'historical_self'
  ]).optional(),
  context_qualifier: z.enum([
    'in_division', 'at_home', 'as_underdog', 'in_primetime',
    'vs_top_10_defense', 'with_current_qb'
  ]).optional(),
}).strict()

export type ClaimParts = z.infer<typeof ClaimPartsSchema>

// Display name mappings
const METRIC_DISPLAY: Record<string, string> = {
  receiving_epa: 'Receiving EPA',
  rushing_epa: 'Rushing EPA',
  pass_block_win_rate: 'Pass Block Win Rate',
  pressure_rate: 'Pressure Rate',
  target_share: 'Target Share',
  snap_count: 'Snap Count',
  red_zone_epa: 'Red Zone EPA',
  epa_allowed: 'EPA Allowed',
  completion_rate: 'Completion Rate',
  yards_per_attempt: 'Yards Per Attempt',
  sack_rate: 'Sack Rate',
  passer_rating: 'Passer Rating',
  yards_after_contact: 'Yards After Contact',
  separation: 'Separation',
  contested_catch_rate: 'Contested Catch Rate',
  route_participation: 'Route Participation',
  red_zone_targets: 'Red Zone Targets',
}

const COMPARISON_DISPLAY: Record<string, string> = {
  league_average: 'league average',
  opponent_average: 'opponent average',
  position_average: 'position average',
  season_baseline: 'season baseline',
  historical_self: 'historical self',
}

const QUALIFIER_DISPLAY: Record<string, string> = {
  in_division: 'in division games',
  at_home: 'at home',
  as_underdog: 'as underdog',
  in_primetime: 'in primetime',
  vs_top_10_defense: 'vs top 10 defense',
  with_current_qb: 'with current QB',
}

export function renderClaim(parts: ClaimParts): string {
  const metricNames = parts.metrics.map(m => METRIC_DISPLAY[m] || m).join(' + ')

  let claim = metricNames

  if (parts.rank_or_percentile) {
    const r = parts.rank_or_percentile
    claim += ` ${parts.comparator} ${r.direction} ${r.value}`
    claim += r.type === 'rank' ? ` in ${r.scope}` : 'th percentile'
  }

  if (parts.comparison_target) {
    claim += ` vs ${COMPARISON_DISPLAY[parts.comparison_target]}`
  }

  if (parts.context_qualifier) {
    claim += ` (${QUALIFIER_DISPLAY[parts.context_qualifier]})`
  }

  return claim
}
