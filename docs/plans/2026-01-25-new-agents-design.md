# New Agents Design: Injury, Usage, Pace

**Date:** 2026-01-25
**Status:** Approved for implementation

## Overview

Three new agents to extend Swantail Terminal's analytical coverage:

| Agent | Scope | Data Source | Toggleable |
|-------|-------|-------------|------------|
| `injury` | Player/Team | Notes JSON | Yes |
| `usage` | Player | MatchupContext.players | Yes |
| `pace` | Game/Team | MatchupContext.teamStats | Yes |

## Architecture Decisions

### 1. Single Shared ImplicationSchema

All agents use one market-centric `ImplicationSchema` (no per-agent enums):

```typescript
export const ImplicationSchema = z.enum([
  // Game-level
  'game_total_over', 'game_total_under',
  // Team-level
  'team_total_over', 'team_total_under',
  // QB
  'qb_pass_yards_over', 'qb_pass_yards_under',
  'qb_pass_tds_over', 'qb_pass_tds_under',
  'qb_completions_over', 'qb_completions_under',
  'qb_ints_over', 'qb_sacks_over',
  // RB
  'rb_rush_yards_over', 'rb_rush_yards_under',
  'rb_receptions_over', 'rb_rush_attempts_over', 'rb_tds_over',
  // WR
  'wr_receptions_over', 'wr_receptions_under',
  'wr_yards_over', 'wr_yards_under',
  'wr_tds_over', 'wr_longest_reception_over',
  // TE
  'te_receptions_over', 'te_receptions_under',
  'te_yards_over', 'te_yards_under', 'te_tds_over',
  // Defense
  'def_sacks_over', 'field_goals_over',
])
```

### 2. Discriminated Union Finding Schema

Finding schema uses discriminated union on `agent` with:
- Shared base fields (id, scope, metric, thresholds, value, confidence, source)
- Per-agent typed payload
- Scope enforcement per agent (injury/usage → player|team, pace → game|team)

```typescript
const FindingBaseSchema = z.object({
  id: z.string(),
  agent: AgentTypeSchema,
  scope: z.enum(['game', 'team', 'player']),
  metric: MetricKeySchema,
  value: z.union([z.number(), z.string()]),
  thresholds: z.array(ThresholdSchema),
  comparison_context: z.string(),
  confidence: z.number().min(0).max(1),
  source_ref: z.string(),
  source_type: z.enum(['notes', 'matchupContext', 'web']),
  source_timestamp: z.number(),
  implication: ImplicationSchema,
})

// Discriminated by agent - only matching payload allowed
export const FindingSchema = z.discriminatedUnion('agent', [
  // injury: payload with status, practice, player, team, position, designation
  // usage: payload with snap_pct, route_participation, target_share, trend, window
  // pace: payload with projected_plays, seconds_per_play, delta_vs_league, data_quality
  // ... existing agents with optional empty payload
])
```

### 3. Raw Data In, Findings Out

MatchupContext stays raw and atomic. Agents compute at runtime:

- **MatchupContext.players**: Extended with usage fields (0-1 scale, dual windows)
- **MatchupContext.teamStats**: Extended with pace fields (raw inputs only)
- **MatchupContext.injuries**: Raw strings, Injury agent parses and emits findings

No computed fields (like `pace_matchup`) stored in MatchupContext.

---

## Data Extensions

### PlayerData (Usage Agent)

```typescript
interface PlayerData {
  // Identity (stable)
  player_id: string
  name: string
  team: string
  position: string

  // Existing ranks (unchanged)
  // ...

  // NEW: Usage fields (0-1 scale)
  snap_pct_season?: number
  snap_pct_l4?: number
  route_participation_season?: number
  route_participation_l4?: number
  target_share_season?: number
  target_share_l4?: number

  // Sample size for suppression
  games_in_window?: number
  routes_sample?: number
  targets_sample?: number
  injury_limited?: boolean
}
```

### TeamStats (Pace Agent)

