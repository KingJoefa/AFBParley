import { NextRequest } from 'next/server'
import { z } from 'zod'
import OpenAI from 'openai'
import { AfbRequestSchema } from '@/types/afb'
import { getMemory } from '@/packages/sdk/memory'
import { AFB_AGENT_INSTRUCTIONS, buildUserPrompt } from '@/lib/afbPrompt'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

function rid() { return Math.random().toString(36).slice(2, 10) }

export async function POST(req: NextRequest) {
  const id = rid()
  try {
    const body = await req.json().catch(() => null)
    const parsed = AfbRequestSchema.safeParse(body)
    if (!parsed.success) {
      return new Response(JSON.stringify({ code: 'BAD_REQUEST', message: 'Invalid AFB request', details: parsed.error.flatten() }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    const { matchup, line_focus, angles, voice, profile } = parsed.data
    const memory = await getMemory(profile || 'default')
    const userPrompt = buildUserPrompt({ matchup, line_focus, angles, voice, memory })

    // Call model; require server-side key
    if (!process.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ code: 'MODEL_CONFIG', message: 'Model API key not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

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

import { NextRequest, NextResponse } from "next/server";
import { AFBRequest, AFBResponse } from "@/types/afb";
import { AFB_AGENT_INSTRUCTIONS, buildUserPrompt } from "@/lib/afbPrompt";

export const runtime = "nodejs"; // or "edge" if your model lib supports it

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<AFBRequest>;
    if (!body?.matchup) {
      return NextResponse.json({ error: "Missing 'matchup'." }, { status: 400 });
    }

    // Build prompt
    const userPrompt = buildUserPrompt({
      matchup: body.matchup,
      line_focus: body.line_focus,
      angles: body.angles,
      voice: body.voice,
      user_supplied_odds: body.user_supplied_odds,
    });

    // ---- Model call (OpenAI-style) ----
    // Swap this block to your provider of choice.
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server missing OPENAI_API_KEY." }, { status: 500 });
    }

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o", // or your preferred model id
        temperature: 0.7,
        messages: [
          { role: "system", content: AFB_AGENT_INSTRUCTIONS },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return NextResponse.json({ error: `Model error: ${errText}` }, { status: 502 });
    }

    const data = await resp.json();
    const text: string =
      data.choices?.[0]?.message?.content ??
      "No content returned from model.";

    const payload: AFBResponse = { text };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
