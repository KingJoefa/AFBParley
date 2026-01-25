export type TelemetryEvent =
  | 'ui_view_loaded'
  | 'ui_build_clicked'
  | 'ui_build_success'
  | 'ui_build_error'
  | 'ui_action_clicked'
  | 'ui_action_success'
  | 'ui_action_error'
  | 'ui_scan_clicked'
  | 'ui_scan_success'
  | 'ui_scan_error'
  | 'ui_image_generation_started'
  | 'ui_image_generation_error'
  | 'ui_image_downloaded'
  | 'ui_image_shared'

const IS_DEV = process.env.NODE_ENV !== 'production'

export function track(event: TelemetryEvent, payload?: Record<string, unknown>) {
  // Only log telemetry events in development
  // In production, this would send to an analytics service instead
  if (!IS_DEV) return

  try {
    const ts = new Date().toISOString()
    // Sanitize payload - never log user content or error details
    const safePayload = payload ? sanitizePayload(payload) : {}
    // eslint-disable-next-line no-console
    console.log(`[telemetry] ${ts} ${event}`, safePayload)
  } catch {
    // no-op
  }
}

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    // Only keep safe aggregate keys, not content
    if (['count', 'alertCount', 'anglesCount', 'outputType', 'action'].includes(key)) {
      safe[key] = value
    } else if (key === 'agentIds' && Array.isArray(value)) {
      safe[key] = value.length // Just count, not the IDs
    } else if (key === 'message' && typeof value === 'string') {
      // Truncate and sanitize error messages
      safe[key] = value.slice(0, 50).replace(/[^\w\s-]/g, '')
    }
  }
  return safe
}

