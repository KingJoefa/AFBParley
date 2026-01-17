import { createHash } from 'crypto'
import type { Finding, AgentType, Provenance } from '../schemas'

/**
 * Provenance & Hashing
 *
 * Every response includes provenance for:
 * - Reproducibility (same inputs → same outputs)
 * - Debugging (trace what data was used)
 * - Auditability (verify claims against sources)
 */

/**
 * Hash content to 12-character hex string
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 12)
}

/**
 * Hash an object by JSON stringifying with sorted keys
 */
export function hashObject(obj: unknown): string {
  const json = JSON.stringify(obj, Object.keys(obj as object).sort())
  return hashContent(json)
}

interface BuildProvenanceInput {
  requestId: string
  prompt: string
  skillMds: Partial<Record<AgentType, string>>
  findings: Finding[]
  dataVersion: string
  dataTimestamp: number
  searchTimestamps: number[]
  agentsInvoked: AgentType[]
  agentsSilent: AgentType[]
  cacheHits: number
  cacheMisses: number
  llmModel: string
  llmTemperature: number
}

/**
 * Build provenance object with all hashes for reproducibility
 */
export function buildProvenance(inputs: BuildProvenanceInput): Provenance {
  // Hash each skill MD file
  const skillMdHashes = Object.fromEntries(
    Object.entries(inputs.skillMds).map(([agent, content]) => [
      agent,
      hashContent(content as string),
    ])
  ) as Record<AgentType, string>

  // Hash the prompt
  const promptHash = hashContent(inputs.prompt)

  // Hash findings array (sorted by ID for determinism)
  const sortedFindings = [...inputs.findings].sort((a, b) => a.id.localeCompare(b.id))
  const findingsHash = hashContent(JSON.stringify(sortedFindings))

  return {
    request_id: inputs.requestId,
    prompt_hash: promptHash,
    skill_md_hashes: skillMdHashes,
    findings_hash: findingsHash,
    data_version: inputs.dataVersion,
    data_timestamp: inputs.dataTimestamp,
    search_timestamps: inputs.searchTimestamps,
    agents_invoked: inputs.agentsInvoked,
    agents_silent: inputs.agentsSilent,
    cache_hits: inputs.cacheHits,
    cache_misses: inputs.cacheMisses,
    llm_model: inputs.llmModel,
    llm_temperature: inputs.llmTemperature,
  }
}

/**
 * Verify provenance hashes match expected values
 * Used for debugging/replay scenarios
 */
export function verifyProvenance(
  provenance: Provenance,
  inputs: {
    prompt: string
    skillMds: Partial<Record<AgentType, string>>
    findings: Finding[]
  }
): { valid: boolean; mismatches: string[] } {
  const mismatches: string[] = []

  // Check prompt hash
  const expectedPromptHash = hashContent(inputs.prompt)
  if (provenance.prompt_hash !== expectedPromptHash) {
    mismatches.push(`prompt_hash: expected ${expectedPromptHash}, got ${provenance.prompt_hash}`)
  }

  // Check skill MD hashes
  for (const [agent, content] of Object.entries(inputs.skillMds)) {
    const expectedHash = hashContent(content as string)
    const actualHash = provenance.skill_md_hashes[agent as AgentType]
    if (actualHash !== expectedHash) {
      mismatches.push(`skill_md_hashes.${agent}: expected ${expectedHash}, got ${actualHash}`)
    }
  }

  // Check findings hash
  const sortedFindings = [...inputs.findings].sort((a, b) => a.id.localeCompare(b.id))
  const expectedFindingsHash = hashContent(JSON.stringify(sortedFindings))
  if (provenance.findings_hash !== expectedFindingsHash) {
    mismatches.push(`findings_hash: expected ${expectedFindingsHash}, got ${provenance.findings_hash}`)
  }

  return {
    valid: mismatches.length === 0,
    mismatches,
  }
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `req-${timestamp}-${random}`
}
