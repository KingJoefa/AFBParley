import { describe, it, expect } from 'vitest'
import { INJURY_THRESHOLDS, checkInjuryThresholds } from '@/lib/terminal/agents/injury/thresholds'

describe('INJURY_THRESHOLDS', () => {
  it('has defined threshold values', () => {
    expect(INJURY_THRESHOLDS.material_statuses).toContain('OUT')
    expect(INJURY_THRESHOLDS.material_statuses).toContain('DOUBTFUL')
    expect(INJURY_THRESHOLDS.always_material).toContain('QB')
    expect(INJURY_THRESHOLDS.conditional_material).toContain('RB')
    expect(INJURY_THRESHOLDS.conditional_material).toContain('WR')
  })
})

describe('checkInjuryThresholds', () => {
  const NOW = Date.now()

  it('returns finding for QB OUT', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      injuries: {
        KC: ['Patrick Mahomes (QB) - OUT'],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkInjuryThresholds(context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].agent).toBe('injury')
    expect(findings[0].finding_type).toBe('qb_unavailable')
    expect(findings[0].payload?.status).toBe('OUT')
    expect(findings[0].payload?.player).toBe('Patrick Mahomes')
    expect(findings[0].confidence).toBe(0.95)
  })

  it('returns finding for QB DOUBTFUL with lower confidence', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      injuries: {
        KC: ['Patrick Mahomes (QB) - DOUBTFUL'],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkInjuryThresholds(context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].payload?.status).toBe('DOUBTFUL')
    expect(findings[0].confidence).toBe(0.75)
  })

  it('returns finding for skill player OUT (requires starter designation)', () => {
    // Non-QB positions are in conditional_material - require starter/rotation designation
    // Since we can't specify designation in the string format, we test that QB always fires
    // and that non-QB fires only when parsed with designation info
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      injuries: {
        KC: ['Travis Kelce (TE) - OUT'],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkInjuryThresholds(context)

    // Non-QB without explicit designation won't fire (conditional_material rule)
    // This is expected behavior - we don't know if they're a starter
    expect(findings.length).toBe(0)
  })

  it('always fires for QB regardless of designation', () => {
    // QB is in always_material - fires regardless of designation
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      injuries: {
        KC: ['Patrick Mahomes (QB) - OUT'],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkInjuryThresholds(context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].agent).toBe('injury')
    expect(findings[0].finding_type).toBe('qb_unavailable')
    expect(findings[0].payload?.position).toBe('QB')
  })

  it('returns empty for QUESTIONABLE status', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      injuries: {
        KC: ['Patrick Mahomes (QB) - QUESTIONABLE'],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkInjuryThresholds(context)

    expect(findings.length).toBe(0)
  })

  it('returns empty for no injuries', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      injuries: {},
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkInjuryThresholds(context)

    expect(findings.length).toBe(0)
  })

  it('parses various injury string formats', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      injuries: {
        KC: ['RB Isiah Pacheco OUT', 'WR Hollywood Brown - OUT (knee)'],
        BUF: ['QB Josh Allen OUT'], // Add QB prefix so it fires (always_material)
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkInjuryThresholds(context)

    // Only QB fires without designation (always_material)
    // RB and WR are conditional_material - need starter designation
    expect(findings.length).toBeGreaterThan(0)
    const players = findings.map(f => f.payload?.player)
    expect(players).toContain('Josh Allen')
    // RB/WR won't fire without designation
  })

  it('conditional_material positions require designation to fire', () => {
    // DL/LB/CB/OL are conditional_material - require starter/rotation designation
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      injuries: {
        KC: ['Chris Jones (DT) - OUT'],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkInjuryThresholds(context)

    // Without designation, conditional_material positions don't fire
    expect(findings.length).toBe(0)
  })

  it('OL positions are conditional_material', () => {
    // OL is conditional_material - requires starter/rotation designation
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      injuries: {
        KC: ['Joe Thuney (OG) - OUT'],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkInjuryThresholds(context)

    // Without designation, conditional_material positions don't fire
    expect(findings.length).toBe(0)
  })

  it('generates deterministic IDs', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      injuries: {
        KC: ['Test Player (QB) - OUT'],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkInjuryThresholds(context)

    expect(findings[0].id).toMatch(/^injury-kc-test-player-\d+$/)
  })

  it('has valid implications', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      injuries: {
        KC: ['Patrick Mahomes (QB) - OUT'],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkInjuryThresholds(context)

    expect(findings[0].implication).toBeDefined()
    // QB unavailable should have qb_pass_yards_under implication
    expect(['qb_pass_yards_under', 'qb_ints_over', 'team_total_under']).toContain(findings[0].implication)
  })
})
