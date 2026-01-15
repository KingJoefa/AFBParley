import fs from 'fs'
import path from 'path'
import { teamNameToCode } from '@/lib/nfl/teams'

export type DirectLine = {
	total?: number
	spreadHome?: number
	spreadAway?: number
	source?: string
	timestamp?: number
}

function pick(value: number | undefined | null): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Fetch direct game lines from a provider.
 * Provider 1 (preferred): generic JSON endpoint from env LINES_API_URL
 * Expected response (example):
 *   { total: 44.5, spreadHome: -3.5, spreadAway: 3.5, source: "FD", timestamp: 1766426603 }
 * You can implement this URL via a proxy to any book/odds API.
 */
export async function fetchDirectLines(params: {
	year: number
	week: number
	matchup: string
}): Promise<DirectLine | null> {
	const base = process.env.LINES_API_URL
	if (!base) return null
	try {
		const u = new URL(base)
		u.searchParams.set('year', String(params.year))
		u.searchParams.set('week', String(params.week))
		u.searchParams.set('matchup', params.matchup)
		const res = await fetch(u.toString(), { cache: 'no-store' })
		if (!res.ok) return null
		const json = await res.json().catch(() => null)
		if (!json || typeof json !== 'object') return null
		return {
			total: pick(Number((json as any).total)),
			spreadHome: pick(Number((json as any).spreadHome)),
			spreadAway: pick(Number((json as any).spreadAway)),
			source: typeof (json as any).source === 'string' ? (json as any).source : 'lines',
			timestamp: pick(Number((json as any).timestamp)),
		}
	} catch {
		// fall through to local file below
	}

	// Local manual override fallback: my-parlaygpt/data/lines/{year}/week-XX.json
	try {
		const [awayRaw, homeRaw] = params.matchup.split('@').map(s => s.trim())
		const awayCode = teamNameToCode[awayRaw] || Object.entries(teamNameToCode).find(([name]) => awayRaw?.includes(name))?.[1]
		const homeCode = teamNameToCode[homeRaw] || Object.entries(teamNameToCode).find(([name]) => homeRaw?.includes(name))?.[1]
		if (!awayCode || !homeCode) return null
		const w = String(params.week).padStart(2, '0')
		const file = path.join(process.cwd(), 'my-parlaygpt', 'data', 'lines', String(params.year), `week-${w}.json`)
		if (!fs.existsSync(file)) return null
		const arr = JSON.parse(fs.readFileSync(file, 'utf8')) as Array<any>
		const rec = arr.find(r => (r.awayCode === awayCode && r.homeCode === homeCode))
		if (!rec) return null
		return {
			total: pick(Number(rec.total)),
			spreadHome: pick(Number(rec.spreadHome)),
			spreadAway: pick(Number(rec.spreadAway)),
			source: String(rec.source || 'manual'),
			timestamp: pick(Number(rec.timestamp)),
		}
	} catch {
		return null
	}
}


