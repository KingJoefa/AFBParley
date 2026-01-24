# Odds Provider Design: Direct Sportsbook Integration

**Date:** 2026-01-24
**Status:** Approved for Implementation
**Author:** Claude + User

## Overview

Replace unreliable XO community aggregator with direct sportsbook integration via The Odds API. This provides accurate, live prop lines for script generation without hallucinated numbers.

## Phased Contract

| Phase | Scope | Status |
|-------|-------|--------|
| **v1 (this design)** | Player props only via The Odds API free tier | Implementing |
| v2 (future) | Full market coverage (game lines, team props) | Planned |
| v3 (future) | Multi-book comparison with best odds | Planned |

Interfaces designed now to support v2/v3 without refactors.

## Data Source

**The Odds API** - Free tier (Starter: 500 credits/month)
- Explicit player props support via `/v4/sports/americanfootball_nfl/events/{eventId}/odds`
- Markets: `player_rush_yds`, `player_pass_yds`, `player_pass_tds`, `player_receptions`, `player_reception_yds`, `player_anytime_td`
- Book preference: DraftKings first, FanDuel fallback

## Architecture

### Directory Structure

```
lib/odds-provider/
├── types.ts           # OddsProvider interface, normalized types
├── the-odds-api.ts    # TheOddsApiProvider implementation
├── normalize.ts       # Team code + player name normalization
├── cache.ts           # Supabase + in-memory cache layer
├── xo-fallback.ts     # XoFallbackProvider (disabled by default)
└── index.ts           # Factory: getOddsProvider()
```

### Core Types

```typescript
export type PriceFormat = 'american' | 'decimal'

export interface Outcome {
  name: string          // 'Over', 'Under', 'Yes', 'Aaron Jones', etc.
  price: number         // -110, +150 (format per priceFormat)
  point?: number        // 51.5 for O/U lines, undefined for TD scorer
}

export interface PropLine {
  player: string        // Normalized: 'Rhamondre Stevenson'
  team?: string         // Normalized: 'NE' (optional, resolved via roster)
  market: string        // Provider canonical: 'player_rush_yds'
  marketAlias?: string  // Optional short name: 'rush_yds'
  bookmaker: string     // 'draftkings'
  outcomes: Outcome[]   // Flexible for O/U, TD scorer, alt lines
  priceFormat: PriceFormat
  raw?: {
    market: { key: string; last_update?: string }
    outcomes: unknown[]
  }
}

export interface EventProps {
  eventId: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
  props: PropLine[]
}

export interface FetchResult {
  data: EventProps | null
  cacheStatus: 'HIT' | 'MISS' | 'STALE_FALLBACK' | 'ERROR'
  fetchedAt: string
  creditsSpent: number
  source: string
  bookmaker: string
  incompleteLineCount?: number
}

export interface OddsProvider {
  fetchEventProps(eventId: string, markets: string[], roster?: Map<string, string>): Promise<FetchResult>
  findEventByTeams(homeTeam: string, awayTeam: string): Promise<string | null>
}

export interface BookSelectionStrategy {
  preferred: string[]   // ['draftkings', 'fanduel']
  dedup: boolean        // true = one line per player/market, no double-counting
}
```

### Caching Strategy

**Two-tier cache:**
1. **In-memory** (per Vercel instance) - 15-minute TTL, reduces DB round-trips
2. **Supabase** - Persistent for cold starts and `last_known_good` fallback

**Supabase table:**
```sql
CREATE TABLE odds_cache (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  market TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ttl_seconds INT NOT NULL DEFAULT 900,
  PRIMARY KEY (provider, event_id, market)
);
```

**Cache flow:**
1. Check in-memory → HIT? Return
2. Check Supabase → fresh? Return + populate memory
3. Fetch API → success? Upsert both caches
4. Fetch fails → return Supabase stale row as `STALE_FALLBACK`
5. No cache at all → `ERROR`, empty propLines

### Failure Mode

**Non-negotiable contract:** Never hallucinate prop lines.

- API fails + no cache = `cacheStatus: ERROR`, `propLines: []`
- Build prompt explicitly forbids player props when ERROR
- Every numeric `point` in propLines must trace to `raw` provider data

### Team Resolution

The Odds API outcomes often lack team info. Resolution chain:
1. Parse `(NE)` suffix from `outcome.description` if present
2. Lookup `normalizePlayerName(player)` in roster Map from projections
3. Leave `team: undefined` if unresolved (explicit state, not wrong data)
4. Log `unresolved_team_count` for monitoring

Target: ≥95% resolution rate.

### Book Selection

- Preference order: `['draftkings', 'fanduel']`
- First available book wins (no mixing)
- Dedup by `player|market|point` - both Over/Under on same PropLine
- Stable across repeated calls

### Validation

O/U markets (`player_rush_yds`, `player_pass_yds`, etc.) must have both Over and Under at same point. One-sided markets logged as `incomplete_line_count`.

## Integration

### props-roster.ts

```typescript
export interface PropsRosterResult {
  // ... existing ...
  propLines: PropLine[]  // Legacy format for Build

  odds: {
    source: string              // 'the-odds-api' | 'xo-fallback' | 'none'
    cacheStatus: string         // 'HIT' | 'MISS' | 'STALE_FALLBACK' | 'ERROR'
    fetchedAt: string
    creditsSpent: number
    bookmaker: string
    propLinesCount: number
    playersWithLines: number
    incompleteLineCount: number
  }
}
```

Adapter converts new `OddsProviderPropLine` → legacy `PropLine` format until Build migrates.

### Build Route

Response includes full telemetry:
```json
{
  "odds_source": "the-odds-api",
  "odds_cache_status": "HIT",
  "odds_fetched_at": "2026-01-25T18:30:00Z",
  "odds_credits_spent": 0,
  "odds_bookmaker": "draftkings",
  "prop_lines_count": 47,
  "players_with_lines": 18,
  "incomplete_line_count": 0
}
```

When `cache_status: ERROR`, prompt includes:
```
**PROP LINES UNAVAILABLE** (odds_source: the-odds-api, status: ERROR)
Do NOT generate any player prop suggestions. Use ONLY game-level markets.
```

## Acceptance Tests

| Test | Assertion |
|------|-----------|
| Live lines with telemetry | `odds_source`, `cache_status`, `bookmaker` present; real lines in propLines |
| Cache HIT | Second call within TTL: `cache_status: HIT`, `creditsSpent: 0` |
| No hallucination on ERROR | `propLines: []`, `player_props_enabled: false` |
| Point traceability | Every `point` in propLines exists in `raw` provider data |
| Team resolution | ≥95% of lines have resolved team; `unresolved_team_count` logged |
| Book selection stable | Always selects first available from preference list |
| No double-counting | One book only, deduped by player/market/point |
| Repeated calls identical | Same input → same output |

## Environment Variables

```bash
# Required for v1
THE_ODDS_API_KEY=your-api-key

# Optional (default: false)
ODDS_FALLBACK_XO=false
```

## Migration

1. Create `odds_cache` table in Supabase
2. Implement `lib/odds-provider/` modules
3. Update `props-roster.ts` to use new provider
4. Update Build route to include telemetry
5. Run acceptance tests
6. Deploy with `THE_ODDS_API_KEY` set
7. Verify live lines in production
8. Remove XO code in cleanup commit

## Budget

500 credits/month with 15-minute caching:
- ~33 requests/day max
- 2-4 games × 3-4 refreshes on game day
- Monitor via `credits_spent` in logs
