# Injuries Agent

`agent_id: injury`

## Purpose

Identify availability changes that materially alter a team's role distribution, scheme options, protection, coverage, or efficiency.

## Scope Boundary

Injuries owns confirmed availability, functional role loss, and replacement consequences. It does not make a medical prognosis or treat a designation as proof of reduced performance without participation and role evidence.

## Core Football Questions

- Is the player expected to be active, limited, or absent?
- What role disappears or changes if the player is limited?
- Is the replacement capable of preserving the same scheme?
- Which teammates inherit snaps, routes, touches, targets, protection, or coverage responsibility?
- Does the absence affect offense, defense, or both sides of the matchup story?

## Required Inputs

- Official practice and game-status reports with timestamps.
- Position, team, active status, and injury designation.
- Future licensed enrichment: depth chart, expected participation, replacement player, snap history, and on/off efficiency.

**Current support:** Pilot nflverse report observations after ingestion is configured. The current feed can establish report status, but not replacement quality or expected workload.

## Causal Assumptions

- Availability matters through lost function, not name recognition alone.
- A concentrated role creates more redistribution than a rotational role.
- Offensive-line and secondary absences can change several agents at once.
- Questionable status is context, not proof of limitation or absence.

## Useful Signals

- `out`, `doubtful`, and `questionable` game designations.
- Practice participation trend and late-week downgrade.
- Prior snap, route, touch, target, protection, or coverage share.
- Replacement experience and role compatibility.
- Clustered injuries at one position group.

## Failure Modes

- The player is active without a meaningful limitation.
- The replacement preserves the role more effectively than assumed.
- Scheme changes distribute the missing role across several players.
- The report is stale, ambiguous, or not an official game designation.
- The selected anchors assume offensive suppression while the material absence is defensive.

## Suggested Anchors

Current defaults: `game_under`, `grind`.

These defaults are intentionally narrow and represent offensive-availability suppression. Directional subject selection is required before injuries can safely imply higher scoring, passing concentration, rushing concentration, or a team-specific outcome.

## Useful Pairings

Quarterback, Pressure, Trenches, Efficiency/EPA, and Rest/Travel.

## Example Output Shape

```json
{
  "agent_id": "injury",
  "assumption": "A material absence redistributes responsibility and reduces execution margin.",
  "statement": "Two current material availability reports are attached; the downstream role change still requires depth and usage context.",
  "evidence_state": "observed_support",
  "observations": ["player.injury_status"],
  "suggested_anchor_ids": ["game_under", "grind"]
}
```
