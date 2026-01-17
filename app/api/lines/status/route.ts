import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'

function safeNum(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function GET() {
  const year = safeNum(process.env.NFL_YEAR) ?? 2025
  const week = safeNum(process.env.NFL_WEEK) ?? 20
  const linesApiUrlSet = Boolean(process.env.LINES_API_URL)

  const w = String(week).padStart(2, '0')
  const rel = path.join('my-parlaygpt', 'data', 'lines', String(year), `week-${w}.json`)
  const filePath = path.join(process.cwd(), rel)

  let fileExists = false
  let fileMtimeMs: number | null = null
  try {
    const stat = fs.statSync(filePath)
    fileExists = stat.isFile()
    fileMtimeMs = stat.mtimeMs
  } catch {}

  const mode = linesApiUrlSet ? 'api' : (fileExists ? 'manual' : 'none')

  return NextResponse.json({
    year,
    week,
    mode,
    linesApiUrlSet,
    manualFile: {
      rel,
      exists: fileExists,
      mtimeMs: fileMtimeMs,
    },
    lastChecked: new Date().toISOString(),
  })
}

