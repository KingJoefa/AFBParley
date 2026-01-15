#!/usr/bin/env node
/**
 * FantasyPros CSV to JSON Converter
 *
 * Usage:
 *   node scripts/convert-fantasypros.js <csv-path> <week-number>
 *
 * Examples:
 *   node scripts/convert-fantasypros.js ~/Downloads/FantasyPros_2025_Week_20_OP_Rankings.csv 20
 *   node scripts/convert-fantasypros.js ~/Downloads/FantasyPros_2025_Week_9_OP_Rankings.csv 9
 *
 * Output:
 *   my-parlaygpt/data/projections/2025/week-XX.json
 */

const fs = require('fs')
const path = require('path')

// Team code mappings (FantasyPros -> our system)
const TEAM_CODE_MAP = {
  'LAR': 'LA',   // Rams
  'LAC': 'LAC', // Chargers (keep as-is)
  'WSH': 'WAS', // Commanders (some sources use WSH)
  'JAX': 'JAC', // Jaguars (some sources use JAX)
  // All others pass through as-is
}

function normalizeTeamCode(code) {
  return TEAM_CODE_MAP[code] || code
}

function extractPosition(posWithRank) {
  // "QB1" -> "QB", "RB12" -> "RB", "WR3" -> "WR"
  const match = posWithRank.match(/^(QB|RB|WR|TE|K|DST)/)
  return match ? match[1] : posWithRank
}

function parseCSV(content) {
  const lines = content.split('\n').filter(line => line.trim())
  if (lines.length < 2) return []

  // Parse header
  const header = lines[0].split(',').map(h => h.replace(/"/g, '').trim())

  // Find column indices
  const rkIdx = header.findIndex(h => h === 'RK')
  const nameIdx = header.findIndex(h => h === 'PLAYER NAME')
  const teamIdx = header.findIndex(h => h === 'TEAM')
  const posIdx = header.findIndex(h => h === 'POS')

  if (rkIdx === -1 || nameIdx === -1 || teamIdx === -1 || posIdx === -1) {
    console.error('Missing required columns. Found:', header)
    process.exit(1)
  }

  const players = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Simple CSV parsing (handles quoted fields)
    const fields = []
    let current = ''
    let inQuotes = false

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    fields.push(current.trim())

    const rank = parseInt(fields[rkIdx], 10)
    const name = fields[nameIdx]
    const team = fields[teamIdx]
    const pos = fields[posIdx]

    // Skip empty rows or invalid data
    if (!rank || !name || !team || !pos) continue
    // Skip free agents
    if (team === 'FA') continue

    players.push({
      name,
      team: normalizeTeamCode(team),
      pos: extractPosition(pos),
      rank
    })
  }

  return players
}

function main() {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.log(`
FantasyPros CSV to JSON Converter

Usage:
  node scripts/convert-fantasypros.js <csv-path> <week-number>

Examples:
  node scripts/convert-fantasypros.js ~/Downloads/FantasyPros_2025_Week_20_OP_Rankings.csv 20
  node scripts/convert-fantasypros.js ~/Downloads/FantasyPros_2025_Week_9_OP_Rankings.csv 9
`)
    process.exit(1)
  }

  const csvPath = args[0].replace('~', process.env.HOME)
  const week = parseInt(args[1], 10)
  const year = args[2] ? parseInt(args[2], 10) : 2025

  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`)
    process.exit(1)
  }

  console.log(`Reading: ${csvPath}`)
  const content = fs.readFileSync(csvPath, 'utf8')
  const players = parseCSV(content)

  console.log(`Parsed ${players.length} players`)

  // Build output
  const output = {
    ts: Math.floor(Date.now() / 1000),
    source: `FantasyPros Week ${week} Rankings`,
    note: 'Rankings-based; lower rank = higher priority',
    players
  }

  // Ensure output directory exists
  const outDir = path.join(process.cwd(), 'my-parlaygpt', 'data', 'projections', String(year))
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  const outPath = path.join(outDir, `week-${String(week).padStart(2, '0')}.json`)
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2))

  console.log(`\nWritten to: ${outPath}`)
  console.log(`\nTop 10 players:`)
  players.slice(0, 10).forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name} (${p.team}, ${p.pos})`)
  })
}

main()
