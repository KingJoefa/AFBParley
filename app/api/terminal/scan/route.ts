import { NextRequest } from 'next/server'
import { z } from 'zod'
import { runAgents, type MatchupContext } from '@/lib/terminal/engine/agent-runner'
import { buildProvenance, generateRequestId, hashObject } from '@/lib/terminal/engine/provenance'
import { shouldUseFallback } from '@/lib/terminal/engine/fallback-renderer'
import { checkRequestLimits, estimateTokens } from '@/lib/terminal/engine/guardrails'
import { analyzeFindings, generateFallbackAlerts } from '@/lib/terminal/analyst'

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
  // Mock data with strong signals to trigger agent findings
  // This simulates a matchup with multiple betting opportunities
  return {
    homeTeam,
    awayTeam,
    players: {
      [homeTeam]: [
        {
          name: 'George Kittle',
          team: homeTeam,
          position: 'TE',
          receiving_epa_rank: 2,  // Top tier EPA
          targets: 95,
          target_share_rank: 1,   // High target share
          red_zone_target_rank: 1, // Red zone usage
        },
        {
          name: 'Christian McCaffrey',
          team: homeTeam,
          position: 'HB',
          rushing_epa_rank: 1,    // Elite rusher
          receiving_epa_rank: 3,  // Dual threat
          carries: 280,
          targets: 95,
        },
      ],
      [awayTeam]: [
        {
          name: 'DK Metcalf',
          team: awayTeam,
          position: 'WR',
          receiving_epa_rank: 4,  // Strong receiver
          target_share_rank: 2,
          targets: 120,
          separation_rank: 8,
        },
        {
          name: 'Geno Smith',
          team: awayTeam,
          position: 'QB',
          qb_rating_rank: 12,
          yards_per_attempt_rank: 10,
          attempts: 520,
        },
      ],
    },
    teamStats: {
      [homeTeam]: {
        epa_allowed_to_wr_rank: 28,  // Weak vs WR (good for opponents)
        pressure_rate_rank: 5,        // Strong pressure
        pass_defense_rank: 8,
        qb_name: 'Brock Purdy',
      },
      [awayTeam]: {
        epa_allowed_to_rb_rank: 30,  // Terrible vs RB (CMC advantage)
        te_defense_rank: 25,          // Weak vs TE (Kittle advantage)
        pressure_rate_rank: 22,       // Weak pressure (Purdy safe)
        pass_block_win_rate_rank: 18,
        qb_name: 'Geno Smith',
        qb_passer_rating_under_pressure: 65.2, // Struggles under pressure
      },
    },
    weather: {
      temperature: 42,
      wind_mph: 15,               // Moderate wind (affects passing)
      precipitation_chance: 60,    // Rain likely
      precipitation_type: 'rain',
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

    // If no findings, return empty alerts (but still include findings array and hash)
    if (findings.length === 0) {
      const payloadHash = hashObject({
        matchup: parsed.data.matchup,
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
