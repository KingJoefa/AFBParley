import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST, GET } from '@/app/api/terminal/build/route'
import { NextRequest } from 'next/server'

// Mock crypto for provenance hashing
vi.mock('crypto', () => ({
  createHash: () => ({
    update: () => ({
      digest: () => 'mocked-hash-123',
    }),
  }),
}))

function createRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/terminal/build', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/terminal/build POST', () => {
  it('returns 400 for invalid request body', async () => {
    const req = createRequest({ invalid: true })
    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid request')
  })

  it('returns 400 when alert_ids has less than 2 items', async () => {
    const req = createRequest({
      alert_ids: ['single-alert'],
      alert_metadata: [{ id: 'single-alert', agent: 'epa', market: 'Test', confidence: 0.5 }],
    })
    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid request')
  })

  it('builds scripts from weather cascade correlation', async () => {
    const req = createRequest({
      alert_ids: ['weather-1', 'qb-1', 'wr-1'],
      alert_metadata: [
        { id: 'weather-1', agent: 'weather', market: 'Game Total Under 42.5', confidence: 0.65 },
        { id: 'qb-1', agent: 'qb', market: 'Burrow Under 275.5 Pass', confidence: 0.6 },
        { id: 'wr-1', agent: 'wr', market: 'Chase Under 100.5 Yards', confidence: 0.55 },
      ],
    })
    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.scripts.length).toBeGreaterThan(0)
    expect(data.scripts[0].correlation_type).toBe('weather_cascade')
    expect(data.alerts_used).toContain('weather-1')
  })

  it('builds scripts from defensive funnel correlation', async () => {
    const req = createRequest({
      alert_ids: ['pressure-1', 'qb-1'],
      alert_metadata: [
        { id: 'pressure-1', agent: 'pressure', market: 'Defense 3+ Sacks', confidence: 0.7 },
        { id: 'qb-1', agent: 'qb', market: 'QB Under 250.5 Pass Yards', confidence: 0.65 },
      ],
    })
    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.scripts.some((s: { correlation_type: string }) => s.correlation_type === 'defensive_funnel')).toBe(true)
  })

  it('returns empty scripts when no correlations found', async () => {
    const req = createRequest({
      alert_ids: ['te-1', 'te-2'],
      alert_metadata: [
        { id: 'te-1', agent: 'te', market: 'TE 1 Over 45.5 Yards', confidence: 0.5 },
        { id: 'te-2', agent: 'te', market: 'TE 2 Over 40.5 Yards', confidence: 0.5 },
      ],
    })
    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.scripts).toHaveLength(0)
    expect(data.alerts_excluded).toContain('te-1')
    expect(data.alerts_excluded).toContain('te-2')
  })

  it('includes provenance hash and timing', async () => {
    const req = createRequest({
      alert_ids: ['weather-1', 'qb-1'],
      alert_metadata: [
        { id: 'weather-1', agent: 'weather', market: 'Under 42.5', confidence: 0.6 },
        { id: 'qb-1', agent: 'qb', market: 'Under 250.5', confidence: 0.55 },
      ],
    })
    const response = await POST(req)
    const data = await response.json()

    expect(data.provenance_hash).toBeDefined()
    expect(data.build_timestamp).toBeDefined()
    expect(data.timing_ms).toBeDefined()
    expect(data.request_id).toBeDefined()
  })

  it('respects max_legs option', async () => {
    const req = createRequest({
      alert_ids: ['weather-1', 'qb-1', 'wr-1', 'te-1'],
      alert_metadata: [
        { id: 'weather-1', agent: 'weather', market: 'Under 42.5', confidence: 0.6 },
        { id: 'qb-1', agent: 'qb', market: 'Under 250.5', confidence: 0.55 },
        { id: 'wr-1', agent: 'wr', market: 'Over 75.5', confidence: 0.5 },
        { id: 'te-1', agent: 'te', market: 'Over 40.5', confidence: 0.5 },
      ],
      options: { max_legs: 2 },
    })
    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    // Each script should have at most 2 legs
    for (const script of data.scripts) {
      expect(script.legs.length).toBeLessThanOrEqual(2)
    }
  })

  it('assigns appropriate risk levels', async () => {
    const req = createRequest({
      alert_ids: ['weather-1', 'qb-1'],
      alert_metadata: [
        { id: 'weather-1', agent: 'weather', market: 'Under 42.5', confidence: 0.8 },
        { id: 'qb-1', agent: 'qb', market: 'Under 250.5', confidence: 0.75 },
      ],
    })
    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    if (data.scripts.length > 0) {
      // High confidence 2-leg should be conservative
      expect(['conservative', 'moderate']).toContain(data.scripts[0].risk_level)
    }
  })
})

describe('/api/terminal/build GET', () => {
  it('returns endpoint documentation', async () => {
    const response = await GET()
    const data = await response.json()

    expect(data.endpoint).toBe('/api/terminal/build')
    expect(data.method).toBe('POST')
    expect(data.schema).toBeDefined()
    expect(data.correlation_types).toBeDefined()
    expect(data.example).toBeDefined()
  })
})
