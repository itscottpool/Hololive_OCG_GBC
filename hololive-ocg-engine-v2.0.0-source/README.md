# Hololive Original Card Game — Endless Nights

This project is a TypeScript implementation of the Hololive Official Card Game rules needed to play the supplied hSD01 Tokino Sora/AZKi starter deck. Version 2.0.0 adds a self-contained Windows desktop build, restores cinematic Art playback with impacts anchored to the target card inside the action window, strengthens the SFX mix, and adds the official starter deck box artwork.

## Current milestone

The first starter deck is playable from setup to game over in both human-versus-AI and CPU-versus-CPU matches. The engine supports either `hSD01-001` Tokino Sora or `hSD01-002` AZKi as each player's Oshi while sharing one canonical 50-card main deck and 20-card Cheer deck.

## Play on Windows — desktop release

1. Double-click `Hololive-OCG-Endless-Nights-2.0.0-Portable.exe`.
2. Play in the dedicated game window; no browser, terminal, Node.js installation, or extraction is required.
3. Choose `EXIT GAME` on the title screen to close the application.

The portable executable is currently unsigned, so Windows SmartScreen may ask for confirmation. Code signing is recommended before public distribution.

### Browser fallback

The source package still includes `PLAY_GAME.bat` as a transparent browser-based fallback. That route requires Node.js 22.18 or newer and does not require `npm install`.

The interface can be played entirely with either mouse or keyboard. The battle overview begins on the compact command bar. Up/Down moves through your Backstage, your active stage, the opponent's active stage, and the opponent's Backstage; Left/Right highlights cards within the current row. Enter opens the highlighted card. Inside lists, use Up/Down, Enter, Space, and Escape. Mouse users can click through every zone → card → action → target layer and use the persistent Back button to return one layer or close the browser. Clicking a setup choice, confirmation, playback window, or single-card target performs the same action as Enter. Press `M` or use the HUD music button to toggle the looping battle track.

The battle overview is deliberately theatrical rather than a literal playmat. Each Oshi is rendered as a proportionally complete, oversized card at the outer edge of the battlefield. Its upper artwork and character remain visible while the lower portion naturally continues underneath the interface mask; the image itself is never internally cropped or stretched. Life remains above the Oshi and Holo Power stays visible over the displayed portion. Collab stands left of Center, and the CPU composition mirrors yours across the stage. The compact status box moves to your right and the CPU's left. Back Stage Holomem are hidden from the main scene and reviewed through the Backstage command.

The final command row is `Hand · Backstage · Archive · Log · [Next] Step`. The last label changes to the phase that the current action will advance into—for example, `Performance Step` from Main or `End Step` from Performance—and is disabled while a required action must still resolve.

Selecting the Step command opens a default-to-No confirmation window before the phase advances, guarding against accidental clicks and Enter presses. Both players' Back Stage cards are rendered at full proportions just beyond the table edge, leaving only their upper 20% inside the battlefield mask. The opponent's row is upside down to match its position across the table. These card tops can be opened with the mouse or stage-navigation keys, while the Backstage command remains the fuller list view. Small color pips on each visible card top show every attached Cheer. Holomem entries in Backstage, visible Stage, action, and target lists retain the larger supplied Cheer icons. Each public status panel reports `STAGE n/6`.

The opening screen fades slowly from white while the pixel-treated background settles downward into position. That full sequence runs only on application startup and after a confirmed match forfeit; returning from Options or deck selection goes directly back to the already-open main menu. A flashing `PRESS START` row accepts any keyboard key or mouse click, unlocks title audio, and then reveals the console menu. It shares the menu's clean text treatment and moving pink cursor instead of using a separate box. The newly supplied transparent logo is used byte-for-byte without editing, rendered slightly smaller in the upper-left, and paired with a larger `Endless Nights` subtitle. The subtitle, menu text, prompt, and cursor use the bundled `Endless Pixel` 5×7 bitmap-style font generated from the project's own source; battle typography remains unchanged. Story Mode is visibly reserved but disabled; Vs. AI opens a deck-selection screen before Oshi selection, Options contains Color Scheme and separate BGM/SFX volume controls, and Exit Game stops the local process. BGM and SFX both default to 100% when no preference exists. The supplied `Non-Fiction` 8-bit track plays across setup, then hands off to the existing battle music when the match begins. The three interface palettes—Classic White, Retro Mint, and Moonlight—and both audio levels are remembered for later sessions on the same browser.

