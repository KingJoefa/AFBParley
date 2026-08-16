# Volatility Agent

`derived_script_property: high_variance`
`legacy_game_agent_id: volatility`

**Status:** Internal Game Script synthesis reference. Volatility is derived from resolved mechanisms and is not a selectable Game Script v5 agent.

## Purpose

Identify the mechanisms that widen the range of plausible game scripts, including explosive dependence, turnover exposure, unstable conversion, and concentrated high-leverage usage.

## Scope Boundary

Volatility owns outcome range, not a team advantage or automatic scoring direction. It synthesizes variance mechanisms without replacing the more specific Turnovers, Efficiency/EPA, or Usage findings that establish them.

## Core Football Questions

- Does either offense rely on explosives rather than steady success?
- Are turnovers, fourth downs, or red-zone outcomes likely to swing possession value?
- Is production concentrated in a small number of players or low-frequency plays?
- Which stable mechanisms pull the game back toward its median outcome?

## Required Inputs

- Explosive pass and rush rates alongside success rate.
- Turnover-worthy plays, fumbles, and takeaway opportunities.
- Third- and fourth-down conversion, red-zone touchdown rate, and finishing drives.
- Distribution of play-level EPA rather than average EPA alone.

**Current support:** Assumption-only. The current EPA pilot supplies averages but not play-level distribution or conversion volatility.

## Causal Assumptions

- High average efficiency can still be fragile when it depends on a few explosive plays.
- Turnovers and short fields create branching game states rather than one directional expectation.
- Concentrated usage can increase both upside and failure risk.
- Volatility describes outcome range, not automatically high scoring.

## Useful Signals

- Explosive rate paired with below-average success rate.
- Large gap between mean and median play value.
- Unstable third-down, fourth-down, or red-zone conversion.
- Turnover opportunity rates and fumble recovery dependence.
- Heavy dependence on one player or one route family.

## Failure Modes

- Both teams sustain ordinary success and avoid high-leverage swings.
- The defense prevents explosives without conceding efficient underneath play.
- Conversion rates regress toward stable baselines.
- Game state becomes predictable enough to narrow the playbook.
- A supposedly volatile profile is only a small-sample artifact.

## Suggested Anchors

Current default: `high_variance`.

## Useful Pairings

Turnovers, Quarterback, Receivers, Usage, and Momentum.

## Example Output Shape

```json
{
  "agent_id": "volatility",
  "assumption": "Explosives, turnovers, and unstable conversion widen the range of outcomes.",
  "statement": "Volatility is selected as a causal lens, but no sourced play-distribution observation is attached.",
  "evidence_state": "assumption_only",
  "observations": [],
  "suggested_anchor_ids": ["high_variance"]
}
```
