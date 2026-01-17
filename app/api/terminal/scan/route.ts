import { NextRequest } from 'next/server'
import { z } from 'zod'
import { runAgents, type MatchupContext } from '@/lib/terminal/engine/agent-runner'
import { buildProvenance, generateRequestId } from '@/lib/terminal/engine/provenance'
import {
  renderFindingsFallback,
  formatFallbackForApi,
  shouldUseFallback,
} from '@/lib/terminal/engine/fallback-renderer'
import { checkRequestLimits, estimateTokens } from '@/lib/terminal/engine/guardrails'

/**
 * /api/terminal/scan
 *
 * Scan a matchup for betting opportunities.
 * Returns Finding[] from all agents.
 *
 * Future: Will integrate LLM analyst to transform Finding[] → Alert[]
 */

const ScanRequestSchema = z.object({
  matchup: z.string().min(3).describe('e.g., "49ers @ Seahawks" or "SF @ SEA"'),
  options: z
    .object({
      includeWeather: z.boolean().default(true),
      includeProps: z.boolean().default(true),
    })
    .optional(),
})

type ScanRequest = z.infer<typeof ScanRequestSchema>

// Team name mappings
const TEAM_ALIASES: Record<string, string> = {
  '49ers': 'SF',
  niners: 'SF',
  'san francisco': 'SF',
  seahawks: 'SEA',
  seattle: 'SEA',
  cardinals: 'ARI',
  arizona: 'ARI',
  rams: 'LAR',
  'los angeles rams': 'LAR',
  chiefs: 'KC',
  'kansas city': 'KC',
  raiders: 'LV',
  'las vegas': 'LV',
  broncos: 'DEN',
  denver: 'DEN',
  chargers: 'LAC',
  'los angeles chargers': 'LAC',
  cowboys: 'DAL',
  dallas: 'DAL',
  eagles: 'PHI',
  philadelphia: 'PHI',
  giants: 'NYG',
  'new york giants': 'NYG',
  commanders: 'WAS',
  washington: 'WAS',
  bears: 'CHI',
  chicago: 'CHI',
  lions: 'DET',
  detroit: 'DET',
  packers: 'GB',
  'green bay': 'GB',
  vikings: 'MIN',
  minnesota: 'MIN',
  falcons: 'ATL',
  atlanta: 'ATL',
  panthers: 'CAR',
  carolina: 'CAR',
  saints: 'NO',
  'new orleans': 'NO',
  buccaneers: 'TB',
  bucs: 'TB',
  'tampa bay': 'TB',
  ravens: 'BAL',
  baltimore: 'BAL',
  bengals: 'CIN',
  cincinnati: 'CIN',
  browns: 'CLE',
  cleveland: 'CLE',
  steelers: 'PIT',
  pittsburgh: 'PIT',
  texans: 'HOU',
  houston: 'HOU',
  colts: 'IND',
  indianapolis: 'IND',
  jaguars: 'JAX',
  jacksonville: 'JAX',
  titans: 'TEN',
  tennessee: 'TEN',
  bills: 'BUF',
  buffalo: 'BUF',
  dolphins: 'MIA',
  miami: 'MIA',
  patriots: 'NE',
  'new england': 'NE',
  jets: 'NYJ',
  'new york jets': 'NYJ',
}

function normalizeTeamName(name: string): string {
  const lower = name.toLowerCase().trim()
  return TEAM_ALIASES[lower] || name.toUpperCase()
}

function parseMatchup(matchup: string): { homeTeam: string; awayTeam: string } | null {
  // Try "@" format: "SF @ SEA" or "49ers @ Seahawks"
  const atMatch = matchup.match(/^(.+?)\s*@\s*(.+)$/i)
  if (atMatch) {
    return {
      awayTeam: normalizeTeamName(atMatch[1]),
      homeTeam: normalizeTeamName(atMatch[2]),
    }
  }

  // Try "vs" format: "SF vs SEA"
  const vsMatch = matchup.match(/^(.+?)\s*vs\.?\s*(.+)$/i)
  if (vsMatch) {
    return {
      homeTeam: normalizeTeamName(vsMatch[1]),
      awayTeam: normalizeTeamName(vsMatch[2]),
    }
  }

  return null
}

/**
 * Load matchup context from data layer
 * TODO: Implement actual data loading from local files + web search
 */
