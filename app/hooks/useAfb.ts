import { useCallback, useState } from 'react'

export type Voice = 'analyst' | 'hype' | 'coach'
export type Variance = 'conservative' | 'standard' | 'longshot'

export interface AfbRequest {
  matchup: string
  lineFocus?: string
  angles?: string[]
  voice?: Voice
  wantJson?: boolean
  byoa?: { filename: string; content: string }[]
}

export function useAfb() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const build = useCallback(async (req: AfbRequest) => {
    setIsLoading(true)
    setError(null)
    try {
      // First try JSON mode
      let res = await fetch('/api/afb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...req, wantJson: true })
      })
      if (res.ok) {
        return await res.json()
      }

      // Fallback to text mode
      res = await fetch('/api/afb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...req, wantJson: false })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || `AFB error ${res.status}`)
      }
      const text = await res.text()
      // Heuristic parse to pseudo JSON
      const parsed = parseTextToScripts(text)
      return parsed ?? text
    } catch (e: any) {
      setError(e?.message ?? 'Unknown error')
      throw e
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { build, isLoading, error }
}

function parseTextToScripts(text: string): any | null {
  try {
    const scripts: any[] = []
    const blocks = text.split(/\n\s*Script\s+\d+\s+[-–]\s+/i)
    if (blocks.length <= 1) return null
    // First block is assumptions header; attempt to grab assumptions line
    const assumptionsMatch = text.match(/Assumptions?:([^\n]+)/i)
    const assumptionsLine = assumptionsMatch ? assumptionsMatch[1].trim() : ''
    for (let i = 1; i < blocks.length; i++) {
      const b = blocks[i]
      const [titleAndRest, ...rest] = b.split(/\n/)
      const title = (titleAndRest || '').trim().replace(/^"|"$/g, '')
      const narrativeMatch = b.match(/Narrative:([\s\S]*?)\n\s*•\s*Legs/i)
      const narrative = narrativeMatch ? narrativeMatch[1].trim() : ''
      const legsSectionMatch = b.match(/\n\s*•\s*Legs:([\s\S]*?)(\n\s*\$1 Parlay Math:|\n\s*Notes:|$)/i)
      const legsLines = legsSectionMatch ? legsSectionMatch[1].split(/\n\s*•\s*/).map(s => s.trim()).filter(Boolean) : []
      const legs = legsLines.map(l => ({ text: l }))
      const mathMatch = b.match(/\$1\s*Parlay\s*Math:\s*([^\n]+)/i)
      const math = mathMatch ? { steps: mathMatch[1].trim() } : undefined
      scripts.push({ title, narrative, legs, math })
    }
    return { assumptions: { raw: assumptionsLine }, scripts }
  } catch {
    return null
  }
}


