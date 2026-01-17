import { describe, it, expect } from 'vitest'
import {
  calculateConfidence,
  confidenceInputsFromFinding,
  calculateFindingConfidence,
  type ConfidenceInputs,
} from '@/lib/terminal/engine/confidence'
import type { Finding } from '@/lib/terminal/schemas'

const NOW = Date.now()
const ONE_HOUR = 60 * 60 * 1000
const ONE_DAY = 24 * ONE_HOUR
const ONE_WEEK = 7 * ONE_DAY

describe('calculateConfidence', () => {
  it('returns baseline 0.5 with minimal inputs', () => {
    const inputs: ConfidenceInputs = {
      evidenceCount: 1,
      hasLocalSource: false,
      hasWebSource: false,
      webSourceAge: null,
      localDataAge: 0,
      sampleSize: null,
      hasLineEvidence: false,
      lineAge: null,
    }
    expect(calculateConfidence(inputs)).toBeCloseTo(0.5, 2)
  })

  it('increases with multiple evidence (+0.15 for 3+)', () => {
    const inputs: ConfidenceInputs = {
      evidenceCount: 3,
      hasLocalSource: false,
      hasWebSource: false,
      webSourceAge: null,
      localDataAge: 0,
      sampleSize: null,
      hasLineEvidence: false,
      lineAge: null,
    }
    expect(calculateConfidence(inputs)).toBeCloseTo(0.65, 2)
  })

  it('increases with local source (+0.10)', () => {
    const inputs: ConfidenceInputs = {
      evidenceCount: 1,
      hasLocalSource: true,
      hasWebSource: false,
      webSourceAge: null,
      localDataAge: 0,
      sampleSize: null,
      hasLineEvidence: false,
      lineAge: null,
    }
    expect(calculateConfidence(inputs)).toBeCloseTo(0.6, 2)
  })

  it('increases with fresh web source (+0.08)', () => {
    const inputs: ConfidenceInputs = {
      evidenceCount: 1,
      hasLocalSource: false,
      hasWebSource: true,
      webSourceAge: ONE_HOUR, // 1 hour old - fresh
      localDataAge: 0,
      sampleSize: null,
      hasLineEvidence: false,
      lineAge: null,
    }
    expect(calculateConfidence(inputs)).toBeCloseTo(0.58, 2)
  })

  it('no bonus for stale web source (> 4 hours)', () => {
    const inputs: ConfidenceInputs = {
      evidenceCount: 1,
      hasLocalSource: false,
      hasWebSource: true,
      webSourceAge: 5 * ONE_HOUR, // 5 hours old - stale
      localDataAge: 0,
      sampleSize: null,
      hasLineEvidence: false,
      lineAge: null,
    }
    expect(calculateConfidence(inputs)).toBeCloseTo(0.5, 2)
  })

  it('increases with large sample size (+0.12 for 100+)', () => {
    const inputs: ConfidenceInputs = {
      evidenceCount: 1,
      hasLocalSource: false,
      hasWebSource: false,
      webSourceAge: null,
      localDataAge: 0,
      sampleSize: 150,
      hasLineEvidence: false,
      lineAge: null,
    }
    expect(calculateConfidence(inputs)).toBeCloseTo(0.62, 2)
  })

  it('penalizes small sample size (-0.10 for < 50)', () => {
    const inputs: ConfidenceInputs = {
      evidenceCount: 1,
      hasLocalSource: false,
      hasWebSource: false,
      webSourceAge: null,
      localDataAge: 0,
      sampleSize: 25,
      hasLineEvidence: false,
      lineAge: null,
    }
    expect(calculateConfidence(inputs)).toBeCloseTo(0.4, 2)
  })

  it('increases with fresh line evidence (+0.10 for < 30 min)', () => {
    const inputs: ConfidenceInputs = {
      evidenceCount: 1,
      hasLocalSource: false,
      hasWebSource: false,
      webSourceAge: null,
      localDataAge: 0,
      sampleSize: null,
      hasLineEvidence: true,
      lineAge: 10 * 60 * 1000, // 10 min
    }
    expect(calculateConfidence(inputs)).toBeCloseTo(0.6, 2)
  })

  it('penalizes stale line evidence (-0.15 for > 2 hours)', () => {
    const inputs: ConfidenceInputs = {
      evidenceCount: 1,
      hasLocalSource: false,
      hasWebSource: false,
      webSourceAge: null,
      localDataAge: 0,
      sampleSize: null,
      hasLineEvidence: true,
      lineAge: 3 * ONE_HOUR, // 3 hours
    }
    expect(calculateConfidence(inputs)).toBeCloseTo(0.35, 2)
  })

  it('penalizes stale local data (-0.20 for > 7 days)', () => {
    const inputs: ConfidenceInputs = {
      evidenceCount: 1,
      hasLocalSource: true,
      hasWebSource: false,
      webSourceAge: null,
      localDataAge: 10 * ONE_DAY, // 10 days
      sampleSize: null,
      hasLineEvidence: false,
      lineAge: null,
    }
    // 0.5 + 0.10 (local) - 0.20 (stale) = 0.40
    expect(calculateConfidence(inputs)).toBeCloseTo(0.4, 2)
  })

  it('clamps to [0, 1] range', () => {
    const highInputs: ConfidenceInputs = {
      evidenceCount: 5,
      hasLocalSource: true,
      hasWebSource: true,
      webSourceAge: 1000,
      localDataAge: 0,
      sampleSize: 200,
      hasLineEvidence: true,
      lineAge: 1000,
    }
    expect(calculateConfidence(highInputs)).toBeLessThanOrEqual(1)
    expect(calculateConfidence(highInputs)).toBeGreaterThanOrEqual(0)

    const lowInputs: ConfidenceInputs = {
      evidenceCount: 1,
      hasLocalSource: false,
      hasWebSource: false,
      webSourceAge: null,
      localDataAge: 30 * ONE_DAY,
      sampleSize: 10,
      hasLineEvidence: true,
      lineAge: 10 * ONE_HOUR,
    }
    expect(calculateConfidence(lowInputs)).toBeGreaterThanOrEqual(0)
  })

  it('stacks bonuses correctly', () => {
    const inputs: ConfidenceInputs = {
      evidenceCount: 3,      // +0.15
      hasLocalSource: true,  // +0.10
      hasWebSource: false,
      webSourceAge: null,
      localDataAge: ONE_DAY, // no penalty
      sampleSize: 100,       // +0.12
      hasLineEvidence: false,
      lineAge: null,
    }
    // 0.5 + 0.15 + 0.10 + 0.12 = 0.87
    expect(calculateConfidence(inputs)).toBeCloseTo(0.87, 2)
  })
})

