import { z } from 'zod'
import { contentHash, stableId } from '@/lib/data/hash'
import {
  GameScriptSchema,
  TERMINAL_CONTRACT_VERSION,
  type GameAgentId,
  type GameScript,
  type ScenarioAnchorId,
  type ScenarioResolution,
} from '@/lib/terminal/contracts'

export const ScriptDraftSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  causal_chain: z.array(z.object({
    agent_id: z.string().optional(),
    statement: z.string().min(1),
  })).min(2).max(8),
  key_conditions: z.array(z.string().min(1)).min(1).max(6),
  failure_conditions: z.array(z.string().min(1)).min(1).max(6),
})

export type ScriptDraft = z.infer<typeof ScriptDraftSchema>

export function createDeterministicDraft(
  scenario: ScenarioResolution,
  anchorIds: ScenarioAnchorId[],
): ScriptDraft {
  const labels = new Map(scenario.anchors.map(anchor => [anchor.id, anchor.label]))
  const anchorText = anchorIds.map(id => labels.get(id) ?? id).join(', ')
  const first = scenario.events[0]

  return {
    title: `${scenario.game.away_team} at ${scenario.game.home_team} / ${anchorText}`,
    summary: `This script treats ${anchorText.toLowerCase()} as the game outcome and connects it to the selected agent assumptions. It is a causal scenario, not a verification of current conditions or a betting recommendation.`,
    causal_chain: [
      ...scenario.events.map(event => ({
        agent_id: event.agent_id,
        statement: event.statement,
      })),
      {
        statement: `If those effects reinforce one another, the game resolves toward this combined outcome: ${anchorText.toLowerCase()}.`,
      },
    ],
    key_conditions: scenario.events.slice(0, 4).map(event => `${event.label}: the selected assumption remains material throughout the matchup.`),
    failure_conditions: [
      `${first?.label ?? 'The lead assumption'} does not materially affect game flow.`,
      `Early scoring or turnovers move the matchup away from ${anchorText.toLowerCase()}.`,
    ],
  }
}

export function finalizeScript(params: {
  scenario: ScenarioResolution
  anchorIds: ScenarioAnchorId[]
  draft: ScriptDraft
  generation: GameScript['generation']
  modelId: string
  parentScriptId?: string
  now?: Date
}): GameScript {
  const selectedAgentIds = new Set(params.scenario.selected_agent_ids)
  const causalChain = params.draft.causal_chain.map((step, index) => ({
    order: index + 1,
    ...(step.agent_id && selectedAgentIds.has(step.agent_id as GameAgentId)
      ? { agent_id: step.agent_id as GameAgentId }
      : {}),
    statement: step.statement,
  }))

  const inputHash = contentHash({
    contract_version: TERMINAL_CONTRACT_VERSION,
    scenario_revision_id: params.scenario.scenario_revision_id,
    anchor_ids: params.anchorIds,
    generation: params.generation,
    model_id: params.modelId,
  })
  return GameScriptSchema.parse({
    script_id: stableId('script', inputHash),
    scenario_id: params.scenario.scenario_id,
    scenario_revision_id: params.scenario.scenario_revision_id,
    snapshot_id: params.scenario.snapshot_id,
    contract_version: TERMINAL_CONTRACT_VERSION,
    input_hash: inputHash,
    parent_script_id: params.parentScriptId,
    title: params.draft.title,
    summary: params.draft.summary,
    causal_chain: causalChain,
    key_conditions: params.draft.key_conditions,
    failure_conditions: params.draft.failure_conditions,
    anchor_ids: params.anchorIds,
    created_at: (params.now ?? new Date()).toISOString(),
    generation: params.generation,
    model_id: params.modelId,
  })
}
