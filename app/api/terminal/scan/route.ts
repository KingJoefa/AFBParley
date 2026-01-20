import { NextRequest } from 'next/server'
import { z } from 'zod'
import { runAgents, type MatchupContext } from '@/lib/terminal/engine/agent-runner'
import { buildProvenance, generateRequestId, hashObject } from '@/lib/terminal/engine/provenance'
import { shouldUseFallback } from '@/lib/terminal/engine/fallback-renderer'
import { checkRequestLimits, estimateTokens } from '@/lib/terminal/engine/guardrails'
import { analyzeFindings, generateFallbackAlerts } from '@/lib/terminal/analyst'
import { ALL_AGENT_IDS } from '@/lib/terminal/run-state'
import type { AgentType } from '@/lib/terminal/schemas'

/**
 * /api/terminal/scan
 *
 * Scan a matchup for betting opportunities.
 * Returns Alert[] - the single terminal contract.
 *
 * Pipeline: agents → Finding[] → analyst → Alert[]
 * Finding[] is strictly internal; callers only see Alert[].
 */

const ScanRequestSchema = z.object({
  matchup: z.string().min(3).describe('e.g., "49ers @ Seahawks" or "SF @ SEA"'),
  agentIds: z.array(z.string()).optional().describe('Optional list of agent IDs to run (defaults to all)'),
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
 * Load matchup context from 2026 AFC/NFC Championship Games
 *
 * Real data sources:
 * - ESPN playoff bracket & storylines
 * - Divisional round box scores
 * - Injury reports and status updates
 * - Opening betting lines
 */
async function loadMatchupContext(
  homeTeam: string,
  awayTeam: string
): Promise<MatchupContext> {
  // AFC Championship: Patriots @ Broncos (Jan 25, 3pm ET, Denver)
  // NFC Championship: Rams @ Seahawks (Jan 25, 6:30pm ET, Seattle)

  const isAFC = (homeTeam === 'DEN' && awayTeam === 'NE') || (homeTeam === 'NE' && awayTeam === 'DEN')
  const isNFC = (homeTeam === 'SEA' && awayTeam === 'LAR') || (homeTeam === 'LAR' && awayTeam === 'SEA')

  // AFC Championship: Patriots @ Broncos
  if (isAFC && homeTeam === 'DEN') {
    return {
      homeTeam: 'DEN',
      awayTeam: 'NE',
      players: {
        DEN: [
          {
            name: 'Jarrett Stidham',
            team: 'DEN',
            position: 'QB',
            qb_rating_rank: 28, // Backup QB, limited recent action
            yards_per_attempt_rank: 24,
            turnover_pct_rank: 18,
            attempts: 66, // 2023 season total
          },
        ],
        NE: [
          {
            name: 'Drake Maye',
            team: 'NE',
            position: 'QB',
            qb_rating_rank: 1, // Led NFL in QBR this season
            yards_per_attempt_rank: 3,
            attempts: 520,
          },
          {
            name: 'DeMario Douglas',
            team: 'NE',
            position: 'WR',
            receiving_epa_rank: 8,
            target_share_rank: 5,
            targets: 110,
            separation_rank: 6,
          },
          {
            name: 'Kayshon Boutte',
            team: 'NE',
            position: 'WR',
            receiving_epa_rank: 12,
            targets: 95,
            red_zone_target_rank: 8,
          },
        ],
      },
      teamStats: {
        DEN: {
          pass_defense_rank: 4, // Strong defense overall
          pressure_rate_rank: 7,
          qb_name: 'Jarrett Stidham',
          qb_passer_rating_under_pressure: 72.0, // Untested in playoffs
        },
        NE: {
          epa_allowed_to_wr_rank: 22,
          pressure_rate_rank: 11, // Sacked Drake Maye 5x in last game
          pass_block_win_rate_rank: 14,
          qb_name: 'Drake Maye',
        },
      },
      weather: {
        temperature: 35, // January in Denver
        wind_mph: 8,
        precipitation_chance: 10,
        indoor: false,
        stadium: 'Empower Field at Mile High',
      },
      dataTimestamp: Date.now(),
      dataVersion: '2025-week-21-championship',
      gameNotes: 'Bo Nix fractured right ankle in OT vs Bills. Stidham has not thrown a pass since January 2024. Patriots favored by 4.5 points.',
      injuries: {
        DEN: ['Bo Nix (QB, OUT - fractured ankle)'],
        NE: [],
      },
      totals: { home: 18, away: 23 }, // O/U 41.5
      spread: { favorite: 'NE', line: 4.5 },
    }
  }

  // NFC Championship: Rams @ Seahawks
  if (isNFC && homeTeam === 'SEA') {
    return {
      homeTeam: 'SEA',
      awayTeam: 'LAR',
      players: {
        SEA: [
          {
            name: 'Sam Darnold',
            team: 'SEA',
            position: 'QB',
            qb_rating_rank: 9,
            yards_per_attempt_rank: 12,
            attempts: 480,
          },
          {
            name: 'Jaxon Smith-Njigba',
            team: 'SEA',
            position: 'WR',
            receiving_epa_rank: 6,
            target_share_rank: 3,
            targets: 125,
            separation_rank: 4,
          },
          {
            name: 'Kenneth Walker III',
            team: 'SEA',
            position: 'HB',
            rushing_epa_rank: 5,
            rush_yards_rank: 8,
            carries: 245,
          },
        ],
        LAR: [
          {
            name: 'Matthew Stafford',
            team: 'LAR',
            position: 'QB',
            qb_rating_rank: 4, // MVP candidate
            yards_per_attempt_rank: 2,
            attempts: 545,
          },
          {
            name: 'Puka Nacua',
            team: 'LAR',
            position: 'WR',
            receiving_epa_rank: 2, // Top tier
            target_share_rank: 1,
            targets: 140,
            separation_rank: 3,
          },
          {
            name: 'Cooper Kupp',
            team: 'LAR',
            position: 'WR',
            receiving_epa_rank: 7,
            targets: 115,
            red_zone_target_rank: 4,
          },
        ],
      },
      teamStats: {
        SEA: {
          pass_defense_rank: 2, // "Most complete defense in playoffs"
          epa_allowed_to_wr_rank: 5,
          pressure_rate_rank: 4,
          qb_name: 'Sam Darnold',
        },
        LAR: {
          epa_allowed_to_rb_rank: 18,
          te_defense_rank: 16,
          pressure_rate_rank: 14,
          pass_block_win_rate_rank: 8,
          qb_name: 'Matthew Stafford',
          qb_passer_rating_under_pressure: 85.3, // Strong under pressure
        },
      },
      weather: {
        temperature: 48, // January in Seattle
        wind_mph: 12,
        precipitation_chance: 40, // Typical Seattle weather
        precipitation_type: 'rain',
        indoor: false,
        stadium: 'Lumen Field',
      },
      dataTimestamp: Date.now(),
      dataVersion: '2025-week-21-championship',
      gameNotes: 'Rams offense #1 in EPA per play. Teams split regular season 1-1. Seahawks dominated 49ers 41-6. Darnold dealing with oblique injury but expected to play.',
      injuries: {
        SEA: ['Sam Darnold (QB, QUESTIONABLE - oblique, expected to play)'],
        LAR: ['Matthew Stafford (QB, PROBABLE - finger sprain, no concern)'],
      },
      totals: { home: 25, away: 22.5 }, // O/U 47.5
      spread: { favorite: 'SEA', line: 2.5 },
    }
  }

  // Fallback: Return minimal context for other matchups
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
      wind_mph: 5,
      precipitation_chance: 10,
      indoor: false,
    },
    dataTimestamp: Date.now(),
    dataVersion: '2025-week-21',
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

    // Validate agentIds if provided
    const agentIds = parsed.data.agentIds
    if (agentIds !== undefined) {
      // Reject empty list
      if (agentIds.length === 0) {
        return Response.json(
          {
            error: 'Invalid agentIds',
            message: 'agentIds cannot be an empty list. Omit the field or provide at least one agent.',
            request_id: requestId,
          },
          { status: 400 }
        )
      }
      // Reject unknown IDs
      const unknownIds = agentIds.filter(id => !ALL_AGENT_IDS.includes(id as AgentType))
      if (unknownIds.length > 0) {
        return Response.json(
          {
            error: 'Invalid agentIds',
            message: `Unknown agent IDs: ${unknownIds.join(', ')}. Valid agents: ${ALL_AGENT_IDS.join(', ')}`,
            request_id: requestId,
          },
          { status: 400 }
        )
      }
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
    // Pass validated agentIds to filter which agents run
    const { findings, agentsInvoked, agentsSilent } = await runAgents(
      matchupContext,
      agentIds as AgentType[] | undefined
    )

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

    // If no findings, return empty alerts (but still include findings array and hash)
    if (findings.length === 0) {
      const payloadHash = hashObject({
        matchup: parsed.data.matchup,
        agentIds: agentIds?.slice().sort() || ALL_AGENT_IDS.slice().sort(),
        findings: [],
        alerts: [],
      })

      return Response.json({
        request_id: requestId,
        matchup: {
          home: teams.homeTeam,
          away: teams.awayTeam,
        },
        alerts: [],
        findings: [], // Empty but present
        selected_agents: agentIds || ALL_AGENT_IDS, // Echo back which agents were selected
        message: 'No significant findings for this matchup. All agents silent.',
        agents: {
          invoked: agentsInvoked,
          silent: agentsSilent,
        },
        provenance,
        payload_hash: payloadHash, // Hash of empty state
        timing_ms: Date.now() - startTime,
      })
    }

    // Run LLM analyst to transform Finding[] → Alert[]
    const analysisResult = await analyzeFindings(findings, matchupContext.dataVersion)

    // Update provenance with LLM info
    const finalProvenance = buildProvenance({
      requestId,
      prompt: analysisResult.prompt,
      skillMds: analysisResult.skillMds,
      findings,
      dataVersion: matchupContext.dataVersion,
      dataTimestamp: matchupContext.dataTimestamp,
      searchTimestamps: [],
      agentsInvoked,
      agentsSilent,
      cacheHits: 0,
      cacheMisses: 0,
      llmModel: analysisResult.fallback ? 'fallback' : 'gpt-4o-mini',
      llmTemperature: 0.2,
    })

    // Compute payload hash for staleness detection
    const payloadHash = hashObject({
      matchup: parsed.data.matchup,
      agentIds: agentIds?.slice().sort() || ALL_AGENT_IDS.slice().sort(),
      findings,
      alerts: analysisResult.alerts,
    })

    return Response.json({
      request_id: requestId,
      matchup: {
        home: teams.homeTeam,
        away: teams.awayTeam,
      },
      alerts: analysisResult.alerts,
      findings, // Include raw findings for Phase 2
      selected_agents: agentIds || ALL_AGENT_IDS, // Echo back which agents were selected
      agents: {
        invoked: agentsInvoked,
        silent: agentsSilent,
      },
      provenance: finalProvenance,
      payload_hash: payloadHash, // For staleness detection
      timing_ms: Date.now() - startTime,
      ...(analysisResult.fallback && { fallback: true }),
      ...(analysisResult.errors.length > 0 && { warnings: analysisResult.errors }),
    })
  } catch (error) {
    // Always return Alert[] contract, even on error
    // This ensures terminal never has to handle forked response shapes
    const errorMessage = (error as Error).message
    const isRecoverable = shouldUseFallback(error)

    return Response.json(
      {
        request_id: requestId,
        alerts: [], // Empty alerts on error, but contract preserved
        error: isRecoverable ? 'Scan degraded' : 'Scan failed',
        message: errorMessage,
        fallback: true,
      },
      { status: isRecoverable ? 503 : 500 }
    )
  }
}

// GET for health check / discovery
export async function GET() {
  return Response.json({
    endpoint: '/api/terminal/scan',
    method: 'POST',
    description: 'Scan a matchup for betting opportunities. Returns Alert[] (single contract).',
    schema: {
      matchup: 'string - e.g., "SF @ SEA" or "49ers @ Seahawks"',
      options: {
        includeWeather: 'boolean (default: true)',
        includeProps: 'boolean (default: true)',
      },
    },
    response: {
      alerts: 'Alert[] - always present, even on fallback/error',
      matchup: '{ home: string, away: string }',
      agents: '{ invoked: string[], silent: string[] }',
      provenance: 'object - data lineage',
      fallback: 'boolean? - true if LLM analyst failed',
      warnings: 'string[]? - non-fatal issues',
    },
    examples: [
      { matchup: 'SF @ SEA' },
      { matchup: 'Chiefs @ Raiders', options: { includeWeather: true } },
    ],
  })
}
