/**
 * Props-Based Roster Source
 *
 * Uses sportsbook props as the source of truth for "who is active."
 * If a player has a posted line, they're eligible for player props.
 *
 * Fallback chain:
 *   1. The Odds API (primary - live sportsbook lines)
 *   2. Projections - Injuries (if API fails or < MIN_PLAYERS)
 *   3. Game-only mode (if both fail)
 */

import fs from 'fs'
import path from 'path'
import { createLogger } from '@/lib/logger'
import {
  getOddsProvider,
  isOddsProviderConfigured,
  type PropLine as OddsProviderPropLine,
  type FetchResult,
  type GameLines,
} from '@/lib/odds-provider'

const log = createLogger('PropsRoster')
import { TheOddsApiProvider } from '@/lib/odds-provider/the-odds-api'
import { normalizeName as oddsNormalizeName } from '@/lib/odds-provider'
import { loadMatchupProjections, getCurrentWeekYear } from './projections-loader'
import { fetchInjuriesContext } from '@/lib/context/injuries'
import { normalizeName, buildAliasSet, type Player } from './roster-validator'

// Minimum players required before falling back
const MIN_PLAYERS_THRESHOLD = 6

export type RosterSource = 'xo_props' | 'fallback_projections' | 'none'

export interface RosterOverrides {
  add?: string[]     // Players to add (e.g., "Jarrett Stidham")
  remove?: string[]  // Players to remove (e.g., "Bo Nix")
}

// Legacy PropLine format for Build route compatibility
export interface PropLine {
  player: string
  team: string
  market: string      // e.g., "player_rush_yds", "player_pass_yds"
  line: number        // e.g., 51.5
  selection: string   // e.g., "over", "under"
  americanOdds?: number
}

// Live game lines from sportsbook
export interface LiveGameLines {
  total?: number        // 43.5
  spread?: {
    favorite: string    // 'NE'
    line: number        // 3.5
  }
  bookmaker: string
  lastUpdate?: string
}

// Odds provider telemetry
export interface OddsTelemetry {
  source: string              // 'the-odds-api' | 'xo-fallback' | 'none'
  cacheStatus: string         // 'HIT' | 'MISS' | 'STALE_FALLBACK' | 'ERROR'
  fetchedAt: string
  creditsSpent: number
  bookmaker: string
  propLinesCount: number
  playersWithLines: number
  incompleteLineCount: number
  unresolvedTeamCount: number
  gameLines?: LiveGameLines   // Live game-level lines (spreads, totals)
}

