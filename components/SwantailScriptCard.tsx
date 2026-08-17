'use client'

import { ArrowRight, CheckCircle2, CircleX, LockKeyhole } from 'lucide-react'
import {
  GAME_AGENT_CATALOG,
  type GameScript,
  type ScenarioAnchorId,
  type ScenarioResolution,
} from '@/lib/terminal/contracts'

type Props = {
  script: GameScript
  scenario: ScenarioResolution
  selectedAnchorIds: ScenarioAnchorId[]
}

export default function SwantailScriptCard({ script, scenario, selectedAnchorIds }: Props) {
  const anchorLabels = selectedAnchorIds.map(anchorId => (
    scenario.anchors.find(anchor => anchor.id === anchorId)?.label ?? anchorId
  ))

  return (
    <article className="swantail-soft-card rounded-md border p-4 sm:p-5">
      <div className="flex flex-wrap gap-2">
        {anchorLabels.map(label => (
          <span key={label} className="rounded-md border border-[#16716c]/20 bg-[#16716c]/10 px-2 py-1 font-mono text-[10px] uppercase text-[#0d5753]">
            {label}
          </span>
        ))}
      </div>

      <h3 className="mt-5 text-2xl font-semibold leading-tight text-[#1b1714]">{script.title}</h3>
      <p className="mt-4 text-sm leading-7 text-[#756b61]">{script.summary}</p>

      <div className="mt-7 border-t border-[#4a3c2e]/15 pt-6">
        <h4 className="font-mono text-[11px] uppercase text-[#756b61]">Causal chain</h4>
        <ol className="mt-4 space-y-0">
          {script.causal_chain.map((step, index) => (
            <li key={`${step.order}-${step.statement}`} className="grid grid-cols-[32px_1fr] gap-3">
              <div className="flex flex-col items-center">
                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#16716c]/20 bg-[#16716c]/10 font-mono text-[11px] font-semibold text-[#0d5753]">
                  {step.order}
                </span>
                {index < script.causal_chain.length - 1 && <span className="min-h-8 w-px flex-1 bg-[#4a3c2e]/15" />}
              </div>
              <div className="pb-5">
                {step.agent_id && (
                  <div className="mb-1 font-mono text-[10px] uppercase text-[#16716c]">
                    {GAME_AGENT_CATALOG[step.agent_id].label}
                  </div>
                )}
                <p className="text-sm leading-6 text-[#3d352f]">{step.statement}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-2 grid gap-5 border-t border-[#4a3c2e]/15 pt-6 sm:grid-cols-2">
        <div>
          <h4 className="flex items-center gap-2 font-mono text-[11px] uppercase text-[#756b61]">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#16716c]" aria-hidden />
            Must remain true
          </h4>
          <ul className="mt-3 space-y-2">
            {script.key_conditions.map(condition => (
              <li key={condition} className="text-xs leading-5 text-[#756b61]">{condition}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="flex items-center gap-2 font-mono text-[11px] uppercase text-[#756b61]">
            <CircleX className="h-3.5 w-3.5 text-[#bf8430]" aria-hidden />
            Story breaks if
          </h4>
          <ul className="mt-3 space-y-2">
            {script.failure_conditions.map(condition => (
              <li key={condition} className="text-xs leading-5 text-[#756b61]">{condition}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-7 flex flex-col gap-3 border-t border-[#4a3c2e]/15 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <span className="font-mono text-[10px] uppercase text-[#756b61]/70">{scenario.evidence_state.replace(/_/g, ' ')} / {script.generation}</span>
        <button
          type="button"
          disabled
          title="Bet Station is the next product phase"
          className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-[#4a3c2e]/15 bg-[#1b1714]/5 px-3 text-xs text-[#756b61]/70"
        >
          <LockKeyhole className="h-3.5 w-3.5" aria-hidden />
          Bet Station
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </article>
  )
}
