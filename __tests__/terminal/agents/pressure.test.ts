import { describe, it, expect } from 'vitest'
import { PRESSURE_THRESHOLDS, checkPressureThresholds } from '@/lib/terminal/agents/pressure/thresholds'

describe('PRESSURE_THRESHOLDS', () => {
  it('has defined threshold values', () => {
    expect(PRESSURE_THRESHOLDS.pressureRateRank).toBe(10)
    expect(PRESSURE_THRESHOLDS.passBlockWinRateRank).toBe(22)
    expect(PRESSURE_THRESHOLDS.qbPressuredRatingThreshold).toBe(60)
  })
})

describe('checkPressureThresholds', () => {
  const NOW = Date.now()

  it('returns finding when pressure mismatch exists', () => {
    const defenseData = {
      team: 'SF',
      pressure_rate: 42,
      pressure_rate_rank: 3,
    }
    const offenseData = {
      team: 'SEA',
      qb_name: 'Sam Darnold',
      pass_block_win_rate_rank: 28,
      qb_passer_rating_under_pressure: 31.2,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkPressureThresholds(defenseData, offenseData, context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].agent).toBe('pressure')
    expect(findings[0].type).toBe('pressure_rate_advantage')
    expect(findings[0].value_num).toBe(3)
  })

  it('returns QB vulnerability finding when pressure mismatch and bad rating', () => {
    const defenseData = {
      team: 'SF',
      pressure_rate: 42,
      pressure_rate_rank: 3,
    }
    const offenseData = {
      team: 'SEA',
      qb_name: 'Sam Darnold',
      pass_block_win_rate_rank: 28,
      qb_passer_rating_under_pressure: 31.2, // Below 60 threshold
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkPressureThresholds(defenseData, offenseData, context)

    expect(findings.length).toBe(2)
    expect(findings.map(f => f.type)).toContain('pressure_rate_advantage')
    expect(findings.map(f => f.type)).toContain('qb_pressure_vulnerability')
  })

  it('returns empty when defense pressure rank not elite', () => {
    const defenseData = {
      team: 'CHI',
      pressure_rate: 28,
      pressure_rate_rank: 20, // Not elite
    }
    const offenseData = {
      team: 'DET',
      qb_name: 'Jared Goff',
      pass_block_win_rate_rank: 28,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkPressureThresholds(defenseData, offenseData, context)

    expect(findings.length).toBe(0)
  })

  it('returns empty when OL not vulnerable', () => {
    const defenseData = {
      team: 'SF',
      pressure_rate: 42,
      pressure_rate_rank: 3,
    }
    const offenseData = {
      team: 'PHI',
      qb_name: 'Jalen Hurts',
      pass_block_win_rate_rank: 5, // Elite OL
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkPressureThresholds(defenseData, offenseData, context)

    expect(findings.length).toBe(0)
  })

  it('returns only pressure finding when QB handles pressure well', () => {
    const defenseData = {
      team: 'SF',
      pressure_rate: 42,
      pressure_rate_rank: 3,
    }
    const offenseData = {
      team: 'KC',
      qb_name: 'Patrick Mahomes',
      pass_block_win_rate_rank: 25,
      qb_passer_rating_under_pressure: 85.0, // Handles pressure well
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkPressureThresholds(defenseData, offenseData, context)

    expect(findings.length).toBe(1)
    expect(findings[0].type).toBe('pressure_rate_advantage')
  })

  it('generates correct source reference', () => {
    const defenseData = {
      team: 'SF',
      pressure_rate: 42,
      pressure_rate_rank: 3,
    }
    const offenseData = {
      team: 'SEA',
      qb_name: 'Geno Smith',
      pass_block_win_rate_rank: 28,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkPressureThresholds(defenseData, offenseData, context)

    expect(findings[0].source_ref).toBe('local://data/pressure/2025-week-20.json')
    expect(findings[0].source_type).toBe('local')
    expect(findings[0].source_timestamp).toBe(NOW)
  })
})
