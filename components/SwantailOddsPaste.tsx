'use client'
import { useMemo } from 'react'
import { parseOddsPaste } from '@/lib/swantail/odds'

export type OddsPasteValue = {
  text: string
}

type Props = {
  value: string
  onChange: (value: string) => void
}

export default function SwantailOddsPaste({ value, onChange }: Props) {
  const parsed = useMemo(() => parseOddsPaste(value), [value])

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-white">Re-price with your book (optional)</div>
        <div className="text-[11px] text-white/60">
          {parsed.length === 0 ? '0 prices detected' : `${parsed.length} prices detected`}
        </div>
      </div>
      <p className="mt-1 text-xs text-white/60">Paste book prices to override matching legs.</p>
      <div className="mt-2 text-[11px] text-white/50">
        Examples: RB1 Anytime TD +120 · Alt Total Over 44.5 -110
      </div>
      <textarea
        className="mt-3 h-28 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
        placeholder="RB1 Anytime TD +120\nAlt Total Over 44.5 -110"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
