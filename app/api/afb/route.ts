import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { AfbRequestSchema } from '@/types/afb'
import { getMemory, sanitizeMemoryForPrompt } from '@/packages/sdk/memory'
import { AFB_AGENT_INSTRUCTIONS, buildUserPrompt } from '@/lib/afbPrompt'

// Client will be created lazily inside the handler to avoid import-time env errors

function rid() { return Math.random().toString(36).slice(2, 10) }

export async function POST(req: NextRequest) {
  const id = rid()
  try {
    const body = await req.json().catch(() => null)
    const parsed = AfbRequestSchema.safeParse(body)
    if (!parsed.success) {
      return new Response(JSON.stringify({ code: 'BAD_REQUEST', message: 'Invalid AFB request', details: parsed.error.flatten() }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    const { matchup, line_focus, angles, voice, profile, retrieval_tags } = parsed.data
    const rawMemory = await getMemory(profile || 'default')
    const memory = sanitizeMemoryForPrompt(rawMemory)
    const userPrompt = buildUserPrompt({ matchup, line_focus, angles, voice, memory })

    // Call model; require server-side key
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      // Dev fallback: return deterministic plain-text output (no JSON) for local testing
      const assumptions = `Assumptions: matchup ${matchup}${line_focus ? `; line ${line_focus}` : ''}; angles ${angles?.join(', ') || 'none'}; voice ${voice || 'analyst'}.`
      const sample = [
        assumptions,
        'Script 1 (Balanced Pace Over)\n• Narrative: A steady tempo with efficient red-zone execution pushes scoring above market expectations without needing explosive plays.\n• Legs:\n• Alt Total: Over 41.5, odds -105, illustrative\n• Team Total (Home): Over 20.5, odds -110, illustrative\n• QB Passing TDs: Over 1.5, odds +150, illustrative\n• $1 Parlay Math: 1.95 × 1.91 × 2.50 = 9.30; payout $9.30; profit $8.30.\n• Notes:\n- No guarantees; high variance by design; bet what you can afford.\n- If odds not supplied, american odds are illustrative — paste your book\'s prices to re-price.',
        'Script 2 (Red-Zone Efficiency)\n• Narrative: Sustained drives plus strong red-zone TD% create correlated scoring outcomes, favoring TD props over yardage volatility.\n• Legs:\n• Anytime TD: Primary RB, odds +120, illustrative\n• Team Total (Away): Over 19.5, odds -110, illustrative\n• Alt Total: Over 40.5, odds -115, illustrative\n• $1 Parlay Math: 2.20 × 1.91 × 1.87 = 7.85; payout $7.85; profit $6.85.\n• Notes:\n- No guarantees; high variance by design; bet what you can afford.\n- If odds not supplied, american odds are illustrative — paste your book\'s prices to re-price.',
        'Script 3 — Super Long (Longshot)\n• Narrative: A faster first half with chunk gains leads to multi-TD upside and a stretched game total.\n• Legs:\n• Alt Total: Over 47.5, odds +160, illustrative\n• QB + WR Combo: 225+ pass yds & 60+ rec yds, odds +240, illustrative\n• Anytime TD: Secondary WR, odds +220, illustrative\n• $1 Parlay Math: 2.60 × 3.40 × 3.20 = 28.29; payout $28.29; profit $27.29.\n• Notes:\n- No guarantees; high variance by design; bet what you can afford.\n- If odds not supplied, american odds are illustrative — paste your book\'s prices to re-price.',
        'Want the other side of this story?'
      ].join('\n\n')
      return new Response(sample, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    }

    const client = new OpenAI({ apiKey })
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: AFB_AGENT_INSTRUCTIONS },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8,
      top_p: 0.9,
      max_tokens: 1200
    })

    const text = completion.choices?.[0]?.message?.content?.toString() || ''
    return new Response(text, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  } catch (e: any) {
    console.error('[afb][POST]', id, e?.message)
    return new Response(JSON.stringify({ code: 'MODEL_ERROR', message: e?.message || 'Failed to generate scripts' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

// (removed duplicate legacy handler)
