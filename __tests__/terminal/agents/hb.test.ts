import { describe, it, expect } from 'vitest'
import { HB_THRESHOLDS, checkHbThresholds } from '@/lib/terminal/agents/hb/thresholds'

describe('HB_THRESHOLDS', () => {
  it('has defined threshold values', () => {
    expect(HB_THRESHOLDS.rushYardsRank).toBe(10)
    expect(HB_THRESHOLDS.defenseRushRank).toBe(22)
    expect(HB_THRESHOLDS.minCarries).toBe(80)
  })
})

describe('checkHbThresholds', () => {
  const NOW = Date.now()

  it('returns finding for elite rusher vs bad defense', () => {
    const hbData = {
      name: 'Derrick Henry',
      team: 'BAL',
      rush_yards: 1200,
      rush_yards_rank: 2,
      carries: 250,
    }
    const defenseData = {
      team: 'TEN',
      rush_defense_rank: 28,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkHbThresholds(hbData, defenseData, context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].agent).toBe('hb')
    expect(findings[0].type).toBe('hb_volume_advantage')
  })

  it('returns YPC efficiency finding', () => {
    const hbData = {
      name: 'Saquon Barkley',
      team: 'PHI',
      yards_per_carry: 5.8,
      yards_per_carry_rank: 3,
      carries: 200,
    }
    const defenseData = {
      team: 'NYG',
      rush_yards_allowed_rank: 25,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkHbThresholds(hbData, defenseData, context)

    expect(findings.length).toBe(1)
    expect(findings[0].type).toBe('hb_efficiency_advantage')
  })

  it('returns TD opportunity finding', () => {
    const hbData = {
      name: 'Josh Jacobs',
      team: 'GB',
      rush_tds: 12,
      rush_td_rank: 4,
      carries: 180,
    }
    const defenseData = {
      team: 'CHI',
      rush_td_allowed_rank: 26,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkHbThresholds(hbData, defenseData, context)

    expect(findings.length).toBe(1)
    expect(findings[0].type).toBe('hb_td_opportunity')
  })

  it('returns receiving back finding', () => {
    const hbData = {
      name: 'Christian McCaffrey',
      team: 'SF',
      receptions: 65,
      reception_rank: 2,
      carries: 200,
    }
    const defenseData = {
      team: 'SEA',
      rush_defense_rank: 15,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkHbThresholds(hbData, defenseData, context)

    expect(findings.length).toBe(1)
    expect(findings[0].type).toBe('hb_receiving_factor')
  })

  it('returns empty when sample size too small', () => {
    const hbData = {
      name: 'Backup RB',
      team: 'CAR',
      rush_yards: 200,
      rush_yards_rank: 5,
      carries: 40, // Too few
    }
    const defenseData = {
      team: 'ATL',
      rush_defense_rank: 30,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkHbThresholds(hbData, defenseData, context)

    expect(findings.filter(f => f.type === 'hb_volume_advantage').length).toBe(0)
  })

  it('returns multiple findings for complete back', () => {
    const hbData = {
      name: 'CMC',
      team: 'SF',
      rush_yards: 1100,
      rush_yards_rank: 3,
      yards_per_carry: 5.2,
      yards_per_carry_rank: 5,
      rush_tds: 10,
      rush_td_rank: 6,
      reception_rank: 1,
      carries: 220,
    }
    const defenseData = {
      team: 'ARI',
      rush_defense_rank: 28,
      rush_yards_allowed_rank: 26,
      rush_td_allowed_rank: 24,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkHbThresholds(hbData, defenseData, context)

    expect(findings.length).toBe(4)
    expect(findings.map(f => f.type)).toContain('hb_volume_advantage')
    expect(findings.map(f => f.type)).toContain('hb_efficiency_advantage')
    expect(findings.map(f => f.type)).toContain('hb_td_opportunity')
    expect(findings.map(f => f.type)).toContain('hb_receiving_factor')
  })
})
