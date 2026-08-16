# Momentum Agent

`agent_id: momentum`

## Purpose

Detect whether recent opponent-adjusted performance reflects a meaningful change in team quality, role, or scheme rather than a superficial winning or losing streak.

## Scope Boundary

Momentum owns change from a stable team baseline. It does not treat wins, losses, confidence, or a short hot streak as evidence by themselves, and it leaves full-season quality to Efficiency/EPA.

## Core Football Questions

- Has either team's efficiency changed relative to its full-season baseline?
- Is the change broad across success rate, explosives, and drive finishing, or driven by a few unstable plays?
- Did personnel, play calling, or opponent quality change during the recent window?
- Is the recent form likely to persist in this specific matchup?

## Required Inputs

- Rolling offensive and defensive EPA and success rate.
- Explosive-play rate, early-down efficiency, and finishing-drives splits.
- Opponent quality, game state, and recent personnel or coordinator changes.
- At least a three-game window plus a stable season baseline.

**Current support:** Assumption-only. The current EPA pilot supplies a baseline but not rolling, opponent-adjusted form observations.

## Causal Assumptions

- Momentum is a measurable change in process, not a win streak.
- Recent improvement matters only when it survives opponent and game-state adjustment.
- Personnel and scheme changes are more likely to persist than turnover luck or one-play variance.
- A real form gap can compound into early control and scoreboard separation.

## Useful Signals

- Rolling EPA and success-rate change versus season baseline.
- Early-down and neutral-state improvement.
- Reduced pressure or sack exposure after a protection change.
- Stable role changes after injury or depth-chart movement.
- Opponent-adjusted drive success and finishing.

## Failure Modes

- The recent window contains weak opponents or garbage-time production.
- Turnover margin or defensive scores explain most of the improvement.
- The personnel or schematic change does not carry into this matchup.
- Regression in explosive plays or conversion erases the apparent trend.
- The sample is too short to distinguish signal from noise.

## Suggested Anchors

Current default: `blowout`.

This anchor represents a meaningful form gap compounding into separation. Team direction must be added before Momentum can suggest a winner or cover.

## Useful Pairings

Efficiency/EPA, Injuries, Quarterback, and Trenches.

## Example Output Shape

```json
{
  "agent_id": "momentum",
  "assumption": "A meaningful recent change in opponent-adjusted execution carries forward.",
  "statement": "Momentum is selected as a causal lens, but no sourced rolling-performance observation is attached.",
  "evidence_state": "assumption_only",
  "observations": [],
  "suggested_anchor_ids": ["blowout"]
}
```
