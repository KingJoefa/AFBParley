# Tight Ends Agent

`bet_station_position_id: te`
`legacy_game_agent_id: te`

**Status:** Bet Station research reference. This is not a selectable Game Script v5 agent.

## Purpose

Determine whether tight-end alignment and usage can unlock the middle of the field, create matchup stress, or become a red-zone conversion mechanism.

## Scope Boundary

Tight Ends owns the position-specific route, blocking, and coverage tradeoff. It should resolve only when tight-end deployment creates a distinct mechanism that the broader Receivers or Usage agents would miss.

## Core Football Questions

- Is the tight end running routes or staying in to protect?
- Does the defense concede middle-field, seam, play-action, or red-zone access?
- Which defender or coverage rule carries the tight end by alignment?
- Does pressure increase quick middle-field targets or force the tight end into protection?

## Required Inputs

- Route participation, targets per route, target share, and alignment.
- Inline, slot, wide, motion, and play-action usage.
- Middle-of-field, seam, third-down, red-zone, and end-zone targets.
- Opponent coverage and allowed production by alignment or route family.

**Current support:** Assumption-only. Swantail has no active tight-end usage or coverage observation adapter.

## Causal Assumptions

- Tight-end value depends on route opportunity; raw snaps can include substantial blocking work.
- Middle-field access can sustain drives even without explosive production.
- Pressure can increase short-area opportunity or remove routes through added protection.
- Red-zone usage is valuable only if the offense reaches scoring position often enough.

## Useful Signals

- Route participation relative to total snaps.
- Targets per route and first-read share.
- Seam, play-action, and middle-of-field usage.
- Third-down and red-zone target concentration.
- Opponent linebacker, safety, and zone-spacing behavior.

## Failure Modes

- The tight end stays in to protect against pressure.
- Wide receivers or backs capture the middle-field opportunities.
- The defense brackets the seam or passes routes cleanly between zones.
- The offense does not create enough red-zone possessions.
- Multiple tight ends split routes and targets.

## Suggested Anchors

Current default: `pass_heavy`.

## Useful Pairings

Quarterback, Pressure, Receivers, Usage, and Efficiency/EPA.

## Example Output Shape

```json
{
  "agent_id": "te",
  "assumption": "Middle-field and red-zone access make tight-end involvement a conversion mechanism.",
  "statement": "The tight-end access hypothesis is selected, but no sourced route or coverage observation is attached.",
  "evidence_state": "assumption_only",
  "observations": [],
  "suggested_anchor_ids": ["pass_heavy"]
}
```
