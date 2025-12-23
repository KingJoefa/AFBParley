import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { AfbRequestSchema } from '@/types/afb'
import { getMemory, sanitizeMemoryForPrompt } from '@/packages/sdk/memory'
import { buildSwantailPrompt } from '@/lib/swantail/prompt'
import { findCombosForMatchup, fetchSelectionCombos } from '@/lib/xo/client'
import { extractTeamCodesFromMatchup } from '@/lib/nfl/teams'
import { SwantailResponseSchema } from '@/lib/swantail/schema'
import { computeParlayMath } from '@/lib/swantail/math'

function rid() {
  return Math.random().toString(36).slice(2, 10)
}

function sampleResponse(input: { matchup: string; line_focus?: string; angles?: string[]; voice?: 'analyst' | 'hype' | 'coach' }) {
  const odds = [-110, -105, 150]
  const math = computeParlayMath(odds)
  return {
    assumptions: {
      matchup: input.matchup,
      line_focus: input.line_focus || '',
      angles: input.angles || [],
      voice: input.voice || 'analyst',
    },
    scripts: [
      {
        title: 'Balanced Tail Lift',
        narrative: 'A measured tempo keeps the game compact early, then a late surge pushes scoring into a narrow but correlated over band.',
        legs: [
          { market: 'Alt Total', selection: 'Over 41.5', american_odds: odds[0], odds_source: 'illustrative' },
          { market: 'Team Total (Home)', selection: 'Over 20.5', american_odds: odds[1], odds_source: 'illustrative' },
          { market: 'QB Passing TDs', selection: 'Over 1.5', american_odds: odds[2], odds_source: 'illustrative' },
        ],
        parlay_math: math,
        notes: [
          'No guarantees; high variance by design; bet what you can afford.',
          'If odds not supplied, american_odds are illustrative — paste your book’s prices to re-price.',
        ],
        offer_opposite: 'Want the other side of this story?'
      }
    ]
  }
}

