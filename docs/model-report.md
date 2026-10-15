# Draft position model: report

Built by `pipeline/model.py`. Trained on the 2017-2023 drafts (26122 players who left college), tested on the 2024-2026 drafts it never saw (15505 players).

What it predicts: the chance a player is drafted, and if drafted, how early. It uses only what the free data has: position, size, play-level stats (no tackles, pressures or snaps), shares of team output, opponent strength, level, team strength and how many seasons he was on a roster.

## Results on the held-out drafts (computed)

- Drafted or not, ranking quality (AUC, 0.5 = coin flip, 1 = perfect): **0.941**.
- Among drafted players, rank agreement between predicted and real pick (Spearman): **0.363**.
- The model's top 100 each year, and how many went in the top 100 / were drafted at all:

| Draft | Top-100 picks | Drafted |
|---|---|---|
| 2024 | 46 | 80 |
| 2025 | 44 | 79 |
| 2026 | 47 | 70 |

Drafted-or-not AUC by position group (low numbers mean the free stats say little about that position):

| Group | Drafted in test | AUC |
|---|---|---|
| QB | 35 | 0.977 |
| RB | 56 | 0.989 |
| WR | 103 | 0.980 |
| TE | 50 | 0.978 |
| OT | 92 | 0.753 |
| IOL | 42 | 0.804 |
| EDGE | 105 | 0.943 |
| DT | 37 | 0.934 |
| LB | 75 | 0.950 |
| CB | 91 | 0.908 |
| S | 55 | 0.953 |
| K | 6 | 0.932 |
| P | 4 | 0.842 |
| LS | 1 | 0.545 |

## What this means

- The model is a second opinion, mainly useful below the public boards' top 150, where it fills out a 257-pick draft.
- Offensive linemen have no stats at all in the free data (only size, team and level), so their AUC is the lowest and the public boards carry them.
- The match between college rosters and the draft list is 82-99% per year (lower before 2019); unmatched picks count as undrafted in training, which makes the model a little too pessimistic for those years.
