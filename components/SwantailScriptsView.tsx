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
    <section className="swantail-panel min-h-[620px] rounded-md border p-4 sm:p-6 lg:min-h-[720px] lg:rounded-l-none lg:p-7" aria-label="Game Script">
      <div className="mb-5 flex items-center justify-between border-b border-[#4a3c2e]/15 pb-4">
        <div>
          <div className="swantail-label font-mono text-[11px] uppercase">Output</div>
          <h2 className="mt-1 text-base font-semibold text-[#1b1714]">Game Script</h2>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#16716c]/10 text-[#16716c]">
          <FileText className="h-5 w-5" aria-hidden />
        </div>
      </div>

      {isLoading && (
        <div className="swantail-soft-card flex min-h-[420px] items-center justify-center rounded-md border text-sm text-[#756b61] sm:min-h-[480px]">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin text-[#16716c]" aria-hidden />
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
        <div className="flex min-h-[420px] items-center justify-center rounded-md border border-dashed border-[#4a3c2e]/20 bg-[#fffaf1]/60 p-8 text-center sm:min-h-[480px]">
          <div>
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border border-[#4a3c2e]/15 bg-white text-[#756b61]">
              <FileText className="h-5 w-5" aria-hidden />
            </div>
            <p className="mt-4 text-sm text-[#756b61]">{scenario ? 'Scenario ready' : 'No active scenario'}</p>
            <p className="mt-1 font-mono text-[11px] uppercase text-[#756b61]/55">
              {scenario ? `${selectedAnchorIds.length} anchors selected` : 'Awaiting Game Agents'}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
