import { describe, it, expect } from 'vitest'
import { WEATHER_THRESHOLDS, checkWeatherThresholds } from '@/lib/terminal/agents/weather/thresholds'

describe('WEATHER_THRESHOLDS', () => {
  it('has defined threshold values', () => {
    expect(WEATHER_THRESHOLDS.windMph).toBe(15)
    expect(WEATHER_THRESHOLDS.coldTemp).toBe(32)
    expect(WEATHER_THRESHOLDS.hotTemp).toBe(90)
    expect(WEATHER_THRESHOLDS.precipitationChance).toBe(50)
  })
})

describe('checkWeatherThresholds', () => {
  const NOW = Date.now()

  it('returns finding for high wind', () => {
    const weather = {
      temperature: 45,
      wind_mph: 18,
      precipitation_chance: 10,
      indoor: false,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkWeatherThresholds(weather, context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].type).toBe('weather_wind')
    expect(findings[0].value_num).toBe(18)
    expect(findings[0].agent).toBe('weather')
  })

  it('returns empty for indoor games', () => {
    const weather = {
      temperature: 72,
      wind_mph: 0,
      precipitation_chance: 0,
      indoor: true,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkWeatherThresholds(weather, context)

    expect(findings.length).toBe(0)
  })

  it('returns finding for freezing temperature', () => {
    const weather = {
      temperature: 28,
      wind_mph: 5,
      precipitation_chance: 20,
      indoor: false,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkWeatherThresholds(weather, context)

    expect(findings.length).toBe(1)
    expect(findings[0].type).toBe('weather_cold')
    expect(findings[0].value_num).toBe(28)
  })

  it('returns finding for high precipitation chance', () => {
    const weather = {
      temperature: 55,
      wind_mph: 8,
      precipitation_chance: 70,
      precipitation_type: 'rain' as const,
      indoor: false,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkWeatherThresholds(weather, context)

    expect(findings.length).toBe(1)
    expect(findings[0].type).toBe('weather_rain')
    expect(findings[0].value_num).toBe(70)
  })

  it('returns multiple findings for harsh conditions', () => {
    const weather = {
      temperature: 25,
      wind_mph: 22,
      precipitation_chance: 80,
      precipitation_type: 'snow' as const,
      indoor: false,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkWeatherThresholds(weather, context)

    expect(findings.length).toBe(3)
    expect(findings.map(f => f.type)).toContain('weather_wind')
    expect(findings.map(f => f.type)).toContain('weather_cold')
    expect(findings.map(f => f.type)).toContain('weather_rain')
  })

  it('returns empty for mild conditions', () => {
    const weather = {
      temperature: 65,
      wind_mph: 8,
      precipitation_chance: 10,
      indoor: false,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkWeatherThresholds(weather, context)

    expect(findings.length).toBe(0)
  })

  it('returns empty at exactly threshold values (wind)', () => {
    const weather = {
      temperature: 65,
      wind_mph: 14, // Below 15 threshold
      precipitation_chance: 10,
      indoor: false,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkWeatherThresholds(weather, context)

    expect(findings.length).toBe(0)
  })

  it('includes precipitation type in context', () => {
    const weather = {
      temperature: 30,
      wind_mph: 5,
      precipitation_chance: 60,
      precipitation_type: 'snow' as const,
      indoor: false,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkWeatherThresholds(weather, context)

    const precipFinding = findings.find(f => f.type === 'weather_rain')
    expect(precipFinding?.comparison_context).toContain('snow')
  })
})
