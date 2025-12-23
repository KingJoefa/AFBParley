export const teamNameToCode: Record<string, string> = {
	'Arizona Cardinals': 'ARI',
	'Atlanta Falcons': 'ATL',
	'Baltimore Ravens': 'BAL',
	'Buffalo Bills': 'BUF',
	'Carolina Panthers': 'CAR',
	'Chicago Bears': 'CHI',
	'Cincinnati Bengals': 'CIN',
	'Cleveland Browns': 'CLE',
	'Dallas Cowboys': 'DAL',
	'Denver Broncos': 'DEN',
	'Detroit Lions': 'DET',
	'Green Bay Packers': 'GB',
	'Houston Texans': 'HOU',
	'Indianapolis Colts': 'IND',
	'Jacksonville Jaguars': 'JAX',
	'Kansas City Chiefs': 'KC',
	'Las Vegas Raiders': 'LV',
	'Los Angeles Chargers': 'LAC',
	'Los Angeles Rams': 'LA',
	'Miami Dolphins': 'MIA',
	'Minnesota Vikings': 'MIN',
	'New England Patriots': 'NE',
	'New Orleans Saints': 'NO',
	'New York Giants': 'NYG',
	'New York Jets': 'NYJ',
	'Philadelphia Eagles': 'PHI',
	'Pittsburgh Steelers': 'PIT',
	'San Francisco 49ers': 'SF',
	'Seattle Seahawks': 'SEA',
	'Tampa Bay Buccaneers': 'TB',
	'Tennessee Titans': 'TEN',
	'Washington Commanders': 'WAS',
	'Arizona': 'ARI','Atlanta': 'ATL','Baltimore': 'BAL','Buffalo': 'BUF','Carolina': 'CAR','Chicago': 'CHI',
	'Cincinnati': 'CIN','Cleveland': 'CLE','Dallas': 'DAL','Denver': 'DEN','Detroit': 'DET','Green Bay': 'GB',
	'Houston': 'HOU','Indianapolis': 'IND','Jacksonville': 'JAX','Kansas City': 'KC','Las Vegas': 'LV',
	'LA Chargers': 'LAC','Los Angeles Chargers': 'LAC','LA Rams': 'LA','Los Angeles Rams': 'LA','Miami': 'MIA',
	'Minnesota': 'MIN','New England': 'NE','New Orleans': 'NO','NY Giants': 'NYG','NY Jets': 'NYJ',
	'Philadelphia': 'PHI','Pittsburgh': 'PIT','San Francisco': 'SF','Seattle': 'SEA','Tampa Bay': 'TB','Tennessee': 'TEN','Washington': 'WAS'
}

export function extractTeamCodesFromMatchup(matchup: string): Set<string> {
	const codes = new Set<string>()
	// Split on common separators like "@", "vs", "v.", or "at" (case-insensitive)
	const parts = matchup.split(/\s*(?:@|vs\.?|v\.?|at)\s*/i).map(p => p.trim())
	for (const [name, code] of Object.entries(teamNameToCode)) {
		for (const token of parts) {
			if (token && (token === name || token.includes(name) || name.includes(token))) {
				codes.add(code)
			}
		}
	}
	return codes
}


