# ParlayGPT • AFB Builder

A Next.js 14 web UI for generating Assisted Football Betting (AFB) scripts, backed by a Node/Express server calling the OpenAI API. Includes bet slip sharing, BYOA context upload (files or folder of .md), and a weekly NFL schedule feed.

## Requirements
- Node.js 18+
- OpenAI API key in env: `OPENAI_API_KEY` (or `GPT_API_KEY`)

## Quick start (dev)
1) Install deps:
```bash
npm install
```
2) Start backend (8080):
```bash
cd my-parlaygpt
export OPENAI_API_KEY=sk-...
export PORT=8080
npm start
```
3) Start frontend (3000):
```bash
cd ..
npm run dev
```
- Next proxies `/api/*` → `http://localhost:8080` (see `next.config.mjs`).

## Features
- Assisted Builder: voice/variance/focus areas, optional line focus
- BYOA: upload files or pick a folder (loads `.md` recursively)
  - Caps: 100 files, 100 MB total; per-file soft cap 256 KB
- Bet slips: single-card view with script switcher, download/share image
- NFL schedule: dropdown fed by backend (2025 Wk 5 seed, Giants @ Saints 2025‑10‑05)

## Backend endpoints (selected)
- `POST /api/afb` → generate AFB scripts (JSON preferred; text fallback)
- `POST /api/chat` → general chat
- `GET  /api/nfl/schedule` → week data
- `POST /api/focus/upload` (multipart): `weekId`, `category` (pace|redzone|explosive|pressure|ol_dl|weather|injuries), `file`
- `GET  /api/focus/status?weekId=current` → availability booleans

## Config
- Tailwind theme: `tailwind.config.ts`, styles: `app/globals.css`
- Minimal telemetry: `lib/telemetry.ts`
- Cursor MCP: `.cursor/mcp.json` includes LocalFiles for `/Users/zfarleymacstudio/agents`

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