async function loadMatchupContext(
  homeTeam: string,
  awayTeam: string
): Promise<MatchupContext> {
  // For now, return mock data structure
  // This will be replaced with actual data loading
  return {
    homeTeam,
    awayTeam,
    players: {
      [homeTeam]: [],
      [awayTeam]: [],
    },
    teamStats: {
      [homeTeam]: {},
      [awayTeam]: {},
    },
    weather: {
      temperature: 55,
      wind_mph: 8,
      precipitation_chance: 10,
      indoor: false,
    },
    dataTimestamp: Date.now(),
    dataVersion: `2025-week-${Math.ceil((Date.now() - new Date('2025-09-01').getTime()) / (7 * 24 * 60 * 60 * 1000))}`,
  }
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  try {
    // Parse request body
    const body = await req.json()
    const parsed = ScanRequestSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        {
          error: 'Invalid request',
          details: parsed.error.flatten(),
          request_id: requestId,
        },
        { status: 400 }
      )
    }

    // Parse matchup string
    const teams = parseMatchup(parsed.data.matchup)
    if (!teams) {
      return Response.json(
        {
          error: 'Invalid matchup format',
          message: 'Use format: "Team1 @ Team2" or "Team1 vs Team2"',
          examples: ['SF @ SEA', '49ers @ Seahawks', 'Chiefs vs Raiders'],
          request_id: requestId,
        },
        { status: 400 }
      )
    }

    // Load matchup context
    const matchupContext = await loadMatchupContext(teams.homeTeam, teams.awayTeam)

    // Check guardrails
    const inputEstimate = estimateTokens(JSON.stringify(matchupContext))
    checkRequestLimits({ inputTokens: inputEstimate })

    // Run threshold checks (deterministic)
    const { findings, agentsInvoked, agentsSilent } = await runAgents(matchupContext)

    // Build provenance
    const provenance = buildProvenance({
      requestId,
      prompt: '', // No LLM call in this phase
      skillMds: {},
      findings,
      dataVersion: matchupContext.dataVersion,
      dataTimestamp: matchupContext.dataTimestamp,
      searchTimestamps: [],
      agentsInvoked,
      agentsSilent,
      cacheHits: 0,
      cacheMisses: 0,
      llmModel: 'none',
      llmTemperature: 0,
    })

    // If no findings, return early
    if (findings.length === 0) {
      return Response.json({
        request_id: requestId,
        matchup: {
          home: teams.homeTeam,
          away: teams.awayTeam,
        },
        findings: [],
        alerts: [],
        message: 'No significant findings for this matchup. All agents silent.',
        agents: {
          invoked: agentsInvoked,
          silent: agentsSilent,
        },
        provenance,
        timing_ms: Date.now() - startTime,
      })
    }

    // For now, return findings with fallback format
    // TODO: Task 12 will add LLM analyst to transform Finding[] → Alert[]
    const fallbackOutput = formatFallbackForApi(findings)

    return Response.json({
      request_id: requestId,
      matchup: {
        home: teams.homeTeam,
        away: teams.awayTeam,
      },
      findings,
      fallback: fallbackOutput,
      agents: {
        invoked: agentsInvoked,
        silent: agentsSilent,
      },
      provenance,
      timing_ms: Date.now() - startTime,
      _note:
        'Alert[] output pending LLM analyst integration. Using fallback renderer.',
    })
  } catch (error) {
    // Check if we should use fallback mode
    if (shouldUseFallback(error)) {
      return Response.json(
        {
          error: 'Scan degraded',
          message: 'Using fallback mode due to service issue',
          fallback: true,
          request_id: requestId,
        },
        { status: 503 }
      )
    }

    return Response.json(
      {
        error: 'Scan failed',
        message: (error as Error).message,
        request_id: requestId,
      },
      { status: 500 }
    )
  }
}

// GET for health check / discovery
export async function GET() {
  return Response.json({
    endpoint: '/api/terminal/scan',
    method: 'POST',
    description: 'Scan a matchup for betting opportunities',
    schema: {
      matchup: 'string - e.g., "SF @ SEA" or "49ers @ Seahawks"',
      options: {
        includeWeather: 'boolean (default: true)',
        includeProps: 'boolean (default: true)',
      },
    },
    examples: [
      { matchup: 'SF @ SEA' },
      { matchup: 'Chiefs @ Raiders', options: { includeWeather: true } },
    ],
  })
}
