export type DerivedScheduleInfo = {
  year: number
  week: number
  degraded: boolean
  gamesCount?: number
}

/**
 * Derive year/week from the schedule endpoint payload.
 * If unavailable, fall back to provided defaults and mark degraded.
 */
export function deriveYearWeekFromSchedule(params: {
  scheduleJson: any | null
  fallbackYear: number
  fallbackWeek: number
}): DerivedScheduleInfo {
  const { scheduleJson, fallbackYear, fallbackWeek } = params
  const year = Number(scheduleJson?.season)
  const week = Number(scheduleJson?.week)
  const games = Array.isArray(scheduleJson?.games) ? scheduleJson.games : null

  const okYear = Number.isFinite(year) && year > 1900
  const okWeek = Number.isFinite(week) && week > 0
  const degraded = !(okYear && okWeek)

  return {
    year: okYear ? year : fallbackYear,
    week: okWeek ? week : fallbackWeek,
    degraded,
    gamesCount: typeof games?.length === 'number' ? games.length : undefined,
  }
}

