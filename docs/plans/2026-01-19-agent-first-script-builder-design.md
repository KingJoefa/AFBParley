Title: Swantail Terminal — Agent-First Script Builder
Date: 2026-01-19
Owner: Design
Status: Locked

## North Star
Swantail is a terminal-first tool for discovering game insights, forming a clear game script, and generating a story-driven betting output. Agents surface evidence. Anchors express the user’s thesis. Build Script commits the thesis + evidence into a single coherent payload.

## Core Mental Model
- Agents inform the story; they never define it.
- User agency lives in anchor selection, not agent automation.

## Execution Flow (Locked)
Top-to-bottom, visually nudged but not forced:
1) Matchup selection
2) Agent selection (scope only, session-persistent)
3) Scan
   - Runs selected agents
   - Logs insights to the terminal
   - Feeds structured evidence into payload
4) Anchors (user thesis)
5) Script Bias (how the game plays out)
6) Build Script (only committing action)

Build Script is disabled unless:
- At least one agent scan has run
- At least one anchor is selected
- Scan hash matches current flags + selected agents

## Agent Taxonomy (Locked)
Prop Discovery Agents (player-level opportunities):
- QB
- HB
- WR
- TE

Game Angle Agents (structural game evidence):
- EPA
- Pressure
- Weather
- Pace (planned)
- Injuries (planned)

Agents:
- Log insights to the terminal
- Feed evidence into the payload
- May suggest implications, but never auto-select anchors or bias

## Anchors (Primary Thesis Inputs)
Anchors represent betting primitives and are required before Build:
- Totals: Over / Under (mutually exclusive)
- Side: Home win / Away win (mutually exclusive)
- Spread: Home cover / Away cover (mutually exclusive)

Rules:
- Mutually exclusive pairs are hard-disabled
- Multiple compatible anchors may be selected (e.g., Away win + Under)
- Anchors are always visible but may be visually collapsed until scan completes

## Script Bias (Secondary Thesis Modifiers)
Script bias defines how the game unfolds, not the market outcome.

MVP options:
- Shootout
- Grind
- Pass-heavy
- Run-heavy

Characteristics:
- Multi-select allowed (with sensible internal logic)
- Visually secondary to anchors
- Included directly in the payload

## Agent → Anchor Interaction (Key Principle)
When an agent finds something strong:
- It logs clearly in the terminal
- It may suggest implications (e.g., “Weather + Pace → grind / under”)
- The user decides whether to reflect that via anchors or script bias

No auto-normalization or auto-selection.

## UI Layout Requirements
Execution context sits above the terminal output, in this visual order:
1) Matchup
2) Agent Rail (grouped: Props | Angles)
3) Scan button
4) Anchors
5) Script Bias
6) Build Script

## Visual Treatment
- Agent rail is thin and terminal-native
- Persistent toggles (session-scoped)
- Visual states: idle, running, found, silent, error
- Scan logs `[scan] agents: EPA, QB, WR`
- Build Script is the only high-energy CTA

## Output Philosophy
One unified flow.

The output is a story-driven script that may include:
- Parlays
- Player props
- Or both

There is no separate “Prop mode” at MVP. Output depends on:
- Selected anchors
- Script bias
- Which agents found relevant evidence

## Non-Goals
- Auto-selecting anchors
- Auto-deriving script bias
- Multiple parallel modes
- Optimizing for “quick picks” over narrative coherence

## Success Criteria
- First-time users understand agents in under 10 seconds
- Anchors are clearly the thesis mechanism
- Build Script feels deliberate and informed
- Users trust that output reflects evidence + intent
