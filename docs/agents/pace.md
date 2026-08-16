# Pace Agent

`agent_id: pace`

## Purpose

Determine which team can control snap tempo, play volume, and possession rhythm, then explain what each offense gains or loses at that pace.

## Scope Boundary

Pace owns how many plays and possessions the game can create or remove. It does not infer scoring direction from speed alone; Efficiency/EPA and the position agents determine what either offense can do with that volume.

## Core Football Questions

- Which team plays faster in situation-neutral settings?
- Is tempo a stable identity or a product of score and opponent?
- Can the faster team force pace, or can the slower team shorten possessions through rushing and clock control?
- Which offense is more dependent on volume to create scoring chances?

## Required Inputs

- Situation-neutral seconds per snap and no-huddle rate.
- Plays per game adjusted for overtime and game state.
- Early-down pass rate, drive length, and possession count.
- Opponent-adjusted pace effect and recent role or coordinator changes.

**Current support:** Assumption-only. Schedule data supplies kickoff context but not play-by-play pace observations.

## Causal Assumptions

- Faster neutral tempo creates more plays and more opportunities for efficiency or usage to compound.
- Successful rushing and sustained drives can suppress the opponent's play volume without a team literally snapping slowly.
- Incompletions and clock stoppages can increase possession count; raw seconds per snap is not enough by itself.
- Pace matters through the offenses using the additional or removed plays.

## Useful Signals

- Situation-neutral seconds per snap.
- No-huddle and first-half pace.
- Plays per drive and drives per game.
- Neutral pass rate and incompletion rate.
- Opponent pace effect after controlling for score.

## Failure Modes

- Early scoring changes both teams' neutral tendencies.
- Long drives reduce possessions despite fast snap tempo.
- Turnovers or defensive scores distort expected play volume.
- A coordinator, quarterback, or offensive-line change invalidates season averages.
- Both teams have similar pace profiles and no real collision exists.

## Suggested Anchors

Current defaults: `game_over`, `shootout`.

These defaults represent a faster-volume hypothesis. A future directional pace contract should also support deliberate compression and grind scenarios.

## Useful Pairings

Efficiency/EPA, Quarterback, Trenches, and Turnovers.

## Example Output Shape

```json
{
  "agent_id": "pace",
  "assumption": "A faster possession cycle increases play volume and scoring paths.",
  "statement": "Pace is selected as a causal lens, but no sourced neutral-tempo observation is attached.",
  "evidence_state": "assumption_only",
  "observations": [],
  "suggested_anchor_ids": ["game_over", "shootout"]
}
```
