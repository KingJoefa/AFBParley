import path from 'path'

export type LinesStatusMode = 'api' | 'fallback' | 'missing' | 'degraded'

export type LinesStatus = {
  year: number
  week: number
  mode: LinesStatusMode
  expected: {
    rel: string
    abs: string
  }
  api: {
    configured: boolean
    attempted: boolean
    ok?: boolean
    status?: number
    ms?: number
    error?: string
  }
  fallback: {
    exists: boolean
    mtimeMs?: number | null
  }
  notes?: {
    exists: boolean
    path: string
    mtimeMs?: number | null
  }
}

export function linesFallbackRelPath(year: number, week: number): string {
  const w = String(week).padStart(2, '0')
  // Use posix to keep stable forward-slash paths (better for UI + tests).
  return path.posix.join('my-parlaygpt', 'data', 'lines', String(year), `week-${w}.json`)
}

export function notesRelPath(year: number, week: number): string {
  return path.posix.join('data', 'notes', `${year}-wk${week}.json`)
}

type ComputeParams = {
  year: number
  week: number
  cwd: string
  matchup?: string
  linesApiUrl?: string
  fileStat?: (absPath: string) => { isFile: boolean; mtimeMs?: number } | null
  fetchFn?: typeof fetch
  timeoutMs?: number
}

async function pingLinesApi(params: { url: string; year: number; week: number; matchup: string; fetchFn: typeof fetch; timeoutMs: number }) {
  const { url, year, week, matchup, fetchFn, timeoutMs } = params
  const started = Date.now()
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const u = new URL(url)
    u.searchParams.set('year', String(year))
    u.searchParams.set('week', String(week))
    u.searchParams.set('matchup', matchup)
    const res = await fetchFn(u.toString(), { cache: 'no-store', signal: controller.signal })
    return { ok: res.ok, status: res.status, ms: Date.now() - started }
  } catch (e: any) {
    const err = e?.name === 'AbortError' ? 'timeout' : (e?.message || 'fetch_failed')
    return { ok: false, error: err }
  } finally {
    clearTimeout(t)
  }
}

export async function computeLinesStatus(p: ComputeParams): Promise<LinesStatus> {
  const year = p.year
  const week = p.week
  const rel = linesFallbackRelPath(year, week)
  const abs = path.join(p.cwd, rel)

  const stat = p.fileStat?.(abs) ?? null
  const exists = Boolean(stat?.isFile)

  // Also check for notes file (data/notes/{year}-wk{week}.json)
  const notesRel = notesRelPath(year, week)
  const notesAbs = path.join(p.cwd, notesRel)
  const notesStat = p.fileStat?.(notesAbs) ?? null
  const notesExists = Boolean(notesStat?.isFile)

  // Either fallback file or notes file counts as having local data
  const hasLocalData = exists || notesExists

  const apiUrl = (p.linesApiUrl || '').trim()
  const configured = apiUrl.length > 0

  // Default: no ping attempt
  let api: LinesStatus['api'] = { configured, attempted: false }

  // Notes info for response
  const notes: LinesStatus['notes'] = notesExists
    ? { exists: true, path: notesRel, mtimeMs: notesStat?.mtimeMs ?? null }
    : { exists: false, path: notesRel }

  if (configured && p.fetchFn && p.matchup && p.matchup.trim()) {
    api.attempted = true
    const ping = await pingLinesApi({
      url: apiUrl,
      year,
      week,
      matchup: p.matchup.trim(),
      fetchFn: p.fetchFn,
      timeoutMs: p.timeoutMs ?? 1500,
    })
    api = { ...api, ...ping }
    if (ping.ok) {
      return {
        year,
        week,
        mode: 'api',
        expected: { rel, abs },
        api,
        fallback: { exists, mtimeMs: stat?.mtimeMs ?? null },
        notes,
      }
    }
    // API configured but ping failed: use fallback/notes if available, else degraded
    return {
      year,
      week,
      mode: hasLocalData ? 'fallback' : 'degraded',
      expected: { rel, abs },
      api,
      fallback: { exists, mtimeMs: stat?.mtimeMs ?? null },
      notes,
    }
  }

  // No API configured (or no matchup to ping): use fallback file or notes.
  if (!configured) {
    return {
      year,
      week,
      mode: hasLocalData ? 'fallback' : 'missing',
      expected: { rel, abs },
      api,
      fallback: { exists, mtimeMs: stat?.mtimeMs ?? null },
      notes,
    }
  }

  // API configured but we didn't attempt ping (no matchup / no fetchFn). Treat as api (configured)
  // but keep "attempted: false" so the UI can choose how to message it.
  return {
    year,
    week,
    mode: 'api',
    expected: { rel, abs },
    api,
    fallback: { exists, mtimeMs: stat?.mtimeMs ?? null },
    notes,
  }
}

