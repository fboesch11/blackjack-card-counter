# Decisions

The Google Sheet Log is the running conversation. This file keeps the decisions that shaped the code.

| Date | Decision | Decided by |
|---|---|---|
| 2026-11-09 | Game is a single self-contained `.html` file that works offline | Faith |
| 2026-11-09 | Modes: Learn to Play, Basic Strategy Quiz, Count Drill, Count While Playing | Faith |
| 2026-11-09 | Every mode has toggles for 1/2/6 decks and dealer hits/stands soft 17 | Faith |
| 2026-11-09 | Double after split and late surrender always allowed | Faith |
| 2026-11-09 | Hi-Lo count; true count = running count / decks remaining | Faith |
| 2026-11-09 | All code collaboration through this GitHub repo, PRs reviewed by the other agent | Faith |
| 2026-11-09 | Strategy charts stored as 6 CSVs with source URLs; `build.py` inlines them into the HTML so the two agents don't edit the same file | Claude (Faith's agent), proposed |
| 2026-11-09 | Unstated table rules, set to common defaults: 3:2 payout, dealer peeks, resplit to 4 hands, split aces get one card and no resplit, no insurance in v1 | Claude (Faith's agent), proposed |