Oshi selection, coin call and result, opening-hand review, Center selection, and Back Stage selection now appear in lightly tinted translucent panels over the same title artwork. The background stays visible through this complete pre-battle sequence, then yields to the dedicated stage presentation when the battle begins.

Every performed action now plays before control returns to the player. Each individual event carries its own projected board state, so the turn/phase header, middle prompt bar, field, hand totals, and pending Cheer display change only when that exact narrated event is reached. Text windows narrate CPU and player decisions in chronological order, with card reveals, Cheer displays, draw-to-hand movement, deck shuffling, phase announcements, and cinematic attacks. The attack window retains both combatants and places the color animation and arcade-style damage flicker directly over its target-card portrait. Cheer transfers name both Holomem and move the actual Cheer card between them using the same one-card-per-beat motion as a deck draw. After each animation and message finish, press Enter or click to advance to the next action. Nothing advances automatically.

When an Art, Oshi Skill, Collab ability, or Support effect is used, its effect description is printed in the action window alongside the action name. Long descriptions remain readable inside the playback text area.

Art playback retains compact primary-color visuals—White flashes, Green leaves, and distinct Red, Blue, Purple, Yellow, and Neutral treatments—while every damaging Art uses the supplied universal impact sample at a near-full-scale SFX level. Battle music briefly ducks beneath the hit. Draws, shuffles, Cheer transfers, card placement, Bloom, Collab, Baton Pass, Support cards, Oshi Skills, and die rolls use a strengthened synthesized mix that tracks the SFX option independently of BGM.

Hand and Backstage command navigation remains intentionally layered: choose the zone, choose a card, then choose one currently legal action. When that action needs a staged target, its menu closes and the legal cards pulse on the live table; clicking the intended card or moving focus with the arrow keys and pressing Enter confirms it. Cards selected directly on the battlefield—including Oshi, Center, Collab, and the visible Backstage tops—skip the redundant Stage/Backstage list and immediately open that card's Action menu. Back returns straight to the battle overview. The Hand browser includes a mouse-accessible `Sort Hand` control and an `S` keyboard shortcut. Sorting groups the cards currently held—Holomem by name and Debut/Spot → 1st → 2nd → 3rd, then Support cards alphabetically—without enabling permanent auto-sort. Cards drawn afterward stay in draw order at the end of the hand until Sort is deliberately used again. Every card has an Inspect action that opens its artwork at nearly the full height of the 480×270 screen.

Bloom is initiated from the higher-level Holomem card in Hand. Its action appears only when the engine has at least one legal lower-level target on Stage; opening the staged Debut itself does not offer Bloom. After choosing Bloom, only Holomem that the selected hand card may legally Bloom onto are highlighted on the table.

During Performance, each selectable Art row displays its Cheer cost icons, complete Art name, base damage, and printed effect directly in the selection list. Art headings now measure their available row width and reduce their font only as far as needed, rather than truncating with an ellipsis. Long Art names in target-dialog headings receive the same fit-to-window treatment so they cannot wrap underneath the border or Back button.

Match setup now includes a Heads/Tails call, visible result, first/second choice by the human toss winner, opening-hand inspection, Center selection, Back Stage selection, and redraw-penalty cards. The CPU always elects to play first when it wins the toss. The optional free redraw is tracked separately from mandatory Debut redraws. Each mandatory redraw increments the penalty, the player may repeat through redraw count six, and a sixth failed hand causes an immediate match loss; after finding a Debut, exactly that many non-stage cards are placed on the bottom of the deck. Sub PC pauses play to reveal the top five, offers an eligible LIMITED card, and lets the player explicitly order all remaining cards on the bottom of the deck.

After the optional free redraw is used, the opening-hand screen now explicitly distinguishes the two legal outcomes: a hand containing a Debut must be kept, while a hand without a Debut presents the next mandatory-redraw action. This removes the misleading suggestion that another voluntary redraw remains available.

Field cards use their complete artwork without a cropping frame. Attached Cheer is represented beneath each Holomem with the supplied color-specific Cheer artwork. The same artwork appears beside every Art description in the exact cost order stored in `cards.json`, including Neutral requirements.

During the player's Cheer Step, the revealed Cheer card now appears in a dedicated waiting slot immediately to the right of Center. Its complete artwork and color badge remain visible while the player chooses a recipient, then disappear as soon as the Cheer is attached. Revealed Life and effect Cheers use the same slot, and a selected Replacement or archived Cheer remains visible while its destination is chosen.

