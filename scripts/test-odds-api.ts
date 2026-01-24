#!/usr/bin/env npx ts-node
/**
 * Quick test script to verify The Odds API integration
 * Run: npx ts-node scripts/test-odds-api.ts
 */

import 'dotenv/config'

async function testOddsApi() {
  const apiKey = process.env.THE_ODDS_API_KEY

  if (!apiKey) {
    console.error('THE_ODDS_API_KEY not set in environment')
    process.exit(1)
  }

  console.log('API Key configured:', apiKey.slice(0, 8) + '...')

  // Test 1: Get events
  const eventsUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?apiKey=${apiKey}`

  console.log('\n--- Fetching NFL events ---')
  const eventsRes = await fetch(eventsUrl)

  console.log('Status:', eventsRes.status)
  console.log('Remaining credits:', eventsRes.headers.get('x-requests-remaining'))
  console.log('Used credits:', eventsRes.headers.get('x-requests-used'))

  if (!eventsRes.ok) {
    console.error('Failed:', await eventsRes.text())
    process.exit(1)
  }

  const events = await eventsRes.json()
  console.log(`Found ${events.length} events`)

  if (events.length === 0) {
    console.log('No upcoming NFL events (offseason or between games)')
    return
  }

  // Show first event
  const event = events[0]
  console.log('\nFirst event:')
  console.log(`  ${event.away_team} @ ${event.home_team}`)
  console.log(`  ID: ${event.id}`)
  console.log(`  Kickoff: ${event.commence_time}`)

  // Test 2: Get player props for first event
  const propsUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${event.id}/odds?apiKey=${apiKey}&regions=us&markets=player_pass_yds,player_rush_yds,player_reception_yds&oddsFormat=american`

  console.log('\n--- Fetching player props ---')
  const propsRes = await fetch(propsUrl)

  console.log('Status:', propsRes.status)
  console.log('Remaining credits:', propsRes.headers.get('x-requests-remaining'))
  console.log('Used credits:', propsRes.headers.get('x-requests-used'))

  if (!propsRes.ok) {
    console.error('Failed:', await propsRes.text())
    process.exit(1)
  }

  const propsData = await propsRes.json()
  const bookmakers = propsData.bookmakers || []
  console.log(`Found ${bookmakers.length} bookmakers with props`)

  // Show sample prop lines
  for (const book of bookmakers.slice(0, 2)) {
    console.log(`\n${book.title}:`)
    for (const market of (book.markets || []).slice(0, 2)) {
      console.log(`  ${market.key}:`)
      for (const outcome of (market.outcomes || []).slice(0, 4)) {
        console.log(`    ${outcome.description}: ${outcome.name} ${outcome.point} (${outcome.price > 0 ? '+' : ''}${outcome.price})`)
      }
    }
  }

  console.log('\n--- Test complete ---')
}

testOddsApi().catch(console.error)
