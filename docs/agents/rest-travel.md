# Rest / Travel Agent

`agent_id: rest`

## Purpose

Detect whether turnaround, travel, time-zone change, or accumulated workload creates a preparation or fatigue asymmetry relevant to execution.

## Scope Boundary

Rest/Travel owns the schedule modifier, not a standalone team-quality edge. A material finding must connect recovery or preparation time to a specific personnel, unit, or scheme mechanism and remain secondary when the football mismatch is larger.

## Core Football Questions

- How many days separate each team's games?
- Is either team on a short week, after overtime, or returning from extended travel?
- Does travel cross time zones or materially alter routine?
- Did recent snap concentration place unusual load on key units?
- Is extra rest likely to improve preparation, or does a personnel change limit that benefit?

## Required Inputs

- Previous game end time, current kickoff, venue, and travel distance.
- Time-zone change, short-week, bye, overtime, and international-game flags.
- Recent offensive and defensive snap counts by player and unit.
- Injury and participation context during the turnaround.

**Current support:** Internal schedule-derived observations are active. They cover regular-season turnaround, short/standard/extended schedule spot, current-site travel distance, and consecutive road games. Week 1 intentionally reports no prior regular-season turnaround. Overtime and player snap load remain future inputs.

## Causal Assumptions

- Short preparation can reduce installation and recovery time, especially after high snap volume.
- Travel effects depend on direction, distance, timing, and routine rather than miles alone.
- Extra rest matters most when it enables a real preparation or health advantage.
- Rest should modify a matchup mechanism, not replace football-quality analysis.

## Useful Signals

- Thursday turnaround, Monday-to-Sunday compression, or post-overtime week.
- Bye-week or mini-bye preparation advantage.
- Cross-country or international travel.
- Concentrated recent snaps at offensive line, defensive line, or secondary.
- Repeated road games and late return times.

## Failure Modes

- Both teams have equivalent turnaround and travel.
- Rotation depth absorbs recent workload.
- Extra rest produces no relevant scheme or health change.
- The matchup quality gap overwhelms a modest schedule effect.
- Narrative claims exceed the available schedule and participation evidence.

## Suggested Anchors

A material rest differential can suggest the winner anchor for the team with the cleaner recovery window. Contextual, balanced, and Week 1 findings do not force an outcome anchor.

## Useful Pairings

Momentum, Injuries, Trenches, Pace, and Efficiency/EPA.

## Example Output Shape

```json
{
  "agent_id": "rest",
  "assumption": "Turnaround and travel create a preparation or fatigue asymmetry.",
  "finding": {
    "state": "material",
    "direction": "home",
    "headline": "NE has the stronger rest profile",
    "signals": [
      { "label": "Turnaround", "away_value": "7 days", "home_value": "10.7 days" }
    ]
  },
  "evidence_state": "observed_support",
  "suggested_anchor_ids": ["home_win"]
}
```
