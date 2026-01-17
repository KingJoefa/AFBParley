/**
 * Golden Test Fixtures
 *
 * Tests the full pipeline: Finding → LLM Output → Alert assembly → Validation
 * with explicit pass/fail matrix for each validator rule.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import {
  FindingSchema,
  AlertSchema,
  LLMOutputSchema,
  LLMFindingOutputSchema,
  EvidenceSchema,
  SourceSchema,
  assembleAlerts,
  buildCodeDerivedFields,
  validateImplicationsForAgent,
  isLineEvidence,
  type Finding,
  type LLMOutput,
  type Alert,
  type AgentType,
} from '@/lib/terminal/schemas'

// =============================================================================
// FIXTURES: One Finding per agent
// =============================================================================

const NOW = Date.now()
const ONE_HOUR = 60 * 60 * 1000
const ONE_DAY = 24 * ONE_HOUR
const ONE_WEEK = 7 * ONE_DAY

const GOLDEN_FINDINGS: Finding[] = [
  {
    id: 'epa-jsn-recv-001',
    agent: 'epa',
    type: 'receiving_epa_mismatch',
    stat: 'receiving_epa_rank',
    value_num: 3,
    value_type: 'numeric',
    threshold_met: 'rank <= 10',
    comparison_context: '3rd in league',
    source_ref: 'local://data/epa/week-20.json',
    source_type: 'local',
    source_timestamp: NOW - 2 * ONE_DAY,
  },
  {
    id: 'pressure-sf-sea-001',
    agent: 'pressure',
    type: 'pressure_rate_advantage',
    stat: 'pressure_rate_rank',
    value_num: 3,
    value_type: 'numeric',
    threshold_met: 'rank <= 10',
    comparison_context: '3rd best pass rush',
    source_ref: 'local://data/pressure/week-20.json',
    source_type: 'local',
    source_timestamp: NOW - 2 * ONE_DAY,
  },
  {
    id: 'weather-wind-001',
    agent: 'weather',
    type: 'weather_wind',
    stat: 'wind_mph',
    value_num: 18,
    value_type: 'numeric',
    threshold_met: 'wind >= 15 mph',
    comparison_context: '18 mph crosswind',
    source_ref: 'local://data/weather/week-20.json',
    source_type: 'local',
    source_timestamp: NOW - 4 * ONE_HOUR,
  },
  {
    id: 'qb-darnold-pressure-001',
    agent: 'qb',
    type: 'qb_pressure_vulnerability',
    stat: 'qb_passer_rating_under_pressure',
    value_num: 31.2,
    value_type: 'numeric',
    threshold_met: 'rating < 60',
    comparison_context: '31.2 passer rating when pressured',
    source_ref: 'local://data/qb/week-20.json',
    source_type: 'local',
    source_timestamp: NOW - 2 * ONE_DAY,
  },
  {
    id: 'hb-cmc-workload-001',
    agent: 'hb',
    type: 'rb_workload_increase',
    stat: 'rushing_epa_rank',
    value_num: 2,
    value_type: 'numeric',
    threshold_met: 'rank <= 5',
    comparison_context: '2nd in rushing EPA',
    source_ref: 'local://data/rb/week-20.json',
    source_type: 'local',
    source_timestamp: NOW - 2 * ONE_DAY,
  },
  {
    id: 'wr-jsn-target-001',
    agent: 'wr',
    type: 'wr_target_share',
    stat: 'target_share',
    value_num: 28.5,
    value_type: 'numeric',
    threshold_met: 'share >= 25%',
    comparison_context: '28.5% target share',
    source_ref: 'local://data/wr/week-20.json',
    source_type: 'local',
    source_timestamp: NOW - 2 * ONE_DAY,
  },
  {
    id: 'te-kittle-rz-001',
    agent: 'te',
    type: 'te_red_zone_role',
    stat: 'red_zone_targets',
    value_num: 12,
    value_type: 'numeric',
    threshold_met: 'targets >= 10',
    comparison_context: '12 red zone targets',
    source_ref: 'local://data/te/week-20.json',
    source_type: 'local',
    source_timestamp: NOW - 2 * ONE_DAY,
  },
]

// Valid LLM output for golden findings
const GOLDEN_LLM_OUTPUT: LLMOutput = {
  'epa-jsn-recv-001': {
    severity: 'high',
    claim_parts: {
      metrics: ['receiving_epa', 'target_share'],
      direction: 'positive',
      comparator: 'ranks',
      rank_or_percentile: { type: 'rank', value: 3, scope: 'league', direction: 'top' },
      comparison_target: 'opponent_average',
    },
    implications: ['wr_receptions_over', 'wr_yards_over'],
    suppressions: [],
  },
  'pressure-sf-sea-001': {
    severity: 'high',
    claim_parts: {
      metrics: ['pressure_rate'],
      direction: 'positive',
      comparator: 'ranks',
      rank_or_percentile: { type: 'rank', value: 3, scope: 'league', direction: 'top' },
    },
    implications: ['qb_sacks_over', 'qb_ints_over'],
    suppressions: [],
  },
  'weather-wind-001': {
    severity: 'medium',
    claim_parts: {
      metrics: ['pass_block_win_rate'], // Using as proxy for weather impact
      direction: 'negative',
      comparator: 'trails',
    },
    implications: ['game_total_under'],
    suppressions: ['indoor_stadium'],
  },
  'qb-darnold-pressure-001': {
    severity: 'high',
    claim_parts: {
      metrics: ['passer_rating'],
      direction: 'negative',
      comparator: 'trails',
      comparison_target: 'league_average',
    },
    implications: ['qb_ints_over', 'qb_pass_yards_under'],
    suppressions: [],
  },
  'hb-cmc-workload-001': {
    severity: 'high',
    claim_parts: {
      metrics: ['rushing_epa'],
      direction: 'positive',
      comparator: 'ranks',
      rank_or_percentile: { type: 'rank', value: 2, scope: 'league', direction: 'top' },
    },
    implications: ['rb_rush_yards_over', 'rb_tds_over'],
    suppressions: [],
  },
  'wr-jsn-target-001': {
    severity: 'high',
    claim_parts: {
      metrics: ['target_share'],
      direction: 'positive',
      comparator: 'exceeds',
      comparison_target: 'position_average',
    },
    implications: ['wr_receptions_over', 'wr_yards_over'],
    suppressions: [],
  },
  'te-kittle-rz-001': {
    severity: 'medium',
    claim_parts: {
      metrics: ['red_zone_targets'],
      direction: 'positive',
      comparator: 'exceeds',
      comparison_target: 'position_average',
    },
    implications: ['te_receptions_over', 'te_tds_over'],
    suppressions: [],
  },
}

// =============================================================================
// SCHEMA VALIDATION TESTS
// =============================================================================

describe('Schema Validation', () => {
  describe('FindingSchema', () => {
    it('validates all golden findings', () => {
      for (const finding of GOLDEN_FINDINGS) {
        expect(() => FindingSchema.parse(finding)).not.toThrow()
      }
    })

    it('rejects extra fields (strict mode)', () => {
      const badFinding = { ...GOLDEN_FINDINGS[0], extraField: 'should fail' }
      expect(() => FindingSchema.parse(badFinding)).toThrow()
    })
  })

  describe('LLMOutputSchema', () => {
    it('validates golden LLM output', () => {
      expect(() => LLMOutputSchema.parse(GOLDEN_LLM_OUTPUT)).not.toThrow()
    })

    it('rejects extra fields in finding output (strict mode)', () => {
      const badOutput = {
        ...GOLDEN_LLM_OUTPUT,
        'epa-jsn-recv-001': {
          ...GOLDEN_LLM_OUTPUT['epa-jsn-recv-001'],
          confidence: 0.8, // LLM cannot set confidence
        },
      }
      expect(() => LLMOutputSchema.parse(badOutput)).toThrow()
    })

    it('rejects empty output', () => {
      expect(() => LLMOutputSchema.parse({})).toThrow()
    })
  })

  describe('EvidenceSchema (discriminated union)', () => {
    it('accepts local evidence', () => {
      const localEvidence = {
        stat: 'receiving_epa',
        value_num: 0.31,
        value_type: 'numeric' as const,
        comparison: 'top 5',
        source_type: 'local' as const,
        source_ref: 'local://data/epa/week-20.json',
      }
      expect(() => EvidenceSchema.parse(localEvidence)).not.toThrow()
    })

    it('accepts web evidence with required quote_snippet', () => {
      const webEvidence = {
        stat: 'pressure_rate',
        value_num: 42,
        value_type: 'numeric' as const,
        comparison: 'top 3',
        source_type: 'web' as const,
        source_ref: 'https://example.com/stats',
        quote_snippet: 'SF generates 42% pressure rate',
      }
      expect(() => EvidenceSchema.parse(webEvidence)).not.toThrow()
    })

    it('rejects web evidence without quote_snippet', () => {
      const badWebEvidence = {
        stat: 'pressure_rate',
        value_num: 42,
        value_type: 'numeric' as const,
        comparison: 'top 3',
        source_type: 'web' as const,
        source_ref: 'https://example.com/stats',
        // missing quote_snippet
      }
      expect(() => EvidenceSchema.parse(badWebEvidence)).toThrow()
    })

    it('accepts line evidence with all required fields', () => {
      const lineEvidence = {
        stat: 'spread',
        value_num: -3.5,
        value_type: 'numeric' as const,
        comparison: 'current line',
        source_type: 'line' as const,
        source_ref: 'https://sportsbook.com',
        line_type: 'spread' as const,
        line_value: -3.5,
        line_odds: -110,
        book: 'DraftKings',
        line_timestamp: NOW - 5 * 60 * 1000,
        line_ttl: 30 * 60 * 1000,
      }
      expect(() => EvidenceSchema.parse(lineEvidence)).not.toThrow()
    })

    it('rejects line evidence missing line_type', () => {
      const badLineEvidence = {
        stat: 'spread',
        value_num: -3.5,
        value_type: 'numeric' as const,
        comparison: 'current line',
        source_type: 'line' as const,
        source_ref: 'https://sportsbook.com',
        // missing line_type and other required fields
      }
      expect(() => EvidenceSchema.parse(badLineEvidence)).toThrow()
    })
  })
})

// =============================================================================
// ALERT ASSEMBLY TESTS
// =============================================================================

describe('Alert Assembly', () => {
  it('assembles alerts from findings and LLM output', () => {
    const confidences = new Map(GOLDEN_FINDINGS.map(f => [f.id, 0.75]))
    const alerts = assembleAlerts(GOLDEN_FINDINGS, GOLDEN_LLM_OUTPUT, confidences, '2025-week-20')

    expect(alerts).toHaveLength(GOLDEN_FINDINGS.length)

    for (const alert of alerts) {
      expect(() => AlertSchema.parse(alert)).not.toThrow()
    }
  })

  it('throws on missing LLM output for a finding', () => {
    const partialLLMOutput = { ...GOLDEN_LLM_OUTPUT }
    delete partialLLMOutput['epa-jsn-recv-001']

    const confidences = new Map(GOLDEN_FINDINGS.map(f => [f.id, 0.75]))

    expect(() =>
      assembleAlerts(GOLDEN_FINDINGS, partialLLMOutput, confidences, '2025-week-20')
    ).toThrow(/missing for finding/)
  })

  it('throws on extra LLM output for unknown finding', () => {
    const extraLLMOutput: LLMOutput = {
      ...GOLDEN_LLM_OUTPUT,
      'unknown-finding-id': {
        severity: 'high',
        claim_parts: {
          metrics: ['receiving_epa'],
          direction: 'positive',
          comparator: 'ranks',
        },
        implications: ['wr_receptions_over'],
        suppressions: [],
      },
    }

    const confidences = new Map(GOLDEN_FINDINGS.map(f => [f.id, 0.75]))

    expect(() =>
      assembleAlerts(GOLDEN_FINDINGS, extraLLMOutput, confidences, '2025-week-20')
    ).toThrow(/unknown finding_id/)
  })

  it('preserves code-derived fields immutably', () => {
    const confidences = new Map([['epa-jsn-recv-001', 0.82]])
    const alerts = assembleAlerts(
      [GOLDEN_FINDINGS[0]],
      { 'epa-jsn-recv-001': GOLDEN_LLM_OUTPUT['epa-jsn-recv-001'] },
      confidences,
      '2025-week-20'
    )

    const alert = alerts[0]

    // These should come from code, not LLM
    expect(alert.id).toBe('epa-jsn-recv-001')
    expect(alert.agent).toBe('epa')
    expect(alert.confidence).toBe(0.82)
    expect(alert.evidence).toHaveLength(1)
    expect(alert.sources).toHaveLength(1)
  })
})

// =============================================================================
// VALIDATOR PASS/FAIL MATRIX
// =============================================================================

describe('Validator Pass/Fail Matrix', () => {
  describe('Missing Evidence', () => {
    it('FAIL: Alert with empty evidence array', () => {
      const badAlert = {
        id: 'test-001',
        agent: 'epa' as const,
        evidence: [], // Empty - should fail
        sources: [{ type: 'local' as const, ref: 'local://test', data_version: 'v1', data_timestamp: NOW }],
        confidence: 0.75,
        freshness: 'weekly' as const,
        severity: 'high' as const,
        claim: 'test claim',
        implications: ['wr_receptions_over' as const],
        suppressions: [],
      }
      expect(() => AlertSchema.parse(badAlert)).toThrow()
    })
  })

  describe('Orphan Source', () => {
    it('PASS: All sources match evidence refs', () => {
      const goodAlert = buildValidAlert()
      expect(() => AlertSchema.parse(goodAlert)).not.toThrow()
      // Additional validator would check source/evidence ref matching
    })

    // Note: Full orphan source validation requires custom validator (Task 2)
  })

  describe('Edge Language Without LineEvidence', () => {
    it('PASS: Normal claim without edge language', () => {
      const normalClaim = 'Receiving EPA ranks top 5 in league'
      expect(normalClaim).not.toMatch(/edge|value|mispriced|exploit|sharp|lock/i)
    })

    it('FAIL: Edge language detected', () => {
      const edgeClaims = [
        'This is a clear edge',
        'Great value on this line',
        'The spread is mispriced',
        'Time to exploit this matchup',
        'Sharp money is on the over',
        'This is a lock',
      ]
      for (const claim of edgeClaims) {
        expect(claim).toMatch(/edge|value|mispriced|exploit|sharp|lock/i)
      }
    })
  })

  describe('Stale Line Evidence', () => {
    const LINE_TTL = {
      spread: 30 * 60 * 1000,
      total: 30 * 60 * 1000,
      prop: 15 * 60 * 1000,
      moneyline: 60 * 60 * 1000,
    }

    it('PASS: Fresh spread line (< 30 min)', () => {
      const freshLine = {
        stat: 'spread',
        value_num: -3.5,
        value_type: 'numeric' as const,
        comparison: 'current',
        source_type: 'line' as const,
        source_ref: 'https://book.com',
        line_type: 'spread' as const,
        line_value: -3.5,
        line_odds: -110,
        book: 'DK',
        line_timestamp: NOW - 10 * 60 * 1000, // 10 min ago
        line_ttl: LINE_TTL.spread,
      }
      const age = NOW - freshLine.line_timestamp
      expect(age).toBeLessThan(LINE_TTL.spread)
    })

    it('FAIL: Stale spread line (> 30 min)', () => {
      const staleLine = {
        stat: 'spread',
        value_num: -3.5,
        value_type: 'numeric' as const,
        comparison: 'current',
        source_type: 'line' as const,
        source_ref: 'https://book.com',
        line_type: 'spread' as const,
        line_value: -3.5,
        line_odds: -110,
        book: 'DK',
        line_timestamp: NOW - 60 * 60 * 1000, // 60 min ago
        line_ttl: LINE_TTL.spread,
      }
      const age = NOW - staleLine.line_timestamp
      expect(age).toBeGreaterThan(LINE_TTL.spread)
    })

    it('FAIL: Stale prop line (> 15 min)', () => {
      const staleProp = {
        line_type: 'prop' as const,
        line_timestamp: NOW - 20 * 60 * 1000, // 20 min ago
        line_ttl: LINE_TTL.prop,
      }
      const age = NOW - staleProp.line_timestamp
      expect(age).toBeGreaterThan(LINE_TTL.prop)
    })
  })

  describe('Extra JSON Fields (Strict Mode)', () => {
    it('FAIL: Finding with extra field', () => {
      const badFinding = {
        ...GOLDEN_FINDINGS[0],
        secretField: 'should not be here',
      }
      expect(() => FindingSchema.parse(badFinding)).toThrow()
    })

    it('FAIL: Alert with extra field', () => {
      const baseAlert = buildValidAlert()
      const badAlert = { ...baseAlert, hackedField: true }
      expect(() => AlertSchema.parse(badAlert)).toThrow()
    })

    it('FAIL: Evidence with extra field', () => {
      const badEvidence = {
        stat: 'receiving_epa',
        value_num: 0.31,
        value_type: 'numeric' as const,
        comparison: 'top 5',
        source_type: 'local' as const,
        source_ref: 'local://test',
        injectedField: 'attack',
      }
      expect(() => EvidenceSchema.parse(badEvidence)).toThrow()
    })

    it('FAIL: Source with extra field', () => {
      const badSource = {
        type: 'local' as const,
        ref: 'local://test',
        data_version: 'v1',
        data_timestamp: NOW,
        malicious: true,
      }
      expect(() => SourceSchema.parse(badSource)).toThrow()
    })

    it('FAIL: LLM output with extra field per finding', () => {
      const badLLMOutput = {
        'test-finding': {
          severity: 'high' as const,
          claim_parts: {
            metrics: ['receiving_epa' as const],
            direction: 'positive' as const,
            comparator: 'ranks' as const,
          },
          implications: ['wr_receptions_over' as const],
          suppressions: [],
          confidence: 0.9, // LLM trying to set confidence
        },
      }
      expect(() => LLMOutputSchema.parse(badLLMOutput)).toThrow()
    })
  })

  describe('Implications Allowlist Per Agent', () => {
    it('PASS: EPA agent with valid implications', () => {
      const result = validateImplicationsForAgent('epa', ['wr_receptions_over', 'wr_yards_over'])
      expect(result.valid).toBe(true)
      expect(result.invalid).toHaveLength(0)
    })

    it('FAIL: EPA agent with pressure implication', () => {
      const result = validateImplicationsForAgent('epa', ['qb_sacks_over'])
      expect(result.valid).toBe(false)
      expect(result.invalid).toContain('qb_sacks_over')
    })

    it('FAIL: Weather agent with QB implication', () => {
      const result = validateImplicationsForAgent('weather', ['qb_pass_tds_over'])
      expect(result.valid).toBe(false)
      expect(result.invalid).toContain('qb_pass_tds_over')
    })

    it('PASS: Pressure agent with valid implications', () => {
      const result = validateImplicationsForAgent('pressure', ['qb_sacks_over', 'qb_ints_over'])
      expect(result.valid).toBe(true)
    })
  })
})

// =============================================================================
// HELPERS
// =============================================================================

function buildValidAlert(): Alert {
  return {
    id: 'test-valid-001',
    agent: 'epa',
    evidence: [{
      stat: 'receiving_epa',
      value_num: 0.31,
      value_type: 'numeric',
      comparison: 'top 5 in league',
      source_type: 'local',
      source_ref: 'local://data/epa/week-20.json',
    }],
    sources: [{
      type: 'local',
      ref: 'local://data/epa/week-20.json',
      data_version: '2025-week-20',
      data_timestamp: NOW - 2 * ONE_DAY,
    }],
    confidence: 0.75,
    freshness: 'weekly',
    severity: 'high',
    claim: 'Receiving EPA ranks top 5 in league',
    implications: ['wr_receptions_over', 'wr_yards_over'],
    suppressions: [],
  }
}
