# Trenches Agent

`agent_id: trenches`

## Purpose

Compare each offensive line directly with the opposing defensive line to detect rankings-based advantages in rushing lanes, protection, pressure, and disruption.

## Scope Boundary

Trenches owns unit-level offensive-line versus defensive-line rankings across both run and pass phases. Pressure owns what pass-rush arrival does to the quarterback, while rushing splits inside Efficiency establish whether blocking control becomes successful offense.

## Core Football Questions

- How does each offensive line's run-blocking and pass-protection profile rank against the opposing defensive line?
- Where does the offensive-line versus defensive-line battle create the clearest matchup edge?
- Which offense can create movement or prevent penetration on early downs?
- Which defensive line can generate pressure without surrendering rushing lanes or quarterback escape paths?
- Are injuries or lineup changes creating a weak link?
- Can either offense counter front strength with movement, quick game, screens, or formation changes?

## Required Inputs

- Run-block and pass-block win rates, pressure allowed, and time to pressure.
- Defensive pressure, stuff, tackle-for-loss, and run-stop rates.
- Rushing success, yards before contact, box count, and concept splits.
- Starting line combinations, front personnel, and injury status.

**Current support:** A pilot nflverse result-based proxy is active after ingestion. It cross-matches sack rate allowed and rushing EPA with defensive sacks/QB hits and tackles for loss. It is not an assignment-level line grade and must remain labeled as a proxy until licensed charting is attached.

## Causal Assumptions

- Front control keeps an offense in favorable down-and-distance and preserves the full playbook.
- Penetration can suppress rushing efficiency even when raw carry volume remains high.
- Protection quality determines whether deeper passing concepts have time to develop.
- One weak line position can matter more than an aggregate unit grade against a targeted front.

## Useful Signals

- Pressure and sack rate allowed by line combination.
- Run success and stuff rate by concept and box count.
- Yards before contact and short-yardage conversion.
- Defensive pressure without blitzing.
- Interior versus edge mismatch and recent lineup continuity.

## Failure Modes

- Quick passing and movement neutralize the front mismatch.
- Game state removes rushing volume or obvious passing downs.
- Scheme creates favorable numbers despite a personnel disadvantage.
- The expected starting line or front changes before kickoff.
- Aggregate grades hide a matchup-specific strength elsewhere.

## Suggested Anchors

A material proxy finding suggests a team winner anchor and either `run_heavy` or `pass_heavy`, depending on whether the larger separation comes from the run or protection cross-match. Balanced and unavailable profiles suggest no anchor.

## Useful Pairings

Pressure, Quarterback, Pace, Efficiency/EPA, and Injuries.

## Example Output Shape

```json
{
  "agent_id": "trenches",
  "assumption": "Line-of-scrimmage control keeps one offense on schedule and disrupts the other.",
  "finding": {
    "state": "material",
    "direction": "home",
    "headline": "The home team has the clearer trench-control path",
    "signals": [
      { "label": "Pass protection rank", "away_value": "#25 of 32", "home_value": "#8 of 32" }
    ]
  },
  "evidence_state": "observed_support",
  "suggested_anchor_ids": ["home_win", "run_heavy"]
}
```
