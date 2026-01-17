import { NextRequest } from 'next/server'
import { z } from 'zod'
import { runAgents, type MatchupContext } from '@/lib/terminal/engine/agent-runner'
import { buildProvenance, generateRequestId } from '@/lib/terminal/engine/provenance'
import { loadGameNotes } from '@/lib/terminal/engine/notes-loader'
import { analyzeFindings, type GameNotesContext } from '@/lib/terminal/analyst'
import {
  type TerminalResponse,
  buildTerminalResponse,
  buildEmptyResponse,
  buildErrorResponse,
} from '@/lib/terminal/schemas'
import type { Alert, Finding } from '@/lib/terminal/schemas'
import { isActionEnabled } from '@/lib/terminal/feature-flags'

/**
 * /api/terminal/prop
 *
 * PROP: Find mispriced player tails (alts, quarters, halves).
 * Returns Alert[] - ranked pool of selections with implied_prob < 40%.
 *
 * Output per alert:
 *   - market, line, odds, implied_prob (encoded in claim/evidence)
 *   - edge_rationale (implications array)
 *   - exposure_tier (severity: high = high-exposure, medium = safer)
 *
 * This is the canonical selection pool consumed by STORY and PARLAY.
 */

const PropRequestSchema = z.object({
  matchup: z.string().min(3),
  signals: z.array(z.string()).optional(),
  odds_paste: z.string().optional(),
  options: z.object({
    max_props: z.number().min(1).max(20).default(10),
    implied_prob_ceiling: z.number().min(0.1).max(0.5).default(0.4),
  }).optional(),
})

type PropRequest = z.infer<typeof PropRequestSchema>

// Team name mappings (shared with scan)
const TEAM_ALIASES: Record<string, string> = {
  '49ers': 'SF', niners: 'SF', 'san francisco': 'SF',
  seahawks: 'SEA', seattle: 'SEA',
  cardinals: 'ARI', arizona: 'ARI',
  rams: 'LAR', 'los angeles rams': 'LAR',
  chiefs: 'KC', 'kansas city': 'KC',
  raiders: 'LV', 'las vegas': 'LV',
  broncos: 'DEN', denver: 'DEN',
  chargers: 'LAC', 'los angeles chargers': 'LAC',
  cowboys: 'DAL', dallas: 'DAL',
  eagles: 'PHI', philadelphia: 'PHI',
  giants: 'NYG', 'new york giants': 'NYG',
  commanders: 'WAS', washington: 'WAS',
  bears: 'CHI', chicago: 'CHI',
  lions: 'DET', detroit: 'DET',
  packers: 'GB', 'green bay': 'GB',
  vikings: 'MIN', minnesota: 'MIN',
  falcons: 'ATL', atlanta: 'ATL',
  panthers: 'CAR', carolina: 'CAR',
  saints: 'NO', 'new orleans': 'NO',
  buccaneers: 'TB', bucs: 'TB', 'tampa bay': 'TB',
  ravens: 'BAL', baltimore: 'BAL',
  bengals: 'CIN', cincinnati: 'CIN',
  browns: 'CLE', cleveland: 'CLE',
  steelers: 'PIT', pittsburgh: 'PIT',
  texans: 'HOU', houston: 'HOU',
  colts: 'IND', indianapolis: 'IND',
  jaguars: 'JAX', jacksonville: 'JAX',
  titans: 'TEN', tennessee: 'TEN',
  bills: 'BUF', buffalo: 'BUF',
  dolphins: 'MIA', miami: 'MIA',
  patriots: 'NE', 'new england': 'NE',
  jets: 'NYJ', 'new york jets': 'NYJ',
}

function normalizeTeamName(name: string): string {
  const lower = name.toLowerCase().trim()
  return TEAM_ALIASES[lower] || name.toUpperCase()
}

function parseMatchup(matchup: string): { homeTeam: string; awayTeam: string } | null {
  const atMatch = matchup.match(/^(.+?)\s*@\s*(.+)$/i)
  if (atMatch) {
    return {
      awayTeam: normalizeTeamName(atMatch[1]),
      homeTeam: normalizeTeamName(atMatch[2]),
    }
  }
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
 * Filter findings to player prop-relevant findings
 * PROP focuses on: WR, TE, HB, QB player-level findings
 */
function filterToPropFindings(findings: Finding[]): Finding[] {
  // Player-focused agents
  const PROP_AGENTS = ['wr', 'te', 'hb', 'qb']
  return findings.filter(f => PROP_AGENTS.includes(f.agent))
}

/**
 * Calculate implied probability from American odds
 * Returns value between 0 and 1
 */
function oddsToImpliedProb(americanOdds: number): number {
  if (americanOdds > 0) {
    return 100 / (americanOdds + 100)
  } else {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100)
  }
}

/**
 * Parse odds from paste (e.g., "+350", "-110")
 * Returns map of market -> odds
 */
function parseOddsPaste(paste: string | undefined): Map<string, number> {
  const odds = new Map<string, number>()
  if (!paste) return odds

  // Simple parser: "Player Name O/U 75.5 +350"
  const lines = paste.split('\n')
  for (const line of lines) {
    const match = line.match(/([+-]\d+)\s*$/)
    if (match) {
      odds.set(line.trim(), parseInt(match[1]))
    }
  }
  return odds
}

