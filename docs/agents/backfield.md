# Backfield Agent

`bet_station_position_id: rb`
`legacy_game_agent_id: hb`

**Status:** Bet Station research reference. This is not a selectable Game Script v5 agent.

## Purpose

Determine whether a backfield can create efficient, repeatable control through rushing, receiving, and down-and-distance management.

## Scope Boundary

Backfield owns runner efficiency, role versatility, and what the backs create within the matchup. Trenches owns the blocking environment, while Usage owns how carries, routes, and high-value touches are allocated.

## Core Football Questions

- Can the offense generate successful runs rather than merely accumulate carries?
- Does the opposing front create penetration, force negative plays, or invite efficient boxes?
- Is the backfield concentrated or committee-based?
- Can receiving and pass protection keep the backfield involved when the offense falls behind?

## Required Inputs

- Team and player rushing EPA, success rate, explosive rate, and stuff rate.
- Yards after contact, missed tackles forced, and designed versus scramble separation.
- Box count, run concept, offensive-line and defensive-front measures.
- Snap, carry, route, target, short-yardage, and red-zone shares.

**Current support:** Assumption-only. Swantail has no active rushing, line, front, or player-usage adapter.

## Causal Assumptions

- Efficient early-down rushing can preserve the playbook and shorten the opponent's opportunity count.
- Carry volume without success does not establish control.
- Receiving and protection roles determine whether a back stays on the field across game states.
- Front and blocking interaction matters more than a running back's raw yardage average.

## Useful Signals

- Rushing success and EPA by box count and concept.
- Stuff rate and yards before versus after contact.
- Short-yardage and red-zone role.
- Two-minute and third-down snaps.
- Role change after an injury or depth-chart move.

## Failure Modes

- The offense falls behind and abandons the run.
- The defensive front wins before the runner reaches the designed point of attack.
- A committee splits the assumed volume.
- The quarterback keeps or scrambles on designed run looks.
- Raw rushing volume masks low efficiency and repeated long-yardage situations.

## Suggested Anchors

Current defaults: `run_heavy`, `grind`.

## Useful Pairings

Pace, Usage, Injuries, Pressure, and Efficiency/EPA.

## Example Output Shape

```json
{
  "agent_id": "hb",
  "assumption": "Backfield volume and rushing success make control central to the result.",
  "statement": "The backfield-control hypothesis is selected, but no sourced rushing or front observation is attached.",
  "evidence_state": "assumption_only",
  "observations": [],
  "suggested_anchor_ids": ["run_heavy", "grind"]
}
```
