import { describe, expect, it, vi } from 'vitest'
import {
  GameSnapshotSchema,
  OBSERVATION_AGENT_IDS,
  type IngestionFeedResult,
} from '@/lib/data/contracts'
import { nflverseTeamStatsProvider } from '@/lib/data/providers/nflverse'
import { scheduleRestProvider } from '@/lib/data/providers/rest'
import { loadSchedule, type ScheduleGame } from '@/lib/nfl/schedule'
import type { ScenarioGame } from '@/lib/terminal/contracts'
import { resolveScenario } from '@/lib/terminal/scenario'

function providerContext(game: ScheduleGame, now: Date, fetcher: typeof fetch = fetch) {
  return {
    games: [game],
    season: game.season,
    week: game.week,
    now,
    fetch: fetcher,
  }
}

function scenarioGame(game: ScheduleGame): ScenarioGame {
  return {
    game_id: game.game_id,
    season: game.season,
    week: game.week,
    away_team: game.away_team,
    home_team: game.home_team,
    kickoff: game.kickoff,
    display: game.display,
    time: game.time,
  }
}

function snapshotFromFeed(params: {
  game: ScheduleGame
  feed: IngestionFeedResult
  capturedAt: string
}) {
  const availability = Object.fromEntries(OBSERVATION_AGENT_IDS.map(agentId => {
    const observations = params.feed.observations.filter(observation => observation.agent_id === agentId)
    return [agentId, observations.length
      ? {
          state: 'available',
          checked_at: params.feed.checked_at,
          observation_count: observations.length,
        }
      : {
          state: 'missing',
          checked_at: params.feed.checked_at,
          observation_count: 0,
        }]
  }))
  return GameSnapshotSchema.parse({
    snapshot_id: `snapshot_${params.game.game_id}`,
    game_id: params.game.game_id,
    captured_at: params.capturedAt,
    contract_version: 'observation-v1',
    game: params.game,
    observations: params.feed.observations,
    availability,
    content_hash: 'b'.repeat(64),
  })
}

describe('data-backed Game Agent findings', () => {
  it('cross-matches turnover and trenches profiles into material findings', async () => {
    const game = loadSchedule({ season: 2026, week: 1 }).games[0]
    const csv = [
      'season,week,team,season_type,attempts,carries,sacks_suffered,passing_epa,rushing_epa,passing_interceptions,fumbles_lost_total,def_interceptions,fumble_recovery_opp,def_fumbles_forced,def_sacks,def_qb_hits,def_tackles_for_loss',
      '2025,1,NE,REG,35,20,5,-4,-2,2,1,0,0,0,1,2,2',
      '2025,1,SEA,REG,30,28,1,8,4,0,0,2,1,2,4,7,6',
    ].join('\n')
    const fetcher = vi.fn(async () => new Response(csv, { status: 200 })) as unknown as typeof fetch
    const now = new Date('2026-08-15T12:00:00.000Z')
    const feed = await nflverseTeamStatsProvider.collect(providerContext(game, now, fetcher))
    const snapshot = snapshotFromFeed({ game, feed, capturedAt: now.toISOString() })
    const scenario = resolveScenario({
      game: scenarioGame(game),
      agentIds: ['trenches', 'turnovers'],
      snapshot,
      now,
    })

    expect(scenario.events.map(event => event.finding.state)).toEqual(['material', 'material'])
    expect(scenario.events.map(event => event.finding.direction)).toEqual(['home', 'home'])
    expect(scenario.events[0].finding.caveats.join(' ')).toContain('proxy')
    expect(scenario.events[1].finding.signals.map(signal => signal.label)).toContain('Cross-match exposure')
    expect(scenario.suggested_anchor_ids).toEqual(['home_win', 'high_variance', 'run_heavy'])
  })

  it('turns a real schedule gap into a directional Rest finding', async () => {
    const game = loadSchedule({ season: 2026, week: 2 }).games.find(candidate => (
      candidate.away_team === 'PIT' && candidate.home_team === 'NE'
    ))!
    const now = new Date('2026-09-16T12:00:00.000Z')
    const feed = await scheduleRestProvider.collect(providerContext(game, now))
    const snapshot = snapshotFromFeed({ game, feed, capturedAt: now.toISOString() })
    const scenario = resolveScenario({
      game: scenarioGame(game),
      agentIds: ['rest'],
      snapshot,
      now,
    })
    const finding = scenario.events[0].finding

    expect(finding.state).toBe('material')
    expect(finding.direction).toBe('home')
    expect(finding.headline).toContain('NE')
    expect(finding.signals.find(signal => signal.label === 'Turnaround')).toMatchObject({
      away_value: '7 days',
      home_value: '10.7 days',
    })
    expect(scenario.suggested_anchor_ids).toEqual(['home_win'])
  })
})
