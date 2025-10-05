import { useCallback, useState } from 'react'

export type Voice = 'analyst' | 'hype' | 'coach'

export interface AfbRequest {
  matchup: string
  lineFocus?: string
  angles?: string[]
  voice?: Voice
  userSuppliedOdds?: Array<{ leg: string; americanOdds: number }>
  profile?: string
  signal?: AbortSignal
}

export function useAfb() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const build = useCallback(async (req: AfbRequest) => {
    setIsLoading(true)
    setError(null)
    try {
      const payload = {
        matchup: req.matchup,
        line_focus: req.lineFocus,
        angles: req.angles,
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
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || `AFB error ${res.status}`)
      }

      const text = await res.text()
      return text
    } catch (e: any) {
      setError(e?.message ?? 'Unknown error')
      throw e
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { build, isLoading, error }
}
