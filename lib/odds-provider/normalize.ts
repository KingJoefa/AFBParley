/**
 * Normalization utilities for team codes and player names
 *
 * Ensures stable dedup keys and consistent data across providers.
 */

/**
 * Team name -> code mapping
 * The Odds API uses full names: "Denver Broncos", "New England Patriots"
 */
const TEAM_CODE_MAP: Record<string, string> = {
  // AFC East
  'buffalo bills': 'BUF', 'bills': 'BUF', 'buffalo': 'BUF',
  'miami dolphins': 'MIA', 'dolphins': 'MIA', 'miami': 'MIA',
  'new england patriots': 'NE', 'patriots': 'NE', 'new england': 'NE',
  'new york jets': 'NYJ', 'jets': 'NYJ',
  // AFC North
  'baltimore ravens': 'BAL', 'ravens': 'BAL', 'baltimore': 'BAL',
  'cincinnati bengals': 'CIN', 'bengals': 'CIN', 'cincinnati': 'CIN',
  'cleveland browns': 'CLE', 'browns': 'CLE', 'cleveland': 'CLE',
  'pittsburgh steelers': 'PIT', 'steelers': 'PIT', 'pittsburgh': 'PIT',
  // AFC South
  'houston texans': 'HOU', 'texans': 'HOU', 'houston': 'HOU',
  'indianapolis colts': 'IND', 'colts': 'IND', 'indianapolis': 'IND',
  'jacksonville jaguars': 'JAX', 'jaguars': 'JAX', 'jacksonville': 'JAX',
  'tennessee titans': 'TEN', 'titans': 'TEN', 'tennessee': 'TEN',
  // AFC West
  'denver broncos': 'DEN', 'broncos': 'DEN', 'denver': 'DEN',
  'kansas city chiefs': 'KC', 'chiefs': 'KC', 'kansas city': 'KC',
  'las vegas raiders': 'LV', 'raiders': 'LV', 'las vegas': 'LV',
  'los angeles chargers': 'LAC', 'chargers': 'LAC',
  // NFC East
  'dallas cowboys': 'DAL', 'cowboys': 'DAL', 'dallas': 'DAL',
  'new york giants': 'NYG', 'giants': 'NYG',
  'philadelphia eagles': 'PHI', 'eagles': 'PHI', 'philadelphia': 'PHI',
  'washington commanders': 'WAS', 'commanders': 'WAS', 'washington': 'WAS',
  // NFC North
  'chicago bears': 'CHI', 'bears': 'CHI', 'chicago': 'CHI',
  'detroit lions': 'DET', 'lions': 'DET', 'detroit': 'DET',
  'green bay packers': 'GB', 'packers': 'GB', 'green bay': 'GB',
  'minnesota vikings': 'MIN', 'vikings': 'MIN', 'minnesota': 'MIN',
  // NFC South
  'atlanta falcons': 'ATL', 'falcons': 'ATL', 'atlanta': 'ATL',
  'carolina panthers': 'CAR', 'panthers': 'CAR', 'carolina': 'CAR',
  'new orleans saints': 'NO', 'saints': 'NO', 'new orleans': 'NO',
  'tampa bay buccaneers': 'TB', 'buccaneers': 'TB', 'tampa bay': 'TB', 'bucs': 'TB',
  // NFC West
  'arizona cardinals': 'ARI', 'cardinals': 'ARI', 'arizona': 'ARI',
  'los angeles rams': 'LAR', 'rams': 'LAR',
  'san francisco 49ers': 'SF', '49ers': 'SF', 'niners': 'SF', 'san francisco': 'SF',
  'seattle seahawks': 'SEA', 'seahawks': 'SEA', 'seattle': 'SEA',
}

// Reverse lookup for validation
const VALID_CODES = new Set(Object.values(TEAM_CODE_MAP))

/**
 * Normalize team name to 2-3 letter code
 */
export function normalizeTeamCode(input: string): string {
  if (!input) return 'UNK'

  const lower = input.toLowerCase().trim()

  // Already a valid code?
  const upper = input.toUpperCase().trim()
  if (VALID_CODES.has(upper)) return upper

  // Lookup in map
  const code = TEAM_CODE_MAP[lower]
  if (code) return code

  // Partial match (e.g., "Broncos" from "Denver Broncos")
  for (const [key, val] of Object.entries(TEAM_CODE_MAP)) {
    if (lower.includes(key) || key.includes(lower)) {
      return val
    }
  }

  return 'UNK'
}

/**
 * Normalize player name for display
 * Handles: "R. Stevenson", "Rhamondre Stevenson", "STEVENSON, RHAMONDRE"
 */
export function normalizePlayerName(input: string): string {
  if (!input) return ''

  let name = input.trim()

  // Remove team suffix like "(NE)" or "(DEN)"
  name = name.replace(/\s*\([A-Z]{2,3}\)\s*$/, '')

  // Handle "LAST, FIRST" format
  if (name.includes(',')) {
    const [last, first] = name.split(',').map(s => s.trim())
    name = `${first} ${last}`
  }

  // Normalize casing: Title Case with special handling
  name = name
    .toLowerCase()
    .split(' ')
    .map(word => {
      // Preserve special cases
      const upper = word.toUpperCase()
      if (['II', 'III', 'IV', 'JR', 'SR'].includes(upper)) return upper
      if (['CJ', 'DJ', 'TJ', 'AJ', 'JK', 'PJ', 'BJ', 'RJ'].includes(upper)) return upper
      // Title case
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')

  // Collapse multiple spaces
  name = name.replace(/\s+/g, ' ').trim()

  return name
}

/**
 * Extract team code from player description if present
 * E.g., "Rhamondre Stevenson (NE)" -> "NE"
 */
export function extractTeamFromDescription(description: string): string | undefined {
  const match = description.match(/\(([A-Z]{2,3})\)\s*$/)
  return match ? normalizeTeamCode(match[1]) : undefined
}

/**
 * Generate stable key for dedup/lookup
 * Lowercase, remove punctuation, collapse spaces
 */
export function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
