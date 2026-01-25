'use client'
import type { SwantailResponse } from '@/lib/swantail/schema'
import type { OddsPasteEntry } from '@/lib/swantail/odds'
import SwantailScriptCard from '@/components/SwantailScriptCard'

const DISCLAIMER = 'Informational only. High variance by design. No guarantees.'

type Props = {
  data: SwantailResponse | null
  oddsEntries: OddsPasteEntry[]
  oddsCacheStatus?: string
}

export default function SwantailScriptsView({ data, oddsEntries, oddsCacheStatus }: Props) {
  if (!data) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-white/70">
        <div className="text-base">Your tail scripts will appear here.</div>
        <div className="mt-2 text-sm text-white/50">Each script is a coherent story — not a list of picks.</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {data.scripts.map((script, idx) => (
        <SwantailScriptCard
          key={`${script.title}-${idx}`}
          script={script}
          oddsEntries={oddsEntries}
          oddsCacheStatus={oddsCacheStatus}
        />
      ))}
      <div className="text-center text-xs text-white/50">{DISCLAIMER}</div>
    </div>
  )
}
