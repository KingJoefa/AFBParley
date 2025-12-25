import type { SwantailResponse } from './schema'

export function buildSwantailPrompt(input: {
  matchup: string
  line_focus?: string
  angles?: string[]
  voice?: 'analyst' | 'hype' | 'coach'
  user_supplied_odds?: Array<{ leg: string; american_odds: number }>
}) {
  const { matchup, line_focus, angles, voice, user_supplied_odds } = input
  const parts: string[] = []
  parts.push('You are Swantail, a tail-outcome script builder. Return ONLY valid JSON.')
  parts.push('Strictly follow the schema and constraints. No extra keys, no prose outside JSON.')
  parts.push('Use correlated legs, no contradictions, avoid lock/guarantee language.')
  parts.push('Do NOT speculate about injuries, depth charts, or “backup QBs” unless the user explicitly provides those facts. If a fact is not provided, omit it.')
  parts.push(`Matchup: ${matchup}`)
  if (line_focus) {
    parts.push(`Line focus (live anchor): ${line_focus}`)
    parts.push('Requirement: Include EXACTLY ONE core leg that uses this anchor verbatim (same side and number). Build all other legs to be correlated with this anchor.')
  }
  if (angles?.length) parts.push(`Angles: ${angles.join(', ')}`)
  parts.push(`Voice: ${voice ?? 'analyst'}`)
  if (user_supplied_odds?.length) {
    parts.push(`User-supplied odds: ${user_supplied_odds.map(o => `${o.leg} -> ${o.american_odds}`).join(' | ')}`)
  }

  const schemaSkeleton: SwantailResponse = {
    assumptions: {
      matchup: '<string>',
      line_focus: '<string>',
      angles: ['<string>'],
      voice: 'analyst'
    },
    scripts: [
      {
        title: '<string>',
        narrative: '<string>',
        legs: [
          {
            market: '<string>',
            selection: '<string>',
            american_odds: -110,
            odds_source: 'illustrative'
          }
        ],
        parlay_math: {
          stake: 1,
          leg_decimals: [1.91],
          product_decimal: 1.91,
          payout: 1.91,
          profit: 0.91,
          steps: '1.91 = 1.91; payout $1.91, profit $0.91'
        },
        notes: [
          'No guarantees; high variance by design; bet what you can afford.',
          'If odds not supplied, american_odds are illustrative — paste your book’s prices to re-price.'
        ],
        offer_opposite: 'Want the other side of this story?'
      }
    ]
  }

  parts.push('Schema (example shape only; fill with real values):')
  parts.push(JSON.stringify(schemaSkeleton, null, 2))
  parts.push('Constraints: 1-3 scripts; 3-5 legs each; stake always 1; notes include both required strings; offer_opposite must be exact; odds_source is illustrative unless user-supplied odds are used; parlay_math must use American->decimal with 2 decimals for steps; steps format: "1.80 × 2.20 × 1.91 = 7.55; payout $7.55, profit $6.55".')
  parts.push('Constraint: If line focus (anchor) is provided, one leg MUST match it exactly (same wording and number). Do not change the anchor number.')

  return parts.join('\n')
}
