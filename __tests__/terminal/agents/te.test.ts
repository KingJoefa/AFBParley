import { describe, it, expect } from 'vitest'
import { TE_THRESHOLDS, checkTeThresholds } from '@/lib/terminal/agents/te/thresholds'

describe('TE_THRESHOLDS', () => {
  it('has defined threshold values', () => {
    expect(TE_THRESHOLDS.targetShareRank).toBe(8)
    expect(TE_THRESHOLDS.defenseTeRank).toBe(22)
    expect(TE_THRESHOLDS.minTargets).toBe(40)
  })
})

describe('checkTeThresholds', () => {
  const NOW = Date.now()

  it('returns finding for elite TE vs bad TE defense', () => {
    const teData = {
      name: 'Travis Kelce',
      team: 'KC',
      target_share: 22,
      target_share_rank: 2,
      targets: 120,
    }
    const defenseData = {
      team: 'LV',
      te_defense_rank: 28,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkTeThresholds(teData, defenseData, context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].agent).toBe('te')
    expect(findings[0].type).toBe('te_target_volume')
  })

  it('returns yardage advantage finding', () => {
    const teData = {
      name: 'Sam LaPorta',
      team: 'DET',
      receiving_yards: 850,
      receiving_yards_rank: 3,
      targets: 90,
    }
    const defenseData = {
      team: 'CHI',
      yards_allowed_to_te_rank: 26,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkTeThresholds(teData, defenseData, context)

    expect(findings.length).toBe(1)
    expect(findings[0].type).toBe('te_yardage_advantage')
  })

  it('returns TD opportunity finding', () => {
    const teData = {
      name: 'Mark Andrews',
      team: 'BAL',
      receiving_tds: 8,
      receiving_td_rank: 2,
      targets: 80,
    }
    const defenseData = {
      team: 'CIN',
      td_allowed_to_te_rank: 24,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkTeThresholds(teData, defenseData, context)

    expect(findings.length).toBe(1)
    expect(findings[0].type).toBe('te_td_opportunity')
  })

  it('returns red zone factor finding', () => {
    const teData = {
      name: 'George Kittle',
      team: 'SF',
      red_zone_targets: 18,
      red_zone_target_rank: 3,
      targets: 75,
    }
    const defenseData = {
      team: 'SEA',
      te_defense_rank: 15,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkTeThresholds(teData, defenseData, context)

    expect(findings.length).toBe(1)
    expect(findings[0].type).toBe('te_red_zone_factor')
  })

  it('returns empty when sample size too small', () => {
    const teData = {
      name: 'Backup TE',
      team: 'NYG',
      target_share: 15,
      target_share_rank: 5,
      targets: 20, // Too few
    }
    const defenseData = {
      team: 'DAL',
      te_defense_rank: 30,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkTeThresholds(teData, defenseData, context)

    expect(findings.filter(f => f.type === 'te_target_volume').length).toBe(0)
  })

  it('returns multiple findings for elite TE', () => {
    const teData = {
      name: 'Travis Kelce',
      team: 'KC',
      target_share: 25,
      target_share_rank: 1,
      receiving_yards: 950,
      receiving_yards_rank: 1,
      receiving_tds: 9,
      receiving_td_rank: 1,
      red_zone_target_rank: 2,
      targets: 130,
    }
    const defenseData = {
      team: 'DEN',
      te_defense_rank: 26,
      yards_allowed_to_te_rank: 25,
      td_allowed_to_te_rank: 28,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkTeThresholds(teData, defenseData, context)

    expect(findings.length).toBe(4)
    expect(findings.map(f => f.type)).toContain('te_target_volume')
    expect(findings.map(f => f.type)).toContain('te_yardage_advantage')
    expect(findings.map(f => f.type)).toContain('te_td_opportunity')
    expect(findings.map(f => f.type)).toContain('te_red_zone_factor')
  })

  it('returns empty when defense is good vs TEs', () => {
    const teData = {
      name: 'Good TE',
      team: 'PHI',
      target_share: 20,
      target_share_rank: 4,
      targets: 80,
    }
    const defenseData = {
      team: 'SF',
      te_defense_rank: 5, // Good defense
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkTeThresholds(teData, defenseData, context)

    expect(findings.length).toBe(0)
  })
})
