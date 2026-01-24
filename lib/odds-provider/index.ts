/**
 * Odds Provider Factory
 *
 * Returns configured OddsProvider instance.
 * Priority: TheOddsApiProvider (required) > XoFallbackProvider (emergency only)
 */

import { TheOddsApiProvider } from './the-odds-api'
import { XoFallbackProvider } from './xo-fallback'
import type { OddsProvider, BookSelectionStrategy } from './types'
import { DEFAULT_BOOK_STRATEGY } from './types'

export * from './types'
export { normalizeTeamCode, normalizePlayerName, normalizeName } from './normalize'
export { getCacheStats, clearMemoryCache } from './cache'

interface ProviderConfig {
  apiKey?: string
  bookStrategy?: BookSelectionStrategy
  enableXoFallback?: boolean // Default: false
}

/**
 * Get configured OddsProvider
 *
 * @throws Error if no API key and XO fallback disabled
 */
export function getOddsProvider(config?: ProviderConfig): OddsProvider {
  const apiKey = config?.apiKey || process.env.THE_ODDS_API_KEY
  const bookStrategy = config?.bookStrategy || DEFAULT_BOOK_STRATEGY
  const enableXoFallback =
    config?.enableXoFallback ?? process.env.ODDS_FALLBACK_XO === 'true'

  if (!apiKey) {
    if (enableXoFallback) {
      console.warn('[odds-provider] No API key, using XO fallback (emergency mode)')
      return new XoFallbackProvider()
    }
    throw new Error(
      '[odds-provider] THE_ODDS_API_KEY not configured. ' +
        'Set env var or enable ODDS_FALLBACK_XO=true for emergency fallback.'
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

/**
 * Check if XO fallback is enabled
 */
export function isXoFallbackEnabled(): boolean {
  return process.env.ODDS_FALLBACK_XO === 'true'
}
