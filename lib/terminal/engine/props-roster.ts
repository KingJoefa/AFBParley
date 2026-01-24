/**
 * Props-Based Roster Source
 *
 * Uses sportsbook props as the source of truth for "who is active."
 * If a player has a posted line, they're eligible for player props.
 *
 * Fallback chain:
 *   1. XO props API (players with live lines)
 *   2. Projections - Injuries (if XO fails or < MIN_PLAYERS)
 *   3. Game-only mode (if both fail)
 */

import fs from 'fs'
import path from 'path'
import { findCombosForMatchup } from '@/lib/xo/client'
import type { XoCombo, XoLeg } from '@/lib/xo/types'
import { loadMatchupProjections, getCurrentWeekYear } from './projections-loader'
import { fetchInjuriesContext } from '@/lib/context/injuries'
import { normalizeName, buildAliasSet, type Player } from './roster-validator'

// Minimum players required from XO before falling back
const MIN_PLAYERS_THRESHOLD = 6

export type RosterSource = 'xo_props' | 'fallback_projections' | 'none'

export interface RosterOverrides {
  add?: string[]     // Players to add (e.g., "Jarrett Stidham")
  remove?: string[]  // Players to remove (e.g., "Bo Nix")
}

export interface PropLine {
  player: string
  team: string
  market: string      // e.g., "rushing_yards", "receiving_yards", "pass_yards"
  line: number        // e.g., 51.5
  selection: string   // e.g., "over", "under"
  americanOdds?: number
}

export interface PropsRosterResult {
  source: RosterSource
  players: Player[]
  aliasSet: Set<string>
  player_props_enabled: boolean
  propLines: PropLine[]  // Actual lines from XO
  debug: {
    xo_players_found: number
    projections_players: number
    injuries_filtered: number
    overrides_applied: { added: string[]; removed: string[] }
    prop_lines_extracted: number
  }
}

/**
 * Load default overrides from repo JSON file
 */
function loadDefaultOverrides(): RosterOverrides {
  try {
    const file = path.join(process.cwd(), 'my-parlaygpt', 'data', 'roster-overrides.json')
    if (!fs.existsSync(file)) return {}
    const raw = fs.readFileSync(file, 'utf8')
    const data = JSON.parse(raw)
    return {
      add: Array.isArray(data.add) ? data.add : [],
      remove: Array.isArray(data.remove) ? data.remove : [],
    }
  } catch {
    return {}
  }
}

/**
 * Merge request overrides with defaults
 * Request overrides take precedence
 */
function mergeOverrides(
  defaults: RosterOverrides,
  request?: RosterOverrides
): RosterOverrides {
  if (!request) return defaults

  // Request is authoritative - union adds, union removes
  const add = [...new Set([...(defaults.add || []), ...(request.add || [])])]
  const remove = [...new Set([...(defaults.remove || []), ...(request.remove || [])])]

  return { add, remove }
}

/**
 * Normalize player name for consistent storage
 * Trims, collapses spaces, title cases
 */
function normalizePlayerName(first?: string, last?: string): string {
  const raw = [first, last].filter(Boolean).join(' ')
  // Trim, collapse spaces, preserve original casing (don't force title case to keep "CJ" etc.)
  return raw.trim().replace(/\s+/g, ' ')
}

/**
 * Extract unique players from XO combos
 * Normalizes names at extraction time for consistent validation
 */
function extractPlayersFromCombos(combos: XoCombo[]): Player[] {
  const playerMap = new Map<string, Player>()

  for (const combo of combos) {
    for (const leg of combo.legs) {
      if (!leg.player) continue

      const { first, last, team, position } = leg.player
      if (!first && !last) continue

      // Normalize at extraction time
      const name = normalizePlayerName(first, last)
      const key = normalizeName(name)

      if (!playerMap.has(key)) {
        playerMap.set(key, {
          name,
          team: team?.toUpperCase() || 'UNK',
          pos: position?.toUpperCase() || 'UNK',
        })
      }
    }
  }

  return Array.from(playerMap.values())
}

/**
 * Extract prop lines from XO combos
 * Returns deduplicated lines per player/market/selection
 */
function extractPropLinesFromCombos(combos: XoCombo[]): PropLine[] {
  const lineMap = new Map<string, PropLine>()

  for (const combo of combos) {
    for (const leg of combo.legs) {
      if (!leg.player || leg.line === null || leg.line === undefined) continue

      const { first, last, team } = leg.player
      if (!first && !last) continue

      const playerName = normalizePlayerName(first, last)
      const market = leg.marketType || 'unknown'
      const selection = leg.selectionType || 'over'

      // Create unique key for deduplication
      const key = `${normalizeName(playerName)}|${market}|${selection}|${leg.line}`

      if (!lineMap.has(key)) {
        lineMap.set(key, {
          player: playerName,
          team: team?.toUpperCase() || 'UNK',
          market,
          line: leg.line,
          selection,
          americanOdds: combo.americanOdds,
        })
      }
    }
  }

  return Array.from(lineMap.values())
}

