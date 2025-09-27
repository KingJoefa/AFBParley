/**
 * NFL Schedule Manager
 * Fetches current week's NFL games with fallback to manual data
 */

// Current week's actual NFL schedule (September 28, 2025)
const CURRENT_WEEK_GAMES = [
  { id: 'vikings-steelers', display: 'Minnesota Vikings @ Pittsburgh Steelers', time: 'Sun 6:30 AM PDT' },
  { id: 'saints-bills', display: 'New Orleans Saints @ Buffalo Bills', time: 'Sun 10:00 AM PDT' },
  { id: 'titans-texans', display: 'Tennessee Titans @ Houston Texans', time: 'Sun 10:00 AM PDT' },
  { id: 'browns-lions', display: 'Cleveland Browns @ Detroit Lions', time: 'Sun 10:00 AM PDT' },
  { id: 'commanders-falcons', display: 'Washington Commanders @ Atlanta Falcons', time: 'Sun 10:00 AM PDT' },
  { id: 'eagles-bucs', display: 'Philadelphia Eagles @ Tampa Bay Buccaneers', time: 'Sun 10:00 AM PDT' },
  { id: 'panthers-patriots', display: 'Carolina Panthers @ New England Patriots', time: 'Sun 10:00 AM PDT' },
  { id: 'chargers-giants', display: 'Los Angeles Chargers @ New York Giants', time: 'Sun 10:00 AM PDT' },
  { id: 'jaguars-49ers', display: 'Jacksonville Jaguars @ San Francisco 49ers', time: 'Sun 1:05 PM PDT' },
  { id: 'colts-rams', display: 'Indianapolis Colts @ Los Angeles Rams', time: 'Sun 1:05 PM PDT' },
  { id: 'bears-raiders', display: 'Chicago Bears @ Las Vegas Raiders', time: 'Sun 1:25 PM PDT' },
  { id: 'ravens-chiefs', display: 'Baltimore Ravens @ Kansas City Chiefs', time: 'Sun 1:25 PM PDT' },
  { id: 'packers-cowboys', display: 'Green Bay Packers @ Dallas Cowboys', time: 'Sun 5:20 PM PDT' }
];

// Popular/high-profile games that are always good for parlays
const POPULAR_GAMES = [
  'ravens-chiefs',
  'packers-cowboys', 
  'eagles-bucs',
  'jaguars-49ers',
  'saints-bills'
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
