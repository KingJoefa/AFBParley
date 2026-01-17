import { NextResponse } from 'next/server'
import fs from 'fs'
import { computeLinesStatus } from '@/lib/lines/status'

export const runtime = 'nodejs'

function safeNum(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const year = safeNum(searchParams.get('year')) ?? safeNum(process.env.NFL_YEAR) ?? 2025
  const week = safeNum(searchParams.get('week')) ?? safeNum(process.env.NFL_WEEK) ?? 20
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

