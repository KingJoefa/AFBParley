import type { Finding, AgentType } from '../../schemas'

export const TE_THRESHOLDS = {
  targetShareRank: 8,         // top 8 for TE (smaller pool)
  receivingYardsRank: 8,      // top 8 receiving yards
  receivingTdRank: 8,         // top 8 receiving TDs
  defenseTeRank: 22,          // bottom 10 TE defense (vulnerable)
  redZoneTargetRank: 8,       // top 8 red zone targets
  minTargets: 40,             // sample size (lower for TE)
} as const

interface TEData {
  name: string
  team: string
  targets?: number
  target_share?: number
  target_share_rank?: number
  receiving_yards?: number
  receiving_yards_rank?: number
  receiving_tds?: number
  receiving_td_rank?: number
  red_zone_targets?: number
  red_zone_target_rank?: number
}

interface OpponentDefenseData {
  team: string
  te_defense_rank?: number
  yards_allowed_to_te_rank?: number
  td_allowed_to_te_rank?: number
}

interface ThresholdContext {
  dataTimestamp: number
  dataVersion: string
}

export function checkTeThresholds(
  te: TEData,
  defense: OpponentDefenseData,
  context: ThresholdContext
): Finding[] {
  const findings: Finding[] = []
  const agent: AgentType = 'te'

  // Check target share vs vulnerable TE defense
  if (
    te.target_share_rank !== undefined &&
    te.target_share_rank <= TE_THRESHOLDS.targetShareRank &&
    defense.te_defense_rank !== undefined &&
    defense.te_defense_rank >= TE_THRESHOLDS.defenseTeRank &&
    (te.targets ?? 0) >= TE_THRESHOLDS.minTargets
  ) {
    findings.push({
      id: `te-${te.name.toLowerCase().replace(/\s+/g, '-')}-volume-${context.dataTimestamp}`,
      agent,
      type: 'te_target_volume',
      stat: 'target_share_rank',
      value_num: te.target_share_rank,
      value_type: 'numeric',
      threshold_met: `target share rank <= ${TE_THRESHOLDS.targetShareRank} AND defense rank >= ${TE_THRESHOLDS.defenseTeRank}`,
      comparison_context: `${te.name}: ${ordinal(te.target_share_rank)} target share vs ${ordinal(defense.te_defense_rank)} TE defense`,
      source_ref: `local://data/te/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  // Check receiving yards vs defense allowing yards to TE
  if (
    te.receiving_yards_rank !== undefined &&
    te.receiving_yards_rank <= TE_THRESHOLDS.receivingYardsRank &&
    defense.yards_allowed_to_te_rank !== undefined &&
    defense.yards_allowed_to_te_rank >= TE_THRESHOLDS.defenseTeRank &&
    (te.targets ?? 0) >= TE_THRESHOLDS.minTargets
  ) {
    findings.push({
      id: `te-${te.name.toLowerCase().replace(/\s+/g, '-')}-yards-${context.dataTimestamp}`,
      agent,
      type: 'te_yardage_advantage',
      stat: 'receiving_yards_rank',
      value_num: te.receiving_yards_rank,
      value_type: 'numeric',
      threshold_met: `receiving yards rank <= ${TE_THRESHOLDS.receivingYardsRank} AND defense yards rank >= ${TE_THRESHOLDS.defenseTeRank}`,
      comparison_context: `${te.name}: ${ordinal(te.receiving_yards_rank)} TE receiving yards vs ${ordinal(defense.yards_allowed_to_te_rank)} yards allowed`,
      source_ref: `local://data/te/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  // Check TD opportunity
  if (
    te.receiving_td_rank !== undefined &&
    te.receiving_td_rank <= TE_THRESHOLDS.receivingTdRank &&
    defense.td_allowed_to_te_rank !== undefined &&
    defense.td_allowed_to_te_rank >= TE_THRESHOLDS.defenseTeRank
  ) {
    findings.push({
      id: `te-${te.name.toLowerCase().replace(/\s+/g, '-')}-td-${context.dataTimestamp}`,
      agent,
      type: 'te_td_opportunity',
      stat: 'receiving_td_rank',
      value_num: te.receiving_td_rank,
      value_type: 'numeric',
      threshold_met: `TD rank <= ${TE_THRESHOLDS.receivingTdRank} AND defense TD allowed rank >= ${TE_THRESHOLDS.defenseTeRank}`,
      comparison_context: `${te.name}: ${ordinal(te.receiving_td_rank)} TE TDs vs ${ordinal(defense.td_allowed_to_te_rank)} TD allowed to TE`,
      source_ref: `local://data/te/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  // Check red zone factor
  if (
    te.red_zone_target_rank !== undefined &&
    te.red_zone_target_rank <= TE_THRESHOLDS.redZoneTargetRank
  ) {
    findings.push({
      id: `te-${te.name.toLowerCase().replace(/\s+/g, '-')}-rz-${context.dataTimestamp}`,
      agent,
      type: 'te_red_zone_factor',
      stat: 'red_zone_target_rank',
      value_num: te.red_zone_target_rank,
      value_type: 'numeric',
      threshold_met: `red zone target rank <= ${TE_THRESHOLDS.redZoneTargetRank}`,
      comparison_context: `${te.name}: ${ordinal(te.red_zone_target_rank)} red zone TE targets - high TD upside`,
      source_ref: `local://data/te/${context.dataVersion}.json`,
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
