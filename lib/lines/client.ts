export type DirectLine = {
	total?: number
	spreadHome?: number
	spreadAway?: number
	source?: string
	timestamp?: number
}

function pick<T>(value: T | undefined | null): T | undefined {
	return value == null ? undefined : value
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
		return null
	}
}


