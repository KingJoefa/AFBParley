import { describe, it, expect } from 'vitest'
import { USAGE_THRESHOLDS, checkUsageThresholds } from '@/lib/terminal/agents/usage/thresholds'

describe('USAGE_THRESHOLDS', () => {
  it('has defined threshold values', () => {
    expect(USAGE_THRESHOLDS.snap_pct_high).toBe(0.80)
    expect(USAGE_THRESHOLDS.snap_pct_low).toBe(0.50)
    expect(USAGE_THRESHOLDS.target_share_high).toBe(0.25)
    expect(USAGE_THRESHOLDS.target_share_elite).toBe(0.30)
    expect(USAGE_THRESHOLDS.trend_rising).toBe(0.05)
    expect(USAGE_THRESHOLDS.trend_falling).toBe(-0.05)
  })

  it('has defined suppression thresholds', () => {
    expect(USAGE_THRESHOLDS.min_games_in_window).toBe(4)
    expect(USAGE_THRESHOLDS.min_routes_sample).toBe(50)
    expect(USAGE_THRESHOLDS.min_targets_sample).toBe(15)
  })
})

describe('checkUsageThresholds', () => {
  const NOW = Date.now()

  it('returns finding for elite target share', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      players: {
        KC: [
          {
            name: 'Travis Kelce',
            team: 'KC',
            position: 'TE',
            target_share_l4: 0.32, // Elite threshold (0.30)
            target_share_season: 0.28,
            games_in_window: 4,
            routes_sample: 100,
            targets_sample: 30,
          },
        ],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkUsageThresholds(context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].agent).toBe('usage')
    expect(findings[0].finding_type).toBe('target_share_elite')
    expect(findings[0].payload?.target_share_l4).toBe(0.32)
  })

  it('returns finding for alpha target share', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      players: {
        KC: [
          {
            name: 'Rashee Rice',
            team: 'KC',
            position: 'WR',
            target_share_l4: 0.26, // Alpha threshold (0.25)
            target_share_season: 0.22,
            games_in_window: 4,
            routes_sample: 80,
            targets_sample: 20,
          },
        ],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkUsageThresholds(context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].finding_type).toBe('target_share_alpha')
  })

  it('returns finding for volume workhorse (RB with high snap %)', () => {
    const context = {
      homeTeam: 'SF',
      awayTeam: 'SEA',
      players: {
        SF: [
          {
            name: 'Christian McCaffrey',
            team: 'SF',
            position: 'RB',
            snap_pct_l4: 0.85, // High threshold (0.80)
            snap_pct_season: 0.82,
            games_in_window: 4,
          },
        ],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkUsageThresholds(context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].finding_type).toBe('volume_workhorse')
    expect(findings[0].payload?.snap_pct_l4).toBe(0.85)
  })

  it('returns finding for usage trending up', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      players: {
        KC: [
          {
            name: 'Xavier Worthy',
            team: 'KC',
            position: 'WR',
            snap_pct_season: 0.55,
            snap_pct_l4: 0.65, // +10% delta (threshold is +5%)
            games_in_window: 4,
          },
        ],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkUsageThresholds(context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].finding_type).toBe('usage_trending_up')
    expect(findings[0].payload?.trend).toBe('rising')
  })

  it('returns finding for usage trending down', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      players: {
        KC: [
          {
            name: 'Marquez Valdes-Scantling',
            team: 'KC',
            position: 'WR',
            snap_pct_season: 0.60,
            snap_pct_l4: 0.50, // -10% delta (threshold is -5%)
            games_in_window: 4,
          },
        ],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkUsageThresholds(context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].finding_type).toBe('usage_trending_down')
    expect(findings[0].payload?.trend).toBe('falling')
  })

  it('returns finding for snap share committee', () => {
    const context = {
      homeTeam: 'DEN',
      awayTeam: 'LV',
      players: {
        DEN: [
          {
            name: 'Javonte Williams',
            team: 'DEN',
            position: 'RB',
            snap_pct_l4: 0.45, // Low threshold (0.50)
            snap_pct_season: 0.48,
            games_in_window: 4,
          },
        ],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkUsageThresholds(context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].finding_type).toBe('snap_share_committee')
  })

  it('suppresses when games_in_window is insufficient', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      players: {
        KC: [
          {
            name: 'Travis Kelce',
            team: 'KC',
            position: 'TE',
            target_share_l4: 0.35, // Would be elite, but...
            games_in_window: 2, // Too few games
          },
        ],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkUsageThresholds(context)

    expect(findings.length).toBe(0)
  })

  it('suppresses when injury_limited is true', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      players: {
        KC: [
          {
            name: 'Travis Kelce',
            team: 'KC',
            position: 'TE',
            target_share_l4: 0.35,
            games_in_window: 4,
            injury_limited: true,
          },
        ],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkUsageThresholds(context)

    expect(findings.length).toBe(0)
  })

  it('suppresses when routes_sample is insufficient', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      players: {
        KC: [
          {
            name: 'Travis Kelce',
            team: 'KC',
            position: 'TE',
            target_share_l4: 0.35,
            games_in_window: 4,
            routes_sample: 30, // Below 50 threshold
          },
        ],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkUsageThresholds(context)

    expect(findings.length).toBe(0)
  })

  it('returns empty for no players', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      players: {},
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkUsageThresholds(context)

    expect(findings.length).toBe(0)
  })

  it('skips non-skill positions', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      players: {
        KC: [
          {
            name: 'Patrick Mahomes',
            team: 'KC',
            position: 'QB', // Not a skill position for usage
            snap_pct_l4: 0.99,
            games_in_window: 4,
          },
        ],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkUsageThresholds(context)

    expect(findings.length).toBe(0)
  })

  it('generates deterministic IDs', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      players: {
        KC: [
          {
            name: 'Test Player',
            team: 'KC',
            position: 'WR',
            target_share_l4: 0.35,
            games_in_window: 4,
          },
        ],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkUsageThresholds(context)

    expect(findings[0].id).toMatch(/^usage-kc-test-player-\d+$/)
  })

  it('calculates confidence based on sample size', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      players: {
        KC: [
          {
            name: 'Travis Kelce',
            team: 'KC',
            position: 'TE',
            target_share_l4: 0.32,
            games_in_window: 4,
            routes_sample: 100,
            targets_sample: 30,
          },
        ],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkUsageThresholds(context)

    // Full sample should give higher confidence
    expect(findings[0].confidence).toBeGreaterThanOrEqual(0.7)
  })

  it('has valid implications', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      players: {
        KC: [
          {
            name: 'Travis Kelce',
            team: 'KC',
            position: 'TE',
            target_share_l4: 0.32,
            games_in_window: 4,
          },
        ],
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const findings = checkUsageThresholds(context)

    expect(findings[0].implication).toBeDefined()
    // Elite target share should have receptions/yards over implication
    expect(['wr_receptions_over', 'wr_yards_over', 'wr_tds_over']).toContain(findings[0].implication)
  })
})
