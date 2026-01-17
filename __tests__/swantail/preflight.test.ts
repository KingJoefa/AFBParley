import { describe, expect, it } from 'vitest'
import { deriveYearWeekFromSchedule } from '@/lib/swantail/preflight'

describe('deriveYearWeekFromSchedule', () => {
  it('derives year/week from schedule payload', () => {
    const out = deriveYearWeekFromSchedule({
      scheduleJson: { season: 2025, week: 20, games: [{}, {}, {}] },
      fallbackYear: 2025,
      fallbackWeek: 20,
    })
    expect(out.year).toBe(2025)
    expect(out.week).toBe(20)
    expect(out.degraded).toBe(false)
    expect(out.gamesCount).toBe(3)
  })

  it('falls back and marks degraded when schedule is missing', () => {
    const out = deriveYearWeekFromSchedule({
      scheduleJson: null,
      fallbackYear: 2025,
      fallbackWeek: 20,
    })
    expect(out.year).toBe(2025)
    expect(out.week).toBe(20)
    expect(out.degraded).toBe(true)
  })
})

