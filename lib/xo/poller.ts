import fs from 'fs'
import path from 'path'
import { findCombosForMatchup, fetchSelectionCombos } from './client'

let started = false

function ensureDir(p: string) {
	try { fs.mkdirSync(p, { recursive: true }) } catch {}
}

function ndjsonPath(year: number, week: number) {
	const dir = path.join(process.cwd(), 'my-parlaygpt', 'data', 'xo', String(year))
	ensureDir(dir)
	const w = String(week).padStart(2, '0')
	return path.join(dir, `week-${w}.ndjson`)
}

// In-memory guard to reduce duplicate writes during a process lifetime
const lastSeenByKey = new Map<string, { ts: number; american: number; decimal: number }>()

type ScheduleInfo = { season: number; week: number }

async function getCurrentScheduleInfo(origin: string): Promise<ScheduleInfo | null> {
	try {
		const res = await fetch(`${origin}/api/nfl/schedule`, { cache: 'no-store' })
		if (!res.ok) return null
		const data = await res.json()
		const season = Number(data?.season)
		const week = Number(data?.week)
		if (Number.isFinite(season) && Number.isFinite(week)) return { season, week }
		return null
	} catch {
		return null
	}
}

export function startXoComboPoller(serverOrigin: string) {
	if (started) return
	started = true

	const intervalMs = Number(process.env.XO_POLL_INTERVAL_MS || 300_000) // 5 minutes
	const sourceId = process.env.XO_SOURCE_ID || 'FANDUEL'

	async function tick() {
		try {
			const sched = (await getCurrentScheduleInfo(serverOrigin)) ?? {
				season: Number(process.env.NFL_YEAR || new Date().getFullYear()),
				week: Number(process.env.NFL_WEEK || 17),
			}
			// Poll all combos for the week (source filtered)
			const combos = await fetchSelectionCombos({ year: sched.season, week: sched.week, sourceId })
			if (!Array.isArray(combos) || combos.length === 0) return
			const file = ndjsonPath(sched.season, sched.week)
			const now = Date.now()
			const lines: string[] = []
			for (const c of combos) {
				const key = `${c.sourceId}:${c.esbid}:${c.combinationName}`
				const prev = lastSeenByKey.get(key)
				// Write only if odds changed or we haven't seen this timestamp yet
				if (!prev || prev.american !== c.americanOdds || prev.decimal !== c.decimalOdds || (c.timestamp * 1000) > (prev.ts || 0)) {
					lastSeenByKey.set(key, { ts: c.timestamp * 1000, american: c.americanOdds, decimal: c.decimalOdds })
					lines.push(JSON.stringify({
						ts: now,
						source_id: c.sourceId,
						year: c.year,
						week: c.week,
						esbid: c.esbid,
						combination_name: c.combinationName,
						american_odds: c.americanOdds,
						decimal_odds: c.decimalOdds,
						legs: c.legs,
					}))
				}
			}
			if (lines.length) {
				fs.appendFileSync(file, lines.join('\n') + '\n', 'utf8')
				console.info(`[xo] wrote ${lines.length} combo snapshots → ${file}`)
			}
		} catch (e: any) {
			console.warn('[xo] poll error:', e?.message || e)
		}
	}

	// Kick off immediately, then on interval
	tick()
	setInterval(tick, intervalMs).unref()
	console.info('[xo] combo poller started; interval', intervalMs, 'ms')
}


