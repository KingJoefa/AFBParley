import type { Finding, AgentType } from '../../schemas'

export const PRESSURE_THRESHOLDS = {
  pressureRateRank: 10,         // top 10 pass rush
  passBlockWinRateRank: 22,     // bottom 10 OL
  sackRateRank: 10,
  qbPressuredRatingThreshold: 60,  // bad under pressure
} as const

interface DefenseData {
  team: string
  pressure_rate?: number
  pressure_rate_rank?: number
  sack_rate?: number
  sack_rate_rank?: number
}

interface OffenseData {
  team: string
  qb_name: string
  pass_block_win_rate_rank?: number
  qb_passer_rating_under_pressure?: number
}

interface ThresholdContext {
  dataTimestamp: number
  dataVersion: string
}

export function checkPressureThresholds(
  defense: DefenseData,
  offense: OffenseData,
  context: ThresholdContext
): Finding[] {
  const findings: Finding[] = []
  const agent: AgentType = 'pressure'

  // Check pressure rate advantage
  if (
    defense.pressure_rate_rank !== undefined &&
    defense.pressure_rate_rank <= PRESSURE_THRESHOLDS.pressureRateRank &&
    offense.pass_block_win_rate_rank !== undefined &&
    offense.pass_block_win_rate_rank >= PRESSURE_THRESHOLDS.passBlockWinRateRank
  ) {
    findings.push({
      id: `pressure-${defense.team.toLowerCase()}-vs-${offense.team.toLowerCase()}-${context.dataTimestamp}`,
      agent,
      type: 'pressure_rate_advantage',
      stat: 'pressure_rate_rank',
      value_num: defense.pressure_rate_rank,
      value_type: 'numeric',
      threshold_met: `defense rank <= ${PRESSURE_THRESHOLDS.pressureRateRank} AND OL rank >= ${PRESSURE_THRESHOLDS.passBlockWinRateRank}`,
      comparison_context: `${ordinal(defense.pressure_rate_rank)} pass rush vs ${ordinal(offense.pass_block_win_rate_rank)} OL`,
      source_ref: `local://data/pressure/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })

    // Add QB vulnerability if data exists
    if (
      offense.qb_passer_rating_under_pressure !== undefined &&
      offense.qb_passer_rating_under_pressure < PRESSURE_THRESHOLDS.qbPressuredRatingThreshold
    ) {
      findings.push({
        id: `pressure-${offense.qb_name.toLowerCase().replace(/\s+/g, '-')}-vuln-${context.dataTimestamp}`,
        agent,
        type: 'qb_pressure_vulnerability',
        stat: 'qb_passer_rating_under_pressure',
        value_num: offense.qb_passer_rating_under_pressure,
        value_type: 'numeric',
        threshold_met: `passer rating under pressure < ${PRESSURE_THRESHOLDS.qbPressuredRatingThreshold}`,
        comparison_context: `${offense.qb_name}: ${offense.qb_passer_rating_under_pressure} rating when pressured`,
        source_ref: `local://data/pressure/${context.dataVersion}.json`,
        source_type: 'local',
        source_timestamp: context.dataTimestamp,
      })
    }
  }

  return findings
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
