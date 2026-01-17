import { z } from 'zod'
import { ClaimPartsSchema } from './claim'
import { AnyImplicationSchema } from './implications'

/**
 * LLM Output Schema
 *
 * The LLM outputs a MAP keyed by finding_id, NOT free-form Alert objects.
 * This prevents the LLM from:
 * - Inventing new finding IDs
 * - Relabeling agents
 * - Modifying code-derived fields
 *
 * The code merges this output with code-derived fields to produce Alert[].
 */

// What the LLM outputs for a single finding
export const LLMFindingOutputSchema = z.object({
  severity: z.enum(['high', 'medium']),
  claim_parts: ClaimPartsSchema,
  implications: z.array(AnyImplicationSchema).min(1).max(5),
  suppressions: z.array(z.string()),
}).strict()

// LLM output is a map: finding_id → LLMFindingOutput
// This enforces that LLM can only annotate existing findings
export const LLMOutputSchema = z.record(
  z.string(), // finding_id - must match a Finding.id
  LLMFindingOutputSchema
).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'LLM output must contain at least one finding annotation' }
)

export type LLMFindingOutput = z.infer<typeof LLMFindingOutputSchema>
export type LLMOutput = z.infer<typeof LLMOutputSchema>

/**
 * Validates that LLM output keys match provided finding IDs
 */
export function validateLLMOutputKeys(
  llmOutput: LLMOutput,
  findingIds: string[]
): { valid: boolean; missing: string[]; extra: string[] } {
  const outputKeys = new Set(Object.keys(llmOutput))
  const expectedKeys = new Set(findingIds)

  const missing = findingIds.filter(id => !outputKeys.has(id))
  const extra = Object.keys(llmOutput).filter(id => !expectedKeys.has(id))

  return {
    valid: missing.length === 0 && extra.length === 0,
    missing,
    extra,
  }
}
