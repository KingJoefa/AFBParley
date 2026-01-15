/**
 * Context Debug API
 * Shows exactly what context would be injected into GPT for a given matchup.
 * Useful for debugging and verifying data freshness.
 */

import { NextRequest } from 'next/server'
import { buildGameContext, getContextSummary, parseMatchupTeams } from '@/lib/context'

export const runtime = 'nodejs'

// Current season/week - should match app/api/afb/route.ts
const CURRENT_SEASON = 2025
const CURRENT_WEEK = 20

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const matchup = searchParams.get('matchup')

  if (!matchup) {
    return Response.json(
      { error: 'Missing matchup parameter', example: '?matchup=Buffalo Bills @ Denver Broncos' },
      { status: 400 }
    )
  }

  try {
    const { away, home } = parseMatchupTeams(matchup)

    const context = await buildGameContext({
      year: CURRENT_SEASON,
      week: CURRENT_WEEK,
      matchup,
    })

    const summary = getContextSummary(context)

    return Response.json({
      matchup,
      parsedTeams: { away, home },
      season: CURRENT_SEASON,
      week: CURRENT_WEEK,
      summary: {
        totalTokens: summary.totalTokens,
        blockCounts: summary.blockCounts,
        statusByType: summary.statusByType,
        truncatedTypes: summary.truncatedTypes,
      },
      instruction: context.instruction,
      rawContext: context.context,
      blocks: context.blocks,
    })
  } catch (error: any) {
    return Response.json(
      { error: 'Failed to build context', message: error.message },
      { status: 500 }
    )
  }
}
