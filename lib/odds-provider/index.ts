/**
 * Odds Provider Factory
 *
 * Returns configured OddsProvider instance using The Odds API.
 */

import { TheOddsApiProvider } from './the-odds-api'
import type { OddsProvider, BookSelectionStrategy } from './types'
import { DEFAULT_BOOK_STRATEGY } from './types'

export * from './types'
export { normalizeTeamCode, normalizePlayerName, normalizeName } from './normalize'
export { getCacheStats, clearMemoryCache } from './cache'

interface ProviderConfig {
  apiKey?: string
  bookStrategy?: BookSelectionStrategy
}

/**
 * Get configured OddsProvider
 *
 * @throws Error if no API key configured
 */
export function getOddsProvider(config?: ProviderConfig): OddsProvider {
  const apiKey = config?.apiKey || process.env.THE_ODDS_API_KEY
  const bookStrategy = config?.bookStrategy || DEFAULT_BOOK_STRATEGY

  if (!apiKey) {
    throw new Error(
      '[odds-provider] THE_ODDS_API_KEY not configured. ' +
        'Add THE_ODDS_API_KEY to environment variables.'
    )
  }

  return new TheOddsApiProvider(apiKey, bookStrategy)
}

/**
 * Check if provider is properly configured
 */
export function isOddsProviderConfigured(): boolean {
  return !!process.env.THE_ODDS_API_KEY
}
