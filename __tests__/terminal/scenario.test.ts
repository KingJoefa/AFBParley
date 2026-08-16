import { describe, expect, it } from 'vitest'
import { createBetStationHandoff } from '@/lib/bet-station/contracts'
import { GameSnapshotSchema } from '@/lib/data/contracts'
import {
  GAME_AGENT_IDS,
  GameScriptSchema,
  ScenarioResolutionSchema,
  type ScenarioGame,
} from '@/lib/terminal/contracts'
import { resolveScenario } from '@/lib/terminal/scenario'
import { createDeterministicDraft, finalizeScript } from '@/lib/terminal/script'

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
    expect(scenario.suggested_anchor_ids.filter(id => ['shootout', 'grind', 'blowout', 'high_variance'].includes(id))).toHaveLength(1)
  })

  it('resolves the expanded football-native lenses as explicit assumptions', () => {
    const agentIds = ['momentum', 'trenches', 'turnovers', 'qb', 'rest'] as const
    const scenario = resolveScenario({ game: GAME, agentIds: [...agentIds] })

    expect(scenario.selected_agent_ids).toEqual(agentIds)
    expect(scenario.events.map(event => event.agent_id)).toEqual(agentIds)
    expect(scenario.events.every(event => event.evidence_state === 'assumption_only')).toBe(true)
    expect(scenario.suggested_anchor_ids).toEqual(['game_over', 'grind', 'run_heavy'])
  })

  it('derives a high-variance shape from a turnover finding without a volatility agent', () => {
    const scenario = resolveScenario({ game: GAME, agentIds: ['turnovers'] })

    expect(scenario.suggested_anchor_ids).toEqual(['high_variance'])
  })

  it('can synthesize every selectable agent without exceeding the script contract', () => {
    const scenario = resolveScenario({ game: GAME, agentIds: [...GAME_AGENT_IDS] })
    const anchorIds = scenario.suggested_anchor_ids
    const script = finalizeScript({
      scenario,
      anchorIds,
      draft: createDeterministicDraft(scenario, anchorIds),
      generation: 'deterministic',
      modelId: 'deterministic-v1',
    })

    expect(script.causal_chain).toHaveLength(GAME_AGENT_IDS.length + 1)
    expect(GameScriptSchema.safeParse(script).success).toBe(true)
    expect(createBetStationHandoff({ scenario, script })).toMatchObject({
      script_id: script.script_id,
      scenario_revision_id: scenario.scenario_revision_id,
      game_id: GAME.game_id,
    })
  })

  it('binds sourced observations to a stable scenario revision', () => {
    const snapshot = GameSnapshotSchema.parse({
      snapshot_id: 'snapshot_weather_1',
      game_id: GAME.game_id,
      captured_at: '2026-09-09T12:00:00.000Z',
      contract_version: 'observation-v1',
      game: {
        ...GAME,
        neutral_site: false,
        status: 'scheduled',
        venue: 'Lumen Field',
      },
      observations: [{
        observation_id: 'obs_weather_1',
        game_id: GAME.game_id,
        agent_id: 'weather',
        kind: 'forecast',
        subject: { type: 'venue', id: 'Lumen Field', label: 'Lumen Field' },
        metric: 'weather.kickoff_forecast',
        value: {
          wind_mph: 18,
          precipitation_probability: 50,
          summary: 'Rain and wind',
        },
        source: {
          provider: 'nws',
          feed: 'hourly-forecast',
          quality: 'official',
          source_url: 'https://api.weather.gov/gridpoints/SEW/1,1/forecast/hourly',
        },
        observed_at: '2026-09-09T11:45:00.000Z',
        effective_at: '2026-09-10T00:00:00.000Z',
        expires_at: '2026-09-09T18:00:00.000Z',
        imported_at: '2026-09-09T12:00:00.000Z',
        raw_import_id: 'raw_weather_1',
        schema_version: 1,
      }],
      availability: {
        weather: { state: 'available', checked_at: '2026-09-09T12:00:00.000Z', observation_count: 1 },
        injury: { state: 'missing', checked_at: '2026-09-09T12:00:00.000Z', observation_count: 0 },
        epa: { state: 'missing', checked_at: '2026-09-09T12:00:00.000Z', observation_count: 0 },
        trenches: { state: 'missing', checked_at: '2026-09-09T12:00:00.000Z', observation_count: 0 },
        turnovers: { state: 'missing', checked_at: '2026-09-09T12:00:00.000Z', observation_count: 0 },
        rest: { state: 'missing', checked_at: '2026-09-09T12:00:00.000Z', observation_count: 0 },
      },
      content_hash: 'a'.repeat(64),
    })
    const scenario = resolveScenario({
      game: GAME,
      agentIds: ['weather'],
      snapshot,
      now: new Date('2026-09-09T13:00:00.000Z'),
    })

    expect(scenario.snapshot_id).toBe(snapshot.snapshot_id)
    expect(scenario.scenario_revision_id).toMatch(/^scenario_revision_/)
    expect(scenario.evidence_state).toBe('observations_available')
    expect(scenario.events[0].evidence_state).toBe('observed_support')
    expect(scenario.events[0].finding.state).toBe('material')
    expect(scenario.events[0].observations[0].source.provider).toBe('nws')
  })
})
