'use client'

import type { TerminalResponse, Alert } from '@/lib/terminal/schemas'

function badgeColor(severity: Alert['severity']) {
  return severity === 'high'
    ? 'bg-red-500/15 text-red-200 border-red-400/20'
    : 'bg-amber-500/15 text-amber-200 border-amber-400/20'
}

export default function TerminalAlertsView({ data }: { data: TerminalResponse }) {
  if (!data.alerts.length) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-white/70">
        <div className="text-base">No alerts surfaced for this run.</div>
        <div className="mt-2 text-sm text-white/50">Try a different matchup or adjust signals.</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {data.alerts.map((alert) => (
        <div key={alert.id} className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-6 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">{alert.agent.toUpperCase()}</div>
              <div className="mt-1 text-lg font-semibold text-white">{alert.claim}</div>
              <div className="mt-2 text-xs text-white/60">
                Confidence: {(alert.confidence * 100).toFixed(0)}% • Freshness: {alert.freshness}
              </div>
            </div>
            <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${badgeColor(alert.severity)}`}>
              {alert.severity.toUpperCase()}
            </span>
          </div>

          <div className="mt-4 text-xs text-white/70">
            <div className="text-[11px] uppercase tracking-wide text-white/50">Implications</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {alert.implications.map((imp, idx) => (
                <span key={`${alert.id}-imp-${idx}`} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70">
                  {imp}
                </span>
              ))}
            </div>
          </div>

          {alert.evidence?.length > 0 && (
            <div className="mt-4 text-xs text-white/60">
              <div className="text-[11px] uppercase tracking-wide text-white/50">Evidence</div>
              <div className="mt-2 space-y-1">
                {alert.evidence.map((ev, idx) => (
                  <div key={`${alert.id}-ev-${idx}`}>
                    {ev.stat}: {ev.value_str ?? ev.value_num} • {ev.comparison}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