/**
 * Apply overrides to player list
 * Normalizes override names at application time for consistent matching
 */
function applyOverrides(
  players: Player[],
  overrides: RosterOverrides,
  teamCodes: string[]
): { players: Player[]; applied: { added: string[]; removed: string[] } } {
  const result = [...players]
  const applied = { added: [] as string[], removed: [] as string[] }

  // Remove players (normalize for matching)
  if (overrides.remove && overrides.remove.length > 0) {
    const removeSet = new Set(overrides.remove.map(normalizeName))
    const filtered = result.filter(p => !removeSet.has(normalizeName(p.name)))
    applied.removed = overrides.remove.filter(name =>
      result.some(p => normalizeName(p.name) === normalizeName(name))
    )
    result.length = 0
    result.push(...filtered)
  }

  // Add players (normalize storage, preserve display name)
  if (overrides.add && overrides.add.length > 0) {
    for (const rawName of overrides.add) {
      const displayName = rawName.trim().replace(/\s+/g, ' ') // Normalize whitespace
      const normalized = normalizeName(displayName)
      const exists = result.some(p => normalizeName(p.name) === normalized)
      if (!exists) {
        // Infer team from the matchup if possible (first team code as default)
        result.push({
          name: displayName,
          team: teamCodes[0] || 'UNK',
          pos: 'UNK',
        })
        applied.added.push(displayName)
      }
    }
  }

  return { players: result, applied }
}

/**
 * Load players and prop lines from XO props API
 */
async function loadFromXO(
  matchup: string,
  year: number,
  week: number
): Promise<{ players: Player[]; propLines: PropLine[] }> {
  try {
    const combos = await findCombosForMatchup({ year, week, matchup })
    console.log(`[PropsRoster] XO returned ${combos.length} combos for ${matchup}`)
    const players = extractPlayersFromCombos(combos)
    const propLines = extractPropLinesFromCombos(combos)
    console.log(`[PropsRoster] Extracted ${propLines.length} prop lines`)
    return { players, propLines }
  } catch (e) {
    console.warn(`[PropsRoster] XO fetch failed: ${(e as Error).message}`)
    return { players: [], propLines: [] }
  }
}

/**
 * Load players from projections minus injuries
 */
async function loadFromProjections(
  homeTeam: string,
  awayTeam: string,
  week: number
): Promise<{ players: Player[]; injuriesFiltered: number }> {
  // Load projections
  const projections = await loadMatchupProjections(homeTeam, awayTeam)

  if (projections.length === 0) {
    return { players: [], injuriesFiltered: 0 }
  }

  // Load injuries and filter OUT/DOUBTFUL
  let injuriesFiltered = 0
  try {
    const injuries = await fetchInjuriesContext({
      week,
      teamCodes: [homeTeam, awayTeam],
    })

    if (injuries && injuries.data.length > 0) {
      const outPlayers = new Set(
        injuries.data
          .filter(i => i.status === 'OUT' || i.status === 'DOUBTFUL')
          .map(i => normalizeName(i.player))
      )

      const filtered = projections.filter(p => !outPlayers.has(normalizeName(p.name)))
      injuriesFiltered = projections.length - filtered.length
      console.log(`[PropsRoster] Filtered ${injuriesFiltered} injured players`)
      return { players: filtered, injuriesFiltered }
    }
  } catch {
    // Injuries unavailable, continue with full projections
  }

  return { players: projections, injuriesFiltered: 0 }
}

/**
 * Parse matchup to extract team codes
 */
function parseTeamCodes(matchup: string): string[] {
  const teamMap: Record<string, string> = {
    'patriots': 'NE', 'new england': 'NE', 'ne': 'NE',
    'texans': 'HOU', 'houston': 'HOU', 'hou': 'HOU',
    'broncos': 'DEN', 'denver': 'DEN', 'den': 'DEN',
    'bills': 'BUF', 'buffalo': 'BUF', 'buf': 'BUF',
    '49ers': 'SF', 'niners': 'SF', 'san francisco': 'SF', 'sf': 'SF',
    'seahawks': 'SEA', 'seattle': 'SEA', 'sea': 'SEA',
    'rams': 'LA', 'los angeles rams': 'LA', 'la': 'LA', 'lar': 'LA',
    'bears': 'CHI', 'chicago': 'CHI', 'chi': 'CHI',
  }

  const codes: string[] = []
  const lower = matchup.toLowerCase()

  for (const [key, code] of Object.entries(teamMap)) {
    if (lower.includes(key) && !codes.includes(code)) {
      codes.push(code)
    }
  }

  return codes.slice(0, 2) // At most 2 teams
}

