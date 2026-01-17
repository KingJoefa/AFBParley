import { describe, it, expect } from 'vitest'
import {
  LegSchema,
  CorrelationTypeSchema,
  ScriptSchema,
  BuildResultSchema,
  identifyCorrelations,
} from '@/lib/terminal/schemas'

describe('LegSchema', () => {
  it('validates a valid leg', () => {
    const leg = {
      alert_id: 'epa-chase-recv-123',
      market: 'Jamar Chase Over 85.5 Receiving Yards',
      implied_probability: 0.55,
      correlation_factor: 0.3,
      agent: 'epa',
    }

    const result = LegSchema.safeParse(leg)
    expect(result.success).toBe(true)
  })

  it('allows optional fields', () => {
    const leg = {
      alert_id: 'pressure-sf-vs-sea-456',
      market: 'Brock Purdy Under 275.5 Pass Yards',
      agent: 'pressure',
    }

    const result = LegSchema.safeParse(leg)
    expect(result.success).toBe(true)
  })

  it('rejects invalid agent type', () => {
    const leg = {
      alert_id: 'test-123',
      market: 'Test Market',
      agent: 'invalid_agent',
    }

    const result = LegSchema.safeParse(leg)
    expect(result.success).toBe(false)
  })

  it('rejects correlation_factor outside bounds', () => {
    const leg = {
      alert_id: 'test-123',
      market: 'Test Market',
      agent: 'epa',
      correlation_factor: 1.5, // Must be -1 to 1
    }

    const result = LegSchema.safeParse(leg)
    expect(result.success).toBe(false)
  })
})