describe('confidenceInputsFromFinding', () => {
  it('builds inputs from local finding', () => {
    const finding: Finding = {
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
    }

    const inputs = confidenceInputsFromFinding(finding)

    expect(inputs.hasLocalSource).toBe(true)
    expect(inputs.hasWebSource).toBe(false)
    expect(inputs.evidenceCount).toBe(1)
    expect(inputs.localDataAge).toBeGreaterThan(0)
  })

  it('builds inputs from web finding', () => {
    const finding: Finding = {
      id: 'test-002',
      agent: 'pressure',
      type: 'pressure_rate_advantage',
      stat: 'pressure_rate',
      value_num: 42,
      value_type: 'numeric',
      threshold_met: 'rate >= 40%',
      comparison_context: 'top 3',
      source_ref: 'https://example.com/stats',
      source_type: 'web',
      source_timestamp: NOW - ONE_HOUR,
      quote_snippet: 'SF generates 42% pressure rate',
    }

    const inputs = confidenceInputsFromFinding(finding)

    expect(inputs.hasLocalSource).toBe(false)
    expect(inputs.hasWebSource).toBe(true)
    expect(inputs.webSourceAge).toBeGreaterThan(0)
  })
})

describe('calculateFindingConfidence', () => {
  it('calculates confidence for a finding', () => {
    const finding: Finding = {
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
    }

    const confidence = calculateFindingConfidence(finding)

    // 0.5 base + 0.10 local source = 0.60
    expect(confidence).toBeCloseTo(0.6, 2)
  })

  it('includes sample size if provided', () => {
    const finding: Finding = {
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
    }

    const confidence = calculateFindingConfidence(finding, { sampleSize: 120 })

    // 0.5 base + 0.10 local + 0.12 sample = 0.72
    expect(confidence).toBeCloseTo(0.72, 2)
  })
})
