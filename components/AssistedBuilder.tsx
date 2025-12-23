'use client'
import { useCallback, useMemo, useState } from 'react'
import { useAfb } from '@/app/hooks/useAfb'
import SwantailBuilderForm from '@/components/SwantailBuilderForm'
import SwantailOddsPaste from '@/components/SwantailOddsPaste'
import SwantailScriptsView from '@/components/SwantailScriptsView'
import { matchOdds, parseOddsPaste } from '@/lib/swantail/odds'
import type { SwantailResponse } from '@/lib/swantail/schema'
import { track } from '@/lib/telemetry'

function invertLineFocus(value: string): string {
  if (!value) return value
  let next = value
  next = next.replace(/\bOver\b/gi, (m) => (m.toLowerCase() === 'over' ? 'Under' : 'Over'))
  next = next.replace(/\bUnder\b/gi, (m) => (m.toLowerCase() === 'under' ? 'Over' : 'Under'))
  next = next.replace(/([+-])(\d+(?:\.\d+)?)/g, (_, sign, num) => (sign === '-' ? `+${num}` : `-${num}`))
  return next
}

export default function AssistedBuilder() {
  const { build, isLoading, error } = useAfb()
  const [matchup, setMatchup] = useState('')
  const [lineFocus, setLineFocus] = useState('')
  const [angles, setAngles] = useState<string[]>([])
  const voice: 'analyst' = 'analyst'
  const [oddsPaste, setOddsPaste] = useState('')
  const [data, setData] = useState<SwantailResponse | null>(null)

  const oddsEntries = useMemo(() => parseOddsPaste(oddsPaste), [oddsPaste])

  const onBuild = useCallback(async () => {
    if (!matchup.trim()) return
    track('ui_build_clicked', { voice, anglesCount: angles.length })
    try {
      setData(null)
      const res = await build({
        matchup: matchup.trim(),
        lineFocus: lineFocus.trim() || undefined,
        angles,
        voice,
        userSuppliedOdds: oddsEntries.map(o => ({ leg: o.selectionText, americanOdds: o.americanOdds }))
      })
      setData(res as SwantailResponse)
      track('ui_build_success')
    } catch (e) {
      track('ui_build_error', { message: (e as any)?.message })
    }
  }, [matchup, lineFocus, angles, voice, oddsEntries, build])

  const onOpposite = useCallback(async (scriptIndex: number) => {
    if (!matchup.trim()) return
    const oppositeAngles = Array.from(new Set([
      ...angles,
      'opposite case',
      'invert assumptions'
    ]))
    const oppositeLine = invertLineFocus(lineFocus)
    track('ui_build_clicked', { voice, anglesCount: oppositeAngles.length, opposite: true, scriptIndex })
    try {
      setData(null)
      const res = await build({
        matchup: matchup.trim(),
        lineFocus: oppositeLine.trim() || undefined,
        angles: oppositeAngles,
        voice,
        userSuppliedOdds: oddsEntries.map(o => ({ leg: o.selectionText, americanOdds: o.americanOdds }))
      })
      setData(res as SwantailResponse)
      track('ui_build_success')
    } catch (e) {
      track('ui_build_error', { message: (e as any)?.message })
    }
  }, [matchup, lineFocus, angles, voice, oddsEntries, build])

  const showNoMatches = useMemo(() => {
    if (!data || oddsEntries.length === 0) return false
    let matched = 0
    for (const script of data.scripts) {
      for (const leg of script.legs) {
        if (matchOdds(leg.selection, oddsEntries)) matched += 1
      }
    }
    return matched === 0
  }, [data, oddsEntries])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <SwantailBuilderForm
              matchup={matchup}
              lineFocus={lineFocus}
              angles={angles}
              isLoading={isLoading}
              onChangeMatchup={setMatchup}
              onChangeLineFocus={setLineFocus}
              onChangeAngles={setAngles}
              onBuild={onBuild}
            />

            <SwantailOddsPaste value={oddsPaste} onChange={setOddsPaste} />

            {showNoMatches && (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                No matches applied.
              </div>
            )}
          </div>

          <div className="space-y-4">
            {error && (
              <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}
            <SwantailScriptsView data={data} oddsEntries={oddsEntries} onOpposite={onOpposite} />
          </div>
        </div>
      </div>
    </div>
  )
}
