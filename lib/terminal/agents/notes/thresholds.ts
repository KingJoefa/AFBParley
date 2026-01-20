/**
 * Notes Agent
 *
 * Loads curated game intelligence from data/notes/{year}-wk{week}.json
 * Emits structured Findings for key matchups, tendencies, injuries, and weather context.
 *
 * IMPORTANT: This agent only emits context Findings. It does NOT add/remove allowed players.
 * Roster grounding remains handled by props-roster.ts.
 */

import fs from 'fs'
import path from 'path'
import type { Finding, AgentType } from '../../schemas'

const AGENT: AgentType = 'notes'

// Stat-like patterns for note_tendency extraction (tight whitelist)
const STAT_PATTERNS = [
  /%/,                           // "60% routes in slot"
  /\d+\.\d+\s*YPC/i,             // "3.86 YPC"
  /\d+\.\d+\s*YPA/i,             // "6.0 YPA"
  /\d+\.\d+\s*YPP/i,             // "3.5 YPP"
  /\d+(?:st|nd|rd|th)/i,         // "4th in sacks", "11th QB rushing"
  /\d+\s*pressures?/i,           // "30 pressures"
  /\d+\s*sacks?/i,               // "47 sacks"
  /\d+\s*targets?/i,             // "12 targets"
  /target share/i,               // "target share"
  /pressure rate/i,              // "pressure rate"
  /snap[s]?\s*\(?%?\)?/i,        // "75% snaps", "snap share"
  /passer rating/i,              // "passer rating"
  /\d+\/\d+\/\d+/,               // "12/82/0" stat lines
  /\d+-\d+\s+TD/i,               // "8:2 TD-to-INT"
  /allowed\s+\d+/i,              // "allowed 97 RB catches"
  /held.*to\s+\d/i,              // "held Chargers to 3.5 YPP"
  /rank/i,                       // "ranks", "ranked"
]

// Finding types for notes
type NoteType =
  | 'note_key_matchup'
  | 'note_tendency'
  | 'note_injury_context'
  | 'note_weather_context'
  | 'note_market_context'

interface GameNotes {
  kickoff?: string
  totals?: { home: number; away: number }
  spread?: { favorite: string; line: number }
  notes?: string
  injuries?: Record<string, string[]>
  keyMatchups?: string[]
  weather?: { temp_f?: number; wind_mph?: number; snow_chance_pct?: number }
  prediction?: { home: number; away: number }
  news?: Array<{ date: string; text: string }>
}

interface NotesFile {
  week: number
  season: number
  round?: string
  games: Record<string, GameNotes>
}

interface NotesContext {
  year: number
  week: number
  matchup: string  // e.g., "NE @ DEN"
  homeTeam: string
  awayTeam: string
}

/**
 * Load notes file for the given week/year
 */
function loadNotesFile(year: number, week: number): NotesFile | null {
  const filePath = path.join(process.cwd(), 'data', 'notes', `${year}-wk${week}.json`)

  try {
    if (!fs.existsSync(filePath)) {
      console.log(`[NotesAgent] No notes file at ${filePath}`)
      return null
    }

    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as NotesFile
  } catch (e) {
    console.warn(`[NotesAgent] Failed to load notes: ${(e as Error).message}`)
    return null
  }
}

/**
 * Find the game entry for a matchup
 * Handles both "NE@DEN" and "NE @ DEN" formats
 */
function findGameEntry(games: Record<string, GameNotes>, homeTeam: string, awayTeam: string): { key: string; data: GameNotes } | null {
  // Try various key formats
  const candidates = [
    `${awayTeam}@${homeTeam}`,
    `${awayTeam} @ ${homeTeam}`,
    `${awayTeam.toUpperCase()}@${homeTeam.toUpperCase()}`,
    `${awayTeam.toLowerCase()}@${homeTeam.toLowerCase()}`,
  ]

  for (const key of candidates) {
    if (games[key]) {
      return { key, data: games[key] }
    }
  }

  // Try case-insensitive search
  for (const [key, data] of Object.entries(games)) {
    const normalized = key.replace(/\s/g, '').toUpperCase()
    if (normalized.includes(awayTeam.toUpperCase()) && normalized.includes(homeTeam.toUpperCase())) {
      return { key, data }
    }
  }

  return null
}

/**
 * Check if a sentence matches stat-like patterns
 */
function matchesStatPattern(text: string): boolean {
  return STAT_PATTERNS.some(pattern => pattern.test(text))
}

/**
 * Extract player names mentioned in text (simple heuristic)
 */
function extractPlayerNames(text: string): string[] {
  // Match capitalized name patterns: "First Last" or "First"
  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g
  const matches = text.match(namePattern) || []

  // Filter out common non-name words
  const skipWords = new Set([
    'The', 'This', 'That', 'When', 'Where', 'What', 'Which', 'While',
    'With', 'From', 'Into', 'Over', 'Under', 'After', 'Before',
    'Game', 'Total', 'Team', 'Props', 'Spread', 'Line', 'Week',
    'Wild', 'Card', 'Round', 'NFL', 'AFC', 'NFC', 'OUT', 'ACL',
    'Sunday', 'Saturday', 'Monday', 'Thursday',
  ])

  return matches.filter(name => !skipWords.has(name))
}

