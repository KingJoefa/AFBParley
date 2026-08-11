/**
 * Terminal Command Parser
 *
 * Parses user input into structured commands for the terminal.
 */

import { NFL_TEAM_CODES, normalizeTeamCode } from '@/lib/nfl/teams'

export type CommandType = 'matchup' | 'build' | 'bet' | 'help' | 'theme' | 'retry' | 'clear' | 'unknown'

export interface ParsedCommand {
  type: CommandType
  raw: string
  args: string[]
  flags: Record<string, string | boolean>
}

// Matchup patterns
const MATCHUP_AT_PATTERN = /^([a-zA-Z0-9]+)\s*@\s*([a-zA-Z0-9]+)$/
const MATCHUP_VS_PATTERN = /^([a-zA-Z0-9]+)\s+vs\.?\s+([a-zA-Z0-9]+)$/i

/**
 * Normalize team name to abbreviation
 */
export function normalizeTeam(team: string): string {
  const trimmed = team.trim()
  return normalizeTeamCode(trimmed) ?? trimmed.toUpperCase()
}

/**
 * Parse flags from args array
 * e.g., ["--raw", "--max", "3"] -> { raw: true, max: "3" }
 */
function parseFlags(args: string[]): { cleanArgs: string[]; flags: Record<string, string | boolean> } {
  const flags: Record<string, string | boolean> = {}
  const cleanArgs: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const nextArg = args[i + 1]

      // Check if next arg is a value (doesn't start with -)
      if (nextArg && !nextArg.startsWith('-')) {
        flags[key] = nextArg
        i++ // Skip the value
      } else {
        flags[key] = true
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1)
      flags[key] = true
    } else {
      cleanArgs.push(arg)
    }
  }

  return { cleanArgs, flags }
}

/**
 * Try to parse input as a matchup
 */
function parseMatchup(input: string): { away: string; home: string } | null {
  // Try @ format: "SF @ SEA" or "49ers @ Seahawks"
  const atMatch = input.match(MATCHUP_AT_PATTERN)
  if (atMatch) {
    return {
      away: normalizeTeam(atMatch[1]),
      home: normalizeTeam(atMatch[2]),
    }
  }

  // Try vs format: "SF vs SEA" (first team away, second home - consistent with @)
  const vsMatch = input.match(MATCHUP_VS_PATTERN)
  if (vsMatch) {
    return {
      away: normalizeTeam(vsMatch[1]),
      home: normalizeTeam(vsMatch[2]),
    }
  }

  return null
}

/**
 * Parse a command string into structured format
 */
export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim()

  if (!trimmed) {
    return { type: 'unknown', raw: '', args: [], flags: {} }
  }

  const parts = trimmed.split(/\s+/)
  const firstWord = parts[0].toLowerCase()
  const restParts = parts.slice(1)
  const { cleanArgs, flags } = parseFlags(restParts)

  // Check explicit commands first
  switch (firstWord) {
    case 'build':
      return { type: 'build', raw: trimmed, args: cleanArgs, flags }

    case 'bet':
      return { type: 'bet', raw: trimmed, args: cleanArgs, flags }

    case 'help':
    case '?':
      return { type: 'help', raw: trimmed, args: cleanArgs, flags }

    case 'theme':
      return { type: 'theme', raw: trimmed, args: cleanArgs, flags }

    case 'retry':
      return { type: 'retry', raw: trimmed, args: [], flags }

    case 'clear':
    case 'cls':
      return { type: 'clear', raw: trimmed, args: [], flags }
  }

  // Check if it's a matchup
  const matchup = parseMatchup(trimmed)
  if (matchup) {
    return {
      type: 'matchup',
      raw: trimmed,
      args: [matchup.away, matchup.home],
      flags: {},
    }
  }

  // Unknown command
  return { type: 'unknown', raw: trimmed, args: parts, flags }
}

/**
 * Get help text for commands
 */
export function getHelpText(): string {
  return `
Available Commands
──────────────────────────────────────────────────

  [matchup]       Select game and trigger agent scan
                  Examples: SF @ SEA, 49ers @ Seahawks, Chiefs vs Raiders

  build           Generate correlated parlay scripts from alerts
                  Flags: --max <n> (max legs), --raw (skip LLM)

  bet [prop]      Generate prop ladder with agent commentary
                  Examples: bet, bet chase receptions

  help            Show this help message

  theme [team]    Switch color theme to team colors
                  Examples: theme SF, theme Seahawks

  retry           Re-run the last command

  clear           Clear the terminal output

──────────────────────────────────────────────────
`.trim()
}

/**
 * Validate a matchup command
 */
export function validateMatchup(away: string, home: string): { valid: boolean; error?: string } {
  const validTeams = new Set<string>(NFL_TEAM_CODES)

  if (!validTeams.has(away)) {
    return { valid: false, error: `Unknown team: ${away}` }
  }
  if (!validTeams.has(home)) {
    return { valid: false, error: `Unknown team: ${home}` }
  }
  if (away === home) {
    return { valid: false, error: 'Away and home team cannot be the same' }
  }

  return { valid: true }
}
