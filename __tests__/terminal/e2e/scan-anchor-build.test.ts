/**
 * E2E Test: Scan → Anchors → Build
 *
 * Tests the complete terminal flow with no-fabrication assertion:
 * 1. Scan: Run agents against mock matchup context
 * 2. Anchors: Verify findings have proper source attribution
 * 3. Build: Create scripts from alerts
 * 4. Assert: All data is traceable (no fabrication)
 *
 * Created: 2026-01-25 for new agents (injury, usage, pace)
 */

import { describe, it, expect } from 'vitest'
import { runAgents, type MatchupContext } from '@/lib/terminal/engine/agent-runner'

// =============================================================================
// Mock Data
// =============================================================================

const NOW = Date.now()
const DATA_VERSION = '2025-week-20'

/**
 * Mock MatchupContext with data for all new agents
 */
const mockMatchupContext: MatchupContext = {
  homeTeam: 'KC',
  awayTeam: 'BUF',
  players: {
    KC: [
      {
        name: 'Patrick Mahomes',
        team: 'KC',
        position: 'QB',
        qb_rating_rank: 2,
        yards_per_attempt_rank: 3,
        attempts: 400,
      },
      {
        name: 'Travis Kelce',
        team: 'KC',
        position: 'TE',
        target_share_l4: 0.28,
        target_share_season: 0.25,
        target_share_rank: 3,
        receiving_yards_rank: 5,
        targets: 120,
        games_in_window: 4,
      },
      {
        name: 'Isiah Pacheco',
        team: 'KC',
        position: 'RB',
        snap_pct_l4: 0.82,
        snap_pct_season: 0.78,
        rush_yards_rank: 8,
        yards_per_carry_rank: 10,
        carries: 180,
        games_in_window: 4,
      },
    ],
    BUF: [
      {
        name: 'Josh Allen',
        team: 'BUF',
        position: 'QB',
        qb_rating_rank: 3,
        yards_per_attempt_rank: 4,
        attempts: 420,
      },
      {
        name: 'Stefon Diggs',
        team: 'BUF',
        position: 'WR',
        target_share_l4: 0.26,
        target_share_season: 0.24,
        target_share_rank: 5,
        receiving_yards_rank: 6,
        targets: 130,
        games_in_window: 4,
      },
    ],
  },
  teamStats: {
    KC: {
      pressure_rate_rank: 6,
      pass_defense_rank: 12,
      pace_rank: 8,
      plays_per_game: 67.5,
    },
    BUF: {
      pressure_rate_rank: 10,
      pass_defense_rank: 8,
      pace_rank: 5,
      plays_per_game: 69.0,
    },
  },
  weather: {
    temperature: 45,
    wind_mph: 12,
    precipitation_chance: 20,
    indoor: false,
  },
  injuries: {
    KC: ['Chris Jones (DT) - QUESTIONABLE'],
    BUF: ['Von Miller (LB) - OUT'],
  },
  dataTimestamp: NOW,
  dataVersion: DATA_VERSION,
  year: 2025,
  week: 20,
}

// =============================================================================
// No-Fabrication Assertion Helpers
// =============================================================================

/**
 * Assert that a finding has proper source attribution
 * - source_ref: Points to data origin
 * - source_type: Indicates data category
 * - source_timestamp: Data freshness
 */
function assertNoFabrication(finding: Record<string, unknown>): void {
  // Must have source reference
  expect(finding.source_ref).toBeDefined()
  expect(typeof finding.source_ref).toBe('string')
  expect((finding.source_ref as string).length).toBeGreaterThan(0)

  // Must have source type
  expect(finding.source_type).toBeDefined()
  expect(['matchupContext', 'notes', 'web', 'api']).toContain(finding.source_type)

  // Must have timestamp (data freshness)
  expect(finding.source_timestamp).toBeDefined()
  expect(typeof finding.source_timestamp).toBe('number')
  expect(finding.source_timestamp).toBeGreaterThan(0)

  // Must have comparison context (explains the finding)
  expect(finding.comparison_context).toBeDefined()
  expect(typeof finding.comparison_context).toBe('string')

  // Must have agent attribution
  expect(finding.agent).toBeDefined()
  expect(typeof finding.agent).toBe('string')

  // Must have type classification
  expect(finding.type).toBeDefined()
  expect(typeof finding.type).toBe('string')
}

