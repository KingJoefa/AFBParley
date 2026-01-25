import { NextResponse } from 'next/server'
import fs from 'fs'
import { computeLinesStatus } from '@/lib/lines/status'

export const runtime = 'nodejs'

function safeNum(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Get current week/season from schedule API (auto-tracking)
 * Falls back to env vars or hardcoded defaults if schedule unavailable
 */
async function getCurrentWeekFromSchedule(baseUrl: string): Promise<{ week: number; season: number }> {
  try {
    const res = await fetch(`${baseUrl}/api/nfl/schedule`, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    })
    if (res.ok) {
      const data = await res.json()
      if (typeof data.week === 'number' && typeof data.season === 'number') {
        return { week: data.week, season: data.season }
      }
    }
  } catch {
    // Fall through to defaults
  }
  // Fallback to env vars or hardcoded defaults
  return {
    week: safeNum(process.env.NFL_WEEK) ?? 21,
    season: safeNum(process.env.NFL_YEAR) ?? 2025,
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const url = new URL(req.url)
  const baseUrl = `${url.protocol}//${url.host}`

  // Use query params if provided, otherwise auto-track from schedule
  const yearParam = safeNum(searchParams.get('year'))
  const weekParam = safeNum(searchParams.get('week'))

  let year: number
  let week: number

  if (yearParam !== null && weekParam !== null) {
    year = yearParam
    week = weekParam
  } else {
    // Auto-track from schedule API
    const current = await getCurrentWeekFromSchedule(baseUrl)
    year = yearParam ?? current.season
    week = weekParam ?? current.week
  }

  const matchup = (searchParams.get('matchup') || '').trim()

  const status = await computeLinesStatus({
    year,
    week,
    matchup: matchup || undefined,
    linesApiUrl: process.env.LINES_API_URL,
    cwd: process.cwd(),
    fileStat: (absPath) => {
      try {
        const s = fs.statSync(absPath)
        return { isFile: s.isFile(), mtimeMs: s.mtimeMs }
      } catch {
        return null
      }
    },
    fetchFn: fetch,
    timeoutMs: 1200,
  })

  return NextResponse.json({
    ...status,
    lastChecked: new Date().toISOString(),
  })
}

