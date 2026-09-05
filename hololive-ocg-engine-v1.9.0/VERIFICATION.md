# Verification Report — v1.9.0

Verified on September 4, 2026 with Node.js 24.19.0.

## Data validation

- 24 canonical card definitions
- 50 cards in the main deck
- 20 cards in the Cheer deck
- 2 selectable Oshi cards
- 24 verified primary images
- 11 mapped alternate/parallel images
- Every declared effect identifier recognized by the engine

## Playable client

- 480×270 logical viewport with integer display scaling (4× at fullscreen 1080p)
- Console-style title and menu rendered directly over the title artwork, using the supplied transparent official Hololive OCG logo without altering its source bytes, a smaller logo footprint, a larger `Endless Nights` subtitle, an upper-right build number, and no development-resolution or vertical-slice labels
- Slow white-to-title fade and downward background settle restricted to initial startup and confirmed-forfeit return; Options and deck-selection Back commands return directly to the live menu
- Clean menu-style mouse/keyboard `PRESS START` row with the same moving pink cursor, stronger hard-edged title-only pixel typography, and no surrounding text box
- Separate supplied title/setup chiptune that transitions to the existing battle track when gameplay begins
- Bundled self-owned `Endless Pixel` 5×7 title font, served locally with no external font dependency
- Deck-selection step before Oshi selection, backed by the deck-family data exposed by the local server
- Animated pending-Cheer card slot to the right of Center, showing full Cheer artwork and a compact color badge until attachment resolves
- Real card-art edges for every underlying Bloom card on Center, Collab, and Backstage piles, replacing the numeric stack badge
- Indented Card Pile hierarchy in Holomem action menus, with inspectable Bloom cards, Cheers, and subtype-aware Support/Fan/Mascot attachments
- Per-event projected playback states that keep the field, phase header, middle message bar, pending Cheer, and counters synchronized with the exact animation awaiting player advancement
- Performance Art rows containing cost icons, Art name, base damage, and printed effect directly in the selectable list
- Width-aware Art-name and dialog-title font fitting that preserves complete long labels without ellipses, border overlap, or header wrapping
- One-shot Hand Sort control plus `S` shortcut, ordering the currently held Holomem by name and Bloom level before alphabetically grouped Support cards; newly drawn cards append unsorted until the player sorts again
- BGM and SFX defaulting to 100% when no saved preference exists, with reliable first-click/keypress title-music startup and persistent volume levels thereafter
- Title-art-backed translucent setup panels carry Oshi choice, coin toss, opening-hand review, and Stage setup through one visually continuous pre-battle sequence
- Fixed setup-dialog rows keep coin-toss and opening-hand help text inside the bordered window
- Live-stage confrontation overview with opposing Centers, equally sized Collab partners, and mirrored player/CPU compositions
- Proportionally complete oversized Oshi cards whose lower portions continue beneath the battle-interface mask, with Life above and live Holo Power counters kept visible
- Back Stage removed from the combat scene and exposed through a dedicated Backstage browser
- Keyboard focus traversal across both visible stage rows, with matching direct mouse selection
- Direct Oshi, Center, Collab, and visible Backstage activation opening the selected card's Action menu without an intermediate field list
- Mirrored fixed-size status panels containing public Hand, Main Deck, Cheer Deck, Archive, and Stage totals
- Dynamic Performance Step and End Step command labels
- Default-to-No confirmation before advancing to the next Step
- Full-proportion Backstage cards masked to their upper 20%, centered beneath each Center and directly selectable by mouse or keyboard
- Upside-down opponent Backstage presentation, with compact color pips showing each attached Cheer on both rows
- Stable mouse activation throughout card, action, and target lists without hover-time DOM replacement
- Persistent clickable Back control for every browser layer, allowing complete mouse-only match play
- Clearly tilted, desaturated, and darkened resting Holomem on active and Backstage displays
- Matching animated cyan/pink selection outlines across active-stage and Backstage cards
- Individual color-specific Cheer icons beside Holomem names in Backstage, visible Stage, action, and target lists
- Public `STAGE n/6` capacity counters for both players
- Classic White, Retro Mint, and Moonlight palettes selectable from the title menu and persisted locally
- `Hololive Original Card Game — Endless Nights` title treatment
- Compact light command strip with selectable black labels and an animated cursor arrow
- Human Oshi selection, coin call/result, human toss-winner turn-order choice, CPU-first choice on CPU toss wins, and explicit opening setup
- One optional free redraw, up to six mandatory Debut redraws, immediate loss on a sixth failed redraw, and exact redraw-count bottom-deck penalties
- Explicit post-free-redraw messaging: Debut hands must be kept, while no-Debut hands expose the mandatory-redraw action
- Complete match against the knockout-focused AI
- Chronological player/CPU action playback before input resumes
- Live-table target selection for Arts, Bloom, Baton Pass, revealed Cheer placement, Center promotion, and target-bearing Oshi/card effects
- Art projectiles and primary-color impact effects positioned over the actual rendered target card
- Oshi die-replacement confirmation panel with card art, Holo Power cost, usage limit, and full printed skill text
- Explicit Replacement playback naming the source and destination Holomem while animating the selected Cheer between them
- Typewriter text windows with card, Cheer, draw, shuffle, phase, die-roll, and attack/hit visuals
- Manual Enter/click advancement after every completed action animation
- Exact one-card-per-draw animation using the supplied card-back artwork and the resulting hand count
- Hand, Backstage, Archive, battle-log, and dynamic next-Step menus
- Complete mouse plus arrow-key, Enter, Space, and Escape input, including click-to-confirm setup choices and live-table effect targets
- Layered zone → card → action navigation followed by highlighted live-table targeting for placement, Bloom, Cheer attachment, Baton Pass, Arts, and Oshi skills
- Bloom actions owned by eligible higher-level cards in Hand, with only legal staged Holomem exposed as targets and no misleading Bloom action on a staged Debut
- Interactive Sub PC reveal, optional LIMITED selection, and ordered bottom-deck placement
- Interactive Normal PC deck search and exact current-UID Debut selection for both mouse and keyboard activation
- Two-stage interactive Amazing PC resolution: exact attached-Cheer payment grouped beneath every staged Holomem, followed by exact non-Buzz 1st/2nd deck selection and shuffle
- Interactive Expanding Map and SorAZ Gravity top-Cheer target selection, with Art damage deferred until SorAZ Gravity finishes resolving
- Two-stage A Mic in My Right Hand selection for the Green target and any number of archived Cheers
- Dedicated narrated CPU archive-Cheer transfer playback
- Visible damage, color-specific Cheer icons, Bloom stack count, resting state, Life, hand, deck, Holo Power, and archive totals
- Uncropped complete card artwork in every field slot
- Card artwork plus simultaneous Ability and Art details in the inspection panel, including Collab effects
- Persistent position, active/resting state, damage, stack, and Cheer status in Field/action/target inspection panels
- Art descriptions with ordered color/Neutral requirement symbols sourced from each Art's rules data
- Default Inspect action on Hand, Backstage, visible Stage, Oshi, and Archive cards with a near-full-height artwork view
- Player and opponent Center/Collab cards directly selectable from the battle scene
- Player Oshi shown by default with the same keyboard and on-screen opponent-Oshi toggle
- Full Oshi Skill action rows with Holo Power cost, usage limit, and printed effect text
- Manual choices for Replacement's exact Cheer and destination, Sora's SP swap target, HOPE's two-card exchange, Drawing Together!'s optional archived Cheer, Circle's archived Cheer and destination, First Gravity's selected Holomem and bottom order, and every optional die/Map declaration branch
- Primary-color Art effects for White, Green, Red, Blue, Purple, Yellow, and Neutral Holomem
- Synthesized retro sound effects for Arts, shuffles, draws, card actions, Cheer transfers, and die rolls
- Pixel-treated 480×270 title artwork, supplied Cheer artwork, official logo, and separate supplied looping title/battle tracks
- HUD music toggle plus `M` keyboard shortcut
- AI hidden-zone filtering in the browser state projection
- One-click Windows launcher
- Cache-busted interface assets, `no-store` web responses, and a visible boot-screen build number