describe('CorrelationTypeSchema', () => {
  it('accepts valid correlation types', () => {
    const types = ['game_script', 'player_stack', 'weather_cascade', 'defensive_funnel', 'volume_share']

    for (const type of types) {
      const result = CorrelationTypeSchema.safeParse(type)
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid correlation type', () => {
    const result = CorrelationTypeSchema.safeParse('invalid_type')
    expect(result.success).toBe(false)
  })
})

describe('ScriptSchema', () => {
  it('validates a valid script', () => {
    const script = {
      id: 'script-weather-passing-123',
      name: 'Weather Impact Passing Stack',
      legs: [
        { alert_id: 'weather-chi-123', market: 'Game Total Under 42.5', agent: 'weather' },
        { alert_id: 'qb-fields-456', market: 'Justin Fields Under 225.5 Pass Yards', agent: 'qb' },
      ],
      correlation_type: 'weather_cascade',
      correlation_explanation: 'High winds reduce passing efficiency and deep ball attempts',
      combined_confidence: 0.72,
      risk_level: 'moderate',
      provenance_hash: 'abc123def456',
    }

    const result = ScriptSchema.safeParse(script)
    expect(result.success).toBe(true)
  })

  it('requires at least 2 legs', () => {
    const script = {
      id: 'script-123',
      name: 'Single Leg Script',
      legs: [{ alert_id: 'test-123', market: 'Test', agent: 'epa' }],
      correlation_type: 'game_script',
      correlation_explanation: 'Test',
      combined_confidence: 0.5,
      risk_level: 'conservative',
      provenance_hash: 'abc123',
    }

    const result = ScriptSchema.safeParse(script)
    expect(result.success).toBe(false)
  })

  it('allows max 6 legs', () => {
    const script = {
      id: 'script-123',
      name: 'Six Leg Script',
      legs: [
        { alert_id: 'leg-1', market: 'Market 1', agent: 'epa' },
        { alert_id: 'leg-2', market: 'Market 2', agent: 'pressure' },
        { alert_id: 'leg-3', market: 'Market 3', agent: 'qb' },
        { alert_id: 'leg-4', market: 'Market 4', agent: 'hb' },
        { alert_id: 'leg-5', market: 'Market 5', agent: 'wr' },
        { alert_id: 'leg-6', market: 'Market 6', agent: 'te' },
      ],
      correlation_type: 'player_stack',
      correlation_explanation: 'Multi-position stack',
      combined_confidence: 0.3,
      risk_level: 'aggressive',
      provenance_hash: 'abc123',
    }

    const result = ScriptSchema.safeParse(script)
    expect(result.success).toBe(true)
  })

  it('rejects more than 6 legs', () => {
    const script = {
      id: 'script-123',
      name: 'Seven Leg Script',
      legs: [
        { alert_id: 'leg-1', market: 'Market 1', agent: 'epa' },
        { alert_id: 'leg-2', market: 'Market 2', agent: 'pressure' },
        { alert_id: 'leg-3', market: 'Market 3', agent: 'qb' },
        { alert_id: 'leg-4', market: 'Market 4', agent: 'hb' },
        { alert_id: 'leg-5', market: 'Market 5', agent: 'wr' },
        { alert_id: 'leg-6', market: 'Market 6', agent: 'te' },
        { alert_id: 'leg-7', market: 'Market 7', agent: 'weather' },
      ],
      correlation_type: 'player_stack',
      correlation_explanation: 'Too many legs',
      combined_confidence: 0.2,
      risk_level: 'aggressive',
      provenance_hash: 'abc123',
    }

    const result = ScriptSchema.safeParse(script)
    expect(result.success).toBe(false)
  })

  it('rejects extra properties (strict mode)', () => {
    const script = {
      id: 'script-123',
      name: 'Test Script',
      legs: [
        { alert_id: 'leg-1', market: 'Market 1', agent: 'epa' },
        { alert_id: 'leg-2', market: 'Market 2', agent: 'pressure' },
      ],
      correlation_type: 'game_script',
      correlation_explanation: 'Test',
      combined_confidence: 0.5,
      risk_level: 'moderate',
      provenance_hash: 'abc123',
      extra_field: 'should fail', // Not allowed
    }

    const result = ScriptSchema.safeParse(script)
    expect(result.success).toBe(false)
  })
})

describe('BuildResultSchema', () => {
  it('validates a valid build result', () => {
    const result = {
      request_id: 'req-123456',
      scripts: [
        {
          id: 'script-1',
          name: 'Weather Stack',
          legs: [
            { alert_id: 'weather-123', market: 'Under 42.5', agent: 'weather' },
            { alert_id: 'qb-456', market: 'Under 225.5 Pass', agent: 'qb' },
          ],
          correlation_type: 'weather_cascade',
          correlation_explanation: 'Wind impact',
          combined_confidence: 0.65,
          risk_level: 'moderate',
          provenance_hash: 'hash1',
        },
      ],
      alerts_used: ['weather-123', 'qb-456'],
      alerts_excluded: ['epa-789'],
      build_timestamp: Date.now(),
      provenance_hash: 'build-hash-abc',
    }

    const parsed = BuildResultSchema.safeParse(result)
    expect(parsed.success).toBe(true)
  })

  it('allows empty scripts array', () => {
    const result = {
      request_id: 'req-123',
      scripts: [],
      alerts_used: [],
      alerts_excluded: ['all-alerts-excluded'],
      build_timestamp: Date.now(),
      provenance_hash: 'hash',
    }

    const parsed = BuildResultSchema.safeParse(result)
    expect(parsed.success).toBe(true)
  })
})

describe('identifyCorrelations', () => {
  it('identifies weather_cascade correlation', () => {
    const alertIds = ['weather-1', 'qb-1', 'wr-1']
    const alertAgents = new Map([
      ['weather-1', 'weather'],
      ['qb-1', 'qb'],
      ['wr-1', 'wr'],
    ])

    const correlations = identifyCorrelations(alertIds, alertAgents, new Map())

    expect(correlations.some(c => c.type === 'weather_cascade')).toBe(true)
    const weatherCorr = correlations.find(c => c.type === 'weather_cascade')!
    expect(weatherCorr.ids).toContain('weather-1')
    expect(weatherCorr.explanation).toContain('Weather')
  })

  it('identifies defensive_funnel correlation', () => {
    const alertIds = ['pressure-1', 'qb-1']
    const alertAgents = new Map([
      ['pressure-1', 'pressure'],
      ['qb-1', 'qb'],
    ])

    const correlations = identifyCorrelations(alertIds, alertAgents, new Map())

    expect(correlations.some(c => c.type === 'defensive_funnel')).toBe(true)
  })

  it('identifies volume_share correlation with multiple WRs', () => {
    const alertIds = ['wr-1', 'wr-2', 'wr-3']
    const alertAgents = new Map([
      ['wr-1', 'wr'],
      ['wr-2', 'wr'],
      ['wr-3', 'wr'],
    ])

    const correlations = identifyCorrelations(alertIds, alertAgents, new Map())

    expect(correlations.some(c => c.type === 'volume_share')).toBe(true)
    const volCorr = correlations.find(c => c.type === 'volume_share')!
    expect(volCorr.ids.length).toBeLessThanOrEqual(3)
  })

  it('identifies game_script correlation with EPA + HB', () => {
    const alertIds = ['epa-1', 'hb-1', 'hb-2']
    const alertAgents = new Map([
      ['epa-1', 'epa'],
      ['hb-1', 'hb'],
      ['hb-2', 'hb'],
    ])

    const correlations = identifyCorrelations(alertIds, alertAgents, new Map())

    expect(correlations.some(c => c.type === 'game_script')).toBe(true)
  })

  it('returns empty array when no correlations found', () => {
    const alertIds = ['te-1']
    const alertAgents = new Map([['te-1', 'te']])

    const correlations = identifyCorrelations(alertIds, alertAgents, new Map())

    expect(correlations).toHaveLength(0)
  })
})
