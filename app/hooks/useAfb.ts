import { useCallback, useState } from 'react'
import { decodeAfbErrorFromResponse, type AfbError } from '@/lib/afb/error'

export type Voice = 'analyst' | 'hype' | 'coach'

export interface AfbRequest {
  matchup: string
  lineFocus?: string
  angles?: string[]
  voice?: Voice
  retrievalTags?: string[]
  userSuppliedOdds?: Array<{ leg: string; americanOdds: number }>
  profile?: string
  signal?: AbortSignal
}

export type AfbBuildResult<T = any> =
  | { ok: true; data: T }
  | { ok: false; error: AfbError }

export function useAfb() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<AfbError | null>(null)

  const build = useCallback(async (req: AfbRequest): Promise<AfbBuildResult> => {
    setIsLoading(true)
    setError(null)
    setErrorDetails(null)
    try {
      const payload = {
        matchup: req.matchup,
        line_focus: req.lineFocus,
        angles: req.angles,
        retrieval_tags: req.retrievalTags,
        voice: req.voice,
        profile: req.profile,
        user_supplied_odds: req.userSuppliedOdds?.map(o => ({
          leg: o.leg,
          american_odds: o.americanOdds,
        })),
      }

      const res = await fetch('/api/afb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: req.signal,
      })

      if (!res.ok) {
        const err = await decodeAfbErrorFromResponse(res)
        setError(err.message || `AFB error ${res.status}`)
        setErrorDetails(err)
        return { ok: false, error: err }
      }

      const json = await res.json().catch(() => null)
      // Guard: treat "ok" with error payload as error.
      if (json && typeof json === 'object' && (json.code || json.error || json.message) && !(json.assumptions && Array.isArray(json.scripts))) {
        const err = await decodeAfbErrorFromResponse(new Response(JSON.stringify(json), { status: res.status, headers: { 'content-type': 'application/json' } }))
        setError(err.message || `AFB error ${res.status}`)
        setErrorDetails(err)
        return { ok: false, error: err }
      }

      return { ok: true, data: json }
    } catch (e: any) {
      const isAbort = e?.name === 'AbortError'
      const err: AfbError = {
        code: isAbort ? 'CLIENT_ABORT' : 'NETWORK_ERROR',
        status: null,
        message: e?.message ?? (isAbort ? 'Request aborted' : 'Network error'),
        details: { name: e?.name },
      }
      setError(err.message)
      setErrorDetails(err)
      return { ok: false, error: err }
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { build, isLoading, error, errorDetails }
}
