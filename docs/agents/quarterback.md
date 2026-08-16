# Quarterback Agent

`agent_id: qb`

## Purpose

Identify the quarterback mechanism most likely to determine drive quality, explosive access, and the ceiling or fragility of the game script.

## Scope Boundary

Quarterback owns the passer's decisions, accuracy, mobility, sack avoidance, and response to coverage and pressure. It does not stand in for team-level efficiency, protection quality, or receiver access.

## Core Football Questions

- How efficient is the quarterback from a clean pocket and under pressure?
- Does the quarterback create value through accuracy, depth, timing, scrambling, or structure-breaking plays?
- Which opposing coverage or rush behavior attacks the quarterback's weakest response?
- Can the offense stay on schedule without asking the quarterback to repeatedly solve difficult downs?

## Required Inputs

- EPA per dropback, CPOE, success rate, yards per attempt, and explosive-pass rate.
- Clean-pocket and pressured splits, sack rate, scramble rate, and time to throw.
- Average depth of target, play-action, motion, and coverage splits.
- Turnover-worthy play or interception context with stable sample metadata.

**Current support:** Assumption-only. Swantail has no active quarterback observation adapter.

## Causal Assumptions

- Clean-pocket efficiency sets the ceiling, while pressured response often defines fragility.
- A quarterback who avoids sacks can preserve drives even when pressure arrives.
- Deep passing requires protection and receiver access; quarterback metrics cannot stand alone.
- Scrambling can convert pressure into value but may also increase hit and fumble exposure.

## Useful Signals

- EPA and success rate by pocket state.
- Pressure-to-sack rate and scramble conversion.
- First-read versus late-progression efficiency.
- Depth, middle-of-field, and coverage-shell splits.
- Early-down passing efficiency and third-down burden.

## Failure Modes

- Protection keeps the quarterback cleaner than expected.
- Receivers fail to win against coverage despite sound quarterback play.
- The run game removes difficult down-and-distance situations.
- Weather compresses the intended passing profile.
- Small-sample pressure or coverage splits overstate a real tendency.

## Suggested Anchors

Current defaults: `game_over`, `pass_heavy`.

These defaults represent a quarterback-led offensive hypothesis. Directional configuration and observed opponent data are required before suggesting a winner or spread anchor.

## Useful Pairings

Pressure, Efficiency/EPA, Trenches, Weather, and Pace.

## Example Output Shape

```json
{
  "agent_id": "qb",
  "assumption": "Quarterback efficiency is the hinge for sustained drives and explosive scoring.",
  "statement": "Quarterback play is selected as the game driver, but no sourced pocket or coverage split is attached.",
  "evidence_state": "assumption_only",
  "observations": [],
  "suggested_anchor_ids": ["game_over", "pass_heavy"]
}
```
