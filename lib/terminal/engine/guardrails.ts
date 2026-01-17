/**
 * Guardrails & Streaming
 *
 * Operational safeguards:
 * - Request token/cost limits
 * - Streaming heartbeat
 * - Fallback renderer (no LLM)
 * - Web search budget/cache
 */

// Request limits
export const REQUEST_LIMITS = {
  maxInputTokens: 8000,
  maxOutputTokens: 2000,
  maxCostPerRequest: 0.15,  // $0.15 USD
  timeoutMs: 45000,         // 45s
} as const

// Streaming config
export const STREAM_CONFIG = {
  heartbeatIntervalMs: 3000,
  heartbeatPayload: { type: 'heartbeat' as const, status: 'processing' as const },
} as const

// Web search config
export const SEARCH_CONFIG = {
  enabled: true,            // kill-switch
  budgetPerMatchup: 5,      // max searches per scan
  budgetPerAgent: 2,        // max per agent per scan
  cacheTTL: 3600 * 4,       // 4 hours
  noiseThreshold: 0.3,      // if confidence < 0.3, don't use
} as const

export class GuardrailError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'GuardrailError'
  }
}

interface RequestCheckInput {
  inputTokens: number
  estimatedCost?: number
}

/**
 * Check request against limits
 */
export function checkRequestLimits(input: RequestCheckInput): void {
  if (input.inputTokens > REQUEST_LIMITS.maxInputTokens) {
    throw new GuardrailError(
      'TOKEN_LIMIT_EXCEEDED',
      `Input tokens (${input.inputTokens}) exceeds limit (${REQUEST_LIMITS.maxInputTokens})`,
      { inputTokens: input.inputTokens, limit: REQUEST_LIMITS.maxInputTokens }
    )
  }

  if (input.estimatedCost && input.estimatedCost > REQUEST_LIMITS.maxCostPerRequest) {
    throw new GuardrailError(
      'COST_LIMIT_EXCEEDED',
      `Estimated cost ($${input.estimatedCost.toFixed(4)}) exceeds limit ($${REQUEST_LIMITS.maxCostPerRequest})`,
      { estimatedCost: input.estimatedCost, limit: REQUEST_LIMITS.maxCostPerRequest }
    )
  }
}

/**
 * Estimate token count (rough approximation)
 */
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English
  return Math.ceil(text.length / 4)
}

/**
 * Estimate cost based on model and tokens
 */
export function estimateCost(inputTokens: number, outputTokens: number, model: string): number {
  // GPT-4o pricing (approximate)
  const rates: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 0.005 / 1000, output: 0.015 / 1000 },
    'gpt-4o-mini': { input: 0.00015 / 1000, output: 0.0006 / 1000 },
    'gpt-4-turbo': { input: 0.01 / 1000, output: 0.03 / 1000 },
  }

  const rate = rates[model] || rates['gpt-4o']
  return inputTokens * rate.input + outputTokens * rate.output
}

// Heartbeat event type
export interface HeartbeatEvent {
  type: 'heartbeat'
  status: 'processing' | 'searching' | 'analyzing'
  agent?: string
  progress?: number
}

// Data event type
export interface DataEvent<T> {
  type: 'data'
  payload: T
}

// Error event type
export interface ErrorEvent {
  type: 'error'
  code: string
  message: string
}

// Done event type
export interface DoneEvent {
  type: 'done'
}

export type StreamEvent<T> = HeartbeatEvent | DataEvent<T> | ErrorEvent | DoneEvent

/**
 * Create a streaming response with heartbeats
 */
export function createStreamingResponse<T>(
  generator: () => AsyncGenerator<T>,
  options?: {
    heartbeatIntervalMs?: number
    onHeartbeat?: (count: number) => HeartbeatEvent
  }
): ReadableStream<StreamEvent<T>> {
  const heartbeatInterval = options?.heartbeatIntervalMs ?? STREAM_CONFIG.heartbeatIntervalMs

  return new ReadableStream<StreamEvent<T>>({
    async start(controller) {
      let heartbeatCount = 0
      let done = false

      // Heartbeat timer
      const heartbeatTimer = setInterval(() => {
        if (!done) {
          const event = options?.onHeartbeat?.(heartbeatCount) ?? {
            type: 'heartbeat' as const,
            status: 'processing' as const,
          }
          controller.enqueue(event)
          heartbeatCount++
        }
      }, heartbeatInterval)

      try {
        for await (const item of generator()) {
          controller.enqueue({ type: 'data', payload: item })
        }
        controller.enqueue({ type: 'done' })
      } catch (error) {
        controller.enqueue({
          type: 'error',
          code: 'STREAM_ERROR',
          message: (error as Error).message,
        })
      } finally {
        done = true
        clearInterval(heartbeatTimer)
        controller.close()
      }
    },
  })
}

// Search budget tracker
interface SearchBudgetState {
  matchupSearches: number
  agentSearches: Record<string, number>
}

export class SearchBudgetTracker {
  private state: SearchBudgetState = {
    matchupSearches: 0,
    agentSearches: {},
  }

  canSearch(agent?: string): boolean {
    if (!SEARCH_CONFIG.enabled) return false
    if (this.state.matchupSearches >= SEARCH_CONFIG.budgetPerMatchup) return false
    if (agent && (this.state.agentSearches[agent] ?? 0) >= SEARCH_CONFIG.budgetPerAgent) return false
    return true
  }

  recordSearch(agent?: string): void {
    this.state.matchupSearches++
    if (agent) {
      this.state.agentSearches[agent] = (this.state.agentSearches[agent] ?? 0) + 1
    }
  }

  getStats(): { matchup: number; perAgent: Record<string, number> } {
    return {
      matchup: this.state.matchupSearches,
      perAgent: { ...this.state.agentSearches },
    }
  }

  reset(): void {
    this.state = { matchupSearches: 0, agentSearches: {} }
  }
}
