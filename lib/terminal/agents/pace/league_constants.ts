/**
 * League Constants for Pace Agent
 *
 * Historical averages used for pace calculations and projections.
 * Update yearly with official NFL stats.
 */

export interface LeagueStats {
  avg_plays_per_game: number    // League average plays per team per game
  avg_seconds_per_play: number  // League average time between snaps
}

/**
 * League constants keyed by season year
 *
 * These values are used when team-specific data is unavailable
 * or for computing delta_vs_league metrics.
 */
export const LEAGUE_CONSTANTS: Record<number, LeagueStats> = {
  2024: {
    avg_plays_per_game: 62.5,
    avg_seconds_per_play: 30.2,
  },
  2025: {
    avg_plays_per_game: 63.0,
    avg_seconds_per_play: 30.0,
  },
}

/**
 * Get league stats for a given year, falling back to most recent
 */
export function getLeagueStats(year: number): LeagueStats {
  if (LEAGUE_CONSTANTS[year]) {
    return LEAGUE_CONSTANTS[year]
  }

  // Fallback to most recent year
  const availableYears = Object.keys(LEAGUE_CONSTANTS).map(Number).sort((a, b) => b - a)
  return LEAGUE_CONSTANTS[availableYears[0]]
}
