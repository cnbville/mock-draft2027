# Needs model

Computed by `pipeline/needs_model.py`. Fitted on every pick of the 2015-2023 drafts and tested on 2024-2026.

| Held-out check (2024-2026) | Value |
|---|---|
| Picks tested | 770 |
| Log-likelihood per pick, with needs | -2.348 |
| Same, group base rates only | -2.385 |
| Rounds 1-2: real pick was one of the team's top-3 needs | 27% (chance about 23%) |

Weights per round bucket (standardised features; positive = more likely to draft the group):

| Feature | Rounds 1-2 | Rounds 3-4 | Rounds 5-7 |
|---|---|---|---|
| pay | +0.03 | +0.01 | -0.00 |
| ped | -0.14 | -0.12 | -0.02 |
| snap | -0.20 | -0.09 | -0.04 |
| snap_prev | -0.03 | -0.04 | +0.07 |
| old | +0.02 | +0.17 | -0.06 |
| exp_now | +0.13 | +0.04 | +0.07 |
| exp_next | +0.03 | +0.02 | +0.04 |
| depth | +0.02 | -0.15 | +0.02 |
| open | -0.10 | -0.10 | +0.10 |
| invest | -0.15 | -0.11 | -0.04 |
| prod | -0.18 | -0.07 | +0.06 |
| taken | -0.97 | -0.58 | -0.34 |
