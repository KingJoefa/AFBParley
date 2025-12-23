import { extractTeamCodesFromMatchup } from '@/lib/nfl/teams'
import type { FetchCombosParams, XoCombo, XoLeg, XoRow } from './types'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const cache = new Map<string, { expiresAt: number; data: XoCombo[] }>()

function keyFor(p: FetchCombosParams) {
	return `${p.year}:${p.week}:${p.sourceId || 'ALL'}:${p.limit || 1000}:${p.offset || 0}`
}

function normalizeRow(row: XoRow): XoCombo {
	function leg(n: number): XoLeg | null {
		const prefix = `selection_${n}_`
		const market = row[`${prefix}market_type`] as string | undefined
		if (!market) return null
		const first = row[`${prefix}first_name`] as string | undefined
		const last = row[`${prefix}last_name`] as string | undefined
		const team = row[`${prefix}nfl_team`] as string | undefined
		const position = row[`${prefix}player_position`] as string | undefined
		const line = (row[`${prefix}line`] as number | undefined) ?? null
		const pick = (row[`${prefix}selection_type`] as string | undefined) ?? null
		const player = first || last || team || position ? { first, last, team, position } : undefined
		return { player, marketType: market, line, selectionType: pick }
	}
	const legs = [1, 2, 3, 4].map(leg).filter(Boolean) as XoLeg[]
	return {
		combinationName: row.combination_name,
		sourceId: row.source_id,
		year: row.year,
		week: row.week,
		esbid: row.esbid,
		decimalOdds: row.decimal_odds,
		americanOdds: row.american_odds,
		timestamp: row.timestamp,
		legs,
	}
}

export async function fetchSelectionCombos(p: FetchCombosParams): Promise<XoCombo[]> {
	const cacheKey = keyFor(p)
	const now = Date.now()
	const hit = cache.get(cacheKey)
	if (hit && hit.expiresAt > now) return hit.data

	const limit = p.limit ?? 1000
	const offset = p.offset ?? 0
	const src = p.sourceId ? `&source_id=${encodeURIComponent(p.sourceId)}` : ''
	const url = `https://xo.football/api/selection-combinations?limit=${limit}&offset=${offset}&year=${p.year}&week=${p.week}${src}`
	const res = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' })
	if (!res.ok) throw new Error(`XO fetch ${res.status}`)
	const rows = (await res.json()) as XoRow[]
	const data = rows.map(normalizeRow)
	cache.set(cacheKey, { data, expiresAt: now + CACHE_TTL_MS })
	return data
}

export async function findCombosForMatchup(params: { year: number; week: number; matchup: string; sourceId?: string; }): Promise<XoCombo[]> {
	const { year, week, matchup, sourceId } = params
	const all = await fetchSelectionCombos({ year, week, sourceId })
	const codes = extractTeamCodesFromMatchup(matchup)
	if (codes.size === 0) return []
	return all.filter(c => c.legs.some(l => l.player?.team && codes.has(l.player.team!)))
}


