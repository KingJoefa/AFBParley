import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

function envOk(name: string) {
  const v = process.env[name]
  return typeof v === 'string' && v.trim().length > 0
}

async function ping(url: string, timeoutMs: number): Promise<{ ok: boolean; status?: number; ms?: number; error?: string }> {
  const started = Date.now()
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal })
    return { ok: res.ok, status: res.status, ms: Date.now() - started }
  } catch (e: any) {
    return { ok: false, error: e?.name === 'AbortError' ? 'timeout' : (e?.message || 'fetch_failed') }
  } finally {
    clearTimeout(t)
  }
}

export async function GET() {
  const base = (process.env.WRAPPER_BASE_URL || '').replace(/\/+$/, '')
  const wrapperConfigured = envOk('WRAPPER_BASE_URL') && envOk('WRAPPER_ENDPOINT_PATH') && envOk('WRAPPER_AUTH_HEADER') && envOk('WRAPPER_AUTH_TOKEN')

  // Cheap, no-auth health probe if wrapper exposes it (Render/Express does).
  const healthUrl = base ? `${base}/api/health` : ''
  const probe = healthUrl ? await ping(healthUrl, 1500) : { ok: false, error: 'no_base_url' }

  return NextResponse.json({
    wrapper: {
      configured: wrapperConfigured,
      baseUrlSet: envOk('WRAPPER_BASE_URL'),
      endpointPathSet: envOk('WRAPPER_ENDPOINT_PATH'),
      authHeaderSet: envOk('WRAPPER_AUTH_HEADER'),
      authTokenSet: envOk('WRAPPER_AUTH_TOKEN'),
      healthUrl: healthUrl || null,
      probe,
    },
    lastChecked: new Date().toISOString(),
  })
}

