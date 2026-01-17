import type { Finding, Evidence } from '../schemas'
import { isLineEvidence } from '../schemas'

/**
 * Confidence Calculation
 *
 * Confidence is CODE-DERIVED, not LLM-derived.
 * The LLM cannot modify confidence - it's calculated from:
 * - Evidence count
 * - Source quality (local vs web)
 * - Data freshness
 * - Sample size (if applicable)
 * - Line freshness (if betting relevance claimed)
 */

export interface ConfidenceInputs {
  evidenceCount: number
  hasLocalSource: boolean
  hasWebSource: boolean
  webSourceAge: number | null       // ms since search
  localDataAge: number              // ms since data_timestamp
  sampleSize: number | null         // e.g. targets, snaps
  hasLineEvidence: boolean
  lineAge: number | null            // ms since line_timestamp
}

/**
 * Calculate confidence score from inputs
 * Returns value in [0, 1] range
 */
export function calculateConfidence(inputs: ConfidenceInputs): number {
  let score = 0.5  // baseline

  // Evidence quantity (+0.15 for 3+, +0.08 for 2)
  if (inputs.evidenceCount >= 3) score += 0.15
  else if (inputs.evidenceCount >= 2) score += 0.08

  // Source quality
  if (inputs.hasLocalSource) score += 0.10
  if (inputs.hasWebSource && inputs.webSourceAge !== null && inputs.webSourceAge < 4 * 3600 * 1000) {
    score += 0.08  // fresh web source (< 4 hours)
  }

  // Sample size (if applicable)
  if (inputs.sampleSize !== null) {
    if (inputs.sampleSize >= 100) score += 0.12
    else if (inputs.sampleSize >= 50) score += 0.06
    else score -= 0.10  // penalty for small sample
  }

  // Line freshness (if betting relevance claimed)
  if (inputs.hasLineEvidence && inputs.lineAge !== null) {
    if (inputs.lineAge < 30 * 60 * 1000) score += 0.10      // < 30 min
    else if (inputs.lineAge < 2 * 3600 * 1000) score += 0.05 // < 2 hr
    else score -= 0.15  // stale line penalty
  }

  // Data freshness penalty
  if (inputs.localDataAge > 7 * 24 * 3600 * 1000) score -= 0.20  // > 7 days

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, score))
}

/**
 * Build confidence inputs from a Finding
 */
export function confidenceInputsFromFinding(
  finding: Finding,
  additionalContext?: {
    sampleSize?: number
    lineTimestamp?: number
  }
): ConfidenceInputs {
  const now = Date.now()

  return {
    evidenceCount: 1, // Single finding = 1 evidence piece
    hasLocalSource: finding.source_type === 'local',
    hasWebSource: finding.source_type === 'web',
    webSourceAge: finding.source_type === 'web' ? now - finding.source_timestamp : null,
    localDataAge: finding.source_type === 'local' ? now - finding.source_timestamp : 0,
    sampleSize: additionalContext?.sampleSize ?? null,
    hasLineEvidence: false, // Single finding doesn't have line evidence
    lineAge: additionalContext?.lineTimestamp ? now - additionalContext.lineTimestamp : null,
  }
}

/**
 * Build confidence inputs from multiple evidence pieces
 */
export function confidenceInputsFromEvidence(
  evidence: Evidence[],
  dataTimestamp: number
): ConfidenceInputs {
  const now = Date.now()

  const hasLocalSource = evidence.some(e => e.source_type === 'local')
  const hasWebSource = evidence.some(e => e.source_type === 'web')
  const hasLine = evidence.some(e => isLineEvidence(e))

  // Get oldest web source age
  const webSources = evidence.filter(e => e.source_type === 'web')
  const webSourceAge = webSources.length > 0 ? now - dataTimestamp : null

  // Get oldest line timestamp
  const lineSources = evidence.filter(e => isLineEvidence(e))
  const lineAge = lineSources.length > 0
    ? now - Math.min(...lineSources.map(e => (e as any).line_timestamp))
    : null

  return {
    evidenceCount: evidence.length,
    hasLocalSource,
    hasWebSource,
    webSourceAge,
    localDataAge: now - dataTimestamp,
    sampleSize: null, // Would need to be passed separately
    hasLineEvidence: hasLine,
    lineAge,
  }
}

/**
 * Calculate confidence for a Finding
 */
export function calculateFindingConfidence(
  finding: Finding,
  additionalContext?: { sampleSize?: number }
): number {
  const inputs = confidenceInputsFromFinding(finding, additionalContext)
  return calculateConfidence(inputs)
}
