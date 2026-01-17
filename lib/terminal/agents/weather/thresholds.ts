import type { Finding, AgentType } from '../../schemas'

export const WEATHER_THRESHOLDS = {
  windMph: 15,              // wind becomes factor
  coldTemp: 32,             // freezing affects play
  hotTemp: 90,              // heat affects play
  precipitationChance: 50,  // likely rain/snow
} as const

interface WeatherData {
  temperature: number
  wind_mph: number
  precipitation_chance: number
  precipitation_type?: 'rain' | 'snow' | 'none'
  indoor: boolean
  stadium?: string
}

interface ThresholdContext {
  dataTimestamp: number
  dataVersion: string
}

export function checkWeatherThresholds(
  weather: WeatherData,
  context: ThresholdContext
): Finding[] {
  const findings: Finding[] = []
  const agent: AgentType = 'weather'

  // Indoor games - no weather impact
  if (weather.indoor) {
    return findings
  }

  // Check wind
  if (weather.wind_mph >= WEATHER_THRESHOLDS.windMph) {
    findings.push({
      id: `weather-wind-${context.dataTimestamp}`,
      agent,
      type: 'weather_wind',
      stat: 'wind_mph',
      value_num: weather.wind_mph,
      value_type: 'numeric',
      threshold_met: `wind >= ${WEATHER_THRESHOLDS.windMph} mph`,
      comparison_context: `${weather.wind_mph} mph wind - affects deep passing`,
      source_ref: `local://data/weather/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  // Check cold
  if (weather.temperature <= WEATHER_THRESHOLDS.coldTemp) {
    findings.push({
      id: `weather-cold-${context.dataTimestamp}`,
      agent,
      type: 'weather_cold',
      stat: 'temperature',
      value_num: weather.temperature,
      value_type: 'numeric',
      threshold_met: `temp <= ${WEATHER_THRESHOLDS.coldTemp}°F`,
      comparison_context: `${weather.temperature}°F - cold weather game`,
      source_ref: `local://data/weather/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  // Check precipitation
  if (weather.precipitation_chance >= WEATHER_THRESHOLDS.precipitationChance) {
    findings.push({
      id: `weather-precip-${context.dataTimestamp}`,
      agent,
      type: 'weather_rain',
      stat: 'precipitation_chance',
      value_num: weather.precipitation_chance,
      value_type: 'numeric',
      threshold_met: `precipitation >= ${WEATHER_THRESHOLDS.precipitationChance}%`,
      comparison_context: `${weather.precipitation_chance}% chance of ${weather.precipitation_type || 'precipitation'}`,
      source_ref: `local://data/weather/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  return findings
}
