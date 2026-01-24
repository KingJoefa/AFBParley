-- Create odds_cache table for The Odds API caching
-- Two-tier cache: in-memory (per instance) + Supabase (persistent)

CREATE TABLE IF NOT EXISTS odds_cache (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  market TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ttl_seconds INT NOT NULL DEFAULT 900,
  PRIMARY KEY (provider, event_id, market)
);

-- Index for cleanup queries and TTL checks
CREATE INDEX IF NOT EXISTS idx_odds_cache_fetched_at ON odds_cache (fetched_at);

-- Index for provider-specific queries
CREATE INDEX IF NOT EXISTS idx_odds_cache_provider ON odds_cache (provider);

COMMENT ON TABLE odds_cache IS 'Cache for sportsbook odds data from The Odds API and other providers';
COMMENT ON COLUMN odds_cache.provider IS 'Provider identifier: the-odds-api, xo-fallback';
COMMENT ON COLUMN odds_cache.event_id IS 'Event identifier from provider';
COMMENT ON COLUMN odds_cache.market IS 'Comma-separated sorted market keys';
COMMENT ON COLUMN odds_cache.payload_json IS 'Cached EventProps JSON';
COMMENT ON COLUMN odds_cache.ttl_seconds IS 'Time-to-live in seconds (default 900 = 15 minutes)';
