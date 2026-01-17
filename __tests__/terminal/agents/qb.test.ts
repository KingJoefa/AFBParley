import { describe, it, expect } from 'vitest'
import { QB_THRESHOLDS, checkQbThresholds } from '@/lib/terminal/agents/qb/thresholds'

describe('QB_THRESHOLDS', () => {
  it('has defined threshold values', () => {
    expect(QB_THRESHOLDS.qbRatingRank).toBe(10)
    expect(QB_THRESHOLDS.defensePassRank).toBe(22)
    expect(QB_THRESHOLDS.minAttempts).toBe(150)
  })
})

describe('checkQbThresholds', () => {
  const NOW = Date.now()

  it('returns finding for elite QB vs bad pass defense', () => {
    const qbData = {
      name: 'Josh Allen',
      team: 'BUF',
      qb_rating: 108.5,
      qb_rating_rank: 3,
      attempts: 400,
    }
    const defenseData = {
      team: 'MIA',
      pass_defense_rank: 28,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkQbThresholds(qbData, defenseData, context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].agent).toBe('qb')
    expect(findings[0].type).toBe('qb_rating_advantage')
  })

  it('returns empty when QB not elite', () => {
    const qbData = {
      name: 'Average QB',
      team: 'NYG',
      qb_rating: 85.0,
      qb_rating_rank: 18,
      attempts: 300,
    }
    const defenseData = {
      team: 'DAL',
      pass_defense_rank: 28,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkQbThresholds(qbData, defenseData, context)

    expect(findings.length).toBe(0)
  })

  it('returns empty when defense is good', () => {
    const qbData = {
      name: 'Patrick Mahomes',
      team: 'KC',
      qb_rating: 110.0,
      qb_rating_rank: 2,
      attempts: 450,
    }
    const defenseData = {
      team: 'SF',
      pass_defense_rank: 5, // Good defense
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkQbThresholds(qbData, defenseData, context)

    expect(findings.length).toBe(0)
  })

  it('returns turnover risk finding', () => {
    const qbData = {
      name: 'Jameis Winston',
      team: 'CLE',
      turnover_pct: 4.5,
      turnover_pct_rank: 28,
      attempts: 200,
    }
    const defenseData = {
      team: 'NE',
      interception_rate_rank: 3, // Ball-hawking defense
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkQbThresholds(qbData, defenseData, context)

    expect(findings.length).toBe(1)
    expect(findings[0].type).toBe('qb_turnover_risk')
  })

  it('returns YPA advantage finding', () => {
    const qbData = {
      name: 'Lamar Jackson',
      team: 'BAL',
      yards_per_attempt: 8.5,
      yards_per_attempt_rank: 2,
      attempts: 350,
    }
    const defenseData = {
      team: 'TEN',
      pass_yards_allowed_rank: 25,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkQbThresholds(qbData, defenseData, context)

    expect(findings.length).toBe(1)
    expect(findings[0].type).toBe('qb_ypa_advantage')
  })

  it('returns empty when sample size too small', () => {
    const qbData = {
      name: 'Rookie QB',
      team: 'CAR',
      qb_rating: 105.0,
      qb_rating_rank: 5,
      attempts: 50, // Too few
    }
    const defenseData = {
      team: 'ATL',
      pass_defense_rank: 30,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkQbThresholds(qbData, defenseData, context)

    expect(findings.length).toBe(0)
  })
})
