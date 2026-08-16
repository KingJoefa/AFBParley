# Efficiency/EPA Agent

`agent_id: epa`

## Purpose

Detect a repeatable efficiency mismatch that can compound across ordinary possessions rather than depending on a rare event.

## Scope Boundary

Efficiency/EPA owns the broad offense-versus-defense cross-match after opponent and game-state adjustment. It identifies where quality compounds, while Quarterback, Pressure, Trenches, and the position agents explain the specific mechanism.

## Core Football Questions

- Which offense creates more expected value per play and with what level of consistency?
- Is the gap driven by passing, rushing, explosives, success rate, or finishing drives?
- Does the opposing defense specifically suppress that strength?
- Is the sample current, opponent-adjusted, and stable across game states?

## Required Inputs

- Offensive and defensive EPA per play.
- Success rate, explosive-play rate, early-down efficiency, and finishing-drives measures.
- Opponent and schedule adjustment, sample games, and through-week metadata.
- Splits by pass/rush and neutral/trailing/leading state.

**Current support:** Pilot nflverse offensive EPA per play and league rank after ingestion is configured. Week 1 uses the prior regular season; later weeks use completed current-season weeks. Defensive and opponent-adjusted inputs are not yet attached.

## Causal Assumptions

- A broad efficiency advantage is more repeatable when it appears in success rate as well as explosives.
- Efficiency compounds more strongly when Pace creates additional plays.
- Offensive EPA alone cannot establish how the matchup behaves against the specific opposing defense.
- A prior-season Week 1 baseline is context, not proof that the current roster retains the same quality.

## Useful Signals

- Offensive EPA per play and league rank gap.
- Pass and rush EPA decomposition.
- Early-down success rate and third-down distance.
- Explosive rate versus steady success rate.
- Red-zone and finishing-drive conversion.
- Opponent-adjusted rolling windows.

## Failure Modes

- Turnovers or defensive scores dominate a small number of possessions.
- The apparent gap is driven by opponent quality or garbage time.
- Personnel or coordinator changes make the sample non-comparable.
- One team wins a specific pressure, coverage, or trench matchup that aggregate EPA misses.
- The current adapter supplies only offense, leaving the defensive cross-match unresolved.

## Suggested Anchors

Current default: `blowout`.

The current non-directional contract does not identify which team owns the efficiency advantage, so winner and spread anchors remain user-confirmed rather than agent-suggested.

## Useful Pairings

Pace, Pressure, Quarterback, and Trenches.

## Example Output Shape

```json
{
  "agent_id": "epa",
  "assumption": "The stronger efficiency profile compounds across possessions.",
  "statement": "The attached offensive EPA ranks show a material gap, but the defensive cross-match is not yet sourced.",
  "evidence_state": "observed_support",
  "observations": ["team.offensive_epa_per_play"],
  "suggested_anchor_ids": ["blowout"]
}
```
