# Console Logging Audit & Verification

## Summary

All console logging in the application is now gated by environment and log level:

| Environment | Default Level | Visible Logs |
|-------------|---------------|--------------|
| Development | `debug` | All (debug, info, warn, error) |
| Production | `warn` | Only warnings and errors |

Override with `LOG_LEVEL` environment variable (debug/info/warn/error).

## Changes Made

### New Logger (`lib/logger.ts`)

```typescript
import { createLogger } from '@/lib/logger'
const log = createLogger('ModuleName')

log.debug('Verbose info')  // Dev only
log.info('Status update')  // Dev only
log.warn('Degraded state') // Always visible
log.error('Failure', err)  // Always visible
```

### Telemetry (`lib/telemetry.ts`)

- Only logs in development (`NODE_ENV !== 'production'`)
- Sanitizes payloads (only aggregate counts, no user content)

### Files Updated

| File | Changes |
|------|---------|
| `app/api/terminal/build/route.ts` | 12 log calls → gated debug/warn/error |
| `lib/terminal/engine/props-roster.ts` | 5 log calls → gated |
| `lib/odds-provider/the-odds-api.ts` | 10 log calls → gated |
| `lib/terminal/engine/notes-loader.ts` | 1 warn → gated |
| `lib/terminal/agents/notes/thresholds.ts` | 5 log calls → gated |
| `lib/terminal/engine/agent-runner.ts` | 1 log → gated |
| `lib/terminal/engine/projections-loader.ts` | 2 log calls → gated |
| `lib/nfl/autoUpdate.ts` | 4 log calls → gated |
| `components/AssistedBuilder.tsx` | 1 log → dev-only check |

## Sensitive Data Policy

**Never logged (any environment):**
- User inputs (matchup strings, anchor text)
- LLM prompts or responses
- API keys or tokens
- Full player names in error contexts
- Full payloads with user-generated content

**Logged (aggregates only):**
- Counts (player count, alert count, prop lines count)
- Status codes and states
- Cache hit/miss status
- Error types (not messages with user content)

---

## Verification Checklist

### Quick Verification (Dev Console)

Run app in development and execute a scan/build:

```bash
npm run dev
```

1. Open browser console (F12)
2. Select a matchup and click "Scan"
3. Click "Build (Story)"

**Expected dev console output:**
```
[telemetry] 2026-01-XX... ui_scan_clicked { count: X }
[telemetry] 2026-01-XX... ui_scan_success { alertCount: X }
[telemetry] 2026-01-XX... ui_build_clicked { outputType: 'story', alertCount: X }
[telemetry] 2026-01-XX... ui_build_success { outputType: 'story' }
```

No matchup strings, player names, or LLM content visible.

### Production Verification

Build and run production:

```bash
npm run build
npm start
```

1. Open browser console
2. Execute scan/build flow

**Expected prod console output:**
- **Empty or minimal** (only warnings/errors if issues occur)
- No telemetry events
- No debug traces

### Server-Side Log Verification

Check Vercel logs or local server output:

**Development:**
```
[PropsRoster] Roster loaded { source: 'the-odds-api', players: 42, propsEnabled: true }
[PropsRoster] Odds telemetry { source: 'the-odds-api', cacheStatus: 'MISS', propLines: 85 }
[Build] Analytics context { source: 'notes', tprrMatchups: 5, sgps: 3 }
```

**Production:**
```
(empty unless warnings/errors)
```

**On error (any env):**
```
[Build] SwantailResponse validation failed
[PropsRoster] No odds provider configured
[the-odds-api] Fetch error { error: 'API 500' }
```

---

## Regression Test

After any code changes, verify:

1. [ ] `npm run build` completes without warnings about console.log
2. [ ] Dev scan/build shows only aggregate telemetry
3. [ ] Prod build shows zero console output on happy path
4. [ ] Errors are still visible in prod (test by temporarily breaking API key)
5. [ ] No player names, matchup strings, or LLM content in any logs

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | - | `production` or `development` |
| `LOG_LEVEL` | `warn` (prod) / `debug` (dev) | Override log verbosity |

To enable verbose logging in production (debugging):
```bash
LOG_LEVEL=debug npm start
```
