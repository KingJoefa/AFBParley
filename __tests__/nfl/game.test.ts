import { describe, expect, it } from 'vitest'
import { createGameId, createSnapshotId, GameSnapshotSchema } from '@/lib/nfl/game'

describe('canonical NFL game contracts', () => {
  it('creates stable season and week scoped IDs', () => {
    const gameId = createGameId({ season: 2025, week: 22, awayTeam: 'NE', homeTeam: 'SEA' })
    expect(gameId).toBe('2025-wk22-NE-at-SEA')
    expect(createSnapshotId(gameId, 'notes-v1')).toBe('2025-wk22-NE-at-SEA:notes-v1')
  })

  it('validates a provenance-bearing snapshot', () => {
    const gameId = '2025-wk22-NE-at-SEA'
    const snapshot = GameSnapshotSchema.parse({
      snapshot_id: `${gameId}:notes-v1`,
      game_id: gameId,
      captured_at: '2026-02-08T18:00:00Z',
      data_version: 'notes-v1',
      game: {
        game_id: gameId,
        season: 2025,
        week: 22,
        round: 'Super Bowl LX',
        away_team: 'NE',
        home_team: 'SEA',
        kickoff: '2026-02-08T23:30:00Z',
        neutral_site: true,
        status: 'scheduled',
        display: 'New England Patriots @ Seattle Seahawks',
      },
      availability: {
        schedule: 'available',
        odds: 'available',
        injuries: 'available',
        projections: 'degraded',
        notes: 'available',
      },
      provenance: [{
        source: 'curated-notes',
        observed_at: '2026-02-08T18:00:00Z',
        source_version: 'notes-v1',
      }],
    })

    expect(snapshot.game.neutral_site).toBe(true)
  })

  it('rejects snapshots that point at a different game', () => {
    const result = GameSnapshotSchema.safeParse({
      snapshot_id: 'snapshot-1',
      game_id: '2025-wk21-NE-at-DEN',
      captured_at: '2026-02-08T18:00:00Z',
      data_version: 'notes-v1',
      game: {
        game_id: '2025-wk22-NE-at-SEA',
        season: 2025,
        week: 22,
        away_team: 'NE',
        home_team: 'SEA',
        kickoff: '2026-02-08T23:30:00Z',
        display: 'New England Patriots @ Seattle Seahawks',
      },
      availability: {
        schedule: 'available',
        odds: 'missing',
        injuries: 'missing',
        projections: 'missing',
        notes: 'available',
      },
      provenance: [{ source: 'curated-notes', observed_at: '2026-02-08T18:00:00Z' }],
    })

    expect(result.success).toBe(false)
  })
})
