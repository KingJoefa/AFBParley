# Playwright Smoke Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add local-only Playwright flow tests that validate the UI wiring to /api/afb with deterministic mocks and an error path.

**Architecture:** Playwright launches the Next dev server, intercepts /api/afb calls to return fixed JSON, and asserts UI outputs. No external network calls during tests.

**Tech Stack:** Next.js, Playwright.

### Task 1: Add Playwright config and dependencies

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`

**Step 1: Write a failing smoke test placeholder**

```ts
import { test, expect } from '@playwright/test'

test('smoke placeholder', async ({ page }) => {
  await page.goto('http://localhost:3000')
  await expect(page.getByRole('button', { name: /reveal scripts/i })).toBeVisible()
})
```

**Step 2: Run test to verify it fails**

Run: `npx playwright test`
Expected: FAIL (playwright not installed / config missing)

**Step 3: Add Playwright dev dependency and config**

- Add `@playwright/test` to devDependencies.
- Add `playwright.config.ts` with:
  - `webServer.command = "npm run dev"`
  - `webServer.port = 3000`
  - `use.baseURL = "http://localhost:3000"`
  - headless true by default

**Step 4: Run test to verify it passes**

Run: `npx playwright test`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json playwright.config.ts
git commit -m "test: add Playwright config"
```

### Task 2: Implement happy-path flow test with /api/afb mock

**Files:**
- Create: `tests/e2e/afb-happy.spec.ts`

**Step 1: Write failing test**

```ts
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
        { market: 'TD', selection: 'RB Anytime', american_odds: +120, odds_source: 'illustrative' }
      ],
      parlay_math: { stake: 1, leg_decimals: [1.91, 1.95, 2.2], product_decimal: 8.2, payout: 8.2, profit: 7.2, steps: '1.91 × 1.95 × 2.20 = 8.20; payout $8.20; profit $7.20.' },
      notes: ['No guarantees; high variance by design; bet what you can afford.', 'If odds not supplied, american odds are illustrative — paste your book\'s prices to re-price.'],
      offer_opposite: 'Want the other side of this story?'
    }
  ]
}

test('builds scripts from mocked /api/afb', async ({ page }) => {
  await page.route('**/api/afb', route => route.fulfill({ json: mockResponse }))
  await page.goto('/')
  await page.getByLabel(/matchup/i).fill('A @ B')
  await page.getByRole('button', { name: /reveal scripts/i }).click()
  await expect(page.getByText('Fast Start')).toBeVisible()
})
```

**Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/afb-happy.spec.ts`
Expected: FAIL (selectors may need adjustment)

**Step 3: Adjust selectors to real UI**

- Use matchup field from `SwantailBuilderForm` (label or placeholder).
- Ensure button text matches "Reveal scripts".

**Step 4: Run test to verify it passes**

Run: `npx playwright test tests/e2e/afb-happy.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/e2e/afb-happy.spec.ts
git commit -m "test: add AFB happy-path flow"
```

### Task 3: Add error-path flow test

**Files:**
- Create: `tests/e2e/afb-error.spec.ts`

**Step 1: Write failing test**

```ts
import { test, expect } from '@playwright/test'

test('shows error when /api/afb fails', async ({ page }) => {
  await page.route('**/api/afb', route => route.fulfill({ status: 500, json: { message: 'boom' } }))
  await page.goto('/')
  await page.getByLabel(/matchup/i).fill('A @ B')
  await page.getByRole('button', { name: /reveal scripts/i }).click()
  await expect(page.getByText('boom')).toBeVisible()
})
```

**Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/afb-error.spec.ts`
Expected: FAIL (selectors may need adjustment)

**Step 3: Adjust selectors to real UI**

- Align error text selector with error rendering in `components/AssistedBuilder.tsx`.

**Step 4: Run test to verify it passes**

Run: `npx playwright test tests/e2e/afb-error.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/e2e/afb-error.spec.ts
git commit -m "test: add AFB error flow"
```

### Task 4: Document local run steps

**Files:**
- Modify: `README.md`

**Step 1: Add Playwright run instructions**

```md
## Smoke Tests (Local)

```bash
npx playwright install
npx playwright test
```

Notes:
- Tests mock `/api/afb`, so no external services are called.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add Playwright smoke test instructions"
```
