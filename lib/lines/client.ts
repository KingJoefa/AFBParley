import fs from 'fs'
import path from 'path'
import { normalizeTeamCode, parseMatchup } from '@/lib/nfl/teams'

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
	if (base) {
		try {
			const u = new URL(base)
			u.searchParams.set('year', String(params.year))
			u.searchParams.set('week', String(params.week))
			u.searchParams.set('matchup', params.matchup)
			const res = await fetch(u.toString(), { cache: 'no-store' })
			if (res.ok) {
				const json = await res.json().catch(() => null)
				if (json && typeof json === 'object') {
					return {
						total: pick(Number((json as any).total)),
						spreadHome: pick(Number((json as any).spreadHome)),
						spreadAway: pick(Number((json as any).spreadAway)),
						source: typeof (json as any).source === 'string' ? (json as any).source : 'lines',
						timestamp: pick(Number((json as any).timestamp)),
					}
				}
			}
		} catch {
			// Fall through to local data below.
		}
	}

	// Local manual override fallback: my-parlaygpt/data/lines/{year}/week-XX.json
	try {
		const matchup = parseMatchup(params.matchup)
		if (!matchup) return null
		const { awayTeam: awayCode, homeTeam: homeCode } = matchup
		const w = String(params.week).padStart(2, '0')
		const file = path.join(process.cwd(), 'my-parlaygpt', 'data', 'lines', String(params.year), `week-${w}.json`)
		if (fs.existsSync(file)) {
			const arr = JSON.parse(fs.readFileSync(file, 'utf8')) as Array<any>
			const rec = arr.find(record => (
				normalizeTeamCode(record.awayCode) === awayCode
				&& normalizeTeamCode(record.homeCode) === homeCode
			))
			if (rec) {
				return {
					total: pick(Number(rec.total)),
					spreadHome: pick(Number(rec.spreadHome)),
					spreadAway: pick(Number(rec.spreadAway)),
					source: String(rec.source || 'manual'),
					timestamp: pick(Number(rec.timestamp)),
				}
			}
		}

		// Fallback to data/notes/{year}-wk{week}.json (curated notes with game lines)
		const notesFile = path.join(process.cwd(), 'data', 'notes', `${params.year}-wk${params.week}.json`)
		if (fs.existsSync(notesFile)) {
			const notes = JSON.parse(fs.readFileSync(notesFile, 'utf8'))
			const matchupKey = `${awayCode}@${homeCode}`
			const game = notes.games?.[matchupKey]
			if (game) {
				// Parse totals: { home: 18, away: 23 } -> total = 41
				const gameTotal = game.totals
					? (game.totals.home || 0) + (game.totals.away || 0)
					: undefined
				// Parse spread: { favorite: "NE", line: -4.5 }
				let spreadHome: number | undefined
				let spreadAway: number | undefined
				if (game.spread) {
					const line = Math.abs(game.spread.line || 0)
					if (normalizeTeamCode(game.spread.favorite) === homeCode) {
						spreadHome = -line
						spreadAway = line
					} else {
						spreadHome = line
						spreadAway = -line
					}
				}
				return {
					total: pick(gameTotal),
					spreadHome: pick(spreadHome),
					spreadAway: pick(spreadAway),
					source: 'notes',
					timestamp: Date.now(),
				}
			}
		}
		return null
	} catch {
		return null
	}
}
