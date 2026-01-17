/**
 * Terminal UI Module
 *
 * Exports all UI-related utilities for the terminal interface.
 */

export {
  TEAM_THEMES,
  DEFAULT_THEME,
  getTeamTheme,
  getThemeVars,
  applyTheme,
  type TeamTheme,
} from './themes'

export {
  parseCommand,
  normalizeTeam,
  getHelpText,
  validateMatchup,
  type CommandType,
  type ParsedCommand,
} from './command-parser'
