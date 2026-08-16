# Swantail Football Agent Blueprint

## Purpose

Swantail Game Agents are specialist causal lenses. A user selects the parts of a matchup they believe matter, each selected agent resolves one bounded football question, and Game Script generation combines those resolved events into one conditional story.

This design borrows the strongest structural ideas from the CBB Agent Pack:

- one specialist question per agent;
- explicit scope boundaries;
- declared inputs and missing-data behavior;
- cross-matching one team's strength against the opponent's vulnerability;
- a causal story rather than a list of statistics;
- failure conditions that can break the story;
- useful pairings between specialists;
- synthesis only after the specialist outputs exist.

Swantail does not inherit CBB edge ratings, picks, market verdicts, or confidence gates. Its synthesis object is the Game Script, and its output remains conditional rather than predictive.

## Agent Contract

Every agent specification answers the same questions:

1. What football mechanism does this agent own?
2. What matchup questions should it ask?
3. What inputs are required for an observed conclusion?
4. What assumptions can it express without observations?
5. Which sourced signals support, contextualize, or conflict with the assumption?
6. What can make the causal story fail?
7. Which existing scenario anchors can the agent suggest?
8. Which other agents help complete or challenge the story?

The runtime distinction is mandatory:

- `assumption_only`: the user selected a lens, but no supporting source observation was attached;
- `observed_context`: sourced facts are relevant but not directional enough to support the assumption;
- `observed_support`: sourced facts meet the agent's declared support logic;
- `observed_conflict`: sourced facts cut against the selected assumption;
- `stale` or `missing`: the observation layer cannot support a current claim.

An agent never upgrades its own hypothesis into truth. Observations can support, conflict with, or add context to the hypothesis.

## Resolution Standard

The CBB pack's strongest operating pattern becomes the following football-native standard for every Swantail agent:

1. **Cross-match:** Compare one team's relevant strength or exposure with the opponent mechanism that can enable or punish it. Two isolated team rankings are context, not yet a matchup finding.
2. **Sufficiency:** Name the required inputs and preserve whether each input is sourced, stale, missing, or assumption-only.
3. **Materiality:** Resolve as balanced or unavailable when the profiles are similar, the data is incomplete, or the mechanism is unlikely to affect this game. Never force a story because an agent was selected.
4. **Causal chain:** Express the contribution as: if the observed matchup condition holds, then a football mechanism changes, which creates a specific game-script consequence.
5. **Counter-case:** Name the most credible scheme, personnel, game-state, or sample-quality reason the mechanism could fail.
6. **Scope:** Stay inside the specialist boundary. Pair agents to complete a story instead of allowing one agent to make unsupported claims about another domain.

This replaces CBB edge ratings and confidence caps with Swantail's evidence states, structured findings, and explicit caveats.

## Football-Native Catalog

| Agent | Specialist question | Current data support | Primary pairings |
| --- | --- | --- | --- |
| Weather | Do conditions remove or weaken either team's preferred approach? | Pilot NWS observations after ingestion is configured | Quarterback, Pace, Injuries |
| Momentum | Has opponent-adjusted execution changed enough to persist? | Assumption only | Efficiency, Injuries, Quarterback |
| Pace | Which offense controls play volume, clock pressure, and possessions? | Assumption only | Efficiency, Quarterback, Trenches |
| Injuries | Which unavailable function cannot be preserved by the replacement or scheme? | Pilot nflverse observations after ingestion is configured | Quarterback, Pressure, Trenches |
| Efficiency/EPA | Where does offensive efficiency collide with defensive suppression? | Pilot offensive EPA observations after ingestion is configured | Pace, Pressure, Quarterback |
| Pressure | Can the pass rush arrive before the offense reaches its answers? | Assumption only | Quarterback, Trenches, Efficiency |
| Trenches | Where does each offensive line win or lose against the opposing defensive line? | Pilot result-based nflverse proxy after ingestion | Pressure, Efficiency, Quarterback |
| Turnovers | Does ball risk collide with repeatable takeaway creation? | Pilot nflverse team profiles after ingestion | Pressure, Quarterback, Momentum |
| Quarterback | Which quarterback can solve the matchup's coverage and pressure environment? | Assumption only | Pressure, Efficiency, Weather |
| Rest/Travel | Does schedule context modify a specific football matchup? | Internal schedule-derived observations available immediately | Momentum, Injuries, Trenches |

`pilot_observations` means the adapter and observation contract exist. It does not mean production ingestion is configured or that a current observation is available. Runtime `evidence_state` remains authoritative.

## Recommended Product Priority

This stack rank reflects causal leverage, repeatability, distinctiveness, realistic data support, and usefulness across an NFL week. It is a product and data-investment priority, not a confidence score or a claim that the top-ranked agent must be selected for every game.

