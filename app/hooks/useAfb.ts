import { useCallback, useState } from 'react'

export type Voice = 'analyst' | 'hype' | 'coach'
export type Variance = 'conservative' | 'standard' | 'longshot'

export interface AfbRequest {
  matchup: string
  lineFocus?: string
  angles?: string[]
  voice?: Voice
  wantJson?: boolean
}

export function useAfb() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const build = useCallback(async (req: AfbRequest) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/afb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...req, wantJson: true })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || `AFB error ${res.status}`)
      }
      return await res.json()
    } catch (e: any) {
      setError(e?.message ?? 'Unknown error')
      throw e
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { build, isLoading, error }
}


