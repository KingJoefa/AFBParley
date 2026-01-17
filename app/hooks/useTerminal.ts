import { useCallback, useState } from 'react'
import type { RunMode } from '@/lib/terminal/run-state'
import type { TerminalResponse } from '@/lib/terminal/schemas'

/** Endpoint map for terminal routes */
const TERMINAL_ENDPOINTS: Record<RunMode, string> = {
  prop: '/api/terminal/prop',
  story: '/api/terminal/story',
  parlay: '/api/terminal/parlay',
}

export interface TerminalRequest {
  matchup: string
  signals?: string[]
  anchor?: string
  odds_paste?: string
}

export interface TerminalError {
  code: string
  status: number | null
  message: string
  recoverable?: boolean
}

export type TerminalResult =
  | { ok: true; data: TerminalResponse }
  | { ok: false; error: TerminalError }

/**
 * Decode error from terminal response (reuses AfbError pattern)
 */
function decodeTerminalError(res: Response, json: any): TerminalError {
  return {
    code: json?.error ? 'TERMINAL_ERROR' : 'HTTP_ERROR',
    status: res.status,
    message: json?.error || `Terminal error ${res.status}`,
    recoverable: json?.recoverable ?? true,
  }
}

/**
 * Hook for terminal API routes (prop, story, parlay)
 * Thin typed wrapper following useAfb patterns
 */
export function useTerminal() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<TerminalError | null>(null)

  const run = useCallback(async (mode: RunMode, req: TerminalRequest): Promise<TerminalResult> => {
    const endpoint = TERMINAL_ENDPOINTS[mode]

    setIsLoading(true)
    setError(null)
    setErrorDetails(null)

    try {
      const payload: Record<string, unknown> = {
        matchup: req.matchup,
        signals: req.signals,
      }

      // Mode-specific fields
      if (req.anchor) payload.anchor = req.anchor
      if (mode === 'prop' && req.odds_paste) payload.odds_paste = req.odds_paste

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json().catch(() => null)

      if (!res.ok) {
        const err = decodeTerminalError(res, json)
        setError(err.message)
        setErrorDetails(err)
        return { ok: false, error: err }
      }

      return { ok: true, data: json }
    } catch (e: any) {
      const err: TerminalError = {
        code: e?.name === 'AbortError' ? 'CLIENT_ABORT' : 'NETWORK_ERROR',
        status: null,
        message: e?.message ?? 'Network error',
        recoverable: true,
      }
      setError(err.message)
      setErrorDetails(err)
      return { ok: false, error: err }
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { run, isLoading, error, errorDetails }
}
