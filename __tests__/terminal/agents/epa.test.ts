import { describe, it, expect } from 'vitest'
import { EPA_THRESHOLDS, checkEpaThresholds } from '@/lib/terminal/agents/epa/thresholds'

describe('EPA_THRESHOLDS', () => {
  it('has defined threshold values', () => {
    expect(EPA_THRESHOLDS.receivingEpaRank).toBe(10)
    expect(EPA_THRESHOLDS.epaAllowedRank).toBe(10)
    expect(EPA_THRESHOLDS.rushingEpaDiff).toBe(0.15)
  })
})

describe('checkEpaThresholds', () => {
  const NOW = Date.now()

  it('returns finding when receiving EPA rank meets threshold', () => {
    const playerData = {
      name: 'Jaxon Smith-Njigba',
      team: 'SEA',
      receiving_epa_rank: 3,
      targets: 120,
    }
    const opponentData = {
      team: 'SF',
      epa_allowed_to_wr_rank: 8,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkEpaThresholds(playerData, opponentData, context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].agent).toBe('epa')
    expect(findings[0].type).toBe('receiving_epa_mismatch')
    expect(findings[0].stat).toBe('receiving_epa_rank')
    expect(findings[0].value_num).toBe(3)
  })

  it('returns empty when player rank not in top 10', () => {
    const playerData = {
      name: 'Random Player',
      team: 'NYG',
      receiving_epa_rank: 45,
      targets: 80,
    }
    const opponentData = {
      team: 'DAL',
      epa_allowed_to_wr_rank: 5,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkEpaThresholds(playerData, opponentData, context)

    expect(findings.length).toBe(0)
  })

  it('returns empty when opponent defense not vulnerable', () => {
    const playerData = {
      name: 'Good Player',
      team: 'KC',
      receiving_epa_rank: 5,
      targets: 100,
    }
    const opponentData = {
      team: 'NE',
      epa_allowed_to_wr_rank: 25, // Good defense
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkEpaThresholds(playerData, opponentData, context)

    expect(findings.length).toBe(0)
  })

  it('returns empty when sample size too small', () => {
    const playerData = {
      name: 'New Player',
      team: 'CHI',
      receiving_epa_rank: 2,
      targets: 30, // Below threshold
    }
    const opponentData = {
      team: 'DET',
      epa_allowed_to_wr_rank: 5,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkEpaThresholds(playerData, opponentData, context)

    expect(findings.length).toBe(0)
  })

  it('returns finding for rushing EPA mismatch', () => {
    const playerData = {
      name: 'Christian McCaffrey',
      team: 'SF',
      rushing_epa_rank: 2,
      rushes: 200,
    }
    const opponentData = {
      team: 'SEA',
      epa_allowed_to_rb_rank: 6,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkEpaThresholds(playerData, opponentData, context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].agent).toBe('epa')
    expect(findings[0].type).toBe('rushing_epa_mismatch')
    expect(findings[0].stat).toBe('rushing_epa_rank')
  })

  it('returns multiple findings for dual-threat player', () => {
    const playerData = {
      name: 'Josh Allen',
      team: 'BUF',
      receiving_epa_rank: 8, // Hypothetical
      rushing_epa_rank: 5,
      targets: 60,
      rushes: 100,
    }
    const opponentData = {
      team: 'MIA',
      epa_allowed_to_wr_rank: 3,
      epa_allowed_to_rb_rank: 4,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkEpaThresholds(playerData, opponentData, context)

    expect(findings.length).toBe(2)
    expect(findings.map(f => f.type)).toContain('receiving_epa_mismatch')
    expect(findings.map(f => f.type)).toContain('rushing_epa_mismatch')
  })

  it('generates deterministic IDs', () => {
    const playerData = {
      name: 'Test Player',
      team: 'TEST',
      receiving_epa_rank: 5,
      targets: 100,
    }
    const opponentData = {
      team: 'OPP',
      epa_allowed_to_wr_rank: 5,
    }
    const context = {
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkEpaThresholds(playerData, opponentData, context)

    expect(findings[0].id).toMatch(/^epa-test-player-recv-\d+$/)
  })
})
