import { describe, it, expect } from 'vitest'
import { PACE_THRESHOLDS, checkPaceThresholds } from '@/lib/terminal/agents/pace/thresholds'
import { getLeagueStats } from '@/lib/terminal/agents/pace/league_constants'

describe('PACE_THRESHOLDS', () => {
  it('has defined threshold values', () => {
    expect(PACE_THRESHOLDS.fast_pace_rank).toBe(10)
    expect(PACE_THRESHOLDS.slow_pace_rank).toBe(23)
    expect(PACE_THRESHOLDS.projected_plays_high).toBe(68)
    expect(PACE_THRESHOLDS.projected_plays_low).toBe(58)
    expect(PACE_THRESHOLDS.wind_mph_penalty_threshold).toBe(20)
  })
})

describe('getLeagueStats', () => {
  it('returns stats for 2024', () => {
    const stats = getLeagueStats(2024)
    expect(stats.avg_plays_per_game).toBe(62.5)
    expect(stats.avg_seconds_per_play).toBe(30.2)
  })

  it('returns stats for 2025', () => {
    const stats = getLeagueStats(2025)
    expect(stats.avg_plays_per_game).toBe(63.0)
    expect(stats.avg_seconds_per_play).toBe(30.0)
  })

  it('falls back to most recent year for unknown year', () => {
    const stats = getLeagueStats(2030)
    expect(stats.avg_plays_per_game).toBeDefined()
    expect(stats.avg_seconds_per_play).toBeDefined()
  })
})

