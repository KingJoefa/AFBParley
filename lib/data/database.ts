import postgres from 'postgres'

type DatabaseClient = ReturnType<typeof postgres>

declare global {
  var swantailDatabase: DatabaseClient | undefined
}

export function databaseUrl(): string | null {
  return process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? null
}

export function isDatabaseConfigured(): boolean {
  return databaseUrl() !== null
}

export function getDatabase(): DatabaseClient | null {
  const url = databaseUrl()
  if (!url) return null
  if (!global.swantailDatabase) {
    global.swantailDatabase = postgres(url, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
      ...(process.env.NODE_ENV === 'production' ? { ssl: 'require' } : {}),
    })
  }
  return global.swantailDatabase
}
