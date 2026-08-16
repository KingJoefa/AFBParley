import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BET_STATION_HANDOFF_VERSION,
  BET_STATION_INTERNAL_LENSES,
  BET_STATION_POSITION_CATALOG,
  BET_STATION_POSITION_IDS,
  BetStationHandoffSchema,
} from '@/lib/bet-station/contracts'
import { ObservationAgentIdSchema } from '@/lib/data/contracts'
import {
  GAME_AGENT_CATALOG,
  GAME_AGENT_IDS,
  TERMINAL_CONTRACT_VERSION,
} from '@/lib/terminal/contracts'

describe('game agent catalog', () => {
  it('has one documented specification for every selectable agent', () => {
    for (const agentId of GAME_AGENT_IDS) {
      const entry = GAME_AGENT_CATALOG[agentId]
      const absolutePath = join(process.cwd(), entry.specPath)

      expect(entry.question.length).toBeGreaterThan(20)
      expect(entry.description.length).toBeGreaterThan(40)
      expect(existsSync(absolutePath), `${agentId} spec is missing`).toBe(true)
      const specification = readFileSync(absolutePath, 'utf8')
      expect(specification).toContain(`agent_id: ${agentId}`)
      expect(specification).toContain('## Scope Boundary')
    }
  })

  it('only labels agents with observation adapters as pilot-observed', () => {
    for (const agentId of GAME_AGENT_IDS) {
      const hasObservationContract = ObservationAgentIdSchema.safeParse(agentId).success
      expect(GAME_AGENT_CATALOG[agentId].dataSupport === 'pilot_observations').toBe(hasObservationContract)
    }
  })

  it('keeps player-market choices outside the Game Story catalog', () => {
    expect(GAME_AGENT_IDS).toHaveLength(10)
    expect(GAME_AGENT_IDS).not.toEqual(expect.arrayContaining(['hb', 'wr', 'te', 'usage', 'volatility']))
    expect(BET_STATION_POSITION_IDS).toEqual(['qb', 'rb', 'wr', 'te'])
    expect(Object.keys(BET_STATION_POSITION_CATALOG)).toEqual(BET_STATION_POSITION_IDS)
    expect(BET_STATION_INTERNAL_LENSES).toEqual(['usage'])
    const positionIds = new Set<string>(BET_STATION_POSITION_IDS)
    expect(GAME_AGENT_IDS.filter(id => positionIds.has(id))).toEqual(['qb'])
  })

  it('preserves Game Script lineage in the future Bet Station handoff', () => {
    const handoff = BetStationHandoffSchema.parse({
      contract_version: BET_STATION_HANDOFF_VERSION,
      source_contract_version: TERMINAL_CONTRACT_VERSION,
      script_id: 'script_1',
      scenario_id: 'scenario_1',
      scenario_revision_id: 'scenario_revision_1',
      snapshot_id: 'snapshot_1',
      game_id: 'game_1',
      anchor_ids: ['game_under', 'grind'],
    })

    expect(handoff.source_contract_version).toBe('game-script-v5')
  })
})
