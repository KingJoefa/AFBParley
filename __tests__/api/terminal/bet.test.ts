import { describe, it, expect, vi } from 'vitest'
import { POST, GET } from '@/app/api/terminal/bet/route'
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
  return new NextRequest('http://localhost/api/terminal/bet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/terminal/bet POST', () => {
  it('returns 400 for invalid request body', async () => {
    const req = createRequest({ invalid: true })
    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid request')
  })

  it('returns 400 when alert_ids is empty', async () => {
    const req = createRequest({
      alert_ids: [],
      alert_metadata: [],
    })
    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid request')
  })

  it('creates safe tier ladder for high confidence alerts', async () => {
    const req = createRequest({
      alert_ids: ['epa-1', 'pressure-1'],
      alert_metadata: [
        {
          id: 'epa-1',
          agent: 'epa',
          market: 'Chase Over 85.5 Yards',
          line: 85.5,
          confidence: 0.8,
          severity: 'high',
          claim: 'Elite efficiency vs weak coverage',
        },
        {
          id: 'pressure-1',
          agent: 'pressure',
          market: 'Bosa 1+ Sacks',
          confidence: 0.75,
          severity: 'high',
        },
      ],
    })
    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ladders.some((l: { tier: string }) => l.tier === 'safe')).toBe(true)
  })

  it('creates moderate tier ladder for medium confidence alerts', async () => {
    const req = createRequest({
      alert_ids: ['qb-1'],
      alert_metadata: [
        {
          id: 'qb-1',
          agent: 'qb',
          market: 'Burrow Over 275.5 Pass Yards',
          confidence: 0.6,
          severity: 'medium',
        },
      ],
    })
    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ladders.some((l: { tier: string }) => l.tier === 'moderate')).toBe(true)
  })

  it('creates aggressive tier ladder for lower confidence alerts', async () => {
    const req = createRequest({
      alert_ids: ['hb-1', 'wr-1'],
      alert_metadata: [
        {
          id: 'hb-1',
          agent: 'hb',
          market: 'RB Over 75.5 Rush Yards',
          confidence: 0.4,
          severity: 'medium',
        },
        {
          id: 'wr-1',
          agent: 'wr',
          market: 'WR Over 100.5 Yards',
          confidence: 0.35,
          severity: 'medium',
        },
      ],
    })
    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ladders.some((l: { tier: string }) => l.tier === 'aggressive')).toBe(true)
  })

  it('excludes aggressive tier when include_aggressive is false', async () => {
    const req = createRequest({
      alert_ids: ['hb-1'],
      alert_metadata: [
        {
          id: 'hb-1',
          agent: 'hb',
          market: 'RB Over 75.5 Rush Yards',
          confidence: 0.4,
          severity: 'medium',
        },
      ],
      options: { include_aggressive: false },
    })
    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ladders.some((l: { tier: string }) => l.tier === 'aggressive')).toBe(false)
  })

  it('respects max_rungs_per_ladder option', async () => {
    const req = createRequest({
      alert_ids: ['epa-1', 'epa-2', 'epa-3', 'epa-4'],
      alert_metadata: [
        { id: 'epa-1', agent: 'epa', market: 'M1', confidence: 0.8, severity: 'high' },
        { id: 'epa-2', agent: 'epa', market: 'M2', confidence: 0.75, severity: 'high' },
        { id: 'epa-3', agent: 'epa', market: 'M3', confidence: 0.72, severity: 'high' },
        { id: 'epa-4', agent: 'epa', market: 'M4', confidence: 0.7, severity: 'high' },
      ],
      options: { max_rungs_per_ladder: 2 },
    })
    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    for (const ladder of data.ladders) {
      expect(ladder.rungs.length).toBeLessThanOrEqual(2)
    }
  })

  it('returns empty ladders when no alerts qualify', async () => {
    const req = createRequest({
      alert_ids: ['low-conf-1'],
      alert_metadata: [
        {
          id: 'low-conf-1',
          agent: 'te',
          market: 'TE Over 30.5 Yards',
          confidence: 0.2, // Too low for any tier
          severity: 'high',
        },
      ],
    })
    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ladders).toHaveLength(0)
    expect(data.alerts_excluded).toContain('low-conf-1')
  })

  it('includes stake recommendations', async () => {
    const req = createRequest({
      alert_ids: ['epa-1'],
      alert_metadata: [
        {
          id: 'epa-1',
          agent: 'epa',
          market: 'Chase Over 85.5 Yards',
          confidence: 0.8,
          severity: 'high',
        },
      ],
    })
    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    if (data.ladders.length > 0) {
      expect(data.ladders[0].recommended_stake_pct).toBeDefined()
      expect(data.ladders[0].recommended_stake_pct).toBeGreaterThan(0)
      expect(data.ladders[0].recommended_stake_pct).toBeLessThanOrEqual(10)
    }
  })

  it('includes provenance hash and timing', async () => {
    const req = createRequest({
      alert_ids: ['epa-1'],
      alert_metadata: [
        {
          id: 'epa-1',
          agent: 'epa',
          market: 'Test Market',
          confidence: 0.7,
          severity: 'high',
        },
      ],
    })
    const response = await POST(req)
    const data = await response.json()

    expect(data.provenance_hash).toBeDefined()
    expect(data.bet_timestamp).toBeDefined()
    expect(data.timing_ms).toBeDefined()
    expect(data.request_id).toBeDefined()
  })

  it('builds rungs with rationale from claim or default', async () => {
    const req = createRequest({
      alert_ids: ['epa-1', 'pressure-1'],
      alert_metadata: [
        {
          id: 'epa-1',
          agent: 'epa',
          market: 'Chase Over 85.5',
          confidence: 0.8,
          severity: 'high',
          claim: 'Custom claim text here',
        },
        {
          id: 'pressure-1',
          agent: 'pressure',
          market: 'Bosa 1+ Sacks',
          confidence: 0.75,
          severity: 'high',
          // No claim - should use default
        },
      ],
    })
    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(200)

    const safeLadder = data.ladders.find((l: { tier: string }) => l.tier === 'safe')
    if (safeLadder) {
      const epaRung = safeLadder.rungs.find((r: { alert_id: string }) => r.alert_id === 'epa-1')
      const pressureRung = safeLadder.rungs.find((r: { alert_id: string }) => r.alert_id === 'pressure-1')

      if (epaRung) {
        expect(epaRung.rationale).toBe('Custom claim text here')
      }
      if (pressureRung) {
        expect(pressureRung.rationale).toContain('PRESSURE agent signal')
      }
    }
  })
})

describe('/api/terminal/bet GET', () => {
  it('returns endpoint documentation', async () => {
    const response = await GET()
    const data = await response.json()

    expect(data.endpoint).toBe('/api/terminal/bet')
    expect(data.method).toBe('POST')
    expect(data.schema).toBeDefined()
    expect(data.risk_tiers).toBeDefined()
    expect(data.stake_recommendations).toBeDefined()
    expect(data.example).toBeDefined()
  })
})
