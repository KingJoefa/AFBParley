# Swantail Product Contract

## Definition

Swantail turns a user's game thesis into a causal Game Script. The user's selected Game Agents are the hypothesis; there is no separate hypothesis object or free-text thesis field.

The system does not adjudicate the thesis as a forecast or promise confidence. It makes the thesis legible by exposing what must happen, how the effects connect, what outcome follows, and how the story can fail. When a current snapshot exists, sourced observations may be shown as context, support, conflict, stale, or missing without changing the user's selected hypothesis.

## Objects

### Game

A canonical current-week matchup identified by `game_id`. The full regular-season schedule is stored for operational week selection and data joins, but the product exposes only the active week.

### Game Agent

A selectable game-level causal lens: Weather, Momentum, Pace, Injuries, Efficiency, Pressure, Trenches, Turnovers, Quarterback, or Rest/Travel.

Agent selection is the user's implicit hypothesis. Agent events always retain the selected assumption and may attach provider observations with source quality, observed time, effective time, expiry, and raw-import lineage.

Each resolved event contains an Agent Finding with one of four materiality states: `material`, `contextual`, `balanced`, or `unavailable`. The finding states the matchup mechanism, any directional team path, up to four decisive signals, and explicit caveats. Materiality describes whether the lens separates this matchup; it is not a confidence score or prediction probability.

Each selectable agent owns one specialist question and one explicit football scope. Its purpose, required inputs, assumptions, signals, failure modes, anchor behavior, and pairings are defined in `docs/agents/`. These specifications guide scenario and script behavior without changing the distinction between a selected hypothesis and sourced evidence.

Player positions are not Game Agents. Quarterback remains selectable because quarterback response can determine the entire game shape. Running Back, Wide Receiver, and Tight End are reserved as downstream Bet Station market families. Usage is an internal allocation input, and Volatility is a derived script property supported by mechanisms such as explosives, turnover exposure, and unstable conversion.

### Scenario

The stable resolution of one game plus selected agents. `scenario_id` identifies that selection, while `scenario_revision_id` identifies its resolution against one immutable `snapshot_id`. A scenario contains:

- selected agent IDs;
- one causal event per selected agent;
- one matchup-specific Agent Finding per event;
- the complete anchor catalog;
- compatible suggested anchor IDs;
- an evidence-state label.

The same game and agents can therefore be replayed against later snapshots without mutating an earlier scenario.

### Anchor

A concrete outcome the story resolves toward. Anchors cover score, winner, cover, game shape, and offensive style. Only one anchor may be active inside each exclusive group.

### Game Script

One structured story containing a title, summary, causal chain, conditions that must remain true, failure conditions, and selected anchors. It carries its scenario revision, snapshot, contract version, model ID, and input hash. It contains no odds, betting legs, payout math, expected-value claim, or confidence guarantee.

### Bet Station

The future downstream product. It will receive a versioned handoff from a completed Game Script and translate that story into available markets using fresh, sourced lines. Quarterback, Running Back, Wide Receiver, and Tight End are market filters here rather than Game Agents; role and Usage data determine which players can capture the story. Bet Station is intentionally outside the Script Builder contract.

## Terminal Behavior

The terminal is a visible state machine, not a command-line parser. Its output must correspond to real application transitions:

1. active schedule loaded;
2. matchup selected;
3. agents selected and dispatched;
4. latest stored snapshot attached, schedule-derived context added where applicable, and Agent Findings resolved;
5. anchors suggested and confirmed;
6. Game Script generated.

No terminal line may imply that live evidence was checked unless a provider observation with provenance was actually used.

Agents do not vote or produce confidence scores. A balanced or unavailable finding is a valid result and must not be forced into an outcome anchor. Game Script generation is the synthesis layer: it connects compatible agent mechanisms, retains contradictions, and states the conditions and failure modes of the combined story.

## Non-Goals

- Browsing future weeks inside the terminal.
- Asking users to write or defend a hypothesis.
- Treating generated prose as validation or confidence.
- Mixing market selection, odds, and parlay construction into Game Script generation.
- Preserving compatibility routes for retired Prop, Story, Parlay, Bet, Scan, or Build modes.