| Rank | Agent | Why it belongs here | Current readiness |
| ---: | --- | --- | --- |
| 1 | Efficiency/EPA | Establishes the most repeatable team-quality cross-match and the baseline every narrower story must explain. | Partial pilot; add defensive and opponent-adjusted splits |
| 2 | Quarterback | The quarterback's response to coverage, pressure, and difficult downs is the largest individual driver of offensive shape. | Assumption only; high-value licensed-data target |
| 3 | Injuries | A material absence can invalidate every baseline by changing roles, protection, coverage, or play calling. | Partial pilot; add depth chart, participation, and replacement quality |
| 4 | Trenches | OL-versus-DL control affects both rushing efficiency and whether the passing game can function on schedule. | Result-based proxy; licensed unit grades remain valuable |
| 5 | Pressure | A specific rush-protection-quarterback collision creates one of football's clearest drive-killing mechanisms. | Assumption only; pressure and protection charting required |
| 6 | Pace | Play and possession volume determines how often efficiency and game-state mechanisms can compound. | Assumption only; play-by-play derivation is attainable |
| 7 | Turnovers | Ball-risk cross-matches can swing possessions and field position, but process must be separated from recovery luck. | Partial pilot; add turnover-worthy plays and field-position value |
| 8 | Weather | Highly causal when thresholds are crossed and largely irrelevant when they are not, making the no-finding state essential. | Strongest current external feed; team exposure still needed |
| 9 | Rest/Travel | A real preparation and recovery modifier that should strengthen another football mechanism rather than lead the story alone. | Schedule observations active; workload enrichment pending |
| 10 | Momentum | Recent form matters only after opponent, personnel, and game-state adjustment and often overlaps the stronger Efficiency lens. | Assumption only; rolling adjusted windows required |

Ten selectable agents is the catalog ceiling for this phase. New football context should enrich an existing agent unless it owns a distinct causal question, has a credible data path, and changes the resulting Game Script.

## CBB-to-NFL Translation

| CBB pack logic | Swantail equivalent | Decision |
| --- | --- | --- |
| Momentum | Opponent-adjusted recent EPA, success, and role changes | Momentum; never reduce it to a win streak |
| Pace and tempo | Seconds per snap, no-huddle rate, neutral pace, play volume | Pace |
| Offensive strength | Offensive EPA, success rate, explosives, finishing drives | Efficiency plus Quarterback |
| Defensive strength | Pressure, defensive EPA, success-rate suppression | Pressure plus future two-sided Efficiency inputs |
| Shooting volatility | Explosive dependence and unstable conversion | Derived `high_variance` script characteristic, not a selectable agent |
| Three-point mismatch | No direct NFL equivalent | Exclude; position matchup detail belongs in later Bet Station enrichment |
| Foul trouble | No direct NFL equivalent | Exclude; penalty discipline can remain supporting context |
| Injury and availability | Availability, replacement quality, role redistribution | Injuries; Usage becomes an internal Bet Station input |
| Clutch and close games | Late-down, two-minute, and end-game execution | Future split within Quarterback or Scheme; avoid small-sample standalone claims |
| Turnover and ball security | Sack-fumble, interception, fumble, takeaway interaction | Turnovers |
| Team composition | Depth, personnel grouping, and role concentration | Injuries plus downstream Bet Station role allocation |
| Coach and scheme | Personnel, coverage, blitz, motion, and adjustment interaction | Future Scheme agent after licensed charting data |
| Seed and historical matchup | No sound NFL equivalent | Exclude |
| Conference strength | No direct NFL equivalent | Exclude; NFL schedule adjustment belongs inside Efficiency |
| Rest and scheduling | Rest differential, travel, short week, bye | Rest/Travel |
| Brand perception and ATS | Market perception | Bet Station only; exclude from Game Script agents |
| Weighted meta-synthesis | Conditional cross-agent story | Game Script generation without weights or confidence claims |
| Rim efficiency | Run-game and front interaction | Trenches plus rushing splits inside Efficiency |

## Pack Collaboration

Agents do not vote. They contribute causal mechanisms that can reinforce, qualify, or contradict one another.

1. **Selection:** The user selects one or more Game Agents. Selection is the implicit hypothesis.
2. **Resolution:** Each agent emits one scenario event in catalog order.
3. **Evidence attachment:** The latest game snapshot supplies only observations whose `agent_id` matches the specialist.
4. **Contradiction retention:** Conflicting observations remain visible. They are not discarded to make the story cleaner.
5. **Anchor suggestion:** Agents suggest only anchors already defined by the Game Script contract. Exclusive groups resolve deterministically.
6. **Script synthesis:** The script connects the selected mechanisms, states what must remain true, and names ways the story fails.

High-value pairings include:

