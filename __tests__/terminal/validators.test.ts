import { describe, it, expect } from 'vitest'
import {
  validateSourceIntegrity,
  validateLineFreshness,
  validateNoEdgeWithoutLine,
  validateImplications,
  validateIdAgentMatch,
  validateConfidenceImmutability,
  validateAlert,
  validateAlerts,
  ValidationError,
  LINE_TTL,
} from '@/lib/terminal/engine/validators'
import type { Alert, Finding } from '@/lib/terminal/schemas'

const NOW = Date.now()
const ONE_HOUR = 60 * 60 * 1000
const ONE_DAY = 24 * ONE_HOUR

// =============================================================================
// FIXTURES
// =============================================================================

function createValidAlert(overrides?: Partial<Alert>): Alert {
  return {
    id: 'test-001',
    agent: 'epa',
    evidence: [{
      stat: 'receiving_epa',
      value_num: 0.31,
      value_type: 'numeric',
      comparison: 'top 5',
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
    ...overrides,
  }
}

function createValidFinding(overrides?: Partial<Finding>): Finding {
  return {
    id: 'test-001',
    agent: 'epa',
    type: 'receiving_epa_mismatch',
    stat: 'receiving_epa',
    value_num: 0.31,
    value_type: 'numeric',
    threshold_met: 'rank <= 10',
    comparison_context: 'top 5',
    source_ref: 'local://data/epa/week-20.json',
    source_type: 'local',
    source_timestamp: NOW - 2 * ONE_DAY,
    ...overrides,
  }
}

// =============================================================================
// SOURCE INTEGRITY TESTS
// =============================================================================

describe('validateSourceIntegrity', () => {
  it('PASS: all evidence refs have matching sources', () => {
    const alert = createValidAlert()
    expect(() => validateSourceIntegrity(alert)).not.toThrow()
  })

  it('FAIL: orphan source (source without evidence)', () => {
    const alert = createValidAlert({
      sources: [
        {
          type: 'local',
          ref: 'local://data/epa/week-20.json',
          data_version: '2025-week-20',
          data_timestamp: NOW - 2 * ONE_DAY,
        },
        {
          type: 'web',
          ref: 'https://orphan.com/data',
          data_version: '2025-week-20',
          data_timestamp: NOW,
          search_timestamp: NOW,
          quote_snippet: 'orphan data',
        },
      ],
    })

    expect(() => validateSourceIntegrity(alert)).toThrow(ValidationError)
    expect(() => validateSourceIntegrity(alert)).toThrow(/orphan/i)
  })

  it('FAIL: evidence without source', () => {
    const alert = createValidAlert({
      evidence: [
        {
          stat: 'receiving_epa',
          value_num: 0.31,
          value_type: 'numeric',
          comparison: 'top 5',
          source_type: 'local',
          source_ref: 'local://data/epa/week-20.json',
        },
        {
          stat: 'target_share',
          value_num: 28,
          value_type: 'numeric',
          comparison: 'high',
          source_type: 'local',
          source_ref: 'local://data/wr/week-20.json', // No matching source
        },
      ],
    })

    expect(() => validateSourceIntegrity(alert)).toThrow(ValidationError)
    expect(() => validateSourceIntegrity(alert)).toThrow(/missing source/i)
  })
})

// =============================================================================
// LINE FRESHNESS TESTS
// =============================================================================

describe('validateLineFreshness', () => {
  it('PASS: no line evidence', () => {
    const alert = createValidAlert()
    expect(() => validateLineFreshness(alert)).not.toThrow()
  })

  it('PASS: fresh spread line (< 30 min)', () => {
    const alert = createValidAlert({
      evidence: [{
        stat: 'spread',
        value_num: -3.5,
        value_type: 'numeric',
        comparison: 'current',
        source_type: 'line',
        source_ref: 'https://book.com',
        line_type: 'spread',
        line_value: -3.5,
        line_odds: -110,
        book: 'DK',
        line_timestamp: NOW - 10 * 60 * 1000, // 10 min ago
        line_ttl: LINE_TTL.spread,
      }],
      sources: [{
        type: 'line',
        ref: 'https://book.com',
        data_version: '2025-week-20',
        data_timestamp: NOW - 10 * 60 * 1000,
      }],
    })

    expect(() => validateLineFreshness(alert)).not.toThrow()
  })

  it('FAIL: stale spread line (> 30 min)', () => {
    const alert = createValidAlert({
      evidence: [{
        stat: 'spread',
        value_num: -3.5,
        value_type: 'numeric',
        comparison: 'current',
        source_type: 'line',
        source_ref: 'https://book.com',
        line_type: 'spread',
        line_value: -3.5,
        line_odds: -110,
        book: 'DK',
        line_timestamp: NOW - 60 * 60 * 1000, // 60 min ago
        line_ttl: LINE_TTL.spread,
      }],
      sources: [{
        type: 'line',
        ref: 'https://book.com',
        data_version: '2025-week-20',
        data_timestamp: NOW - 60 * 60 * 1000,
      }],
    })

    expect(() => validateLineFreshness(alert)).toThrow(ValidationError)
    expect(() => validateLineFreshness(alert)).toThrow(/stale.*spread/i)
  })

  it('FAIL: stale prop line (> 15 min)', () => {
    const alert = createValidAlert({
      evidence: [{
        stat: 'player_yards',
        value_num: 75.5,
        value_type: 'numeric',
        comparison: 'current',
        source_type: 'line',
        source_ref: 'https://book.com',
        line_type: 'prop',
        line_value: 75.5,
        line_odds: -110,
        book: 'DK',
        line_timestamp: NOW - 20 * 60 * 1000, // 20 min ago
        line_ttl: LINE_TTL.prop,
      }],
      sources: [{
        type: 'line',
        ref: 'https://book.com',
        data_version: '2025-week-20',
        data_timestamp: NOW - 20 * 60 * 1000,
      }],
    })

    expect(() => validateLineFreshness(alert)).toThrow(ValidationError)
    expect(() => validateLineFreshness(alert)).toThrow(/stale.*prop/i)
  })
})

// =============================================================================
// EDGE LANGUAGE TESTS
// =============================================================================

describe('validateNoEdgeWithoutLine', () => {
  it('PASS: normal claim without edge language', () => {
    const alert = createValidAlert({
      claim: 'Receiving EPA ranks top 5 in league vs opponent average',
    })
    expect(() => validateNoEdgeWithoutLine(alert)).not.toThrow()
  })

  it('PASS: edge language WITH line evidence', () => {
    const alert = createValidAlert({
      claim: 'This spread offers clear value',
      evidence: [{
        stat: 'spread',
        value_num: -3.5,
        value_type: 'numeric',
        comparison: 'current',
        source_type: 'line',
        source_ref: 'https://book.com',
        line_type: 'spread',
        line_value: -3.5,
        line_odds: -110,
        book: 'DK',
        line_timestamp: NOW - 5 * 60 * 1000,
        line_ttl: LINE_TTL.spread,
      }],
      sources: [{
        type: 'line',
        ref: 'https://book.com',
        data_version: '2025-week-20',
        data_timestamp: NOW - 5 * 60 * 1000,
      }],
    })
    expect(() => validateNoEdgeWithoutLine(alert)).not.toThrow()
  })

  const edgeClaims = [
    'This is a clear edge against the market',
    'Great value on this line',
    'The spread is mispriced here',
    'Time to exploit this matchup',
    'Sharp money favors the over',
    'This is a lock for the week',
  ]

  for (const claim of edgeClaims) {
    it(`FAIL: "${claim.slice(0, 30)}..." without LineEvidence`, () => {
      const alert = createValidAlert({ claim })
      expect(() => validateNoEdgeWithoutLine(alert)).toThrow(ValidationError)
      expect(() => validateNoEdgeWithoutLine(alert)).toThrow(/edge language/i)
    })
  }
})

// =============================================================================
// IMPLICATIONS TESTS
// =============================================================================

describe('validateImplications', () => {
  it('PASS: EPA agent with valid implications', () => {
    const alert = createValidAlert({
      agent: 'epa',
      implications: ['wr_receptions_over', 'wr_yards_over'],
    })
    expect(() => validateImplications(alert)).not.toThrow()
  })

  it('FAIL: EPA agent with pressure implication', () => {
    const alert = createValidAlert({
      agent: 'epa',
      implications: ['qb_sacks_over'], // Not in EPA allowlist
    })
    expect(() => validateImplications(alert)).toThrow(ValidationError)
    expect(() => validateImplications(alert)).toThrow(/cannot imply.*qb_sacks_over/i)
  })

  it('FAIL: Weather agent with QB implication', () => {
    const alert = createValidAlert({
      agent: 'weather',
      implications: ['qb_pass_tds_over'], // Not in weather allowlist
    })
    expect(() => validateImplications(alert)).toThrow(ValidationError)
  })

  it('PASS: Pressure agent with valid implications', () => {
    const alert = createValidAlert({
      agent: 'pressure',
      implications: ['qb_sacks_over', 'qb_ints_over'],
    })
    expect(() => validateImplications(alert)).not.toThrow()
  })
})

// =============================================================================
// ID/AGENT MATCH TESTS
// =============================================================================

describe('validateIdAgentMatch', () => {
  it('PASS: ID and agent match', () => {
    const alert = createValidAlert()
    const finding = createValidFinding()
    expect(() => validateIdAgentMatch(alert, finding)).not.toThrow()
  })

  it('FAIL: ID mismatch', () => {
    const alert = createValidAlert({ id: 'different-id' })
    const finding = createValidFinding({ id: 'test-001' })
    expect(() => validateIdAgentMatch(alert, finding)).toThrow(ValidationError)
    expect(() => validateIdAgentMatch(alert, finding)).toThrow(/id mismatch/i)
  })

  it('FAIL: Agent mismatch', () => {
    const alert = createValidAlert({ agent: 'pressure' })
    const finding = createValidFinding({ agent: 'epa' })
    expect(() => validateIdAgentMatch(alert, finding)).toThrow(ValidationError)
    expect(() => validateIdAgentMatch(alert, finding)).toThrow(/agent mismatch/i)
  })
})

// =============================================================================
// CONFIDENCE IMMUTABILITY TESTS
// =============================================================================

describe('validateConfidenceImmutability', () => {
  it('PASS: confidence matches expected', () => {
    const alert = createValidAlert({ confidence: 0.75 })
    expect(() => validateConfidenceImmutability(alert, 0.75)).not.toThrow()
  })

  it('PASS: allows tiny floating point difference', () => {
    const alert = createValidAlert({ confidence: 0.750001 })
    expect(() => validateConfidenceImmutability(alert, 0.75)).not.toThrow()
  })

  it('FAIL: confidence was modified', () => {
    const alert = createValidAlert({ confidence: 0.9 })
    expect(() => validateConfidenceImmutability(alert, 0.75)).toThrow(ValidationError)
    expect(() => validateConfidenceImmutability(alert, 0.75)).toThrow(/modified/i)
  })
})

// =============================================================================
// FULL VALIDATION CHAIN TESTS
// =============================================================================

describe('validateAlert (full chain)', () => {
  it('PASS: fully valid alert', () => {
    const alert = createValidAlert()
    const finding = createValidFinding()
    expect(() => validateAlert(alert, finding, 0.75)).not.toThrow()
  })

  it('FAIL: cascades first error found', () => {
    const alert = createValidAlert({
      id: 'wrong-id',
      confidence: 0.99,
    })
    const finding = createValidFinding()

    expect(() => validateAlert(alert, finding, 0.75)).toThrow(ValidationError)
  })
})

describe('validateAlerts (batch)', () => {
  it('returns valid alerts and collects errors', () => {
    const goodAlert = createValidAlert({ id: 'good-001' })
    const badAlert = createValidAlert({
      id: 'bad-001',
      implications: ['qb_sacks_over'], // Invalid for EPA agent
    })

    const goodFinding = createValidFinding({ id: 'good-001' })
    const badFinding = createValidFinding({ id: 'bad-001' })

    const result = validateAlerts(
      [goodAlert, badAlert],
      [goodFinding, badFinding],
      new Map([['good-001', 0.75], ['bad-001', 0.75]])
    )

    expect(result.valid).toHaveLength(1)
    expect(result.valid[0].id).toBe('good-001')
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].alertId).toBe('bad-001')
    expect(result.errors[0].error.code).toBe('INVALID_IMPLICATIONS')
  })
})
