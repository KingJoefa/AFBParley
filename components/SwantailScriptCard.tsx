'use client'
import { useMemo } from 'react'
import { computeParlayMath, mathDiffers } from '@/lib/swantail/math'
import { matchOdds } from '@/lib/swantail/odds'
import type { SwantailScript } from '@/lib/swantail/schema'
import type { OddsPasteEntry } from '@/lib/swantail/odds'

const REQUIRED_NOTES = [
  'No guarantees; high variance by design; bet what you can afford.',
  'If odds not supplied, american_odds are illustrative — paste your book’s prices to re-price.'
]

type Props = {
  script: SwantailScript
  oddsEntries: OddsPasteEntry[]
  onOpposite: () => void
}

export default function SwantailScriptCard({ script, oddsEntries, onOpposite }: Props) {
  const enriched = useMemo(() => {
    let matchCount = 0
    const legs = script.legs.map(leg => {
      const matched = matchOdds(leg.selection, oddsEntries)
      if (matched) matchCount += 1
      const american_odds = matched ? matched.americanOdds : leg.american_odds
      const odds_source = matched ? 'user_supplied' : leg.odds_source
      return { ...leg, american_odds, odds_source }
    })
    const math = computeParlayMath(legs.map(l => l.american_odds))
    const warning = mathDiffers(math, script.parlay_math)
    return { legs, math, warning, matchCount }
  }, [script, oddsEntries])

  const notes = Array.isArray(script.notes) && script.notes.length ? script.notes : REQUIRED_NOTES

  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-6 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">Tail script</div>
          <div className="mt-1 text-lg font-semibold text-white">{script.title}</div>
          <p className="mt-2 text-sm italic leading-relaxed text-white/80">{script.narrative}</p>
        </div>
        {enriched.warning && (
          <span className="rounded-full bg-amber-500/20 px-3 py-1 text-[11px] font-semibold text-amber-200">
            Math adjusted
          </span>
        )}
      </div>

      <div className="mt-5">
        <div className="mb-2 text-xs uppercase tracking-wide text-white/50">Correlated legs</div>
        <div className="mb-2 text-[11px] text-white/50">These legs rise and fall together.</div>
        <div className="divide-y divide-white/10 rounded-2xl border border-white/10">
          {enriched.legs.map((leg, idx) => (
            <div key={`${leg.market}-${idx}`} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm">
              <div className="col-span-5 text-white">{leg.market}</div>
              <div className="col-span-5 text-white/70">{leg.selection}</div>
              <div className="col-span-2 text-right text-white/80">{leg.american_odds > 0 ? `+${leg.american_odds}` : leg.american_odds}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">
        <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">Exposure</div>
        <div className="mt-1 text-[11px] text-white/50">$1 baseline · deterministic math</div>
        <div className="mt-2">{enriched.math.steps}</div>
      </div>

      <div className="mt-3 text-xs text-white/60">
        {notes.map((note, idx) => (
          <div key={`${note}-${idx}`}>• {note}</div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-white/50">
          {oddsEntries.length > 0 ? `Re-price: ${enriched.matchCount} applied` : 'Re-price not applied'}
        </div>
        <button
          onClick={onOpposite}
          className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
        >
          View counter-story
        </button>
      </div>

      <div className="mt-3 text-[11px] text-white/50">{script.offer_opposite}</div>
    </div>
  )
}