Resting Holomem are tilted six degrees and rendered with visibly reduced saturation and brightness on the Center, Collab, and table-edge Backstage displays. The selected Backstage card uses the same cyan-to-pink animated focus outline as selected active-stage cards.

Bloomed Holomem now render as physical piles: each underlying Holomem uses its real card artwork and is offset behind the active card so the stack depth is visible without an artificial multiplication badge. The same pile treatment applies to Center, Collab, and the partially visible Backstage cards.

Opening a staged Holomem's action menu also exposes a nested `CARD PILE` section. It lists the Bloom stack from the card immediately beneath the top downward, followed by every attached Cheer and Support. Support subtype labels are data-driven, so future Tool, Fan, and Mascot attachments automatically appear in the same hierarchy. Selecting any nested card previews its own details without inheriting the top Holomem's damage, state, or Cheer summary, and Enter/click opens its full Inspect view.

Card inspection lists every printed Ability and every Art together. Ability labels identify Collab, Oshi, Support, Extra, and other timing families, so a Holomem's Collab or Bloom-era printed effect is no longer hidden when the same card also has an Art. Field, action, and target inspection panels also retain the selected Holomem's position, active/resting state, damage, stack size, and attached Cheer colors.

Normal PC now pauses after being played and displays every valid Debut holomem found in the player's deck. The player chooses which one is revealed and placed on the Back Stage; the activation handler resolves the currently highlighted card's unique instance ID, so mouse selection cannot fall back to the initially highlighted candidate. The remaining candidates return to the deck before it is shuffled.

Amazing PC now resolves as two explicit player decisions. First, a hierarchy shows every Center, Collab, and Back Stage Holomem with each individual attached Cheer indented beneath its owner; the player chooses the exact Cheer to archive. The next screen browses only eligible non-Buzz 1st and 2nd Holomem from the deck, adds the exact selected card to hand, returns the unchosen candidates, and shuffles. The CPU path logs the same payment, search result, and shuffle so its resolution is fully narrated.

Every choice-bearing hSD01 effect now pauses for the human player. Replacement asks for the exact attached Cheer and its new Holomem; the Sora SP skill asks which opposing Back Stage Holomem becomes Center; HOPE asks which Holo Power card enters the hand and which hand card replaces it; Expanding Map, SorAZ Gravity, Drawing Together!, Circle of hololive Listeners, A Mic in My Right Hand, Normal PC, Sub PC, Amazing PC, and First Gravity each expose all selections and ordering promised by their printed text. Optional die Arts ask whether to roll, offer AZKi's die replacement when legal, and ask for the declared face. Automatic effects remain automatic only when the printed effect offers no choice. The complete review is recorded in `docs/card-effect-audit.md`.

Selecting either visible Oshi opens its card view, and the on-screen toggle can switch between the player's and opponent's Oshi. Every Oshi Skill action row now matches the Art-list presentation: it shows the exact Holo Power cost, usage limit, and full printed effect before selection.

When one of the player's Holomem is downed, the revealed Life Cheer pauses resolution and highlights its eligible recipients on the status-visible table. If the Center is empty during the Reset Step, the player likewise chooses the replacement directly from the eligible Back Stage Holomem before the turn continues.

Pressing Escape on the main battle overview opens a safe, default-to-No forfeit prompt. Confirming returns to a freshly replayed title fade and Press Start prompt without retaining the old match. The title screen's Exit command shuts down the local game server process.

The browser client runs only on `127.0.0.1` and does not expose the AI's hidden hand, deck order, Life cards, or Holo Power contents. All choice-bearing effects in the current 24-card hSD01 data set use the serializable interactive pending-decision framework; future card packs should follow the audit standard instead of resolving human choices through an AI policy.

The main-deck shuffle is an unbiased Fisher–Yates shuffle driven by a 32-bit PRNG. Normal browser matches seed that PRNG from Node's operating-system-backed cryptographic random source; explicit numeric seeds remain supported for reproducible tests and replays. Integer selection uses rejection sampling, avoiding modulo bias. The opening hand is always the top seven cards after the shuffle—there is no guaranteed-Debut insertion. With 18 Debuts in this 50-card deck, the exact chance of opening without one is about 3.37%, so approximately 96.63% of initial hands naturally contain at least one Debut before any redraw.

