import { NextRequest } from 'next/server'
import { z } from 'zod'
import { runAgents, type MatchupContext } from '@/lib/terminal/engine/agent-runner'
import { buildProvenance, generateRequestId } from '@/lib/terminal/engine/provenance'
import { analyzeFindings } from '@/lib/terminal/analyst'
import {
  type TerminalResponse,
  buildTerminalResponse,
  buildEmptyResponse,
  buildErrorResponse,
  identifyCorrelations,
  type Script,
  type Leg,
  type CorrelationType,
} from '@/lib/terminal/schemas'
import type { Alert, Finding, AgentType } from '@/lib/terminal/schemas'
import { createHash } from 'crypto'
import { isActionEnabled } from '@/lib/terminal/feature-flags'

/**
 * /api/terminal/story
 *
 * STORY (SGP): Build single-game narratives with 3-6 correlated legs.
 * Consumes PROP pool for the matchup to select supporting legs.
 *
 * Output:
 *   - 1-3 narrative scripts per game
 *   - Each script has:
 *     - "The Story" - premise (spread discrepancy, matchup funnel, etc.)
 *     - "The Bets" - 3-6 correlated legs with odds
 *     - 1-2 variants
 *     - Freshness notes for weather/injuries
 *
 * Returns Alert[] for unified contract, with correlated alerts grouped.
 */

const StoryRequestSchema = z.object({
  matchup: z.string().min(3),
  signals: z.array(z.string()).optional(),
  anchor: z.string().optional(), // Market focus
  options: z.object({
    max_stories: z.number().min(1).max(3).default(2),
    legs_per_story: z.object({
      min: z.number().min(2).default(3),
      max: z.number().max(8).default(6),
    }).optional(),
  }).optional(),
})

type StoryRequest = z.infer<typeof StoryRequestSchema>

// Team name mappings (shared with scan/prop)
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
 * Load matchup context
 */
