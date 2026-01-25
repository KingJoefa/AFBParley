'use client'
import { useMemo, useState } from 'react'
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
  oddsCacheStatus?: string
}

export default function SwantailScriptCard({ script, oddsEntries, oddsCacheStatus }: Props) {
  const [mathOpen, setMathOpen] = useState(false)
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
  const mathAvailable = Boolean(script.parlay_math) && oddsCacheStatus !== 'ERROR'
  const disclaimerTooltip = notes.join('\n')
  const exposureLine = `Exposure · $1 stake · est payout $${enriched.math.payout.toFixed(2)}`
  const mathSteps = `${enriched.math.leg_decimals.map(d => d.toFixed(2)).join(' × ')} = ${enriched.math.product_decimal.toFixed(2)}`
  const payoutLine = `Payout $${enriched.math.payout.toFixed(2)} · Profit $${enriched.math.profit.toFixed(2)}`

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
        {mathAvailable ? (
          <>
            <div className="text-[11px] text-white/80">{exposureLine}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setMathOpen(open => !open)}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-white/70 transition hover:bg-white/10"
              >
                {mathOpen ? 'Math ▴' : 'Math ▾'}
              </button>
              {oddsEntries.length === 0 && (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/50">
                  Re-price not applied
                </span>
              )}
            </div>
            {mathOpen && (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/70">
                <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">Math (Illustrative)</div>
                <div className="mt-2 font-mono text-[11px] text-white/80">{mathSteps}</div>
                <div className="mt-2 text-[11px] text-white/60">{payoutLine}</div>
              </div>
            )}
          </>
        ) : (
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/60">
            Lines unavailable
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-white/60">
        <span>Illustrative lines · High variance</span>
        <span
          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] text-white/50"
          title={disclaimerTooltip}
          aria-label="Disclaimer details"
        >
          ⓘ
        </span>
      </div>
    </div>
  )
}
