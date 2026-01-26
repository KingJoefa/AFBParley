/**
 * Injury Agent
 *
 * Parses curated injury reports from Notes JSON to identify material absences.
 * Emits structured findings for QB unavailable, skill player unavailable, etc.
 *
 * Source: Notes JSON (data/notes/{year}-wk{week}.json)
 * Source Type: notes
 */

import type { AgentType } from '../../schemas'
import type {
  InjuryFinding,
  InjuryFindingType,
  InjuryPosition,
  InjuryDesignation,
  InjuryPayload,
  Implication,
} from '../../schemas/finding'
import { INJURY_IMPLICATIONS } from '../../schemas/finding'
import { createLogger } from '@/lib/logger'

const log = createLogger('InjuryAgent')
const AGENT: AgentType = 'injury'

// =============================================================================
// Thresholds
// =============================================================================

export const INJURY_THRESHOLDS = {
  // Statuses that indicate player is definitely not playing
  material_statuses: ['OUT', 'DOUBTFUL'] as const,

  // Positions where ANY unavailability is material
  always_material: ['QB'] as const,

  // Positions where unavailability is material only for starters/rotation players
  conditional_material: ['RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB'] as const,
} as const

// =============================================================================
// Types
// =============================================================================

interface InjuryEntry {
  player: string
  status: string
  position?: string
  designation?: string
  practice_status?: string
}

interface InjuryContext {
  homeTeam: string
  awayTeam: string
  injuries: Record<string, string[]>
  dataTimestamp: number
  dataVersion: string
}

// =============================================================================
// Parsing Helpers
// =============================================================================

/**
 * Parse injury status from string (e.g., "OUT", "Doubtful", "Questionable")
 */
function parseStatus(statusStr: string): InjuryPayload['status'] {
  const normalized = statusStr.toUpperCase().trim()
  if (normalized.includes('OUT')) return 'OUT'
  if (normalized.includes('DOUBTFUL')) return 'DOUBTFUL'
  if (normalized.includes('QUESTIONABLE')) return 'QUESTIONABLE'
  if (normalized.includes('PROBABLE')) return 'PROBABLE'
  return 'ACTIVE'
}

/**
 * Parse position from string
 */
function parsePosition(posStr: string | undefined): InjuryPosition | null {
  if (!posStr) return null
  const normalized = posStr.toUpperCase().trim()

  // Handle position aliases
  const positionMap: Record<string, InjuryPosition> = {
    'QB': 'QB',
    'RB': 'RB', 'HB': 'RB', 'FB': 'RB',
    'WR': 'WR',
    'TE': 'TE',
    'OT': 'OL', 'OG': 'OL', 'C': 'OL', 'OL': 'OL', 'T': 'OL', 'G': 'OL',
    'DE': 'DL', 'DT': 'DL', 'NT': 'DL', 'DL': 'DL',
    'LB': 'LB', 'ILB': 'LB', 'OLB': 'LB', 'MLB': 'LB',
    'CB': 'CB',
    'S': 'S', 'FS': 'S', 'SS': 'S',
    'K': 'K', 'PK': 'K',
    'P': 'P',
  }

  return positionMap[normalized] || null
}

/**
 * Parse designation (starter/rotation/depth/unknown)
 */
function parseDesignation(desStr: string | undefined): InjuryDesignation {
  if (!desStr) return 'unknown'
  const normalized = desStr.toLowerCase().trim()

  if (normalized.includes('starter') || normalized.includes('start')) return 'starter'
  if (normalized.includes('rotation') || normalized.includes('rotate')) return 'rotation'
  if (normalized.includes('depth') || normalized.includes('backup')) return 'depth'
  return 'unknown'
}

/**
 * Parse injury entry from raw string
 * Expected formats:
 * - "Patrick Mahomes (QB) - OUT"
 * - "Travis Kelce OUT"
 * - "QB Patrick Mahomes - Doubtful (knee)"
 */
function parseInjuryString(injuryStr: string): InjuryEntry | null {
  // Extract status
  const statusMatch = injuryStr.match(/(OUT|DOUBTFUL|QUESTIONABLE|PROBABLE)/i)
  const status = statusMatch ? statusMatch[1].toUpperCase() : null

  if (!status) return null

  // Extract position (look for common position abbreviations in parentheses or before name)
  const posMatch = injuryStr.match(/\b(QB|RB|HB|FB|WR|TE|OT|OG|C|OL|DE|DT|NT|DL|LB|ILB|OLB|MLB|CB|S|FS|SS|K|PK|P)\b/i)
  const position = posMatch ? posMatch[1].toUpperCase() : undefined

  // Extract player name (everything before the status or position, cleaned up)
  let playerName = injuryStr
    .replace(/(OUT|DOUBTFUL|QUESTIONABLE|PROBABLE)/gi, '')
    .replace(/\(.*?\)/g, '') // Remove parenthetical content
    .replace(/\s*-\s*/g, ' ')
    .replace(new RegExp(`\\b${position}\\b`, 'i'), '') // Remove position
    .trim()

  // Clean up common suffixes
  playerName = playerName.replace(/\s*(knee|ankle|hamstring|back|shoulder|concussion|illness|personal).*$/i, '').trim()

  if (!playerName || playerName.length < 2) return null

  return {
    player: playerName,
    status,
    position,
  }
}

