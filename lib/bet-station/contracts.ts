import { z } from 'zod'
import {
  ScenarioAnchorIdSchema,
  TERMINAL_CONTRACT_VERSION,
  type GameScript,
  type ScenarioResolution,
} from '@/lib/terminal/contracts'

export const BET_STATION_HANDOFF_VERSION = 'bet-station-handoff-v1'

export const BET_STATION_POSITION_IDS = ['qb', 'rb', 'wr', 'te'] as const
export const BetStationPositionIdSchema = z.enum(BET_STATION_POSITION_IDS)
export type BetStationPositionId = z.infer<typeof BetStationPositionIdSchema>

type BetStationPositionCatalogEntry = {
  label: string
  description: string
}

export const BET_STATION_POSITION_CATALOG: Record<BetStationPositionId, BetStationPositionCatalogEntry> = {
  qb: {
    label: 'Quarterback',
    description: 'Passing, rushing, attempt, completion, and touchdown markets that express the resolved game story.',
  },
  rb: {
    label: 'Running Back',
    description: 'Rushing, receiving, touch, and scoring markets filtered through role concentration and game state.',
  },
  wr: {
    label: 'Wide Receiver',
    description: 'Target, reception, yardage, and scoring markets connected to route participation and matchup access.',
  },
  te: {
    label: 'Tight End',
    description: 'Receiving and scoring markets connected to routes, protection duty, middle-field access, and red-zone role.',
  },
}

export const BET_STATION_INTERNAL_LENSES = ['usage'] as const

export const BetStationHandoffSchema = z.object({
  contract_version: z.literal(BET_STATION_HANDOFF_VERSION),
  source_contract_version: z.literal(TERMINAL_CONTRACT_VERSION),
  script_id: z.string().min(1),
  scenario_id: z.string().min(1),
  scenario_revision_id: z.string().min(1),
  snapshot_id: z.string().min(1),
  game_id: z.string().min(1),
  anchor_ids: z.array(ScenarioAnchorIdSchema).min(1),
})

export type BetStationHandoff = z.infer<typeof BetStationHandoffSchema>

export function createBetStationHandoff(params: {
  scenario: ScenarioResolution
  script: GameScript
}): BetStationHandoff {
  if (
    params.script.scenario_id !== params.scenario.scenario_id
    || params.script.scenario_revision_id !== params.scenario.scenario_revision_id
    || params.script.snapshot_id !== params.scenario.snapshot_id
  ) {
    throw new Error('Bet Station handoff requires matching script and scenario lineage')
  }

  return BetStationHandoffSchema.parse({
    contract_version: BET_STATION_HANDOFF_VERSION,
    source_contract_version: TERMINAL_CONTRACT_VERSION,
    script_id: params.script.script_id,
    scenario_id: params.scenario.scenario_id,
    scenario_revision_id: params.scenario.scenario_revision_id,
    snapshot_id: params.scenario.snapshot_id,
    game_id: params.scenario.game.game_id,
    anchor_ids: params.script.anchor_ids,
  })
}