export async function POST(req: NextRequest) {
  const id = rid()
  try {
    const body = await req.json().catch(() => null)
    const parsed = AfbRequestSchema.safeParse(body)
    if (!parsed.success) {
      return new Response(JSON.stringify({ code: 'BAD_REQUEST', message: 'Invalid AFB request', details: parsed.error.flatten() }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    const { matchup, line_focus, angles, voice, profile, user_supplied_odds } = parsed.data
    const rawMemory = await getMemory(profile || 'default')
    const memory = sanitizeMemoryForPrompt(rawMemory)

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      const sample = sampleResponse({ matchup, line_focus, angles, voice })
      return Response.json(sample)
    }

    const client = new OpenAI({ apiKey })

    // Resolve current season/week from our own schedule endpoint so XO matches schedule of the week
    let resolvedYear = Number(process.env.NFL_YEAR || new Date().getFullYear())
    let resolvedWeek = Number(process.env.NFL_WEEK || 17)
    try {
      const origin = new URL(req.url).origin
      const sres = await fetch(`${origin}/api/nfl/schedule`, { cache: 'no-store' })
      if (sres.ok) {
        const sched = await sres.json().catch(() => null)
        if (sched?.season && typeof sched.season === 'number') resolvedYear = sched.season
        if (sched?.week && typeof sched.week === 'number') resolvedWeek = sched.week
      }
    } catch {}

    // Optional XO combos context (server-side only)
    let xoBlock = ''
    let availabilityBlock = ''
    let allowedMarkets: Set<string> | null = null
    let allowedPlayers: Set<string> | null = null
    try {
      const sourceId = process.env.XO_SOURCE_ID || 'FANDUEL'
      const combos = await findCombosForMatchup({ year: resolvedYear, week: resolvedWeek, matchup, sourceId })
      if (combos.length) {
        const top = combos
          .sort((a, b) => Math.abs(b.americanOdds) - Math.abs(a.americanOdds))
          .slice(0, 10)
        const lines = top.map(c => {
          const legs = c.legs.map(l => {
            const who = l.player?.first ? `${l.player.first} ${l.player?.last ?? ''} ${l.player?.team ? `(${l.player.team})` : ''}`.trim() : (l.player?.team ?? '')
            const line = l.line != null ? ` ${l.line}` : ''
            const pick = l.selectionType ? ` ${l.selectionType}` : ''
            return `${l.marketType}:${line}${pick}${who ? ` — ${who}` : ''}`.trim()
          }).join(' | ')
          return `${c.sourceId} ${c.combinationName} @ ${c.americanOdds}: ${legs}`
        })
        xoBlock = `\n\nBook combos (XO, server-side context for Week ${resolvedWeek} ${resolvedYear}):\n${lines.join('\n')}`

        // Build strict availability constraints from XO feed
        allowedMarkets = new Set<string>()
        allowedPlayers = new Set<string>()
        for (const c of combos) {
          for (const l of c.legs) {
            if (l.marketType) allowedMarkets.add(l.marketType)
            const first = l.player?.first?.trim()
            const last = l.player?.last?.trim()
            if (first || last) {
              allowedPlayers.add([first, last].filter(Boolean).join(' ').trim())
            }
          }
        }
        const marketsList = Array.from(allowedMarkets).slice(0, 20).join(', ')
        const playersList = Array.from(allowedPlayers).slice(0, 40).join('; ')
        if (allowedMarkets.size > 0) {
          availabilityBlock += `\n\nAvailability constraints (MUST OBEY):\n- Use ONLY these markets observed in current book combos: ${marketsList}.\n`
        }
        if (allowedPlayers.size > 0) {
          availabilityBlock += `- Player legs MUST reference ONLY these players (exact match by name). If a player is not listed, DO NOT include a player prop: ${playersList}.\n`
        } else {
          availabilityBlock += `- No player props are available for this game in the current feed; DO NOT include any player props. Use team/total/spread/period markets only.\n`
        }
      }
      // Fallback broadening: if no allowed players were found for this matchup,
      // scan all week combos and allow players that belong to the two teams.
      if (!allowedPlayers || allowedPlayers.size === 0) {
        try {
          const allWeek = await fetchSelectionCombos({ year: resolvedYear, week: resolvedWeek, sourceId })
          const teamCodes = extractTeamCodesFromMatchup(matchup)
          const broadenPlayers = new Set<string>()
          const markets = allowedMarkets ?? new Set<string>()
          for (const c of allWeek) {
            for (const l of c.legs) {
              if (l.marketType) markets.add(l.marketType)
              const code = (l.player?.team || '').toUpperCase()
              if (code && teamCodes.has(code)) {
                const first = l.player?.first?.trim()
                const last = l.player?.last?.trim()
                if (first || last) {
                  broadenPlayers.add([first, last].filter(Boolean).join(' ').trim())
                }
              }
            }
          }
          if (broadenPlayers.size > 0) {
            allowedPlayers = broadenPlayers
            allowedMarkets = markets
            const playersList = Array.from(broadenPlayers).slice(0, 60).join('; ')
            availabilityBlock += `\n- Player availability broadened by team for this week; allowed players: ${playersList}\n`
          }
        } catch {}
      }
    } catch {}

    const prompt = buildSwantailPrompt({ matchup, line_focus, angles, voice, user_supplied_odds }) + xoBlock + availabilityBlock
    const memoryLine = memory ? `\nMemory Context: ${JSON.stringify(memory).slice(0, 2000)}` : ''
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a strict JSON generator. Return ONLY valid JSON.' },
        { role: 'user', content: `${prompt}${memoryLine}` }
      ],
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 1500
    })

    const text = completion.choices?.[0]?.message?.content?.toString() || ''
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch (err) {
      return new Response(JSON.stringify({ code: 'BAD_MODEL_JSON', message: 'Model did not return valid JSON' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
    }

    const validated = SwantailResponseSchema.safeParse(data)
    if (!validated.success) {
      return new Response(JSON.stringify({ code: 'BAD_MODEL_SCHEMA', message: 'Model JSON failed schema validation', details: validated.error.flatten() }), { status: 502, headers: { 'Content-Type': 'application/json' } })
    }

    // Post-response sanitization against availability constraints
    const out = structuredClone(validated.data)
    try {
      const isNameLike = (text: string) => {
        // crude: two words with letters (e.g., "Saquon Barkley")
        return /\b[A-Za-z][A-Za-z'\-]+\s+[A-Za-z][A-Za-z'\-]+\b/.test(text)
      }
      const allowedPlayerLC = allowedPlayers ? new Set(Array.from(allowedPlayers).map(p => p.toLowerCase())) : null
      const allowedMarketLC = allowedMarkets ? new Set(Array.from(allowedMarkets).map(m => m.toLowerCase())) : null
      for (const script of out.scripts) {
        const kept = []
        for (const leg of script.legs) {
          const marketOk = !allowedMarketLC || allowedMarketLC.has((leg.market || '').toLowerCase())
          let playerOk = true
          if (allowedPlayerLC) {
            // if selection mentions a name-like phrase, ensure it is in the allowed list
            const sel = (leg.selection || '').toLowerCase()
            if (isNameLike(leg.selection || '')) {
              playerOk = Array.from(allowedPlayerLC).some(name => sel.includes(name))
            }
          } else {
            // no player props available -> reject if selection looks like a player name
            if (isNameLike(leg.selection || '')) playerOk = false
          }
          if (marketOk && playerOk) kept.push(leg)
        }
        if (kept.length !== script.legs.length) {
          script.legs = kept
          // recompute math
          script.parlay_math = computeParlayMath(kept.map(l => l.american_odds))
          script.notes = (script.notes || []).concat([
            'Some player/market legs were removed due to availability constraints.'
          ])
        }
      }
    } catch {}

    return Response.json(out)
  } catch (e: any) {
    console.error('[afb][POST]', id, e?.message)
    return new Response(JSON.stringify({ code: 'MODEL_ERROR', message: e?.message || 'Failed to generate scripts' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
