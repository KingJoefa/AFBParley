import type { Finding, AgentType } from '../../schemas'

export const WR_THRESHOLDS = {
  targetShareRank: 10,        // top 10 target share
  receivingYardsRank: 10,     // top 10 receiving yards
  yardsPerReceptionRank: 10,  // top 10 YPR
  receivingTdRank: 10,        // top 10 receiving TDs
  defensePassRank: 22,        // bottom 10 pass defense (vulnerable)
  separationRank: 10,         // top 10 separation
  minTargets: 50,             // sample size
} as const

interface WRData {
  name: string
  team: string
  targets?: number
  target_share?: number
  target_share_rank?: number
  receiving_yards?: number
  receiving_yards_rank?: number
  yards_per_reception?: number
  yards_per_reception_rank?: number
  receiving_tds?: number
  receiving_td_rank?: number
  separation?: number
  separation_rank?: number
}

interface OpponentDefenseData {
  team: string
  pass_defense_rank?: number
  yards_allowed_to_wr_rank?: number
  td_allowed_to_wr_rank?: number
}

interface ThresholdContext {
  dataTimestamp: number
  dataVersion: string
}

export function checkWrThresholds(
  wr: WRData,
  defense: OpponentDefenseData,
  context: ThresholdContext
): Finding[] {
  const findings: Finding[] = []
  const agent: AgentType = 'wr'

  // Check target share vs vulnerable defense
  if (
    wr.target_share_rank !== undefined &&
    wr.target_share_rank <= WR_THRESHOLDS.targetShareRank &&
    defense.pass_defense_rank !== undefined &&
    defense.pass_defense_rank >= WR_THRESHOLDS.defensePassRank &&
    (wr.targets ?? 0) >= WR_THRESHOLDS.minTargets
  ) {
    findings.push({
      id: `wr-${wr.name.toLowerCase().replace(/\s+/g, '-')}-volume-${context.dataTimestamp}`,
      agent,
      type: 'wr_target_volume',
      stat: 'target_share_rank',
      value_num: wr.target_share_rank,
      value_type: 'numeric',
      threshold_met: `target share rank <= ${WR_THRESHOLDS.targetShareRank} AND defense rank >= ${WR_THRESHOLDS.defensePassRank}`,
      comparison_context: `${wr.name}: ${ordinal(wr.target_share_rank)} target share vs ${ordinal(defense.pass_defense_rank)} pass defense`,
      source_ref: `local://data/wr/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  // Check receiving yards vs defense allowing yards
  if (
    wr.receiving_yards_rank !== undefined &&
    wr.receiving_yards_rank <= WR_THRESHOLDS.receivingYardsRank &&
    defense.yards_allowed_to_wr_rank !== undefined &&
    defense.yards_allowed_to_wr_rank >= WR_THRESHOLDS.defensePassRank &&
    (wr.targets ?? 0) >= WR_THRESHOLDS.minTargets
  ) {
    findings.push({
      id: `wr-${wr.name.toLowerCase().replace(/\s+/g, '-')}-yards-${context.dataTimestamp}`,
      agent,
      type: 'wr_yardage_advantage',
      stat: 'receiving_yards_rank',
      value_num: wr.receiving_yards_rank,
      value_type: 'numeric',
      threshold_met: `receiving yards rank <= ${WR_THRESHOLDS.receivingYardsRank} AND defense yards rank >= ${WR_THRESHOLDS.defensePassRank}`,
      comparison_context: `${wr.name}: ${ordinal(wr.receiving_yards_rank)} receiving yards vs ${ordinal(defense.yards_allowed_to_wr_rank)} yards allowed`,
      source_ref: `local://data/wr/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  // Check TD opportunity
  if (
    wr.receiving_td_rank !== undefined &&
    wr.receiving_td_rank <= WR_THRESHOLDS.receivingTdRank &&
    defense.td_allowed_to_wr_rank !== undefined &&
    defense.td_allowed_to_wr_rank >= WR_THRESHOLDS.defensePassRank
  ) {
    findings.push({
      id: `wr-${wr.name.toLowerCase().replace(/\s+/g, '-')}-td-${context.dataTimestamp}`,
      agent,
      type: 'wr_td_opportunity',
      stat: 'receiving_td_rank',
      value_num: wr.receiving_td_rank,
      value_type: 'numeric',
      threshold_met: `TD rank <= ${WR_THRESHOLDS.receivingTdRank} AND defense TD allowed rank >= ${WR_THRESHOLDS.defensePassRank}`,
      comparison_context: `${wr.name}: ${ordinal(wr.receiving_td_rank)} receiving TDs vs ${ordinal(defense.td_allowed_to_wr_rank)} TD allowed to WR`,
      source_ref: `local://data/wr/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  // Check separation (elite route runner)
  if (
    wr.separation_rank !== undefined &&
    wr.separation_rank <= WR_THRESHOLDS.separationRank
  ) {
    findings.push({
      id: `wr-${wr.name.toLowerCase().replace(/\s+/g, '-')}-sep-${context.dataTimestamp}`,
      agent,
      type: 'wr_separation_advantage',
      stat: 'separation_rank',
      value_num: wr.separation_rank,
      value_type: 'numeric',
      threshold_met: `separation rank <= ${WR_THRESHOLDS.separationRank}`,
      comparison_context: `${wr.name}: ${ordinal(wr.separation_rank)} separation - elite route runner`,
      source_ref: `local://data/wr/${context.dataVersion}.json`,
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
