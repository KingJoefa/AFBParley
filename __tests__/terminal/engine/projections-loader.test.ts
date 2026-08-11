import { describe, expect, it } from 'vitest'
import {
  getCurrentWeekYear,
  loadMatchupProjections,
  loadProjections,
} from '@/lib/terminal/engine/projections-loader'

describe('projections loader identity', () => {
  it('normalizes legacy team codes at the file boundary', async () => {
    const players = await loadProjections({ year: 2025, week: 20 })
    const stafford = players.find(player => player.name === 'Matthew Stafford')
    expect(stafford?.team).toBe('LAR')
  })

  it('filters projections using canonical matchup codes', async () => {
    const players = await loadMatchupProjections('CHI', 'LAR', 20, 2025)
    expect(players.length).toBeGreaterThan(0)
    expect(new Set(players.map(player => player.team))).toEqual(new Set(['CHI', 'LAR']))
  })

  it('uses the selected schedule rather than calendar guessing', async () => {
    await expect(getCurrentWeekYear()).resolves.toEqual({ year: 2026, week: 1 })
  })
})
