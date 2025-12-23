/**
 * NFL Schedule Manager
 * Fetches current week's NFL games with fallback to manual data
 */

// Current week's actual NFL schedule (Week 17, December 25–29, 2025)
const CURRENT_WEEK_GAMES = [
  // Thu, Dec 25
  { id: 'cowboys-commanders', display: 'Dallas Cowboys @ Washington Commanders', time: 'Thu 1:00 PM ET' },
  { id: 'lions-vikings', display: 'Detroit Lions @ Minnesota Vikings', time: 'Thu 4:30 PM ET' },
  { id: 'broncos-chiefs', display: 'Denver Broncos @ Kansas City Chiefs', time: 'Thu 8:15 PM ET' },
  // Sat, Dec 27
  { id: 'texans-chargers', display: 'Houston Texans @ Los Angeles Chargers', time: 'Sat 4:30 PM ET' },
  { id: 'ravens-packers', display: 'Baltimore Ravens @ Green Bay Packers', time: 'Sat 8:00 PM ET' },
  // Sun, Dec 28
  { id: 'cardinals-bengals', display: 'Arizona Cardinals @ Cincinnati Bengals', time: 'Sun 1:00 PM ET' },
  { id: 'steelers-browns', display: 'Pittsburgh Steelers @ Cleveland Browns', time: 'Sun 1:00 PM ET' },
  { id: 'saints-titans', display: 'New Orleans Saints @ Tennessee Titans', time: 'Sun 1:00 PM ET' },
  { id: 'jaguars-colts', display: 'Jacksonville Jaguars @ Indianapolis Colts', time: 'Sun 1:00 PM ET' },
  { id: 'buccaneers-dolphins', display: 'Tampa Bay Buccaneers @ Miami Dolphins', time: 'Sun 1:00 PM ET' },
  { id: 'patriots-jets', display: 'New England Patriots @ New York Jets', time: 'Sun 1:00 PM ET' },
  { id: 'seahawks-panthers', display: 'Seattle Seahawks @ Carolina Panthers', time: 'Sun 1:00 PM ET' },
  { id: 'giants-raiders', display: 'New York Giants @ Las Vegas Raiders', time: 'Sun 4:05 PM ET' },
  { id: 'eagles-bills', display: 'Philadelphia Eagles @ Buffalo Bills', time: 'Sun 4:25 PM ET' },
  { id: 'bears-49ers', display: 'Chicago Bears @ San Francisco 49ers', time: 'Sun 8:20 PM ET' },
  // Mon, Dec 29
  { id: 'rams-falcons', display: 'Los Angeles Rams @ Atlanta Falcons', time: 'Mon 8:15 PM ET' }
];

// Popular/high-profile games that are always good for parlays
const POPULAR_GAMES = [
  'broncos-chiefs',
  'eagles-bills',
  'bears-49ers',
  'patriots-jets',
  'cowboys-commanders'
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
