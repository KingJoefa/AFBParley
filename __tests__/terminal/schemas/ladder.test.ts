import { describe, it, expect } from 'vitest'
import {
  RungSchema,
  RiskTierSchema,
  LadderSchema,
  BetResultSchema,
  organizeLadders,
} from '@/lib/terminal/schemas'

describe('RungSchema', () => {
  it('validates a valid rung', () => {
    const rung = {
      alert_id: 'epa-chase-recv-123',
      market: 'Jamar Chase Over 85.5 Receiving Yards',
      line: 85.5,
      implied_probability: 0.55,
      agent: 'epa',
      rationale: 'Top-3 EPA receiver vs bottom-10 pass defense',
    }

    const result = RungSchema.safeParse(rung)
    expect(result.success).toBe(true)
  })

  it('allows optional line and implied_probability', () => {
    const rung = {
      alert_id: 'pressure-sf-456',
      market: 'Nick Bosa 1+ Sacks',
      agent: 'pressure',
      rationale: 'Elite pass rusher vs weak OL',
    }

    const result = RungSchema.safeParse(rung)
    expect(result.success).toBe(true)
  })

  it('enforces rationale max length', () => {
    const rung = {
      alert_id: 'test-123',
      market: 'Test Market',
      agent: 'epa',
      rationale: 'A'.repeat(201), // Over 200 char limit
    }

    const result = RungSchema.safeParse(rung)
    expect(result.success).toBe(false)
  })

  it('rejects extra properties (strict mode)', () => {
    const rung = {
      alert_id: 'test-123',
      market: 'Test Market',
      agent: 'epa',
      rationale: 'Test rationale',
      extra_field: 'not allowed',
    }

    const result = RungSchema.safeParse(rung)
    expect(result.success).toBe(false)
  })
})

