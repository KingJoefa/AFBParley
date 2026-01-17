import { describe, it, expect } from 'vitest'
import { WR_THRESHOLDS, checkWrThresholds } from '@/lib/terminal/agents/wr/thresholds'

describe('WR_THRESHOLDS', () => {
  it('has defined threshold values', () => {
    expect(WR_THRESHOLDS.targetShareRank).toBe(10)
    expect(WR_THRESHOLDS.defensePassRank).toBe(22)
    expect(WR_THRESHOLDS.minTargets).toBe(50)
  })
})

describe('checkWrThresholds', () => {
  const NOW = Date.now()

  it('returns finding for high target share vs bad defense', () => {
    const wrData = {
      name: 'Ja\'Marr Chase',
      team: 'CIN',
      target_share: 28,
      target_share_rank: 3,
      targets: 150,
    }
    const defenseData = {
      team: 'CLE',
      pass_defense_rank: 25,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkWrThresholds(wrData, defenseData, context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].agent).toBe('wr')
    expect(findings[0].type).toBe('wr_target_volume')
  })

  it('returns yardage advantage finding', () => {
    const wrData = {
      name: 'Tyreek Hill',
      team: 'MIA',
      receiving_yards: 1400,
      receiving_yards_rank: 2,
      targets: 140,
    }
    const defenseData = {
      team: 'NYJ',
      yards_allowed_to_wr_rank: 26,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkWrThresholds(wrData, defenseData, context)

    expect(findings.length).toBe(1)
    expect(findings[0].type).toBe('wr_yardage_advantage')
  })

  it('returns TD opportunity finding', () => {
    const wrData = {
      name: 'Davante Adams',
      team: 'NYJ',
      receiving_tds: 10,
      receiving_td_rank: 4,
      targets: 100,
    }
    const defenseData = {
      team: 'NE',
      td_allowed_to_wr_rank: 24,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkWrThresholds(wrData, defenseData, context)

    expect(findings.length).toBe(1)
    expect(findings[0].type).toBe('wr_td_opportunity')
  })

  it('returns separation finding', () => {
    const wrData = {
      name: 'CeeDee Lamb',
      team: 'DAL',
      separation: 3.2,
      separation_rank: 2,
      targets: 160,
    }
    const defenseData = {
      team: 'PHI',
      pass_defense_rank: 10,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkWrThresholds(wrData, defenseData, context)

    expect(findings.length).toBe(1)
    expect(findings[0].type).toBe('wr_separation_advantage')
  })

  it('returns empty when sample size too small', () => {
    const wrData = {
      name: 'Rookie WR',
      team: 'CAR',
      target_share: 20,
      target_share_rank: 5,
      targets: 30, // Too few
    }
    const defenseData = {
      team: 'ATL',
      pass_defense_rank: 30,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkWrThresholds(wrData, defenseData, context)

    expect(findings.filter(f => f.type === 'wr_target_volume').length).toBe(0)
  })

  it('returns multiple findings for elite WR', () => {
    const wrData = {
      name: 'Amon-Ra St. Brown',
      team: 'DET',
      target_share: 26,
      target_share_rank: 5,
      receiving_yards: 1200,
      receiving_yards_rank: 6,
      receiving_tds: 9,
      receiving_td_rank: 8,
      separation_rank: 4,
      targets: 145,
    }
    const defenseData = {
      team: 'GB',
      pass_defense_rank: 24,
      yards_allowed_to_wr_rank: 23,
      td_allowed_to_wr_rank: 25,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkWrThresholds(wrData, defenseData, context)

    expect(findings.length).toBe(4)
    expect(findings.map(f => f.type)).toContain('wr_target_volume')
    expect(findings.map(f => f.type)).toContain('wr_yardage_advantage')
    expect(findings.map(f => f.type)).toContain('wr_td_opportunity')
    expect(findings.map(f => f.type)).toContain('wr_separation_advantage')
  })
})
