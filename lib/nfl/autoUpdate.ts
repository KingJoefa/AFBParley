import fs from 'fs'
import path from 'path'

let started = false

function getNextTuesdayMorningLocal(): number {
  const now = new Date()
  const day = now.getDay() // 0=Sun,1=Mon,...,6=Sat
  // Days until next Tuesday
  const delta = (2 - day + 7) % 7 || 7
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta, 8, 0, 0, 0)
  return next.getTime()
}

async function tryFetchScheduleFromSource(): Promise<any | null> {
  const src = process.env.NFL_SCHEDULE_SOURCE
  if (!src) return null
  try {
    const res = await fetch(src, { cache: 'no-store' })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const data = await res.json()
    return data
  } catch (e) {
    console.warn('[nfl] fetch failed from source', (e as Error)?.message)
    return null
  }
}

function writeOverride(data: unknown) {
  try {
    const target = path.join(process.cwd(), 'my-parlaygpt', 'data', 'schedule.override.json')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, JSON.stringify(data, null, 2))
    console.info('[nfl] wrote schedule override:', target)
  } catch (e) {
    console.warn('[nfl] failed writing override', (e as Error)?.message)
  }
}

export function startNflScheduleAutoUpdate() {
  if (started) return
  started = true

  const scheduleNext = () => {
    const nextAt = getNextTuesdayMorningLocal()
    const delay = Math.max(0, nextAt - Date.now())
    setTimeout(async () => {
      const data = await tryFetchScheduleFromSource()
      if (data) writeOverride(data)
      // schedule the following Tuesday
      scheduleNext()
    }, delay)
  }

  // start the loop
  scheduleNext()
  console.info('[nfl] auto-update scheduled for next Tuesday morning (local time)')
}


