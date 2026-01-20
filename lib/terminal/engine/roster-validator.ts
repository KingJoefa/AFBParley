/**
 * Roster Validator
 *
 * Validates LLM-generated scripts against an allowed player roster.
 * Prevents hallucinated players from reaching users.
 *
 * Approach:
 *   1. Structural-first: Check legs[].player and explicit player fields
 *   2. Narrative secondary: Scan freeform text for obvious roster names (low false-positive)
 */

export interface Player {
  name: string
  team: string
  pos: string
  rank?: number
}

export interface AllowedRoster {
  home: Player[]
  away: Player[]
  all: Player[]
  aliasSet: Set<string>  // Normalized names for fast lookup
}

export interface ValidationResult {
  valid: boolean
  matched: string[]      // Players that matched the roster
  invalid: string[]      // Players that didn't match
  forbidden_list: string // Formatted string for retry prompt
}

/**
 * Normalize a player name for comparison
 * - Lowercase
 * - Strip diacritics (é → e, etc.)
 * - Remove punctuation (periods, apostrophes)
 * - Collapse multiple spaces
 * - Drop suffixes (Jr, Sr, II, III, IV)
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    // Remove diacritics (NFD decomposition + strip combining marks)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Remove punctuation
    .replace(/[.']/g, '')
    // Replace hyphens with space (for compound names)
    .replace(/-/g, ' ')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim()
    // Drop common suffixes
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, '')
    .trim()
}

/**
 * Build a set of aliases for a player name
 * Handles common variations:
 * - "C.J. Stroud" → "cj stroud", "c j stroud"
 * - "DeMario Douglas" → "demario douglas"
 * - "D'Andre Swift" → "dandre swift"
 */
export function buildAliasSet(players: Player[]): Set<string> {
  const aliases = new Set<string>()

  for (const player of players) {
    const normalized = normalizeName(player.name)
    aliases.add(normalized)

    // Add version without spaces after initials (cj stroud)
    const noInitialSpaces = normalized.replace(/\b([a-z]) ([a-z])\b/g, '$1$2')
    if (noInitialSpaces !== normalized) {
      aliases.add(noInitialSpaces)
    }

    // Add version with collapsed initials (cjstroud for edge cases)
    const collapsed = normalized.replace(/\s/g, '')
    if (collapsed !== normalized && collapsed.length > 5) {
      // Only add if not too short (avoid false matches)
      aliases.add(collapsed)
    }

    // Add first name only for very unique names (optional, conservative)
    // Skipping this to avoid false positives
  }

  return aliases
}

/**
 * Build allowed roster from projections data filtered by matchup teams
 */
export function buildAllowedRoster(
  projections: Player[],
  homeTeam: string,
  awayTeam: string
): AllowedRoster {
  const normalizeTeam = (t: string) => t.toUpperCase()
  const home = normalizeTeam(homeTeam)
  const away = normalizeTeam(awayTeam)

  const homePlayers = projections.filter(p => normalizeTeam(p.team) === home)
  const awayPlayers = projections.filter(p => normalizeTeam(p.team) === away)
  const all = [...homePlayers, ...awayPlayers]

  return {
    home: homePlayers,
    away: awayPlayers,
    all,
    aliasSet: buildAliasSet(all),
  }
}

/**
 * Extract player names from structured script fields
 * Checks: legs[].selection, legs[].market (for player prop patterns)
 */
export function extractPlayersFromStructure(script: {
  legs?: Array<{
    market?: string
    selection?: string
    player?: string
  }>
}): string[] {
  const players: string[] = []

  if (!script.legs) return players

  for (const leg of script.legs) {
    // Explicit player field
    if (leg.player) {
      players.push(leg.player)
    }

    // Extract from selection (e.g., "Drake Maye Over 245.5 Passing Yards")
    if (leg.selection) {
      const selectionMatch = extractPlayerFromPropString(leg.selection)
      if (selectionMatch) {
        players.push(selectionMatch)
      }
    }

    // Extract from market if it mentions a player
    if (leg.market && leg.market.toLowerCase().includes('props')) {
      // Already handled in selection typically
    }
  }

  return players
}

/**
 * Extract player name from prop string
 * Patterns:
 *   "Drake Maye Over 245.5 Passing Yards"
 *   "Patrick Mahomes Under 2.5 Touchdowns"
 *   "Davante Adams 75+ Receiving Yards"
 */
function extractPlayerFromPropString(prop: string): string | null {
  // Pattern: Name (2-4 words) + Over/Under/+/- + Number
  const match = prop.match(/^([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){1,3})\s+(?:Over|Under|[+-]?\d)/i)
  if (match) {
    return match[1].trim()
  }

  // Pattern: Name + Number+ (e.g., "Adams 75+")
  const altMatch = prop.match(/^([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})\s+\d+\+/i)
  if (altMatch) {
    return altMatch[1].trim()
  }

  return null
}

