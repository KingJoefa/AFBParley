/**
 * Canonical Signal Tags
 *
 * Normalized tags for trading signals/angles. The UI accepts free-text
 * which is fuzzy-matched to canonical tags for downstream stability.
 * Original text preserved as signals_raw for display/debug.
 */

export const SIGNAL_TAGS = [
  // Pace & tempo
  'pace_skew',
  'tempo_mismatch',
  'time_of_possession',
  'clock_management',

  // Pressure & protection
  'pressure_mismatch',
  'blitz_tendency',
  'pass_protection',
  'edge_rush',

  // Weather & environment
  'weather_impact',
  'wind_factor',
  'cold_game',
  'dome_to_outdoor',

  // Matchup-based
  'cb_wr_mismatch',
  'slot_advantage',
  'te_coverage_gap',
  'rb_receiving',
  'defensive_scheme',

  // Volume & usage
  'target_share',
  'snap_count_trend',
  'red_zone_usage',
  'goal_line_back',

  // Injury & personnel
  'injury_impact',
  'personnel_change',
  'backup_qb',
  'oline_shuffle',

  // Game script
  'game_script',
  'garbage_time',
  'blowout_risk',
  'close_game',

  // Variance & correlation
  'high_variance',
  'low_correlation',
  'stack_potential',
  'contrarian',

  // Historical & situational
  'revenge_game',
  'divisional_history',
  'primetime_factor',
  'rest_advantage',
  'travel_fatigue',
] as const

export type SignalTag = typeof SIGNAL_TAGS[number]

/**
 * Alias mappings for fuzzy matching
 * Maps common variations to canonical tags
 */
const SIGNAL_ALIASES: Record<string, SignalTag> = {
  // Pace variations
  'pace': 'pace_skew',
  'pace skew': 'pace_skew',
  'tempo': 'tempo_mismatch',
  'tempo mismatch': 'tempo_mismatch',
  'fast pace': 'pace_skew',
  'slow pace': 'pace_skew',
  'top': 'time_of_possession',
  'time of possession': 'time_of_possession',
  'clock': 'clock_management',

  // Pressure variations
  'pressure': 'pressure_mismatch',
  'pressure mismatch': 'pressure_mismatch',
  'blitz': 'blitz_tendency',
  'pass pro': 'pass_protection',
  'edge': 'edge_rush',
  'pass rush': 'edge_rush',

  // Weather variations
  'weather': 'weather_impact',
  'wind': 'wind_factor',
  'windy': 'wind_factor',
  'cold': 'cold_game',
  'dome': 'dome_to_outdoor',

  // Matchup variations
  'cb mismatch': 'cb_wr_mismatch',
  'wr mismatch': 'cb_wr_mismatch',
  'corner mismatch': 'cb_wr_mismatch',
  'slot': 'slot_advantage',
  'te mismatch': 'te_coverage_gap',
  'tight end': 'te_coverage_gap',
  'rb pass': 'rb_receiving',
  'scheme': 'defensive_scheme',

  // Volume variations
  'targets': 'target_share',
  'target share': 'target_share',
  'volume': 'target_share',
  'snaps': 'snap_count_trend',
  'snap count': 'snap_count_trend',
  'red zone': 'red_zone_usage',
  'rz': 'red_zone_usage',
  'goal line': 'goal_line_back',

  // Injury variations
  'injury': 'injury_impact',
  'injured': 'injury_impact',
  'personnel': 'personnel_change',
  'backup': 'backup_qb',
  'oline': 'oline_shuffle',
  'o-line': 'oline_shuffle',

  // Game script variations
  'script': 'game_script',
  'game script': 'game_script',
  'garbage': 'garbage_time',
  'garbage time': 'garbage_time',
  'blowout': 'blowout_risk',
  'close': 'close_game',
  'competitive': 'close_game',

  // Variance variations
  'variance': 'high_variance',
  'high variance': 'high_variance',
  'volatile': 'high_variance',
  'correlation': 'low_correlation',
  'uncorrelated': 'low_correlation',
  'stack': 'stack_potential',
  'stacking': 'stack_potential',
  'contrarian': 'contrarian',
  'fade': 'contrarian',

  // Situational variations
  'revenge': 'revenge_game',
  'divisional': 'divisional_history',
  'division': 'divisional_history',
  'primetime': 'primetime_factor',
  'prime time': 'primetime_factor',
  'mnf': 'primetime_factor',
  'snf': 'primetime_factor',
  'tnf': 'primetime_factor',
  'rest': 'rest_advantage',
  'bye': 'rest_advantage',
  'travel': 'travel_fatigue',
  'road': 'travel_fatigue',
}

/**
 * Normalize a single signal string to canonical tag
 * Returns the canonical tag if matched, null if no match
 */
export function normalizeSignal(input: string): SignalTag | null {
  const cleaned = input.toLowerCase().trim().replace(/[_-]/g, ' ')

  // Direct match to canonical
  if ((SIGNAL_TAGS as readonly string[]).includes(cleaned.replace(/ /g, '_'))) {
    return cleaned.replace(/ /g, '_') as SignalTag
  }

  // Alias match
  if (SIGNAL_ALIASES[cleaned]) {
    return SIGNAL_ALIASES[cleaned]
  }

  // Fuzzy match: check if any canonical tag starts with or contains the input
  for (const tag of SIGNAL_TAGS) {
    const tagWords = tag.replace(/_/g, ' ')
    if (tagWords.startsWith(cleaned) || cleaned.startsWith(tagWords)) {
      return tag
    }
  }

  // Fuzzy match: check if input contains any alias
  for (const [alias, tag] of Object.entries(SIGNAL_ALIASES)) {
    if (cleaned.includes(alias) || alias.includes(cleaned)) {
      return tag
    }
  }

  return null
}

/**
 * Normalize multiple signals from comma-separated input
 * Returns both normalized tags and unmatched raw strings
 */
export function normalizeSignals(input: string): {
  signals: SignalTag[]
  signals_raw: string[]
  unmatched: string[]
} {
  const raw = input
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const signals: SignalTag[] = []
  const unmatched: string[] = []

  for (const r of raw) {
    const normalized = normalizeSignal(r)
    if (normalized) {
      // Dedupe
      if (!signals.includes(normalized)) {
        signals.push(normalized)
      }
    } else {
      unmatched.push(r)
    }
  }

  return {
    signals,
    signals_raw: raw,
    unmatched,
  }
}

/**
 * Display name for a signal tag
 */
export function getSignalDisplayName(tag: SignalTag): string {
  return tag
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
