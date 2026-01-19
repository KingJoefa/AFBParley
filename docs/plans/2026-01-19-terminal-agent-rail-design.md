Title: Swantail Terminal Agent Rail + Inline Flags
Date: 2026-01-19
Owner: Design
Status: Locked

## Summary
This spec updates the Swantail Terminal UI to reinforce the two-phase flow:
Scan -> Agents -> Build. It replaces legacy dropdowns with inline terminal-style
flags and adds a compact agent rail beneath primary actions. The result is a
terminal-first, fast-feedback experience that keeps power-user controls visible
but subordinate to the execution loop.

## Goals
- Reinforce terminal-first, fast-feedback interaction.
- Make agent activity feel clickable, alive, and intentional.
- Replace legacy UI elements that break the terminal aesthetic.
- Increase clarity of "what just happened" when agents run.

## Non-Goals
- Backend wiring, persistence, or agent orchestration changes.
- Changes to output payload contracts.
- New modes or new agent types.

## Layout
Primary action row:
- Scan and Build on the left (Build is the highest-energy control).
- Mode pills (PROP / STORY / PARLAY) stay visually quieter than Build, acting as
  output context, not actions.

Agent rail row (new, directly below primary actions):
- Low-height rail (20-22px chip height).
- Left-aligned label "AGENTS" in low-contrast uppercase.
- Chips in a tight cluster with snap scrolling on desktop; wrap to two lines on
  mobile with fixed chip height.
- Spatial order stays fixed for muscle memory (no reordering).

Inline flags row (restyled legacy inputs, directly below agent rail):
- Single-line CLI-style fields with monospace text.
- Ghost text shows default values as flags (e.g., --matchup, --anchor).
- No heavy borders; use subtle underlines or faint capsules.
- Commit on Enter or blur; show a tiny status tick at the right edge:
  idle dot, accepted check, or invalid bang.

## Agent Chips: States + Affordances
Idle:
- Low-contrast slate border, near-black fill, dim mono label.

Running:
- Cyan border + faint cyan wash.
- Single sweep scan animation (no pulsing).
- 2-character spinner glyph at right (e.g., "··" -> "::").

Found (hit):
- Restrained emerald/teal border + wash.
- Right-side mono badge with delta (e.g., "+0.7σ" or "+3.2%").

Silent (no hit):
- Idle styling plus faint negative delta (e.g., "-0.2σ").

Error:
- Subdued red border + "!" glyph.

Hover microdetails (inline terminal tooltip, not a modal):
- "Δ +0.7σ • LIVE" or "Δ -0.2σ • 2m"
- Shows delta vs threshold + data freshness.

Click behavior:
- Trigger agent run.
- Immediate log echo (e.g., "[EPA] scanning…").
- On completion, log echo includes delta + freshness (e.g.,
  "[EPA] hit +0.7σ • LIVE").

Inclusion in Build:
- Default to included after first successful run.
- Inclusion indicated by a tiny dot (filled when included).
- Exclusion is explicit and reversible.

## Inline Flags (Legacy UI Restyle)
Replace "Set" and "Apply" buttons with inline commit on Enter/blur and
status ticks. Inputs read as CLI parameters, not form fields:

Example line:
--matchup [SF @ SEA] --anchor [O44.5 SEA -2.5] --signals [pace skew, pressure] --odds [RB1 TD +120...]

## Palette Mapping (Lock)
Use existing terminal palette; avoid increased saturation.

Semantic -> color mapping:
- Idle: slate/neutral (existing muted terminal color).
- Running: cyan range.
- Found: emerald/teal range.
- Error: red range.
- Text: mono with white at 55-80% opacity.

## Accessibility + Behavior
- Chips are keyboard focusable; pressed state uses a 1px inset highlight.
- Chips remain a single tap target on mobile; wrap to max two lines.
- Log echoes serve as immediate feedback for actionability.

## Open Questions (Resolved)
- Default inclusion after first hit: Yes.
- Rail order: fixed.
- Log echo detail: include delta + freshness on completion.

## Success Criteria
- Agents feel actionable and integrated into the terminal flow.
- Inputs feel like parameters rather than legacy form fields.
- Users can tell what changed from the log echo + chip state.

## Next Steps
- Add data-backed auto-fill for `--signals` and `--odds` when a matchup is selected (blank if no data source).
