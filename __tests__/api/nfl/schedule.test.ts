import { afterEach, describe, expect, it } from 'vitest'
import { GET } from '@/app/api/nfl/schedule/route'
import { loadSchedule } from '@/lib/nfl/schedule'

const ORIGINAL_ENV = {
  NFL_SEASON: process.env.NFL_SEASON,
  NFL_YEAR: process.env.NFL_YEAR,
  NFL_WEEK: process.env.NFL_WEEK,
}

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('NFL schedule', () => {
  it('prioritizes Week 1 of the upcoming season before kickoff', () => {
    const schedule = loadSchedule({ now: new Date('2026-08-09T12:00:00Z') })
    expect(schedule.season).toBe(2026)
    expect(schedule.seasonLabel).toBe('2026-27')
    expect(schedule.week).toBe(1)
    expect(schedule.games).toHaveLength(16)
    expect(schedule.totalSeasonGames).toBe(272)
    expect(schedule.availableWeeks).toEqual(Array.from({ length: 18 }, (_, index) => index + 1))
    expect(schedule.games[0]).toMatchObject({
      id: '2026-wk01-NE-at-SEA',
      away_team: 'NE',
      home_team: 'SEA',
      external_id: '401872656',
      isPopular: false,
    })
  })

  it('loads every released week from the full season', () => {
    const schedule = loadSchedule({ season: 2026, week: 18 })
    expect(schedule.games).toHaveLength(16)
    expect(schedule.source).toBe('season-schedule')
    expect(schedule.games.every(game => game.week === 18)).toBe(true)
  })

  it('keeps the active week prioritized while its final game is in progress', () => {
    const duringMondayNightFootball = loadSchedule({ now: new Date('2026-09-15T02:00:00Z') })
    const afterWeekOne = loadSchedule({ now: new Date('2026-09-15T07:00:00Z') })

    expect(duringMondayNightFootball.week).toBe(1)
    expect(afterWeekOne.week).toBe(2)
  })

  it('preserves historical postseason schedules', () => {
    const schedule = loadSchedule({ season: 2025, week: 20 })
    expect(schedule.games).toHaveLength(4)
    expect(schedule.games.map(game => game.id)).toContain('2025-wk20-LAR-at-CHI')
  })

  it('serves compatibility fields with canonical metadata', async () => {
    const response = await GET(new Request('http://localhost/api/nfl/schedule?season=2025&week=21'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      season: 2025,
      week: 21,
      round: 'Conference Championships',
      source: 'curated-notes',
      dataVersion: '2025-wk21',
      totalGames: 2,
    })
    expect(body.games[0]).toEqual(expect.objectContaining({
      id: expect.any(String),
      display: expect.any(String),
      time: expect.any(String),
      date: expect.any(String),
      game_id: expect.any(String),
    }))
  })

  it('serves the upcoming Week 1 slate as the default API view', async () => {
    delete process.env.NFL_SEASON
    delete process.env.NFL_YEAR
    delete process.env.NFL_WEEK

    const response = await GET(new Request('http://localhost/api/nfl/schedule'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      season: 2026,
      seasonLabel: '2026-27',
      week: 1,
      source: 'season-schedule',
      totalGames: 16,
      totalSeasonGames: 272,
    })
  })

  it('returns a clear response for invalid or unavailable ranges', async () => {
    const invalid = await GET(new Request('http://localhost/api/nfl/schedule?week=banana'))
    expect(invalid.status).toBe(400)

    const missing = await GET(new Request('http://localhost/api/nfl/schedule?season=2024&week=1'))
    expect(missing.status).toBe(404)
  })
})
