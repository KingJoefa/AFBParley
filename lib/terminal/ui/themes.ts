/**
 * Team Color Themes
 *
 * Each team has primary and accent colors for terminal theming.
 * Colors are applied dynamically based on the selected matchup.
 */

export interface TeamTheme {
  name: string
  abbreviation: string
  primary: string   // Main background/text color
  accent: string    // Highlight color
  secondary: string // Muted variant
}

export const TEAM_THEMES: Record<string, TeamTheme> = {
  // NFC West
  SF: {
    name: '49ers',
    abbreviation: 'SF',
    primary: '#AA0000',
    accent: '#B3995D',
    secondary: '#5E0000',
  },
  SEA: {
    name: 'Seahawks',
    abbreviation: 'SEA',
    primary: '#002244',
    accent: '#69BE28',
    secondary: '#001122',
  },
  ARI: {
    name: 'Cardinals',
    abbreviation: 'ARI',
    primary: '#97233F',
    accent: '#FFB612',
    secondary: '#4D1028',
  },
  LAR: {
    name: 'Rams',
    abbreviation: 'LAR',
    primary: '#003594',
    accent: '#FFD100',
    secondary: '#001A4A',
  },

  // NFC North
  CHI: {
    name: 'Bears',
    abbreviation: 'CHI',
    primary: '#0B162A',
    accent: '#C83803',
    secondary: '#050B15',
  },
  DET: {
    name: 'Lions',
    abbreviation: 'DET',
    primary: '#0076B6',
    accent: '#B0B7BC',
    secondary: '#003B5B',
  },
  GB: {
    name: 'Packers',
    abbreviation: 'GB',
    primary: '#203731',
    accent: '#FFB612',
    secondary: '#101B18',
  },
  MIN: {
    name: 'Vikings',
    abbreviation: 'MIN',
    primary: '#4F2683',
    accent: '#FFC62F',
    secondary: '#281342',
  },

  // NFC East
  DAL: {
    name: 'Cowboys',
    abbreviation: 'DAL',
    primary: '#002244',
    accent: '#B0B7BC',
    secondary: '#001122',
  },
  PHI: {
    name: 'Eagles',
    abbreviation: 'PHI',
    primary: '#004C54',
    accent: '#A5ACAF',
    secondary: '#00262A',
  },
  NYG: {
    name: 'Giants',
    abbreviation: 'NYG',
    primary: '#0B2265',
    accent: '#A71930',
    secondary: '#051133',
  },
  WAS: {
    name: 'Commanders',
    abbreviation: 'WAS',
    primary: '#5A1414',
    accent: '#FFB612',
    secondary: '#2D0A0A',
  },

  // NFC South
  ATL: {
    name: 'Falcons',
    abbreviation: 'ATL',
    primary: '#A71930',
    accent: '#A5ACAF',
    secondary: '#540C18',
  },
  CAR: {
    name: 'Panthers',
    abbreviation: 'CAR',
    primary: '#0085CA',
    accent: '#101820',
    secondary: '#004365',
  },
  NO: {
    name: 'Saints',
    abbreviation: 'NO',
    primary: '#101820',
    accent: '#D3BC8D',
    secondary: '#080C10',
  },
  TB: {
    name: 'Buccaneers',
    abbreviation: 'TB',
    primary: '#D50A0A',
    accent: '#34302B',
    secondary: '#6A0505',
  },

  // AFC West
  KC: {
    name: 'Chiefs',
    abbreviation: 'KC',
    primary: '#E31837',
    accent: '#FFB612',
    secondary: '#720C1C',
  },
  LV: {
    name: 'Raiders',
    abbreviation: 'LV',
    primary: '#000000',
    accent: '#A5ACAF',
    secondary: '#1A1A1A',
  },
  DEN: {
    name: 'Broncos',
    abbreviation: 'DEN',
    primary: '#002244',
    accent: '#FB4F14',
    secondary: '#001122',
  },
  LAC: {
    name: 'Chargers',
    abbreviation: 'LAC',
    primary: '#002A5E',
    accent: '#FFC20E',
    secondary: '#00152F',
  },

  // AFC North
  BAL: {
    name: 'Ravens',
    abbreviation: 'BAL',
    primary: '#241773',
    accent: '#9E7C0C',
    secondary: '#120B3A',
  },
  CIN: {
    name: 'Bengals',
    abbreviation: 'CIN',
    primary: '#FB4F14',
    accent: '#000000',
    secondary: '#7E280A',
  },
  CLE: {
    name: 'Browns',
    abbreviation: 'CLE',
    primary: '#311D00',
    accent: '#FF3C00',
    secondary: '#180E00',
  },
  PIT: {
    name: 'Steelers',
    abbreviation: 'PIT',
    primary: '#101820',
    accent: '#FFB612',
    secondary: '#080C10',
  },

  // AFC South
  HOU: {
    name: 'Texans',
    abbreviation: 'HOU',
    primary: '#03202F',
    accent: '#A71930',
    secondary: '#011018',
  },
  IND: {
    name: 'Colts',
    abbreviation: 'IND',
    primary: '#002C5F',
    accent: '#A5ACAF',
    secondary: '#001630',
  },
  JAX: {
    name: 'Jaguars',
    abbreviation: 'JAX',
    primary: '#006778',
    accent: '#D7A22A',
    secondary: '#00343C',
  },
  TEN: {
    name: 'Titans',
    abbreviation: 'TEN',
    primary: '#002244',
    accent: '#4B92DB',
    secondary: '#001122',
  },

  // AFC East
  BUF: {
    name: 'Bills',
    abbreviation: 'BUF',
    primary: '#00338D',
    accent: '#C60C30',
    secondary: '#001A47',
  },
  MIA: {
    name: 'Dolphins',
    abbreviation: 'MIA',
    primary: '#008E97',
    accent: '#FC4C02',
    secondary: '#00474C',
  },
  NE: {
    name: 'Patriots',
    abbreviation: 'NE',
    primary: '#002244',
    accent: '#C60C30',
    secondary: '#001122',
  },
  NYJ: {
    name: 'Jets',
    abbreviation: 'NYJ',
    primary: '#125740',
    accent: '#FFFFFF',
    secondary: '#092B20',
  },
}

// Default theme when no team is selected
export const DEFAULT_THEME: TeamTheme = {
  name: 'Swantail',
  abbreviation: 'SWT',
  primary: '#0A0A0A',
  accent: '#00FF88',
  secondary: '#1A1A1A',
}

/**
 * Get theme for a team abbreviation
 */
export function getTeamTheme(teamAbbr: string): TeamTheme {
  const normalized = teamAbbr.toUpperCase()
  return TEAM_THEMES[normalized] || DEFAULT_THEME
}

/**
 * Get CSS variables for a theme
 */
export function getThemeVars(theme: TeamTheme): Record<string, string> {
  return {
    '--terminal-bg': theme.secondary,
    '--terminal-primary': theme.primary,
    '--terminal-accent': theme.accent,
    '--terminal-text': '#E0E0E0',
    '--terminal-muted': '#808080',
    '--terminal-success': '#00FF88',
    '--terminal-warning': '#FFB612',
    '--terminal-error': '#FF4444',
  }
}

/**
 * Apply theme to document root
 */
export function applyTheme(theme: TeamTheme): void {
  const vars = getThemeVars(theme)
  const root = document.documentElement

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
}
