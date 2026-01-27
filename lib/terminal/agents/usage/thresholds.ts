/**
 * Usage Agent
 *
 * Identifies volume leaders and usage trajectory changes from MatchupContext player data.
 * Emits findings for workhorses, target share alphas, trending usage patterns.
 *
 * Source: MatchupContext.players
 * Source Type: matchupContext
 */

import type { AgentType } from '../../schemas'
import type {
  UsageFinding,
  UsageFindingType,
  UsagePayload,
  Implication,
} from '../../schemas/finding'
import { USAGE_IMPLICATIONS } from '../../schemas/finding'
import type { PlayerData } from '../../engine/agent-runner'
import { createLogger } from '@/lib/logger'

const log = createLogger('UsageAgent')
const AGENT: AgentType = 'usage'

// =============================================================================
// Thresholds
// =============================================================================

export const USAGE_THRESHOLDS = {
  // Absolute thresholds (apply to L4 window)
  snap_pct_high: 0.80,
  snap_pct_low: 0.50,
  route_participation_high: 0.85,
  target_share_high: 0.25,
  target_share_elite: 0.30,

  // Trend thresholds (L4 vs season delta)
  trend_rising: 0.05,
  trend_falling: -0.05,

  // Required minimums for suppression
  min_games_in_window: 4,
  min_routes_sample: 50,
  min_targets_sample: 15,
} as const

// =============================================================================
// Types
// =============================================================================

interface UsageContext {
  homeTeam: string
  awayTeam: string
  players: Record<string, PlayerData[]>
  dataTimestamp: number
  dataVersion: string
}

// =============================================================================
// Suppression Logic
// =============================================================================

/**
 * Check if player data should be suppressed due to insufficient sample
 */
function shouldSuppress(player: PlayerData): { suppress: boolean; reason?: string } {
  // Suppress if injury limited
  if (player.injury_limited) {
    return { suppress: true, reason: 'injury_limited' }
  }

  // Suppress if insufficient games
  if (player.games_in_window !== undefined && player.games_in_window < USAGE_THRESHOLDS.min_games_in_window) {
    return { suppress: true, reason: `games_in_window < ${USAGE_THRESHOLDS.min_games_in_window}` }
  }

  // Suppress if insufficient routes for route-based metrics
  if (player.routes_sample !== undefined && player.routes_sample < USAGE_THRESHOLDS.min_routes_sample) {
    return { suppress: true, reason: `routes_sample < ${USAGE_THRESHOLDS.min_routes_sample}` }
  }

  // Suppress if insufficient targets for target-based metrics
  if (player.targets_sample !== undefined && player.targets_sample < USAGE_THRESHOLDS.min_targets_sample) {
    return { suppress: true, reason: `targets_sample < ${USAGE_THRESHOLDS.min_targets_sample}` }
  }

  return { suppress: false }
}

// =============================================================================
// Usage Calculations
// =============================================================================

/**
 * Calculate trend from season to L4 window
 */
function calculateTrend(
  seasonValue: number | undefined,
  l4Value: number | undefined
): 'rising' | 'stable' | 'falling' | undefined {
  if (seasonValue === undefined || l4Value === undefined) return undefined

  const delta = l4Value - seasonValue
  if (delta >= USAGE_THRESHOLDS.trend_rising) return 'rising'
  if (delta <= USAGE_THRESHOLDS.trend_falling) return 'falling'
  return 'stable'
}

/**
 * Determine finding type based on player data
 */
