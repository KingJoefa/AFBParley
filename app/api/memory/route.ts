import { NextRequest } from 'next/server'
import { getMemory, setMemory } from '@/packages/sdk/memory'
import { MemorySchema } from '@/types/afb'

function rid() {
  return Math.random().toString(36).slice(2, 10)
}

function isProfileAllowed(profile: string) {
  const idOk = /^[a-zA-Z0-9_-]{1,32}$/.test(profile)
  if (!idOk) return false
  const env = process.env.ALLOWED_PROFILES
  if (!env) return true
  const allowed = env.split(',').map(s => s.trim()).filter(Boolean)
  return allowed.includes(profile)
}

function requireApiKey(req: NextRequest) {
  const expected = process.env.MEMORY_API_KEY
  if (!expected) return true
  const got = req.headers.get('x-api-key') || ''
  return got === expected
}

export async function GET(req: NextRequest) {
  const id = rid()
  try {
    const { searchParams } = new URL(req.url)
    const profile = searchParams.get('profile') || 'default'
    if (!isProfileAllowed(profile)) {
      return Response.json({ code: 'BAD_PROFILE', message: 'Invalid or disallowed profile' }, { status: 400 })
    }
    if (!requireApiKey(req)) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Missing or invalid API key' }, { status: 401 })
    }
    const data = await getMemory(profile)
    return Response.json({ profile, memory: data })
  } catch (e: any) {
    console.error('[memory][GET]', id, e?.message)
    return Response.json({ code: 'MEMORY_ERROR', message: 'Failed to read memory' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const id = rid()
  try {
    if (!requireApiKey(req)) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Missing or invalid API key' }, { status: 401 })
    }
    // Enforce payload size cap (100KB)
    const raw = await req.text()
    const MAX = 100 * 1024
    if (raw.length > MAX) {
      return Response.json({ code: 'PAYLOAD_TOO_LARGE', message: `Body exceeds ${MAX} bytes` }, { status: 413 })
    }
    let body: any
    try {
      body = JSON.parse(raw)
    } catch {
      return Response.json({ code: 'BAD_JSON', message: 'Malformed JSON body' }, { status: 400 })
    }
    const parsed = MemorySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ code: 'BAD_REQUEST', message: 'Invalid memory body', details: parsed.error.flatten() }, { status: 400 })
    }
    const { profile, memory } = parsed.data
    if (!isProfileAllowed(profile)) {
      return Response.json({ code: 'BAD_PROFILE', message: 'Invalid or disallowed profile' }, { status: 400 })
    }
    const memJson = JSON.stringify(memory ?? {})
    const memSize = memJson.length
    const MEM_MAX = 80 * 1024
    if (memSize > MEM_MAX) {
      return Response.json({ code: 'PAYLOAD_TOO_LARGE', message: `memory JSON must be <= ${MEM_MAX} bytes` }, { status: 413 })
    }
    const saved = await setMemory(profile, memory)
    return Response.json({ profile, memory: saved })
  } catch (e: any) {
    console.error('[memory][POST]', id, e?.message)
    return Response.json({ code: 'MEMORY_ERROR', message: 'Failed to write memory' }, { status: 500 })
  }
}


