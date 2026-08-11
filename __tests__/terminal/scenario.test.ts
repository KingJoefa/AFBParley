import { describe, expect, it } from 'vitest'
import { ScenarioResolutionSchema, type ScenarioGame } from '@/lib/terminal/contracts'
import { resolveScenario } from '@/lib/terminal/scenario'

const GAME: ScenarioGame = {
  game_id: '2026-wk01-NE-at-SEA',
  season: 2026,
  week: 1,
  away_team: 'NE',
  home_team: 'SEA',
  kickoff: '2026-09-10T00:20:00.000Z',
  display: 'New England Patriots @ Seattle Seahawks',
  time: 'Wed 8:20 PM ET',
}

describe('scenario contract', () => {
  it('resolves selected agents into explicit scenario assumptions', () => {
    const scenario = resolveScenario({
      game: GAME,
      agentIds: ['weather', 'pressure'],
      now: new Date('2026-08-11T12:00:00.000Z'),
    })

    expect(ScenarioResolutionSchema.safeParse(scenario).success).toBe(true)
    expect(scenario.selected_agent_ids).toEqual(['weather', 'pressure'])
    expect(scenario.events).toHaveLength(2)
    expect(scenario.evidence_state).toBe('scenario_assumptions')
    expect(scenario.suggested_anchor_ids).toEqual(['game_under', 'grind', 'run_heavy'])
  })

  it('never suggests conflicting anchors from opposing agents', () => {
    const scenario = resolveScenario({ game: GAME, agentIds: ['weather', 'pace'] })

    expect(scenario.suggested_anchor_ids).toContain('game_under')
    expect(scenario.suggested_anchor_ids).not.toContain('game_over')
    expect(scenario.suggested_anchor_ids.filter(id => ['shootout', 'grind', 'blowout'].includes(id))).toHaveLength(1)
  })
})
