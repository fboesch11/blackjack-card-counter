# Blackjack Card Counting Trainer

A blackjack game that teaches someone with no experience how to play, how to use basic strategy, and how to count cards with the Hi-Lo system. It's a math and thinking exercise, not a gambling tool.

Final class project, built by two Claude agents working for Faith (`fboesch11`) and Jenna (`jennagarner26`), coordinated through this repo and a shared Google Sheet log.

## Play it

**Online (any browser, including iPhone):** https://fboesch11.github.io/blackjack-card-counter/blackjack-trainer.html

**Offline:** download **`blackjack-trainer.html`** and open it in any browser. It's one self-contained file that works offline with nothing to install.

## Modes

1. **Learn to Play**: normal blackjack with hints explaining each option.
2. **Basic Strategy Quiz**: pick the right action for a hand, then see the correct play and why.
3. **Count Drill**: cards flip one at a time, and you're asked for the running count at random points.
4. **Count While Playing**: a full game that stops to check your running count and true count.
5. **Full Table Practice**: 1–6 other players (who sometimes miss a close call) share the table. You count every card and choose your seat.
6. **Bet the Count**: a bankroll session against the dealer. Raise your bets when the count favors you; no hints during play, then a summary of every betting and strategy blunder.
7. **The Math**: the set theory and probability behind counting, with interactive labs.

## Settings (available in every mode)

| Setting | Options |
|---|---|
| Decks | 1, 2, or 6 |
| Dealer soft 17 | Hits (H17) or Stands (S17) |
| Double after split | Always allowed |
| Surrender | Always allowed (late surrender) |
| Blackjack pays | 3:2 |
| Count system | Hi-Lo: 2–6 = +1, 7–9 = 0, 10/J/Q/K/A = −1 |

## Repo layout

```
blackjack-trainer.html   built game: the file you open and submit (generated, don't edit by hand)
build.py                 combines src/ + data/ into blackjack-trainer.html
src/                     game code (HTML template, CSS, JavaScript)
data/strategy/           6 basic strategy charts, one CSV per rule set, each with its source
data/text/               beginner explanation text
tests/                   automated checks (run: node --test tests/*.test.js)
docs/decisions.md        decisions log (mirrors the Google Sheet Log)
docs/test-plan.md        manual test checklist: 6 rule sets x 4 modes
```

## Building

```
python3 build.py
```

`build.py` refuses to build if a strategy chart is incomplete or missing its source line.

## How we work

- One branch per task, named `<owner>/<task>` (e.g. `claude/game-engine`, `jenna/strategy-charts`).
- Every change goes through a pull request, reviewed and approved by the **other** agent. Nobody merges their own PR.
- `main` must always build and pass tests.
- Any PR that changes `src/` or `data/` also commits the rebuilt `blackjack-trainer.html` (`python3 build.py --strict`), so `main` never ships a stale game file.
- Every PR is linked in the Google Sheet Log.
