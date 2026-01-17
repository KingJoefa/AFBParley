import {
  AlertSchema,
  type Alert,
  type Finding,
  type LLMFindingOutput,
  isLineEvidence,
  validateImplicationsForAgent,
} from '../schemas'
import { calculateConfidence, type ConfidenceInputs } from './confidence'

/**
 * Validators
 *
 * All validators enforce the contract layer:
 * 1. Zod .strict() - no extra fields (built into schemas)
 * 2. Source integrity - no orphan sources
 * 3. Line freshness - within TTL per line type
 * 4. Edge language - blocked without LineEvidence
 * 5. Implications allowlist - per agent
 * 6. Confidence immutability - code-derived only
 * 7. ID/Agent immutability - from Finding only
 */

// Line TTL per type
export const LINE_TTL = {
  spread: 30 * 60 * 1000,      // 30 min
  total: 30 * 60 * 1000,       // 30 min
  prop: 15 * 60 * 1000,        // 15 min (more volatile)
  moneyline: 60 * 60 * 1000,   // 1 hr
} as const

// Edge language patterns that require LineEvidence
const EDGE_LANGUAGE_PATTERNS = [
  /\bedge\b/i,
  /\bvalue\b/i,
  /\bmispriced\b/i,
  /\bexploit\b/i,
  /\bsharp\b/i,
  /\block\b/i,
]

export class ValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * Validate source integrity: no orphan sources, all evidence has sources
 */
export function validateSourceIntegrity(alert: Alert): void {
  const evidenceRefs = new Set(alert.evidence.map(e => e.source_ref))
  const sourceRefs = new Set(alert.sources.map(s => s.ref))

  // Check for orphan sources (source without matching evidence)
  for (const ref of sourceRefs) {
    if (!evidenceRefs.has(ref)) {
      throw new ValidationError(
        'ORPHAN_SOURCE',
        `Orphan source: ${ref} not referenced in evidence`,
        { orphanRef: ref }
      )
    }
  }

  // Check for evidence without source
  for (const ref of evidenceRefs) {
    if (!sourceRefs.has(ref)) {
      throw new ValidationError(
        'MISSING_SOURCE',
        `Missing source for evidence ref: ${ref}`,
        { missingRef: ref }
      )
    }
  }
}

/**
 * Validate line evidence freshness against TTL
 */
export function validateLineFreshness(alert: Alert): void {
  const now = Date.now()

  for (const evidence of alert.evidence) {
    if (isLineEvidence(evidence)) {
      const ttl = LINE_TTL[evidence.line_type]
      const age = now - evidence.line_timestamp

      if (age > ttl) {
        throw new ValidationError(
          'STALE_LINE',
          `Stale line evidence: ${evidence.line_type} is ${Math.round(age / 1000 / 60)}min old (TTL: ${ttl / 1000 / 60}min)`,
          {
            lineType: evidence.line_type,
            age,
            ttl,
            timestamp: evidence.line_timestamp,
          }
        )
      }
    }
  }
}

/**
 * Validate no edge language without LineEvidence
 */
export function validateNoEdgeWithoutLine(alert: Alert): void {
  const hasLineEvidence = alert.evidence.some(e => isLineEvidence(e))

  for (const pattern of EDGE_LANGUAGE_PATTERNS) {
    if (pattern.test(alert.claim) && !hasLineEvidence) {
      throw new ValidationError(
        'EDGE_LANGUAGE_WITHOUT_LINE',
        `Claim uses edge language "${pattern}" but no LineEvidence provided`,
        { claim: alert.claim, pattern: pattern.toString() }
      )
    }
  }
}

/**
 * Validate implications against agent allowlist
 */
export function validateImplications(alert: Alert): void {
  const result = validateImplicationsForAgent(alert.agent, alert.implications)

  if (!result.valid) {
    throw new ValidationError(
      'INVALID_IMPLICATIONS',
      `Agent ${alert.agent} cannot imply markets: ${result.invalid.join(', ')}`,
      { agent: alert.agent, invalidImplications: result.invalid }
    )
  }
}

/**
 * Validate ID and agent match the finding (immutability)
 */
