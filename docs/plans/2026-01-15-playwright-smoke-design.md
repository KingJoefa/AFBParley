# Playwright Smoke Tests Design

Goal
- Add local-only Playwright flow tests that validate the UI wiring to /api/afb and error handling without hitting external services.

Architecture
- Use Playwright with a local dev server (npm run dev) launched by Playwright config.
- Intercept /api/afb in tests and return a deterministic Swantail JSON payload to keep tests stable and fast.
- Include a negative-flow test that returns a 500 and asserts the UI error banner appears.

Scope
- Page load smoke: app renders and primary CTA is visible.
- Happy path: submit a matchup + line focus + angle and verify scripts render.
- Error path: simulate /api/afb failure and confirm error message displays.

Stability
- No network calls to wrapper/OpenAI; all /api/afb calls are mocked in tests.
- Tests run locally only (no CI/cron), using `npx playwright test`.

Dependencies
- Playwright test runner as dev dependency and basic config in repository root.

Developer Docs
- Add a short README section on how to run smoke tests and expected local prerequisites.
