# Test plan

Automated checks run with `node --test tests/`. This checklist is the manual pass, done by the agent who did **not** write the code being tested.

## Setup
- [ ] `python3 build.py` succeeds
- [ ] Open `blackjack-trainer.html` with Wi-Fi off, in a desktop browser
- [ ] Open it on a phone browser (or a phone-width window): no sideways scrolling, buttons tappable

## Every mode × every rule set

Rule sets: 1D-H17, 1D-S17, 2D-H17, 2D-S17, 6D-H17, 6D-S17

| Mode | 1D-H17 | 1D-S17 | 2D-H17 | 2D-S17 | 6D-H17 | 6D-S17 |
|---|---|---|---|---|---|---|
| Learn to Play | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Strategy Quiz | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Count Drill | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Count While Playing | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Full Table | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

## Specific checks
- [ ] Changing settings mid-mode reshuffles and resets the count
- [ ] Shoe holds 52 × decks cards; a full count-down of the shoe ends at running count 0
- [ ] True count uses decks *remaining*, not decks selected
- [ ] Dealer hits A,6 under H17 and stands on it under S17
- [ ] Surrender only offered on the first two cards, not after a split
- [ ] Double offered after a split (DAS)
- [ ] Split aces get one card each
- [ ] Full table: other players' cards count; seat first/middle/last changes who acts before you; 1 and 6 other players both work
- [ ] 1 deck with 6 other players: the shoe never errors; a mid-hand reshuffle shows a message and resets the count
- [ ] Quiz answers match the CSV for the current rule set, including hands that differ between charts:
  - [ ] 11 vs A
  - [ ] A,8 vs 6
  - [ ] A,7 vs 2
  - [ ] 17 vs A (surrender)
