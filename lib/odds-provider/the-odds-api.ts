/**
 * The Odds API Provider
 *
 * Primary provider for v1. Fetches player props from The Odds API.
 * Free tier: 500 credits/month.
 */

import type {
  OddsProvider,
  FetchResult,
  EventProps,
  PropLine,
  BookSelectionStrategy,
  GameLines,
} from './types'
import { DEFAULT_BOOK_STRATEGY, V1_MARKETS, OU_MARKETS } from './types'
import {
  normalizeTeamCode,
  normalizePlayerName,
  extractTeamFromDescription,
  normalizeName,
} from './normalize'
import { getCached, upsertCache } from './cache'
import { createLogger } from '@/lib/logger'

const log = createLogger('the-odds-api')
const API_BASE = 'https://api.the-odds-api.com/v4'
const SPORT = 'americanfootball_nfl'

interface ValidationResult {
  valid: PropLine[]
  incomplete: PropLine[]
  incompleteLineCount: number
}

export class TheOddsApiProvider implements OddsProvider {
  private apiKey: string
  private bookStrategy: BookSelectionStrategy

  constructor(apiKey: string, bookStrategy = DEFAULT_BOOK_STRATEGY) {
    this.apiKey = apiKey
    this.bookStrategy = bookStrategy
  }

