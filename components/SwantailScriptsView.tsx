'use client'

import { FileText, LoaderCircle } from 'lucide-react'
import SwantailScriptCard from '@/components/SwantailScriptCard'
import type {
  GameScript,
  ScenarioAnchorId,
  ScenarioResolution,
} from '@/lib/terminal/contracts'

type Props = {
  script: GameScript | null
  scenario: ScenarioResolution | null
  selectedAnchorIds: ScenarioAnchorId[]
  isLoading: boolean
}
export default function SwantailScriptsView({ script, scenario, selectedAnchorIds, isLoading }: Props) {
  return (
    <section className="swantail-output-panel min-h-[560px] rounded-md border p-4 sm:p-6 lg:min-h-[660px]" aria-label="Game Script">
      <div className="mb-5 flex items-center justify-between border-b border-[#15191a]/10 pb-4">
        <div>
          <div className="swantail-label font-mono text-[11px] uppercase">Output</div>
          <h2 className="mt-1 text-base font-semibold text-[#15191a]">Game Script</h2>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[#0f766e]/15 bg-[#0f766e]/10 text-[#0f766e]">
          <FileText className="h-5 w-5" aria-hidden />
        </div>
      </div>

      {isLoading && (
        <div className="swantail-soft-card flex min-h-[360px] items-center justify-center rounded-md border text-sm text-[#6d6860] sm:min-h-[420px]">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin text-[#0f766e]" aria-hidden />
          Assembling causal chain
        </div>
      )}

      {!isLoading && script && scenario && (
        <SwantailScriptCard
          script={script}
          scenario={scenario}
          selectedAnchorIds={selectedAnchorIds}
        />
      )}

      {!isLoading && !script && (
        <div className="swantail-empty-state flex min-h-[360px] items-center justify-center rounded-md border border-[#15191a]/10 p-6 text-center sm:min-h-[420px]">
          <div className="w-full max-w-sm">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md border border-[#15191a]/10 bg-[#fffaf0] text-[#0f766e] shadow-sm">
              <FileText className="h-5 w-5" aria-hidden />
            </div>
            <p className="mt-4 text-sm font-semibold text-[#15191a]">{scenario ? 'Scenario ready' : 'No active scenario'}</p>
            <p className="mt-1 font-mono text-[11px] uppercase text-[#6d6860]/70">
              {scenario ? `${selectedAnchorIds.length} anchors selected` : 'Awaiting Game Agents'}
            </p>
            <div className="mx-auto mt-7 space-y-3 rounded-md border border-[#15191a]/10 bg-[#fffaf0]/70 p-4 text-left shadow-sm">
              <div className="swantail-ghost-line w-7/12" />
              <div className="swantail-ghost-line w-full opacity-70" />
              <div className="swantail-ghost-line w-10/12 opacity-60" />
              <div className="grid grid-cols-3 gap-2 pt-2">
                <span className="h-12 rounded border border-[#15191a]/10 bg-[#0f766e]/10" />
                <span className="h-12 rounded border border-[#15191a]/10 bg-[#bf7f2c]/10" />
                <span className="h-12 rounded border border-[#15191a]/10 bg-[#15191a]/5" />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
