# Usage Agent

`bet_station_internal_lens: usage`
`legacy_game_agent_id: usage`

**Status:** Internal Bet Station allocation reference. Usage is not a selectable Game Script v5 agent or a user-facing market family.

## Purpose

Identify where snaps, routes, touches, targets, protection responsibilities, and high-value opportunities are likely to concentrate.

## Scope Boundary

Usage owns opportunity allocation and role redistribution across positions. It identifies who can capture a scenario, but does not claim that volume will be efficient or that a player wins the matchup.

## Core Football Questions

- Which roles are stable, expanding, shrinking, or newly available?
- Is opportunity concentrated enough to create a dependable causal path?
- Which game states keep the player on the field?
- Does an injury or scheme change redistribute volume to one player or several?
- Are the opportunities high value, such as routes, air yards, third downs, and red-zone work?

## Required Inputs

- Snap, route, carry, target, first-read, and air-yard shares.
- Third-down, two-minute, short-yardage, red-zone, and end-zone roles.
- Recent-week trends with injury and depth-chart context.
- Personnel grouping, substitution, and game-state splits.

**Current support:** Assumption-only. The injury pilot can identify availability context, but no current adapter supplies role participation or redistribution.

## Causal Assumptions

- Stable participation is the base layer; opportunity cannot accumulate from the sideline.
- Routes and high-value touches matter more than raw snaps.
- Concentration creates a clearer story than diffuse committee usage.
- Usage does not guarantee efficiency; it identifies who captures the scenario if the offense succeeds.

## Useful Signals

- Route participation and snap share above role-specific thresholds.
- First-read, target, air-yard, carry, and red-zone concentration.
- Two-minute and third-down participation.
- Changes after an injury, bye, trade, or coordinator adjustment.
- Personnel packages that keep or remove a player by game state.

## Failure Modes

- A committee forms instead of one role inheriting volume.
- The player participates but earns low-value opportunities.
- Game state removes the expected package or role.
- Efficiency collapses despite high volume.
- Injury news or inactive status changes after the snapshot.

## Suggested Anchors

Current default: `pass_heavy`.

This default is too narrow for backfield or defensive-injury redistribution. Directional subject selection should precede any broader usage-anchor behavior.

## Useful Pairings

Injuries, Quarterback, Backfield, Receivers, and Tight Ends.

## Example Output Shape

```json
{
  "agent_id": "usage",
  "assumption": "A concentrated role funnels opportunity toward the likely volume captors.",
  "statement": "Usage concentration is selected as a lens, but no sourced participation or role observation is attached.",
  "evidence_state": "assumption_only",
  "observations": [],
  "suggested_anchor_ids": ["pass_heavy"]
}
```