- Weather + Quarterback + Pace: conditions affect timing, depth, and available play volume.
- Pressure + Quarterback: rush and protection meet the quarterback's pressure response.
- Pace + Efficiency: play volume changes how often an efficiency gap can compound.
- Injuries + Quarterback or Trenches: an absence matters through the game-level function it removes.
- Momentum + Efficiency: recent change is checked against the stable season baseline.
- Trenches + Pressure + Efficiency: line control connects protection, rushing success, and drive quality.
- Turnovers + Pressure + Quarterback: disruption and decision-making establish whether ball risk can repeat; high variance is derived from the result.
- Rest/Travel + Injuries: preparation and recovery modify an already constrained roster.

## Data Tiers

### Available pilot observations

- Weather: NWS hourly kickoff forecast and venue enclosure state.
- Injuries: nflverse weekly injury reports.
- Efficiency: nflverse offensive EPA per play and league rank.
- Turnovers: nflverse giveaways, interceptions, fumbles lost, defensive interceptions, forced fumbles, and recoveries.
- Trenches: nflverse result-based protection, rushing-efficiency, sack/QB-hit, and tackle-for-loss proxy.
- Rest/Travel: schedule-derived turnaround, schedule spot, road sequence, and venue-distance context.

These feeds remain pilot inputs. Injuries and performance require licensing review before commercial production use.

### Licensed Game Story data required

- pressure rate, sacks, pass-rush win rate, protection and time-to-pressure;
- situation-neutral pace, seconds per snap, no-huddle and play-volume splits;
- quarterback clean/pressured EPA, CPOE, depth, scrambling, and turnover data;
- depth charts, inactive status, replacement roles, and participation;
- opponent-adjusted defensive efficiency and schedule context;
- opponent-adjusted rolling form and recent play-level splits;
- line play, blocking, front disruption, and box-count charting;
- turnover-worthy plays, fumbles, takeaways, and field-position value;
- play-level efficiency distributions and conversion volatility;
- player snap load, travel, time-zone, and turnaround observations.

### Reserved Bet Station data

- player identity and current depth-chart role;
- snaps, routes, carries, targets, first reads, air yards, and scoring-area opportunity;
- alignment, coverage, box count, yards after contact, and role-specific efficiency;
- current market identity, price, source book, quote time, and availability.

## Disciplined Future Catalog

Do not add another ID to `GAME_AGENT_IDS` until its observation contract, assumption language, and anchor behavior are approved.

1. **Scheme:** Detect personnel, motion, coverage, blitz, and formation interactions. Requires licensed charting data and careful boundaries with Pressure, Quarterback, and Efficiency.
2. **Special Teams:** Consider only after Swantail has a clear user hypothesis and anchor need for field position, kicking, and return effects.

Penalty discipline, coaching history, generic home-field narratives, and market perception should remain supporting context rather than selectable Game Agents.

## Runtime Integration

The current implementation remains valid:

- `GAME_AGENT_IDS` is the canonical selectable set.
- `GAME_AGENT_CATALOG` maps each ID to user-facing language and its specification.
- `AGENT_EVENTS` in `lib/terminal/scenario.ts` provides the assumption-only event.
- `eventEvidence` attaches and interprets current observations.
- `eventEvidence` produces a structured Agent Finding with materiality, direction, signals, and caveats.
- Material data-backed findings provide dynamic anchor suggestions; balanced and unavailable findings provide none.
- `ScenarioEventSchema` preserves the assumption, Agent Finding, evidence state, observations, and anchors.
- Game Script generation receives those scenario events and must preserve their evidence distinctions.

Recommended later code changes, in order:

1. Move assumption and anchor guidance into one typed agent registry so catalog metadata and scenario behavior cannot drift.
2. Add directional agent configuration, such as `home_pressure`, `away_qb_response`, or `game_weather_suppression`, without adding a free-text thesis object.
3. Add provider adapters only by extending the observation contract and immutable snapshot first.
4. Give Game Script generation compact agent-specific synthesis guidance derived from these specs.
5. Extend evaluations to check causal specificity, cross-agent interaction, contradiction handling, and generic restatement.

No change should introduce odds, parlays, expected value, confidence guarantees, or unsupported facts into the Game Script contract.

## Specification Index

- [Weather](weather.md)
- [Momentum](momentum.md)
- [Pressure](pressure.md)
- [Pace](pace.md)
- [Injuries](injuries.md)
- [Efficiency/EPA](efficiency-epa.md)
- [Trenches](trenches.md)
- [Turnovers](turnovers.md)
- [Quarterback](quarterback.md)
- [Rest/Travel](rest-travel.md)

The former [Backfield](backfield.md), [Receivers](receivers.md), [Tight Ends](tight-ends.md), and [Usage](usage.md) specifications remain as Bet Station research references. [Volatility](volatility.md) remains as internal Game Script synthesis guidance. None is a selectable v5 Game Agent.
