# Verification Report

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

Twenty tests pass, covering data integrity, assets, setup, first-turn restrictions, legal actions, determinism, card conservation, long-run completion, additional names, Bloom, Oshi skills, Collab effects, Life damage, Buzz, support-card ordering and empty-zone edge cases.

## Simulation stress tests

- 1,000 consecutive games completed in the primary stress run.
- 1,000 additional games completed across all four Sora/AZKi Oshi pairings.
- No simulation exceeded the 10,000-action guard.
- No card instance was duplicated or lost in the invariant sample.
- No unresolved effect identifier was encountered.

The AI is a deterministic rules-testing opponent, not a claim of competitive or human-level strategy. Balance results should not be used to judge the physical starter deck until stronger search or evaluation logic is implemented.
