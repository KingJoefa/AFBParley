import { describe, it, expect } from 'vitest'
import { POST } from '@/app/api/terminal/scan/route'
import { NextRequest } from 'next/server'

function createRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/terminal/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/terminal/scan Super Bowl context', () => {
  it('returns non-empty findings for NE @ SEA', async () => {
    const req = createRequest({ matchup: 'NE @ SEA' })
    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(Array.isArray(data.findings)).toBe(true)
    expect(data.findings.length).toBeGreaterThan(0)
  })
})
