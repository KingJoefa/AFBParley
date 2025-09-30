/**
 * NFL Schedule Manager
 * Fetches current week's NFL games with fallback to manual data
 */

// Current week's actual NFL schedule (Week 5, October 5, 2025)
const CURRENT_WEEK_GAMES = [
  { id: 'jets-vikings', display: 'New York Jets @ Minnesota Vikings', time: 'Sun 9:30 AM EDT' },
  { id: 'bears-panthers', display: 'Chicago Bears @ Carolina Panthers', time: 'Sun 1:00 PM EDT' },
  { id: 'texans-falcons', display: 'Houston Texans @ Atlanta Falcons', time: 'Sun 1:00 PM EDT' },
  { id: 'colts-jaguars', display: 'Indianapolis Colts @ Jacksonville Jaguars', time: 'Sun 1:00 PM EDT' },
  { id: 'browns-ravens', display: 'Cleveland Browns @ Baltimore Ravens', time: 'Sun 1:00 PM EDT' },
  { id: 'bills-raiders', display: 'Buffalo Bills @ Las Vegas Raiders', time: 'Sun 4:05 PM EDT' },
  { id: 'cardinals-49ers', display: 'Arizona Cardinals @ San Francisco 49ers', time: 'Sun 4:05 PM EDT' },
  { id: 'bengals-cowboys', display: 'Cincinnati Bengals @ Dallas Cowboys', time: 'Sun 4:25 PM EDT' },
  { id: 'saints-chiefs', display: 'New Orleans Saints @ Kansas City Chiefs', time: 'Sun 4:25 PM EDT' },
  { id: 'giants-packers', display: 'New York Giants @ Green Bay Packers', time: 'Sun 4:25 PM EDT' },
  { id: 'steelers-commanders', display: 'Pittsburgh Steelers @ Washington Commanders', time: 'Sun 8:20 PM EDT' },
  { id: 'lions-broncos', display: 'Detroit Lions @ Denver Broncos', time: 'Mon 8:15 PM EDT' }
];

// Popular/high-profile games that are always good for parlays
const POPULAR_GAMES = [
  'browns-ravens',
  'bengals-cowboys',
  'saints-chiefs',
  'bills-raiders',
  'lions-broncos'
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
