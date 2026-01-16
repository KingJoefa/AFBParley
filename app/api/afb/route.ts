import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { AfbRequestSchema } from '@/types/afb'
import { getMemory, sanitizeMemoryForPrompt } from '@/packages/sdk/memory'
import { SwantailResponseSchema } from '@/lib/swantail/schema'
import { parseSwantailOutputText } from '@/lib/swantail/parse'
import { buildGameContext, getContextSummary } from '@/lib/context'
import { CONTEXT_VERSION, hashContextPayload } from '@/lib/context/hash'

export const runtime = 'nodejs'

// Current season/week - updated manually or via API
const CURRENT_SEASON = 2025
const CURRENT_WEEK = 20 // Divisional Round

type WrapperResponse = {
  outputText?: string
  [key: string]: any
}

function requiredEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

function getWrapperConfig() {
  const baseUrl = requiredEnv('WRAPPER_BASE_URL').replace(/\/+$/, '')
  const path = requiredEnv('WRAPPER_ENDPOINT_PATH')
  const authHeader = requiredEnv('WRAPPER_AUTH_HEADER')
  const authToken = requiredEnv('WRAPPER_AUTH_TOKEN')
  const timeoutMs = Number(process.env.WRAPPER_TIMEOUT_MS ?? '20000')
  const url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`
  return { url, authHeader, authToken, timeoutMs }
}

function buildWrapperPayload(input: {
  matchup: string
  line_focus?: string
  angles?: string[]
  voice?: 'analyst' | 'hype' | 'coach'
  memory?: Record<string, any>
  gameContext?: { instruction: string; context: string; tokenCount: number }
}) {
  const { matchup, line_focus, angles, voice, memory, gameContext } = input

  // Build BYOA context from game context and memory
  const byoaParts: string[] = []
  if (gameContext?.context) {
    byoaParts.push(gameContext.instruction)
    byoaParts.push(gameContext.context)
  }
  if (memory && Object.keys(memory).length) {
    byoaParts.push(`User memory: ${JSON.stringify(memory).slice(0, 800)}`)
  }

  // Return flat structure matching wrapper's expected format
  return {
    matchup,
    lineFocus: line_focus,
    angles: angles ?? [],
    voice: voice ?? 'analyst',
    wantJson: true,
    byoa: byoaParts.length > 0 ? byoaParts.join('\n\n') : undefined,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = AfbRequestSchema.safeParse(body)
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ code: 'BAD_REQUEST', message: 'Invalid AFB request', details: parsed.error.flatten() }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { matchup, line_focus, angles, voice, profile, byoa_data } = parsed.data
    const requestId = randomUUID()
    const rawMemory = await getMemory(profile || 'default')
    const memory = sanitizeMemoryForPrompt(rawMemory)

    // Build game context with lines, injuries, weather, stats, and BYOA
    const gameContext = await buildGameContext({
      year: CURRENT_SEASON,
      week: CURRENT_WEEK,
      matchup,
      byoaData: byoa_data,
    })

    // Log context summary for debugging
    const contextSummary = getContextSummary(gameContext)
    const contextPayload = {
      context_version: CONTEXT_VERSION,
      instruction: gameContext.instruction,
      context: gameContext.context,
    }
    const contextHash = hashContextPayload(contextPayload)
    console.log('[AFB] request_id:', requestId, 'Context summary:', JSON.stringify(contextSummary))

    const config = getWrapperConfig()
    const payload = buildWrapperPayload({ matchup, line_focus, angles, voice, memory, gameContext })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs)

    try {
      const resp = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [config.authHeader]: config.authToken,
          'x-request-id': requestId,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      const contentType = resp.headers.get('content-type') ?? ''
      const isJson = contentType.includes('application/json')
      const wrapperPayload: WrapperResponse = isJson ? await resp.json() : { outputText: await resp.text() }

      if (!resp.ok) {
        return new Response(
          JSON.stringify({ code: 'WRAPPER_ERROR', status: resp.status, details: wrapperPayload }),
          { status: resp.status, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // If wrapper already returns structured Swantail JSON, pass it through.
      if (wrapperPayload?.assumptions && wrapperPayload?.scripts) {
        const check = SwantailResponseSchema.safeParse(wrapperPayload)
        if (!check.success) {
          return new Response(
            JSON.stringify({ code: 'BAD_WRAPPER_SCHEMA', details: check.error.flatten() }),
            { status: 502, headers: { 'Content-Type': 'application/json' } }
          )
        }
        return Response.json({
          ...check.data,
          request_id: requestId,
          context_version: CONTEXT_VERSION,
          context_hash: contextHash,
          data_provenance: contextSummary,
        })
      }

      const outputText = wrapperPayload.outputText
      if (!outputText) {
        return new Response(
          JSON.stringify({ code: 'BAD_WRAPPER_RESPONSE', message: 'Missing outputText in wrapper response' }),
          { status: 502, headers: { 'Content-Type': 'application/json' } }
        )
      }

      const parsedOutput = parseSwantailOutputText(outputText, {
        matchup,
        line_focus: line_focus || '',
        angles: angles || [],
        voice: voice || 'analyst',
      })

      const validated = SwantailResponseSchema.safeParse(parsedOutput)
      if (!validated.success) {
        return new Response(
          JSON.stringify({ code: 'BAD_PARSED_SCHEMA', details: validated.error.flatten() }),
          { status: 502, headers: { 'Content-Type': 'application/json' } }
        )
      }

      return Response.json({
        ...validated.data,
        request_id: requestId,
        context_version: CONTEXT_VERSION,
        context_hash: contextHash,
        data_provenance: contextSummary,
      })
    } finally {
      clearTimeout(timeout)
    }
  } catch (e: any) {
    const isAbort = e?.name === 'AbortError'
    return new Response(
      JSON.stringify({ code: isAbort ? 'WRAPPER_TIMEOUT' : 'MODEL_ERROR', message: e?.message || 'Failed to generate scripts' }),
      { status: isAbort ? 504 : 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