Implemented rules include:

- deck validation, seeded shuffling, opening hands, optional redraws, mandatory Debut redraws and redraw penalties;
- Center, Collab and Back positions; Life, Holo Power, hand, deck, Cheer deck and archive zones;
- Reset, Draw, Cheer, Main, Performance and End phases;
- first-turn restrictions, active/resting state, placement, Bloom, Collab and Baton Pass;
- Cheer color requirements, Arts, critical damage, damage modifiers, down processing and Buzz Life damage;
- Life Cheer assignment, deck-out, empty-Stage, zero-Life, win and simultaneous-loss handling;
- LIMITED support restrictions and every support, Collab, Oshi and Arts effect appearing in hSD01;
- SorAZ's additional names and same-name Bloom behavior;
- deterministic, knockout-focused AI decisions, legal-action enforcement and JSON replay logs.

## Developer and simulation commands

Node.js 22.18 or newer is required for source development. Install the desktop packaging dependencies with `npm install` when building the executable.

```bash
npm test
npm run validate:data
npm run play
npm run simulate -- --seed 42
npm run simulate -- --games 100 --quiet
npm run desktop
npm run desktop:build:win
```

The equivalent dependency-free commands are:

```bash
node --experimental-strip-types --test test/*.test.ts
node --experimental-strip-types src/validate-data.ts
node --experimental-strip-types src/cli.ts --seed 42
```

The simulator writes its latest complete replay to `logs/last-match.json`. This debugging replay contains both players' hidden information and should not be sent directly to a networked client.

Batch summaries report `averageTurns`, `averageKnockouts`, and endings split into Life, deck-out, empty-Stage, and redraw losses. This makes AI-tempo regressions visible without opening individual replay logs.

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
- `assets/ui`: card back, hSD01 deck box, Cheer symbols, official transparent OCG logo, desktop icon, and the 480×270 pixel-treated title splash.
- `assets/audio`: separate looping title/setup and battle chiptune tracks plus the supplied universal attack-impact sample.

Gameplay behavior lives in TypeScript handlers rather than executable code embedded in JSON. This keeps imported card data auditable and prevents malformed spreadsheets or future card packs from running arbitrary code.

## Architecture

- `src/engine.ts`: state machine, zones, legal actions, rule checks and hSD01 effect dispatch.
- `src/types.ts`: serializable public contracts for data, state, actions and logs.
- `src/database.ts`: JSON loading and strict deck/effect validation.
- `src/random.ts`: reproducible PRNG, rejection-sampled integer selection, and Fisher–Yates shuffle; browser sessions receive an OS-random seed by default.
- `src/ai.ts`: deterministic starter-deck AI that prioritizes lethal Arts, concentrates damage, accelerates Cheer toward the nearest attack, and develops only resources that improve knockout tempo.
- `src/simulate.ts`: reusable CPU-vs-CPU simulation entry point.
- `src/cli.ts`: command-line runner and replay writer.
- `src/web-server.ts`: local-only game session server, player-safe state projection, chronological action frames, and AI turn runner.
- `desktop/main.cjs`: Electron desktop shell that starts the local engine privately and presents it without browser chrome or a terminal.
- `web`: 480×270 stage-battle interface, visible-card focus navigation, Backstage and Oshi-side toggles, full-card inspection, media playback, action narration, keyboard input, and responsive integer scaling.
- `test`: data, lifecycle, invariant and official-ruling regression tests.

## Intentional boundary

This is complete for the cards and mechanics in the supplied starter deck. It is not pretending to implement effect families that hSD01 never uses, such as Tool/Mascot/Fan attachment limits, Gifts from other sets, extra turns, Ability Shift, perpetual-cycle intervention, or future Oshi Stage skills. The core types leave room for those additions, and new cards should expand the effect vocabulary alongside focused tests.

Decision policies are synchronous because this milestone is headless. A battle UI can initially wrap them with prompts; a later interface milestone should convert unresolved choices into serializable pending decisions if save-anywhere or online play is desired.

## Rules sources

- `official_rule_book_ver1_02.pdf` supplied with the project source material.
- `comprehensive_rules_ver190.pdf` supplied with the project source material.
- Official English hSD01 card list: https://en.hololive-official-cardgame.com/cardlist/cardsearch/?expansion=hSD01&view=text

Card images and Hololive names/artwork remain the property of their respective rights holders. Keep distribution and branding decisions separate from the technical prototype.
