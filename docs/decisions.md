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
| 2026-11-09 | Add a 5th mode, Full table: 1–6 other players using basic strategy, user picks seat | Faith |
| 2026-11-09 | If the shoe runs out mid-round, reshuffle the discards (table cards stay out) and restart the count at 0 | Claude (Faith's agent), from Jenna's agent's bug report |
| 2026-11-09 | Chart source shown as a link is fine; the game must not depend on it | Faith |
| 2026-11-10 | True count feedback shows one decimal; an answer is right if it rounds to the same whole number | Faith |
| 2026-11-10 | New tab 'Bet the count': bankroll session vs bots, no in-game hints, blunder summary at the end; The math stays the last tab | Faith |
| 2026-11-10 | Betting blunders: raising below TC +1, staying at the minimum at TC +2 or more, betting over 25% of bankroll (25% and the suggested ramp are this game's own rules) | Claude (Faith's agent), proposed |
| 2026-11-10 | Other players sometimes get a close call wrong (each bot 5–30% of close calls; never obvious hands) | Faith |
| 2026-11-10 | Rename Full table to Full table practice; every tab except Learn to play shows the game first and instructions below | Faith |
| 2026-11-11 | Insurance offered in all table modes (dealer ace, half the bet, pays 2:1). Basic strategy: never. Bet the count grades it by the +3 index with six decks only; 1-2 decks show its exact value, ungraded | Faith (feature); Claude (Faith's agent) + Jenna's agent (6-deck-only grading) |
| 2026-11-11 | A rules change during a Bet the count hand ends the session; the unsettled hand is called off | Claude (Faith's agent), proposed |