async function loadMatchupContext(
  homeTeam: string,
  awayTeam: string
): Promise<MatchupContext> {
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

/**
 * Correlation type to story premise mapping
 */
const STORY_PREMISES: Record<CorrelationType, string> = {
  game_script: 'Game Script Advantage',
  player_stack: 'Player Stack Correlation',
  weather_cascade: 'Weather Impact Chain',
  defensive_funnel: 'Defensive Pressure Narrative',
  volume_share: 'Target Share Concentration',
}

/**
 * Build narrative description for a correlation type
 */
function buildNarrative(
  type: CorrelationType,
  alerts: Alert[],
  homeTeam: string,
  awayTeam: string
): string {
  const agents = [...new Set(alerts.map(a => a.agent))]

  switch (type) {
    case 'weather_cascade':
      return `Weather conditions create cascading effects on ${awayTeam}@${homeTeam}. Multiple passing game metrics align.`
    case 'defensive_funnel':
      return `Defensive pressure forces quick reads, correlating QB and receiver metrics in ${awayTeam}@${homeTeam}.`
    case 'game_script':
      return `Expected game script favors specific usage patterns. EPA efficiency predicts playcalling tendencies.`
    case 'player_stack':
      return `Player stack opportunity with ${agents.join('/')} alignment for connected outcomes.`
    case 'volume_share':
      return `Target concentration creates correlated receiver outcomes across the ${awayTeam}@${homeTeam} matchup.`
    default:
      return `Correlated leg opportunity identified across ${agents.join(', ')} positions.`
  }
}

/**
 * Build scripts from alerts using correlation identification
 */
function buildScriptsFromAlerts(
  alerts: Alert[],
  maxStories: number,
  minLegs: number,
  maxLegs: number,
  homeTeam: string,
  awayTeam: string
): Script[] {
  if (alerts.length < minLegs) {
    return []
  }

  // Build maps for correlation identification
  const alertIds = alerts.map(a => a.id)
  const alertAgents = new Map<string, string>(alerts.map(a => [a.id, a.agent]))
  const alertImplications = new Map<string, string[]>(
    alerts.map(a => [a.id, a.implications])
  )

  // Identify correlations
  const correlations = identifyCorrelations(alertIds, alertAgents, alertImplications)

  // Filter to correlations with enough legs
  const validCorrelations = correlations.filter(
    c => c.ids.length >= minLegs && c.ids.length <= maxLegs
  )

  // Build scripts from correlations
  const scripts: Script[] = []
  const usedAlertIds = new Set<string>()

  for (const correlation of validCorrelations.slice(0, maxStories)) {
    // Skip if too many alerts already used
    const availableIds = correlation.ids.filter(id => !usedAlertIds.has(id))
    if (availableIds.length < minLegs) continue

    const selectedIds = availableIds.slice(0, maxLegs)
    const selectedAlerts = alerts.filter(a => selectedIds.includes(a.id))

    // Calculate combined confidence (geometric mean)
    const combinedConfidence = Math.pow(
      selectedAlerts.reduce((acc, a) => acc * a.confidence, 1),
      1 / selectedAlerts.length
    )

    // Build legs
    const legs: Leg[] = selectedAlerts.map(alert => ({
      alert_id: alert.id,
      market: alert.claim.substring(0, 50), // Extract market from claim
      implied_probability: 1 - alert.confidence, // Rough estimate
      correlation_factor: 0.5, // Placeholder
      agent: alert.agent,
    }))

    // Determine risk level
    let riskLevel: 'conservative' | 'moderate' | 'aggressive'
    if (combinedConfidence > 0.7) {
      riskLevel = 'conservative'
    } else if (combinedConfidence > 0.5) {
      riskLevel = 'moderate'
    } else {
      riskLevel = 'aggressive'
    }

    // Build provenance hash
    const provenanceData = selectedIds.join(',') + correlation.type
    const provenanceHash = createHash('md5').update(provenanceData).digest('hex').substring(0, 8)

    const script: Script = {
      id: `story-${scripts.length + 1}`,
      name: `${STORY_PREMISES[correlation.type]} - ${awayTeam}@${homeTeam}`,
      legs,
      correlation_type: correlation.type,
      correlation_explanation: buildNarrative(
        correlation.type,
        selectedAlerts,
        homeTeam,
        awayTeam
      ),
      combined_confidence: combinedConfidence,
      risk_level: riskLevel,
      provenance_hash: provenanceHash,
    }

    scripts.push(script)
    selectedIds.forEach(id => usedAlertIds.add(id))
  }

  return scripts
}

/**
 * Get all alert IDs from scripts
 */
function getScriptAlertIds(scripts: Script[]): Set<string> {
  const ids = new Set<string>()
  for (const script of scripts) {
    for (const leg of script.legs) {
      ids.add(leg.alert_id)
    }
  }
  return ids
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  // Feature flag check
  if (!isActionEnabled('story')) {
    return Response.json(
      buildErrorResponse({
        mode: 'story',
        requestId,
        error: 'STORY action is currently disabled',
        recoverable: false,
      }),
      { status: 503 }
    )
  }

  try {
    const body = await req.json()
    const parsed = StoryRequestSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        buildErrorResponse({
          mode: 'story',
          requestId,
          error: `Invalid request: ${parsed.error.message}`,
          recoverable: false,
        }),
        { status: 400 }
      )
    }

    const { matchup, signals, anchor, options } = parsed.data
    const maxStories = options?.max_stories ?? 2
    const minLegs = options?.legs_per_story?.min ?? 3
    const maxLegs = options?.legs_per_story?.max ?? 6

    // Parse matchup
    const teams = parseMatchup(matchup)
    if (!teams) {
      return Response.json(
        buildErrorResponse({
          mode: 'story',
          requestId,
          error: 'Invalid matchup format. Use "Team1 @ Team2" or "Team1 vs Team2"',
          recoverable: false,
        }),
        { status: 400 }
      )
    }

    // Load context
    const matchupContext = await loadMatchupContext(teams.homeTeam, teams.awayTeam)

    // Run agents (same as PROP - get full finding pool)
    const { findings, agentsInvoked, agentsSilent } = await runAgents(matchupContext)

    // If no findings, return empty
    if (findings.length === 0) {
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
          mode: 'story',
          requestId,
          matchup: { home: teams.homeTeam, away: teams.awayTeam },
          agents: { invoked: agentsInvoked, silent: agentsSilent },
          provenance,
          timingMs: Date.now() - startTime,
          message: 'No findings for story construction.',
        })
      )
    }

    // Run analyst to get Alert[]
    const analysisResult = await analyzeFindings(findings, matchupContext.dataVersion)

    // Build scripts from correlated alerts
    const scripts = buildScriptsFromAlerts(
      analysisResult.alerts,
      maxStories,
      minLegs,
      maxLegs,
      teams.homeTeam,
      teams.awayTeam
    )

    // Get alerts that are part of scripts
    const scriptAlertIds = getScriptAlertIds(scripts)
    const storyAlerts = analysisResult.alerts.filter(a => scriptAlertIds.has(a.id))

    // If no correlated stories found, return all alerts with message
    if (scripts.length === 0) {
      const provenance = buildProvenance({
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

      // Return all alerts but indicate no stories found
      return Response.json({
        ...buildTerminalResponse({
          alerts: analysisResult.alerts,
          mode: 'story',
          requestId,
          matchup: { home: teams.homeTeam, away: teams.awayTeam },
          agents: { invoked: agentsInvoked, silent: agentsSilent },
          provenance,
          timingMs: Date.now() - startTime,
          fallback: analysisResult.fallback,
          warnings: ['No correlated stories identified. Returning raw prop pool.'],
        }),
        scripts: [],
      })
    }

    // Build provenance
    const provenance = buildProvenance({
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

    // Return response with scripts metadata
    return Response.json({
      ...buildTerminalResponse({
        alerts: storyAlerts, // Only correlated alerts
        mode: 'story',
        requestId,
        matchup: { home: teams.homeTeam, away: teams.awayTeam },
        agents: { invoked: agentsInvoked, silent: agentsSilent },
        provenance,
        timingMs: Date.now() - startTime,
        fallback: analysisResult.fallback,
        warnings: analysisResult.errors.length > 0 ? analysisResult.errors : undefined,
      }),
      scripts, // Additional story metadata
    })
  } catch (error) {
    return Response.json(
      buildErrorResponse({
        mode: 'story',
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
    endpoint: '/api/terminal/story',
    method: 'POST',
    description: 'Build single-game narratives (SGP). Returns Alert[] (unified contract) + scripts metadata.',
    schema: {
      matchup: 'string - e.g., "SF @ SEA"',
      signals: 'string[]? - normalized signal tags',
      anchor: 'string? - market focus (e.g., "Over 44.5")',
      options: {
        max_stories: 'number (1-3, default: 2)',
        legs_per_story: '{ min: 2-4, max: 4-8 }',
      },
    },
    response: {
      alerts: 'Alert[] - story legs with narrative context',
      scripts: 'Script[] - correlated parlay structures',
      mode: '"story"',
      matchup: '{ home, away }',
      agents: '{ invoked, silent }',
      provenance: 'object',
    },
  })
}
