# Rules Implementation Scope

This document maps the current engine behavior to the supplied Comprehensive Rules v1.9.0 and Official Rule Book v1.02.

| Engine behavior | Comprehensive Rules |
|---|---|
| Loss, draw and concession model | 1.2 |
| Partial resolution and impossible actions | 1.3.2 |
| Public/hidden zones and movement continuity | 4.1-4.3 |
| Holomem stacks and attached cards | 4.4 |
| Stage limit and positions | 4.6-4.9 |
| Life, decks, hand, archive and Holo Power | 4.10-4.15 |
| Bloom and persistent holomem state | 5.14 |
| Swap, send Cheer, damage and dice | 5.18, 5.21, 5.22, 5.24 |
| Deck construction | 6.1 |
| Setup and mandatory Debut redraws | 6.2 |
| Turn phases | 7.1-7.7 |
| Placement, Bloom, Collab, Oshi skills, support and Baton Pass | 8.1-8.7 |
| Performance and one Art per Center/Collab holomem | 9.1-9.2 |
| Cost payment and effect resolution | 10.4, 10.7-10.11 |
| Loss, down, illegal-card and Life processing | 11.1-11.5 |
| Oshi skills and Arts | 12.1-12.2 |
| Collab effects and additional names | 13.2 and 2.11.2.3 |

## Starter-deck interpretations locked by tests

- Damage equal to HP downs a holomem.
- A Buzz holomem causes two Life damage when downed.
- A Cheer deck that is empty during the Cheer phase does not cause a loss.
- Tokino Sora's SP skill grants the Arts bonus even if the opposing swap is impossible.
- Tokino Sora's Replacement skill can legally resolve with no attached Cheer.
- Expanding Map preserves orientation when moving its Collab holomem back and does not grant another ordinary Collab.
- SorAZ is simultaneously SorAZ, Tokino Sora and AZKi in every zone.
- SorAZ can satisfy same-name Bloom and name-based effects for either character.
- SoAzKo resolves both conditional branches when the Center is SorAZ.
- Let's Dance remains on the same holomem after that holomem Blooms.
- Manager-chan returns the remaining hand before drawing, including when the deck was previously empty.
- First Gravity can reveal SorAZ.

## Deferred vocabulary

The engine should only add the following when a card set or feature actually requires them: persistent support attachments, Gifts, Bloom effects, damage prevention/reduction layers, multiple simultaneous replacement choices, state-trigger ordering prompts, extra turns, Ability Shift, Arts copied from other holomem, perpetual-cycle intervention, and Oshi Stage skills.
