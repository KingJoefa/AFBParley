# Swantail Terminal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an agent-based terminal UI for sports betting analysis with strict contracts, threshold-based alerting, and correlated parlay generation.

**Architecture:** Web-based terminal (React) calls Next.js API routes. Typed threshold code produces Finding[], single LLM call transforms to Alert[], strict validators enforce contracts. No wrapper service.

**Tech Stack:** Next.js 14, React, Zod, OpenAI SDK (streaming), TypeScript, Tailwind CSS

---

## Task 1: Core Zod Schemas

**Files:**
- Create: `lib/terminal/schemas/evidence.ts`
- Create: `lib/terminal/schemas/finding.ts`
- Create: `lib/terminal/schemas/alert.ts`
- Create: `lib/terminal/schemas/claim.ts`
- Create: `lib/terminal/schemas/provenance.ts`
- Create: `lib/terminal/schemas/index.ts`
- Test: `__tests__/terminal/schemas.test.ts`

**Step 1: Write failing test for Evidence schema**

```typescript
// __tests__/terminal/schemas.test.ts
import { describe, it, expect } from 'vitest'
import { EvidenceSchema, LineEvidenceSchema } from '@/lib/terminal/schemas'

describe('EvidenceSchema', () => {
  it('accepts valid numeric evidence', () => {
    const evidence = {
      stat: 'receiving_epa_rank',
      value_num: 3,
      value_type: 'numeric' as const,
      comparison: 'top 5 in league',
      source_type: 'local' as const,
      source_ref: 'local://data/epa/week-20.json',
    }
    expect(() => EvidenceSchema.parse(evidence)).not.toThrow()
  })

  it('rejects extra fields (strict mode)', () => {
    const evidence = {
      stat: 'receiving_epa_rank',
      value_num: 3,
      value_type: 'numeric' as const,
      comparison: 'top 5 in league',
      source_type: 'local' as const,
      source_ref: 'local://data/epa/week-20.json',
      extraField: 'should fail',
    }
    expect(() => EvidenceSchema.parse(evidence)).toThrow()
  })

  it('requires quote_snippet for web sources', () => {
    const evidence = {
      stat: 'pressure_rate',
      value_num: 42,
      value_type: 'numeric' as const,
      comparison: 'top 3 in league',
      source_type: 'web' as const,
      source_ref: 'https://example.com/stats',
      // missing quote_snippet
    }
    expect(() => EvidenceSchema.parse(evidence)).toThrow()
  })
})

describe('LineEvidenceSchema', () => {
  it('accepts valid line evidence', () => {
    const lineEvidence = {
      stat: 'spread',
      value_num: -3.5,
      value_type: 'numeric' as const,
      comparison: 'current line',
      source_type: 'line' as const,
      source_ref: 'https://sportsbook.com/lines',
      line_type: 'spread' as const,
      line_value: -3.5,
      line_odds: -110,
      book: 'DraftKings',
      line_timestamp: Date.now(),
      line_ttl: 30 * 60 * 1000,
    }
    expect(() => LineEvidenceSchema.parse(lineEvidence)).not.toThrow()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/zfarleymacstudio/AFBParlay/.worktrees/swantail-terminal && npm test -- --run __tests__/terminal/schemas.test.ts`
Expected: FAIL (module not found)

**Step 3: Set up vitest and create Evidence schema**

First, install vitest if not present:
```bash
npm install -D vitest @vitejs/plugin-react
```

Create vitest config:
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
```

Add to package.json scripts:
```json
"test": "vitest"
```

```typescript
// lib/terminal/schemas/evidence.ts
import { z } from 'zod'

export const EvidenceSchema = z.object({
  stat: z.string(),
  value_num: z.number().optional(),
  value_str: z.string().optional(),
  value_type: z.enum(['numeric', 'string']),
  comparison: z.string(),
  source_type: z.enum(['local', 'web']),
  source_ref: z.string(),
  quote_snippet: z.string().optional(),
}).strict().refine(
  (data) => {
    // Web sources require quote_snippet
    if (data.source_type === 'web' && !data.quote_snippet) {
      return false
    }
    return true
  },
  { message: 'Web sources require quote_snippet' }
)

export const LineEvidenceSchema = z.object({
  stat: z.string(),
  value_num: z.number().optional(),
  value_str: z.string().optional(),
  value_type: z.enum(['numeric', 'string']),
  comparison: z.string(),
  source_type: z.literal('line'),
  source_ref: z.string(),
  quote_snippet: z.string().optional(),
  line_type: z.enum(['spread', 'total', 'prop', 'moneyline']),
  line_value: z.number(),
  line_odds: z.number(),
  book: z.string(),
  line_timestamp: z.number(),
  line_ttl: z.number(),
}).strict()

export type Evidence = z.infer<typeof EvidenceSchema>
export type LineEvidence = z.infer<typeof LineEvidenceSchema>
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run __tests__/terminal/schemas.test.ts`
Expected: PASS

**Step 5: Write failing test for Finding schema**

Add to `__tests__/terminal/schemas.test.ts`:
```typescript
import { FindingSchema, AgentType } from '@/lib/terminal/schemas'

describe('FindingSchema', () => {
  it('accepts valid finding', () => {
    const finding = {
      id: 'epa-jsn-recv-001',
      agent: 'epa' as AgentType,
      type: 'receiving_epa_mismatch',
      stat: 'receiving_epa_rank',
      value_num: 3,
      value_type: 'numeric' as const,
      threshold_met: 'rank <= 10',
      comparison_context: '3rd in league',
      source_ref: 'local://data/epa/week-20.json',
      source_type: 'local' as const,
      source_timestamp: Date.now(),
    }
    expect(() => FindingSchema.parse(finding)).not.toThrow()
  })
})
```

**Step 6: Run test to verify it fails**

Run: `npm test -- --run __tests__/terminal/schemas.test.ts`
Expected: FAIL (FindingSchema not found)

**Step 7: Create Finding schema**

```typescript
// lib/terminal/schemas/finding.ts
import { z } from 'zod'

export const AgentTypeSchema = z.enum(['epa', 'pressure', 'weather', 'qb', 'hb', 'wr', 'te'])
export type AgentType = z.infer<typeof AgentTypeSchema>

export const FindingSchema = z.object({
  id: z.string(),
  agent: AgentTypeSchema,
  type: z.string(),
  stat: z.string(),
  value_num: z.number().optional(),
  value_str: z.string().optional(),
  value_type: z.enum(['numeric', 'string']),
  threshold_met: z.string(),
  comparison_context: z.string(),
  source_ref: z.string(),
  source_type: z.enum(['local', 'web']),
  source_timestamp: z.number(),
  quote_snippet: z.string().optional(),
}).strict()

export type Finding = z.infer<typeof FindingSchema>
```

**Step 8: Run test to verify it passes**

Run: `npm test -- --run __tests__/terminal/schemas.test.ts`
Expected: PASS

**Step 9: Write failing test for ClaimParts schema**

Add to `__tests__/terminal/schemas.test.ts`:
```typescript
import { ClaimPartsSchema } from '@/lib/terminal/schemas'

describe('ClaimPartsSchema', () => {
  it('accepts valid claim parts', () => {
    const claimParts = {
      metrics: ['receiving_epa', 'target_share'],
      direction: 'positive' as const,
      comparator: 'ranks' as const,
      rank_or_percentile: {
        type: 'rank' as const,
        value: 5,
        scope: 'league' as const,
        direction: 'top' as const,
      },
      comparison_target: 'opponent_average' as const,
    }
    expect(() => ClaimPartsSchema.parse(claimParts)).not.toThrow()
  })

  it('rejects invalid metrics', () => {
    const claimParts = {
      metrics: ['fake_metric'],
      direction: 'positive' as const,
      comparator: 'ranks' as const,
    }
    expect(() => ClaimPartsSchema.parse(claimParts)).toThrow()
  })
})
```

**Step 10: Run test to verify it fails**

Run: `npm test -- --run __tests__/terminal/schemas.test.ts`
Expected: FAIL (ClaimPartsSchema not found)

**Step 11: Create ClaimParts schema**

```typescript
// lib/terminal/schemas/claim.ts
import { z } from 'zod'

export const MetricSchema = z.enum([
  'receiving_epa', 'rushing_epa', 'pass_block_win_rate',
  'pressure_rate', 'target_share', 'snap_count',
  'red_zone_epa', 'epa_allowed', 'completion_rate',
  'yards_per_attempt', 'sack_rate', 'passer_rating',
  'yards_after_contact', 'separation', 'contested_catch_rate',
  'route_participation', 'red_zone_targets',
])

