/**
 * Terminal Invariant Tests
 *
 * Verifies:
 * 1. Each mode (prop, story, parlay) calls correct endpoint
 * 2. Each mode returns correct output shape
 * 3. Error path (feature flag disabled) returns proper error response
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the agent runner
vi.mock('@/lib/terminal/engine/agent-runner', () => ({
  runAgents: vi.fn(),
}))

// Mock the analyst
vi.mock('@/lib/terminal/analyst', () => ({
  analyzeFindings: vi.fn(),
}))

import { runAgents } from '@/lib/terminal/engine/agent-runner'
import { analyzeFindings } from '@/lib/terminal/analyst'

// Mock findings for testing
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
    id: 'qb-1',
    agent: 'qb',
    type: 'passing_efficiency',
    stat: 'qb_rating',
    value_num: 115,
    value_type: 'numeric',
    threshold_met: 'elite',
    comparison_context: 'vs coverage',
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
    claim: 'DK Metcalf O 75.5 receiving yards',
    implications: ['wr_yards_over', 'game_script'],
    suppressions: [],
    evidence: [{ stat: 'target_share_rank', value_num: 5, value_type: 'numeric', comparison: 'vs weak defense', source_type: 'web', source_ref: 'stats.nfl.com' }],
    sources: [{ type: 'web', ref: 'stats.nfl.com', data_version: '2025-week-20', data_timestamp: Date.now() }],
    confidence: 0.85,
    freshness: 'live',
  },
  {
    id: 'qb-1',
    agent: 'qb',
    severity: 'high',
    claim: 'Geno Smith O 250.5 passing yards',
    implications: ['qb_passing_over', 'game_script'],
    suppressions: [],
    evidence: [{ stat: 'qb_rating', value_num: 115, value_type: 'numeric', comparison: 'vs coverage', source_type: 'web', source_ref: 'stats.nfl.com' }],
    sources: [{ type: 'web', ref: 'stats.nfl.com', data_version: '2025-week-20', data_timestamp: Date.now() }],
    confidence: 0.82,
    freshness: 'live',
  },
]

describe('Terminal Invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('PROP Route - Happy Path', () => {
    it('returns Alert[] for standalone player tails', async () => {
      vi.mocked(runAgents).mockResolvedValue({
        findings: mockFindings as any,
        agentsInvoked: ['wr', 'qb'],
        agentsSilent: ['epa', 'pressure', 'weather', 'hb', 'te'],
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
      // Invariant: PROP returns Alert[]
      expect(Array.isArray(data.alerts)).toBe(true)
      expect(data.mode).toBe('prop')
      // Invariant: Each alert has required fields
      if (data.alerts.length > 0) {
        expect(data.alerts[0]).toHaveProperty('id')
        expect(data.alerts[0]).toHaveProperty('agent')
        expect(data.alerts[0]).toHaveProperty('claim')
        expect(data.alerts[0]).toHaveProperty('confidence')
      }
      // Invariant: Provenance included
      expect(data.provenance).toBeDefined()
      expect(data.matchup).toEqual({ home: 'SEA', away: 'SF' })
    })
  })

  describe('STORY Route - Happy Path', () => {
    it('returns Alert[] with scripts metadata for single-game narratives', async () => {
      vi.mocked(runAgents).mockResolvedValue({
        findings: mockFindings as any,
        agentsInvoked: ['wr', 'qb'],
        agentsSilent: ['epa', 'pressure', 'weather', 'hb', 'te'],
      })

      vi.mocked(analyzeFindings).mockResolvedValue({
        alerts: mockAlerts as any,
        llmOutput: {},
        errors: [],
        skillMds: {},
        prompt: 'test prompt',
      })

      const { POST } = await import('@/app/api/terminal/story/route')
      const req = new Request('http://localhost/api/terminal/story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchup: 'SF @ SEA' }),
      })

      const response = await POST(req as any)
      const data = await response.json()

      expect(response.status).toBe(200)
      // Invariant: STORY returns Alert[] (unified contract)
      expect(Array.isArray(data.alerts)).toBe(true)
      expect(data.mode).toBe('story')
      // Invariant: scripts metadata included (may be empty if no correlations)
      expect(Array.isArray(data.scripts)).toBe(true)
      // Invariant: Provenance included
      expect(data.provenance).toBeDefined()
    })
  })

  describe('PARLAY Route - Happy Path', () => {
    it('returns Alert[] with scripts for cross-game portfolio', async () => {
      vi.mocked(runAgents).mockResolvedValue({
        findings: mockFindings as any,
        agentsInvoked: ['wr', 'qb'],
        agentsSilent: ['epa', 'pressure', 'weather', 'hb', 'te'],
      })

      vi.mocked(analyzeFindings).mockResolvedValue({
        alerts: mockAlerts as any,
        llmOutput: {},
        errors: [],
        skillMds: {},
        prompt: 'test prompt',
      })

      const { POST } = await import('@/app/api/terminal/parlay/route')
      const req = new Request('http://localhost/api/terminal/parlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchups: ['SF @ SEA', 'KC @ LV'] }),
      })

      const response = await POST(req as any)
      const data = await response.json()

      expect(response.status).toBe(200)
      // Invariant: PARLAY returns Alert[] (unified contract)
      expect(Array.isArray(data.alerts)).toBe(true)
      expect(data.mode).toBe('parlay')
      // Invariant: scripts with risk tiers included
      expect(Array.isArray(data.scripts)).toBe(true)
      // Invariant: Provenance included
      expect(data.provenance).toBeDefined()
    })
  })

  describe('Feature Flag Disabled - Error Path', () => {
    it('PROP returns 503 when disabled', async () => {
      // Mock the feature flags module to return disabled
      vi.doMock('@/lib/terminal/feature-flags', () => ({
        isActionEnabled: vi.fn().mockImplementation((action: string) => action !== 'prop'),
        TERMINAL_FLAGS: { propEnabled: false, storyEnabled: true, parlayEnabled: true },
      }))

      // Re-import the route with mocked flags
      vi.resetModules()
      const { POST } = await import('@/app/api/terminal/prop/route')

      const req = new Request('http://localhost/api/terminal/prop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchup: 'SF @ SEA' }),
      })

      const response = await POST(req as any)
      const data = await response.json()

      // Invariant: Disabled feature returns 503 with error
      expect(response.status).toBe(503)
      expect(data.error).toContain('disabled')
      expect(data.mode).toBe('prop')
    })

    it('STORY returns 503 when disabled', async () => {
      vi.doMock('@/lib/terminal/feature-flags', () => ({
        isActionEnabled: vi.fn().mockImplementation((action: string) => action !== 'story'),
        TERMINAL_FLAGS: { propEnabled: true, storyEnabled: false, parlayEnabled: true },
      }))

      vi.resetModules()
      const { POST } = await import('@/app/api/terminal/story/route')

      const req = new Request('http://localhost/api/terminal/story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchup: 'SF @ SEA' }),
      })

      const response = await POST(req as any)
      const data = await response.json()

      expect(response.status).toBe(503)
      expect(data.error).toContain('disabled')
      expect(data.mode).toBe('story')
    })

    it('PARLAY returns 503 when disabled', async () => {
      vi.doMock('@/lib/terminal/feature-flags', () => ({
        isActionEnabled: vi.fn().mockImplementation((action: string) => action !== 'parlay'),
        TERMINAL_FLAGS: { propEnabled: true, storyEnabled: true, parlayEnabled: false },
      }))

      vi.resetModules()
      const { POST } = await import('@/app/api/terminal/parlay/route')

      const req = new Request('http://localhost/api/terminal/parlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchups: ['SF @ SEA'] }),
      })

      const response = await POST(req as any)
      const data = await response.json()

      expect(response.status).toBe(503)
      expect(data.error).toContain('disabled')
      expect(data.mode).toBe('parlay')
    })
  })

  describe('Response Contract Compliance', () => {
    beforeEach(() => {
      vi.mocked(runAgents).mockResolvedValue({
        findings: mockFindings as any,
        agentsInvoked: ['wr', 'qb'],
        agentsSilent: ['epa', 'pressure', 'weather', 'hb', 'te'],
      })

      vi.mocked(analyzeFindings).mockResolvedValue({
        alerts: mockAlerts as any,
        llmOutput: {},
        errors: [],
        skillMds: {},
        prompt: 'test prompt',
      })
    })

    it('all modes share unified Alert[] contract', async () => {
      const modes = ['prop', 'story', 'parlay'] as const
      const requests = {
        prop: { matchup: 'SF @ SEA' },
        story: { matchup: 'SF @ SEA' },
        parlay: { matchups: ['SF @ SEA', 'KC @ LV'] },
      }

      for (const mode of modes) {
        vi.resetModules()
        const route = await import(`@/app/api/terminal/${mode}/route`)

        const req = new Request(`http://localhost/api/terminal/${mode}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requests[mode]),
        })

        const response = await route.POST(req as any)
        const data = await response.json()

        if (response.status === 200) {
          // All modes return alerts array
          expect(Array.isArray(data.alerts)).toBe(true)
          // All modes return mode identifier
          expect(data.mode).toBe(mode)
          // All modes return provenance
          expect(data.provenance).toBeDefined()
          // All modes return agents info
          expect(data.agents).toBeDefined()
          expect(data.agents).toHaveProperty('invoked')
          expect(data.agents).toHaveProperty('silent')
        }
      }
    })
  })
})
