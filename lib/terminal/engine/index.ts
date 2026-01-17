/**
 * Terminal Engine
 *
 * Core engine for the Swantail Terminal:
 * - Agent runner (aggregates findings from all agents)
 * - Validators (source integrity, line freshness, etc.)
 * - Confidence calculation (code-derived)
 * - Provenance hashing (reproducibility)
 * - Guardrails (limits, streaming, fallback)
 */

export { runAgents, type MatchupContext, type AgentRunResult } from './agent-runner'
export {
  validateSourceIntegrity,
  validateImplications,
  validateLineFreshness,
  validateNoEdgeWithoutLine,
  validateAlert,
  validateAlerts,
} from './validators'
export {
  calculateConfidence,
  confidenceInputsFromFinding,
  calculateFindingConfidence,
  type ConfidenceInputs,
} from './confidence'
export {
  hashContent,
  hashObject,
  buildProvenance,
  verifyProvenance,
  generateRequestId,
} from './provenance'
export {
  REQUEST_LIMITS,
  STREAM_CONFIG,
  SEARCH_CONFIG,
  GuardrailError,
  checkRequestLimits,
  estimateTokens,
  estimateCost,
  createStreamingResponse,
  SearchBudgetTracker,
  type HeartbeatEvent,
  type DataEvent,
  type ErrorEvent,
  type DoneEvent,
  type StreamEvent,
} from './guardrails'
export {
  renderFindingsFallback,
  formatFallbackForTerminal,
  formatFallbackForApi,
  shouldUseFallback,
  type FallbackLine,
} from './fallback-renderer'