export function validateIdAgentMatch(alert: Alert, finding: Finding): void {
  if (alert.id !== finding.id) {
    throw new ValidationError(
      'ID_MISMATCH',
      `Alert ID mismatch: expected ${finding.id}, got ${alert.id}`,
      { expected: finding.id, actual: alert.id }
    )
  }

  if (alert.agent !== finding.agent) {
    throw new ValidationError(
      'AGENT_MISMATCH',
      `Alert agent mismatch: expected ${finding.agent}, got ${alert.agent}`,
      { expected: finding.agent, actual: alert.agent }
    )
  }
}

/**
 * Validate confidence matches code-derived value (immutability)
 */
export function validateConfidenceImmutability(
  alert: Alert,
  expectedConfidence: number
): void {
  // Allow small floating point difference
  if (Math.abs(alert.confidence - expectedConfidence) > 0.001) {
    throw new ValidationError(
      'CONFIDENCE_MODIFIED',
      `Confidence was modified: expected ${expectedConfidence}, got ${alert.confidence}`,
      { expected: expectedConfidence, actual: alert.confidence }
    )
  }
}

/**
 * Validate freshness matches source age
 */
export function validateFreshnessConsistency(alert: Alert): void {
  const now = Date.now()
  const ONE_DAY = 24 * 60 * 60 * 1000
  const ONE_WEEK = 7 * ONE_DAY

  // Get oldest source timestamp
  const oldestTimestamp = Math.min(...alert.sources.map(s => s.data_timestamp))
  const age = now - oldestTimestamp

  // Check freshness matches age
  if (alert.freshness === 'live' && age > ONE_DAY) {
    throw new ValidationError(
      'FRESHNESS_MISMATCH',
      `Freshness claimed "live" but oldest source is ${Math.round(age / ONE_DAY)} days old`,
      { freshness: alert.freshness, age, oldestTimestamp }
    )
  }

  if (alert.freshness === 'weekly' && age > ONE_WEEK) {
    throw new ValidationError(
      'FRESHNESS_MISMATCH',
      `Freshness claimed "weekly" but oldest source is ${Math.round(age / ONE_DAY)} days old`,
      { freshness: alert.freshness, age, oldestTimestamp }
    )
  }
}

/**
 * Full validation chain for an alert
 */
export function validateAlert(
  alert: Alert,
  finding: Finding,
  expectedConfidence: number
): void {
  // 1. Zod strict parse (no extra fields)
  AlertSchema.parse(alert)

  // 2. ID/Agent immutability
  validateIdAgentMatch(alert, finding)

  // 3. Confidence immutability
  validateConfidenceImmutability(alert, expectedConfidence)

  // 4. Source integrity
  validateSourceIntegrity(alert)

  // 5. Line freshness
  validateLineFreshness(alert)

  // 6. Implications allowlist
  validateImplications(alert)

  // 7. No edge language without line
  validateNoEdgeWithoutLine(alert)

  // 8. Freshness consistency
  validateFreshnessConsistency(alert)
}

/**
 * Batch validate all alerts
 */
export function validateAlerts(
  alerts: Alert[],
  findings: Finding[],
  confidences: Map<string, number>
): { valid: Alert[]; errors: Array<{ alertId: string; error: ValidationError }> } {
  const valid: Alert[] = []
  const errors: Array<{ alertId: string; error: ValidationError }> = []

  const findingMap = new Map(findings.map(f => [f.id, f]))

  for (const alert of alerts) {
    const finding = findingMap.get(alert.id)
    if (!finding) {
      errors.push({
        alertId: alert.id,
        error: new ValidationError(
          'MISSING_FINDING',
          `No finding found for alert: ${alert.id}`,
          { alertId: alert.id }
        ),
      })
      continue
    }

    const expectedConfidence = confidences.get(alert.id) ?? 0.5

    try {
      validateAlert(alert, finding, expectedConfidence)
      valid.push(alert)
    } catch (e) {
      if (e instanceof ValidationError) {
        errors.push({ alertId: alert.id, error: e })
      } else {
        errors.push({
          alertId: alert.id,
          error: new ValidationError(
            'UNKNOWN_ERROR',
            (e as Error).message,
            { originalError: e }
          ),
        })
      }
    }
  }

  return { valid, errors }
}
