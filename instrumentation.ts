import path from 'path'
import { existsSync, readdirSync } from 'fs'
import { startNflScheduleAutoUpdate } from './lib/nfl/autoUpdate'
import { startXoComboPoller } from './lib/xo/poller'

type EnvReport = {
  name: string
  configured: boolean
}

function listDirRelative(relPath: string): string[] {
  try {
    return readdirSync(path.join(process.cwd(), relPath))
  } catch {
    return []
  }
}

function summarizeEnv(names: string[]): EnvReport[] {
  return names.map((name) => ({
    name,
    configured: Boolean(process.env[name] && process.env[name]?.length),
  }))
}

export async function register() {
  const timestamp = new Date().toISOString()

  const envReport = summarizeEnv([
    'NODE_ENV',
    'OPENAI_API_KEY',
    'GPT_API_KEY',
    'GPT_MODEL_ID',
    'GPT_BASE_URL',
  ])

  const projectFeatures = {
    hasAppDir: existsSync(path.join(process.cwd(), 'app')),
    hasApiRoutes: existsSync(path.join(process.cwd(), 'app', 'api')),
    hasAssistedBuilder: existsSync(path.join(process.cwd(), 'components', 'AssistedBuilder.tsx')),
    hasLegacyService: existsSync(path.join(process.cwd(), 'my-parlaygpt', 'server.js')),
  }

  const apiRoutes = listDirRelative('app/api')

  console.info('[startup] ParlayGPT Next server booting', {
    timestamp,
    nodeVersion: process.version,
    platform: process.platform,
    cwd: process.cwd(),
    envReport,
    projectFeatures,
    apiRoutes,
  })

  // Kick off optional NFL schedule auto-update loop (no-op without env source)
  try { startNflScheduleAutoUpdate() } catch {}

  // Start XO combination odds poller (server-side only, no UI)
  try {
    // Build origin for internal calls (Next dev server or prod host)
    const host = process.env.NEXT_INTERNAL_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`
    startXoComboPoller(host)
  } catch {}
}
