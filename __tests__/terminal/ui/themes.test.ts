import { describe, it, expect } from 'vitest'
import {
  TEAM_THEMES,
  DEFAULT_THEME,
  getTeamTheme,
  getThemeVars,
} from '@/lib/terminal/ui'

describe('TEAM_THEMES', () => {
  it('has all 32 NFL teams', () => {
    const expectedTeams = [
      // NFC West
      'SF', 'SEA', 'ARI', 'LAR',
      // NFC North
      'CHI', 'DET', 'GB', 'MIN',
      // NFC East
      'DAL', 'PHI', 'NYG', 'WAS',
      // NFC South
      'ATL', 'CAR', 'NO', 'TB',
      // AFC West
      'KC', 'LV', 'DEN', 'LAC',
      // AFC North
      'BAL', 'CIN', 'CLE', 'PIT',
      // AFC South
      'HOU', 'IND', 'JAX', 'TEN',
      // AFC East
      'BUF', 'MIA', 'NE', 'NYJ',
    ]

    expect(Object.keys(TEAM_THEMES)).toHaveLength(32)

    for (const team of expectedTeams) {
      expect(TEAM_THEMES[team]).toBeDefined()
      expect(TEAM_THEMES[team].abbreviation).toBe(team)
    }
  })

  it('each team has required color properties', () => {
    for (const [abbr, theme] of Object.entries(TEAM_THEMES)) {
      expect(theme.name).toBeDefined()
      expect(theme.abbreviation).toBe(abbr)
      expect(theme.primary).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(theme.accent).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(theme.secondary).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('has correct colors for 49ers', () => {
    const sf = TEAM_THEMES.SF
    expect(sf.name).toBe('49ers')
    expect(sf.primary).toBe('#AA0000')
    expect(sf.accent).toBe('#B3995D')
  })

  it('has correct colors for Seahawks', () => {
    const sea = TEAM_THEMES.SEA
    expect(sea.name).toBe('Seahawks')
    expect(sea.primary).toBe('#002244')
    expect(sea.accent).toBe('#69BE28')
  })
})

describe('DEFAULT_THEME', () => {
  it('has Swantail branding', () => {
    expect(DEFAULT_THEME.name).toBe('Swantail')
    expect(DEFAULT_THEME.abbreviation).toBe('SWT')
  })

  it('has dark terminal colors', () => {
    expect(DEFAULT_THEME.primary).toBe('#0A0A0A')
    expect(DEFAULT_THEME.accent).toBe('#00FF88')
  })
})

describe('getTeamTheme', () => {
  it('returns team theme for valid abbreviation', () => {
    const theme = getTeamTheme('SF')
    expect(theme.name).toBe('49ers')
    expect(theme.abbreviation).toBe('SF')
  })

  it('handles lowercase abbreviations', () => {
    const theme = getTeamTheme('sea')
    expect(theme.name).toBe('Seahawks')
  })

  it('returns default theme for unknown team', () => {
    const theme = getTeamTheme('XXX')
    expect(theme).toEqual(DEFAULT_THEME)
  })

  it('returns default theme for empty string', () => {
    const theme = getTeamTheme('')
    expect(theme).toEqual(DEFAULT_THEME)
  })
})

describe('getThemeVars', () => {
  it('returns CSS variable object', () => {
    const vars = getThemeVars(TEAM_THEMES.SF)

    expect(vars['--terminal-bg']).toBe(TEAM_THEMES.SF.secondary)
    expect(vars['--terminal-primary']).toBe(TEAM_THEMES.SF.primary)
    expect(vars['--terminal-accent']).toBe(TEAM_THEMES.SF.accent)
  })

  it('includes all required CSS variables', () => {
    const vars = getThemeVars(DEFAULT_THEME)

    expect(vars).toHaveProperty('--terminal-bg')
    expect(vars).toHaveProperty('--terminal-primary')
    expect(vars).toHaveProperty('--terminal-accent')
    expect(vars).toHaveProperty('--terminal-text')
    expect(vars).toHaveProperty('--terminal-muted')
    expect(vars).toHaveProperty('--terminal-success')
    expect(vars).toHaveProperty('--terminal-warning')
    expect(vars).toHaveProperty('--terminal-error')
  })

  it('returns valid hex colors', () => {
    const vars = getThemeVars(TEAM_THEMES.KC)

    for (const value of Object.values(vars)) {
      expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})
