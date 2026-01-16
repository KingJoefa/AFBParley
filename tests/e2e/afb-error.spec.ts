import { test, expect } from '@playwright/test'

test('shows error when /api/afb fails', async ({ page }) => {
  await page.route('**/api/afb', route => route.fulfill({ status: 500, json: { message: 'boom' } }))
  await page.goto('/')

  const matchupInput = page.getByLabel(/matchup/i)
  if (await matchupInput.count()) {
    await matchupInput.fill('A @ B')
  } else {
    await page.getByPlaceholder('Lions @ Eagles').fill('A @ B')
  }

  await page.getByRole('button', { name: /reveal scripts/i }).click()
  await expect(page.getByText('boom')).toBeVisible()
})
