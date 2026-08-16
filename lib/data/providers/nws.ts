import { z } from 'zod'
import {
  IngestionFeedResultSchema,
  type IngestionFeedResult,
  type Observation,
  type RawImport,
  type SnapshotAvailability,
} from '@/lib/data/contracts'
import { createObservation, createRawImport } from '@/lib/data/providers/shared'
import type { ObservationProvider, WeekProviderContext } from '@/lib/data/providers/types'
import { getVenueWeatherProfile } from '@/lib/nfl/venues'

const NWS_TERMS_URL = 'https://www.weather.gov/documentation/services-web-api'
const FORECAST_HORIZON_MS = 7 * 24 * 60 * 60 * 1000
const FRESHNESS_MS = 6 * 60 * 60 * 1000

const NwsPointSchema = z.object({
  properties: z.object({
    forecastHourly: z.string().url(),
  }),
})

const NwsForecastSchema = z.object({
  properties: z.object({
    updated: z.string().datetime({ offset: true }).optional(),
    generatedAt: z.string().datetime({ offset: true }).optional(),
    periods: z.array(z.object({
      number: z.number().int(),
      startTime: z.string().datetime({ offset: true }),
      endTime: z.string().datetime({ offset: true }),
      temperature: z.number(),
      temperatureUnit: z.string(),
      probabilityOfPrecipitation: z.object({
        value: z.number().nullable(),
      }).optional(),
      windSpeed: z.string(),
      windDirection: z.string(),
      shortForecast: z.string(),
    })),
  }),
})

function state(params: {
  state: SnapshotAvailability['state']
  checkedAt: string
  observationCount?: number
  message?: string
}): SnapshotAvailability {
  return {
    state: params.state,
    checked_at: params.checkedAt,
    observation_count: params.observationCount ?? 0,
    ...(params.message ? { message: params.message } : {}),
  }
}

export function parseWindMph(value: string): number | null {
  const speeds = [...value.matchAll(/\d+(?:\.\d+)?/g)].map(match => Number(match[0]))
  return speeds.length ? Math.max(...speeds) : null
}

async function collectGameWeather(
  context: WeekProviderContext,
  gameIndex: number,
): Promise<{
  observations: Observation[]
  rawImports: RawImport[]
  availability: SnapshotAvailability
}> {
  const game = context.games[gameIndex]
  const checkedAt = context.now.toISOString()
  const venue = getVenueWeatherProfile(game.venue)

  if (!venue) {
    return {
      observations: [],
      rawImports: [],
      availability: state({
        state: 'not_configured',
        checkedAt,
        message: 'NWS coverage is not configured for this venue',
      }),
    }
  }
  if (venue.roof === 'enclosed') {
    return {
      observations: [],
      rawImports: [],
      availability: state({
        state: 'available',
        checkedAt,
        message: 'Enclosed venue; exterior weather is not treated as a game condition',
      }),
    }
  }

  const kickoffMs = Date.parse(game.kickoff)
  if (kickoffMs - context.now.getTime() > FORECAST_HORIZON_MS) {
    return {
      observations: [],
      rawImports: [],
      availability: state({
        state: 'missing',
        checkedAt,
        message: 'Kickoff is outside the NWS hourly forecast horizon',
      }),
    }
  }

  const pointUrl = `https://api.weather.gov/points/${venue.latitude},${venue.longitude}`
  try {
    const headers = {
      Accept: 'application/geo+json',
      'User-Agent': process.env.SWANTAIL_NWS_USER_AGENT ?? 'Swantail/0.1 (https://github.com/KingJoefa/AFBParley)',
    }
    const pointResponse = await context.fetch(pointUrl, { headers })
    if (!pointResponse.ok) throw new Error(`NWS point lookup returned ${pointResponse.status}`)
    const point = NwsPointSchema.parse(await pointResponse.json())

    const forecastResponse = await context.fetch(point.properties.forecastHourly, { headers })
    if (!forecastResponse.ok) throw new Error(`NWS forecast returned ${forecastResponse.status}`)
    const forecast = NwsForecastSchema.parse(await forecastResponse.json())
    const period = forecast.properties.periods.find(candidate => (
      Date.parse(candidate.startTime) <= kickoffMs && Date.parse(candidate.endTime) > kickoffMs
    ))
    if (!period) {
      return {
        observations: [],
        rawImports: [],
        availability: state({
          state: 'missing',
          checkedAt,
          message: 'NWS returned no hourly period covering kickoff',
        }),
      }
    }

    const rawImport = createRawImport({
      provider: 'nws',
      feed: 'hourly-forecast',
      sourceUrl: point.properties.forecastHourly,
      fetchedAt: checkedAt,
      payload: { point: { venue: game.venue, ...venue }, forecast: period },
    })
    const observedAt = forecast.properties.updated ?? forecast.properties.generatedAt ?? checkedAt
    const observation = createObservation({
      gameId: game.game_id,
      agentId: 'weather',
      kind: 'forecast',
      subject: { type: 'venue', id: game.venue ?? game.game_id, label: game.venue },
      metric: 'weather.kickoff_forecast',
      value: {
        temperature_f: period.temperatureUnit === 'F' ? period.temperature : null,
        wind_mph: parseWindMph(period.windSpeed),
        wind_text: period.windSpeed,
        wind_direction: period.windDirection,
        precipitation_probability: period.probabilityOfPrecipitation?.value ?? null,
        summary: period.shortForecast,
        roof: venue.roof,
      },
      source: {
        provider: 'nws',
        feed: 'hourly-forecast',
        quality: 'official',
        source_url: point.properties.forecastHourly,
        terms_url: NWS_TERMS_URL,
      },
      observedAt,
      effectiveAt: period.startTime,
      expiresAt: new Date(context.now.getTime() + FRESHNESS_MS).toISOString(),
      importedAt: checkedAt,
      rawImportId: rawImport.raw_import_id,
      providerRecordId: `${game.game_id}:${period.number}:${period.startTime}`,
    })
    return {
      observations: [observation],
      rawImports: [rawImport],
      availability: state({ state: 'available', checkedAt, observationCount: 1 }),
    }
  } catch (error) {
    return {
      observations: [],
      rawImports: [],
      availability: state({
        state: 'degraded',
        checkedAt,
        message: error instanceof Error ? error.message : 'NWS forecast failed',
      }),
    }
  }
}

export const nwsWeatherProvider: ObservationProvider = {
  agentIds: ['weather'],
  async collect(context): Promise<IngestionFeedResult> {
    const results = await Promise.all(context.games.map((_, index) => collectGameWeather(context, index)))
    const observations = results.flatMap(result => result.observations)
    const rawImports = results.flatMap(result => result.rawImports)
    const gameStates = Object.fromEntries(context.games.map((game, index) => [
      game.game_id,
      results[index].availability,
    ]))
    const states = Object.values(gameStates).map(gameState => gameState.state)
    const feedState = observations.length
      ? 'available'
      : states.includes('degraded')
        ? 'degraded'
        : states.every(value => value === 'not_configured')
          ? 'not_configured'
          : 'missing'

    return IngestionFeedResultSchema.parse({
      provider: 'nws',
      feed: 'hourly-forecast',
      state: feedState,
      checked_at: context.now.toISOString(),
      raw_imports: rawImports,
      observations,
      game_states: gameStates,
    })
  },
}