/**
 * Extract obvious player names from narrative text
 * Conservative: only matches full names that look like "FirstName LastName"
 * to avoid false positives
 */
export function extractPlayersFromNarrative(
  narrative: string,
  knownNames: Set<string>
): string[] {
  const found: string[] = []
  const normalized = narrative.toLowerCase()

  // Check if any known player names appear in the narrative
  for (const name of knownNames) {
    if (normalized.includes(name)) {
      // Find the original case version in the text
      const regex = new RegExp(name.replace(/\s+/g, '\\s+'), 'gi')
      const match = narrative.match(regex)
      if (match) {
        found.push(match[0])
      }
    }
  }

  // Also extract capitalized name patterns that look like player names
  // Pattern: Two capitalized words in sequence (FirstName LastName)
  const namePattern = /\b([A-Z][a-z]+)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g
  let match
  while ((match = namePattern.exec(narrative)) !== null) {
    const potentialName = match[0]
    // Skip common non-name phrases
    const skipPhrases = ['Game Total', 'Player Props', 'Point Spread', 'Over Under', 'New England', 'San Francisco', 'Los Angeles', 'Kansas City', 'New Orleans', 'Tampa Bay', 'Green Bay', 'Las Vegas']
    if (!skipPhrases.some(skip => potentialName.includes(skip))) {
      found.push(potentialName)
    }
  }

  return [...new Set(found)] // Dedupe
}

/**
 * Main extraction function
 * Structural-first, narrative-secondary
 */
export function extractPlayers(
  scripts: Array<{
    title?: string
    narrative?: string
    legs?: Array<{
      market?: string
      selection?: string
      player?: string
    }>
  }>,
  knownAliases: Set<string>
): string[] {
  const allPlayers: string[] = []

  for (const script of scripts) {
    // 1. Structural extraction (high confidence)
    const structuralPlayers = extractPlayersFromStructure(script)
    allPlayers.push(...structuralPlayers)

    // 2. Narrative extraction (conservative, secondary)
    if (script.narrative) {
      const narrativePlayers = extractPlayersFromNarrative(script.narrative, knownAliases)
      allPlayers.push(...narrativePlayers)
    }

    if (script.title) {
      const titlePlayers = extractPlayersFromNarrative(script.title, knownAliases)
      allPlayers.push(...titlePlayers)
    }
  }

  // Dedupe
  return [...new Set(allPlayers)]
}

/**
 * Validate extracted players against allowed roster
 */
export function validatePlayers(
  extractedPlayers: string[],
  allowedRoster: AllowedRoster
): ValidationResult {
  const matched: string[] = []
  const invalid: string[] = []

  for (const player of extractedPlayers) {
    const normalized = normalizeName(player)
    if (allowedRoster.aliasSet.has(normalized)) {
      matched.push(player)
    } else {
      invalid.push(player)
    }
  }

  return {
    valid: invalid.length === 0,
    matched,
    invalid,
    forbidden_list: invalid.length > 0
      ? invalid.map(p => `"${p}"`).join(', ')
      : '',
  }
}

/**
 * Format allowed players for prompt injection
 */
export function formatAllowedPlayersForPrompt(roster: AllowedRoster, homeTeam: string, awayTeam: string): string {
  const formatTeam = (players: Player[], team: string): string => {
    if (players.length === 0) return `${team}: No players available`

    const byPosition: Record<string, string[]> = {}
    for (const p of players) {
      const pos = p.pos || 'OTHER'
      if (!byPosition[pos]) byPosition[pos] = []
      byPosition[pos].push(p.name)
    }

    const lines: string[] = []
    for (const pos of ['QB', 'RB', 'WR', 'TE']) {
      if (byPosition[pos] && byPosition[pos].length > 0) {
        lines.push(`  ${pos}: ${byPosition[pos].slice(0, 8).join(', ')}`)
      }
    }

    return `${team.toUpperCase()}:\n${lines.join('\n')}`
  }

  return `## Allowed Players for This Matchup

${formatTeam(roster.away, awayTeam)}

${formatTeam(roster.home, homeTeam)}

CRITICAL: You MUST ONLY use player names from this list. Do NOT invent or guess player names. If unsure, use game-level props (spread, total) instead of player props.`
}

/**
 * Build retry prompt for regeneration
 */
export function buildRetryPrompt(invalidPlayers: string[]): string {
  const forbidden = invalidPlayers.map(p => `"${p}"`).join(', ')
  return `Invalid players detected: ${forbidden}. You MUST regenerate and use only Allowed Players; do not mention the invalid names.`
}
