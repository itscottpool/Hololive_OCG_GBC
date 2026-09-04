# Hololive OCG Headless Engine - hSD01 Vertical Slice

This project is a dependency-free TypeScript implementation of the Hololive Official Card Game rules needed to play the supplied hSD01 Tokino Sora/AZKi starter deck. It deliberately has no battle interface: the engine exposes legal actions, accepts one action at a time, resolves rules and card effects, and records a deterministic replay log.

## Current milestone

The first starter deck is playable from setup to game over in CPU-vs-CPU matches. The engine supports either `hSD01-001` Tokino Sora or `hSD01-002` AZKi as each player's Oshi while sharing one canonical 50-card main deck and 20-card Cheer deck.

Implemented rules include:

- deck validation, seeded shuffling, opening hands, optional redraws, mandatory Debut redraws and redraw penalties;
- Center, Collab and Back positions; Life, Holo Power, hand, deck, Cheer deck and archive zones;
- Reset, Draw, Cheer, Main, Performance and End phases;
- first-turn restrictions, active/resting state, placement, Bloom, Collab and Baton Pass;
- Cheer color requirements, Arts, critical damage, damage modifiers, down processing and Buzz Life damage;
- Life Cheer assignment, deck-out, empty-Stage, zero-Life, win and simultaneous-loss handling;
- LIMITED support restrictions and every support, Collab, Oshi and Arts effect appearing in hSD01;
- SorAZ's additional names and same-name Bloom behavior;
- deterministic AI decisions, legal-action enforcement and JSON replay logs.

## Run it

Node.js 22.18 or newer is required. There are no third-party packages to install.

```bash
npm test
npm run validate:data
npm run simulate -- --seed 42
npm run simulate -- --games 100 --quiet
```

The equivalent dependency-free commands are:

```bash
node --experimental-strip-types --test test/*.test.ts
node --experimental-strip-types src/validate-data.ts
node --experimental-strip-types src/cli.ts --seed 42
```

The simulator writes its latest complete replay to `logs/last-match.json`. This debugging replay contains both players' hidden information and should not be sent directly to a networked client.

## Interface boundary

The future battle screen only needs three primary engine operations:

```ts
const actions = engine.listLegalActions();
engine.applyAction(chosenAction);
const state = engine.snapshot();
```

The UI should render a player-safe projection of `snapshot()`, present one of the legal actions, and translate animations from structured log events. It should never alter zones or damage directly.

## Data model

- `data/cards.json`: 24 canonical gameplay records, including typed Arts and effect-handler identifiers.
- `data/decks.json`: one hSD01 deck family with two selectable Oshi options.
- `data/art-variants.json`: the eleven alternate/parallel images that share existing gameplay records.
- `assets/cards/primary`: the 24 verified primary images.
- `assets/cards/alternate` and `assets/cards/parallel`: cosmetic variants.

Gameplay behavior lives in TypeScript handlers rather than executable code embedded in JSON. This keeps imported card data auditable and prevents malformed spreadsheets or future card packs from running arbitrary code.

## Architecture

- `src/engine.ts`: state machine, zones, legal actions, rule checks and hSD01 effect dispatch.
- `src/types.ts`: serializable public contracts for data, state, actions and logs.
- `src/database.ts`: JSON loading and strict deck/effect validation.
- `src/random.ts`: reproducible seeded random number generator.
- `src/ai.ts`: deterministic starter-deck decision policy and action scoring.
- `src/simulate.ts`: reusable CPU-vs-CPU simulation entry point.
- `src/cli.ts`: command-line runner and replay writer.
- `test`: data, lifecycle, invariant and official-ruling regression tests.

## Intentional boundary

This is complete for the cards and mechanics in the supplied starter deck. It is not pretending to implement effect families that hSD01 never uses, such as Tool/Mascot/Fan attachment limits, Gifts from other sets, extra turns, Ability Shift, perpetual-cycle intervention, or future Oshi Stage skills. The core types leave room for those additions, and new cards should expand the effect vocabulary alongside focused tests.

Decision policies are synchronous because this milestone is headless. A battle UI can initially wrap them with prompts; a later interface milestone should convert unresolved choices into serializable pending decisions if save-anywhere or online play is desired.

## Rules sources

- `official_rule_book_ver1_02.pdf` supplied with the project source material.
- `comprehensive_rules_ver190.pdf` supplied with the project source material.
- Official English hSD01 card list: https://en.hololive-official-cardgame.com/cardlist/cardsearch/?expansion=hSD01&view=text

Card images and Hololive names/artwork remain the property of their respective rights holders. Keep distribution and branding decisions separate from the technical prototype.
