# Swantail Product Contract

## Definition

Swantail turns a user's game thesis into a causal Game Script. The user's selected Game Agents are the hypothesis; there is no separate hypothesis object or free-text thesis field.

The system does not adjudicate the thesis as a forecast or promise confidence. It makes the thesis legible by exposing what must happen, how the effects connect, what outcome follows, and how the story can fail. When a current snapshot exists, sourced observations may be shown as context, support, conflict, stale, or missing without changing the user's selected hypothesis.

## Objects

### Game

A canonical current-week matchup identified by `game_id`. The full regular-season schedule is stored for operational week selection and data joins, but the product exposes only the active week.

### Game Agent

A selectable causal lens such as Weather, Pressure, Pace, Injury, Efficiency, Quarterback, Backfield, Receivers, Tight Ends, or Usage.

Agent selection is the user's implicit hypothesis. Agent events always retain the selected assumption and may attach provider observations with source quality, observed time, effective time, expiry, and raw-import lineage.

### Scenario

The stable resolution of one game plus selected agents. `scenario_id` identifies that selection, while `scenario_revision_id` identifies its resolution against one immutable `snapshot_id`. A scenario contains:

- selected agent IDs;
- one causal event per selected agent;
- the complete anchor catalog;
- compatible suggested anchor IDs;
- an evidence-state label.

The same game and agents can therefore be replayed against later snapshots without mutating an earlier scenario.

### Anchor

A concrete outcome the story resolves toward. Anchors cover score, winner, cover, game shape, and offensive style. Only one anchor may be active inside each exclusive group.

### Game Script

One structured story containing a title, summary, causal chain, conditions that must remain true, failure conditions, and selected anchors. It carries its scenario revision, snapshot, contract version, model ID, and input hash. It contains no odds, betting legs, payout math, expected-value claim, or confidence guarantee.

### Bet Station

The future downstream product. It will translate a completed Game Script into available markets and correlated positions using fresh, sourced lines. It is intentionally outside the Script Builder contract.

## Terminal Behavior

The terminal is a visible state machine, not a command-line parser. Its output must correspond to real application transitions:

1. active schedule loaded;
2. matchup selected;
3. agents selected and dispatched;
4. latest stored snapshot attached and scenario events resolved;
5. anchors suggested and confirmed;
6. Game Script generated.

No terminal line may imply that live evidence was checked unless a provider observation with provenance was actually used.

## Non-Goals

- Browsing future weeks inside the terminal.
- Asking users to write or defend a hypothesis.
- Treating generated prose as validation or confidence.
- Mixing market selection, odds, and parlay construction into Game Script generation.
- Preserving compatibility routes for retired Prop, Story, Parlay, Bet, Scan, or Build modes.
