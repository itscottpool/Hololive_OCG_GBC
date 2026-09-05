# hSD01 Player-Agency Audit

This audit covers every canonical card in `data/cards.json`. Its rule is simple: when printed text gives the controller a choice, the browser client must create a pending decision and wait for that player. Policy-driven automatic resolution is reserved for the CPU and for effects whose text offers no choice.

## Oshi Holomem

| Card | Effect | Human interaction | Status |
| --- | --- | --- | --- |
| Tokino Sora | Replacement | Choose the exact attached Cheer, then choose its new friendly Holomem. | Interactive |
| Tokino Sora | So, that Makes You My Enemy? | Choose the opposing Back Stage Holomem that swaps with Center; the White Center bonus follows resolution. | Interactive |
| AZKi | A Map in My Left Hand | When an eligible Holomem effect would roll, choose Map or a normal roll; if Map is used, declare 1–6. | Interactive |
| AZKi | A Mic in My Right Hand | Choose a Green Holomem, then choose zero or more exact archived Cheers. | Interactive |

## Holomem

| Card | Effect | Human interaction | Status |
| --- | --- | --- | --- |
| Tokino Sora Debut | Unlimited Tokino Sora / Everyone~ Konsome~ | No resolution choice in printed text. | Automatic |
| AZKi Debut | Unlimited AZKi / Konazuki~ | No resolution choice in printed text. | Automatic |
| Tokino Sora Debut | Let's Dance! / On Stage! | Collab is chosen by the player; its Center buff is automatic. | Interactive entry; automatic effect |
| Tokino Sora 1st | Two basic Arts | Choose the legal Art and target through the normal Performance flow. | Interactive |
| Tokino Sora Buzz | Buzz Life Loss / two Arts | Choose the legal Art and target; Life-2 and conditional damage are automatic. | Interactive entry; automatic modifiers |
| IRyS Debut | HOPE | Choose the exact Holo Power card to reveal into hand, then the exact hand card placed as Holo Power. | Interactive |
| AZKi Debut | Expanding Map | Choose whether to roll; choose Map or normal roll when available; declare a Map result; choose the Back Stage Cheer recipient; on 1, choose whether to return to Back. | Interactive |
| AZKi 1st | Basic Art | Choose the Art and legal target. | Interactive |
| AZKi 2nd | SorAZ Gravity / Destiny Song | Gravity chooses the top-Cheer recipient before damage. Destiny chooses whether to roll, Map or normal roll when available, and a declared Map face. | Interactive |
| Airani Iofifteen Debut | Drawing Together! | Choose an eligible White/Green archived Cheer or skip; the recipient is the Center required by the card. | Interactive |
| SorAZ 1st | Additional Names / A Future I Want to Surpass | Names are continuous. For the Art, choose whether to roll, Map or normal roll when available, and a declared Map face. | Interactive where optional |
| Amane Kanata Spot | Cannot Bloom / basic Art | Restriction is continuous; choose the Art and legal target. | Interactive entry; automatic restriction |
| Hakui Koyori Spot | SoAzKo / Cannot Bloom / basic Art | Collab entry is chosen; both name-dependent results are mandatory and automatic. | Interactive entry; automatic effects |

## Support and Cheer

| Card | Effect | Human interaction | Status |
| --- | --- | --- | --- |
| Normal PC | Debut search | Browse all eligible Debuts in the deck and choose the exact card placed on Back Stage. | Interactive |
| Harusaki Nodoka | Draw 3 | No choice after play. | Automatic |
| Manager-chan | Return hand, shuffle, draw 5 | Playing the card is the choice; all resolution steps are mandatory. | Automatic after play |
| Sub PC | Top-five LIMITED search | Choose an eligible LIMITED or take none, then order every remaining revealed card on the bottom. | Interactive |
| Amazing PC | Archive Cheer, search non-Buzz 1st/2nd | Choose the exact attached Cheer grouped under its Holomem, then choose the exact eligible deck card. | Interactive |
| Circle of hololive Listeners | Die 3+ archived Cheer | The roll is mandatory; after success choose the exact archived Cheer and its friendly destination. | Interactive on success |
| First Gravity | Top-four Sora/AZKi reveal | Choose any number of eligible cards, including zero, then order every remainder on the bottom. | Interactive |
| White Cheer | Stage-leave/Baton Pass cleanup | Rule reminder only; cleanup is mandatory. | Automatic |
| Green Cheer | Stage-leave/Baton Pass cleanup | Rule reminder only; cleanup is mandatory. | Automatic |

The regression suite exercises every interactive effect family above. New cards should add both a pending-decision path and a focused test whenever their text introduces a new choice shape.
