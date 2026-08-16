# Turnovers Agent

`agent_id: turnovers`

## Purpose

Detect a ball-security and takeaway collision capable of creating lost possessions, short fields, and rapid game-state changes.

## Scope Boundary

Turnovers owns repeatable ball-risk process and the offense-versus-defense takeaway cross-match. It discounts recovery luck, does not use raw turnover margin as a prediction, and leaves the broader range of outcomes to Volatility.

## Core Football Questions

- Does either quarterback expose the ball through interceptions, sacks, or pressured mistakes?
- Does either offense have a fumble problem in the backfield or after the catch?
- Can the opposing defense create takeaways through pressure, coverage disguise, or tackling?
- Are turnover results supported by repeatable process or mostly recovery and interception luck?

## Required Inputs

- Interception, turnover-worthy play, fumble, and fumble-lost rates.
- Pressure, sack-fumble, pass-breakup, and takeaway opportunity data.
- Field position and points created from takeaways.
- Game-state, quarterback, and ball-carrier attribution.

**Current support:** Pilot nflverse team-stat observations are active after ingestion. The finding cross-matches giveaways, interception rate, fumbles lost, takeaways, and forced fumbles. It does not yet include turnover-worthy plays, pressure attribution, or field-position value.

## Causal Assumptions

- Turnovers matter through both the lost possession and the field position they create.
- Pressure-caused mistakes are more matchup-relevant than raw season turnover margin.
- Fumble recoveries and some interceptions are unstable, so opportunity matters more than results alone.
- A turnover mismatch widens the range of plausible game shapes.

## Useful Signals

- Pressure-to-turnover and sack-fumble rates.
- Turnover-worthy plays versus actual interceptions.
- Fumbles by role and contact type.
- Defensive takeaways supported by pressure and pass breakups.
- Starting field position after takeaways.

## Failure Modes

- The offense protects the quarterback and avoids forced throws.
- Turnover opportunities occur but recovery or interception variance goes the other way.
- Conservative game state removes risky dropbacks.
- The defense's turnover total is mostly non-repeatable luck.
- A quarterback or ball-carrier change invalidates the baseline.

## Suggested Anchors

A material cross-match can suggest `high_variance` plus the winner anchor for the team with the cleaner turnover exchange. Balanced and unavailable profiles suggest no anchor.

## Useful Pairings

Pressure, Quarterback, Momentum, and Efficiency/EPA. A material finding can derive a high-variance script shape without a separate Volatility agent.

## Example Output Shape

```json
{
  "agent_id": "turnovers",
  "assumption": "A ball-security mismatch creates short fields and lost possessions.",
  "finding": {
    "state": "material",
    "direction": "home",
    "headline": "The home team has the cleaner ball-security matchup",
    "signals": [
      { "label": "Cross-match exposure", "away_value": "elevated", "home_value": "contained" }
    ]
  },
  "evidence_state": "observed_support",
  "suggested_anchor_ids": ["home_win", "high_variance"]
}
```
