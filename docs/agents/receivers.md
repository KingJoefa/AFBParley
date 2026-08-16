# Receivers Agent

`bet_station_position_id: wr`
`legacy_game_agent_id: wr`

**Status:** Bet Station research reference. This is not a selectable Game Script v5 agent.

## Purpose

Detect where route participation, target concentration, alignment, and coverage interaction can create repeatable passing access or explosive plays.

## Scope Boundary

Receivers owns route profile, alignment, and receiver-versus-coverage access. Quarterback owns delivery quality, and Usage owns who receives the opportunities; target volume alone is not a coverage edge.

## Core Football Questions

- Which receivers are actually on the field and earning first-read opportunities?
- Where do they align, and which coverage defenders or shells meet those routes?
- Is the offense built on volume, depth, yards after catch, or explosive conversion?
- Can pressure or weather prevent the route tree from developing?

## Required Inputs

- Route participation, targets per route, target share, first-read share, and air-yard share.
- Alignment, depth of target, yards after catch, and explosive reception rate.
- Coverage shell, man/zone, corner alignment, safety help, and allowed route-profile data.
- Red-zone and end-zone target shares.

**Current support:** Assumption-only. Swantail has no active route, target, or coverage observation adapter.

## Causal Assumptions

- Routes create opportunity; targets without route context can misstate role strength.
- Concentrated first-read and air-yard usage creates a clear path for passing volume to accumulate.
- Coverage interaction must be specific to alignment and route family, not a generic corner-versus-receiver label.
- Pressure and weather can remove deep-developing routes before coverage becomes the deciding mechanism.

## Useful Signals

- Route participation and targets per route.
- First-read, target, and air-yard concentration.
- Slot, perimeter, motion, and condensed-formation usage.
- Man/zone and coverage-shell performance.
- End-zone and red-zone target share.

## Failure Modes

- Coverage rolls help toward the expected focal receiver.
- Pressure prevents route development.
- Targets redistribute to tight ends or backs.
- The offense leads and reduces passing volume.
- Injury or snap limitation changes the route hierarchy.

## Suggested Anchors

Current defaults: `game_over`, `pass_heavy`.

## Useful Pairings

Quarterback, Pressure, Usage, Tight Ends, and Weather.

## Example Output Shape

```json
{
  "agent_id": "wr",
  "assumption": "Receiver concentration creates repeatable explosive-play opportunities.",
  "statement": "The receiver-access hypothesis is selected, but no sourced route or coverage observation is attached.",
  "evidence_state": "assumption_only",
  "observations": [],
  "suggested_anchor_ids": ["game_over", "pass_heavy"]
}
```
