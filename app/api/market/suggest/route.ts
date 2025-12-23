import { NextRequest } from 'next/server'
import { fetchSelectionCombos } from '@/lib/xo/client'
import { extractTeamCodesFromMatchup } from '@/lib/nfl/teams'

export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url)
		const matchup = (searchParams.get('matchup') || '').trim()
		const sourceId = (searchParams.get('source') || process.env.XO_SOURCE_ID || 'FANDUEL').toString()
		const limit = Math.min(10, Math.max(1, Number(searchParams.get('limit') || 5)))

		// Resolve year/week from our schedule endpoint
		let year = Number(process.env.NFL_YEAR || new Date().getFullYear())
		let week = Number(process.env.NFL_WEEK || 17)
		try {
			const origin = new URL(req.url).origin
			const sres = await fetch(`${origin}/api/nfl/schedule`, { cache: 'no-store' })
			if (sres.ok) {
				const sched = await sres.json().catch(() => null)
				if (sched?.season) year = Number(sched.season)
				if (sched?.week) week = Number(sched.week)
			}
		} catch {}

		// Pull combos; filter to matchup teams when possible
		const combos = await fetchSelectionCombos({ year, week, sourceId })
		const codes = matchup ? extractTeamCodesFromMatchup(matchup) : new Set<string>()

		// Collect candidate anchors
		const totals: Record<string, number[]> = {} // key: OVER/UNDER
		const spreads: number[] = []

		for (const c of combos) {
			for (const l of c.legs) {
				const mt = (l.marketType || '').toUpperCase()
				// Prefer totals if available
				if (mt.includes('TOTAL') && typeof l.line === 'number') {
					const pick = (l.selectionType || '').toUpperCase()
					if (!totals[pick]) totals[pick] = []
					totals[pick].push(l.line)
				}
				// Spread with unknown team context; store raw line
				if (mt.includes('SPREAD') && typeof l.line === 'number') {
					// If we know a team code on leg, ensure it belongs to matchup; otherwise still consider
					if (!l.player?.team || codes.size === 0 || codes.has(l.player.team)) {
						spreads.push(l.line)
					}
				}
			}
		}

		const suggestions: string[] = []
		function median(nums: number[]): number {
			const a = [...nums].sort((x, y) => x - y)
			const mid = Math.floor(a.length / 2)
			return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
		}

		// Build total suggestions
		const over = totals['OVER'] || totals['O'] || []
		const under = totals['UNDER'] || totals['U'] || []
		if (over.length) suggestions.push(`Over ${median(over).toFixed(1)}`)
		if (under.length) suggestions.push(`Under ${median(under).toFixed(1)}`)

		// Spread suggestion (teamless)
		if (spreads.length) {
			const m = median(spreads)
			const sym = m >= 0 ? '-' : '+'
			const v = Math.abs(m).toFixed(1)
			suggestions.push(`Spread ${sym}${v}`)
		}

		return Response.json({ year, week, sourceId, suggestions: suggestions.slice(0, limit) })
	} catch (e: any) {
		return new Response(JSON.stringify({ error: e?.message || 'failed to suggest market anchors' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}