/**
 * Rank alerts by edge strength (confidence + implications count)
 */
function rankAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    // Primary: confidence (higher is better edge)
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence
    }
    // Secondary: severity (high = more exposed but stronger)
    if (a.severity !== b.severity) {
      return a.severity === 'high' ? -1 : 1
    }
    // Tertiary: more implications = more support
    return b.implications.length - a.implications.length
  })
}

/**
 * Load matchup context with game notes
 */
async function loadMatchupContext(
  homeTeam: string,
  awayTeam: string
): Promise<{ context: MatchupContext; gameNotes?: GameNotesContext }> {
  // Load game notes from fixture (graceful degradation if missing)
  const gameNotes = loadGameNotes(homeTeam, awayTeam)

  const context: MatchupContext = {
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
    // Include notes metadata in context for provenance
    gameNotes: gameNotes?.notes,
    injuries: gameNotes?.injuries,
    keyMatchups: gameNotes?.keyMatchups,
    totals: gameNotes?.totals,
    spread: gameNotes?.spread,
  }

  return { context, gameNotes }
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  // Feature flag check
  if (!isActionEnabled('prop')) {
    return Response.json(
      buildErrorResponse({
        mode: 'prop',
        requestId,
        error: 'PROP action is currently disabled',
        recoverable: false,
      }),
      { status: 503 }
    )
  }

  try {
    const body = await req.json()
    const parsed = PropRequestSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        buildErrorResponse({
          mode: 'prop',
          requestId,
          error: `Invalid request: ${parsed.error.message}`,
          recoverable: false,
        }),
        { status: 400 }
      )
    }

    const { matchup, signals, odds_paste, options } = parsed.data
    const maxProps = options?.max_props ?? 10
    const impliedProbCeiling = options?.implied_prob_ceiling ?? 0.4

    // Parse matchup
    const teams = parseMatchup(matchup)
    if (!teams) {
      return Response.json(
        buildErrorResponse({
          mode: 'prop',
          requestId,
          error: 'Invalid matchup format. Use "Team1 @ Team2" or "Team1 vs Team2"',
          recoverable: false,
        }),
        { status: 400 }
      )
    }

    // Load context with game notes
    const { context: matchupContext, gameNotes } = await loadMatchupContext(teams.homeTeam, teams.awayTeam)

    // Parse any pasted odds
    const parsedOdds = parseOddsPaste(odds_paste)

    // Run agents
    const { findings, agentsInvoked, agentsSilent } = await runAgents(matchupContext)

    // Filter to prop-relevant findings
    const propFindings = filterToPropFindings(findings)

    // If no prop findings, return empty
    if (propFindings.length === 0) {
      const provenance = buildProvenance({
        requestId,
        prompt: '',
        skillMds: {},
        findings: [],
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

      return Response.json(
        buildEmptyResponse({
          mode: 'prop',
          requestId,
          matchup: { home: teams.homeTeam, away: teams.awayTeam },
          agents: { invoked: agentsInvoked, silent: agentsSilent },
          provenance,
          timingMs: Date.now() - startTime,
          message: 'No player prop findings for this matchup.',
        })
      )
    }

    // Run analyst to transform Finding[] → Alert[] (with game notes for context)
    const analysisResult = await analyzeFindings(propFindings, matchupContext.dataVersion, {}, gameNotes)

    // Rank alerts by edge strength
    const rankedAlerts = rankAlerts(analysisResult.alerts)

    // Limit to max_props
    const limitedAlerts = rankedAlerts.slice(0, maxProps)

    // Build provenance
    const provenance = buildProvenance({
      requestId,
      prompt: analysisResult.prompt,
      skillMds: analysisResult.skillMds,
      findings: propFindings,
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

    return Response.json(
      buildTerminalResponse({
        alerts: limitedAlerts,
        mode: 'prop',
        requestId,
        matchup: { home: teams.homeTeam, away: teams.awayTeam },
        agents: { invoked: agentsInvoked, silent: agentsSilent },
        provenance,
        timingMs: Date.now() - startTime,
        fallback: analysisResult.fallback,
        warnings: analysisResult.errors.length > 0 ? analysisResult.errors : undefined,
      })
    )
  } catch (error) {
    return Response.json(
      buildErrorResponse({
        mode: 'prop',
        requestId,
        error: (error as Error).message,
        recoverable: true,
      }),
      { status: 500 }
    )
  }
}

export async function GET() {
  return Response.json({
    endpoint: '/api/terminal/prop',
    method: 'POST',
    description: 'Find mispriced player tails. Returns Alert[] (unified contract).',
    schema: {
      matchup: 'string - e.g., "SF @ SEA"',
      signals: 'string[]? - normalized signal tags',
      odds_paste: 'string? - book odds for probability calc',
      options: {
        max_props: 'number (1-20, default: 10)',
        implied_prob_ceiling: 'number (0.1-0.5, default: 0.4)',
      },
    },
    response: {
      alerts: 'Alert[] - ranked prop selections',
      mode: '"prop"',
      matchup: '{ home, away }',
      agents: '{ invoked, silent }',
      provenance: 'object',
    },
  })
}