## Automated tests

Forty tests pass, covering data integrity, assets, automated and interactive setup, the sixth-failed-redraw loss boundary, first-turn restrictions, legal actions, determinism, card conservation, long-run completion, additional names, Bloom, Oshi skills, Collab effects, Life damage, Buzz, Sub PC reveal/selection/order behavior, exact Normal PC UID selection, exact two-stage Amazing PC Cheer/payment and Holomem selection, manual Life-Cheer and Center-replacement decisions, manual Replacement and Sora SP choices, HOPE's two-card exchange, Drawing Together!, Circle, First Gravity, Expanding Map, SorAZ Gravity, Destiny Song's optional roll and declared face, staged A Mic archive selection, CPU A Mic playback metadata, per-event board/phase synchronization, empty-zone edge cases, lethal targeting, attack-enabling Cheer placement, Oshi action descriptions, CPU-first toss behavior, shuffle integrity and opening-hand distribution, title audio defaults/startup, local match abandonment and shutdown, and the complete browser-client/server loop.

The shuffle tests verify card conservation, top-position reachability across varied seeds, and 10,000 opening-hand samples. The observed no-Debut rate remains within a tight band around the exact 3.37% probability for this 18-Debut, 50-card deck, proving that setup does not inject or guarantee a Debut.

The local browser API was exercised through the complete coin-toss and player-controlled setup flow followed by a full human-action/AI-response match. It reached a legal game-over state, primary card artwork returned as PNG, the interface returned as HTML, and the opponent's projected hand remained hidden while its public card count remained available. Playback frames were verified for both players, including card metadata and attacker/target metadata for Arts; every intermediate frame preserves CPU hidden-hand filtering.

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
