export type AfbErrorCode =
  | 'BAD_REQUEST'
  | 'WRAPPER_ERROR'
  | 'BAD_WRAPPER_SCHEMA'
  | 'BAD_WRAPPER_RESPONSE'
  | 'BAD_PARSED_SCHEMA'
  | 'WRAPPER_TIMEOUT'
  | 'MODEL_ERROR'
  | 'NETWORK_ERROR'
  | 'CLIENT_ABORT'
  | 'UNKNOWN_ERROR'

export type AfbError = {
  code: AfbErrorCode | string
  status: number | null
  message: string
  details?: unknown
  raw?: string
}

export function isSwantailSuccessPayload(json: any): boolean {
  return Boolean(json && typeof json === 'object' && json.assumptions && Array.isArray(json.scripts))
}

export function decodeAfbErrorPayload(params: {
  status: number | null
  ok: boolean
  contentType?: string
  json?: any
  text?: string
}): AfbError {
  const { status, ok, contentType, json, text } = params

  // Handle "200 OK but error-shaped payload"
  if (ok && json && typeof json === 'object' && (json.code || json.error || json.message) && !isSwantailSuccessPayload(json)) {
    return {
      code: String(json.code || 'MODEL_ERROR'),
      status,
      message: String(json.message || json.error || 'AFB returned an error payload'),
      details: json.details ?? json,
    }
  }

  if (json && typeof json === 'object') {
    const code = String(json.code || (status === 400 ? 'BAD_REQUEST' : 'MODEL_ERROR'))
    const message =
      (typeof json.message === 'string' && json.message) ||
      (typeof json.error === 'string' && json.error) ||
      (status ? `AFB error ${status}` : 'AFB error')
    return {
      code,
      status,
      message,
      details: json.details ?? json,
    }
  }

  const raw = typeof text === 'string' ? text.trim() : ''
  const msg = raw ? raw.slice(0, 300) : (status ? `AFB error ${status}` : 'AFB error')
  return {
    code: status === 504 ? 'WRAPPER_TIMEOUT' : (status ? 'MODEL_ERROR' : 'UNKNOWN_ERROR'),
    status,
    message: msg,
    raw: raw || undefined,
    details: contentType ? { contentType } : undefined,
  }
}

export async function decodeAfbErrorFromResponse(res: Response): Promise<AfbError> {
  const status = typeof res.status === 'number' ? res.status : null
  const ok = Boolean(res.ok)
  const contentType = res.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')

  if (isJson) {
    const json = await res.json().catch(() => null)
    return decodeAfbErrorPayload({ status, ok, contentType, json })
  }

  const text = await res.text().catch(() => '')
  return decodeAfbErrorPayload({ status, ok, contentType, text })
}

