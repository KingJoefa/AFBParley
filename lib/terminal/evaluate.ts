import {
  ScriptEvaluationSchema,
  type GameScript,
  type ScenarioResolution,
  type ScriptEvaluation,
} from '@/lib/terminal/contracts'

function numericClaims(script: GameScript): string[] {
  const text = [
    script.title,
    script.summary,
    ...script.causal_chain.map(step => step.statement),
    ...script.key_conditions,
    ...script.failure_conditions,
  ].join(' ')
  return [...text.matchAll(/\b\d+(?:\.\d+)?%?\b/g)].map(match => match[0])
}

export function evaluateScript(params: {
  scenario: ScenarioResolution
  script: GameScript
}): ScriptEvaluation {
  const represented = new Set(
    params.script.causal_chain.map(step => step.agent_id).filter(Boolean),
  )
  const selectedAgentsRepresented = params.scenario.selected_agent_ids.every(agent => represented.has(agent))
  const scenarioAnchors = new Set(params.scenario.anchors.map(anchor => anchor.id))
  const anchorsValid = params.script.anchor_ids.every(anchor => scenarioAnchors.has(anchor))
  const failureConditionsPresent = params.script.failure_conditions.length > 0
    && params.script.failure_conditions.every(condition => condition.trim().length >= 12)
  const claims = numericClaims(params.script)
  const evidence = JSON.stringify(params.scenario.events.map(event => ({
    observations: event.observations,
    finding: event.finding,
  })))
  const numericClaimsSourced = claims.every(claim => evidence.includes(claim.replace('%', '')))
  const issues = [
    ...(!selectedAgentsRepresented ? ['Not every selected agent appears in the causal chain'] : []),
    ...(!anchorsValid ? ['The script contains an anchor outside the scenario contract'] : []),
    ...(!failureConditionsPresent ? ['Failure conditions are missing or too vague'] : []),
    ...(!numericClaimsSourced ? ['The script contains a numeric claim absent from attached observations'] : []),
  ]

  return ScriptEvaluationSchema.parse({
    evaluation_version: 'script-eval-v1',
    passed: issues.length === 0,
    checks: {
      selected_agents_represented: selectedAgentsRepresented,
      anchors_valid: anchorsValid,
      failure_conditions_present: failureConditionsPresent,
      numeric_claims_sourced: numericClaimsSourced,
    },
    issues,
  })
}