```typescript
interface TeamStats {
  // Existing defense ranks (unchanged)
  // ...

  // NEW: Pace fields (raw)
  pace_rank?: number             // 1-32
  plays_per_game?: number        // e.g., 64.5
  seconds_per_play?: number      // e.g., 26.8
  neutral_pace?: number          // pace when score within 7
}
```

### League Constants

```typescript
// lib/terminal/agents/pace/league_constants.ts
export const LEAGUE_CONSTANTS: Record<number, LeagueStats> = {
  2025: {
    avg_plays_per_game: 63.0,
    avg_seconds_per_play: 30.0,
  }
}
```

---

## Agent Specifications

### Injury Agent

**Purpose:** Parse curated injury reports to identify material absences.

**Position Groups:**
```typescript
export const InjuryPositionSchema = z.enum([
  'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'
])

export const InjuryDesignationSchema = z.enum([
  'starter', 'rotation', 'depth', 'unknown'
])
```

**Thresholds:**
```typescript
export const INJURY_THRESHOLDS = {
  material_statuses: ['OUT', 'DOUBTFUL'] as const,
  always_material: ['QB'] as const,
  conditional_material: ['RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB'] as const,
}
```

**Firing Rules:**
- (status in material_statuses) AND
- (position in always_material) OR
- (position in conditional_material AND designation in ['starter', 'rotation'])

**Note:** designation defaults to 'unknown'; conditional_material only fires when designation is explicitly known.

**Finding Types:**
```typescript
export const InjuryFindingTypeSchema = z.enum([
  'qb_unavailable',
  'skill_player_unavailable',
  'oline_unavailable',
  'defensive_playmaker_unavailable',
])
```

**Implication Map:**
| Finding Type | Implications |
|--------------|--------------|
| qb_unavailable | qb_pass_yards_under, qb_ints_over, team_total_under |
| skill_player_unavailable | team_total_under |
| oline_unavailable | qb_sacks_over, rb_rush_yards_under |
| defensive_playmaker_unavailable | team_total_over |

---

### Usage Agent

**Purpose:** Identify volume leaders and usage trajectory changes.

**Thresholds:**
```typescript
export const USAGE_THRESHOLDS = {
  // Absolute (apply to L4)
  snap_pct_high: 0.80,
  snap_pct_low: 0.50,
  route_participation_high: 0.85,
  target_share_high: 0.25,
  target_share_elite: 0.30,

  // Trend (L4 vs season delta)
  trend_rising: 0.05,
  trend_falling: -0.05,

  // Required fields (for suppression)
  min_games_in_window: 4,
  min_routes_sample: 50,
  min_targets_sample: 15,
}
```

**Suppress If:**
- games_in_window < 4
- routes_sample < 50
- targets_sample < 15
- injury_limited = true

**Finding Types:**
```typescript
export const UsageFindingTypeSchema = z.enum([
  'volume_workhorse',
  'target_share_alpha',
  'target_share_elite',
  'usage_trending_up',
  'usage_trending_down',
  'snap_share_committee',
])
```

**Implication Map:**
| Finding Type | Implications |
|--------------|--------------|
| volume_workhorse | rb_rush_attempts_over, rb_receptions_over |
| target_share_alpha | wr_receptions_over, wr_yards_over |
| target_share_elite | wr_receptions_over, wr_yards_over, wr_tds_over |
| usage_trending_up | wr_receptions_over |
| usage_trending_down | wr_receptions_under, wr_yards_under |
| snap_share_committee | rb_rush_yards_under |

---

### Pace Agent

**Purpose:** Combine both teams' pace tendencies to signal over/under mechanisms.

**Thresholds:**
```typescript
export const PACE_THRESHOLDS = {
  // Per-team (vs league)
  fast_pace_rank: 10,
  slow_pace_rank: 23,
  seconds_delta_significant: 2.5,

  // Projected plays (matchup level)
  projected_plays_high: 68,
  projected_plays_low: 58,
  projected_plays_delta: 5,
}
```