/**
 * Main function: Build allowed roster from props, with fallbacks
 */
export async function buildPropsRoster(
  matchup: string,
  requestOverrides?: RosterOverrides
): Promise<PropsRosterResult> {
  // Get current week/year
  const { week, year } = await getCurrentWeekYear()
  const teamCodes = parseTeamCodes(matchup)

  // Merge overrides
  const defaultOverrides = loadDefaultOverrides()
  const overrides = mergeOverrides(defaultOverrides, requestOverrides)

  // Try XO props first
  const xoResult = await loadFromXO(matchup, year, week)
  const xoCount = xoResult.players.length
  let propLines = xoResult.propLines

  let source: RosterSource = 'xo_props'
  let players: Player[] = xoResult.players
  let projectionsCount = 0
  let injuriesFiltered = 0

  // Fallback to projections if XO insufficient
  if (xoResult.players.length < MIN_PLAYERS_THRESHOLD) {
    console.log(`[PropsRoster] XO returned ${xoResult.players.length} players (< ${MIN_PLAYERS_THRESHOLD}), falling back to projections`)

    const projResult = await loadFromProjections(
      teamCodes[1] || teamCodes[0] || 'UNK', // home
      teamCodes[0] || 'UNK', // away
      week
    )
    projectionsCount = projResult.players.length
    injuriesFiltered = projResult.injuriesFiltered

    if (projResult.players.length >= MIN_PLAYERS_THRESHOLD) {
      source = 'fallback_projections'
      players = projResult.players
      propLines = [] // No prop lines from projections fallback
    } else {
      // Both sources failed - disable player props
      source = 'none'
      players = []
      propLines = []
    }
  }

  // Apply overrides
  const { players: finalPlayers, applied } = applyOverrides(players, overrides, teamCodes)

  // Build alias set for validation
  const aliasSet = buildAliasSet(finalPlayers)

  // First-class telemetry for roster source tracking
  console.log('[PropsRoster] roster_source_telemetry', {
    allowed_roster_source: source,
    player_count: finalPlayers.length,
    player_props_enabled: source !== 'none' && finalPlayers.length >= MIN_PLAYERS_THRESHOLD,
    matchup,
    xo_players_found: xoCount,
    prop_lines_extracted: propLines.length,
    projections_fallback: source === 'fallback_projections',
    overrides_add_count: applied.added.length,
    overrides_remove_count: applied.removed.length,
  })

  return {
    source,
    players: finalPlayers,
    aliasSet,
    player_props_enabled: source !== 'none' && finalPlayers.length >= MIN_PLAYERS_THRESHOLD,
    propLines,
    debug: {
      xo_players_found: xoCount,
      projections_players: projectionsCount,
      injuries_filtered: injuriesFiltered,
      overrides_applied: applied,
      prop_lines_extracted: propLines.length,
    },
  }
}

/**
 * Format roster for prompt injection
 */
export function formatPropsRosterForPrompt(
  result: PropsRosterResult,
  homeTeam: string,
  awayTeam: string
): string {
  if (!result.player_props_enabled) {
    return `## Player Props Status

Player props are DISABLED for this build due to insufficient roster data.
Generate scripts using ONLY game-level markets (spread, total, moneyline, team props).
Do NOT include any player-specific props.`
  }

  const byTeam: Record<string, Player[]> = {}
  for (const p of result.players) {
    const team = p.team || 'UNK'
    if (!byTeam[team]) byTeam[team] = []
    byTeam[team].push(p)
  }

  const formatTeam = (team: string): string => {
    const players = byTeam[team] || []
    if (players.length === 0) return `${team}: No players available`

    const byPos: Record<string, string[]> = {}
    for (const p of players) {
      const pos = p.pos || 'OTHER'
      if (!byPos[pos]) byPos[pos] = []
      byPos[pos].push(p.name)
    }

    const lines: string[] = []
    for (const pos of ['QB', 'RB', 'WR', 'TE', 'UNK']) {
      if (byPos[pos] && byPos[pos].length > 0) {
        lines.push(`  ${pos}: ${byPos[pos].slice(0, 8).join(', ')}`)
      }
    }

    return `${team}:\n${lines.join('\n')}`
  }

  return `## Allowed Players for This Matchup (Source: ${result.source})

${formatTeam(awayTeam)}

${formatTeam(homeTeam)}

CRITICAL: You MUST ONLY use player names from this list for player props. If a player is not listed, use game-level markets instead. Do NOT invent or guess player names.`
}
