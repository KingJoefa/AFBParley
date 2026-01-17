/**
 * Terminal Response Contract
 *
 * Single unified response shape for all terminal actions (prop/story/parlay).
 * The terminal renderer NEVER branches on action type - it just renders Alert[].
 *
 * Each route produces Alert[] with mode-specific metadata in the alert fields.
 * The response wrapper adds provenance, timing, and mode identification.
 */

import { z } from 'zod'
import { AlertSchema, type Alert } from './alert'
import { ProvenanceSchema, type Provenance } from './provenance'

// Response modes match run modes
export const ResponseModeSchema = z.enum(['prop', 'story', 'parlay'])
export type ResponseMode = z.infer<typeof ResponseModeSchema>

// Unified terminal response
export const TerminalResponseSchema = z.object({
  // Core contract: Alert[] is always present
  alerts: z.array(AlertSchema),

  // Mode identification (for logging/debugging, not rendering)
  mode: ResponseModeSchema,

  // Request context
  request_id: z.string(),
  matchup: z.object({
    home: z.string(),
    away: z.string(),
  }),

  // Agent metadata
  agents: z.object({
    invoked: z.array(z.string()),
    silent: z.array(z.string()),
  }),

  // Provenance for traceability
  provenance: ProvenanceSchema,

  // Timing
  timing_ms: z.number(),

  // Optional flags
  fallback: z.boolean().optional(),
  warnings: z.array(z.string()).optional(),
}).strict()

export type TerminalResponse = z.infer<typeof TerminalResponseSchema>

/**
 * Build a TerminalResponse from alerts
 */
export function buildTerminalResponse(params: {
  alerts: Alert[]
  mode: ResponseMode
  requestId: string
  matchup: { home: string; away: string }
  agents: { invoked: string[]; silent: string[] }
  provenance: Provenance
  timingMs: number
  fallback?: boolean
  warnings?: string[]
}): TerminalResponse {
  return {
    alerts: params.alerts,
    mode: params.mode,
    request_id: params.requestId,
    matchup: params.matchup,
    agents: params.agents,
    provenance: params.provenance,
    timing_ms: params.timingMs,
    ...(params.fallback && { fallback: true }),
    ...(params.warnings?.length && { warnings: params.warnings }),
  }
}

/**
 * Empty response for no-findings case
 */
export function buildEmptyResponse(params: {
  mode: ResponseMode
  requestId: string
  matchup: { home: string; away: string }
  agents: { invoked: string[]; silent: string[] }
  provenance: Provenance
  timingMs: number
  message?: string
}): TerminalResponse & { message?: string } {
  return {
    alerts: [],
    mode: params.mode,
    request_id: params.requestId,
    matchup: params.matchup,
    agents: params.agents,
    provenance: params.provenance,
    timing_ms: params.timingMs,
    ...(params.message && { message: params.message }),
  } as TerminalResponse & { message?: string }
}

/**
 * Error response that still satisfies Alert[] contract
 */
export function buildErrorResponse(params: {
  mode: ResponseMode
  requestId: string
  error: string
  recoverable: boolean
}): { alerts: Alert[]; error: string; request_id: string; mode: ResponseMode; fallback: true } {
  return {
    alerts: [], // Empty but present
    mode: params.mode,
    request_id: params.requestId,
    error: params.error,
    fallback: true,
  }
}
