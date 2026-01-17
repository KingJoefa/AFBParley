import type { Finding, AgentType } from '../../schemas'

export const QB_THRESHOLDS = {
  qbRatingRank: 10,           // top 10 QB rating
  completionPctRank: 10,      // top 10 completion %
  yardsPerAttemptRank: 10,    // top 10 YPA
  turnoverPctRank: 22,        // bottom 10 turnover rate (bad)
  defensePassRank: 22,        // bottom 10 pass defense (vulnerable)
  minAttempts: 150,           // sample size
} as const

interface QBData {
  name: string
  team: string
  qb_rating?: number
  qb_rating_rank?: number
  completion_pct?: number
  completion_pct_rank?: number
  yards_per_attempt?: number
  yards_per_attempt_rank?: number
  turnover_pct?: number
  turnover_pct_rank?: number
  attempts?: number
}

interface OpponentDefenseData {
  team: string
  pass_defense_rank?: number
  pass_yards_allowed_rank?: number
  pass_td_allowed_rank?: number
  interception_rate_rank?: number
}

interface ThresholdContext {
  dataTimestamp: number
  dataVersion: string
}

export function checkQbThresholds(
  qb: QBData,
  defense: OpponentDefenseData,
  context: ThresholdContext
): Finding[] {
  const findings: Finding[] = []
  const agent: AgentType = 'qb'

  // Check QB rating vs vulnerable pass defense
  if (
    qb.qb_rating_rank !== undefined &&
    qb.qb_rating_rank <= QB_THRESHOLDS.qbRatingRank &&
    defense.pass_defense_rank !== undefined &&
    defense.pass_defense_rank >= QB_THRESHOLDS.defensePassRank &&
    (qb.attempts ?? 0) >= QB_THRESHOLDS.minAttempts
  ) {
    findings.push({
      id: `qb-${qb.name.toLowerCase().replace(/\s+/g, '-')}-rating-${context.dataTimestamp}`,
      agent,
      type: 'qb_rating_advantage',
      stat: 'qb_rating_rank',
      value_num: qb.qb_rating_rank,
      value_type: 'numeric',
      threshold_met: `QB rating rank <= ${QB_THRESHOLDS.qbRatingRank} AND defense rank >= ${QB_THRESHOLDS.defensePassRank}`,
      comparison_context: `${qb.name}: ${ordinal(qb.qb_rating_rank)} QB rating vs ${ordinal(defense.pass_defense_rank)} pass defense`,
      source_ref: `local://data/qb/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  // Check YPA advantage
  if (
    qb.yards_per_attempt_rank !== undefined &&
    qb.yards_per_attempt_rank <= QB_THRESHOLDS.yardsPerAttemptRank &&
    defense.pass_yards_allowed_rank !== undefined &&
    defense.pass_yards_allowed_rank >= QB_THRESHOLDS.defensePassRank &&
    (qb.attempts ?? 0) >= QB_THRESHOLDS.minAttempts
  ) {
    findings.push({
      id: `qb-${qb.name.toLowerCase().replace(/\s+/g, '-')}-ypa-${context.dataTimestamp}`,
      agent,
      type: 'qb_ypa_advantage',
      stat: 'yards_per_attempt_rank',
      value_num: qb.yards_per_attempt_rank,
      value_type: 'numeric',
      threshold_met: `YPA rank <= ${QB_THRESHOLDS.yardsPerAttemptRank} AND defense yards rank >= ${QB_THRESHOLDS.defensePassRank}`,
      comparison_context: `${qb.name}: ${ordinal(qb.yards_per_attempt_rank)} YPA vs ${ordinal(defense.pass_yards_allowed_rank)} yards allowed`,
      source_ref: `local://data/qb/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  // Check turnover-prone QB vs ball-hawking defense
  if (
    qb.turnover_pct_rank !== undefined &&
    qb.turnover_pct_rank >= QB_THRESHOLDS.turnoverPctRank &&
    defense.interception_rate_rank !== undefined &&
    defense.interception_rate_rank <= 10 // Top 10 INT rate
  ) {
    findings.push({
      id: `qb-${qb.name.toLowerCase().replace(/\s+/g, '-')}-turnover-${context.dataTimestamp}`,
      agent,
      type: 'qb_turnover_risk',
      stat: 'turnover_pct_rank',
      value_num: qb.turnover_pct_rank,
      value_type: 'numeric',
      threshold_met: `QB turnover rank >= ${QB_THRESHOLDS.turnoverPctRank} AND defense INT rank <= 10`,
      comparison_context: `${qb.name}: ${ordinal(qb.turnover_pct_rank)} turnover rate vs ${ordinal(defense.interception_rate_rank)} INT rate`,
      source_ref: `local://data/qb/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  return findings
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
