import { z } from 'zod'
import { EvidenceSchema } from './evidence'
import { AgentTypeSchema, type Finding } from './finding'
import { AnyImplicationSchema } from './implications'
import { renderClaim } from './claim'
import type { LLMFindingOutput, LLMOutput } from './llm-output'

/**
 * Alert Schema
 *
 * Alerts are ASSEMBLED via merge, not created by LLM:
 *   Alert = merge(CodeDerivedFields, LLMOutputByFindingId)
 *
 * Code-derived fields (immutable, from Finding):
 *   - id, agent, evidence, sources, confidence, freshness
 *
 * LLM-derived fields (constrained):
 *   - severity, claim, implications, suppressions
 */

// Source schema with strict fields
export const SourceSchema = z.object({
  type: z.enum(['local', 'web', 'line']),
  ref: z.string(),
  data_version: z.string(),
  data_timestamp: z.number(),
  search_timestamp: z.number().optional(),
  quote_snippet: z.string().optional(),
}).strict()

// Code-derived fields (from Finding + context)
export const CodeDerivedAlertFieldsSchema = z.object({
  id: z.string(),
  agent: AgentTypeSchema,
  evidence: z.array(EvidenceSchema).min(1),
  sources: z.array(SourceSchema).min(1),
  confidence: z.number().min(0).max(1),
  freshness: z.enum(['live', 'weekly', 'stale']),
}).strict()

// LLM-derived fields (constrained)
export const LLMDerivedAlertFieldsSchema = z.object({
  severity: z.enum(['high', 'medium']),
  claim: z.string().max(200),
  implications: z.array(AnyImplicationSchema).min(1).max(5),
  suppressions: z.array(z.string()),
}).strict()

// Full Alert = merge of both
export const AlertSchema = CodeDerivedAlertFieldsSchema.merge(LLMDerivedAlertFieldsSchema)

export type Source = z.infer<typeof SourceSchema>
export type CodeDerivedAlertFields = z.infer<typeof CodeDerivedAlertFieldsSchema>
export type LLMDerivedAlertFields = z.infer<typeof LLMDerivedAlertFieldsSchema>
export type Alert = z.infer<typeof AlertSchema>

/**
 * Build code-derived fields from a Finding
 */
export function buildCodeDerivedFields(
  finding: Finding,
  confidence: number,
  dataVersion: string
): CodeDerivedAlertFields {
  // Derive freshness from source timestamp
  const now = Date.now()
  const age = now - finding.source_timestamp
  const ONE_DAY = 24 * 60 * 60 * 1000
  const ONE_WEEK = 7 * ONE_DAY

  let freshness: 'live' | 'weekly' | 'stale'
  if (age < ONE_DAY) {
    freshness = 'live'
  } else if (age < ONE_WEEK) {
    freshness = 'weekly'
  } else {
    freshness = 'stale'
  }

  // Build evidence from finding
  const evidence = [{
    stat: finding.stat,
    value_num: finding.value_num,
    value_str: finding.value_str,
    value_type: finding.value_type,
    comparison: finding.comparison_context,
    source_type: finding.source_type,
    source_ref: finding.source_ref,
    quote_snippet: finding.quote_snippet,
  }]

  // Build source from finding
  const sources = [{
    type: finding.source_type,
    ref: finding.source_ref,
    data_version: dataVersion,
    data_timestamp: finding.source_timestamp,
    search_timestamp: finding.source_type === 'web' ? finding.source_timestamp : undefined,
    quote_snippet: finding.quote_snippet,
  }]

  return {
    id: finding.id,
    agent: finding.agent,
    evidence: evidence as CodeDerivedAlertFields['evidence'],
    sources: sources as CodeDerivedAlertFields['sources'],
    confidence,
    freshness,
  }
}

/**
 * Merge code-derived fields with LLM output to create Alert
 * This is the ONLY way to create an Alert
 */
export function assembleAlert(
  codeDerived: CodeDerivedAlertFields,
  llmOutput: LLMFindingOutput
): Alert {
  return {
    ...codeDerived,
    severity: llmOutput.severity,
    claim: renderClaim(llmOutput.claim_parts),
    implications: llmOutput.implications,
    suppressions: llmOutput.suppressions,
  }
}

/**
 * Assemble all alerts from findings and LLM output
 * Throws if LLM output has missing/extra keys
 */
export function assembleAlerts(
  findings: Finding[],
  llmOutput: LLMOutput,
  confidences: Map<string, number>,
  dataVersion: string
): Alert[] {
  const alerts: Alert[] = []

  for (const finding of findings) {
    const llmFinding = llmOutput[finding.id]
    if (!llmFinding) {
      throw new Error(`LLM output missing for finding: ${finding.id}`)
    }

    const confidence = confidences.get(finding.id) ?? 0.5
    const codeDerived = buildCodeDerivedFields(finding, confidence, dataVersion)
    const alert = assembleAlert(codeDerived, llmFinding)

    alerts.push(alert)
  }

  // Check for extra LLM outputs
  const findingIds = new Set(findings.map(f => f.id))
  for (const llmId of Object.keys(llmOutput)) {
    if (!findingIds.has(llmId)) {
      throw new Error(`LLM output contains unknown finding_id: ${llmId}`)
    }
  }

  return alerts
}
