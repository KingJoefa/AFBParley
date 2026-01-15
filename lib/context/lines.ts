/**
 * Lines Context Builder
 * Builds lines context block with strict provenance (source, timestamp, TTL status)
 */

import { fetchDirectLines, DirectLine } from '@/lib/lines/client'
import {
  LinesContext,
  ContextStatus,
  FRESH_TTL_MIN,
  STALE_TTL_MIN,
} from './types'

/**
 * Determine the freshness status based on age
 */
function getStatus(ageMin: number, hasData: boolean): ContextStatus {
  if (!hasData) return 'UNAVAILABLE'
  if (ageMin < FRESH_TTL_MIN) return 'FRESH'
  if (ageMin < STALE_TTL_MIN) return 'STALE'
  return 'UNAVAILABLE'
}

/**
 * Build a lines context block from fetched lines data
 */
export function buildLinesContext(
  lines: DirectLine | null,
  fetchedAtMs: number
): LinesContext {
  const nowMs = Date.now()
  const ageMin = Math.floor((nowMs - fetchedAtMs) / 60000)
  const hasData = lines !== null && (
    lines.total !== undefined ||
    lines.spreadHome !== undefined ||
    lines.spreadAway !== undefined
  )

  const status = getStatus(ageMin, hasData)

  return {
    type: 'lines',
    source: lines?.source ?? 'unknown',
    ts: Math.floor(fetchedAtMs / 1000), // Convert to Unix seconds
    age_min: ageMin,
    status,
    data: status === 'UNAVAILABLE' ? null : {
      total: lines?.total,
      spread_home: lines?.spreadHome,
      spread_away: lines?.spreadAway,
      ml_home: undefined, // TODO: Add when available in DirectLine
      ml_away: undefined,
    },
  }
}

/**
 * Fetch lines and build context in one call
 */
export async function fetchLinesContext(params: {
  year: number
  week: number
  matchup: string
}): Promise<{ context: LinesContext; fetchedAtMs: number }> {
  const fetchedAtMs = Date.now()

  try {
    const lines = await fetchDirectLines(params)

    // If lines have their own timestamp, use it; otherwise use fetch time
    const dataTimestamp = lines?.timestamp
      ? lines.timestamp * 1000 // Convert from Unix seconds to ms
      : fetchedAtMs

    return {
      context: buildLinesContext(lines, dataTimestamp),
      fetchedAtMs: dataTimestamp,
    }
  } catch (error) {
    // On error, return UNAVAILABLE context
    return {
      context: buildLinesContext(null, fetchedAtMs),
      fetchedAtMs,
    }
  }
}

/**
 * Cache for lines to avoid repeated fetches within TTL
 */
const linesCache = new Map<string, { context: LinesContext; expiresAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getCacheKey(params: { year: number; week: number; matchup: string }): string {
  return `${params.year}:${params.week}:${params.matchup}`
}

/**
 * Fetch lines with caching (re-fetches after 5 min)
 * Note: Cache only prevents redundant fetches; TTL status still reflects data age
 */
export async function fetchLinesContextCached(params: {
  year: number
  week: number
  matchup: string
}): Promise<LinesContext> {
  const key = getCacheKey(params)
  const cached = linesCache.get(key)

  if (cached && cached.expiresAt > Date.now()) {
    // Recalculate age_min and status since time has passed
    const nowMs = Date.now()
    const ageMin = Math.floor((nowMs - cached.context.ts * 1000) / 60000)
    const hasData = cached.context.data !== null

    return {
      ...cached.context,
      age_min: ageMin,
      status: getStatus(ageMin, hasData),
    }
  }

  const { context } = await fetchLinesContext(params)
  linesCache.set(key, {
    context,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })

  return context
}

/**
 * Clear lines cache (useful for testing)
 */
export function clearLinesCache(): void {
  linesCache.clear()
}
