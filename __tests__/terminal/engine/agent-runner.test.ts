import { describe, it, expect } from 'vitest'
import { runAgents, type MatchupContext } from '@/lib/terminal/engine/agent-runner'

describe('runAgents', () => {
  const NOW = Date.now()

  it('aggregates findings from EPA agent', async () => {
    const context: MatchupContext = {
      homeTeam: 'SEA',
      awayTeam: 'SF',
      players: {
        SEA: [
          {
            name: 'Jaxon Smith-Njigba',
            team: 'SEA',
            position: 'WR',
            receiving_epa_rank: 3,
            targets: 120,
          },
        ],
        SF: [],
      },
      teamStats: {
        SEA: {},
        SF: { epa_allowed_to_wr_rank: 8 },
      },
      weather: { temperature: 55, wind_mph: 8, precipitation_chance: 10, indoor: false },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const result = await runAgents(context)

    expect(result.findings.length).toBeGreaterThan(0)
    expect(result.findings.some(f => f.agent === 'epa')).toBe(true)
    expect(result.agentsInvoked).toContain('epa')
  })

  it('aggregates findings from pressure agent', async () => {
    const context: MatchupContext = {
      homeTeam: 'SEA',
      awayTeam: 'SF',
      players: {
        SEA: [],
        SF: [],
      },
      teamStats: {
        SEA: { pass_block_win_rate_rank: 28, qb_name: 'Geno Smith' },
        SF: { pressure_rate_rank: 3, pressure_rate: 42 },
      },
      weather: { temperature: 55, wind_mph: 8, precipitation_chance: 10, indoor: false },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const result = await runAgents(context)

    expect(result.findings.some(f => f.agent === 'pressure')).toBe(true)
    expect(result.agentsInvoked).toContain('pressure')
  })

  it('aggregates findings from weather agent', async () => {
    const context: MatchupContext = {
      homeTeam: 'GB',
      awayTeam: 'CHI',
      players: { GB: [], CHI: [] },
      teamStats: { GB: {}, CHI: {} },
      weather: { temperature: 28, wind_mph: 22, precipitation_chance: 60, indoor: false },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const result = await runAgents(context)

    expect(result.findings.some(f => f.agent === 'weather')).toBe(true)
    expect(result.agentsInvoked).toContain('weather')
  })

  it('returns empty findings for indoor game with no matchup advantages', async () => {
    const context: MatchupContext = {
      homeTeam: 'DAL',
      awayTeam: 'NYG',
      players: { DAL: [], NYG: [] },
      teamStats: { DAL: {}, NYG: {} },
      weather: { temperature: 72, wind_mph: 0, precipitation_chance: 0, indoor: true },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const result = await runAgents(context)

    // Weather should not trigger for indoor
    expect(result.findings.filter(f => f.agent === 'weather').length).toBe(0)
    expect(result.agentsSilent).toContain('weather')
  })

  it('tracks silent agents correctly', async () => {
    const context: MatchupContext = {
      homeTeam: 'TEN',
      awayTeam: 'JAX',
      players: { TEN: [], JAX: [] },
      teamStats: { TEN: {}, JAX: {} },
      weather: { temperature: 65, wind_mph: 5, precipitation_chance: 10, indoor: false },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const result = await runAgents(context)

    // All agents should be silent with no data
    expect(result.agentsSilent).toContain('epa')
    expect(result.agentsSilent).toContain('pressure')
    expect(result.agentsSilent).toContain('weather')
    expect(result.agentsSilent).toContain('qb')
    expect(result.agentsSilent).toContain('hb')
    expect(result.agentsSilent).toContain('wr')
    expect(result.agentsSilent).toContain('te')
  })

  it('aggregates from multiple agents simultaneously', async () => {
    const context: MatchupContext = {
      homeTeam: 'KC',
      awayTeam: 'LV',
      players: {
        KC: [
          {
            name: 'Travis Kelce',
            team: 'KC',
            position: 'TE',
            target_share_rank: 2,
            receiving_yards_rank: 1,
            targets: 120,
          },
          {
            name: 'Patrick Mahomes',
            team: 'KC',
            position: 'QB',
            qb_rating_rank: 2,
            attempts: 400,
          },
        ],
        LV: [],
      },
      teamStats: {
        KC: {},
        LV: {
          te_defense_rank: 28,
          yards_allowed_to_te_rank: 25,
          pass_defense_rank: 26,
        },
      },
      weather: { temperature: 45, wind_mph: 18, precipitation_chance: 20, indoor: false },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const result = await runAgents(context)

    expect(result.findings.length).toBeGreaterThan(2)
    // Should have weather (wind), TE, and QB findings
    expect(result.agentsInvoked.length).toBeGreaterThan(1)
  })

  it('includes all required fields in result', async () => {
    const context: MatchupContext = {
      homeTeam: 'MIN',
      awayTeam: 'DET',
      players: { MIN: [], DET: [] },
      teamStats: { MIN: {}, DET: {} },
      weather: { temperature: 72, wind_mph: 0, precipitation_chance: 0, indoor: true },
      dataTimestamp: NOW,
      dataVersion: '2025-week-20',
    }

    const result = await runAgents(context)

    expect(result).toHaveProperty('findings')
    expect(result).toHaveProperty('agentsInvoked')
    expect(result).toHaveProperty('agentsSilent')
    expect(Array.isArray(result.findings)).toBe(true)
    expect(Array.isArray(result.agentsInvoked)).toBe(true)
    expect(Array.isArray(result.agentsSilent)).toBe(true)
  })
})
