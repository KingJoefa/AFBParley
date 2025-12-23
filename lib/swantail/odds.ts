export type OddsPasteEntry = {
  selectionText: string
  americanOdds: number
}

export function parseOddsPaste(text: string): OddsPasteEntry[] {
  if (!text) return []
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const entries: OddsPasteEntry[] = []
  for (const line of lines) {
    const match = line.match(/([+-]\d{3,4})/)
    if (!match) continue
    const americanOdds = Number(match[1])
    if (!Number.isFinite(americanOdds)) continue
    const selectionText = line.replace(match[1], '').trim()
    if (!selectionText) continue
    entries.push({ selectionText, americanOdds })
  }
  return entries
}

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenSet(value: string): Set<string> {
  return new Set(value.split(' ').filter(Boolean))
}

export function similarityScore(a: string, b: string): number {
  const na = normalizeText(a)
  const nb = normalizeText(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.9
  const sa = tokenSet(na)
  const sb = tokenSet(nb)
  const intersection = [...sa].filter(t => sb.has(t)).length
  const union = new Set([...sa, ...sb]).size
  return union === 0 ? 0 : intersection / union
}

export function matchOdds(selection: string, entries: OddsPasteEntry[]): OddsPasteEntry | null {
  let best: OddsPasteEntry | null = null
  let bestScore = 0
  for (const entry of entries) {
    const score = similarityScore(selection, entry.selectionText)
    if (score > bestScore) {
      best = entry
      bestScore = score
    }
  }
  if (best && bestScore >= 0.6) return best
  return null
}
