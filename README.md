# ParlayGPT • AFB Builder (Next-only)

Generate correlated same‑game parlay “scripts” with a Next.js 14 app and Route Handlers (no separate Express server). UI includes a modern builder flow and shareable bet slips. The server keeps a small, bounded profile memory you can read/write.

## Requirements
- Node.js 18+
- OpenAI API key in env: `OPENAI_API_KEY` (or `GPT_API_KEY`)

## Quick start (dev)
1) Install deps:
```bash
npm install
```
2) Start dev server (3000):
```bash
export OPENAI_API_KEY=sk-...
npm run dev
```
- All APIs are served by Next Route Handlers.

## Features
- Assisted Builder: voice/variance/focus areas, optional line focus
- Bet slips: single-card view with script switcher, download/share image
- NFL schedule: dropdown fed by backend (2025 Wk 5 seed, Giants @ Saints 2025‑10‑05)

## API
- `POST /api/afb` → generate AFB scripts (plain text; deterministic sample if no OPENAI_API_KEY)
- `GET  /api/nfl/schedule` → week data
- `GET/POST /api/memory` → profile memory (guarded by API key and allowlist)

## Config
- Tailwind theme: `tailwind.config.ts`, styles: `app/globals.css`
- Minimal telemetry: `lib/telemetry.ts`
- Cursor MCP: `.cursor/mcp.json` includes LocalFiles for `/Users/zfarleymacstudio/agents`

### Memory & Security
- Dev-only in-memory store with LRU bounds: `MEMORY_MAX_PROFILES` (default 100) and `MEMORY_MAX_BYTES` (~1MB). Resets on restart.
- Set `MEMORY_API_KEY` and include `x-api-key` header for access control.
- Restrict profile IDs with `ALLOWED_PROFILES` (comma-separated).
- Only whitelisted fields are forwarded into prompts (currently `house_rules`, `angles_preferred`).

## Troubleshooting
- Port in use (8080): `lsof -ti tcp:8080 | xargs kill -9`
- Next dev module error: stop dev, remove `.next/`, restart
- OpenAI errors: ensure key is exported before starting backend

## Scripts
```bash
npm run dev      # Next dev (3000)
npm run build    # Next build
npm start        # Next start (prod)
```
(Backend runs separately: `cd my-parlaygpt && npm start`)

## License
MIT