function determineFindingType(player: PlayerData): UsageFindingType | null {
  // Check for elite target share (L4)
  if (player.target_share_l4 !== undefined && player.target_share_l4 >= USAGE_THRESHOLDS.target_share_elite) {
    return 'target_share_elite'
  }

  // Check for alpha target share (L4)
  if (player.target_share_l4 !== undefined && player.target_share_l4 >= USAGE_THRESHOLDS.target_share_high) {
    return 'target_share_alpha'
  }

  // Check for volume workhorse (high snap % + high route participation for RBs)
  if (
    player.snap_pct_l4 !== undefined &&
    player.snap_pct_l4 >= USAGE_THRESHOLDS.snap_pct_high &&
    player.position === 'RB'
  ) {
    return 'volume_workhorse'
  }

  // Check for usage trending up
  const snapTrend = calculateTrend(player.snap_pct_season, player.snap_pct_l4)
  const targetTrend = calculateTrend(player.target_share_season, player.target_share_l4)
  if (snapTrend === 'rising' || targetTrend === 'rising') {
    return 'usage_trending_up'
  }

  // Check for usage trending down
  if (snapTrend === 'falling' || targetTrend === 'falling') {
    return 'usage_trending_down'
  }

  // Check for committee (low snap % for RB)
  if (
    player.snap_pct_l4 !== undefined &&
    player.snap_pct_l4 <= USAGE_THRESHOLDS.snap_pct_low &&
    player.position === 'RB'
  ) {
    return 'snap_share_committee'
  }

  return null
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Run the Usage agent against MatchupContext player data
 */
export function checkUsageThresholds(context: UsageContext): UsageFinding[] {
  const findings: UsageFinding[] = []

  if (!context.players || Object.keys(context.players).length === 0) {
    log.debug('No player data provided')
    return findings
  }

  // Process players from both teams
  for (const [team, players] of Object.entries(context.players)) {
    for (const player of players) {
      // Skip non-skill positions
      if (!['RB', 'WR', 'TE', 'HB'].includes(player.position)) {
        continue
      }

      // Check suppression rules
      const { suppress, reason } = shouldSuppress(player)
      if (suppress) {
        log.debug(`Suppressing ${player.name}: ${reason}`)
        continue
      }

      // Determine finding type
      const findingType = determineFindingType(player)
      if (!findingType) continue

      const trend = calculateTrend(player.target_share_season, player.target_share_l4)
        || calculateTrend(player.snap_pct_season, player.snap_pct_l4)

      const payload: UsagePayload = {
        snap_pct_season: player.snap_pct_season,
        snap_pct_l4: player.snap_pct_l4,
        route_participation_season: player.route_participation_season,
        route_participation_l4: player.route_participation_l4,
        target_share_season: player.target_share_season,
        target_share_l4: player.target_share_l4,
        trend,
        window: 'l4',
        games_in_window: player.games_in_window,
        routes_sample: player.routes_sample,
        targets_sample: player.targets_sample,
      }

      const implications = USAGE_IMPLICATIONS[findingType]
      const primaryValue = player.target_share_l4 ?? player.snap_pct_l4 ?? 0

      findings.push({
        id: `usage-${team.toLowerCase()}-${player.name.toLowerCase().replace(/\s+/g, '-')}-${context.dataTimestamp}`,
        agent: AGENT,
        scope: 'player',
        metric: 'snap_pct',
        value: primaryValue,
        thresholds: buildThresholds(findingType, player),
        comparison_context: buildComparisonContext(findingType, player),
        confidence: calculateConfidence(player, findingType),
        source_ref: `matchupContext://players/${team}/${player.name}`,
        source_type: 'matchupContext',
        source_timestamp: context.dataTimestamp,
        implication: implications[0], // Primary implication
        finding_type: findingType,
        payload,
        // Legacy fields for compatibility
        type: findingType,
        stat: 'usage_metrics',
        value_num: primaryValue,
        value_type: 'numeric',
        threshold_met: formatThresholdMet(findingType),
      } as UsageFinding)

      log.debug(`Found usage pattern: ${player.name} (${findingType})`)
    }
  }

  return findings
}

// =============================================================================
// Helper Functions
// =============================================================================

function buildThresholds(findingType: UsageFindingType, player: PlayerData) {
  const thresholds = []

  switch (findingType) {
    case 'target_share_elite':
      thresholds.push({
        key: 'target_share_l4',
        operator: 'gte' as const,
        value: USAGE_THRESHOLDS.target_share_elite,
        met: true,
      })
      break
    case 'target_share_alpha':
      thresholds.push({
        key: 'target_share_l4',
        operator: 'gte' as const,
        value: USAGE_THRESHOLDS.target_share_high,
        met: true,
      })
      break
    case 'volume_workhorse':
      thresholds.push({
        key: 'snap_pct_l4',
        operator: 'gte' as const,
        value: USAGE_THRESHOLDS.snap_pct_high,
        met: true,
      })
      break
    case 'usage_trending_up':
      thresholds.push({
        key: 'trend_delta',
        operator: 'gte' as const,
        value: USAGE_THRESHOLDS.trend_rising,
        met: true,
      })
      break
    case 'usage_trending_down':
      thresholds.push({
        key: 'trend_delta',
        operator: 'lte' as const,
        value: USAGE_THRESHOLDS.trend_falling,
        met: true,
      })
      break
    case 'snap_share_committee':
      thresholds.push({
        key: 'snap_pct_l4',
        operator: 'lte' as const,
        value: USAGE_THRESHOLDS.snap_pct_low,
        met: true,
      })
      break
  }

  return thresholds
}

function buildComparisonContext(findingType: UsageFindingType, player: PlayerData): string {
  const pct = (n: number | undefined) => n !== undefined ? `${(n * 100).toFixed(1)}%` : 'N/A'

  switch (findingType) {
    case 'target_share_elite':
      return `${player.name}: ${pct(player.target_share_l4)} target share (elite)`
    case 'target_share_alpha':
      return `${player.name}: ${pct(player.target_share_l4)} target share (alpha)`
    case 'volume_workhorse':
      return `${player.name}: ${pct(player.snap_pct_l4)} snap share (workhorse)`
    case 'usage_trending_up':
      return `${player.name}: usage trending up (${pct(player.snap_pct_season)} → ${pct(player.snap_pct_l4)})`
    case 'usage_trending_down':
      return `${player.name}: usage trending down (${pct(player.snap_pct_season)} → ${pct(player.snap_pct_l4)})`
    case 'snap_share_committee':
      return `${player.name}: ${pct(player.snap_pct_l4)} snap share (committee)`
    default:
      return `${player.name}: usage pattern detected`
  }
}

function calculateConfidence(player: PlayerData, findingType: UsageFindingType): number {
  // Base confidence based on sample size
  let confidence = 0.7

  // Boost for sufficient sample
  if (player.games_in_window && player.games_in_window >= USAGE_THRESHOLDS.min_games_in_window) {
    confidence += 0.1
  }
  if (player.routes_sample && player.routes_sample >= USAGE_THRESHOLDS.min_routes_sample) {
    confidence += 0.05
  }
  if (player.targets_sample && player.targets_sample >= USAGE_THRESHOLDS.min_targets_sample) {
    confidence += 0.05
  }

  // Boost for extreme values
  if (findingType === 'target_share_elite' && player.target_share_l4 && player.target_share_l4 >= 0.35) {
    confidence += 0.1
  }

  return Math.min(confidence, 0.95)
}

function formatThresholdMet(findingType: UsageFindingType): string {
  switch (findingType) {
    case 'target_share_elite':
      return `target_share_l4 >= ${USAGE_THRESHOLDS.target_share_elite}`
    case 'target_share_alpha':
      return `target_share_l4 >= ${USAGE_THRESHOLDS.target_share_high}`
    case 'volume_workhorse':
      return `snap_pct_l4 >= ${USAGE_THRESHOLDS.snap_pct_high}`
    case 'usage_trending_up':
      return `delta >= ${USAGE_THRESHOLDS.trend_rising}`
    case 'usage_trending_down':
      return `delta <= ${USAGE_THRESHOLDS.trend_falling}`
    case 'snap_share_committee':
      return `snap_pct_l4 <= ${USAGE_THRESHOLDS.snap_pct_low}`
    default:
      return 'unknown'
  }
}

/**
 * Get all implications for the usage agent
 */
export function getUsageImplications(findingType: UsageFindingType): Implication[] {
  return USAGE_IMPLICATIONS[findingType]
}
