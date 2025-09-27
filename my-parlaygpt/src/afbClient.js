/**
 * AFB Client Utilities (JavaScript version of your useAfb hook)
 */

export const VOICE_OPTIONS = ['analyst', 'hype', 'coach'];

/**
 * Make AFB request to the enhanced endpoint
 * @param {Object} request - AFB request parameters
 * @param {string} request.matchup - Game matchup (required)
 * @param {string} [request.lineFocus] - Total or spread focus
 * @param {string[]} [request.angles] - Strategic angles
 * @param {'analyst'|'hype'|'coach'} [request.voice] - Voice style
 * @param {boolean} [request.wantJson] - Return JSON vs text
 * @returns {Promise<Object>} AFB response
 */
export async function buildAFBScripts(request) {
  const {
    matchup,
    lineFocus,
    angles,
    voice = 'analyst',
    wantJson = true
  } = request;

  if (!matchup) {
    throw new Error('matchup is required');
  }

  const response = await fetch('http://localhost:8080/api/afb', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      matchup,
      lineFocus,
      angles,
      voice,
      wantJson
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error ?? `AFB API error ${response.status}`);
  }

  return response.json();
}

/**
 * Parse user input for AFB parameters
 * @param {string} input - User input string
 * @returns {Object} Parsed AFB parameters
 */
export function parseAFBInput(input) {
  const result = {
    matchup: '',
    lineFocus: undefined,
    angles: [],
    voice: 'analyst'
  };

  // Extract voice if specified
  const voiceMatch = input.match(/\b(analyst|hype|coach)\s+voice\b/i);
  if (voiceMatch) {
    result.voice = voiceMatch[1].toLowerCase();
  }

  // Extract line focus (over/under, spread)
  const lineMatch = input.match(/\b(over|under|o\/u)\s*(\d+\.?\d*)|spread\s*[+-]?\d+\.?\d*|\btotal\s*(\d+\.?\d*)/i);
  if (lineMatch) {
    result.lineFocus = lineMatch[0];
  }

  // Extract angles/keywords
  const angleKeywords = [
    'pace', 'proe', 'epa', 'pressure', 'ol/dl', 'red.zone', 'explosive', 
    'coverage', 'weather', 'injuries', 'travel', 'rest', 'short.week',
    'rushing', 'passing', 'defense', 'offense'
  ];
  
  const foundAngles = angleKeywords.filter(keyword => 
    input.toLowerCase().includes(keyword.replace('.', ''))
  );
  
  if (foundAngles.length > 0) {
    result.angles = foundAngles;
  }

  // Extract matchup (everything before line/voice/angles mentions)
  let matchupText = input;
  if (voiceMatch) {
    matchupText = matchupText.replace(voiceMatch[0], '').trim();
  }
  if (lineMatch) {
    matchupText = matchupText.replace(lineMatch[0], '').trim();
  }
  
  // Clean up common separators and extract team names
  matchupText = matchupText
    .replace(/\b(vs|v\.?|at|@|-)\b/gi, 'vs')
    .replace(/\b(focusing on|emphasizing|angles?)\b.*$/i, '')
    .replace(/,\s*$/, '')
    .trim();

  result.matchup = matchupText;

  return result;
}

/**
 * Check if input looks like an AFB request
 * @param {string} input - User input
 * @returns {boolean} Whether this looks like AFB input
 */
export function isAFBRequest(input) {
  const afbKeywords = [
    'parlay', 'afb', 'script', 'matchup', 'betting', 'vs', 'over', 'under', 
    'total', 'spread', 'analyst', 'hype', 'coach'
  ];
  
  const lowerInput = input.toLowerCase();
  return afbKeywords.some(keyword => lowerInput.includes(keyword));
}