export const ClaimPartsSchema = z.object({
  metrics: z.array(MetricSchema).min(1),
  direction: z.enum(['positive', 'negative', 'neutral']),
  comparator: z.enum(['ranks', 'exceeds', 'trails', 'matches', 'diverges_from']),
  rank_or_percentile: z.object({
    type: z.enum(['rank', 'percentile']),
    value: z.number(),
    scope: z.enum(['league', 'position', 'conference', 'division']),
    direction: z.enum(['top', 'bottom']),
  }).strict().optional(),
  comparison_target: z.enum([
    'league_average', 'opponent_average', 'position_average',
    'season_baseline', 'historical_self'
  ]).optional(),
  context_qualifier: z.enum([
    'in_division', 'at_home', 'as_underdog', 'in_primetime',
    'vs_top_10_defense', 'with_current_qb'
  ]).optional(),
}).strict()

export type ClaimParts = z.infer<typeof ClaimPartsSchema>

// Render claim parts to string
const METRIC_DISPLAY: Record<string, string> = {
  receiving_epa: 'Receiving EPA',
  rushing_epa: 'Rushing EPA',
  pass_block_win_rate: 'Pass Block Win Rate',
  pressure_rate: 'Pressure Rate',
  target_share: 'Target Share',
  snap_count: 'Snap Count',
  red_zone_epa: 'Red Zone EPA',
  epa_allowed: 'EPA Allowed',
  completion_rate: 'Completion Rate',
  yards_per_attempt: 'Yards Per Attempt',
  sack_rate: 'Sack Rate',
  passer_rating: 'Passer Rating',
  yards_after_contact: 'Yards After Contact',
  separation: 'Separation',
  contested_catch_rate: 'Contested Catch Rate',
  route_participation: 'Route Participation',
  red_zone_targets: 'Red Zone Targets',
}

const COMPARISON_DISPLAY: Record<string, string> = {
  league_average: 'league average',
  opponent_average: 'opponent average',
  position_average: 'position average',
  season_baseline: 'season baseline',
  historical_self: 'historical self',
}

const QUALIFIER_DISPLAY: Record<string, string> = {
  in_division: 'in division games',
  at_home: 'at home',
  as_underdog: 'as underdog',
  in_primetime: 'in primetime',
  vs_top_10_defense: 'vs top 10 defense',
  with_current_qb: 'with current QB',
}

export function renderClaim(parts: ClaimParts): string {
  const metricNames = parts.metrics.map(m => METRIC_DISPLAY[m] || m).join(' + ')

  let claim = metricNames

  if (parts.rank_or_percentile) {
    const r = parts.rank_or_percentile
    claim += ` ${parts.comparator} ${r.direction} ${r.value}`
    claim += r.type === 'rank' ? ` in ${r.scope}` : 'th percentile'
  }

  if (parts.comparison_target) {
    claim += ` vs ${COMPARISON_DISPLAY[parts.comparison_target]}`
  }

  if (parts.context_qualifier) {
    claim += ` (${QUALIFIER_DISPLAY[parts.context_qualifier]})`
  }

  return claim
}
```

**Step 12: Run test to verify it passes**

Run: `npm test -- --run __tests__/terminal/schemas.test.ts`
Expected: PASS

**Step 13: Write failing test for Alert schema**

Add to `__tests__/terminal/schemas.test.ts`:
```typescript
import { AlertSchema } from '@/lib/terminal/schemas'

describe('AlertSchema', () => {
  it('accepts valid alert', () => {
    const alert = {
      id: 'epa-jsn-recv-001',
      agent: 'epa' as const,
      evidence: [{
        stat: 'receiving_epa_rank',
        value_num: 3,
        value_type: 'numeric' as const,
        comparison: 'top 5 in league',
        source_type: 'local' as const,
        source_ref: 'local://data/epa/week-20.json',
      }],
      sources: [{
        type: 'local' as const,
        ref: 'local://data/epa/week-20.json',
        data_version: '2025-week-20',
        data_timestamp: Date.now(),
      }],
      confidence: 0.75,
      freshness: 'weekly' as const,
      severity: 'high' as const,
      claim: 'Receiving EPA ranks top 5 in league',
      implications: ['wr_receptions_over', 'wr_yards_over'],
      suppressions: [],
    }
    expect(() => AlertSchema.parse(alert)).not.toThrow()
  })

  it('rejects confidence outside 0-1 range', () => {
    const alert = {
      id: 'test',
      agent: 'epa' as const,
      evidence: [],
      sources: [],
      confidence: 1.5, // invalid
      freshness: 'weekly' as const,
      severity: 'high' as const,
      claim: 'test',
      implications: [],
      suppressions: [],
    }
    expect(() => AlertSchema.parse(alert)).toThrow()
  })
})
```

**Step 14: Run test to verify it fails**

Run: `npm test -- --run __tests__/terminal/schemas.test.ts`
Expected: FAIL (AlertSchema not found)

**Step 15: Create Alert schema**

```typescript
// lib/terminal/schemas/alert.ts
import { z } from 'zod'
import { EvidenceSchema, LineEvidenceSchema } from './evidence'
import { AgentTypeSchema } from './finding'

export const SourceSchema = z.object({
  type: z.enum(['local', 'web', 'line']),
  ref: z.string(),
  data_version: z.string(),
  data_timestamp: z.number(),
  search_timestamp: z.number().optional(),
  quote_snippet: z.string().optional(),
}).strict()

export const AlertSchema = z.object({
  // From code (immutable)
  id: z.string(),
  agent: AgentTypeSchema,
  evidence: z.array(z.union([EvidenceSchema, LineEvidenceSchema])).min(1),
  sources: z.array(SourceSchema).min(1),
  confidence: z.number().min(0).max(1),
  freshness: z.enum(['live', 'weekly', 'stale']),

  // From LLM (constrained)
  severity: z.enum(['high', 'medium']),
  claim: z.string().max(200),
  implications: z.array(z.string()).min(1).max(5),
  suppressions: z.array(z.string()),
}).strict()

export type Source = z.infer<typeof SourceSchema>
export type Alert = z.infer<typeof AlertSchema>
```

**Step 16: Run test to verify it passes**

Run: `npm test -- --run __tests__/terminal/schemas.test.ts`
Expected: PASS

**Step 17: Create Provenance schema**

```typescript
// lib/terminal/schemas/provenance.ts
import { z } from 'zod'
import { AgentTypeSchema } from './finding'

export const ProvenanceSchema = z.object({
  request_id: z.string(),
  prompt_hash: z.string(),
  skill_md_hashes: z.record(AgentTypeSchema, z.string()),
  findings_hash: z.string(),
  data_version: z.string(),
  data_timestamp: z.number(),
  search_timestamps: z.array(z.number()),
  agents_invoked: z.array(AgentTypeSchema),
  agents_silent: z.array(AgentTypeSchema),
  cache_hits: z.number(),
  cache_misses: z.number(),
  llm_model: z.string(),
  llm_temperature: z.number(),
}).strict()

export type Provenance = z.infer<typeof ProvenanceSchema>
```

**Step 18: Create LLM output schema**

```typescript
// lib/terminal/schemas/llm-output.ts
import { z } from 'zod'
import { ClaimPartsSchema } from './claim'

// What LLM outputs - keyed by finding_id
export const LLMFindingOutputSchema = z.object({
  severity: z.enum(['high', 'medium']),
  claim_parts: ClaimPartsSchema,
  implications: z.array(z.string()),
  suppressions: z.array(z.string()),
}).strict()

export const LLMOutputSchema = z.record(z.string(), LLMFindingOutputSchema)

export type LLMFindingOutput = z.infer<typeof LLMFindingOutputSchema>
export type LLMOutput = z.infer<typeof LLMOutputSchema>
```

**Step 19: Create index file**

```typescript
// lib/terminal/schemas/index.ts
export * from './evidence'
export * from './finding'
export * from './alert'
export * from './claim'
export * from './provenance'
export * from './llm-output'
```

**Step 20: Run all schema tests**

Run: `npm test -- --run __tests__/terminal/schemas.test.ts`
Expected: PASS (all tests)

**Step 21: Commit**

```bash
git add lib/terminal/schemas/ __tests__/terminal/schemas.test.ts vitest.config.ts package.json
git commit -m "feat(terminal): add core Zod schemas with strict validation"
```

---

## Task 2: Validators

**Files:**
- Create: `lib/terminal/engine/validators.ts`
- Create: `lib/terminal/engine/implications.ts`
- Create: `lib/terminal/engine/line-freshness.ts`
- Test: `__tests__/terminal/validators.test.ts`

**Step 1: Write failing test for source integrity validation**

```typescript
// __tests__/terminal/validators.test.ts
import { describe, it, expect } from 'vitest'
import { validateSourceIntegrity } from '@/lib/terminal/engine/validators'
import type { Alert } from '@/lib/terminal/schemas'

