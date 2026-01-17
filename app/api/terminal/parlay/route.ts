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
  type Script,
  type Leg,
} from '@/lib/terminal/schemas'
import type { Alert, Finding, AgentType } from '@/lib/terminal/schemas'
import { createHash } from 'crypto'
import { isActionEnabled } from '@/lib/terminal/feature-flags'

/**
 * /api/terminal/parlay
 *
 * PARLAY: Cross-game portfolio constructor.
 * Consumes PROP across multiple games to build diversified parlay sets.
 *
 * Constraints:
 *   - 1 leg per game
 *   - 6-7 legs total
 *   - Max 2-3 high-exposure legs
 *   - Optional negative-correlation pairings (later iteration)
 */

const ParlayRequestSchema = z.object({
  matchups: z.array(z.string().min(3)).min(2).max(10),
  signals: z.array(z.string()).optional(),
  options: z.object({
    legs_target: z.number().min(4).max(10).default(6),
    max_high_exposure: z.number().min(1).max(4).default(2),
    include_negative_correlation: z.boolean().default(false),
  }).optional(),
})

type ParlayRequest = z.infer<typeof ParlayRequestSchema>

// Team name mappings (shared with scan/prop/story)
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
): Promise<{ context: MatchupContext; gameNotes?: GameNotesContext }> {
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
    gameNotes: gameNotes?.notes,
    injuries: gameNotes?.injuries,
    keyMatchups: gameNotes?.keyMatchups,
    totals: gameNotes?.totals,
    spread: gameNotes?.spread,
  }

  return { context, gameNotes }
}

/**
 * Filter findings to player prop-relevant findings (same as PROP)
 */
function filterToPropFindings(findings: Finding[]): Finding[] {
  const PROP_AGENTS = ['wr', 'te', 'hb', 'qb']
  return findings.filter(f => PROP_AGENTS.includes(f.agent))
}

/**
 * Per-game alert pool with game identifier
 */
interface GameAlertPool {
  gameKey: string
  homeTeam: string
  awayTeam: string
  alerts: Alert[]
  agentsInvoked: AgentType[]
  agentsSilent: AgentType[]
}

/**
 * Select best leg from a game based on edge strength and exposure cap
 */
function selectBestLeg(
  alerts: Alert[],
  highExposureCount: number,
  maxHighExposure: number
): Alert | null {
  if (alerts.length === 0) return null

  // Sort by confidence (edge strength)
  const sorted = [...alerts].sort((a, b) => b.confidence - a.confidence)

  // If we can still add high-exposure legs, prefer them
  if (highExposureCount < maxHighExposure) {
    const highSeverity = sorted.find(a => a.severity === 'high')
    if (highSeverity) return highSeverity
  }

  // Otherwise, prefer medium severity (safer)
  const mediumSeverity = sorted.find(a => a.severity === 'medium')
  if (mediumSeverity) return mediumSeverity

  // Fallback to best available
  return sorted[0]
}

/**
 * Build parlay sets with different risk profiles
 */
function buildParlaySets(
  pools: GameAlertPool[],
  legsTarget: number,
  maxHighExposure: number
): { conservative: Alert[]; moderate: Alert[]; aggressive: Alert[] } {
  const result = {
    conservative: [] as Alert[],
    moderate: [] as Alert[],
    aggressive: [] as Alert[],
  }

  // Shuffle pools for diversity across profiles
  const shuffledPools = [...pools].sort(() => Math.random() - 0.5)

  // Conservative: prioritize medium severity, avoid high exposure
  let highCount = 0
  for (const pool of shuffledPools) {
    if (result.conservative.length >= legsTarget) break
    const mediumAlerts = pool.alerts.filter(a => a.severity === 'medium')
    const sorted = [...mediumAlerts].sort((a, b) => b.confidence - a.confidence)
    if (sorted[0]) {
      result.conservative.push(sorted[0])
    }
  }

  // Moderate: balanced selection
  highCount = 0
  const usedModerateGames = new Set<string>()
  for (const pool of pools.sort((a, b) => {
    const maxA = Math.max(...a.alerts.map(alert => alert.confidence))
    const maxB = Math.max(...b.alerts.map(alert => alert.confidence))
    return maxB - maxA
  })) {
    if (result.moderate.length >= legsTarget) break
    if (usedModerateGames.has(pool.gameKey)) continue

    const selected = selectBestLeg(pool.alerts, highCount, maxHighExposure)
    if (selected) {
      result.moderate.push(selected)
      usedModerateGames.add(pool.gameKey)
      if (selected.severity === 'high') highCount++
    }
  }

  // Aggressive: prioritize high severity
  highCount = 0
  const usedAggressiveGames = new Set<string>()
  for (const pool of pools.sort((a, b) => {
    const highA = a.alerts.filter(alert => alert.severity === 'high').length
    const highB = b.alerts.filter(alert => alert.severity === 'high').length
    return highB - highA
  })) {
    if (result.aggressive.length >= legsTarget) break
    if (usedAggressiveGames.has(pool.gameKey)) continue

    const highAlerts = pool.alerts.filter(a => a.severity === 'high')
    const sorted = [...highAlerts].sort((a, b) => b.confidence - a.confidence)
    const selected = sorted[0] || pool.alerts.sort((a, b) => b.confidence - a.confidence)[0]
    if (selected) {
      result.aggressive.push(selected)
      usedAggressiveGames.add(pool.gameKey)
    }
  }

  return result
}