// =============================================================================
// Firing Rules
// =============================================================================

/**
 * Determine if an injury is material (affects betting implications)
 *
 * Firing rules:
 * - (status in material_statuses) AND
 * - (position in always_material) OR
 * - (position in conditional_material AND designation in ['starter', 'rotation'])
 */
function isMaterialInjury(
  status: InjuryPayload['status'],
  position: InjuryPosition | null,
  designation: InjuryDesignation
): boolean {
  // Check if status is material
  if (!INJURY_THRESHOLDS.material_statuses.includes(status as typeof INJURY_THRESHOLDS.material_statuses[number])) {
    return false
  }

  if (!position) {
    // Unknown position - only material if we have explicit designation
    return designation === 'starter'
  }

  // QB is always material when OUT/DOUBTFUL
  if ((INJURY_THRESHOLDS.always_material as readonly string[]).includes(position)) {
    return true
  }

  // Other positions only material if starter/rotation AND we know the designation
  if ((INJURY_THRESHOLDS.conditional_material as readonly string[]).includes(position)) {
    return designation === 'starter' || designation === 'rotation'
  }

  return false
}

/**
 * Map position to finding type
 */
function getFindingType(position: InjuryPosition | null): InjuryFindingType {
  if (!position) return 'skill_player_unavailable'

  switch (position) {
    case 'QB':
      return 'qb_unavailable'
    case 'OL':
      return 'oline_unavailable'
    case 'DL':
    case 'LB':
    case 'CB':
    case 'S':
      return 'defensive_playmaker_unavailable'
    default:
      return 'skill_player_unavailable'
  }
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Run the Injury agent against Notes-based injury data
 */
export function checkInjuryThresholds(context: InjuryContext): InjuryFinding[] {
  const findings: InjuryFinding[] = []

  if (!context.injuries || Object.keys(context.injuries).length === 0) {
    log.debug('No injury data provided')
    return findings
  }

  // Process each team's injuries
  for (const [team, injuryList] of Object.entries(context.injuries)) {
    for (const injuryStr of injuryList) {
      const entry = parseInjuryString(injuryStr)
      if (!entry) continue

      const status = parseStatus(entry.status)
      const position = parsePosition(entry.position)
      const designation = parseDesignation(entry.designation)

      // Check firing rules
      if (!isMaterialInjury(status, position, designation)) {
        log.debug(`Skipping non-material injury: ${entry.player} (${status}, ${position || 'unknown'}, ${designation})`)
        continue
      }

      const findingType = getFindingType(position)
      const implications = INJURY_IMPLICATIONS[findingType]

      const payload: InjuryPayload = {
        status,
        practice_status: entry.practice_status,
        player: entry.player,
        team,
        position: position || 'WR', // Default to WR if unknown (skill player)
        designation,
      }

      findings.push({
        id: `injury-${team.toLowerCase()}-${entry.player.toLowerCase().replace(/\s+/g, '-')}-${context.dataTimestamp}`,
        agent: AGENT,
        scope: 'player',
        metric: 'player_status',
        value: status,
        thresholds: [
          {
            key: 'status',
            operator: 'in',
            value: [...INJURY_THRESHOLDS.material_statuses],
            met: true,
          },
        ],
        comparison_context: `${entry.player} (${position || 'unknown'}) is ${status}`,
        confidence: status === 'OUT' ? 0.95 : 0.75, // Higher confidence for OUT than DOUBTFUL
        source_ref: `notes://injuries/${team}`,
        source_type: 'notes',
        source_timestamp: context.dataTimestamp,
        implication: implications[0], // Primary implication
        finding_type: findingType,
        payload,
        // Legacy fields for compatibility
        type: findingType,
        stat: 'player_status',
        value_str: status,
        value_type: 'string',
        threshold_met: `status in [${INJURY_THRESHOLDS.material_statuses.join(', ')}]`,
      } as InjuryFinding)

      log.debug(`Found material injury: ${entry.player} (${findingType})`)
    }
  }

  return findings
}

/**
 * Get all implications for the injury agent
 */
export function getInjuryImplications(findingType: InjuryFindingType): Implication[] {
  return INJURY_IMPLICATIONS[findingType]
}
