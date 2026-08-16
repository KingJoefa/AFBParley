# Pressure Agent

`agent_id: pressure`

## Purpose

Detect a pass-rush and protection collision that can shorten quarterback timing, create sacks, or make drives fragile.

## Scope Boundary

Pressure owns pass-rush arrival, protection response, and quarterback behavior after disruption. Trenches owns the broader offensive-line versus defensive-line battle, including run blocking and unit rankings.

## Core Football Questions

- Can either defense create pressure without sacrificing coverage integrity?
- Does an offensive line have a specific weakness against the opponent's rush structure?
- How does each quarterback respond when moved off the first read or platform?
- Can protection answers such as quick game, screens, movement, or extra blockers neutralize the mismatch?

## Required Inputs

- Defensive pressure, sack, blitz, and pass-rush win rates.
- Offensive pressure allowed, sack allowed, time-to-pressure, and protection usage.
- Quarterback clean-pocket and pressured EPA, completion, scramble, and sack-avoidance splits.
- Future enrichment: individual line matchups, simulated pressure, stunt rate, and chip/help tendencies.

**Current support:** Assumption-only. Swantail has no active pressure or protection observation adapter.

## Causal Assumptions

- Fast pressure reduces time for route development and lowers downfield efficiency.
- Sacks create down-and-distance problems that end drives more reliably than raw pressure alone.
- Pressure is most material when the quarterback or protection unit lacks a proven counter.
- Blitz rate is not pressure quality; the defense must create disruption without repeatedly conceding explosives.

## Useful Signals

- Defense pressure rate against offense pressure-allowed rate.
- Sack conversion relative to pressure creation.
- Quarterback EPA and sack rate under pressure.
- Early-down pressure and third-down distance creation.
- Protection changes after injuries or lineup movement.

## Failure Modes

- The offense wins with quick throws, screens, movement, or max protection.
- The defense creates pressure but loses contain or coverage behind it.
- Game state removes obvious passing situations.
- Pressure comes late enough that the quarterback still completes the intended concept.
- The assumed line matchup changes before kickoff.

## Suggested Anchors

Current defaults: `game_under`, `grind`.

Directional pressure and turnover contracts are needed before suggesting a winner, cover, or blowout anchor.

## Useful Pairings

Quarterback, Trenches, Efficiency/EPA, and Weather.

## Example Output Shape

```json
{
  "agent_id": "pressure",
  "assumption": "The pass-rush mismatch disrupts timing and drive survival.",
  "statement": "Pressure is selected as a causal lens, but no sourced protection or quarterback split is attached.",
  "evidence_state": "assumption_only",
  "observations": [],
  "suggested_anchor_ids": ["game_under", "grind"]
}
```
