/**
 * PROP Route Tests
 *
 * Tests the /api/terminal/prop endpoint for:
 * - Request validation
 * - Matchup parsing
 * - Response contract compliance
 * - Prop filtering logic
 * - Alert ranking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the agent runner to return controlled findings
vi.mock('@/lib/terminal/engine/agent-runner', () => ({
  runAgents: vi.fn(),
}))

// Mock the analyst to avoid LLM calls in tests
vi.mock('@/lib/terminal/analyst', () => ({
  analyzeFindings: vi.fn(),
}))

import { runAgents } from '@/lib/terminal/engine/agent-runner'
import { analyzeFindings } from '@/lib/terminal/analyst'
import propMatchupFixture from '../fixtures/prop-matchup.json'

describe('/api/terminal/prop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Request Validation', () => {
    it('rejects missing matchup', async () => {
      const { POST } = await import('@/app/api/terminal/prop/route')
      const req = new Request('http://localhost/api/terminal/prop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const response = await POST(req as any)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Invalid request')
    })

    it('rejects invalid matchup format', async () => {
      const { POST } = await import('@/app/api/terminal/prop/route')
      const req = new Request('http://localhost/api/terminal/prop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchup: 'invalid' }),
      })

      const response = await POST(req as any)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Invalid matchup format')
    })

    it('accepts valid matchup with @ format', async () => {
      vi.mocked(runAgents).mockResolvedValue({
        findings: [],
        agentsInvoked: [],
        agentsSilent: ['epa', 'pressure', 'weather', 'qb', 'hb', 'wr', 'te'],
      })

      const { POST } = await import('@/app/api/terminal/prop/route')
      const req = new Request('http://localhost/api/terminal/prop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchup: 'SF @ SEA' }),
      })

      const response = await POST(req as any)
      expect(response.status).toBe(200)
    })

    it('accepts valid matchup with vs format', async () => {
      vi.mocked(runAgents).mockResolvedValue({
        findings: [],
        agentsInvoked: [],
        agentsSilent: ['epa', 'pressure', 'weather', 'qb', 'hb', 'wr', 'te'],
      })

      const { POST } = await import('@/app/api/terminal/prop/route')
      const req = new Request('http://localhost/api/terminal/prop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchup: 'Chiefs vs Raiders' }),
      })

      const response = await POST(req as any)
      expect(response.status).toBe(200)
    })
  })

  describe('Response Contract', () => {
    it('returns Alert[] with empty findings', async () => {
      vi.mocked(runAgents).mockResolvedValue({
        findings: [],
        agentsInvoked: [],
        agentsSilent: ['epa', 'pressure', 'weather', 'qb', 'hb', 'wr', 'te'],
      })

      const { POST } = await import('@/app/api/terminal/prop/route')
      const req = new Request('http://localhost/api/terminal/prop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchup: 'SF @ SEA' }),
      })

      const response = await POST(req as any)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.alerts).toEqual([])
      expect(data.mode).toBe('prop')
      expect(data.matchup).toEqual({ home: 'SEA', away: 'SF' })
      expect(data.agents).toBeDefined()
      expect(data.provenance).toBeDefined()
      expect(data.timing_ms).toBeDefined()
    })

    it('returns Alert[] with findings', async () => {
      const mockFindings = [
        {
          id: 'wr-1',
          agent: 'wr',
          type: 'target_share_elite',
          stat: 'target_share_rank',
          value_num: 5,
          value_type: 'numeric',
          threshold_met: 'top_10',
          comparison_context: 'vs weak SEA pass defense',
          source_ref: 'stats.nfl.com',
          source_type: 'web',
          source_timestamp: Date.now(),
        },
      ]

      const mockAlerts = [
        {
          id: 'wr-1',
          agent: 'wr',
          severity: 'high',
          claim: 'DK Metcalf target share top-5 vs weak pass defense',
          implications: ['wr_receptions_over', 'wr_yards_over'],
          suppressions: [],
          evidence: [
            {
              stat: 'target_share_rank',
              value_num: 5,
              value_type: 'numeric',
              comparison: 'vs weak SEA pass defense',
              source_type: 'web',
              source_ref: 'stats.nfl.com',
            },
          ],
          sources: [
            {
              type: 'web',
              ref: 'stats.nfl.com',
              data_version: '2025-week-19',
              data_timestamp: Date.now(),
            },
          ],
          confidence: 0.85,
          freshness: 'live',
        },
      ]

      vi.mocked(runAgents).mockResolvedValue({
        findings: mockFindings as any,
        agentsInvoked: ['wr'],
        agentsSilent: ['epa', 'pressure', 'weather', 'qb', 'hb', 'te'],
      })

      vi.mocked(analyzeFindings).mockResolvedValue({
        alerts: mockAlerts as any,
        llmOutput: {},
        errors: [],
        skillMds: {},
        prompt: 'test prompt',
      })

      const { POST } = await import('@/app/api/terminal/prop/route')
      const req = new Request('http://localhost/api/terminal/prop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchup: 'SF @ SEA' }),
      })

      const response = await POST(req as any)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.alerts.length).toBe(1)
      expect(data.alerts[0].id).toBe('wr-1')
      expect(data.alerts[0].agent).toBe('wr')
      expect(data.mode).toBe('prop')
    })
  })

  describe('Prop Filtering', () => {
    it('filters out non-player agent findings', async () => {
      const mockFindings = [
        {
          id: 'wr-1',
          agent: 'wr',
          type: 'target_share_elite',
          stat: 'target_share_rank',
          value_num: 5,
          value_type: 'numeric',
          threshold_met: 'top_10',
          comparison_context: 'vs weak pass defense',
          source_ref: 'stats.nfl.com',
          source_type: 'web',
          source_timestamp: Date.now(),
        },
        {
          id: 'epa-1',
          agent: 'epa', // This should be filtered out for prop
          type: 'epa_mismatch',
          stat: 'epa_allowed',
          value_num: 0.15,
          value_type: 'numeric',
          threshold_met: 'top_5',
          comparison_context: 'team-level',
          source_ref: 'stats.nfl.com',
          source_type: 'web',
          source_timestamp: Date.now(),
        },
        {
          id: 'weather-1',
          agent: 'weather', // This should be filtered out for prop
          type: 'wind_impact',
          stat: 'wind_mph',
          value_num: 25,
          value_type: 'numeric',
          threshold_met: 'high_wind',
          comparison_context: 'outdoor game',
          source_ref: 'weather.com',
          source_type: 'web',
          source_timestamp: Date.now(),
        },
        {
          id: 'pressure-1',
          agent: 'pressure', // This should be filtered out for prop
          type: 'pressure_rate',
          stat: 'pressure_rate_rank',
          value_num: 3,
          value_type: 'numeric',
          threshold_met: 'elite',
          comparison_context: 'team-level',
          source_ref: 'stats.nfl.com',
          source_type: 'web',
          source_timestamp: Date.now(),
        },
      ]

      vi.mocked(runAgents).mockResolvedValue({
        findings: mockFindings as any,
        agentsInvoked: ['wr', 'epa', 'weather', 'pressure'],
        agentsSilent: ['qb', 'hb', 'te'],
      })

      vi.mocked(analyzeFindings).mockResolvedValue({
        alerts: [
          {
            id: 'wr-1',
            agent: 'wr',
            severity: 'high',
            claim: 'test',
            implications: ['wr_yards_over'],
            suppressions: [],
            evidence: [],
            sources: [],
            confidence: 0.85,
            freshness: 'live',
          },
        ] as any,
        llmOutput: {},
        errors: [],
        skillMds: {},
        prompt: 'test prompt',
      })

      const { POST } = await import('@/app/api/terminal/prop/route')
      const req = new Request('http://localhost/api/terminal/prop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchup: 'SF @ SEA' }),
      })

      await POST(req as any)

      // Verify analyzeFindings was called with only WR findings
      expect(analyzeFindings).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ agent: 'wr' }),
        ]),
        expect.any(String)
      )

      // Verify EPA, weather, pressure findings were filtered out
      const callArgs = vi.mocked(analyzeFindings).mock.calls[0][0]
      expect(callArgs.every((f: any) => ['wr', 'te', 'hb', 'qb'].includes(f.agent))).toBe(true)
    })
  })

  describe('Alert Ranking', () => {
    it('ranks alerts by confidence', async () => {
      const mockFindings = [
        { id: 'wr-1', agent: 'wr' },
        { id: 'wr-2', agent: 'wr' },
      ]

      const mockAlerts = [
        {
          id: 'wr-1',
          agent: 'wr',
          confidence: 0.65,
          severity: 'medium',
          claim: 'lower confidence',
          implications: ['wr_yards_over'],
          suppressions: [],
          evidence: [],
          sources: [],
          freshness: 'live',
        },
        {
          id: 'wr-2',
          agent: 'wr',
          confidence: 0.92,
          severity: 'high',
          claim: 'higher confidence',
          implications: ['wr_receptions_over', 'wr_yards_over'],
          suppressions: [],
          evidence: [],
          sources: [],
          freshness: 'live',
        },
      ]

      vi.mocked(runAgents).mockResolvedValue({
        findings: mockFindings as any,
        agentsInvoked: ['wr'],
        agentsSilent: [],
      })

      vi.mocked(analyzeFindings).mockResolvedValue({
        alerts: mockAlerts as any,
        llmOutput: {},
        errors: [],
        skillMds: {},
        prompt: 'test prompt',
      })

      const { POST } = await import('@/app/api/terminal/prop/route')
      const req = new Request('http://localhost/api/terminal/prop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchup: 'SF @ SEA' }),
      })

      const response = await POST(req as any)
      const data = await response.json()

      // Higher confidence should be first
      expect(data.alerts[0].confidence).toBe(0.92)
      expect(data.alerts[1].confidence).toBe(0.65)
    })

    it('respects max_props limit', async () => {
      const mockFindings = Array.from({ length: 15 }, (_, i) => ({
        id: `wr-${i}`,
        agent: 'wr',
      }))

      const mockAlerts = Array.from({ length: 15 }, (_, i) => ({
        id: `wr-${i}`,
        agent: 'wr',
        confidence: 0.9 - i * 0.05,
        severity: i < 3 ? 'high' : 'medium',
        claim: `alert ${i}`,
        implications: ['wr_yards_over'],
        suppressions: [],
        evidence: [],
        sources: [],
        freshness: 'live',
      }))

      vi.mocked(runAgents).mockResolvedValue({
        findings: mockFindings as any,
        agentsInvoked: ['wr'],
        agentsSilent: [],
      })

      vi.mocked(analyzeFindings).mockResolvedValue({
        alerts: mockAlerts as any,
        llmOutput: {},
        errors: [],
        skillMds: {},
        prompt: 'test prompt',
      })

      const { POST } = await import('@/app/api/terminal/prop/route')
      const req = new Request('http://localhost/api/terminal/prop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchup: 'SF @ SEA',
          options: { max_props: 5 },
        }),
      })

      const response = await POST(req as any)
      const data = await response.json()

      expect(data.alerts.length).toBe(5)
    })
  })

  describe('GET endpoint', () => {
    it('returns API documentation', async () => {
      const { GET } = await import('@/app/api/terminal/prop/route')

      const response = await GET()
      const data = await response.json()

      expect(data.endpoint).toBe('/api/terminal/prop')
      expect(data.method).toBe('POST')
      expect(data.schema.matchup).toBeDefined()
      expect(data.response.alerts).toBeDefined()
    })
  })
})
