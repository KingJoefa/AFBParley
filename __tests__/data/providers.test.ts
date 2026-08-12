import { describe, expect, it, vi } from 'vitest'
import { nflverseEpaProvider, nflverseInjuryProvider } from '@/lib/data/providers/nflverse'
import { nwsWeatherProvider, parseWindMph } from '@/lib/data/providers/nws'
import { loadSchedule } from '@/lib/nfl/schedule'

const game = loadSchedule({ season: 2026, week: 1 }).games[0]

function context(fetcher: typeof fetch, now = new Date('2026-09-09T12:00:00.000Z')) {
  return {
    games: [game],
    season: 2026,
    week: 1,
    now,
    fetch: fetcher,
  }
}

describe('observation providers', () => {
  it('normalizes the NWS kickoff forecast with official provenance', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/points/')) {
        return new Response(JSON.stringify({
          properties: { forecastHourly: 'https://api.weather.gov/gridpoints/SEW/1,1/forecast/hourly' },
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        properties: {
          updated: '2026-09-09T11:45:00.000Z',
          periods: [{
            number: 1,
            startTime: '2026-09-10T00:00:00.000Z',
            endTime: '2026-09-10T01:00:00.000Z',
            temperature: 58,
            temperatureUnit: 'F',
            probabilityOfPrecipitation: { value: 55 },
            windSpeed: '15 to 20 mph',
            windDirection: 'S',
            shortForecast: 'Rain',
          }],
        },
      }), { status: 200 })
    }) as unknown as typeof fetch

    const result = await nwsWeatherProvider.collect(context(fetcher))

    expect(parseWindMph('15 to 20 mph')).toBe(20)
    expect(result.state).toBe('available')
    expect(result.observations[0].source.quality).toBe('official')
    expect(result.observations[0].value).toMatchObject({ wind_mph: 20 })
  })

  it('labels nflverse injury observations as research-grade', async () => {
    const csv = [
      'season,team,week,gsis_id,position,full_name,report_primary_injury,report_status,practice_status',
      '2026,NE,1,00-1,WR,Example Player,Hamstring,Out,Did Not Participate In Practice',
    ].join('\n')
    const fetcher = vi.fn(async () => new Response(csv, { status: 200 })) as unknown as typeof fetch

    const result = await nflverseInjuryProvider.collect(context(fetcher))

    expect(result.observations).toHaveLength(1)
    expect(result.observations[0].source.quality).toBe('research')
    expect(result.game_states[game.game_id].state).toBe('available')
  })

  it('creates a two-team offensive EPA baseline for week one', async () => {
    const csv = [
      'season,team,season_type,games,attempts,carries,sacks_suffered,passing_epa,rushing_epa',
      '2025,NE,REG,17,600,400,40,20,10',
      '2025,SEA,REG,17,550,450,30,80,20',
    ].join('\n')
    const fetcher = vi.fn(async () => new Response(csv, { status: 200 })) as unknown as typeof fetch

    const result = await nflverseEpaProvider.collect(context(fetcher))

    expect(result.observations).toHaveLength(2)
    expect(result.game_states[game.game_id].state).toBe('available')
    expect(result.observations.map(item => item.subject.id)).toEqual(expect.arrayContaining(['NE', 'SEA']))
  })
})
