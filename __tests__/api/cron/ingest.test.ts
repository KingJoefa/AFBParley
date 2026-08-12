import { afterEach, describe, expect, it } from 'vitest'
import { GET } from '@/app/api/cron/ingest/route'

const original = {
  cronSecret: process.env.CRON_SECRET,
  postgresUrl: process.env.POSTGRES_URL,
  databaseUrl: process.env.DATABASE_URL,
}

afterEach(() => {
  if (original.cronSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = original.cronSecret
  if (original.postgresUrl === undefined) delete process.env.POSTGRES_URL
  else process.env.POSTGRES_URL = original.postgresUrl
  if (original.databaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = original.databaseUrl
})

describe('/api/cron/ingest', () => {
  it('skips safely before production secrets are configured', async () => {
    delete process.env.CRON_SECRET
    delete process.env.POSTGRES_URL
    delete process.env.DATABASE_URL

    const response = await GET(new Request('http://localhost/api/cron/ingest'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('skipped')
  })

  it('rejects a request that does not carry the configured secret', async () => {
    process.env.CRON_SECRET = 'test-secret'
    const response = await GET(new Request('http://localhost/api/cron/ingest'))

    expect(response.status).toBe(401)
  })
})
