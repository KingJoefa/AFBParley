/**
 * XO Fallback Provider
 *
 * EMERGENCY USE ONLY - disabled by default.
 * Only enabled via ODDS_FALLBACK_XO=true env var.
 *
 * Limitations:
 * - Community-driven, incomplete coverage (especially playoffs)
 * - No SLA or reliability guarantees
 * - May return stale or missing data
 */

import type { OddsProvider, FetchResult, EventProps, PropLine } from './types'
import { findCombosForMatchup } from '@/lib/xo/client'
import { normalizePlayerName, normalizeName } from './normalize'

export class XoFallbackProvider implements OddsProvider {
  async findEventByTeams(homeTeam: string, awayTeam: string): Promise<string | null> {
    // XO doesn't have event IDs, return matchup string as pseudo-ID
    return `${awayTeam}@${homeTeam}`
  }

  async fetchEventProps(
    eventId: string, // Actually "AWAY@HOME" matchup string
    markets: string[] = []
  ): Promise<FetchResult> {
    console.warn('[xo-fallback] Using XO fallback - data may be incomplete')

    try {
      const { week, year } = this.getCurrentWeekYear()
      const combos = await findCombosForMatchup({
        year,
        week,
        matchup: eventId,
      })

      if (combos.length === 0) {
        return {
          data: null,
          cacheStatus: 'ERROR',
          fetchedAt: new Date().toISOString(),
          creditsSpent: 0,
          source: 'xo-fallback',
          bookmaker: 'unknown',
        }
      }

      const props = this.extractProps(combos)
      const [awayTeam, homeTeam] = eventId.split('@')

      return {
        data: {
          eventId,
          homeTeam: homeTeam || 'UNK',
          awayTeam: awayTeam || 'UNK',
          commenceTime: '',
          props,
        },
        cacheStatus: 'MISS',
        fetchedAt: new Date().toISOString(),
        creditsSpent: 0,
        source: 'xo-fallback',
        bookmaker: combos[0]?.sourceId || 'unknown',
      }
    } catch (err) {
      console.error('[xo-fallback] Fetch failed:', err)
      return {
        data: null,
        cacheStatus: 'ERROR',
        fetchedAt: new Date().toISOString(),
        creditsSpent: 0,
        source: 'xo-fallback',
        bookmaker: '',
      }
    }
  }

  private extractProps(combos: any[]): PropLine[] {
    const propMap = new Map<string, PropLine>()

    for (const combo of combos) {
      for (const leg of combo.legs || []) {
        if (!leg.player || leg.line == null) continue

        const player = normalizePlayerName(
          `${leg.player.first || ''} ${leg.player.last || ''}`.trim()
        )
        if (!player) continue

        const market = leg.marketType || 'unknown'
        const point = leg.line
        const aggKey = `${normalizeName(player)}|${market}|${point}`

        let propLine = propMap.get(aggKey)
        if (!propLine) {
          propLine = {
            player,
            team: leg.player.team?.toUpperCase(),
            market,
            bookmaker: combo.sourceId || 'unknown',
            outcomes: [],
            priceFormat: 'american',
            raw: { market: { key: market }, outcomes: [] },
          }
          propMap.set(aggKey, propLine)
        }

        propLine.outcomes.push({
          name: leg.selectionType || 'over',
          price: combo.americanOdds || -110,
          point,
        })

        ;(propLine.raw as any).outcomes.push(leg)
      }
    }

    return Array.from(propMap.values())
  }

  private getCurrentWeekYear(): { week: number; year: number } {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()

    // Rough NFL week detection
    if (month === 0) {
      // January - playoffs
      const day = now.getDate()
      if (day <= 13) return { year: year - 1, week: 19 }
      if (day <= 20) return { year: year - 1, week: 20 }
      return { year: year - 1, week: 21 }
    }
    if (month === 1) {
      // February - Super Bowl
      return { year: year - 1, week: 22 }
    }
    if (month < 8) {
      // March-August - offseason
      return { year: year - 1, week: 22 }
    }
    // September onwards - current season
    return { year, week: Math.min(22, Math.ceil((now.getDate() + 30) / 7)) }
  }
}
