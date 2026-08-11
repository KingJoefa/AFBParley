import { describe, it, expect, vi } from 'vitest'
import { POST, GET } from '@/app/api/terminal/build/route'
import type { AgentType, Alert } from '@/lib/terminal/schemas'
import { NextRequest } from 'next/server'

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

function createAlert(params: {
  id: string
  agent: AgentType
  claim: string
  confidence: number
}): Alert {
  return {
    id: params.id,
    agent: params.agent,
    severity: params.confidence >= 0.7 ? 'high' : 'medium',
    claim: params.claim,
    implications: ['game_total_under'],
    suppressions: [],
    evidence: [{
      stat: 'test_metric',
      value_str: params.claim,
      value_type: 'string',
      comparison: 'test fixture',
      source_type: 'local',
      source_ref: 'build.test.ts',
    }],
    sources: [{
      type: 'local',
      ref: 'build.test.ts',
      data_version: 'test-v1',
      data_timestamp: 1_700_000_000_000,
    }],
    confidence: params.confidence,
    freshness: 'weekly',
  }
}

function createBuildPayload(alerts: Alert[], options?: { max_legs?: number }) {
  return {
    matchup: 'SF @ SEA',
    alerts,
    findings: [],
    output_type: 'parlay',
    ...(options && { options }),
  }
}

describe('/api/terminal/build POST', () => {
  it('returns 400 for invalid request body', async () => {
    const response = await POST(createRequest({ invalid: true }))
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid request')
  })

  it('rejects the legacy alert_ids request schema', async () => {
    const response = await POST(createRequest({
      alert_ids: ['single-alert'],
      alert_metadata: [{ id: 'single-alert', agent: 'epa', market: 'Test', confidence: 0.5 }],
    }))
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid request')
  })

  it('builds scripts from weather cascade correlation', async () => {
    const alerts = [
      createAlert({ id: 'weather-1', agent: 'weather', claim: 'Game Total Under 42.5', confidence: 0.65 }),
      createAlert({ id: 'qb-1', agent: 'qb', claim: 'Burrow Under 275.5 Pass', confidence: 0.6 }),
      createAlert({ id: 'wr-1', agent: 'wr', claim: 'Chase Under 100.5 Yards', confidence: 0.55 }),
    ]

    const response = await POST(createRequest(createBuildPayload(alerts)))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.view.kind).toBe('terminal')
    expect(data.view.scripts.length).toBeGreaterThan(0)
    expect(data.view.scripts[0].correlation_type).toBe('weather_cascade')
    expect(data.view.scripts[0].legs.map((leg: { alert_id: string }) => leg.alert_id)).toContain('weather-1')
  })

  it('builds scripts from defensive funnel correlation', async () => {
    const alerts = [
      createAlert({ id: 'pressure-1', agent: 'pressure', claim: 'Defense 3+ Sacks', confidence: 0.7 }),
      createAlert({ id: 'qb-1', agent: 'qb', claim: 'QB Under 250.5 Pass Yards', confidence: 0.65 }),
    ]

    const response = await POST(createRequest(createBuildPayload(alerts)))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.view.scripts.some((script: { correlation_type: string }) => script.correlation_type === 'defensive_funnel')).toBe(true)
  })

  it('returns an empty terminal view when no correlations are found', async () => {
    const alerts = [
      createAlert({ id: 'te-1', agent: 'te', claim: 'TE 1 Over 45.5 Yards', confidence: 0.5 }),
      createAlert({ id: 'te-2', agent: 'te', claim: 'TE 2 Over 40.5 Yards', confidence: 0.5 }),
    ]

    const response = await POST(createRequest(createBuildPayload(alerts)))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.view.scripts).toHaveLength(0)
    expect(data.view.alerts.map((alert: Alert) => alert.id)).toEqual(['te-1', 'te-2'])
  })

  it('includes build provenance and timing metadata', async () => {
    const alerts = [
      createAlert({ id: 'weather-1', agent: 'weather', claim: 'Under 42.5', confidence: 0.6 }),
      createAlert({ id: 'qb-1', agent: 'qb', claim: 'Under 250.5', confidence: 0.55 }),
    ]

    const response = await POST(createRequest(createBuildPayload(alerts)))
    const data = await response.json()

    expect(data.payload_hash).toBeDefined()
    expect(data.created_at).toBeDefined()
    expect(data.timing_ms).toBeDefined()
    expect(data.request_id).toBeDefined()
    expect(data.view.scripts[0].provenance_hash).toBeDefined()
  })

  it('respects max_legs option', async () => {
    const alerts = [
      createAlert({ id: 'weather-1', agent: 'weather', claim: 'Under 42.5', confidence: 0.6 }),
      createAlert({ id: 'qb-1', agent: 'qb', claim: 'Under 250.5', confidence: 0.55 }),
      createAlert({ id: 'wr-1', agent: 'wr', claim: 'Over 75.5', confidence: 0.5 }),
      createAlert({ id: 'te-1', agent: 'te', claim: 'Over 40.5', confidence: 0.5 }),
    ]

    const response = await POST(createRequest(createBuildPayload(alerts, { max_legs: 2 })))
    const data = await response.json()

    expect(response.status).toBe(200)
    for (const script of data.view.scripts) {
      expect(script.legs.length).toBeLessThanOrEqual(2)
    }
  })

  it('assigns appropriate risk levels', async () => {
    const alerts = [
      createAlert({ id: 'weather-1', agent: 'weather', claim: 'Under 42.5', confidence: 0.8 }),
      createAlert({ id: 'qb-1', agent: 'qb', claim: 'Under 250.5', confidence: 0.75 }),
    ]

    const response = await POST(createRequest(createBuildPayload(alerts)))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(['conservative', 'moderate']).toContain(data.view.scripts[0].risk_level)
  })
})

describe('/api/terminal/build GET', () => {
  it('returns endpoint documentation for the current contract', async () => {
    const response = await GET()
    const data = await response.json()

    expect(data.endpoint).toBe('/api/terminal/build')
    expect(data.method).toBe('POST')
    expect(data.schema).toBeDefined()
    expect(data.schema.output_type).toContain('story')
    expect(data.response).toBeDefined()
    expect(data.example).toBeDefined()
  })
})
