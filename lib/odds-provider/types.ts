/**
 * Odds Provider Types
 *
 * Core interfaces for sportsbook data integration.
 * Designed to support v1 (player props) and future expansion (full markets, multi-book).
 */

export type PriceFormat = 'american' | 'decimal'

export interface Outcome {
  name: string          // 'Over', 'Under', 'Yes', 'Aaron Jones', etc.
  price: number         // -110, +150 (format per priceFormat)
  point?: number        // 51.5 for O/U lines, undefined for TD scorer
}

export interface PropLine {
  player: string        // Normalized: 'Rhamondre Stevenson'
  team?: string         // Normalized: 'NE' (optional, resolved via roster)
  market: string        // Provider canonical: 'player_rush_yds'
  marketAlias?: string  // Optional short name: 'rush_yds'
  bookmaker: string     // 'draftkings'
  outcomes: Outcome[]   // Flexible for O/U, TD scorer, alt lines
  priceFormat: PriceFormat
  raw?: {
    market: { key: string; last_update?: string }
    outcomes: unknown[]
  }
}

/**
 * Game-level lines (spreads, totals, moneylines)
 */
export interface GameLines {
  total?: {
    line: number        // 43.5
    overPrice: number   // -110
    underPrice: number  // -110
  }
  spread?: {
    favorite: string    // 'NE'
    line: number        // 3.5 (always positive, favorite implied)
    homePrice: number   // -110
    awayPrice: number   // -110
  }
  moneyline?: {
    home: number        // -150
    away: number        // +130
  }
  bookmaker: string     // 'draftkings'
  lastUpdate?: string   // ISO timestamp
}

export interface EventProps {
  eventId: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
  props: PropLine[]
  gameLines?: GameLines  // Game-level lines (spreads, totals)
}

export interface FetchResult {
  data: EventProps | null
  cacheStatus: 'HIT' | 'MISS' | 'STALE_FALLBACK' | 'ERROR'
  fetchedAt: string
  creditsSpent: number
  source: string
  bookmaker: string
  incompleteLineCount?: number
  unresolvedTeamCount?: number
}

export interface OddsProvider {
  fetchEventProps(
    eventId: string,
    markets?: string[],
    roster?: Map<string, string>
  ): Promise<FetchResult>
  findEventByTeams(homeTeam: string, awayTeam: string): Promise<string | null>
}

export interface BookSelectionStrategy {
  preferred: string[]   // ['draftkings', 'fanduel']
  dedup: boolean        // true = one line per player/market, no double-counting
}

export const DEFAULT_BOOK_STRATEGY: BookSelectionStrategy = {
  preferred: ['draftkings', 'fanduel'],
  dedup: true,
}

// v1 markets - player props only
export const V1_MARKETS = [
  'player_rush_yds',
  'player_pass_yds',
  'player_pass_tds',
  'player_receptions',
  'player_reception_yds',
  'player_anytime_td',
]

// Markets that require both Over and Under outcomes
export const OU_MARKETS = [
  'player_rush_yds',
  'player_pass_yds',
  'player_reception_yds',
  'player_receptions',
  'player_pass_tds',
]
