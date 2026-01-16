import { test, expect } from '@playwright/test'

const mockResponse = {
  assumptions: { matchup: 'A @ B', line_focus: 'Over 41.5', angles: ['Pace skew'], voice: 'analyst' },
  scripts: [
    {
      title: 'Fast Start',
      narrative: 'Test narrative',
      legs: [
        { market: 'Total', selection: 'Over 41.5', american_odds: -110, odds_source: 'illustrative' },
        { market: 'Spread', selection: 'B -3.5', american_odds: -105, odds_source: 'illustrative' },
        { market: 'TD', selection: 'RB Anytime', american_odds: 120, odds_source: 'illustrative' }
      ],
      parlay_math: {
        stake: 1,
        leg_decimals: [1.91, 1.95, 2.2],
        product_decimal: 8.2,
        payout: 8.2,
        profit: 7.2,
        steps: '1.91 × 1.95 × 2.20 = 8.20; payout $8.20; profit $7.20.'
      },
      notes: [
        'No guarantees; high variance by design; bet what you can afford.',
        "If odds not supplied, american odds are illustrative — paste your book's prices to re-price."
      ],
      offer_opposite: 'Want the other side of this story?'
    }
  ]
}

test('builds scripts from mocked /api/afb', async ({ page }) => {
  await page.route('**/api/afb', route => route.fulfill({ json: mockResponse }))
  await page.goto('/')

  const matchupInput = page.getByLabel(/matchup/i)
  if (await matchupInput.count()) {
    await matchupInput.fill('A @ B')
  } else {
    await page.getByPlaceholder('Lions @ Eagles').fill('A @ B')
  }

  await page.getByRole('button', { name: /reveal scripts/i }).click()
  await expect(page.getByText('Fast Start')).toBeVisible()
})