/**
 * Build Script structure for a parlay set
 */
function buildParlayScript(
  alerts: Alert[],
  riskLevel: 'conservative' | 'moderate' | 'aggressive',
  index: number
): Script {
  const legs: Leg[] = alerts.map(alert => ({
    alert_id: alert.id,
    market: alert.claim.substring(0, 50),
    implied_probability: 1 - alert.confidence,
    correlation_factor: 0, // Cross-game, minimal correlation
    agent: alert.agent,
  }))

  const combinedConfidence = Math.pow(
    alerts.reduce((acc, a) => acc * a.confidence, 1),
    1 / alerts.length
  )

  const provenanceData = alerts.map(a => a.id).join(',') + riskLevel
  const provenanceHash = createHash('md5').update(provenanceData).digest('hex').substring(0, 8)

  const riskLabels = {
    conservative: 'Conservative Cross-Game',
    moderate: 'Balanced Cross-Game',
    aggressive: 'Aggressive Cross-Game',
  }

  return {
    id: `parlay-${index + 1}`,
    name: `${riskLabels[riskLevel]} Parlay`,
    legs,
    correlation_type: 'game_script', // Cross-game uses game_script as generic
    correlation_explanation: `Cross-game parlay with ${alerts.length} legs across different matchups. ${
      riskLevel === 'conservative'
        ? 'Lower variance selection prioritizing medium-exposure plays.'
        : riskLevel === 'aggressive'
        ? 'Higher variance selection prioritizing high-edge plays.'
        : 'Balanced selection mixing exposure tiers.'
    }`,
    combined_confidence: combinedConfidence,
    risk_level: riskLevel,
    provenance_hash: provenanceHash,
  }
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  // Feature flag check
  if (!isActionEnabled('parlay')) {
    return Response.json(
      buildErrorResponse({
        mode: 'parlay',
        requestId,
        error: 'PARLAY action is currently disabled',
        recoverable: false,
      }),
      { status: 503 }
    )
  }

  try {
    const body = await req.json()
    const parsed = ParlayRequestSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        buildErrorResponse({
          mode: 'parlay',
          requestId,
          error: `Invalid request: ${parsed.error.message}`,
          recoverable: false,
        }),
        { status: 400 }
      )
    }

    const { matchups, signals, options } = parsed.data
    const legsTarget = options?.legs_target ?? 6
    const maxHighExposure = options?.max_high_exposure ?? 2

    // Parse all matchups
    const parsedMatchups = matchups.map(m => ({
      raw: m,
      parsed: parseMatchup(m),
    }))

    const invalidMatchups = parsedMatchups.filter(m => !m.parsed)
    if (invalidMatchups.length > 0) {
      return Response.json(
        buildErrorResponse({
          mode: 'parlay',
          requestId,
          error: `Invalid matchup format: ${invalidMatchups.map(m => m.raw).join(', ')}`,
          recoverable: false,
        }),
        { status: 400 }
      )
    }

    // Process each game to get alert pool
    const gamePools: GameAlertPool[] = []
    const allAgentsInvoked = new Set<AgentType>()
    const allAgentsSilent = new Set<AgentType>()
    const allFindings: Finding[] = []

    for (const { parsed: teams, raw } of parsedMatchups) {
      if (!teams) continue

      const gameKey = `${teams.awayTeam}@${teams.homeTeam}`
      const { context: matchupContext, gameNotes } = await loadMatchupContext(teams.homeTeam, teams.awayTeam)

      // Run agents
      const { findings, agentsInvoked, agentsSilent } = await runAgents(matchupContext)

      // Track agents
      agentsInvoked.forEach(a => allAgentsInvoked.add(a))
      agentsSilent.forEach(a => allAgentsSilent.add(a))

      // Filter to prop findings
      const propFindings = filterToPropFindings(findings)
      allFindings.push(...propFindings)

      if (propFindings.length === 0) {
        gamePools.push({
          gameKey,
          homeTeam: teams.homeTeam,
          awayTeam: teams.awayTeam,
          alerts: [],
          agentsInvoked,
          agentsSilent,
        })
        continue
      }

      // Analyze findings to get alerts (with game notes for context)
      const analysisResult = await analyzeFindings(propFindings, matchupContext.dataVersion, {}, gameNotes)

      gamePools.push({
        gameKey,
        homeTeam: teams.homeTeam,
        awayTeam: teams.awayTeam,
        alerts: analysisResult.alerts,
        agentsInvoked,
        agentsSilent,
      })
    }

    // Check if we have enough games with alerts
    const gamesWithAlerts = gamePools.filter(p => p.alerts.length > 0)
    if (gamesWithAlerts.length < 2) {
      const provenance = buildProvenance({
        requestId,
        prompt: '',
        skillMds: {},
        findings: allFindings,
        dataVersion: gamePools[0]?.alerts[0]?.sources[0]?.data_version ?? 'unknown',
        dataTimestamp: Date.now(),
        searchTimestamps: [],
        agentsInvoked: Array.from(allAgentsInvoked),
        agentsSilent: Array.from(allAgentsSilent),
        cacheHits: 0,
        cacheMisses: 0,
        llmModel: 'none',
        llmTemperature: 0,
      })

      return Response.json(
        buildEmptyResponse({
          mode: 'parlay',
          requestId,
          matchup: { home: 'MULTI', away: 'GAME' },
          agents: {
            invoked: Array.from(allAgentsInvoked),
            silent: Array.from(allAgentsSilent),
          },
          provenance,
          timingMs: Date.now() - startTime,
          message: `Insufficient game data for parlay. Only ${gamesWithAlerts.length} games have prop findings.`,
        })
      )
    }

    // Build parlay sets
    const parlaySets = buildParlaySets(gamesWithAlerts, legsTarget, maxHighExposure)

    // Build scripts from parlay sets
    const scripts: Script[] = []
    if (parlaySets.conservative.length >= 2) {
      scripts.push(buildParlayScript(parlaySets.conservative, 'conservative', 0))
    }
    if (parlaySets.moderate.length >= 2) {
      scripts.push(buildParlayScript(parlaySets.moderate, 'moderate', 1))
    }
    if (parlaySets.aggressive.length >= 2) {
      scripts.push(buildParlayScript(parlaySets.aggressive, 'aggressive', 2))
    }

    // Collect all alerts used in parlays
    const usedAlertIds = new Set<string>()
    for (const script of scripts) {
      for (const leg of script.legs) {
        usedAlertIds.add(leg.alert_id)
      }
    }

    const allAlerts = gamePools.flatMap(p => p.alerts)
    const parlayAlerts = allAlerts.filter(a => usedAlertIds.has(a.id))

    // Build provenance
    const provenance = buildProvenance({
      requestId,
      prompt: '',
      skillMds: {},
      findings: allFindings,
      dataVersion: gamePools[0]?.alerts[0]?.sources[0]?.data_version ?? 'unknown',
      dataTimestamp: Date.now(),
      searchTimestamps: [],
      agentsInvoked: Array.from(allAgentsInvoked),
      agentsSilent: Array.from(allAgentsSilent),
      cacheHits: 0,
      cacheMisses: 0,
      llmModel: 'gpt-4o-mini',
      llmTemperature: 0.2,
    })

    // Return response
    return Response.json({
      ...buildTerminalResponse({
        alerts: parlayAlerts,
        mode: 'parlay',
        requestId,
        matchup: { home: 'MULTI', away: 'GAME' },
        agents: {
          invoked: Array.from(allAgentsInvoked),
          silent: Array.from(allAgentsSilent),
        },
        provenance,
        timingMs: Date.now() - startTime,
      }),
      scripts,
      games_analyzed: parsedMatchups.length,
      games_with_props: gamesWithAlerts.length,
    })
  } catch (error) {
    return Response.json(
      buildErrorResponse({
        mode: 'parlay',
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
    endpoint: '/api/terminal/parlay',
    method: 'POST',
    description: 'Build cross-game parlay portfolios. Returns Alert[] (unified contract) + scripts metadata.',
    schema: {
      matchups: 'string[] - 2-10 matchups (e.g., ["SF @ SEA", "KC @ LV"])',
      signals: 'string[]? - normalized signal tags',
      options: {
        legs_target: 'number (4-10, default: 6)',
        max_high_exposure: 'number (1-4, default: 2)',
        include_negative_correlation: 'boolean (default: false)',
      },
    },
    response: {
      alerts: 'Alert[] - parlay legs across games',
      scripts: 'Script[] - parlay structures (conservative, moderate, aggressive)',
      games_analyzed: 'number',
      games_with_props: 'number',
      mode: '"parlay"',
      matchup: '{ home: "MULTI", away: "GAME" }',
      agents: '{ invoked, silent }',
      provenance: 'object',
    },
  })
}
