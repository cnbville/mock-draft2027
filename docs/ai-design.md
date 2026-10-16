# The draft and trade AI

Built 2026-10-16 on branch `claude/project-thread-sz8qog` from the plan Raichel approved ("Yes, all of it").
Offer tuning (Raichel chose "Tune offers first") is on branch `claude/draft-ai-tuning-im3eho`, 2026-10-16.
Merged to main 2026-10-17 on Raichel's OK. It does not yet meet every backtest target (below).

## How a team picks
- `app/js/ai/model.js` scores every player for the team on the clock. The score combines:
  - Talent (log of public board rank) and position, by round, with extra round-1 terms.
  - Need facts per position: pay, pedigree, snaps, age, expiring deals, depth, recent picks and QB play.
  - Scheme fit and the draft lead's own history (positions, testing, age, size, Power 4 and Senior Bowl leanings).
  - Testing, level, all-star games, the model's gap to the board, board disagreement, a hot seat and a new GM.
  - Runs and scarcity at a position.
- The weights are fitted on real drafts (`tools/fit_pick_model.mjs`, a conditional logit). Training uses 2020, 2023 and the first 64 picks of 2021, since the 2021 board stops at 130. Testing uses 2024-2026.
  - Held-out log-likelihood per pick: -4.218 with every feature, against -4.310 for board and position only (computed).
- Each simulated draft adds three layers of noise: the league's view of a player, each team's own view, and the call on the day. The day's noise is halved in rounds 2-3 (`TUNING.noise.day`, tuned), which cut the big reaches and falls without narrowing round 1's ranges.
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
| R1 players hit, one sim | 27+ | 24.0 | 22.1 | 23.8 |
| R1 players hit, most likely mock | 27+ | 28 | 24 | 27 |
| Right team, most likely mock | 5+ | 2 | 5 | 2 |
| Huddle score, most likely mock | about 40 | 32 | 34 | 31 |
| Real pick inside the AI's 80% range (R1) | 80% | 84% | 75% | 81% |
| Trades per draft (real) | close | 34.3 (29) | 35.6 (35) | 33.0 (42) |
| QB picks ahead of board, total slots (real) | close | 3 (14) | 24 (27) | 27 (26) |
| Specialists drafted (real) | 3-4 | 4.6 (4) | 2.2 (4) | 2.4 (3) |
| IOL in round 1 (real) | close | 1.7 (2) | 0.6 (3) | 1.2 (2) |
| Reaches / falls of 30+ spots (real) | close | 24 / 6.0 (19 / 2) | 24 / 7.3 (19 / 5) | 27 / 7.2 (24 / 4) |

Before the tuning, reaches / falls were 28 / 7, 27 / 8 and 30 / 8, and trades 35.9, 37.9 and 33.9 (computed). The table used to say "20+ spots", but the backtest counts 30+ (top-100 picks taken 30+ slots ahead of the board; top-50 players who fell 30+).

Public consensus mocks, scored the same way and made with draft-week reporting: 25-28 R1 hits, 4-11 right teams, Huddle 34-50 (computed from the copied mocks).

Offers test: every real draft-day trade is put to the AI both ways, then again 15% short (40 seeds). The offer settings were tuned on 2020-2023 and checked on 2024-2026.

| | 2024 | 2025 | 2026 | Before tuning |
|---|---|---|---|---|
| You move up with the real package: accepted / countered | 25 / 3 of 28 | 24 / 9 of 33 | 32 / 7 of 39 | 69% accepted |
| Same, 15% short: accepted | 9 | 4 | 7 | 24% |
| You move down for the real package: accepted / countered | 11.0 / 17.0 | 21.9 / 11.1 | 27.2 / 11.9 | 20% accepted |
| Same, 15% short: accepted | 3.0 | 8.5 | 3.1 | 5% |

By round (2024-2026, computed):

| | Rounds 1-3 (52 trades) | Rounds 4-7 (48 trades) |
|---|---|---|
| You move up: real accepted / 15% short accepted | 90% / 10% | 71% / 31% |
| You move down: real accepted / 15% short accepted | 68% / 3% | 51% / 27% |

On 2020-2023 (the tuning years): rounds 1-3 91% / 7% and 82% / 7%; rounds 4-7 62% / 26% and 52% / 24%.

Why day 3 can't refuse lowballs the way rounds 1-3 do (computed from real 2011-2026 trade prices on the market chart): in rounds 1-3 real prices sit within about 8% of the chart, so a 15% short offer is clearly below any real price. On day 3 they scatter from 0.9 to 1.25+ of the chart, and the buyer often throws in a late pick worth more than the gap. A 15% short version of such a trade is still at or above the going price. Even a GM who knew the market chart exactly would accept about 1 in 4 of those 15% short offers to keep 3 in 4 real deals. Tightening further costs real deals about one for one.

What changed (`TUNING.trades`, your offers only; the AI-to-AI market is untouched):
- `callPremium`: when you call to move up, the team wasn't shopping its pick. It takes no deep-tier discount, and its ask moves by this share of its pick's value: -8% in rounds 1-3, 0 on day 3. Its own ask runs a little above real prices (margin plus love for its player), so it gives a bit back in rounds 1-3.
- `fairBuy` and `fairRisk`: when you call to move back, a team with a player it likes at risk pays up to its chart gap plus 8% of your pick's value (16% on day 3), scaled by how likely its player is gone by its own pick (full at a 5% risk).
- `noise.day`: [1, 0.5, 0.5, 1, 1, 1, 1].
- `dealRate` for rounds 2-3 lowered (0.21 to 0.09, 0.145 to 0.06), because the calmer noise made more deals workable there. Trade counts stayed where they were.

## Where it falls short
- Team matches: the AI rarely puts the right player with the right team. Its need signal is weak next to the visits and medicals real teams act on.
- Reaches and falls: down 3-4 and 1 a draft, but still above real drafts. The rest seems to come from the pick model, not the noise: narrowing the noise further drops round 1's 80% ranges below 80%.
- Day-3 lowballs: see above. Rounds 1-3 now refuse them about 9 in 10 times.
- 2022 has no usable public board, and 2021's covers only the top 130.
- `npm test`: 9 of 10 pass. The simulation test fails because a kicker (board rank 457) went in round 1 in 1 of 40 sims. It already failed on the branch before this tuning (checked with the old code), so it isn't caused by it. Not fixed yet.

## Choices made overnight without Raichel (2026-10-16, Raichel asked not to stop for questions)
- Kept real deals over refusing day-3 lowballs: day 3 accepts about 1 in 4 lowballs so it can take about 2 in 3 real deals.
- Tuned the offers on 2020-2023 and kept 2024-2026 as the check, so the reported numbers aren't fitted to the same drafts.
- Narrowed the spread only in rounds 2-3, since round 1's ranges were already on target.
- Left the kicker test failure for a separate fix.
