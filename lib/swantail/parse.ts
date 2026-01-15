import { computeParlayMath } from '@/lib/swantail/math'
import type { SwantailResponse } from '@/lib/swantail/schema'

const REQUIRED_NOTES = [
  'No guarantees; high variance by design; bet what you can afford.',
  'If odds not supplied, american_odds are illustrative — paste your book’s prices to re-price.'
]

const OFFER_OPPOSITE = 'Want the other side of this story?' as const

function cleanLine(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function parseAmericanOdds(text: string): number | null {
  const match = text.match(/([+-]\d{2,4})/)
  if (!match) return null
  const num = Number(match[1])
  return Number.isFinite(num) ? num : null
}

function normalizeAngles(value: string): string[] {
  return value
    .split(/[,;]+/)
    .map(v => v.trim())
    .filter(Boolean)
}

function parseAssumptions(lines: string[], fallback: SwantailResponse['assumptions']) {
  const result = { ...fallback }
  const start = lines.findIndex(l => /^assumptions\b/i.test(l))
  if (start === -1) return result
  for (let i = start + 1; i < lines.length; i += 1) {
    const raw = lines[i]
    if (!raw) continue
    if (/^script\s+\d+/i.test(raw)) break
    const line = raw.replace(/^[-•*]\s*/, '')
    const [keyRaw, ...rest] = line.split(':')
    if (!rest.length) continue
    const key = keyRaw.trim().toLowerCase()
    const value = cleanLine(rest.join(':'))
    if (!value) continue
    if (key.startsWith('matchup')) result.matchup = value
    if (key.startsWith('line')) result.line_focus = value
    if (key.startsWith('angles')) result.angles = normalizeAngles(value)
    if (key.startsWith('voice')) result.voice = value.toLowerCase() as SwantailResponse['assumptions']['voice']
  }
  return result
}

function parseLegLine(line: string) {
  const cleaned = line.replace(/^[-•*]\s*/, '').trim()
  const odds = parseAmericanOdds(cleaned)
  let odds_source: 'illustrative' | 'user_supplied' = 'illustrative'
  if (/user\s*supplied/i.test(cleaned)) odds_source = 'user_supplied'

  const match = cleaned.match(/^(.*?):\s*(.*?)(?:,\s*odds\s*[+-]?\d+)?(?:,\s*[^,]+)?$/i)
  const market = match ? match[1].trim() : 'Leg'
  const selection = match ? match[2].trim() : cleaned

  return {
    market,
    selection,
    american_odds: odds ?? -110,
    odds_source,
  }
}

function parseScriptBlock(block: string[]) {
  const titleLine = block[0] || 'Script'
  const titleMatch = titleLine.match(/script\s+\d+\s*[—-]\s*(.*)$/i)
  const title = cleanLine(titleMatch?.[1] || titleLine.replace(/^script\s+\d+\s*/i, '')) || 'Script'

  let narrative = ''
  const narrativeIndex = block.findIndex(l => /^narrative\s*:/i.test(l))
  if (narrativeIndex !== -1) {
    const narrativeLine = block[narrativeIndex].replace(/^narrative\s*:\s*/i, '')
    const rest: string[] = []
    for (let i = narrativeIndex + 1; i < block.length; i += 1) {
      const line = block[i]
      if (/^legs\b/i.test(line) || /^\$1\s*parlay\s*math/i.test(line) || /^notes\b/i.test(line)) break
      if (line) rest.push(line)
    }
    narrative = cleanLine([narrativeLine, ...rest].join(' '))
  } else {
    const firstText = block.slice(1).find(l => l && !/^legs\b/i.test(l))
    narrative = cleanLine(firstText || '')
  }

  const legs: ReturnType<typeof parseLegLine>[] = []
  const legsIndex = block.findIndex(l => /^legs\b/i.test(l))
  if (legsIndex !== -1) {
    for (let i = legsIndex + 1; i < block.length; i += 1) {
      const line = block[i]
      if (!line) continue
      if (/^\$1\s*parlay\s*math/i.test(line) || /^notes\b/i.test(line)) break
      if (/^[-•*]\s*/.test(line)) legs.push(parseLegLine(line))
    }
  }

  const odds = legs.map(l => l.american_odds)
  const math = computeParlayMath(odds.length ? odds : [-110, -110, -110])

  const notes: string[] = []
  const notesIndex = block.findIndex(l => /^notes\b/i.test(l))
  if (notesIndex !== -1) {
    for (let i = notesIndex + 1; i < block.length; i += 1) {
      const line = block[i]
      if (!line) continue
      if (/^script\s+\d+/i.test(line)) break
      if (/^want the other side/i.test(line)) break
      if (/^[-•*]\s*/.test(line)) {
        notes.push(cleanLine(line.replace(/^[-•*]\s*/, '')))
      }
    }
  }

  for (const req of REQUIRED_NOTES) {
    if (!notes.some(n => n.toLowerCase() === req.toLowerCase())) notes.push(req)
  }

  return {
    title,
    narrative,
    legs: legs.slice(0, 5),
    parlay_math: math,
    notes,
    offer_opposite: OFFER_OPPOSITE
  }
}

function fillLegs(legs: ReturnType<typeof parseLegLine>[], lineFocus?: string) {
  const next = [...legs]
  const fillers: Array<ReturnType<typeof parseLegLine>> = []
  if (lineFocus && lineFocus.trim()) {
    fillers.push({ market: 'Market Anchor', selection: lineFocus.trim(), american_odds: -110, odds_source: 'illustrative' })
  }
  fillers.push(
    { market: 'Game Total', selection: 'Over 41.5', american_odds: -110, odds_source: 'illustrative' },
    { market: 'Team Total (Home)', selection: 'Over 20.5', american_odds: -110, odds_source: 'illustrative' },
    { market: 'Team Total (Away)', selection: 'Under 20.5', american_odds: -110, odds_source: 'illustrative' },
  )
  for (const fill of fillers) {
    if (next.length >= 3) break
    const exists = next.some(l => l.selection.toLowerCase() === fill.selection.toLowerCase())
    if (!exists) next.push(fill)
  }
  return next.slice(0, 5)
}

export function parseSwantailOutputText(text: string, fallback: SwantailResponse['assumptions']): SwantailResponse {
  const rawLines = text.split(/\r?\n/).map(l => l.trim())
  const lines = rawLines.filter(l => l.length > 0)
  const assumptions = parseAssumptions(lines, fallback)

  const scriptIndices: number[] = []
  lines.forEach((line, idx) => {
    if (/^script\s+\d+/i.test(line)) scriptIndices.push(idx)
  })

  const scripts = scriptIndices.map((start, i) => {
    const end = i + 1 < scriptIndices.length ? scriptIndices[i + 1] : lines.length
    const block = lines.slice(start, end)
    return parseScriptBlock(block)
  })

  const normalizedScripts = (scripts.length ? scripts.slice(0, 3) : [parseScriptBlock(['Script 1'])]).map(script => {
    const filledLegs = fillLegs(script.legs, assumptions.line_focus)
    const narrative = script.narrative || 'Tail outcome script based on the wrapper output.'
    const math = computeParlayMath(filledLegs.map(l => l.american_odds))
    const notes = script.notes?.length ? script.notes : [...REQUIRED_NOTES]
    for (const req of REQUIRED_NOTES) {
      if (!notes.some(n => n.toLowerCase() === req.toLowerCase())) notes.push(req)
    }
    return { ...script, narrative, legs: filledLegs, parlay_math: math, notes, offer_opposite: OFFER_OPPOSITE }
  })

  return {
    assumptions,
    scripts: normalizedScripts
  }
}