describe('RiskTierSchema', () => {
  it('accepts valid risk tiers', () => {
    const tiers = ['safe', 'moderate', 'aggressive']

    for (const tier of tiers) {
      const result = RiskTierSchema.safeParse(tier)
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid risk tier', () => {
    const result = RiskTierSchema.safeParse('risky')
    expect(result.success).toBe(false)
  })
})

describe('LadderSchema', () => {
  it('validates a valid ladder', () => {
    const ladder = {
      id: 'ladder-safe-123',
      name: 'High Confidence Picks',
      tier: 'safe',
      rungs: [
        {
          alert_id: 'epa-chase-123',
          market: 'Jamar Chase Over 85.5 Yards',
          agent: 'epa',
          rationale: 'Elite efficiency',
        },
        {
          alert_id: 'pressure-sf-456',
          market: 'Nick Bosa 1+ Sacks',
          agent: 'pressure',
          rationale: 'Top pass rusher',
        },
      ],
      total_implied_probability: 0.65,
      recommended_stake_pct: 3,
      provenance_hash: 'abc123',
    }

    const result = LadderSchema.safeParse(ladder)
    expect(result.success).toBe(true)
  })

  it('requires at least 1 rung', () => {
    const ladder = {
      id: 'ladder-empty',
      name: 'Empty Ladder',
      tier: 'safe',
      rungs: [],
      provenance_hash: 'abc123',
    }

    const result = LadderSchema.safeParse(ladder)
    expect(result.success).toBe(false)
  })

  it('allows max 5 rungs', () => {
    const ladder = {
      id: 'ladder-full',
      name: 'Full Ladder',
      tier: 'moderate',
      rungs: [
        { alert_id: 'r1', market: 'M1', agent: 'epa', rationale: 'R1' },
        { alert_id: 'r2', market: 'M2', agent: 'pressure', rationale: 'R2' },
        { alert_id: 'r3', market: 'M3', agent: 'qb', rationale: 'R3' },
        { alert_id: 'r4', market: 'M4', agent: 'hb', rationale: 'R4' },
        { alert_id: 'r5', market: 'M5', agent: 'wr', rationale: 'R5' },
      ],
      provenance_hash: 'abc123',
    }

    const result = LadderSchema.safeParse(ladder)
    expect(result.success).toBe(true)
  })

  it('rejects more than 5 rungs', () => {
    const ladder = {
      id: 'ladder-overflow',
      name: 'Too Many Rungs',
      tier: 'aggressive',
      rungs: [
        { alert_id: 'r1', market: 'M1', agent: 'epa', rationale: 'R1' },
        { alert_id: 'r2', market: 'M2', agent: 'pressure', rationale: 'R2' },
        { alert_id: 'r3', market: 'M3', agent: 'qb', rationale: 'R3' },
        { alert_id: 'r4', market: 'M4', agent: 'hb', rationale: 'R4' },
        { alert_id: 'r5', market: 'M5', agent: 'wr', rationale: 'R5' },
        { alert_id: 'r6', market: 'M6', agent: 'te', rationale: 'R6' },
      ],
      provenance_hash: 'abc123',
    }

    const result = LadderSchema.safeParse(ladder)
    expect(result.success).toBe(false)
  })

  it('validates stake percentage bounds', () => {
    const ladder = {
      id: 'ladder-stake',
      name: 'Test Stake',
      tier: 'safe',
      rungs: [{ alert_id: 'r1', market: 'M1', agent: 'epa', rationale: 'R1' }],
      recommended_stake_pct: 150, // Over 100%
      provenance_hash: 'abc123',
    }

    const result = LadderSchema.safeParse(ladder)
    expect(result.success).toBe(false)
  })
})

describe('BetResultSchema', () => {
  it('validates a valid bet result', () => {
    const result = {
      request_id: 'req-bet-123',
      ladders: [
        {
          id: 'ladder-1',
          name: 'Safe Picks',
          tier: 'safe',
          rungs: [
            { alert_id: 'a1', market: 'M1', agent: 'epa', rationale: 'High confidence' },
          ],
          provenance_hash: 'h1',
        },
      ],
      alerts_used: ['a1'],
      alerts_excluded: ['a2', 'a3'],
      bet_timestamp: Date.now(),
      provenance_hash: 'bet-hash',
    }

    const parsed = BetResultSchema.safeParse(result)
    expect(parsed.success).toBe(true)
  })

  it('allows empty ladders array', () => {
    const result = {
      request_id: 'req-123',
      ladders: [],
      alerts_used: [],
      alerts_excluded: ['all-excluded'],
      bet_timestamp: Date.now(),
      provenance_hash: 'hash',
    }

    const parsed = BetResultSchema.safeParse(result)
    expect(parsed.success).toBe(true)
  })
})

describe('organizeLadders', () => {
  it('creates safe tier for high confidence + high severity', () => {
    const alertIds = ['a1', 'a2', 'a3']
    const confidences = new Map([
      ['a1', 0.8],
      ['a2', 0.75],
      ['a3', 0.5],
    ])
    const severities = new Map<string, 'high' | 'medium'>([
      ['a1', 'high'],
      ['a2', 'high'],
      ['a3', 'medium'],
    ])

    const ladders = organizeLadders(alertIds, confidences, severities)

    const safeLadder = ladders.find(l => l.tier === 'safe')
    expect(safeLadder).toBeDefined()
    expect(safeLadder!.ids).toContain('a1')
    expect(safeLadder!.ids).toContain('a2')
    expect(safeLadder!.ids).not.toContain('a3')
  })

  it('creates moderate tier for medium confidence or medium severity', () => {
    const alertIds = ['a1', 'a2']
    const confidences = new Map([
      ['a1', 0.6],
      ['a2', 0.55],
    ])
    const severities = new Map<string, 'high' | 'medium'>([
      ['a1', 'medium'],
      ['a2', 'high'],
    ])

    const ladders = organizeLadders(alertIds, confidences, severities)

    const modLadder = ladders.find(l => l.tier === 'moderate')
    expect(modLadder).toBeDefined()
  })

  it('creates aggressive tier for low confidence alerts', () => {
    const alertIds = ['a1', 'a2']
    const confidences = new Map([
      ['a1', 0.4],
      ['a2', 0.35],
    ])
    const severities = new Map<string, 'high' | 'medium'>([
      ['a1', 'medium'],
      ['a2', 'medium'],
    ])

    const ladders = organizeLadders(alertIds, confidences, severities)

    const aggLadder = ladders.find(l => l.tier === 'aggressive')
    expect(aggLadder).toBeDefined()
    expect(aggLadder!.name).toBe('High Upside Longshots')
  })

  it('limits safe tier to 3 alerts', () => {
    const alertIds = ['a1', 'a2', 'a3', 'a4', 'a5']
    const confidences = new Map(alertIds.map(id => [id, 0.8]))
    const severities = new Map<string, 'high' | 'medium'>(alertIds.map(id => [id, 'high']))

    const ladders = organizeLadders(alertIds, confidences, severities)

    const safeLadder = ladders.find(l => l.tier === 'safe')
    expect(safeLadder!.ids.length).toBeLessThanOrEqual(3)
  })

  it('returns empty array when no alerts qualify', () => {
    // Confidence below 0.3 doesn't qualify for any tier
    // And we need to avoid triggering moderate tier via medium severity
    const alertIds = ['a1']
    const confidences = new Map([['a1', 0.2]]) // Below 0.3 threshold
    // Note: medium severity with any confidence triggers moderate tier
    // So we need high severity but low confidence (doesn't trigger safe)
    const severities = new Map<string, 'high' | 'medium'>([['a1', 'high']])

    const ladders = organizeLadders(alertIds, confidences, severities)

    // With 0.2 confidence and high severity:
    // - Not safe (needs >= 0.7 AND high severity)
    // - Not moderate (needs 0.5-0.7 OR medium severity)
    // - Not aggressive (needs 0.3-0.5)
    expect(ladders).toHaveLength(0)
  })
})
