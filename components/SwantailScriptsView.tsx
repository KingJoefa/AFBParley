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
    <section className="min-h-[720px] border-x border-b border-white/10 bg-[#0c0e0d] p-4 sm:p-6 lg:border-l-0 lg:border-t lg:p-7" aria-label="Game Script">
      <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <div className="font-mono text-[11px] uppercase text-white/40">Output</div>
          <h2 className="mt-1 text-base font-semibold text-white">Game Script</h2>
        </div>
        <FileText className="h-5 w-5 text-white/25" aria-hidden />
      </div>

      {isLoading && (
        <div className="flex min-h-[480px] items-center justify-center text-sm text-white/45">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin text-cyan-200" aria-hidden />
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
        <div className="flex min-h-[480px] items-center justify-center border border-dashed border-white/10 bg-black/10 p-8 text-center">
          <div>
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border border-white/10 text-white/25">
              <FileText className="h-5 w-5" aria-hidden />
            </div>
            <p className="mt-4 text-sm text-white/50">{scenario ? 'Scenario ready' : 'No active scenario'}</p>
            <p className="mt-1 font-mono text-[11px] uppercase text-white/25">
              {scenario ? `${selectedAnchorIds.length} anchors selected` : 'Awaiting Game Agents'}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
