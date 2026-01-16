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

// Transform wrapper response format to match SwantailResponseSchema
function transformWrapperResponse(raw: any): any {
  const assumptions = raw.assumptions || raw.Assumptions
  const scripts = raw.scripts || raw.Scripts

  // Parse American odds string to number (e.g., "-110" -> -110, "+120" -> 120, "illustrative -110" -> -110)
  function parseOdds(oddsStr: string | number): number {
    if (typeof oddsStr === 'number') return oddsStr
    if (!oddsStr) return -110 // default
    // Extract number from strings like "illustrative -110" or "-110" or "+120"
    const match = String(oddsStr).match(/([+-]?\d+)/)
    return match ? parseInt(match[1], 10) : -110
  }

  // Parse currency string to number (e.g., "$7.26" -> 7.26)
  function parseCurrency(val: string | number): number {
    if (typeof val === 'number') return val
    if (!val) return 0
    return parseFloat(String(val).replace(/[$,]/g, '')) || 0
  }

  // Transform assumptions
  const rawAngles = assumptions?.angles || assumptions?.Angles || []
  const transformedAssumptions = {
    matchup: assumptions?.matchup || assumptions?.Matchup || '',
    line_focus: assumptions?.line_focus || assumptions?.['line focus'] || assumptions?.lineFocus || '',
    // Handle angles as string or array
    angles: Array.isArray(rawAngles) ? rawAngles : (rawAngles ? [rawAngles] : []),
    voice: (assumptions?.voice || assumptions?.Voice || 'analyst').toLowerCase() as 'analyst' | 'hype' | 'coach',
  }

  // Transform scripts
  const transformedScripts = (scripts || []).map((script: any) => {
    const legs = (script.legs || script.Legs || []).map((leg: any) => {
      const oddsRaw = leg.american_odds || leg.odds || leg.Odds || '-110'
      const oddsStr = String(oddsRaw).toLowerCase()
      return {
        market: leg.market || leg.Market || '',
        selection: leg.selection || leg.Selection || '',
        american_odds: parseOdds(oddsRaw),
        // Check if "user" appears in odds string or type field
        odds_source: (oddsStr.includes('user') || (leg.odds_source || leg.type || leg.Type || '').toLowerCase().includes('user'))
          ? 'user_supplied' as const
          : 'illustrative' as const,
      }
    })

    const mathRaw = script.parlay_math || script['$1 Parlay Math'] || script.parlayMath || {}
    const stepsStr = mathRaw.steps || mathRaw.Steps || ''
    // Extract decimals from steps string like "1.91 × 1.95 × 1.95 = 7.26"
    const decimalMatches = stepsStr.match(/[\d.]+(?=\s*[×x])/g) || []
    const legDecimals = decimalMatches.map((d: string) => parseFloat(d))

    const parlay_math = {
      stake: 1,
      leg_decimals: legDecimals.length > 0 ? legDecimals : [1.91, 1.91, 1.91],
      product_decimal: parseCurrency(mathRaw.product || mathRaw.Product) || legDecimals.reduce((a: number, b: number) => a * b, 1) || 1,
      payout: parseCurrency(mathRaw.payout || mathRaw.Payout),
      profit: parseCurrency(mathRaw.profit || mathRaw.Profit),
      steps: stepsStr,
    }

    // Transform notes - can be array of strings or array of {text: string}
    const notesRaw = script.notes || script.Notes || []
    const notes = notesRaw.map((n: any) => typeof n === 'string' ? n : n?.text || '')

    return {
      title: script.title || script.Title || '',
      narrative: script.narrative || script.Narrative || '',
      legs,
      parlay_math,
      notes: notes.length >= 2 ? notes : ['No guarantees; high variance by design.', 'Odds are illustrative.'],
      offer_opposite: 'Want the other side of this story?' as const,
    }
  })

  return {
    assumptions: transformedAssumptions,
    scripts: transformedScripts,
  }
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

      // Check if wrapper returned an error (not a success response)
      if (wrapperPayload?.error || wrapperPayload?.message?.includes('error') || wrapperPayload?.message?.includes('aborted')) {
        console.error('[AFB] Wrapper returned error:', JSON.stringify(wrapperPayload))
        return new Response(
          JSON.stringify({
            code: 'WRAPPER_ERROR',
            message: wrapperPayload.message || wrapperPayload.error || 'Wrapper returned an error',
            details: wrapperPayload
          }),
          { status: 502, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // If wrapper already returns structured Swantail JSON, transform and pass it through.
      // Handle both lowercase (assumptions/scripts) and capitalized (Assumptions/Scripts) keys
      const hasAssumptions = wrapperPayload?.assumptions || wrapperPayload?.Assumptions
      const hasScripts = wrapperPayload?.scripts || wrapperPayload?.Scripts

      if (hasAssumptions && hasScripts) {
        // Transform wrapper response to match schema format
        const transformedPayload = transformWrapperResponse(wrapperPayload)
        const check = SwantailResponseSchema.safeParse(transformedPayload)
        if (!check.success) {
          console.error('[AFB] Schema validation failed:', JSON.stringify(check.error.flatten()))
          console.error('[AFB] Transformed payload:', JSON.stringify(transformedPayload).slice(0, 1000))
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
        // Log the actual response for debugging
        console.error('[AFB] Unexpected wrapper response format:', JSON.stringify(wrapperPayload).slice(0, 500))
        return new Response(
          JSON.stringify({ code: 'BAD_WRAPPER_RESPONSE', message: 'Missing outputText in wrapper response', keys: Object.keys(wrapperPayload) }),
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
