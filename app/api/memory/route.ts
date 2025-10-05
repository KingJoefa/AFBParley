import { NextRequest } from 'next/server'
import { getMemory, setMemory } from '@/packages/sdk/memory'
import { MemorySchema } from '@/types/afb'

function rid() {
  return Math.random().toString(36).slice(2, 10)
}

export async function GET(req: NextRequest) {
  const id = rid()
  try {
    const { searchParams } = new URL(req.url)
    const profile = searchParams.get('profile') || 'default'
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
    const body = await req.json().catch(() => null)
    const parsed = MemorySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ code: 'BAD_REQUEST', message: 'Invalid memory body', details: parsed.error.flatten() }, { status: 400 })
    }
    const { profile, memory } = parsed.data
    const saved = await setMemory(profile, memory)
    return Response.json({ profile, memory: saved })
  } catch (e: any) {
    console.error('[memory][POST]', id, e?.message)
    return Response.json({ code: 'MEMORY_ERROR', message: 'Failed to write memory' }, { status: 500 })
  }
}