describe('validateSourceIntegrity', () => {
  it('passes when all evidence refs have sources', () => {
    const alert: Alert = {
      id: 'test-001',
      agent: 'epa',
      evidence: [{
        stat: 'receiving_epa',
        value_num: 0.31,
        value_type: 'numeric',
        comparison: 'top 5',
        source_type: 'local',
        source_ref: 'local://data/epa/week-20.json',
      }],
      sources: [{
        type: 'local',
        ref: 'local://data/epa/week-20.json',
        data_version: '2025-week-20',
        data_timestamp: Date.now(),
      }],
      confidence: 0.75,
      freshness: 'weekly',
      severity: 'high',
      claim: 'test claim',
      implications: ['wr_receptions_over'],
      suppressions: [],
    }
    expect(() => validateSourceIntegrity(alert)).not.toThrow()
  })

  it('rejects orphan sources', () => {
    const alert: Alert = {
      id: 'test-001',
      agent: 'epa',
      evidence: [{
        stat: 'receiving_epa',
        value_num: 0.31,
        value_type: 'numeric',
        comparison: 'top 5',
        source_type: 'local',
        source_ref: 'local://data/epa/week-20.json',
      }],
      sources: [
        {
          type: 'local',
          ref: 'local://data/epa/week-20.json',
          data_version: '2025-week-20',
          data_timestamp: Date.now(),
        },
        {
          type: 'web',
          ref: 'https://orphan.com', // orphan - not in evidence
          data_version: '2025-week-20',
          data_timestamp: Date.now(),
          search_timestamp: Date.now(),
          quote_snippet: 'orphan',
        },
      ],
      confidence: 0.75,
      freshness: 'weekly',
      severity: 'high',
      claim: 'test claim',
      implications: ['wr_receptions_over'],
      suppressions: [],
    }
    expect(() => validateSourceIntegrity(alert)).toThrow(/orphan/i)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run __tests__/terminal/validators.test.ts`
Expected: FAIL (module not found)

**Step 3: Create validators module**

```typescript
// lib/terminal/engine/validators.ts
import type { Alert, Finding, LLMFindingOutput } from '../schemas'
import { AlertSchema, ClaimPartsSchema } from '../schemas'
import { validateImplications } from './implications'
import { validateLineEvidence } from './line-freshness'
import { calculateConfidence } from './confidence'

export function validateSourceIntegrity(alert: Alert): void {
  const evidenceRefs = new Set(alert.evidence.map(e => e.source_ref))
  const sourceRefs = new Set(alert.sources.map(s => s.ref))

  // No orphan sources
  for (const ref of sourceRefs) {
    if (!evidenceRefs.has(ref)) {
      throw new Error(`Orphan source: ${ref} not referenced in evidence`)
    }
  }

  // All evidence refs have corresponding source
  for (const ref of evidenceRefs) {
    if (!sourceRefs.has(ref)) {
      throw new Error(`Missing source for evidence ref: ${ref}`)
    }
  }
}

// Edge language that requires LineEvidence
const EDGE_LANGUAGE = [
  /\bedge\b/i, /\bvalue\b/i, /\bmispriced\b/i,
  /\bexploit\b/i, /\bsharp\b/i, /\block\b/i,
]

export function validateNoEdgeWithoutLine(alert: Alert): void {
  const hasLineEvidence = alert.evidence.some(e => 'line_type' in e)

  for (const pattern of EDGE_LANGUAGE) {
    if (pattern.test(alert.claim) && !hasLineEvidence) {
      throw new Error(`Claim uses edge language "${pattern}" but no LineEvidence provided`)
    }
  }
}

export function validateAlert(
  finding: Finding,
  llmOutput: LLMFindingOutput,
  alert: Alert
): void {
  // 1. Zod strict parse (no extra fields)
  AlertSchema.parse(alert)

  // 2. ID/Agent immutability (code-assigned, not LLM)
  if (alert.id !== finding.id) {
    throw new Error(`ID mismatch: expected ${finding.id}, got ${alert.id}`)
  }
  if (alert.agent !== finding.agent) {
    throw new Error(`Agent mismatch: expected ${finding.agent}, got ${alert.agent}`)
  }

  // 3. Confidence immutability (code-derived)
  const expectedConfidence = calculateConfidence(finding)
  if (Math.abs(alert.confidence - expectedConfidence) > 0.001) {
    throw new Error(`Confidence was modified: expected ${expectedConfidence}, got ${alert.confidence}`)
  }

  // 4. Source integrity (no orphans)
  validateSourceIntegrity(alert)

  // 5. Line freshness (if applicable)
  validateLineEvidence(alert)

  // 6. Claim parts valid (structured, not free text)
  ClaimPartsSchema.parse(llmOutput.claim_parts)

  // 7. Implications allowlist
  validateImplications(alert.agent, finding.type, alert.implications)

  // 8. No edge language without LineEvidence
  validateNoEdgeWithoutLine(alert)
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run __tests__/terminal/validators.test.ts`
Expected: PASS

**Step 5: Write failing test for implications validation**

Add to `__tests__/terminal/validators.test.ts`:
```typescript
import { validateImplications, AGENT_IMPLICATIONS } from '@/lib/terminal/engine/implications'

describe('validateImplications', () => {
  it('accepts valid implications for agent', () => {
    expect(() => validateImplications('epa', 'receiving_epa_mismatch', ['wr_receptions_over'])).not.toThrow()
  })

  it('rejects implications not in agent allowlist', () => {
    expect(() => validateImplications('weather', 'wind_advisory', ['qb_pass_tds_over'])).toThrow()
  })
})
```

**Step 6: Run test to verify it fails**

Run: `npm test -- --run __tests__/terminal/validators.test.ts`
Expected: FAIL (validateImplications not found)

**Step 7: Create implications module**

```typescript
// lib/terminal/engine/implications.ts
import type { AgentType } from '../schemas'

export const AGENT_IMPLICATIONS: Record<AgentType, string[]> = {
  epa: [
    'wr_receptions_over', 'wr_receptions_under',
    'wr_yards_over', 'wr_yards_under',
    'rb_yards_over', 'rb_yards_under',
    'team_total_over', 'team_total_under',
  ],
  pressure: [
    'qb_sacks_over', 'qb_sacks_under',
    'qb_ints_over', 'qb_pass_yards_under',
    'def_sacks_over',
  ],
  weather: [
    'game_total_under', 'pass_yards_under', 'field_goals_over',
  ],
  qb: [
    'qb_pass_yards_over', 'qb_pass_yards_under',
    'qb_pass_tds_over', 'qb_pass_tds_under',
    'qb_completions_over', 'qb_completions_under',
    'qb_ints_over',
  ],
  hb: [
    'rb_rush_yards_over', 'rb_rush_yards_under',
    'rb_receptions_over', 'rb_rush_attempts_over',
    'rb_tds_over',
  ],
  wr: [
    'wr_receptions_over', 'wr_receptions_under',
    'wr_yards_over', 'wr_yards_under',
    'wr_tds_over', 'wr_longest_reception_over',
  ],
  te: [
    'te_receptions_over', 'te_receptions_under',
    'te_yards_over', 'te_yards_under',
    'te_tds_over',
  ],
}

// Finding type → allowed implications
export const FINDING_TO_IMPLICATIONS: Record<string, string[]> = {
  receiving_epa_mismatch: ['wr_receptions_over', 'wr_yards_over', 'te_receptions_over'],
  rushing_epa_mismatch: ['rb_yards_over', 'rb_rush_attempts_over'],
  pressure_rate_advantage: ['qb_sacks_over', 'qb_ints_over', 'qb_pass_yards_under', 'def_sacks_over'],
  weather_wind: ['game_total_under', 'pass_yards_under', 'field_goals_over'],
  weather_cold: ['game_total_under', 'pass_yards_under'],
  weather_rain: ['game_total_under', 'pass_yards_under', 'rb_yards_over'],
  qb_efficiency_edge: ['qb_pass_yards_over', 'qb_pass_tds_over', 'qb_completions_over'],
  qb_pressure_vulnerability: ['qb_ints_over', 'qb_sacks_over', 'qb_pass_yards_under'],
  rb_workload_increase: ['rb_rush_yards_over', 'rb_rush_attempts_over', 'rb_tds_over'],
  rb_receiving_role: ['rb_receptions_over', 'rb_yards_over'],
  wr_target_share: ['wr_receptions_over', 'wr_yards_over', 'wr_tds_over'],
  wr_matchup_advantage: ['wr_yards_over', 'wr_longest_reception_over'],
  te_red_zone_role: ['te_receptions_over', 'te_tds_over'],
}

export function validateImplications(
  agent: AgentType,
  findingType: string,
  implications: string[]
): void {
  const allowedByAgent = AGENT_IMPLICATIONS[agent]
  const allowedByFinding = FINDING_TO_IMPLICATIONS[findingType] || allowedByAgent // fallback to agent allowlist

  for (const imp of implications) {
    if (!allowedByAgent.includes(imp)) {
      throw new Error(`Agent ${agent} cannot imply market: ${imp}`)
    }
    if (!allowedByFinding.includes(imp)) {
      throw new Error(`Finding ${findingType} does not justify implication: ${imp}`)
    }
  }
}
```

**Step 8: Run test to verify it passes**

Run: `npm test -- --run __tests__/terminal/validators.test.ts`
Expected: PASS

**Step 9: Write failing test for line freshness**

Add to `__tests__/terminal/validators.test.ts`:
```typescript
import { validateLineEvidence, LINE_TTL, isLineFresh } from '@/lib/terminal/engine/line-freshness'
import type { LineEvidence } from '@/lib/terminal/schemas'

describe('line freshness', () => {
  it('accepts fresh line evidence', () => {
    const lineEvidence: LineEvidence = {
      stat: 'spread',
      value_num: -3.5,
      value_type: 'numeric',
      comparison: 'current',
      source_type: 'line',
      source_ref: 'https://book.com',
      line_type: 'spread',
      line_value: -3.5,
      line_odds: -110,
      book: 'DraftKings',
      line_timestamp: Date.now() - 5 * 60 * 1000, // 5 min ago
      line_ttl: LINE_TTL.spread,
    }
    expect(isLineFresh(lineEvidence)).toBe(true)
  })

  it('rejects stale line evidence', () => {
    const lineEvidence: LineEvidence = {
      stat: 'spread',
      value_num: -3.5,
      value_type: 'numeric',
      comparison: 'current',
      source_type: 'line',
      source_ref: 'https://book.com',
      line_type: 'spread',
      line_value: -3.5,
      line_odds: -110,
      book: 'DraftKings',
      line_timestamp: Date.now() - 60 * 60 * 1000, // 1 hour ago
      line_ttl: LINE_TTL.spread, // 30 min TTL
    }
    expect(isLineFresh(lineEvidence)).toBe(false)
  })
})
```

**Step 10: Run test to verify it fails**

Run: `npm test -- --run __tests__/terminal/validators.test.ts`
Expected: FAIL (module not found)

**Step 11: Create line freshness module**

```typescript
// lib/terminal/engine/line-freshness.ts
import type { Alert, LineEvidence } from '../schemas'

export const LINE_TTL = {
  spread: 30 * 60 * 1000,      // 30 min
  total: 30 * 60 * 1000,       // 30 min
  prop: 15 * 60 * 1000,        // 15 min (more volatile)
  moneyline: 60 * 60 * 1000,   // 1 hr
} as const

export function isLineFresh(evidence: LineEvidence): boolean {
  const ttl = LINE_TTL[evidence.line_type]
  const age = Date.now() - evidence.line_timestamp
  return age < ttl
}

export function validateLineEvidence(alert: Alert): void {
  const lineEvidence = alert.evidence.filter(
    (e): e is LineEvidence => 'line_type' in e
  )

  for (const le of lineEvidence) {
    if (!isLineFresh(le)) {
      const age = Date.now() - le.line_timestamp
      throw new Error(
        `Stale line evidence: ${le.line_type} is ${Math.round(age / 1000 / 60)}min old (TTL: ${LINE_TTL[le.line_type] / 1000 / 60}min)`
      )
    }
  }
}
```

**Step 12: Run test to verify it passes**

Run: `npm test -- --run __tests__/terminal/validators.test.ts`
Expected: PASS

**Step 13: Commit**

```bash
git add lib/terminal/engine/ __tests__/terminal/validators.test.ts
git commit -m "feat(terminal): add validators for source integrity, implications, line freshness"
```

---

## Task 3: Confidence Calculation

**Files:**
- Create: `lib/terminal/engine/confidence.ts`
- Test: `__tests__/terminal/confidence.test.ts`

**Step 1: Write failing test**

```typescript
// __tests__/terminal/confidence.test.ts
import { describe, it, expect } from 'vitest'
import { calculateConfidence, type ConfidenceInputs } from '@/lib/terminal/engine/confidence'

describe('calculateConfidence', () => {
  it('returns baseline 0.5 with minimal inputs', () => {
    const inputs: ConfidenceInputs = {
      evidenceCount: 1,
      hasLocalSource: false,
      hasWebSource: false,
      webSourceAge: null,
      localDataAge: 0,
      sampleSize: null,
      hasLineEvidence: false,
      lineAge: null,
    }
    const confidence = calculateConfidence(inputs)
    expect(confidence).toBeCloseTo(0.5, 2)
  })

  it('increases with multiple evidence', () => {
    const inputs: ConfidenceInputs = {
      evidenceCount: 3,
      hasLocalSource: true,
      hasWebSource: false,
      webSourceAge: null,
      localDataAge: 0,
      sampleSize: 100,
      hasLineEvidence: false,
      lineAge: null,
    }
    const confidence = calculateConfidence(inputs)
    expect(confidence).toBeGreaterThan(0.8)
  })

  it('decreases with stale data', () => {
    const inputs: ConfidenceInputs = {
      evidenceCount: 2,
      hasLocalSource: true,
      hasWebSource: false,
      webSourceAge: null,
      localDataAge: 10 * 24 * 3600 * 1000, // 10 days
      sampleSize: null,
      hasLineEvidence: false,
      lineAge: null,
    }
    const confidence = calculateConfidence(inputs)
    expect(confidence).toBeLessThan(0.5)
  })

  it('clamps to 0-1 range', () => {
    const highInputs: ConfidenceInputs = {
      evidenceCount: 5,
      hasLocalSource: true,
      hasWebSource: true,
      webSourceAge: 1000,
      localDataAge: 0,
      sampleSize: 200,
      hasLineEvidence: true,
      lineAge: 1000,
    }
    expect(calculateConfidence(highInputs)).toBeLessThanOrEqual(1)
    expect(calculateConfidence(highInputs)).toBeGreaterThanOrEqual(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run __tests__/terminal/confidence.test.ts`
Expected: FAIL (module not found)

**Step 3: Create confidence module**

```typescript
// lib/terminal/engine/confidence.ts
import type { Finding } from '../schemas'

export interface ConfidenceInputs {
  evidenceCount: number
  hasLocalSource: boolean
  hasWebSource: boolean
  webSourceAge: number | null       // ms since search
  localDataAge: number              // ms since data_timestamp
  sampleSize: number | null         // e.g. targets, snaps
  hasLineEvidence: boolean
  lineAge: number | null            // ms since line_timestamp
}

export function calculateConfidence(inputs: ConfidenceInputs): number {
  let score = 0.5  // baseline

  // Evidence quantity
  if (inputs.evidenceCount >= 3) score += 0.15
  else if (inputs.evidenceCount >= 2) score += 0.08

  // Source quality
  if (inputs.hasLocalSource) score += 0.10
  if (inputs.hasWebSource && inputs.webSourceAge !== null && inputs.webSourceAge < 4 * 3600 * 1000) {
    score += 0.08  // fresh web
  }

  // Sample size (if applicable)
  if (inputs.sampleSize !== null) {
    if (inputs.sampleSize >= 100) score += 0.12
    else if (inputs.sampleSize >= 50) score += 0.06
    else score -= 0.10  // penalty for small sample
  }

  // Line freshness (if betting relevance claimed)
  if (inputs.hasLineEvidence && inputs.lineAge !== null) {
    if (inputs.lineAge < 30 * 60 * 1000) score += 0.10  // <30min
    else if (inputs.lineAge < 2 * 3600 * 1000) score += 0.05  // <2hr
    else score -= 0.15  // stale line penalty
  }

  // Data freshness
  if (inputs.localDataAge > 7 * 24 * 3600 * 1000) score -= 0.20  // >7 days old

  return Math.max(0, Math.min(1, score))
}

// Helper to derive confidence inputs from a Finding
export function confidenceInputsFromFinding(finding: Finding): ConfidenceInputs {
  const now = Date.now()
  return {
    evidenceCount: 1, // Single finding = 1 evidence piece
    hasLocalSource: finding.source_type === 'local',
    hasWebSource: finding.source_type === 'web',
    webSourceAge: finding.source_type === 'web' ? now - finding.source_timestamp : null,
    localDataAge: finding.source_type === 'local' ? now - finding.source_timestamp : 0,
    sampleSize: null, // Would need to be passed from threshold logic
    hasLineEvidence: false,
    lineAge: null,
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run __tests__/terminal/confidence.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/terminal/engine/confidence.ts __tests__/terminal/confidence.test.ts
git commit -m "feat(terminal): add code-derived confidence calculation"
```

---

## Task 4: Provenance & Hashing

**Files:**
- Create: `lib/terminal/engine/provenance.ts`
- Test: `__tests__/terminal/provenance.test.ts`

**Step 1: Write failing test**

```typescript
// __tests__/terminal/provenance.test.ts
import { describe, it, expect } from 'vitest'
import { hashContent, buildProvenance } from '@/lib/terminal/engine/provenance'
import type { Finding } from '@/lib/terminal/schemas'

describe('hashContent', () => {
  it('produces consistent hashes', () => {
    const content = 'test content'
    const hash1 = hashContent(content)
    const hash2 = hashContent(content)
    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different content', () => {
    const hash1 = hashContent('content A')
    const hash2 = hashContent('content B')
    expect(hash1).not.toBe(hash2)
  })

  it('returns 12-character hash', () => {
    const hash = hashContent('test')
    expect(hash).toHaveLength(12)
  })
})

describe('buildProvenance', () => {
  it('builds complete provenance object', () => {
    const findings: Finding[] = [{
      id: 'test-001',
      agent: 'epa',
      type: 'receiving_epa_mismatch',
      stat: 'receiving_epa',
      value_num: 0.31,
      value_type: 'numeric',
      threshold_met: 'rank <= 10',
      comparison_context: 'top 5',
      source_ref: 'local://data/epa/week-20.json',
      source_type: 'local',
      source_timestamp: Date.now(),
    }]

    const provenance = buildProvenance({
      requestId: 'req-123',
      prompt: 'test prompt',
      skillMds: { epa: '# EPA Agent\n...' },
      findings,
      dataVersion: '2025-week-20',
      dataTimestamp: Date.now(),
      searchTimestamps: [],
      agentsInvoked: ['epa'],
      agentsSilent: ['weather', 'pressure'],
      cacheHits: 1,
      cacheMisses: 0,
      llmModel: 'gpt-4o',
      llmTemperature: 0,
    })

    expect(provenance.request_id).toBe('req-123')
    expect(provenance.prompt_hash).toHaveLength(12)
    expect(provenance.findings_hash).toHaveLength(12)
    expect(provenance.skill_md_hashes.epa).toHaveLength(12)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run __tests__/terminal/provenance.test.ts`
Expected: FAIL (module not found)

**Step 3: Create provenance module**

```typescript
// lib/terminal/engine/provenance.ts
import { createHash } from 'crypto'
import type { Finding, AgentType, Provenance } from '../schemas'

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 12)
}

interface BuildProvenanceInput {
  requestId: string
  prompt: string
  skillMds: Partial<Record<AgentType, string>>
  findings: Finding[]
  dataVersion: string
  dataTimestamp: number
  searchTimestamps: number[]
  agentsInvoked: AgentType[]
  agentsSilent: AgentType[]
  cacheHits: number
  cacheMisses: number
  llmModel: string
  llmTemperature: number
}

export function buildProvenance(inputs: BuildProvenanceInput): Provenance {
  const skillMdHashes = Object.fromEntries(
    Object.entries(inputs.skillMds).map(([k, v]) => [k, hashContent(v as string)])
  ) as Record<AgentType, string>

  return {
    request_id: inputs.requestId,
    prompt_hash: hashContent(inputs.prompt),
    skill_md_hashes: skillMdHashes,
    findings_hash: hashContent(JSON.stringify(inputs.findings)),
    data_version: inputs.dataVersion,
    data_timestamp: inputs.dataTimestamp,
    search_timestamps: inputs.searchTimestamps,
    agents_invoked: inputs.agentsInvoked,
    agents_silent: inputs.agentsSilent,
    cache_hits: inputs.cacheHits,
    cache_misses: inputs.cacheMisses,
    llm_model: inputs.llmModel,
    llm_temperature: inputs.llmTemperature,
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run __tests__/terminal/provenance.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/terminal/engine/provenance.ts __tests__/terminal/provenance.test.ts
git commit -m "feat(terminal): add provenance building with reproducibility hashes"
```

---

## Task 5: Guardrails & Streaming

**Files:**
- Create: `lib/terminal/engine/guardrails.ts`
- Create: `lib/terminal/engine/fallback-renderer.ts`
- Test: `__tests__/terminal/guardrails.test.ts`

**Step 1: Write failing test for guardrails**

```typescript
// __tests__/terminal/guardrails.test.ts
import { describe, it, expect } from 'vitest'
import { REQUEST_LIMITS, STREAM_CONFIG, checkRequestLimits } from '@/lib/terminal/engine/guardrails'

describe('REQUEST_LIMITS', () => {
  it('has sensible defaults', () => {
    expect(REQUEST_LIMITS.maxInputTokens).toBe(8000)
    expect(REQUEST_LIMITS.maxOutputTokens).toBe(2000)
    expect(REQUEST_LIMITS.maxCostPerRequest).toBe(0.15)
    expect(REQUEST_LIMITS.timeoutMs).toBe(45000)
  })
})

describe('checkRequestLimits', () => {
  it('passes for small requests', () => {
    expect(() => checkRequestLimits({ inputTokens: 1000 })).not.toThrow()
  })

  it('rejects requests exceeding token limit', () => {
    expect(() => checkRequestLimits({ inputTokens: 10000 })).toThrow(/token/i)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run __tests__/terminal/guardrails.test.ts`
Expected: FAIL (module not found)

**Step 3: Create guardrails module**

```typescript
// lib/terminal/engine/guardrails.ts

export const REQUEST_LIMITS = {
  maxInputTokens: 8000,
  maxOutputTokens: 2000,
  maxCostPerRequest: 0.15,  // $0.15 USD
  timeoutMs: 45000,         // 45s
} as const

export const STREAM_CONFIG = {
  heartbeatIntervalMs: 3000,
  heartbeatPayload: { type: 'heartbeat' as const, status: 'processing' as const },
} as const

export const SEARCH_CONFIG = {
  enabled: true,
  budgetPerMatchup: 5,
  budgetPerAgent: 2,
  cacheTTL: 3600 * 4,  // 4 hours
  noiseThreshold: 0.3,
} as const

interface RequestCheckInput {
  inputTokens: number
  estimatedCost?: number
}

export function checkRequestLimits(input: RequestCheckInput): void {
  if (input.inputTokens > REQUEST_LIMITS.maxInputTokens) {
    throw new Error(`Input tokens (${input.inputTokens}) exceeds limit (${REQUEST_LIMITS.maxInputTokens})`)
  }
  if (input.estimatedCost && input.estimatedCost > REQUEST_LIMITS.maxCostPerRequest) {
    throw new Error(`Estimated cost ($${input.estimatedCost}) exceeds limit ($${REQUEST_LIMITS.maxCostPerRequest})`)
  }
}

// Heartbeat generator for streaming
export async function* heartbeatGenerator<T>(
  source: AsyncIterable<T>,
  intervalMs: number = STREAM_CONFIG.heartbeatIntervalMs
): AsyncIterable<T | typeof STREAM_CONFIG.heartbeatPayload> {
  let lastYield = Date.now()

  for await (const item of source) {
    yield item
    lastYield = Date.now()
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run __tests__/terminal/guardrails.test.ts`
Expected: PASS

**Step 5: Write failing test for fallback renderer**

Add to `__tests__/terminal/guardrails.test.ts`:
```typescript
import { renderFindingsFallback } from '@/lib/terminal/engine/fallback-renderer'
import type { Finding } from '@/lib/terminal/schemas'

describe('renderFindingsFallback', () => {
  it('renders findings without LLM', () => {
    const findings: Finding[] = [{
      id: 'epa-001',
      agent: 'epa',
      type: 'receiving_epa_mismatch',
      stat: 'receiving_epa_rank',
      value_num: 3,
      value_type: 'numeric',
      threshold_met: 'rank <= 10',
      comparison_context: '3rd in league',
      source_ref: 'local://data/epa/week-20.json',
      source_type: 'local',
      source_timestamp: Date.now(),
    }]

    const output = renderFindingsFallback(findings)

    expect(output).toHaveLength(1)
    expect(output[0].agent).toBe('epa')
    expect(output[0].line).toContain('receiving_epa_rank')
    expect(output[0].line).toContain('3')
    expect(output[0].severity).toBe('raw')
  })
})
```

**Step 6: Run test to verify it fails**

Run: `npm test -- --run __tests__/terminal/guardrails.test.ts`
Expected: FAIL (renderFindingsFallback not found)

**Step 7: Create fallback renderer**

```typescript
// lib/terminal/engine/fallback-renderer.ts
import type { Finding, AgentType } from '../schemas'

export interface FallbackLine {
  agent: AgentType
  line: string
  source: string
  severity: 'raw'
}

export function renderFindingsFallback(findings: Finding[]): FallbackLine[] {
  return findings.map(f => ({
    agent: f.agent,
    line: `${f.stat}: ${f.value_num ?? f.value_str} (${f.comparison_context})`,
    source: f.source_ref,
    severity: 'raw' as const,
  }))
}

export function formatFallbackForTerminal(lines: FallbackLine[]): string {
  const header = '⚠️  Analyst offline. Raw findings:\n'
  const body = lines.map(l =>
    `   [${l.agent}] ${l.line}\n         → ${l.source}`
  ).join('\n\n')
  const footer = '\n\n   Type "retry" or "build --raw" to continue.'

  return header + '\n' + body + footer
}
```

**Step 8: Run test to verify it passes**

Run: `npm test -- --run __tests__/terminal/guardrails.test.ts`
Expected: PASS

**Step 9: Commit**

```bash
git add lib/terminal/engine/guardrails.ts lib/terminal/engine/fallback-renderer.ts __tests__/terminal/guardrails.test.ts
git commit -m "feat(terminal): add request guardrails and fallback renderer"
```

---

## Task 6: EPA Agent Thresholds

**Files:**
- Create: `lib/terminal/agents/epa/thresholds.ts`
- Create: `lib/terminal/agents/epa/skill.md`
- Test: `__tests__/terminal/agents/epa.test.ts`

**Step 1: Write failing test**

```typescript
// __tests__/terminal/agents/epa.test.ts
import { describe, it, expect } from 'vitest'
import { EPA_THRESHOLDS, checkEpaThresholds } from '@/lib/terminal/agents/epa/thresholds'
import type { Finding } from '@/lib/terminal/schemas'

describe('EPA_THRESHOLDS', () => {
  it('has defined threshold values', () => {
    expect(EPA_THRESHOLDS.receivingEpaRank).toBe(10)
    expect(EPA_THRESHOLDS.epaAllowedRank).toBe(10)
    expect(EPA_THRESHOLDS.rushingEpaDiff).toBe(0.15)
  })
})

describe('checkEpaThresholds', () => {
  it('returns finding when receiving EPA rank meets threshold', () => {
    const playerData = {
      name: 'Jaxon Smith-Njigba',
      team: 'SEA',
      receiving_epa_rank: 3,
      targets: 120,
    }
    const opponentData = {
      team: 'SF',
      epa_allowed_to_wr_rank: 8,
    }
    const context = {
      dataTimestamp: Date.now(),
      dataVersion: '2025-week-20',
    }

    const findings = checkEpaThresholds(playerData, opponentData, context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].agent).toBe('epa')
    expect(findings[0].type).toBe('receiving_epa_mismatch')
  })

  it('returns empty when thresholds not met', () => {
    const playerData = {
      name: 'Random Player',
      team: 'NYG',
      receiving_epa_rank: 45,
      targets: 30,
    }
    const opponentData = {
      team: 'DAL',
      epa_allowed_to_wr_rank: 25,
    }
    const context = {
      dataTimestamp: Date.now(),
      dataVersion: '2025-week-20',
    }

    const findings = checkEpaThresholds(playerData, opponentData, context)

    expect(findings.length).toBe(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run __tests__/terminal/agents/epa.test.ts`
Expected: FAIL (module not found)

**Step 3: Create EPA thresholds module**

```typescript
// lib/terminal/agents/epa/thresholds.ts
import type { Finding, AgentType } from '../../schemas'

export const EPA_THRESHOLDS = {
  receivingEpaRank: 10,     // top 10
  epaAllowedRank: 10,       // opponent allows top 10
  rushingEpaDiff: 0.15,
  redZoneEpaDiff: 0.20,
  minTargets: 50,           // sample size threshold
} as const

interface PlayerData {
  name: string
  team: string
  receiving_epa_rank?: number
  rushing_epa_rank?: number
  receiving_epa?: number
  rushing_epa?: number
  targets?: number
  rushes?: number
}

interface OpponentData {
  team: string
  epa_allowed_to_wr_rank?: number
  epa_allowed_to_rb_rank?: number
  receiving_epa_allowed?: number
  rushing_epa_allowed?: number
}

interface ThresholdContext {
  dataTimestamp: number
  dataVersion: string
}

export function checkEpaThresholds(
  player: PlayerData,
  opponent: OpponentData,
  context: ThresholdContext
): Finding[] {
  const findings: Finding[] = []
  const agent: AgentType = 'epa'

  // Check receiving EPA mismatch
  if (
    player.receiving_epa_rank !== undefined &&
    player.receiving_epa_rank <= EPA_THRESHOLDS.receivingEpaRank &&
    opponent.epa_allowed_to_wr_rank !== undefined &&
    opponent.epa_allowed_to_wr_rank <= EPA_THRESHOLDS.epaAllowedRank &&
    (player.targets ?? 0) >= EPA_THRESHOLDS.minTargets
  ) {
    findings.push({
      id: `epa-${player.name.toLowerCase().replace(/\s+/g, '-')}-recv-${Date.now()}`,
      agent,
      type: 'receiving_epa_mismatch',
      stat: 'receiving_epa_rank',
      value_num: player.receiving_epa_rank,
      value_type: 'numeric',
      threshold_met: `rank <= ${EPA_THRESHOLDS.receivingEpaRank} AND opponent allows top ${EPA_THRESHOLDS.epaAllowedRank}`,
      comparison_context: `${ordinal(player.receiving_epa_rank)} in league vs ${ordinal(opponent.epa_allowed_to_wr_rank)} worst defense`,
      source_ref: `local://data/epa/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  // Check rushing EPA mismatch
  if (
    player.rushing_epa_rank !== undefined &&
    player.rushing_epa_rank <= EPA_THRESHOLDS.receivingEpaRank &&
    opponent.epa_allowed_to_rb_rank !== undefined &&
    opponent.epa_allowed_to_rb_rank <= EPA_THRESHOLDS.epaAllowedRank &&
    (player.rushes ?? 0) >= EPA_THRESHOLDS.minTargets
  ) {
    findings.push({
      id: `epa-${player.name.toLowerCase().replace(/\s+/g, '-')}-rush-${Date.now()}`,
      agent,
      type: 'rushing_epa_mismatch',
      stat: 'rushing_epa_rank',
      value_num: player.rushing_epa_rank,
      value_type: 'numeric',
      threshold_met: `rank <= ${EPA_THRESHOLDS.receivingEpaRank} AND opponent allows top ${EPA_THRESHOLDS.epaAllowedRank}`,
      comparison_context: `${ordinal(player.rushing_epa_rank)} in league vs ${ordinal(opponent.epa_allowed_to_rb_rank)} worst defense`,
      source_ref: `local://data/epa/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  return findings
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run __tests__/terminal/agents/epa.test.ts`
Expected: PASS

**Step 5: Create EPA skill.md**

```markdown
// lib/terminal/agents/epa/skill.md
# EPA Agent

## Domain
Expected Points Added - measures efficiency beyond yards/TDs.
Focus on receiving EPA, rushing EPA, and EPA allowed by position.

## Metrics That Matter
- receiving_epa
- rushing_epa
- red_zone_epa
- epa_allowed (by position)

## Voice Notes
Speak in efficiency terms. Avoid "he's been hot" - say "0.31 EPA/target, 3rd in league."
Always tie to a specific betting implication.

## Suppress If
- Sample size < 50 targets/rushes
- Backup QB situation
- Player injury status questionable or worse

## Example Claims
- "Receiving EPA + Target Share ranks top 5 in league vs opponent average"
- "Rushing EPA differential exceeds 0.15 vs league average"
```

**Step 6: Commit**

```bash
git add lib/terminal/agents/epa/ __tests__/terminal/agents/epa.test.ts
git commit -m "feat(terminal): add EPA agent thresholds and skill definition"
```

---

## Task 7: Pressure Agent Thresholds

**Files:**
- Create: `lib/terminal/agents/pressure/thresholds.ts`
- Create: `lib/terminal/agents/pressure/skill.md`
- Test: `__tests__/terminal/agents/pressure.test.ts`

**Step 1: Write failing test**

```typescript
// __tests__/terminal/agents/pressure.test.ts
import { describe, it, expect } from 'vitest'
import { PRESSURE_THRESHOLDS, checkPressureThresholds } from '@/lib/terminal/agents/pressure/thresholds'

describe('PRESSURE_THRESHOLDS', () => {
  it('has defined threshold values', () => {
    expect(PRESSURE_THRESHOLDS.pressureRateRank).toBe(10)
    expect(PRESSURE_THRESHOLDS.passBlockWinRateRank).toBe(22)
  })
})

describe('checkPressureThresholds', () => {
  it('returns finding when pressure mismatch exists', () => {
    const defenseData = {
      team: 'SF',
      pressure_rate: 42,
      pressure_rate_rank: 3,
    }
    const offenseData = {
      team: 'SEA',
      qb_name: 'Sam Darnold',
      pass_block_win_rate_rank: 28,
      qb_passer_rating_under_pressure: 31.2,
    }
    const context = {
      dataTimestamp: Date.now(),
      dataVersion: '2025-week-20',
    }

    const findings = checkPressureThresholds(defenseData, offenseData, context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].agent).toBe('pressure')
    expect(findings[0].type).toBe('pressure_rate_advantage')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run __tests__/terminal/agents/pressure.test.ts`
Expected: FAIL (module not found)

**Step 3: Create pressure thresholds module**

```typescript
// lib/terminal/agents/pressure/thresholds.ts
import type { Finding, AgentType } from '../../schemas'

export const PRESSURE_THRESHOLDS = {
  pressureRateRank: 10,         // top 10 pass rush
  passBlockWinRateRank: 22,     // bottom 10 OL
  sackRateRank: 10,
  qbPressuredRatingThreshold: 60,  // bad under pressure
} as const

interface DefenseData {
  team: string
  pressure_rate?: number
  pressure_rate_rank?: number
  sack_rate?: number
  sack_rate_rank?: number
}

interface OffenseData {
  team: string
  qb_name: string
  pass_block_win_rate_rank?: number
  qb_passer_rating_under_pressure?: number
}

interface ThresholdContext {
  dataTimestamp: number
  dataVersion: string
}

export function checkPressureThresholds(
  defense: DefenseData,
  offense: OffenseData,
  context: ThresholdContext
): Finding[] {
  const findings: Finding[] = []
  const agent: AgentType = 'pressure'

  // Check pressure rate advantage
  if (
    defense.pressure_rate_rank !== undefined &&
    defense.pressure_rate_rank <= PRESSURE_THRESHOLDS.pressureRateRank &&
    offense.pass_block_win_rate_rank !== undefined &&
    offense.pass_block_win_rate_rank >= PRESSURE_THRESHOLDS.passBlockWinRateRank
  ) {
    findings.push({
      id: `pressure-${defense.team.toLowerCase()}-vs-${offense.team.toLowerCase()}-${Date.now()}`,
      agent,
      type: 'pressure_rate_advantage',
      stat: 'pressure_rate_rank',
      value_num: defense.pressure_rate_rank,
      value_type: 'numeric',
      threshold_met: `defense rank <= ${PRESSURE_THRESHOLDS.pressureRateRank} AND OL rank >= ${PRESSURE_THRESHOLDS.passBlockWinRateRank}`,
      comparison_context: `${ordinal(defense.pressure_rate_rank)} pass rush vs ${ordinal(offense.pass_block_win_rate_rank)} OL`,
      source_ref: `local://data/pressure/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })

    // Add QB vulnerability if data exists
    if (
      offense.qb_passer_rating_under_pressure !== undefined &&
      offense.qb_passer_rating_under_pressure < PRESSURE_THRESHOLDS.qbPressuredRatingThreshold
    ) {
      findings.push({
        id: `pressure-${offense.qb_name.toLowerCase().replace(/\s+/g, '-')}-vuln-${Date.now()}`,
        agent,
        type: 'qb_pressure_vulnerability',
        stat: 'qb_passer_rating_under_pressure',
        value_num: offense.qb_passer_rating_under_pressure,
        value_type: 'numeric',
        threshold_met: `passer rating under pressure < ${PRESSURE_THRESHOLDS.qbPressuredRatingThreshold}`,
        comparison_context: `${offense.qb_name}: ${offense.qb_passer_rating_under_pressure} rating when pressured`,
        source_ref: `local://data/pressure/${context.dataVersion}.json`,
        source_type: 'local',
        source_timestamp: context.dataTimestamp,
      })
    }
  }

  return findings
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run __tests__/terminal/agents/pressure.test.ts`
Expected: PASS

**Step 5: Create pressure skill.md**

```markdown
// lib/terminal/agents/pressure/skill.md
# Pressure Agent

## Domain
Pass rush efficiency and offensive line protection.
Focus on pressure rate, sack rate, and QB performance under duress.

## Metrics That Matter
- pressure_rate
- pass_block_win_rate
- sack_rate
- qb_passer_rating_under_pressure

## Voice Notes
Speak in matchup terms. "42% pressure rate meets 28th-ranked OL" not "they get after the QB."
Always quantify the mismatch.

## Suppress If
- Defense missing key pass rusher
- OL has significant injury upgrade (starter returning)
- Weather heavily favors run game

## Example Claims
- "Pressure Rate ranks top 3 in league vs bottom 10 pass protection"
- "QB passer rating under pressure trails league average by 30+ points"
```

**Step 6: Commit**

```bash
git add lib/terminal/agents/pressure/ __tests__/terminal/agents/pressure.test.ts
git commit -m "feat(terminal): add Pressure agent thresholds and skill definition"
```

---

## Task 8: Weather Agent Thresholds

**Files:**
- Create: `lib/terminal/agents/weather/thresholds.ts`
- Create: `lib/terminal/agents/weather/skill.md`
- Test: `__tests__/terminal/agents/weather.test.ts`

**Step 1: Write failing test**

```typescript
// __tests__/terminal/agents/weather.test.ts
import { describe, it, expect } from 'vitest'
import { WEATHER_THRESHOLDS, checkWeatherThresholds } from '@/lib/terminal/agents/weather/thresholds'

describe('checkWeatherThresholds', () => {
  it('returns finding for high wind', () => {
    const weather = {
      temperature: 45,
      wind_mph: 18,
      precipitation_chance: 10,
      indoor: false,
    }
    const context = {
      dataTimestamp: Date.now(),
      dataVersion: '2025-week-20',
    }

    const findings = checkWeatherThresholds(weather, context)

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].type).toBe('weather_wind')
  })

  it('returns empty for indoor games', () => {
    const weather = {
      temperature: 72,
      wind_mph: 0,
      precipitation_chance: 0,
      indoor: true,
    }
    const context = {
      dataTimestamp: Date.now(),
      dataVersion: '2025-week-20',
    }

    const findings = checkWeatherThresholds(weather, context)

    expect(findings.length).toBe(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run __tests__/terminal/agents/weather.test.ts`
Expected: FAIL (module not found)

**Step 3: Create weather thresholds module**

```typescript
// lib/terminal/agents/weather/thresholds.ts
import type { Finding, AgentType } from '../../schemas'

export const WEATHER_THRESHOLDS = {
  windMph: 15,              // wind becomes factor
  coldTemp: 32,             // freezing affects play
  hotTemp: 90,              // heat affects play
  precipitationChance: 50,  // likely rain/snow
} as const

interface WeatherData {
  temperature: number
  wind_mph: number
  precipitation_chance: number
  precipitation_type?: 'rain' | 'snow' | 'none'
  indoor: boolean
  stadium?: string
}

interface ThresholdContext {
  dataTimestamp: number
  dataVersion: string
}

export function checkWeatherThresholds(
  weather: WeatherData,
  context: ThresholdContext
): Finding[] {
  const findings: Finding[] = []
  const agent: AgentType = 'weather'

  // Indoor games - no weather impact
  if (weather.indoor) {
    return findings
  }

  // Check wind
  if (weather.wind_mph >= WEATHER_THRESHOLDS.windMph) {
    findings.push({
      id: `weather-wind-${Date.now()}`,
      agent,
      type: 'weather_wind',
      stat: 'wind_mph',
      value_num: weather.wind_mph,
      value_type: 'numeric',
      threshold_met: `wind >= ${WEATHER_THRESHOLDS.windMph} mph`,
      comparison_context: `${weather.wind_mph} mph wind - affects deep passing`,
      source_ref: `local://data/weather/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  // Check cold
  if (weather.temperature <= WEATHER_THRESHOLDS.coldTemp) {
    findings.push({
      id: `weather-cold-${Date.now()}`,
      agent,
      type: 'weather_cold',
      stat: 'temperature',
      value_num: weather.temperature,
      value_type: 'numeric',
      threshold_met: `temp <= ${WEATHER_THRESHOLDS.coldTemp}°F`,
      comparison_context: `${weather.temperature}°F - cold weather game`,
      source_ref: `local://data/weather/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  // Check precipitation
  if (weather.precipitation_chance >= WEATHER_THRESHOLDS.precipitationChance) {
    findings.push({
      id: `weather-precip-${Date.now()}`,
      agent,
      type: 'weather_rain',
      stat: 'precipitation_chance',
      value_num: weather.precipitation_chance,
      value_type: 'numeric',
      threshold_met: `precipitation >= ${WEATHER_THRESHOLDS.precipitationChance}%`,
      comparison_context: `${weather.precipitation_chance}% chance of ${weather.precipitation_type || 'precipitation'}`,
      source_ref: `local://data/weather/${context.dataVersion}.json`,
      source_type: 'local',
      source_timestamp: context.dataTimestamp,
    })
  }

  return findings
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run __tests__/terminal/agents/weather.test.ts`
Expected: PASS

**Step 5: Create weather skill.md and commit**

```markdown
// lib/terminal/agents/weather/skill.md
# Weather Agent

## Domain
Environmental factors affecting game play.
Focus on wind, temperature, and precipitation.

## Metrics That Matter
- wind_mph
- temperature
- precipitation_chance

## Voice Notes
Be specific about impact. "18 mph crosswind limits deep accuracy" not "bad weather."
Note stadium orientation if relevant.

## Suppress If
- Indoor stadium
- Dome closed
- Marginal conditions (12 mph wind, 40°F)

## Example Claims
- "Wind exceeds 15 mph threshold - impacts deep passing game"
- "Temperature trails 32°F - cold weather adjustments likely"
```

**Step 6: Commit**

```bash
git add lib/terminal/agents/weather/ __tests__/terminal/agents/weather.test.ts
git commit -m "feat(terminal): add Weather agent thresholds and skill definition"
```

---

## Task 9: Remaining Agents (QB, HB, WR, TE)

Create similar threshold modules for QB, HB, WR, TE agents following the same pattern.

**Files per agent:**
- `lib/terminal/agents/{agent}/thresholds.ts`
- `lib/terminal/agents/{agent}/skill.md`
- `__tests__/terminal/agents/{agent}.test.ts`

**Commit after each agent:**
```bash
git commit -m "feat(terminal): add {Agent} agent thresholds and skill definition"
```

---

## Task 10: Agent Engine - Finding Aggregator

**Files:**
- Create: `lib/terminal/engine/agent-runner.ts`
- Create: `lib/terminal/engine/index.ts`
- Test: `__tests__/terminal/engine/agent-runner.test.ts`

**Step 1: Write failing test**

```typescript
// __tests__/terminal/engine/agent-runner.test.ts
import { describe, it, expect } from 'vitest'
import { runAgents } from '@/lib/terminal/engine/agent-runner'

describe('runAgents', () => {
  it('aggregates findings from all agents', async () => {
    const matchupContext = {
      homeTeam: 'SEA',
      awayTeam: 'SF',
      players: {
        'SEA': [{ name: 'Jaxon Smith-Njigba', receiving_epa_rank: 3, targets: 120 }],
        'SF': [{ name: 'Christian McCaffrey', rushing_epa_rank: 2, rushes: 200 }],
      },
      teamStats: {
        'SEA': { epa_allowed_to_wr_rank: 15, pass_block_win_rate_rank: 28 },
        'SF': { pressure_rate_rank: 3, epa_allowed_to_rb_rank: 20 },
      },
      weather: { temperature: 38, wind_mph: 12, precipitation_chance: 10, indoor: false },
      dataTimestamp: Date.now(),
      dataVersion: '2025-week-20',
    }

    const result = await runAgents(matchupContext)

    expect(result.findings).toBeInstanceOf(Array)
    expect(result.agentsInvoked).toContain('epa')
    expect(result.agentsInvoked).toContain('pressure')
    expect(result.agentsInvoked).toContain('weather')
  })
})
```

**Step 2: Implement agent runner (abbreviated - follow TDD pattern)**

```typescript
// lib/terminal/engine/agent-runner.ts
import type { Finding, AgentType } from '../schemas'
import { checkEpaThresholds } from '../agents/epa/thresholds'
import { checkPressureThresholds } from '../agents/pressure/thresholds'
import { checkWeatherThresholds } from '../agents/weather/thresholds'

const ALL_AGENTS: AgentType[] = ['epa', 'pressure', 'weather', 'qb', 'hb', 'wr', 'te']

interface MatchupContext {
  homeTeam: string
  awayTeam: string
  players: Record<string, any[]>
  teamStats: Record<string, any>
  weather: any
  dataTimestamp: number
  dataVersion: string
}

interface AgentRunResult {
  findings: Finding[]
  agentsInvoked: AgentType[]
  agentsSilent: AgentType[]
}

export async function runAgents(context: MatchupContext): Promise<AgentRunResult> {
  const findings: Finding[] = []
  const agentsInvoked: AgentType[] = []
  const agentsSilent: AgentType[] = []

  const thresholdContext = {
    dataTimestamp: context.dataTimestamp,
    dataVersion: context.dataVersion,
  }

  // Run EPA agent
  for (const team of [context.homeTeam, context.awayTeam]) {
    const opponent = team === context.homeTeam ? context.awayTeam : context.homeTeam
    for (const player of context.players[team] || []) {
      const epaFindings = checkEpaThresholds(player, context.teamStats[opponent], thresholdContext)
      findings.push(...epaFindings)
    }
  }
  if (findings.some(f => f.agent === 'epa')) {
    agentsInvoked.push('epa')
  } else {
    agentsSilent.push('epa')
  }

  // Run Pressure agent
  const pressureFindings = checkPressureThresholds(
    context.teamStats[context.awayTeam],
    { ...context.teamStats[context.homeTeam], team: context.homeTeam, qb_name: 'QB' },
    thresholdContext
  )
  findings.push(...pressureFindings)
  if (pressureFindings.length > 0) {
    agentsInvoked.push('pressure')
  } else {
    agentsSilent.push('pressure')
  }

  // Run Weather agent
  const weatherFindings = checkWeatherThresholds(context.weather, thresholdContext)
  findings.push(...weatherFindings)
  if (weatherFindings.length > 0) {
    agentsInvoked.push('weather')
  } else {
    agentsSilent.push('weather')
  }

  // Add remaining agents to silent if not invoked
  for (const agent of ALL_AGENTS) {
    if (!agentsInvoked.includes(agent) && !agentsSilent.includes(agent)) {
      agentsSilent.push(agent)
    }
  }

  return { findings, agentsInvoked, agentsSilent }
}
```

**Step 3: Commit**

```bash
git add lib/terminal/engine/ __tests__/terminal/engine/
git commit -m "feat(terminal): add agent runner to aggregate findings"
```

---

## Task 11: /api/scan Route

**Files:**
- Create: `app/api/terminal/scan/route.ts`
- Test: Manual verification

**Step 1: Create the scan route**

```typescript
// app/api/terminal/scan/route.ts
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { runAgents } from '@/lib/terminal/engine/agent-runner'
import { buildProvenance, hashContent } from '@/lib/terminal/engine/provenance'
import { renderFindingsFallback, formatFallbackForTerminal } from '@/lib/terminal/engine/fallback-renderer'
import { checkRequestLimits, REQUEST_LIMITS } from '@/lib/terminal/engine/guardrails'

const ScanRequestSchema = z.object({
  matchup: z.string(),  // "49ers @ Seahawks" or "SF @ SEA"
})

export async function POST(req: NextRequest) {
  const requestId = randomUUID()

  try {
    const body = await req.json()
    const parsed = ScanRequestSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // TODO: Load matchup context from data layer
    const matchupContext = await loadMatchupContext(parsed.data.matchup)

    // Run threshold checks (deterministic)
    const { findings, agentsInvoked, agentsSilent } = await runAgents(matchupContext)

    if (findings.length === 0) {
      return Response.json({
        request_id: requestId,
        alerts: [],
        message: 'No significant findings for this matchup',
        agents_silent: agentsSilent,
      })
    }

    // TODO: Transform Finding[] → Alert[] via LLM
    // For now, return findings with fallback renderer
    const fallbackOutput = renderFindingsFallback(findings)

    const provenance = buildProvenance({
      requestId,
      prompt: '', // No LLM call yet
      skillMds: {},
      findings,
      dataVersion: matchupContext.dataVersion,
      dataTimestamp: matchupContext.dataTimestamp,
      searchTimestamps: [],
      agentsInvoked,
      agentsSilent,
      cacheHits: 0,
      cacheMisses: 0,
      llmModel: 'none',
      llmTemperature: 0,
    })

    return Response.json({
      request_id: requestId,
      findings,
      fallback_output: fallbackOutput,
      provenance,
    })
  } catch (error) {
    return Response.json(
      { error: 'Scan failed', message: (error as Error).message },
      { status: 500 }
    )
  }
}

async function loadMatchupContext(matchup: string) {
  // TODO: Implement actual data loading
  // For now, return mock data
  return {
    homeTeam: 'SEA',
    awayTeam: 'SF',
    players: {},
    teamStats: {},
    weather: { temperature: 45, wind_mph: 10, precipitation_chance: 20, indoor: false },
    dataTimestamp: Date.now(),
    dataVersion: '2025-week-20',
  }
}
```

**Step 2: Commit**

```bash
git add app/api/terminal/scan/
git commit -m "feat(terminal): add /api/terminal/scan route with Finding[] output"
```

---

## Task 12-15: Continue with remaining routes and UI

Following the same TDD pattern:

- **Task 12:** LLM analyst integration (Finding[] → Alert[])
- **Task 13:** /api/terminal/build route (Alert[] → Script[])
- **Task 14:** /api/terminal/bet route (Alert[] → Ladder[])
- **Task 15:** Terminal UI component with command parser
- **Task 16:** Team color theming

Each task follows the same structure:
1. Write failing test
2. Verify it fails
3. Implement minimally
4. Verify it passes
5. Commit

---

## Summary

This plan covers the full implementation in order:

1. **Schemas** - Zod contracts for Evidence, Finding, Alert, ClaimParts, Provenance
2. **Validators** - Source integrity, implications allowlist, line freshness, edge language
3. **Confidence** - Code-derived calculation
4. **Provenance** - Hashing for reproducibility
5. **Guardrails** - Request limits, streaming heartbeat, fallback renderer
6. **Agents** - EPA, Pressure, Weather, QB, HB, WR, TE thresholds
7. **Engine** - Agent runner aggregating findings
8. **Routes** - /api/scan, /api/build, /api/bet
9. **UI** - Terminal emulator with command parser and team theming
