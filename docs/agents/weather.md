# Weather Agent

`agent_id: weather`

## Purpose

Determine whether kickoff conditions materially narrow the available playbook or change execution risk. Weather is a game-level mechanism, not a generic reason to expect fewer points.

## Scope Boundary

Weather owns the environmental constraint at kickoff and each team's exposure to it. It does not assume bad weather means an under, or evaluate overall offensive quality without another agent supplying that mechanism.

## Core Football Questions

- Is the venue open, enclosed, retractable, or operationally uncertain?
- Are wind, precipitation, temperature, or field conditions severe enough to alter passing depth, kicking, handling, or play selection?
- Which offense is more exposed to the affected phase?
- Do the conditions persist through the likely game window?

## Required Inputs

- Venue coordinates, roof state, kickoff time, and timezone.
- Hourly temperature, sustained wind, precipitation probability, and forecast summary.
- Future licensed enrichment: gusts, wind direction, field surface, roof decision, and offense-specific depth or kicking profiles.

**Current support:** Pilot NWS observations after ingestion is configured. An enclosed venue can produce observed conflict. Without a current snapshot, this agent is assumption-only.

## Causal Assumptions

- Material wind can compress passing depth and increase the value of short throws and rushing attempts.
- Heavy precipitation can increase handling risk and make lower-variance calls more attractive.
- Conditions matter through a team's exposure to them; mild weather alone does not create a game script.
- An enclosed venue conflicts with an exterior weather-suppression hypothesis.

## Useful Signals

- Sustained wind at or above the current 15 mph support threshold.
- Precipitation probability at or above the current 40 percent support threshold.
- Forecast changes between snapshots.
- Roof state and forecast validity at kickoff.

## Failure Modes

- The forecast changes or the roof closes.
- Wind direction or stadium shielding makes the headline wind less relevant.
- Both offenses already rely on short-area passing and rushing.
- Turnovers, defensive scores, or early deficits force aggressive game states.
- The observation is stale or outside the reliable forecast horizon.

## Suggested Anchors

Current defaults: `game_under`, `grind`, `run_heavy`.

These describe a weather-suppression hypothesis. Directional configuration is required before weather can safely suggest an aggressive passing or scoring anchor.

## Useful Pairings

Quarterback, Pace, Injuries, and Efficiency/EPA.

## Example Output Shape

```json
{
  "agent_id": "weather",
  "assumption": "Kickoff conditions suppress clean execution and downfield play.",
  "statement": "The sourced kickoff forecast supports a wind-driven compression of the passing game.",
  "evidence_state": "observed_support",
  "observations": ["weather.kickoff_forecast"],
  "suggested_anchor_ids": ["game_under", "grind", "run_heavy"]
}
```
