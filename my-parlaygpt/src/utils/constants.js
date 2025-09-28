// Application Constants
export const APP_CONFIG = {
  name: 'ParlayGPT',
  version: '1.0.0',
  description: 'AI-Powered Sports Betting Assistant',
  legalAge: 21,
};

// API Configuration
export const API_CONFIG = {
  baseUrl: process.env.NODE_ENV === 'production' ? window.location.origin : 'http://localhost:5000',
  socketUrl: process.env.NODE_ENV === 'production' ? window.location.origin : 'http://localhost:5000',
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
};

// UI Configuration
export const UI_CONFIG = {
  maxMessageLength: 500,
  maxBetAmount: 1000,
  minBetAmount: 1,
  defaultBetAmount: 10,
  maxParlayLegs: 10,
  animationDuration: 300,
};

// Socket Events
export const SOCKET_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  JOIN_ROOM: 'join_room',
  SEND_MESSAGE: 'send_message',
  RECEIVE_MESSAGE: 'receive_message',
  ERROR: 'error',
};

// Local Storage Keys
export const STORAGE_KEYS = {
  AGE_VERIFIED: 'ageVerified',
  USER_PREFERENCES: 'userPreferences',
  RECENT_BETS: 'recentBets',
};

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network connection failed. Please check your internet connection.',
  SERVER_ERROR: 'Server error occurred. Please try again later.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  AGE_VERIFICATION_REQUIRED: 'You must be 21 or older to access this service.',
  MAX_BET_EXCEEDED: `Maximum bet amount is $${UI_CONFIG.maxBetAmount}`,
  MIN_BET_NOT_MET: `Minimum bet amount is $${UI_CONFIG.minBetAmount}`,
};

// Success Messages
export const SUCCESS_MESSAGES = {
  BET_ADDED: 'Bet added to parlay successfully',
  BET_REMOVED: 'Bet removed from parlay',
  MESSAGE_SENT: 'Message sent successfully',
};

// Betting Calculations
export const BETTING_UTILS = {
  calculateAmericanOdds: (decimal) => {
    if (decimal >= 2) {
      return `+${Math.round((decimal - 1) * 100)}`;
    } else {
      return `-${Math.round(100 / (decimal - 1))}`;
    }
  },
  
  calculateDecimalOdds: (american) => {
    const odds = parseInt(american);
    if (odds > 0) {
      return 1 + (odds / 100);
    } else {
      return 1 + (100 / Math.abs(odds));
    }
  },
  
  calculateParlayOdds: (bets) => {
    return bets.reduce((acc, bet) => acc * (1 + bet.odds / 100), 1);
  },
  
  calculatePayout: (amount, odds) => {
    return (amount * odds).toFixed(2);
  },
  
  calculateProfit: (amount, odds) => {
    return ((amount * odds) - amount).toFixed(2);
  },
};

export default {
  APP_CONFIG,
  API_CONFIG,
  UI_CONFIG,
  SOCKET_EVENTS,
  STORAGE_KEYS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  BETTING_UTILS,
};