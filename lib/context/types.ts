/**
 * Context Block Types
 * Shared types for all context blocks injected into GPT prompts.
 * Uses compact JSON format with fixed keys for reliability and testability.
 */

export type ContextStatus = 'FRESH' | 'STALE' | 'UNAVAILABLE'

// TTL thresholds in minutes
export const FRESH_TTL_MIN = 30
export const STALE_TTL_MIN = 120

/**
 * Lines context - betting lines with provenance
 */
export interface LinesContext {
  type: 'lines'
  source: string        // "FD", "DK", "manual", etc.
  ts: number            // Unix timestamp (seconds) of data
  age_min: number       // Minutes since fetch
  status: ContextStatus
  data: {
    total?: number
    spread_home?: number
    spread_away?: number
    ml_home?: number
    ml_away?: number
    team_total_home?: number
    team_total_away?: number
  } | null
}

/**
 * Injuries context - OUT/DOUBTFUL players
 */
export interface InjuriesContext {
  type: 'injuries'
  ts: number
  status: ContextStatus
  data: Array<{
    player: string
    team: string
    status: 'OUT' | 'DOUBTFUL' | 'QUESTIONABLE'
    injury?: string
  }>
}

/**
 * Weather context - outdoor game conditions
 */
export interface WeatherContext {
  type: 'weather'
  ts: number
  data: {
    temp_f: number
    wind_mph: number
    precip?: string     // "rain", "snow", "clear"
    indoor: boolean
  }
}

/**
 * Team stats context - one block per team
 */
export interface TeamStatsContext {
  type: 'team_stats'
  team: string          // Team code, e.g., "BUF"
  ts: number
  data: {
    epa?: number        // EPA per play
    pace?: number       // Plays per game
    pass_rate?: number  // Neutral pass rate (0-1)
    rz_td_rate?: number // Red zone TD rate (0-1)
    pressure_rate?: number // Pressure rate (0-1)
  }
}

/**
 * Player projections context
 */
export interface ProjectionsContext {
  type: 'projections'
  ts: number
  data: Array<{
    name: string
    team: string
    pos: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST'
    pass_yds?: number
    pass_tds?: number
    rush_yds?: number
    rush_tds?: number
    rec_yds?: number
    rec_tds?: number
    targets?: number
    proj_pts?: number   // Projected fantasy points
    rank?: number       // Overall rank (used in playoffs when proj_pts unavailable)
  }>
}

/**
 * User data context - BYOA (Bring Your Own Analytics)
 * Always marked as UNTRUSTED
 */
export interface UserDataContext {
  type: 'user_data'
  status: 'UNTRUSTED'
  note: string
  data: string          // Sanitized user content
}

/**
 * Union of all context block types
 */
export type ContextBlock =
  | LinesContext
  | InjuriesContext
  | WeatherContext
  | TeamStatsContext
  | ProjectionsContext
  | UserDataContext

/**
 * Result from the context builder
 */
export interface BuiltContext {
  context: string       // Full context string with delimiters
  tokenCount: number    // Estimated token count
  truncated: string[]   // Block types that were truncated
  blocks: ContextBlock[] // All blocks that were included
}

/**
 * Priority order for context blocks (highest impact first)
 */
export const CONTEXT_PRIORITY: ContextBlock['type'][] = [
  'lines',
  'injuries',
  'weather',
  'team_stats',
  'projections',
  'user_data',
]

/**
 * Default token budget for context
 */
export const DEFAULT_TOKEN_BUDGET = 1500
