import path from 'path'
import { existsSync, readdirSync } from 'fs'

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
}
