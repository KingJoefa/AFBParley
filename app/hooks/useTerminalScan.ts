import { useCallback, useRef, useState } from 'react'
import type { Alert, Finding } from '@/lib/terminal/schemas'

export interface ScanRequest {
  matchup: string
  signals?: string[]
  anchor?: string
}

export interface ScanResponse {
  request_id: string
  alerts: Alert[]
  findings: Finding[]
  matchup: { home: string; away: string }
  agents: { invoked: string[]; silent: string[] }
  payload_hash: string
  timing_ms: number
  fallback?: boolean
  warnings?: string[]
}

export interface ScanError {
  code: string
  status: number | null
  message: string
  recoverable?: boolean
}

export type ScanResult =
  | { ok: true; data: ScanResponse }
  | { ok: false; error: ScanError }

/**
 * Decode error from scan response
 */
function decodeScanError(res: Response, json: unknown): ScanError {
  const body = json as Record<string, unknown> | null
  return {
    code: body?.error ? 'SCAN_ERROR' : 'HTTP_ERROR',
    status: res.status,
    message: (body?.message as string) || (body?.error as string) || `Scan error ${res.status}`,
    recoverable: (body?.recoverable as boolean) ?? true,
  }
}

/**
 * Hook for /api/terminal/scan (Phase 1)
 * Thin typed wrapper with AbortController support for cancellation
 */
export function useTerminalScan() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<ScanError | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  /**
   * Abort any in-flight scan request
   */
  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  /**
   * Execute a scan request
   */
  const scan = useCallback(async (req: ScanRequest): Promise<ScanResult> => {
    // Abort any previous request
    abort()

    // Create new AbortController for this request
    const controller = new AbortController()
    abortControllerRef.current = controller

    setIsLoading(true)
    setError(null)
    setErrorDetails(null)

    try {
      const payload = {
        matchup: req.matchup,
        signals: req.signals,
        anchor: req.anchor,
      }

      const res = await fetch('/api/terminal/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      const json = await res.json().catch(() => null)

      if (!res.ok) {
        const err = decodeScanError(res, json)
        setError(err.message)
        setErrorDetails(err)
        return { ok: false, error: err }
      }

      // Transform response to include findings if present
      const data: ScanResponse = {
        request_id: json.request_id,
        alerts: json.alerts || [],
        findings: json.findings || [],
        matchup: json.matchup,
        agents: json.agents,
        payload_hash: json.payload_hash || json.provenance?.payload_hash || json.request_id,
        timing_ms: json.timing_ms,
        fallback: json.fallback,
        warnings: json.warnings,
      }

      return { ok: true, data }
    } catch (e: unknown) {
      const err = e as Error
      // Handle abort specifically
      if (err.name === 'AbortError') {
        const abortErr: ScanError = {
          code: 'SCAN_ABORTED',
          status: null,
          message: 'Scan was cancelled',
          recoverable: true,
        }
        // Don't set error state for intentional abort
        return { ok: false, error: abortErr }
      }

      const scanErr: ScanError = {
        code: 'NETWORK_ERROR',
        status: null,
        message: err.message ?? 'Network error',
        recoverable: true,
      }
      setError(scanErr.message)
      setErrorDetails(scanErr)
      return { ok: false, error: scanErr }
    } finally {
      setIsLoading(false)
      // Clear controller reference
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    }
  }, [abort])

  return { scan, abort, isLoading, error, errorDetails }
}
