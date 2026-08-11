const TEAM_DEFINITIONS = [
  { code: 'ARI', name: 'Arizona Cardinals', aliases: ['Arizona', 'Cardinals'] },
  { code: 'ATL', name: 'Atlanta Falcons', aliases: ['Atlanta', 'Falcons'] },
  { code: 'BAL', name: 'Baltimore Ravens', aliases: ['Baltimore', 'Ravens'] },
  { code: 'BUF', name: 'Buffalo Bills', aliases: ['Buffalo', 'Bills'] },
  { code: 'CAR', name: 'Carolina Panthers', aliases: ['Carolina', 'Panthers'] },
  { code: 'CHI', name: 'Chicago Bears', aliases: ['Chicago', 'Bears'] },
  { code: 'CIN', name: 'Cincinnati Bengals', aliases: ['Cincinnati', 'Bengals'] },
  { code: 'CLE', name: 'Cleveland Browns', aliases: ['Cleveland', 'Browns'] },
  { code: 'DAL', name: 'Dallas Cowboys', aliases: ['Dallas', 'Cowboys'] },
  { code: 'DEN', name: 'Denver Broncos', aliases: ['Denver', 'Broncos'] },
  { code: 'DET', name: 'Detroit Lions', aliases: ['Detroit', 'Lions'] },
  { code: 'GB', name: 'Green Bay Packers', aliases: ['Green Bay', 'Packers'] },
  { code: 'HOU', name: 'Houston Texans', aliases: ['Houston', 'Texans'] },
  { code: 'IND', name: 'Indianapolis Colts', aliases: ['Indianapolis', 'Colts'] },
  { code: 'JAX', name: 'Jacksonville Jaguars', aliases: ['Jacksonville', 'Jaguars', 'Jags'] },
  { code: 'KC', name: 'Kansas City Chiefs', aliases: ['Kansas City', 'Chiefs'] },
  { code: 'LV', name: 'Las Vegas Raiders', aliases: ['Las Vegas', 'Raiders'] },
  { code: 'LAC', name: 'Los Angeles Chargers', aliases: ['LA Chargers', 'Chargers'] },
  { code: 'LAR', name: 'Los Angeles Rams', aliases: ['LA Rams', 'Rams', 'LA'] },
  { code: 'MIA', name: 'Miami Dolphins', aliases: ['Miami', 'Dolphins', 'Fins'] },
  { code: 'MIN', name: 'Minnesota Vikings', aliases: ['Minnesota', 'Vikings'] },
  { code: 'NE', name: 'New England Patriots', aliases: ['New England', 'Patriots', 'Pats'] },
  { code: 'NO', name: 'New Orleans Saints', aliases: ['New Orleans', 'Saints'] },
  { code: 'NYG', name: 'New York Giants', aliases: ['NY Giants', 'Giants'] },
  { code: 'NYJ', name: 'New York Jets', aliases: ['NY Jets', 'Jets'] },
  { code: 'PHI', name: 'Philadelphia Eagles', aliases: ['Philadelphia', 'Eagles'] },
  { code: 'PIT', name: 'Pittsburgh Steelers', aliases: ['Pittsburgh', 'Steelers'] },
  { code: 'SF', name: 'San Francisco 49ers', aliases: ['San Francisco', '49ers', 'Niners'] },
  { code: 'SEA', name: 'Seattle Seahawks', aliases: ['Seattle', 'Seahawks'] },
  { code: 'TB', name: 'Tampa Bay Buccaneers', aliases: ['Tampa Bay', 'Buccaneers', 'Bucs'] },
  { code: 'TEN', name: 'Tennessee Titans', aliases: ['Tennessee', 'Titans'] },
  { code: 'WAS', name: 'Washington Commanders', aliases: ['Washington', 'Commanders'] },
] as const

export type TeamCode = (typeof TEAM_DEFINITIONS)[number]['code']

export type ParsedMatchup = {
  awayTeam: TeamCode
  homeTeam: TeamCode
}

const TEAM_CODES = new Set<string>(TEAM_DEFINITIONS.map(team => team.code))

function normalizeAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.'-]/g, '')
    .replace(/\s+/g, ' ')
}

const aliasesToCode = new Map<string, TeamCode>()

for (const team of TEAM_DEFINITIONS) {
  for (const alias of [team.code, team.name, ...team.aliases]) {
    aliasesToCode.set(normalizeAlias(alias), team.code)
  }
}

export const NFL_TEAM_CODES = TEAM_DEFINITIONS.map(team => team.code) as readonly TeamCode[]

export const teamNameToCode: Record<string, TeamCode> = Object.fromEntries(
  TEAM_DEFINITIONS.flatMap(team => [
    [team.code, team.code],
    [team.name, team.code],
    ...team.aliases.map(alias => [alias, team.code]),
  ]),
) as Record<string, TeamCode>

export function isTeamCode(value: string): value is TeamCode {
  return TEAM_CODES.has(value)
}

export function normalizeTeamCode(value: string | null | undefined): TeamCode | null {
  if (!value) return null
  return aliasesToCode.get(normalizeAlias(value)) ?? null
}

export function getTeamDisplayName(code: TeamCode): string {
  return TEAM_DEFINITIONS.find(team => team.code === code)?.name ?? code
}

/** Treats the first team as away and the second as home for every supported separator. */
export function parseMatchup(matchup: string): ParsedMatchup | null {
  const parts = matchup
    .split(/\s*(?:@|\bat\b|\bvs?\.?(?=\s|$))\s*/i)
    .map(part => part.trim())
    .filter(Boolean)

  if (parts.length !== 2) return null

  const awayTeam = normalizeTeamCode(parts[0])
  const homeTeam = normalizeTeamCode(parts[1])
  if (!awayTeam || !homeTeam || awayTeam === homeTeam) return null

  return { awayTeam, homeTeam }
}

export function extractTeamCodesFromMatchup(matchup: string): Set<TeamCode> {
  const parsed = parseMatchup(matchup)
  return parsed ? new Set([parsed.awayTeam, parsed.homeTeam]) : new Set()
}
