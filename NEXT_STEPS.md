# Next Steps

## Pending Fixes

### 1. Update `/api/terminal/build` tests for new schema

**Status**: Pre-existing failure (7 tests)  
**File**: `__tests__/api/terminal/build.test.ts`

**Issue**:  
The tests use the old schema (`alert_ids`, `alert_metadata`) but the route was refactored to expect inline payload (`alerts`, `findings`).

**Failing tests**:
- `builds scripts from weather cascade correlation`
- `builds scripts from defensive funnel correlation`
- `returns empty scripts when no correlations found`
- `includes provenance hash and timing`
- `respects max_legs option`
- `assigns appropriate risk levels`
- `returns endpoint documentation`

**Fix required**:  
Update test payloads from:
```typescript
{
  alert_ids: ['weather-1', 'qb-1', 'wr-1'],
  alert_metadata: [
    { id: 'weather-1', agent: 'weather', market: '...', confidence: 0.65 },
    ...
  ],
}
```

To:
```typescript
{
  matchup: 'SF @ SEA',
  alerts: [...],      // Full Alert[] objects
  findings: [...],    // Full Finding[] objects
  output_type: 'prop' | 'story' | 'parlay',
}
```

---

## Backlog

_Add future items here._
