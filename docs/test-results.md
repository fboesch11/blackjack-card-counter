# Test results (T6, updated for R2)

Tested by Claude (Jenna's agent), independent of the code's author.

**How:** `tests/browser_check.py` opens `blackjack-trainer.html` from disk in real Chrome with the network off and every request blocked. It plays each tab by clicking through the screens, and checks the game against things the game doesn't compute itself:
- strategy hints, quiz answers and Bet the count strategy grading against `data/strategy/*.csv`, read by the test
- running and true count grading against a Hi-Lo count the test keeps from the cards on screen
- dealer soft 17, surrender, double after split, split aces, Full table seats

Run it with `python3 tests/browser_check.py` (add `--quick` for a short pass). It needs Python Playwright and Chrome. Answer boxes are found by the `[data-count=…]` hooks from PR #14. True count answers follow PR #19's rule: right if it rounds to the same whole number.

**Build tested:** main at `42a4d9a` (after PR #21), footer version `8052b29`, on 2026-11-11.

## Setup

| Check | Result |
|---|---|
| `python3 build.py --strict` succeeds; committed HTML matches a fresh build | Pass |
| `node --test tests/*.test.js` | Pass (26/26) |
| Opens from disk with the network off, desktop Chrome | Pass. No network requests attempted. |
| Phone width (375 px, touch, Chrome emulation): no sideways scrolling | Pass, every tab |
| Real iPhone (live site): layout and number pad | Pass. Tested by Faith on her iPhone, 2026-11-11 (Log, 8:09 PM). |

## Every tab × every rule set

| Tab | 1D-H17 | 1D-S17 | 2D-H17 | 2D-S17 | 6D-H17 | 6D-S17 |
|---|---|---|---|---|---|---|
| Learn to play | Pass | Pass | Pass | Pass | Pass | Pass |
| Strategy quiz | Pass | Pass | Pass | Pass | Pass | Pass |
| Count drill | Pass | Pass | Pass | Pass | Pass | Pass |
| Count while playing | Pass\* | Pass\* | Pass\* | Pass\* | Pass\* | Pass\* |
| Full table practice | Pass\* | Pass\* | Pass\* | Pass\* | Pass\* | Pass\* |
| Bet the count | Pass† | Pass† | Pass† | Pass† | Pass† | Pass† |
| The math (lab) | Pass | Pass | Pass | Pass | Pass | Pass |

\* Grading is correct, but see Issue 2 (decks left shown to the nearest half deck).
† Strategy grading and the final count check are correct, but see Issue 1 (shuffle after the bet).

What each cell covered (40 hands, 150 quiz questions, or a 60-hand session per rule set):
- **Learn to play:** 316 "What should I do?" hints all matched the chart. The coach's right/wrong feedback was correct after every move, including deliberate wrong moves.
- **Strategy quiz:** 920 answers. The game's correct play matched the chart every time, and "Correct" / "Not quite" was right every time.
- **Count drill:** a full shoe for each rule set (52, 104, 312 cards) with true count on. All 88 checks were graded correctly, and every shoe ended at 0.
- **Count while playing / Full table practice:** 740 count checks, all graded correctly. Answering running ÷ decks *selected* was correctly marked wrong.
- **Bet the count:** 376 hands played by the book (basic strategy, minimum below +1, 2+ units at +2 and up). The summary reported every decision as matching basic strategy, accepted the final running count, and flagged no betting blunders, except the ones described in Issue 1.
- **The math:** the lab's running count, identity line, true count, and P(next card is a ten) matched an independent count for 25 cards per rule set. Dealing the whole shoe stops with 1 card left.

## Specific checks

| Check | Result |
|---|---|
| Changing settings mid-tab reshuffles and resets the count | Pass |
| Shoe holds 52 × decks cards; a full shoe counts to 0 | Pass (drill, all 6) |
| True count uses decks *remaining* | Pass |
| Dealer hits A,6 under H17, stands under S17 | Pass. Fixed-card test, plus every dealer hand in play. |
| Surrender only on first two cards, not after a split | Pass |
| Double offered after a split (DAS) | Pass (40 split hands seen in play, plus a fixed-card test) |
| Split aces get one card each | Pass |
| Full table: other players' cards count | Pass |
| Full table: seat first / middle / last | Pass. Sitting first, others still play after you (11 of 12 hands). Sitting last, never (0 of 12). |
| Full table: 1 and 6 other players, 1 deck, no errors | Pass |
| Blank or non-number count answer shows a message (both count screens asking at once) | Pass. The earlier crash is fixed by PR #14. |
| Negative count with the ± button (phone width) | Pass |
| Quiz test hands: 11 vs A, A,8 vs 6, A,7 vs 2, 17 vs A | Pass, all 6 rule sets |

## Open issues

**Issue 1. Bet the count: bets placed right before a shuffle are graded against a fresh shoe.** The cut-card shuffle happens after the player confirms the bet, and the hand records the true count after the count resets to 0. In testing, 28 of 101 correct raises (2+ units at TC +2 or more) were flagged "Raised with no edge" for this reason, mostly in 1- and 2-deck games. Real tables shuffle before bets go out. Fix: shuffle when the previous round settles, so the player bets knowing the count is 0. Details are in the review on PR #20.

**Issue 2. True count is graded on exact decks left, but the screen shows decks left to the nearest half deck.** A player who divides by the "About X decks left" number would be graded wrong in 225 of 688 checks: 179 in 1-deck, 35 in 2-deck, 11 in 6-deck. PR #19's rounding rule didn't change this. Fix: show decks left to 0.1 (or cards left) in 1- and 2-deck games.

**Fixed since the first test pass:** the crash on a blank or non-number answer when both count screens were asking (PR #14).

## Not covered

- A downloaded copy opened offline on a phone. Only desktop Chrome was tested offline from disk; the iPhone check used the live site.
- Insurance and index plays (F1, F2): not on main yet. The tester will be updated when they land.
