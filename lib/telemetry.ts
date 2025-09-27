export type TelemetryEvent =
  | 'ui_view_loaded'
  | 'ui_build_clicked'
  | 'ui_build_success'
  | 'ui_build_error'

export function track(event: TelemetryEvent, payload?: any) {
  try {
    // Minimal stub: console log with timestamp
    const ts = new Date().toISOString()
    // eslint-disable-next-line no-console
    console.log(`[telemetry] ${ts} ${event}`, payload ?? {})
  } catch {
    // no-op
  }
}