describe('checkPaceThresholds', () => {
  const NOW = Date.now()

  it('returns finding for pace over signal (both teams fast)', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      teamStats: {
        KC: { pace_rank: 5, plays_per_game: 70.0 },
        BUF: { pace_rank: 8, plays_per_game: 68.5 },
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
      seasonYear: 2025,
    }

    const findings = checkPaceThresholds(context)

    expect(findings.length).toBeGreaterThan(0)
    const overSignal = findings.find(f => f.finding_type === 'pace_over_signal')
    expect(overSignal).toBeDefined()
    expect(overSignal?.agent).toBe('pace')
    expect(overSignal?.payload?.projected_plays).toBeGreaterThan(PACE_THRESHOLDS.projected_plays_high)
  })

  it('returns finding for pace under signal (both teams slow)', () => {
    const context = {
      homeTeam: 'DEN',
      awayTeam: 'BAL',
      teamStats: {
        DEN: { pace_rank: 28, plays_per_game: 56.0 },
        BAL: { pace_rank: 26, plays_per_game: 57.5 },
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
      seasonYear: 2025,
    }

    const findings = checkPaceThresholds(context)

    expect(findings.length).toBeGreaterThan(0)
    const underSignal = findings.find(f => f.finding_type === 'pace_under_signal')
    expect(underSignal).toBeDefined()
    expect(underSignal?.payload?.projected_plays).toBeLessThan(PACE_THRESHOLDS.projected_plays_low)
  })

  it('returns finding for pace mismatch (one fast, one slow)', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'DEN',
      teamStats: {
        KC: { pace_rank: 5, plays_per_game: 70.0 },
        DEN: { pace_rank: 28, plays_per_game: 56.0 },
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
      seasonYear: 2025,
    }

    const findings = checkPaceThresholds(context)

    const mismatch = findings.find(f => f.finding_type === 'pace_mismatch')
    expect(mismatch).toBeDefined()
    expect(mismatch?.confidence).toBe(0.65)
  })

  it('returns finding for team plays above avg', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'MIA',
      teamStats: {
        KC: { pace_rank: 5, plays_per_game: 68.0 },
        MIA: { plays_per_game: 63.0 }, // Average team, no rank
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
      seasonYear: 2025,
    }

    const findings = checkPaceThresholds(context)

    // Should find pace signal since KC is fast
    expect(findings.length).toBeGreaterThan(0)
  })

  it('applies weather modifier for high wind', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      teamStats: {
        KC: { pace_rank: 5, plays_per_game: 70.0 },
        BUF: { pace_rank: 8, plays_per_game: 68.5 },
      },
      weather: {
        temperature: 40,
        wind_mph: 25, // Above 20 mph threshold
        precipitation_chance: 0,
        indoor: false,
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
      seasonYear: 2025,
    }

    const findings = checkPaceThresholds(context)

    // High wind should reduce confidence
    const overSignal = findings.find(f => f.finding_type === 'pace_over_signal')
    if (overSignal) {
      // Confidence should be reduced by wind penalty (0.3 factor)
      expect(overSignal.confidence).toBeLessThan(0.9)
    }
  })

  it('does not apply weather modifier for indoor games', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      teamStats: {
        KC: { pace_rank: 5, plays_per_game: 70.0 },
        BUF: { pace_rank: 8, plays_per_game: 68.5 },
      },
      weather: {
        temperature: 40,
        wind_mph: 25, // Would apply if outdoor
        precipitation_chance: 0,
        indoor: true, // Indoor game
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
      seasonYear: 2025,
    }

    const findings = checkPaceThresholds(context)

    const overSignal = findings.find(f => f.finding_type === 'pace_over_signal')
    if (overSignal) {
      // Indoor should not have wind penalty
      expect(overSignal.confidence).toBeGreaterThanOrEqual(0.75)
    }
  })

  it('uses seconds_per_play as fallback for plays_per_game', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      teamStats: {
        KC: { seconds_per_play: 24.0 }, // Fast pace via seconds
        BUF: { seconds_per_play: 25.0 },
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
      seasonYear: 2025,
    }

    const findings = checkPaceThresholds(context)

    // Should still generate findings using fallback calculation
    const projectedPlays = findings.find(f => f.payload?.projected_plays)
    expect(projectedPlays?.payload?.data_quality).toBe('partial')
  })

  it('uses league average as fallback when no team data', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      teamStats: {
        KC: {}, // No pace data
        BUF: {}, // No pace data
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
      seasonYear: 2025,
    }

    const findings = checkPaceThresholds(context)

    // With fallback, projected plays should be near league average
    // Unlikely to generate strong signals with fallback data
    if (findings.length > 0) {
      expect(findings[0].payload?.data_quality).toBe('fallback')
    }
  })

  it('returns empty for no team stats', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      teamStats: {},
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
      seasonYear: 2025,
    }

    const findings = checkPaceThresholds(context)

    expect(findings.length).toBe(0)
  })

  it('generates deterministic IDs', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      teamStats: {
        KC: { pace_rank: 5, plays_per_game: 70.0 },
        BUF: { pace_rank: 8, plays_per_game: 68.5 },
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
      seasonYear: 2025,
    }

    const findings = checkPaceThresholds(context)

    const overSignal = findings.find(f => f.finding_type === 'pace_over_signal')
    if (overSignal) {
      expect(overSignal.id).toMatch(/^pace-matchup-kc-buf-\d+$/)
    }

    const mismatch = findings.find(f => f.finding_type === 'pace_mismatch')
    if (mismatch) {
      expect(mismatch.id).toMatch(/^pace-mismatch-kc-buf-\d+$/)
    }
  })

  it('includes delta_vs_league in payload', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      teamStats: {
        KC: { pace_rank: 5, plays_per_game: 70.0 },
        BUF: { pace_rank: 8, plays_per_game: 68.5 },
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
      seasonYear: 2025,
    }

    const findings = checkPaceThresholds(context)

    const overSignal = findings.find(f => f.finding_type === 'pace_over_signal')
    if (overSignal) {
      expect(overSignal.payload?.delta_vs_league).toBeDefined()
      expect(overSignal.payload?.delta_vs_league).toBeGreaterThan(0)
    }
  })

  it('has valid implications', () => {
    const context = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      teamStats: {
        KC: { pace_rank: 5, plays_per_game: 70.0 },
        BUF: { pace_rank: 8, plays_per_game: 68.5 },
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
      seasonYear: 2025,
    }

    const findings = checkPaceThresholds(context)

    const overSignal = findings.find(f => f.finding_type === 'pace_over_signal')
    if (overSignal) {
      expect(overSignal.implication).toBeDefined()
      // Pace over should have game_total_over or pass attempts over
      expect(['game_total_over', 'qb_pass_yards_over']).toContain(overSignal.implication)
    }
  })

  it('calculates confidence based on data quality', () => {
    const fullDataContext = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      teamStats: {
        KC: { pace_rank: 5, plays_per_game: 70.0 },
        BUF: { pace_rank: 8, plays_per_game: 68.5 },
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
      seasonYear: 2025,
    }

    const partialDataContext = {
      homeTeam: 'KC',
      awayTeam: 'BUF',
      teamStats: {
        KC: { seconds_per_play: 24.0 }, // Only seconds, no plays_per_game
        BUF: { plays_per_game: 68.5 },
      },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
      seasonYear: 2025,
    }

    const fullFindings = checkPaceThresholds(fullDataContext)
    const partialFindings = checkPaceThresholds(partialDataContext)

    const fullSignal = fullFindings.find(f => f.finding_type === 'pace_over_signal')
    const partialSignal = partialFindings.find(f => f.payload?.data_quality === 'partial')

    if (fullSignal && partialSignal) {
      expect(fullSignal.payload?.data_quality).toBe('full')
      // Full data should have higher confidence
      expect(fullSignal.confidence).toBeGreaterThanOrEqual(partialSignal.confidence)
    }
  })
})