/**
 * Run the Notes Agent
 */
export function runNotesAgent(context: NotesContext): Finding[] {
  const findings: Finding[] = []
  const timestamp = Math.floor(Date.now() / 1000)
  const sourceRef = `data/notes/${context.year}-wk${context.week}.json:${context.awayTeam}@${context.homeTeam}`

  // Load notes file
  const notesFile = loadNotesFile(context.year, context.week)
  if (!notesFile) {
    console.log(`[NotesAgent] No notes for ${context.year} week ${context.week}`)
    return findings
  }

  // Find game entry
  const game = findGameEntry(notesFile.games, context.homeTeam, context.awayTeam)
  if (!game) {
    console.log(`[NotesAgent] No game entry for ${context.awayTeam} @ ${context.homeTeam}`)
    return findings
  }

  const gameData = game.data
  let findingIndex = 0

  // 1. Key Matchups → note_key_matchup (direct 1:1 mapping)
  if (gameData.keyMatchups && gameData.keyMatchups.length > 0) {
    for (const matchup of gameData.keyMatchups) {
      findings.push({
        id: `notes-matchup-${findingIndex++}`,
        agent: AGENT,
        type: 'note_key_matchup',
        stat: 'key_matchup',
        value_str: matchup,
        value_type: 'string',
        threshold_met: 'curated_matchup',
        comparison_context: matchup,
        source_ref: sourceRef,
        source_type: 'notes',
        source_timestamp: timestamp,
        confidence: 0.9,
        raw_text: matchup,
        players_mentioned: extractPlayerNames(matchup),
      })
    }
  }

  // 2. Injuries → note_injury_context
  if (gameData.injuries) {
    for (const [team, injuries] of Object.entries(gameData.injuries)) {
      for (const injury of injuries) {
        findings.push({
          id: `notes-injury-${findingIndex++}`,
          agent: AGENT,
          type: 'note_injury_context',
          stat: 'injury',
          value_str: `${team}: ${injury}`,
          value_type: 'string',
          threshold_met: 'curated_injury',
          comparison_context: `${team}: ${injury}`,
          source_ref: sourceRef,
          source_type: 'notes',
          source_timestamp: timestamp,
          confidence: 0.95,
          raw_text: injury,
          players_mentioned: extractPlayerNames(injury),
        })
      }
    }
  }

  // 3. Weather → note_weather_context
  if (gameData.weather) {
    const w = gameData.weather
    const weatherText = [
      w.temp_f !== undefined ? `${w.temp_f}°F` : null,
      w.wind_mph !== undefined ? `${w.wind_mph} mph wind` : null,
      w.snow_chance_pct !== undefined ? `${w.snow_chance_pct}% snow chance` : null,
    ].filter(Boolean).join(', ')

    if (weatherText) {
      findings.push({
        id: `notes-weather-${findingIndex++}`,
        agent: AGENT,
        type: 'note_weather_context',
        stat: 'weather',
        value_str: weatherText,
        value_type: 'string',
        threshold_met: 'curated_weather',
        comparison_context: weatherText,
        source_ref: sourceRef,
        source_type: 'notes',
        source_timestamp: timestamp,
        confidence: 0.85,
        raw_text: weatherText,
      })
    }
  }

  // 4. Notes text → note_tendency (only stat-like sentences)
  if (gameData.notes) {
    // Split into sentences
    const sentences = gameData.notes.split(/[.!]\s+/).map(s => s.trim()).filter(Boolean)

    for (const sentence of sentences) {
      if (matchesStatPattern(sentence)) {
        findings.push({
          id: `notes-tendency-${findingIndex++}`,
          agent: AGENT,
          type: 'note_tendency',
          stat: 'tendency',
          value_str: sentence,
          value_type: 'string',
          threshold_met: 'stat_pattern_match',
          comparison_context: sentence,
          source_ref: sourceRef,
          source_type: 'notes',
          source_timestamp: timestamp,
          confidence: 0.85,
          raw_text: sentence,
          players_mentioned: extractPlayerNames(sentence),
        })
      }
    }
  }

  // 5. News items → note_tendency (recent news)
  if (gameData.news && gameData.news.length > 0) {
    for (const newsItem of gameData.news) {
      findings.push({
        id: `notes-news-${findingIndex++}`,
        agent: AGENT,
        type: 'note_tendency',
        stat: 'news',
        value_str: newsItem.text,
        value_type: 'string',
        threshold_met: 'curated_news',
        comparison_context: `[${newsItem.date}] ${newsItem.text}`,
        source_ref: sourceRef,
        source_type: 'notes',
        source_timestamp: timestamp,
        confidence: 0.9,
        raw_text: newsItem.text,
        players_mentioned: extractPlayerNames(newsItem.text),
      })
    }
  }

  console.log(`[NotesAgent] Emitted ${findings.length} findings for ${context.awayTeam} @ ${context.homeTeam}`)
  return findings
}
