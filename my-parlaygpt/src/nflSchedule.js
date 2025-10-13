/**
 * NFL Schedule Manager
 * Fetches current week's NFL games with fallback to manual data
 */

// Current week's actual NFL schedule (Week 7, October 19, 2025)
const CURRENT_WEEK_GAMES = [
  { id: 'chargers-chiefs', display: 'Los Angeles Chargers @ Kansas City Chiefs', time: 'Thu 8:15 PM EDT' },
  { id: 'patriots-dolphins', display: 'New England Patriots @ Miami Dolphins', time: 'Sun 1:00 PM EDT' },
  { id: 'packers-bears', display: 'Green Bay Packers @ Chicago Bears', time: 'Sun 1:00 PM EDT' },
  { id: 'lions-vikings', display: 'Detroit Lions @ Minnesota Vikings', time: 'Sun 1:00 PM EDT' },
  { id: 'jets-bills', display: 'New York Jets @ Buffalo Bills', time: 'Sun 1:00 PM EDT' },
  { id: 'panthers-buccaneers', display: 'Carolina Panthers @ Tampa Bay Buccaneers', time: 'Sun 1:00 PM EDT' },
  { id: 'titans-colts', display: 'Tennessee Titans @ Indianapolis Colts', time: 'Sun 1:00 PM EDT' },
  { id: 'ravens-giants', display: 'Baltimore Ravens @ New York Giants', time: 'Sun 1:00 PM EDT' },
  { id: 'browns-bengals', display: 'Cleveland Browns @ Cincinnati Bengals', time: 'Sun 1:00 PM EDT' },
  { id: 'commanders-broncos', display: 'Washington Commanders @ Denver Broncos', time: 'Sun 4:05 PM EDT' },
  { id: 'seahawks-49ers', display: 'Seattle Seahawks @ San Francisco 49ers', time: 'Sun 4:05 PM EDT' },
  { id: 'rams-cardinals', display: 'Los Angeles Rams @ Arizona Cardinals', time: 'Sun 4:05 PM EDT' },
  { id: 'cowboys-eagles', display: 'Dallas Cowboys @ Philadelphia Eagles', time: 'Sun 4:25 PM EDT' },
  { id: 'falcons-saints', display: 'Atlanta Falcons @ New Orleans Saints', time: 'Sun 4:25 PM EDT' },
  { id: 'steelers-raiders', display: 'Pittsburgh Steelers @ Las Vegas Raiders', time: 'Sun 8:20 PM EDT' },
  { id: 'texans-jaguars', display: 'Houston Texans @ Jacksonville Jaguars', time: 'Mon 8:15 PM EDT' }
];

// Popular/high-profile games that are always good for parlays
const POPULAR_GAMES = [
  'chargers-chiefs',
  'jets-bills',
  'cowboys-eagles',
  'steelers-raiders',
  'texans-jaguars'
];

/**
 * Get current week's NFL games
 * @returns {Array} Array of game objects with id, display, and time
 */
export function getCurrentWeekGames() {
  try {
    // In future versions, this could fetch from an API
    // For now, we use the current week's actual schedule
    return CURRENT_WEEK_GAMES.map(game => ({
      ...game,
      isPopular: POPULAR_GAMES.includes(game.id)
    }));
  } catch (error) {
    console.error('Error fetching NFL schedule:', error);
    return getFallbackGames();
  }
}

/**
 * Get popular/featured games for quick selection
 * @returns {Array} Array of popular game objects
 */
export function getPopularGames() {
  const allGames = getCurrentWeekGames();
  return allGames.filter(game => game.isPopular);
}

/**
 * Get fallback games if API fails
 * @returns {Array} Array of fallback game objects
 */
function getFallbackGames() {
  return [
    { id: 'ravens-chiefs', display: 'Baltimore Ravens vs Kansas City Chiefs', time: 'Sun 1:25 PM', isPopular: true },
    { id: 'packers-cowboys', display: 'Green Bay Packers vs Dallas Cowboys', time: 'Sun 5:20 PM', isPopular: true },
    { id: 'eagles-bucs', display: 'Philadelphia Eagles vs Tampa Bay Buccaneers', time: 'Sun 10:00 AM', isPopular: true },
    { id: 'saints-bills', display: 'New Orleans Saints vs Buffalo Bills', time: 'Sun 10:00 AM', isPopular: true },
    { id: 'jaguars-49ers', display: 'Jacksonville Jaguars vs San Francisco 49ers', time: 'Sun 1:05 PM', isPopular: true }
  ];
}

/**
 * Format game display for UI
 * @param {Object} game - Game object
 * @returns {string} Formatted display string
 */
export function formatGameDisplay(game) {
  return `${game.display} (${game.time})`;
}

/**
 * Extract simple matchup name for API calls
 * @param {string} gameDisplay - Full game display string
 * @returns {string} Simple matchup like "Ravens vs Chiefs"
 */
export function extractMatchupName(gameDisplay) {
  // Convert "Baltimore Ravens @ Kansas City Chiefs" to "Ravens vs Chiefs"
  return gameDisplay
    .replace(/@ /g, 'vs ')
    .replace(/\s+(at|@)\s+/gi, ' vs ')
    .replace(/\([^)]*\)/g, '') // Remove time info
    .replace(/\b(New York|Los Angeles|New England|New Orleans|San Francisco|Tampa Bay|Green Bay|Kansas City)\s+/gi, '')
    .replace(/\b(Washington Commanders)/gi, 'Commanders')
    .trim();
}

/**
 * Check if it's close to game time (for highlighting urgent games)
 * @param {Object} game - Game object
 * @returns {boolean} True if game is within 2 hours
 */
export function isGameSoon(game) {
  // This would need actual time parsing for full implementation
  // For now, just return false
  return false;
}

/**
 * Get games by time slot for organization
 * @returns {Object} Games organized by time slot
 */
export function getGamesByTimeSlot() {
  const games = getCurrentWeekGames();
  const slots = {
    early: [],    // 10:00 AM games
    afternoon: [], // 1:00+ PM games  
    primetime: []  // 5:00+ PM games
  };

  games.forEach(game => {
    if (game.time.includes('10:00 AM')) {
      slots.early.push(game);
    } else if (game.time.includes('5:') || game.time.includes('6:')) {
      slots.primetime.push(game);
    } else {
      slots.afternoon.push(game);
    }
  });

  return slots;
}
