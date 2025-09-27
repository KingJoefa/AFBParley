/**
 * AFB Script Parlay Builder Type Definitions
 * (JavaScript version of TypeScript types from your original)
 */

// Voice options for AFB scripts
const VOICE_OPTIONS = ['analyst', 'hype', 'coach'];

/**
 * AFB Request Structure
 * @typedef {Object} AFBRequest
 * @property {string} matchup - The game matchup (required)
 * @property {string} [lineFocus] - Total or spread focus
 * @property {string[]} [angles] - Strategic angles to emphasize
 * @property {'analyst'|'hype'|'coach'} [voice] - Narrative voice style
 * @property {boolean} [wantJson] - Return JSON vs plain text
 */

/**
 * Parlay Leg Definition
 * @typedef {Object} ParlayLeg
 * @property {string} market - Betting market name
 * @property {string} selection - Specific selection
 * @property {string} odds - American odds ("-105" or "+170")
 * @property {'illustrative'|'user-supplied'} oddsLabel - Odds source
 * @property {number} decimal - Decimal odds (2 decimals)
 */

/**
 * Parlay Math Calculations
 * @typedef {Object} ParlayMath
 * @property {number[]} decimals - Each leg's decimal odds (2 decimals)
 * @property {number} product - Combined decimal odds (2 decimals)
 * @property {number} payoutUSD - Payout for $1 stake (2 decimals)
 * @property {number} profitUSD - Profit for $1 stake (2 decimals)
 * @property {string} steps - Math formula string
 */

/**
 * Individual Script Block
 * @typedef {Object} ScriptBlock
 * @property {string} title - Script title
 * @property {string} narrative - Story narrative paragraph
 * @property {ParlayLeg[]} legs - 3-5 correlated legs
 * @property {ParlayMath} math - Parlay calculations
 * @property {string[]} notes - Standard disclaimer notes
 */

/**
 * Complete AFB Response
 * @typedef {Object} AFBResponse
 * @property {Object} assumptions - Input assumptions made
 * @property {string} assumptions.matchup - Game matchup
 * @property {string} [assumptions.lineFocus] - Line focus
 * @property {string[]} assumptions.angles - Angles emphasized
 * @property {'analyst'|'hype'|'coach'} assumptions.voice - Voice used
 * @property {ScriptBlock[]} scripts - 2-3 script blocks
 * @property {string} close - Closing line "Want the other side..."
 */

/**
 * Validation functions
 */
function isValidVoice(voice) {
  return VOICE_OPTIONS.includes(voice);
}

function validateAFBRequest(request) {
  if (!request.matchup || typeof request.matchup !== 'string') {
    return { valid: false, error: 'matchup is required and must be a string' };
  }
  
  if (request.voice && !isValidVoice(request.voice)) {
    return { valid: false, error: `voice must be one of: ${VOICE_OPTIONS.join(', ')}` };
  }
  
  if (request.angles && !Array.isArray(request.angles)) {
    return { valid: false, error: 'angles must be an array of strings' };
  }
  
  return { valid: true };
}

/**
 * Utility functions for odds conversion (matches your original logic)
 */
function americanToDecimal(americanOdds) {
  const odds = parseInt(americanOdds.replace(/[+-]/, ''));
  if (americanOdds.startsWith('+')) {
    return Math.round((1 + odds / 100) * 100) / 100;
  } else {
    return Math.round((1 + 100 / odds) * 100) / 100;
  }
}

function calculateParlayMath(legs) {
  const decimals = legs.map(leg => leg.decimal);
  const product = decimals.reduce((acc, dec) => acc * dec, 1);
  const productRounded = Math.round(product * 100) / 100;
  const payoutUSD = productRounded;
  const profitUSD = Math.round((payoutUSD - 1) * 100) / 100;
  
  const stepsString = `${decimals.map(d => d.toFixed(2)).join(' × ')} = ${productRounded.toFixed(2)}; payout $${payoutUSD.toFixed(2)}; profit $${profitUSD.toFixed(2)}.`;
  
  return {
    decimals: decimals.map(d => Math.round(d * 100) / 100),
    product: productRounded,
    payoutUSD,
    profitUSD,
    steps: stepsString
  };
}

module.exports = {
  VOICE_OPTIONS,
  validateAFBRequest,
  americanToDecimal,
  calculateParlayMath,
  isValidVoice
};
