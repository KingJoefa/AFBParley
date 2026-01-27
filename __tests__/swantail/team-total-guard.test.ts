import { describe, it, expect } from 'vitest'
import { enforceTeamTotalGuard } from '@/lib/swantail/team-total-guard'

const baseLeg = {
  market: 'Team Total',
  selection: 'Seahawks Under 44.5 Points',
  american_odds: -110,
  odds_source: 'illustrative' as const,
}

describe('enforceTeamTotalGuard', () => {
  it('corrects team total when line equals game total', () => {
    const result = enforceTeamTotalGuard(baseLeg, {
      gameTotal: 44.5,
      teamTotals: { home: 24.0, away: 20.5 },
      tolerance: 0.01,
    })

    expect(result.market).toBe('Game Total')
    expect(result.selection).toBe('Under 44.5 Points')
  })
})
