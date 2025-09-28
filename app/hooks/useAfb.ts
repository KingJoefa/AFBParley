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
    // More flexible parsing to handle different formats
    const blocks = text.split(/(?=Script\s+\d+)/i).slice(1)
    if (blocks.length === 0) return null
    
    // First grab assumptions from the full text
    const assumptionsMatch = text.match(/Assumptions?:([^\n]+)/i)
    const assumptionsLine = assumptionsMatch ? assumptionsMatch[1].trim() : ''
    
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      const titleMatch = b.match(/Script\s+\d+[:\-]?\s*(.+)/i)
      const title = titleMatch ? titleMatch[1].trim().replace(/^"|"$/g, '') : `Script ${i + 1}`
      
      const narrativeMatch = b.match(/Narrative[:\-]?\s*(.*?)(?=\n•|Legs:|$)/is)
      const narrative = narrativeMatch ? narrativeMatch[1].trim() : ''
      
      // Look for legs in various formats
      const legMatches = b.match(/•\s*(.+?)(?=\n•|\n\$1|\nNotes:|$)/g) || []
      const legs = legMatches.map(l => {
        const cleaned = l.replace(/^•\s*/, '').trim()
        // Try to parse structured format: "Market: Selection, odds X"
        const structuredMatch = cleaned.match(/(.+?):\s*(.+?),\s*odds\s*([+-]?\d+)/)
        if (structuredMatch) {
          return {
            market: structuredMatch[1].trim(),
            selection: structuredMatch[2].trim(),
            odds: structuredMatch[3].trim(),
            text: cleaned
          }
        }
        return { text: cleaned }
      })
      
      const mathMatch = b.match(/\$1\s*Parlay\s*Math:\s*([^\n]+)/i)
      const math = mathMatch ? { steps: mathMatch[1].trim() } : undefined
      
      scripts.push({ title, narrative, legs, math })
    }
    return { assumptions: { raw: assumptionsLine }, scripts }
  } catch (error) {
    console.error('Error parsing text to scripts:', error)
    return null
  }
}


