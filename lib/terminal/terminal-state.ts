/**
 * Terminal State Management
 *
 * Two-phase terminal architecture:
 *   Phase 1 (Scan): Produces canonical { alerts, findings } stored in terminalState
 *   Phase 2 (Build): Consumes terminalState to produce views for output_type
 *
 * Staleness is determined by hash comparison only (no time expiry).
 */

import type { Alert, Finding } from './schemas'
import type { Script } from './schemas/script'
import type { SwantailResponse } from '@/lib/swantail/schema'

export type OutputType = 'prop' | 'story' | 'parlay'

export type AnalysisMeta = {
  request_id: string
  scan_hash: string        // Hash of inputs at scan time
  scannedAt: number
  status: 'idle' | 'scanning' | 'success' | 'stale' | 'error'
  alertCount: number
  findingCount: number
  error?: string
}

export type TerminalState = {
  alerts: Alert[]
  findings: Finding[]      // Canonical objects for Build phase
  analysisMeta: AnalysisMeta | null
}

/**
 * Discriminated union for view cache
 * - 'swantail': LLM-generated narrative scripts (story mode)
 * - 'terminal': Correlated parlay scripts from alerts (prop/parlay modes)
 */
export type BuildView =
  | { kind: 'swantail'; data: SwantailResponse }
  | { kind: 'terminal'; scripts: Script[]; alerts: Alert[] }

export type BuildResult = {
  build_id: string         // Stable ID for lazy-fetching other views
  request_id: string
  payload_hash: string
  output_type: OutputType  // Which view was built
  view: BuildView          // Single view returned (1x LLM cost)
  created_at: string
}

/**
 * Create initial empty terminal state
 */
export function createInitialTerminalState(): TerminalState {
  return {
    alerts: [],
    findings: [],
    analysisMeta: null,
  }
}

/**
 * Compute a hash of scan-affecting inputs for staleness detection
 * Includes selectedAgents since agent scope is part of execution context
 */
export function computeInputsHash(
  matchup: string,
  anchors: string[],
  scriptBias: string[],
  signals: string[],
  oddsPaste: string,
  selectedAgents?: string[]
): string {
  const agentKey = selectedAgents ? selectedAgents.slice().sort().join(',') : 'all'
  const anchorKey = anchors.slice().sort().join(',')
  const biasKey = scriptBias.slice().sort().join(',')
  const payload = `${matchup}|anchors:${anchorKey}|bias:${biasKey}|${signals.sort().join(',')}|${oddsPaste || ''}|agents:${agentKey}`
  // Simple string hash for client-side use
  let hash = 0
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return `h_${Math.abs(hash).toString(16)}`
}

/**
 * Check if the current scan is stale compared to current inputs
 * Staleness = hash mismatch only (no time-based expiry)
 */
export function isScanStale(state: TerminalState, currentHash: string): boolean {
  if (!state.analysisMeta) return true
  if (state.analysisMeta.status !== 'success') return true
  return state.analysisMeta.scan_hash !== currentHash
}

/**
 * Update terminal state after a successful scan
 */
export function updateStateFromScan(
  state: TerminalState,
  result: {
    alerts: Alert[]
    findings: Finding[]
    request_id: string
    scan_hash: string
  }
): TerminalState {
  return {
    alerts: result.alerts,
    findings: result.findings,
    analysisMeta: {
      request_id: result.request_id,
      scan_hash: result.scan_hash,
      scannedAt: Date.now(),
      status: 'success',
      alertCount: result.alerts.length,
      findingCount: result.findings.length,
    },
  }
}

/**
 * Mark terminal state as scanning
 */
export function markScanning(state: TerminalState, scan_hash: string): TerminalState {
  return {
    ...state,
    analysisMeta: {
      request_id: '',
      scan_hash,
      scannedAt: Date.now(),
      status: 'scanning',
      alertCount: 0,
      findingCount: 0,
    },
  }
}

/**
 * Mark terminal state as error
 */
export function markScanError(state: TerminalState, error: string): TerminalState {
  return {
    ...state,
    analysisMeta: state.analysisMeta
      ? { ...state.analysisMeta, status: 'error', error }
      : null,
  }
}

/**
 * Mark terminal state as stale (agent selection changed)
 * Preserves existing alerts/findings for visibility but blocks Build
 */
export function markScanStale(state: TerminalState): TerminalState {
  if (!state.analysisMeta || state.analysisMeta.status !== 'success') {
    return state
  }
  return {
    ...state,
    analysisMeta: { ...state.analysisMeta, status: 'stale' },
  }
}

/**
 * Reset terminal state to idle
 */
export function resetTerminalState(): TerminalState {
  return createInitialTerminalState()
}