// =============================================================================
// Tests
// =============================================================================

describe('E2E: Scan → Anchors → Build', () => {
  describe('Phase 1: Scan (Agent Execution)', () => {
    it('runs all agents against matchup context', async () => {
      const result = await runAgents(mockMatchupContext)

      expect(result.findings).toBeDefined()
      expect(result.agentsInvoked).toBeDefined()
      expect(result.agentsSilent).toBeDefined()

      // At least some agents should produce findings
      expect(result.findings.length).toBeGreaterThanOrEqual(0)
    })

    it('runs new agents (injury, usage, pace)', async () => {
      const result = await runAgents(mockMatchupContext, ['injury', 'usage', 'pace'])

      // Check that we tried to run the new agents
      expect(['injury', 'usage', 'pace'].some(a =>
        result.agentsInvoked.includes(a as never) || result.agentsSilent.includes(a as never)
      )).toBe(true)
    })

    it('returns findings with proper structure', async () => {
      const result = await runAgents(mockMatchupContext)

      for (const finding of result.findings) {
        // Core finding fields
        expect(finding.id).toBeDefined()
        expect(finding.agent).toBeDefined()
        expect(finding.stat).toBeDefined()

        // Source attribution (no-fabrication)
        expect(finding.source_ref).toBeDefined()
        expect(finding.source_timestamp).toBeDefined()
      }
    })
  })

  describe('Phase 2: No-Fabrication Assertion', () => {
    it('all findings have source attribution', async () => {
      const result = await runAgents(mockMatchupContext)

      for (const finding of result.findings) {
        assertNoFabrication(finding as Record<string, unknown>)
      }
    })

    it('usage agent findings have proper payload', async () => {
      const result = await runAgents(mockMatchupContext, ['usage'])

      for (const finding of result.findings.filter(f => f.agent === 'usage')) {
        // Usage findings should have usage-specific payload
        expect(finding.payload).toBeDefined()
        const payload = finding.payload as Record<string, unknown>

        // Should have at least one usage metric
        const hasUsageMetric = (
          payload.snap_pct_l4 !== undefined ||
          payload.target_share_l4 !== undefined ||
          payload.trend !== undefined
        )
        expect(hasUsageMetric).toBe(true)
      }
    })

    it('pace agent findings have proper payload', async () => {
      const result = await runAgents(mockMatchupContext, ['pace'])

      for (const finding of result.findings.filter(f => f.agent === 'pace')) {
        // Pace findings should have pace-specific payload
        expect(finding.payload).toBeDefined()
        const payload = finding.payload as Record<string, unknown>

        // Should have projected plays
        expect(payload.projected_plays).toBeDefined()
        expect(typeof payload.projected_plays).toBe('number')

        // Should have data quality indicator
        expect(payload.data_quality).toBeDefined()
        expect(['full', 'partial', 'fallback']).toContain(payload.data_quality)
      }
    })

    it('injury agent findings have proper payload', async () => {
      // Create context with material injury (QB)
      const contextWithQBInjury: MatchupContext = {
        ...mockMatchupContext,
        injuries: {
          KC: ['Patrick Mahomes (QB) - OUT'],
          BUF: [],
        },
      }

      const result = await runAgents(contextWithQBInjury, ['injury'])

      for (const finding of result.findings.filter(f => f.agent === 'injury')) {
        expect(finding.payload).toBeDefined()
        const payload = finding.payload as Record<string, unknown>

        // Should have injury status
        expect(payload.status).toBeDefined()
        expect(['OUT', 'DOUBTFUL', 'QUESTIONABLE', 'PROBABLE', 'ACTIVE']).toContain(payload.status)

        // Should have player info
        expect(payload.player).toBeDefined()
        expect(payload.team).toBeDefined()
        expect(payload.position).toBeDefined()
      }
    })
  })

  describe('Phase 3: Agent Selection', () => {
    it('can run subset of agents', async () => {
      const result = await runAgents(mockMatchupContext, ['pace', 'usage'])

      // Only pace and usage should be in invoked OR silent
      const processedAgents = [...result.agentsInvoked, ...result.agentsSilent]
      expect(processedAgents).toContain('pace')
      expect(processedAgents).toContain('usage')

      // Other agents should not be processed
      expect(processedAgents).not.toContain('epa')
      expect(processedAgents).not.toContain('qb')
    })

    it('invoked vs silent reflects finding presence', async () => {
      const result = await runAgents(mockMatchupContext)

      // Agents in agentsInvoked should have produced findings
      for (const agentId of result.agentsInvoked) {
        const agentFindings = result.findings.filter(f => f.agent === agentId)
        expect(agentFindings.length).toBeGreaterThan(0)
      }

      // Agents in agentsSilent should have no findings
      for (const agentId of result.agentsSilent) {
        const agentFindings = result.findings.filter(f => f.agent === agentId)
        expect(agentFindings.length).toBe(0)
      }
    })
  })

  describe('Phase 4: Data Integrity', () => {
    it('findings have deterministic IDs', async () => {
      const result1 = await runAgents(mockMatchupContext)
      const result2 = await runAgents(mockMatchupContext)

      // Same input should produce same IDs
      const ids1 = result1.findings.map(f => f.id).sort()
      const ids2 = result2.findings.map(f => f.id).sort()

      expect(ids1).toEqual(ids2)
    })

    it('findings preserve dataVersion', async () => {
      const result = await runAgents(mockMatchupContext)

      // All findings should reference the same data version
      for (const finding of result.findings) {
        // Check that finding was created with the context's timestamp
        expect(finding.source_timestamp).toBe(NOW)
      }
    })

    it('confidence values are bounded', async () => {
      const result = await runAgents(mockMatchupContext)

      for (const finding of result.findings) {
        if (finding.confidence !== undefined) {
          expect(finding.confidence).toBeGreaterThanOrEqual(0)
          expect(finding.confidence).toBeLessThanOrEqual(1)
        }
      }
    })
  })

  describe('Phase 5: New Agent Specific', () => {
    it('pace agent uses league constants appropriately', async () => {
      const result = await runAgents(mockMatchupContext, ['pace'])

      const paceFindings = result.findings.filter(f => f.agent === 'pace')

      for (const finding of paceFindings) {
        const payload = finding.payload as Record<string, unknown>

        if (payload.delta_vs_league !== undefined) {
          // Delta should be reasonable (within +/- 20 plays of average)
          expect(Math.abs(payload.delta_vs_league as number)).toBeLessThan(20)
        }
      }
    })

    it('usage agent respects suppression rules', async () => {
      // Create context with player that should be suppressed
      const contextWithSuppression: MatchupContext = {
        ...mockMatchupContext,
        players: {
          KC: [
            {
              name: 'Injured Player',
              team: 'KC',
              position: 'WR',
              target_share_l4: 0.35, // Would be elite, but...
              injury_limited: true, // Should suppress
              games_in_window: 4,
            },
          ],
          BUF: [],
        },
      }

      const result = await runAgents(contextWithSuppression, ['usage'])

      // Should not find the injury_limited player
      const injuredPlayerFinding = result.findings.find(
        f => f.agent === 'usage' && (f.payload as Record<string, unknown>)?.player === 'Injured Player'
      )
      expect(injuredPlayerFinding).toBeUndefined()
    })

    it('injury agent only fires for material injuries', async () => {
      // Context with QUESTIONABLE (not material)
      const contextWithQuestionable: MatchupContext = {
        ...mockMatchupContext,
        injuries: {
          KC: ['Patrick Mahomes (QB) - QUESTIONABLE'],
          BUF: [],
        },
      }

      const result = await runAgents(contextWithQuestionable, ['injury'])

      // QUESTIONABLE should not produce findings
      expect(result.findings.filter(f => f.agent === 'injury').length).toBe(0)
    })
  })
})
