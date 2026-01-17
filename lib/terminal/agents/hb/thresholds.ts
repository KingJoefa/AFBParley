import type { Finding, AgentType } from '../../schemas'

export const HB_THRESHOLDS = {
  rushYardsRank: 10,          // top 10 rushing yards
  yardsPerCarryRank: 10,      // top 10 YPC
  touchdownsRank: 10,         // top 10 rushing TDs
  defenseRushRank: 22,        // bottom 10 rush defense (vulnerable)
  yardsAllowedRank: 22,       // bottom 10 yards allowed
  minCarries: 80,             // sample size
  receptionRank: 15,          // top 15 receiving backs
} as const

interface HBData {
  name: string
  team: string
  rush_yards?: number
  rush_yards_rank?: number
  yards_per_carry?: number
  yards_per_carry_rank?: number
  rush_tds?: number
  rush_td_rank?: number
  carries?: number
  receptions?: number
  reception_rank?: number
}

interface OpponentDefenseData {
  team: string
  rush_defense_rank?: number
  rush_yards_allowed_rank?: number
  rush_td_allowed_rank?: number
}

interface ThresholdContext {
  dataTimestamp: number
  dataVersion: string
}

export function checkHbThresholds(
  hb: HBData,
  defense: OpponentDefenseData,
  context: ThresholdContext
): Finding[] {
  const findings: Finding[] = []
  const agent: AgentType = 'hb'

  // Check rushing volume vs vulnerable defense
  if (
    hb.rush_yards_rank !== undefined &&
    hb.rush_yards_rank <= HB_THRESHOLDS.rushYardsRank &&
    defense.rush_defense_rank !== undefined &&
    defense.rush_defense_rank >= HB_THRESHOLDS.defenseRushRank &&
    (hb.carries ?? 0) >= HB_THRESHOLDS.minCarries
  ) {
    findings.push({
      id: `hb-${hb.name.toLowerCase().replace(/\s+/g, '-')}-volume-${context.dataTimestamp}`,
      agent,
      type: 'hb_volume_advantage',
      stat: 'rush_yards_rank',
      value_num: hb.rush_yards_rank,
      value_type: 'numeric',
      threshold_met: `rush yards rank <= ${HB_THRESHOLDS.rushYardsRank} AND defense rank >= ${HB_THRESHOLDS.defenseRushRank}`,
      comparison_context: `${hb.name}: ${ordinal(hb.rush_yards_rank)} rush yards vs ${ordinal(defense.rush_defense_rank)} rush defense`,
      source_ref: `local://data/hb/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  // Check efficiency (YPC) vs poor rush defense
  if (
    hb.yards_per_carry_rank !== undefined &&
    hb.yards_per_carry_rank <= HB_THRESHOLDS.yardsPerCarryRank &&
    defense.rush_yards_allowed_rank !== undefined &&
    defense.rush_yards_allowed_rank >= HB_THRESHOLDS.yardsAllowedRank &&
    (hb.carries ?? 0) >= HB_THRESHOLDS.minCarries
  ) {
    findings.push({
      id: `hb-${hb.name.toLowerCase().replace(/\s+/g, '-')}-efficiency-${context.dataTimestamp}`,
      agent,
      type: 'hb_efficiency_advantage',
      stat: 'yards_per_carry_rank',
      value_num: hb.yards_per_carry_rank,
      value_type: 'numeric',
      threshold_met: `YPC rank <= ${HB_THRESHOLDS.yardsPerCarryRank} AND defense yards rank >= ${HB_THRESHOLDS.yardsAllowedRank}`,
      comparison_context: `${hb.name}: ${ordinal(hb.yards_per_carry_rank)} YPC vs ${ordinal(defense.rush_yards_allowed_rank)} yards allowed`,
      source_ref: `local://data/hb/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  // Check TD scoring opportunity
  if (
    hb.rush_td_rank !== undefined &&
    hb.rush_td_rank <= HB_THRESHOLDS.touchdownsRank &&
    defense.rush_td_allowed_rank !== undefined &&
    defense.rush_td_allowed_rank >= HB_THRESHOLDS.defenseRushRank
  ) {
    findings.push({
      id: `hb-${hb.name.toLowerCase().replace(/\s+/g, '-')}-td-${context.dataTimestamp}`,
      agent,
      type: 'hb_td_opportunity',
      stat: 'rush_td_rank',
      value_num: hb.rush_td_rank,
      value_type: 'numeric',
      threshold_met: `TD rank <= ${HB_THRESHOLDS.touchdownsRank} AND defense TD allowed rank >= ${HB_THRESHOLDS.defenseRushRank}`,
      comparison_context: `${hb.name}: ${ordinal(hb.rush_td_rank)} rush TDs vs ${ordinal(defense.rush_td_allowed_rank)} TD allowed`,
      source_ref: `local://data/hb/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  // Check receiving back opportunity
  if (
    hb.reception_rank !== undefined &&
    hb.reception_rank <= HB_THRESHOLDS.receptionRank
  ) {
    findings.push({
      id: `hb-${hb.name.toLowerCase().replace(/\s+/g, '-')}-receiving-${context.dataTimestamp}`,
      agent,
      type: 'hb_receiving_factor',
      stat: 'reception_rank',
      value_num: hb.reception_rank,
      value_type: 'numeric',
      threshold_met: `reception rank <= ${HB_THRESHOLDS.receptionRank}`,
      comparison_context: `${hb.name}: ${ordinal(hb.reception_rank)} in RB receptions - dual threat`,
      source_ref: `local://data/hb/${context.dataVersion}.json`,
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
