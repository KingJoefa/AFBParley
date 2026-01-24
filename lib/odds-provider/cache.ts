/**
 * In-memory caching for odds provider
 *
 * POC implementation: Memory-only cache to save API credits within instance lifetime.
 * Cache is lost on cold starts/deploys.
 *
 * TODO: Add Supabase persistence for production:
 * - Install @supabase/supabase-js
 * - Run migration in supabase/migrations/20260124_create_odds_cache.sql
 * - Uncomment Supabase integration code
 */

import type { EventProps } from './types'

const TTL_SECONDS = 900 // 15 minutes

// In-memory cache (per-instance)
interface MemoryCacheEntry {
  data: EventProps
  fetchedAt: string
  expiresAt: number
}
const memoryCache = new Map<string, MemoryCacheEntry>()

export interface CacheKey {
  provider: string
  eventId: string
  markets: string[]
}

export interface CacheResult {
  hit: boolean
  fresh: boolean
  data: EventProps | null
  fetchedAt: string
}

/**
 * Generate deterministic cache key string
 * Sort + dedupe markets for stability
 */
function cacheKeyString(key: CacheKey): string {
  const markets = [...new Set(key.markets)].sort().join(',')
  return `${key.provider}:${key.eventId}:${markets}`
}

/**
 * Check cache (memory only for POC)
 */
export async function getCached(key: CacheKey): Promise<CacheResult> {
  const keyStr = cacheKeyString(key)
  const now = Date.now()

  const memEntry = memoryCache.get(keyStr)
  if (memEntry) {
    const fresh = now < memEntry.expiresAt
    return {
      hit: true,
      fresh,
      data: memEntry.data,
      fetchedAt: memEntry.fetchedAt,
    }
  }

  return { hit: false, fresh: false, data: null, fetchedAt: '' }
}

/**
 * Upsert to cache (memory only for POC)
 */
export async function upsertCache(key: CacheKey, data: EventProps): Promise<void> {
  const keyStr = cacheKeyString(key)
  const now = Date.now()
  const fetchedAt = new Date().toISOString()

  memoryCache.set(keyStr, {
    data,
    fetchedAt,
    expiresAt: now + TTL_SECONDS * 1000,
  })
}

/**
 * Get cache stats for monitoring
 */
export function getCacheStats(): { memoryEntries: number; oldestEntry: string | null } {
  let oldest: string | null = null
  let oldestTime = Infinity

  for (const [, entry] of memoryCache) {
    const time = new Date(entry.fetchedAt).getTime()
    if (time < oldestTime) {
      oldestTime = time
      oldest = entry.fetchedAt
    }
  }

  return {
    memoryEntries: memoryCache.size,
    oldestEntry: oldest,
  }
}

/**
 * Clear memory cache (for testing)
 */
export function clearMemoryCache(): void {
  memoryCache.clear()
}
