# Verification Report — v0.2.0

Verified on September 3, 2026 with Node.js 24.19.0.

## Data validation

- 24 canonical card definitions
- 50 cards in the main deck
- 20 cards in the Cheer deck
- 2 selectable Oshi cards
- 24 verified primary images
- 11 mapped alternate/parallel images
- Every declared effect identifier recognized by the engine

## Automated tests

Twenty-three tests pass, covering data integrity, assets, setup, first-turn restrictions, legal actions, determinism, card conservation, long-run completion, additional names, Bloom, Oshi skills, Collab effects, Life damage, Buzz, support-card ordering, empty-zone edge cases, lethal targeting, attack-enabling Cheer placement, and Sora SP target selection.

## Simulation stress tests

- 1,000 consecutive games completed in the primary stress run.
- 2,000 additional games completed across all four Sora/AZKi Oshi pairings.
- No simulation exceeded the 10,000-action guard.
- No card instance was duplicated or lost in the invariant sample.
- No unresolved effect identifier was encountered.

## Knockout-AI comparison

The same 1,000 seeds were run before and after the v0.2.0 AI change:

| Metric | Earlier greedy AI | Knockout-focused AI |
| --- | ---: | ---: |
| Average turns | 27.41 | 17.74 |
| Average actions | 197 | 117.94 |
| Life-loss endings | 105 | 909 |
| Deck-out endings | 895 | 1 |
| Empty-Stage endings | 0 | 90 |

Across the separate 2,000-game all-Oshi-pairings run, average match length stayed between 17 and 19 turns. There were no deck-out endings; 1,762 games ended through Life loss and 238 through the opponent having no Holomem left on Stage. Both are knockout-driven victory paths.

The AI is a deterministic, knockout-focused rules-testing opponent, not a claim of competitive or human-level strategy. It aims to win through Life damage and avoids unnecessary resource play, but balance results should not be used to judge the physical starter deck until look-ahead search and matchup knowledge are implemented.
