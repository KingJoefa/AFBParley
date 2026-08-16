# Bet Station Scope And Guardrails

**Status:** Draft for project-owner and legal/compliance approval. This is a product requirement, not legal advice.

## Recommended Initial Market Scope

The first Bet Station release should cover only pregame, full-game NFL:

- point spreads;
- game totals.

It should exclude moneylines, team totals, player props, parlays, futures, and in-play markets until ingestion, closing-line capture, calibration, and correlation testing are dependable.

## Game Script Handoff

Bet Station begins only after a Game Script is complete. The versioned handoff in `lib/bet-station/contracts.ts` carries the script, scenario revision, snapshot, game, and selected-anchor lineage. It does not place odds, markets, player choices, or recommendations back into the Game Script contract.

Quarterback, Running Back, Wide Receiver, and Tight End are reserved Bet Station position families. They are not selectable Game Agents. Usage remains an internal role-allocation lens used to determine which players have the participation and high-value opportunities needed to express a resolved story.

The first approved release remains spreads and totals only. Position families become user-facing only in a later player-market phase after player identity, participation, role, market, and pricing data meet the same freshness and lineage requirements as game-level recommendations.

Every candidate position must include:

- source book and quote timestamp;
- best available and consensus price;
- model and no-vig market probability;
- estimated edge and uncertainty;
- the Game Script causal step it expresses;
- invalidation factors and data freshness;
- model, feature, and recommendation versions;
- an explicit `no_edge` result when thresholds are not met.

## Responsible-Gaming Baseline

Swantail should remain an analytics product and must not accept wagers, hold funds, or imply that a generated story guarantees a profitable outcome.

Before Bet Station is public:

- position sports-wagering content for adults 21 and older;
- prohibit `risk-free`, guaranteed-success, wealth-building, or loss-recovery language;
- never encourage chasing losses or present gambling as a solution to financial problems;
- display a conspicuous responsible-gaming message and current help resources wherever recommendations appear;
- provide the current National Council on Problem Gambling helpline and state-specific resources where applicable;
- require jurisdiction review before displaying book availability, outbound sportsbook links, promotions, or affiliate relationships;
- avoid personalized stake sizing until account, affordability, limit, cooldown, and self-exclusion policies are approved;
- provide a user control to hide recommendation surfaces while retaining the non-betting Game Script;
- retain recommendation and line history for audit without storing unnecessary sensitive user data.

The [American Gaming Association Responsible Marketing Code](https://www.americangaming.org/marketing-code/) prohibits underage targeting, `risk-free` language, guaranteed success, and loss-chasing messages. The [National Council on Problem Gambling](https://www.ncpgambling.org/responsible-gambling/) maintains current national help resources and internet responsible-gambling standards.

## Owner Approvals Required

- Initial markets: spreads and totals only.
- Launch jurisdictions and minimum age treatment.
- Supported books and whether any outbound or affiliate links are allowed.
- Recommendation language and minimum evidence/edge thresholds.
- Account requirement, usage limits, cooldowns, and recommendation-hiding control.
- Responsible-gaming message placement and legal review owner.

No numerical recommendation layer should be exposed to users until these decisions are recorded and timestamped.