**Matchup Blend Computation:**
```typescript
function computeProjectedPlays(
  home: TeamStats,
  away: TeamStats,
  year: number
): { plays: number; data_quality: 'full' | 'partial' | 'fallback' } {
  const league = LEAGUE_CONSTANTS[year]
  let data_quality: 'full' | 'partial' | 'fallback' = 'full'

  // Prefer plays_per_game, fall back to seconds_per_play derivation
  let homeContrib = home.plays_per_game
  if (!homeContrib && home.seconds_per_play) {
    homeContrib = (3600 / home.seconds_per_play) * 0.5  // rough conversion
    data_quality = 'partial'
  }
  if (!homeContrib) {
    homeContrib = league.avg_plays_per_game
    data_quality = 'fallback'
  }

  let awayContrib = away.plays_per_game
  if (!awayContrib && away.seconds_per_play) {
    awayContrib = (3600 / away.seconds_per_play) * 0.5
    if (data_quality === 'full') data_quality = 'partial'
  }
  if (!awayContrib) {
    awayContrib = league.avg_plays_per_game
    data_quality = 'fallback'
  }

  return {
    plays: (homeContrib + awayContrib) / 2,
    data_quality,
  }
}
```

**Weather Modifier (not hard suppress):**
```typescript
// Wind > 20 mph: downgrade confidence, suppress only totals implications
if (weather.wind_mph > 20) {
  finding.confidence *= 0.7  // 30% penalty
  finding.implications = finding.implications.filter(
    imp => !imp.includes('total')  // keep non-totals implications
  )
}
```

**Finding Types:**
```typescript
export const PaceFindingTypeSchema = z.enum([
  'pace_over_signal',
  'pace_under_signal',
  'pace_mismatch',
  'team_plays_above_avg',
  'team_plays_below_avg',
])
```

**Implication Map:**
| Finding Type | Implications |
|--------------|--------------|
| pace_over_signal | game_total_over, qb_pass_yards_over |
| pace_under_signal | game_total_under, rb_rush_attempts_over |
| pace_mismatch | (context-dependent, no default) |
| team_plays_above_avg | team_total_over |
| team_plays_below_avg | team_total_under |

---

## Registration Checklist

1. **Schema updates:**
   - [ ] Add `injury`, `usage`, `pace` to `AgentTypeSchema` in `finding.ts`
   - [ ] Add to `ALL_AGENT_IDS` in `run-state.ts`
   - [ ] Add `AGENT_META` entries
   - [ ] Extend `ImplicationSchema` if needed
   - [ ] Add discriminated union branches to `FindingSchema`

2. **Data extensions:**
   - [ ] Extend `PlayerData` with usage fields (dual windows, sample sizes)
   - [ ] Extend `TeamStats` with pace fields
   - [ ] Add `player_id` to `PlayerData`

3. **Agent files:**
   - [ ] `lib/terminal/agents/injury/skill.md`
   - [ ] `lib/terminal/agents/injury/thresholds.ts`
   - [ ] `lib/terminal/agents/usage/skill.md`
   - [ ] `lib/terminal/agents/usage/thresholds.ts`
   - [ ] `lib/terminal/agents/pace/skill.md`
   - [ ] `lib/terminal/agents/pace/thresholds.ts`
   - [ ] `lib/terminal/agents/pace/league_constants.ts`

4. **Agent runner:**
   - [ ] Import check functions
   - [ ] Add `if (agentsToRun.includes('injury'))` block
   - [ ] Add `if (agentsToRun.includes('usage'))` block
   - [ ] Add `if (agentsToRun.includes('pace'))` block

5. **Analyst prompt:**
   - [ ] Add valid implications for new agents

---

## Testing Strategy

1. **Unit tests per agent:**
   - Threshold logic fires correctly
   - Suppression rules work
   - Finding payloads are typed correctly

2. **Integration tests:**
   - Agent runner invokes new agents
   - Findings flow through to analyst
   - Implications map correctly

3. **Regression tests:**
   - Existing agents unaffected
   - MatchupContext extensions don't break existing consumers
