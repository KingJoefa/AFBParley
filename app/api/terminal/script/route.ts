import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import {
  isDatabaseConfigured,
  loadScenarioRevision,
  persistScript,
} from '@/lib/data/repository'
import {
  ScriptRequestSchema,
  type ScenarioAnchorId,
  type ScenarioResolution,
} from '@/lib/terminal/contracts'
import { evaluateScript } from '@/lib/terminal/evaluate'
import {
  ScriptDraftSchema,
  createDeterministicDraft,
  finalizeScript,
  type ScriptDraft,
} from '@/lib/terminal/script'

export const dynamic = 'force-dynamic'

function validateAnchorSelection(scenario: ScenarioResolution, anchorIds: ScenarioAnchorId[]): string | null {
  const anchors = new Map(scenario.anchors.map(anchor => [anchor.id, anchor]))
  const groups = new Set<string>()

  for (const anchorId of anchorIds) {
    const anchor = anchors.get(anchorId)
    if (!anchor) return `Unknown anchor: ${anchorId}`
    if (groups.has(anchor.exclusive_group)) {
      return `Choose only one ${anchor.category} anchor`
    }
    groups.add(anchor.exclusive_group)
  }

  return null
}

function buildPrompt(scenario: ScenarioResolution, anchorIds: ScenarioAnchorId[]): string {
  const labels = new Map(scenario.anchors.map(anchor => [anchor.id, anchor.label]))
  return JSON.stringify({
    task: 'Write one causal game script from the scenario assumptions and selected outcome anchors.',
    matchup: scenario.game.display,
    selected_anchors: anchorIds.map(id => labels.get(id)),
    scenario_events: scenario.events.map(event => ({
      agent_id: event.agent_id,
      label: event.label,
      assumption: event.assumption,
      resolved_statement: event.statement,
      finding: event.finding,
      evidence_state: event.evidence_state,
      observations: event.observations.map(observation => ({
        metric: observation.metric,
        value: observation.value,
        source: observation.source,
        observed_at: observation.observed_at,
        effective_at: observation.effective_at,
        expires_at: observation.expires_at,
      })),
    })),
    output_contract: {
      title: 'short descriptive title',
      summary: 'one concise paragraph',
      causal_chain: [{ agent_id: 'selected agent id when applicable', statement: 'one causal step' }],
      key_conditions: ['conditions that must remain true'],
      failure_conditions: ['specific ways this story can fail'],
    },
  })
}

async function generateDraft(
  scenario: ScenarioResolution,
  anchorIds: ScenarioAnchorId[],
): Promise<{ draft: ScriptDraft; modelId: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  try {
    const client = new OpenAI({ apiKey })
    const modelId = process.env.SWANTAIL_SCRIPT_MODEL ?? 'gpt-4o-mini'
    const response = await client.chat.completions.create({
      model: modelId,
      temperature: 0.35,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You write compact American football game scripts.',
            'Distinguish scenario assumptions from attached sourced observations using each event evidence_state.',
            'Connect causes to game outcomes without recommending bets, claiming confidence, or claiming positive expected value.',
            'Do not add statistics, injuries, weather details, lines, prices, players, or evidence that were not supplied in observations.',
            'Return only JSON matching the requested contract.',
          ].join(' '),
        },
        { role: 'user', content: buildPrompt(scenario, anchorIds) },
      ],
    })
    const content = response.choices[0]?.message?.content
    if (!content) return null
    return { draft: ScriptDraftSchema.parse(JSON.parse(content)), modelId }
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
  }

  const parsed = ScriptRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid scenario or anchor selection' }, { status: 400 })
  }

  let scenario = parsed.data.scenario
  if (isDatabaseConfigured()) {
    try {
      const storedScenario = await loadScenarioRevision(scenario.scenario_revision_id)
      if (!storedScenario) {
        return NextResponse.json(
          { error: 'The stored scenario revision is unavailable; resolve the agents again' },
          { status: 409 },
        )
      }
      scenario = storedScenario
    } catch {
      return NextResponse.json({ error: 'Scenario storage is unavailable' }, { status: 503 })
    }
  }

  const selectedAnchorIds = new Set(parsed.data.anchor_ids)
  const anchorIds = scenario.anchors
    .map(anchor => anchor.id)
    .filter(anchorId => selectedAnchorIds.has(anchorId))
  const anchorError = validateAnchorSelection(scenario, anchorIds)
  if (anchorError) {
    return NextResponse.json({ error: anchorError }, { status: 400 })
  }

  const generated = await generateDraft(scenario, anchorIds)
  const draft = generated?.draft ?? createDeterministicDraft(scenario, anchorIds)
  const script = finalizeScript({
    scenario,
    anchorIds,
    draft,
    generation: generated ? 'model' : 'deterministic',
    modelId: generated?.modelId ?? 'deterministic-v1',
    parentScriptId: parsed.data.parent_script_id,
  })
  const evaluation = evaluateScript({ scenario, script })
  try {
    const persistence = await persistScript({ script, evaluation })
    return NextResponse.json({ script, evaluation, persistence })
  } catch {
    return NextResponse.json({ error: 'Script storage is unavailable' }, { status: 503 })
  }
}