export interface PropsRosterResult {
  source: RosterSource
  players: Player[]
  aliasSet: Set<string>
  player_props_enabled: boolean
  propLines: PropLine[]  // Legacy format for Build
  odds: OddsTelemetry    // New: detailed telemetry
  debug: {
    xo_players_found: number  // Deprecated, use odds.playersWithLines
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
 */
function mergeOverrides(
  defaults: RosterOverrides,
  request?: RosterOverrides
): RosterOverrides {
  if (!request) return defaults

  const add = [...new Set([...(defaults.add || []), ...(request.add || [])])]
  const remove = [...new Set([...(defaults.remove || []), ...(request.remove || [])])]

  return { add, remove }
}

/**
 * Apply overrides to player list
 */
function applyOverrides(
  players: Player[],
  overrides: RosterOverrides,
  teamCodes: string[]
): { players: Player[]; applied: { added: string[]; removed: string[] } } {
  const result = [...players]
  const applied = { added: [] as string[], removed: [] as string[] }

  // Remove players
  if (overrides.remove && overrides.remove.length > 0) {
    const removeSet = new Set(overrides.remove.map(normalizeName))
    const filtered = result.filter(p => !removeSet.has(normalizeName(p.name)))
    applied.removed = overrides.remove.filter(name =>
      result.some(p => normalizeName(p.name) === normalizeName(name))
    )
    result.length = 0
    result.push(...filtered)
  }

  // Add players
  if (overrides.add && overrides.add.length > 0) {
    for (const rawName of overrides.add) {
      const displayName = rawName.trim().replace(/\s+/g, ' ')
      const normalized = normalizeName(displayName)
      const exists = result.some(p => normalizeName(p.name) === normalized)
      if (!exists) {
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
 * Adapt new OddsProvider PropLine to legacy format
 * TODO: Migrate Build to consume new format directly
 */
function adaptToLegacyPropLines(props: OddsProviderPropLine[]): PropLine[] {
  const legacyLines: PropLine[] = []

  for (const p of props) {
    for (const outcome of p.outcomes) {
      legacyLines.push({
        player: p.player,
        team: p.team || 'UNK',
        market: p.market,
        line: outcome.point || 0,
        selection: outcome.name.toLowerCase(),
        americanOdds: outcome.price,
      })
    }
  }

  return legacyLines
}

/**
 * Load prop lines AND game lines from The Odds API (primary)
 */
async function loadPropLines(
  homeTeam: string,
  awayTeam: string,
  roster: Map<string, string>  // normalized name -> team code
): Promise<{
  propLines: PropLine[]
  odds: OddsTelemetry
}> {
  const emptyOdds: OddsTelemetry = {
    source: 'none',
    cacheStatus: 'ERROR',
    fetchedAt: new Date().toISOString(),
    creditsSpent: 0,
    bookmaker: '',
    propLinesCount: 0,
    playersWithLines: 0,
    incompleteLineCount: 0,
    unresolvedTeamCount: 0,
  }

  // Check if odds provider is configured
  if (!isOddsProviderConfigured() && process.env.ODDS_FALLBACK_XO !== 'true') {
    log.warn('No odds provider configured')
    return { propLines: [], odds: emptyOdds }
  }

  try {
    const provider = getOddsProvider()

    // Find event by teams
    const eventId = await provider.findEventByTeams(homeTeam, awayTeam)
    if (!eventId) {
      log.warn('No event found for matchup')
      return {
        propLines: [],
        odds: {
          ...emptyOdds,
          source: 'the-odds-api',
        },
      }
    }

    // Fetch props with roster for team resolution
    const result = await provider.fetchEventProps(eventId, undefined, roster)

    // Also fetch game lines (spreads, totals) - separate call
    let liveGameLines: LiveGameLines | undefined
    if (provider instanceof TheOddsApiProvider) {
      const gameLines = await provider.fetchGameLines(eventId)
      if (gameLines) {
        liveGameLines = {
          total: gameLines.total?.line,
          spread: gameLines.spread ? {
            favorite: gameLines.spread.favorite,
            line: gameLines.spread.line,
          } : undefined,
          bookmaker: gameLines.bookmaker,
          lastUpdate: gameLines.lastUpdate,
        }
      }
    }

    if (!result.data || result.cacheStatus === 'ERROR') {
      return {
        propLines: [],
        odds: {
          source: result.source,
          cacheStatus: result.cacheStatus,
          fetchedAt: result.fetchedAt,
          creditsSpent: result.creditsSpent,
          bookmaker: result.bookmaker,
          propLinesCount: 0,
          playersWithLines: 0,
          incompleteLineCount: result.incompleteLineCount || 0,
          unresolvedTeamCount: result.unresolvedTeamCount || 0,
          gameLines: liveGameLines,
        },
      }
    }

    // Convert to legacy format
    const propLines = adaptToLegacyPropLines(result.data.props)

    // Count unique players
    const uniquePlayers = new Set(propLines.map(p => oddsNormalizeName(p.player)))

    return {
      propLines,
      odds: {
        source: result.source,
        cacheStatus: result.cacheStatus,
        fetchedAt: result.fetchedAt,
        creditsSpent: result.creditsSpent,
        bookmaker: result.bookmaker,
        propLinesCount: propLines.length,
        playersWithLines: uniquePlayers.size,
        incompleteLineCount: result.incompleteLineCount || 0,
        unresolvedTeamCount: result.unresolvedTeamCount || 0,
        gameLines: liveGameLines,
      },
    }
  } catch (err) {
    log.error('Odds provider error', err)
    return {
      propLines: [],
      odds: {
        ...emptyOdds,
        source: 'error',
      },
    }
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
  const projections = await loadMatchupProjections(homeTeam, awayTeam)

  if (projections.length === 0) {
    return { players: [], injuriesFiltered: 0 }
  }

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
      log.debug('Filtered injured players', { count: injuriesFiltered })
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
    'chiefs': 'KC', 'kansas city': 'KC', 'kc': 'KC',
    'ravens': 'BAL', 'baltimore': 'BAL', 'bal': 'BAL',
    'bengals': 'CIN', 'cincinnati': 'CIN', 'cin': 'CIN',
    'browns': 'CLE', 'cleveland': 'CLE', 'cle': 'CLE',
    'steelers': 'PIT', 'pittsburgh': 'PIT', 'pit': 'PIT',
    'colts': 'IND', 'indianapolis': 'IND', 'ind': 'IND',
    'jaguars': 'JAX', 'jacksonville': 'JAX', 'jax': 'JAX',
    'titans': 'TEN', 'tennessee': 'TEN', 'ten': 'TEN',
    'raiders': 'LV', 'las vegas': 'LV', 'lv': 'LV',
    'chargers': 'LAC', 'lac': 'LAC',
    'cowboys': 'DAL', 'dallas': 'DAL', 'dal': 'DAL',
    'giants': 'NYG', 'nyg': 'NYG',
    'eagles': 'PHI', 'philadelphia': 'PHI', 'phi': 'PHI',
    'commanders': 'WAS', 'washington': 'WAS', 'was': 'WAS',
    'lions': 'DET', 'detroit': 'DET', 'det': 'DET',
    'packers': 'GB', 'green bay': 'GB', 'gb': 'GB',
    'vikings': 'MIN', 'minnesota': 'MIN', 'min': 'MIN',
    'falcons': 'ATL', 'atlanta': 'ATL', 'atl': 'ATL',
    'panthers': 'CAR', 'carolina': 'CAR', 'car': 'CAR',
    'saints': 'NO', 'new orleans': 'NO', 'no': 'NO',
    'buccaneers': 'TB', 'tampa bay': 'TB', 'tb': 'TB', 'bucs': 'TB',
    'cardinals': 'ARI', 'arizona': 'ARI', 'ari': 'ARI',
    'dolphins': 'MIA', 'miami': 'MIA', 'mia': 'MIA',
    'jets': 'NYJ', 'nyj': 'NYJ',
  }

  const codes: string[] = []
  const lower = matchup.toLowerCase()

  for (const [key, code] of Object.entries(teamMap)) {
    if (lower.includes(key) && !codes.includes(code)) {
      codes.push(code)
    }
  }

  return codes.slice(0, 2)
}

/**
 * Main function: Build allowed roster from props, with fallbacks
 */
export async function buildPropsRoster(
  matchup: string,
  requestOverrides?: RosterOverrides
): Promise<PropsRosterResult> {
  const { week, year } = await getCurrentWeekYear()
  const teamCodes = parseTeamCodes(matchup)
  const homeTeam = teamCodes[1] || teamCodes[0] || 'UNK'
  const awayTeam = teamCodes[0] || 'UNK'

  // Merge overrides
  const defaultOverrides = loadDefaultOverrides()
  const overrides = mergeOverrides(defaultOverrides, requestOverrides)

  // Build roster map for team resolution (normalized name -> team)
  const projResult = await loadFromProjections(homeTeam, awayTeam, week)
  const rosterMap = new Map<string, string>()
  for (const p of projResult.players) {
    rosterMap.set(oddsNormalizeName(p.name), p.team)
  }

  // Load prop lines from odds provider
  const { propLines, odds } = await loadPropLines(homeTeam, awayTeam, rosterMap)

  // Determine roster source and players
  let source: RosterSource = 'none'
  let players: Player[] = []

  if (propLines.length >= MIN_PLAYERS_THRESHOLD && odds.cacheStatus !== 'ERROR') {
    source = 'xo_props'  // Keep naming for compatibility, actual source in odds.source
    // Extract unique players from prop lines
    const playerMap = new Map<string, Player>()
    for (const pl of propLines) {
      const key = oddsNormalizeName(pl.player)
      if (!playerMap.has(key)) {
        playerMap.set(key, {
          name: pl.player,
          team: pl.team,
          pos: 'UNK',
        })
      }
    }
    players = Array.from(playerMap.values())
  } else if (projResult.players.length >= MIN_PLAYERS_THRESHOLD) {
    source = 'fallback_projections'
    players = projResult.players
  }

  // Apply overrides
  const { players: finalPlayers, applied } = applyOverrides(players, overrides, teamCodes)
  const aliasSet = buildAliasSet(finalPlayers)

  // Telemetry (debug only - aggregate counts, no user data)
  log.debug('Roster source telemetry', {
    source,
    oddsSource: odds.source,
    cacheStatus: odds.cacheStatus,
    playerCount: finalPlayers.length,
    propLinesCount: odds.propLinesCount,
  })

  return {
    source,
    players: finalPlayers,
    aliasSet,
    player_props_enabled: source !== 'none' && finalPlayers.length >= MIN_PLAYERS_THRESHOLD,
    propLines: odds.cacheStatus !== 'ERROR' ? propLines : [], // Never return lines on ERROR
    odds,
    debug: {
      xo_players_found: odds.playersWithLines,  // Repurposed
      projections_players: projResult.players.length,
      injuries_filtered: projResult.injuriesFiltered,
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

  return `## Allowed Players for This Matchup (Source: ${result.odds.source})

${formatTeam(awayTeam)}

${formatTeam(homeTeam)}

CRITICAL: You MUST ONLY use player names from this list for player props. If a player is not listed, use game-level markets instead. Do NOT invent or guess player names.`
}