  async findEventByTeams(homeTeam: string, awayTeam: string): Promise<string | null> {
    try {
      const url = `${API_BASE}/sports/${SPORT}/events?apiKey=${this.apiKey}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) {
        log.warn('Events fetch failed', { status: res.status })
        return null
      }

      const events = await res.json()
      const homeNorm = normalizeTeamCode(homeTeam)
      const awayNorm = normalizeTeamCode(awayTeam)

      for (const evt of events) {
        const evtHome = normalizeTeamCode(evt.home_team)
        const evtAway = normalizeTeamCode(evt.away_team)
        if (evtHome === homeNorm && evtAway === awayNorm) {
          return evt.id
        }
        // Also check reverse in case home/away are swapped
        if (evtHome === awayNorm && evtAway === homeNorm) {
          return evt.id
        }
      }

      log.warn('No event found for matchup')
      return null
    } catch (err) {
      log.error('findEventByTeams error', err)
      return null
    }
  }

  async fetchEventProps(
    eventId: string,
    markets: string[] = V1_MARKETS,
    roster?: Map<string, string>
  ): Promise<FetchResult> {
    const cacheKey = { provider: 'the-odds-api', eventId, markets }

    // 1. Check cache first
    const cached = await getCached(cacheKey)
    if (cached.hit && cached.fresh) {
      // Resolve teams from roster even on cache hit
      let data = cached.data!
      if (roster) {
        data = this.resolveTeamsFromRoster(data, roster)
      }
      return {
        data,
        cacheStatus: 'HIT',
        fetchedAt: cached.fetchedAt,
        creditsSpent: 0,
        source: 'the-odds-api',
        bookmaker: this.bookStrategy.preferred[0],
      }
    }

    // 2. Fetch from API
    try {
      const marketsParam = markets.join(',')
      const url =
        `${API_BASE}/sports/${SPORT}/events/${eventId}/odds?` +
        `apiKey=${this.apiKey}&regions=us&markets=${marketsParam}&oddsFormat=american`

      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) {
        throw new Error(`API ${res.status}`)
      }

      const raw = await res.json()
      let data = this.normalizeResponse(raw, eventId)

      // Resolve teams from roster
      let unresolvedTeamCount = 0
      if (roster) {
        const resolved = this.resolveTeamsFromRoster(data, roster)
        data = resolved
        unresolvedTeamCount = data.props.filter(p => !p.team).length
      }

      // Validate outcomes completeness
      const validation = this.validateOutcomes(data.props)
      data.props = validation.valid

      // 3. Upsert cache
      await upsertCache(cacheKey, data)

      return {
        data,
        cacheStatus: 'MISS',
        fetchedAt: new Date().toISOString(),
        creditsSpent: 1,
        source: 'the-odds-api',
        bookmaker: this.bookStrategy.preferred[0],
        incompleteLineCount: validation.incompleteLineCount,
        unresolvedTeamCount,
      }
    } catch (err) {
      log.error('Fetch error', err)

      // 4. Fallback to stale cache
      if (cached.data) {
        let data = cached.data
        if (roster) {
          data = this.resolveTeamsFromRoster(data, roster)
        }
        return {
          data,
          cacheStatus: 'STALE_FALLBACK',
          fetchedAt: cached.fetchedAt,
          creditsSpent: 0,
          source: 'the-odds-api',
          bookmaker: this.bookStrategy.preferred[0],
        }
      }

      // 5. Hard error - no data available
      return {
        data: null,
        cacheStatus: 'ERROR',
        fetchedAt: new Date().toISOString(),
        creditsSpent: 0,
        source: 'the-odds-api',
        bookmaker: '',
      }
    }
  }

  /**
   * Normalize API response to EventProps
   */
  private normalizeResponse(raw: any, eventId: string): EventProps {
    // Map keyed by "player|market|point" for O(1) aggregation
    const propMap = new Map<string, PropLine>()

    // Select bookmaker by preference
    const bookmakers = raw.bookmakers || []
    const selectedBook = this.bookStrategy.preferred.find(pref =>
      bookmakers.some((b: any) => b.key === pref)
    )
    const bookData = bookmakers.find((b: any) => b.key === selectedBook)

    if (!bookData) {
      return {
        eventId,
        homeTeam: normalizeTeamCode(raw.home_team),
        awayTeam: normalizeTeamCode(raw.away_team),
        commenceTime: raw.commence_time || '',
        props: [],
      }
    }

    for (const market of bookData.markets || []) {
      for (const outcome of market.outcomes || []) {
        // Parse player name from description
        const description = outcome.description || outcome.name || ''
        const player = normalizePlayerName(description)
        if (!player) continue

        const point = outcome.point ?? undefined

        // Try to extract team from description (e.g., "(NE)")
        const team = extractTeamFromDescription(description)

        // Aggregate key: player|market|point
        const aggKey = `${normalizeName(player)}|${market.key}|${point ?? ''}`

        let propLine = propMap.get(aggKey)
        if (!propLine) {
          propLine = {
            player,
            team, // May be undefined, resolved later via roster
            market: market.key,
            bookmaker: selectedBook!,
            outcomes: [],
            priceFormat: 'american',
            raw: {
              market: {
                key: market.key,
                last_update: market.last_update,
              },
              outcomes: [],
            },
          }
          propMap.set(aggKey, propLine)
        }

        // Add this outcome (Over, Under, Yes, etc.)
        propLine.outcomes.push({
          name: outcome.name,
          price: outcome.price,
          point: point,
        })

        // Preserve raw outcome for debugging
        ;(propLine.raw as any).outcomes.push(outcome)
      }
    }

    return {
      eventId,
      homeTeam: normalizeTeamCode(raw.home_team),
      awayTeam: normalizeTeamCode(raw.away_team),
      commenceTime: raw.commence_time || '',
      props: Array.from(propMap.values()),
    }
  }

  /**
   * Resolve missing team attributions using roster lookup
   */
  private resolveTeamsFromRoster(
    eventProps: EventProps,
    roster: Map<string, string>
  ): EventProps {
    let unresolvedCount = 0

    for (const prop of eventProps.props) {
      if (!prop.team) {
        const normalizedKey = normalizeName(prop.player)
        const resolvedTeam = roster.get(normalizedKey)
        if (resolvedTeam) {
          prop.team = resolvedTeam
        } else {
          unresolvedCount++
        }
      }
    }

    if (unresolvedCount > 0) {
      log.warn('Unresolved team count', { count: unresolvedCount })
    }

    return eventProps
  }

  /**
   * Fetch game-level lines (spreads, totals) for an event
   * Separate call to not mix with player props caching
   */
  async fetchGameLines(eventId: string): Promise<GameLines | null> {
    try {
      const url =
        `${API_BASE}/sports/${SPORT}/events/${eventId}/odds?` +
        `apiKey=${this.apiKey}&regions=us&markets=spreads,totals&oddsFormat=american`

      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) {
        log.warn('Game lines fetch failed', { status: res.status })
        return null
      }

      const raw = await res.json()

      // Select bookmaker by preference
      const bookmakers = raw.bookmakers || []
      const selectedBook = this.bookStrategy.preferred.find(pref =>
        bookmakers.some((b: any) => b.key === pref)
      )
      const bookData = bookmakers.find((b: any) => b.key === selectedBook)

      if (!bookData) {
        log.warn('No preferred bookmaker for game lines')
        return null
      }

      const gameLines: GameLines = {
        bookmaker: selectedBook!,
        lastUpdate: bookData.last_update,
      }

      for (const market of bookData.markets || []) {
        if (market.key === 'totals') {
          const over = market.outcomes.find((o: any) => o.name === 'Over')
          const under = market.outcomes.find((o: any) => o.name === 'Under')
          if (over && under) {
            gameLines.total = {
              line: over.point,
              overPrice: over.price,
              underPrice: under.price,
            }
          }
        }

        if (market.key === 'spreads') {
          const outcomes = market.outcomes || []
          // Find which team is favored (negative spread)
          const fav = outcomes.find((o: any) => o.point < 0)
          const dog = outcomes.find((o: any) => o.point > 0)
          if (fav && dog) {
            const homeTeam = normalizeTeamCode(raw.home_team)
            const favTeam = normalizeTeamCode(fav.name)
            gameLines.spread = {
              favorite: favTeam,
              line: Math.abs(fav.point),
              homePrice: fav.name.includes(raw.home_team) ? fav.price : dog.price,
              awayPrice: fav.name.includes(raw.home_team) ? dog.price : fav.price,
            }
          }
        }
      }

      log.debug('Game lines fetched', { total: gameLines.total?.line, spread: gameLines.spread?.line })

      return gameLines
    } catch (err) {
      log.error('fetchGameLines error', err)
      return null
    }
  }

  /**
   * Validate that O/U markets have both sides
   */
  private validateOutcomes(props: PropLine[]): ValidationResult {
    const valid: PropLine[] = []
    const incomplete: PropLine[] = []

    for (const prop of props) {
      if (OU_MARKETS.includes(prop.market)) {
        // Check for both Over and Under at same point
        const points = new Set(prop.outcomes.map(o => o.point))
        let isComplete = true

        for (const point of points) {
          const atPoint = prop.outcomes.filter(o => o.point === point)
          const hasOver = atPoint.some(o => o.name.toLowerCase() === 'over')
          const hasUnder = atPoint.some(o => o.name.toLowerCase() === 'under')

          if (!hasOver || !hasUnder) {
            isComplete = false
            // Log incomplete lines at debug level (no player names in prod)
            log.debug('Incomplete line detected', { market: prop.market, hasOver, hasUnder })
          }
        }

        if (isComplete) {
          valid.push(prop)
        } else {
          incomplete.push(prop)
        }
      } else {
        // Non-O/U markets (anytime TD, etc.) - no two-sided requirement
        valid.push(prop)
      }
    }

    if (incomplete.length > 0) {
      log.warn('Incomplete lines detected', { count: incomplete.length })
    }

    return {
      valid,
      incomplete,
      incompleteLineCount: incomplete.length,
    }
  }
}
