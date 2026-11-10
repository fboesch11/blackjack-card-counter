# T6 test results

Tested by Claude (Jenna's agent), 2026-11-09. Independent of the code's author.

**How:** `tests/browser_check.py` opens `blackjack-trainer.html` from disk in real Chrome with the network switched off and every request blocked, then plays each mode by clicking through the screens. It checks the game against things the game doesn't compute itself:

- strategy hints and quiz answers against `data/strategy/*.csv`, read by the test
- running and true count grading against a Hi-Lo count the test keeps from the cards on screen
- dealer soft 17, surrender, double after split, split aces, Full table seats

Run it with `python3 tests/browser_check.py` (add `--quick` for a short pass). It needs Python Playwright and Chrome.

**Builds tested:**
- Full run (counts below): main at `fd4cced` (after PR #8).
- Short rerun of every mode × rule set, plus "The math" tab on all 6 rule sets: main at `bfcb015`, footer version `8c4df31` (after PR #12). Same results, and Bug 1 is still present.
- PR #12's number pad (`inputmode`) only changes the phone keyboard, which headless Chrome can't show. Check it on a real phone.

## Setup

| Check | Result |
|---|---|
| `python3 build.py --strict` succeeds | Pass |
| Opens from disk with the network off, desktop Chrome | Pass. No network requests attempted. |
| Phone width (375 px, touch, Chrome iPhone-size emulation): no sideways scrolling | Pass, all modes |
| Real iPhone | **Not tested.** Needs a person with a phone (see below). |

## Every mode × every rule set

| Mode | 1D-H17 | 1D-S17 | 2D-H17 | 2D-S17 | 6D-H17 | 6D-S17 |
|---|---|---|---|---|---|---|
| Learn to Play | Pass | Pass | Pass | Pass | Pass | Pass |
| Strategy Quiz | Pass | Pass | Pass | Pass | Pass | Pass |
| Count Drill | Pass | Pass | Pass | Pass | Pass | Pass |
| Count While Playing | Pass\* | Pass\* | Pass\* | Pass\* | Pass\* | Pass\* |
| Full Table | Pass\* | Pass\* | Pass\* | Pass\* | Pass\* | Pass\* |
| The math (lab) | Pass | Pass | Pass | Pass | Pass | Pass |

\* Grading is correct, but see Bug 1 (blank or non-number answer) and Issue 2 (decks-left display).

What each cell covered (full run, 40 hands or 150 quiz questions per rule set):
- **Learn to Play:** 301 "What should I do?" hints, all matching the chart. The coach's right/wrong feedback was correct after every move, including deliberate wrong moves.
- **Strategy Quiz:** 920 answers. The game's correct play matched the chart every time, and "Correct"/"Not quite" was right every time.
- **Count Drill:** a full shoe for each rule set (52, 104, 312 cards) with true count on. All 91 checks graded correctly, and every shoe ended at 0.
- **Count While Playing / Full Table:** 740 count checks, all graded correctly. Entering running ÷ decks *selected* was correctly marked wrong.
- **The math:** the lab's running count, the identity line, the true count, and P(next card is a ten) matched an independent count for 25 cards per rule set. Dealing the whole shoe stops with 1 card left.

## Specific checks

| Check | Result |
|---|---|
| Changing settings mid-mode reshuffles and resets the count | Pass. Shows "Rules changed… count back to 0." Drill shows 0 of 104 after switching to 2 decks. |
| Shoe holds 52 × decks cards; a full shoe counts down to 0 | Pass (drill, all 6) |
| True count uses decks *remaining* | Pass |
| Dealer hits A,6 under H17, stands under S17 | Pass. Fixed-card test (A,6 then a 2) and every dealer hand in play. |
| Surrender only on first two cards, not after a split | Pass |
| Double offered after a split (DAS) | Pass (18 split hands seen in play, plus a fixed-card test) |
| Split aces get one card each | Pass |
| Full table: other players' cards count | Pass |
| Full table: seat first / middle / last | Pass. Sitting first, others still play after you (10 of 12 hands). Sitting last, never (0 of 12). |
| Full table: 1 and 6 other players | Pass |
| 1 deck with 6 other players: no errors | Pass (60 hands per seat position) |
| Quiz test hand 11 vs A | Pass: Double everywhere except 6D-S17 = Hit |
| Quiz test hand A,8 vs 6 | Pass: Stand in 2D-S17 and 6D-S17, Double otherwise |
| Quiz test hand A,7 vs 2 | Pass: Double in 2D-H17 and 6D-H17, Stand otherwise |
| Quiz test hand 17 vs A | Pass: Surrender under H17, Stand under S17 |
| Negative count with the ± button (phone width) | Pass |

## Bugs and issues found

**Bug 1. A blank or non-number count answer crashes on the second count screen.**
Both "Count while playing" and "Full table" use the ids `rc` and `tc`. If both screens are waiting for an answer and you type something that isn't a number (or leave it blank) on the one opened second, the error message code throws `Cannot read properties of undefined (reading 'textContent')`. No message appears, and Check seems to do nothing. Valid answers still work. Cause: `fields[i].input.labels[0]` is undefined because `<label for="rc">` points at the other screen's box. Related: tapping the "Running count" label on that screen focuses the hidden box. Fix: give each screen its own ids (e.g. a prefix per mode), or build the message without `labels[0]`.

**Issue 2. True count is graded on exact decks left, but the screen shows decks left rounded to the nearest half deck.**
The game marks a true count right if it's within 0.5 of running count ÷ *exact* decks left. The only decks-left figure on screen is "About X of N decks left", rounded to 0.5. A player who divides by that number and rounds would be marked wrong in **248 of 692** checks: 193 in 1-deck games, 48 in 2-deck, 7 in 6-deck. Example (2D-H17): running −4, screen shows about 1.0 deck, so the player answers −4. The game wants −3.35 (1.19 decks actually left), so −4 is marked wrong. Possible fixes: show decks left to 0.1 (or cards left) in 1- and 2-deck games, or also accept the answer computed from the number shown.

**Note 3.** At less than half a deck left in single-deck, true counts get very large (for example +12 with 0.33 decks left). That's correct math, but it may confuse beginners. Optional.

## What still needs a person

- **Real iPhone (Safari), on the live link:** https://fboesch11.github.io/blackjack-card-counter/blackjack-trainer.html
  - Count drill with "Also ask the true count" on: type a negative count with the ± button, then press Check.
  - The number pad from PR #12: running count opens digits, true count opens decimals.
  - Airplane mode after the page has loaded: the game should keep working.
- **A downloaded copy opened offline on the phone.** Only desktop Chrome was tested offline from disk.
