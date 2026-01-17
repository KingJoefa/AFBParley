import type { Finding, AgentType } from '../../schemas'

export const EPA_THRESHOLDS = {
  receivingEpaRank: 10,     // top 10
  epaAllowedRank: 10,       // opponent allows top 10
  rushingEpaDiff: 0.15,
  redZoneEpaDiff: 0.20,
  minTargets: 50,           // sample size threshold
} as const

interface PlayerData {
  name: string
  team: string
  receiving_epa_rank?: number
  rushing_epa_rank?: number
  receiving_epa?: number
  rushing_epa?: number
  targets?: number
  rushes?: number
}

interface OpponentData {
  team: string
  epa_allowed_to_wr_rank?: number
  epa_allowed_to_rb_rank?: number
  receiving_epa_allowed?: number
  rushing_epa_allowed?: number
}

interface ThresholdContext {
  dataTimestamp: number
  dataVersion: string
}

export function checkEpaThresholds(
  player: PlayerData,
  opponent: OpponentData,
  context: ThresholdContext
): Finding[] {
  const findings: Finding[] = []
  const agent: AgentType = 'epa'

  // Check receiving EPA mismatch
  if (
    player.receiving_epa_rank !== undefined &&
    player.receiving_epa_rank <= EPA_THRESHOLDS.receivingEpaRank &&
    opponent.epa_allowed_to_wr_rank !== undefined &&
    opponent.epa_allowed_to_wr_rank <= EPA_THRESHOLDS.epaAllowedRank &&
    (player.targets ?? 0) >= EPA_THRESHOLDS.minTargets
  ) {
    findings.push({
      id: `epa-${player.name.toLowerCase().replace(/\s+/g, '-')}-recv-${context.dataTimestamp}`,
      agent,
      type: 'receiving_epa_mismatch',
      stat: 'receiving_epa_rank',
      value_num: player.receiving_epa_rank,
      value_type: 'numeric',
      threshold_met: `rank <= ${EPA_THRESHOLDS.receivingEpaRank} AND opponent allows top ${EPA_THRESHOLDS.epaAllowedRank}`,
      comparison_context: `${ordinal(player.receiving_epa_rank)} in league vs ${ordinal(opponent.epa_allowed_to_wr_rank)} worst defense`,
      source_ref: `local://data/epa/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  // Check rushing EPA mismatch
  if (
    player.rushing_epa_rank !== undefined &&
    player.rushing_epa_rank <= EPA_THRESHOLDS.receivingEpaRank &&
    opponent.epa_allowed_to_rb_rank !== undefined &&
    opponent.epa_allowed_to_rb_rank <= EPA_THRESHOLDS.epaAllowedRank &&
    (player.rushes ?? 0) >= EPA_THRESHOLDS.minTargets
  ) {
    findings.push({
      id: `epa-${player.name.toLowerCase().replace(/\s+/g, '-')}-rush-${context.dataTimestamp}`,
      agent,
      type: 'rushing_epa_mismatch',
      stat: 'rushing_epa_rank',
      value_num: player.rushing_epa_rank,
      value_type: 'numeric',
      threshold_met: `rank <= ${EPA_THRESHOLDS.receivingEpaRank} AND opponent allows top ${EPA_THRESHOLDS.epaAllowedRank}`,
      comparison_context: `${ordinal(player.rushing_epa_rank)} in league vs ${ordinal(opponent.epa_allowed_to_rb_rank)} worst defense`,
      source_ref: `local://data/epa/${context.dataVersion}.json`,
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
