# The draft and trade AI

Built 2026-10-16 on branch `claude/project-thread-sz8qog` from the plan Raichel approved ("Yes, all of it").
Not merged: it does not yet meet every backtest target (below).

## How a team picks
- `app/js/ai/model.js` scores every player for the team on the clock. The score combines:
  - Talent (log of public board rank) and position, by round, with extra round-1 terms.
  - Need facts per position: pay, pedigree, snaps, age, expiring deals, depth, recent picks and QB play.
  - Scheme fit and the draft lead's own history (positions, testing, age, size, Power 4 and Senior Bowl leanings).
  - Testing, level, all-star games, the model's gap to the board, board disagreement, a hot seat and a new GM.
  - Runs and scarcity at a position.
- The weights are fitted on real drafts (`tools/fit_pick_model.mjs`, a conditional logit). Training uses 2020, 2023 and the first 64 picks of 2021, since the 2021 board stops at 130. Testing uses 2024-2026.
  - Held-out log-likelihood per pick: -4.218 with every feature, against -4.310 for board and position only (computed).
- Each simulated draft adds three layers of noise: the league's view of a player, each team's own view, and the call on the day.
- Public medical and character flags are in the data but carry no weight (estimated). The fit gave them the wrong sign: about 22 flagged players a year is too few, and the public board already prices most flags.

## How trades work
- `app/js/ai/market.js` and `trades.js`.
- Every team values picks on a chart fitted to 353 real draft-day trades 2011-2023 (computed; 10-90% of real prices 0.91-1.14 of the chart). Each team's GM slants that chart. 2028 picks count at 0.47 of a pick at their likely slot.
- A buyer moves up when the player it wants will probably be gone by its own pick. It pays at most what it expects to gain, times a round factor fitted to real counts (teams overrate the right to choose; Massey and Thaler 2013).
- The seller asks the chart gap, plus more if it loves its player, or less if its tier is deep.
- Veterans are traded for picks about twice a draft.
- Your offers (`offers.js`) get the same judgement, plus:
  - counteroffers and plain reasons;
  - a memory of lowballs: three in a round and that team stops taking calls;
  - the clock: about a minute per offer, and buyers offer less as your time runs out;
  - incoming calls from teams that want your pick or want to move back to it.

## Backtest, 2024-2026 drafts (computed, 200 sims each; `node tools/backtest.mjs`)

| Check | Target (proposed) | 2024 | 2025 | 2026 |
|---|---|---|---|---|
| R1 players hit, one sim | 27+ | 24.0 | 21.9 | 23.7 |
| R1 players hit, most likely mock | 27+ | 28 | 24 | 27 |
| Right team, most likely mock | 5+ | 2 | 5 | 2 |
| Huddle score, most likely mock | about 40 | 32 | 34 | 31 |
| Real pick inside the AI's 80% range (R1) | 80% | 84% | 78% | 81% |
| Trades per draft (real) | close | 35.9 (29) | 37.9 (35) | 33.9 (42) |
| QB picks ahead of board, total slots (real) | close | 3 (14) | 22 (27) | 27 (26) |
| Specialists drafted (real) | 3-4 | 4.8 (4) | 2.4 (4) | 2.5 (3) |
| IOL in round 1 (real) | close | 1.7 (2) | 0.6 (3) | 1.3 (2) |
| Reaches / falls of 20+ spots (real) | close | 28 / 7 (19 / 2) | 27 / 8 (19 / 5) | 30 / 8 (24 / 4) |

Public consensus mocks, scored the same way and made with draft-week reporting: 25-28 R1 hits, 4-11 right teams, Huddle 34-50 (computed from the copied mocks).

Offers test: every real draft-day trade is put to the AI both ways, then again 15% short (40 seeds).

| | 2024 | 2025 | 2026 |
|---|---|---|---|
| You move up with the real package: accepted / countered | 20 / 8 of 28 | 23 / 10 of 33 | 26 / 13 of 39 |
| Same, 15% short: accepted | 8.8 | 5.0 | 9.9 |
| You move down for the real package: accepted / countered | 4.4 / 23.6 | 8.2 / 25.0 | 7.0 / 32.1 |
| Same, 15% short: accepted | 2.2 | 2.3 | 0.3 |

## Where it falls short
- Team matches: the AI rarely puts the right player with the right team. Its need signal is weak next to the visits and medicals real teams act on.
- One sim spreads a little too wide: more 20-spot reaches and falls than real drafts.
- When you move up, the AI as seller accepts a lowball 15% short about a quarter of the time. When you move down, it as buyer rarely accepts the real price outright, but almost always counters.
- 2022 has no usable public board, and 2021's covers only the top 130.

## Next: tuning (Raichel chose "Tune offers first", 2026-10-16)
Nothing is tuned yet. The plan:
- Lowballs when you move up: this is the AI's "down" branch in `judge()` (offers.js), which prices with `sellerAsk` (market.js) and a margin. The margin is too small to refuse a 15% short offer.
- Real prices when you move down: this is the "up" branch, `buyerMax × (1 − 0.25 × pressure)`. The ceiling is too low, so the AI counters instead of accepting.
- Spread: the noise in TUNING.noise drives it. Narrow it, but keep the 80% ranges near 80%.
- `sellerAsk` and `buyerMax` also drive the AI-to-AI trades, so trade counts and prices must stay near real.
- Handoff notes: /mnt/project-files/draft-room/ai-tuning-handoff.md (project folder).
