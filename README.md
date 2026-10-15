# Mock Draft 2027

A front-office draft room for the real 2027 NFL draft: a big board, player pages, your own board, all 32 teams, a full 7-round mock draft with trades, and hundreds of simulated drafts. Built on free, open data. Owner: Raichel (`cnbville`).

This is its own project. It shares no code with AFM.

## Open it

You need Node 18 or newer. No install step.

```
npm start
```

Then open http://localhost:8027. A hosted copy built on 2026-10-15 is at https://claude.ai/artifact/XinfSbHy74ECMWWmmnfSSt (private, and it goes away when the old Claude account closes; the repo is the lasting copy). Your board, notes and grades are saved in that browser; use **My board → Export** to keep a copy.

## What's in it

- **Big board**: 700 players, with each public board's rank, the consensus, the draft model's rank, the chance each underclassman declares, and the mock draft range once the simulations have run (100 run on first load).
- **Player pages**: bio, college stats by season, stat-based trait estimates (labelled "from stats, not film") with a box for your own grade, size percentiles, an athletic score from combine numbers you type in, five past-player comparisons, risk flags, injury and character reports you add with a link, notes, and what players taken around his projected pick became.
- **My board**: drag to rank, tier breaks, the places you disagree most with the consensus, export and import.
- **Teams**: the projected 2027 order (2026 season so far plus 2,000 simulations of the rest), every team's 2027 picks after trades, needs, estimated cap space and draft habits.
- **Mock draft**: pick for any teams; the AI picks for the rest. Trades up and down (you can offer trades too), reaches, position runs, class grades, steals and reaches, and the undrafted free agent rush.
- **Simulations**: run 100-1,000 drafts for each player's range and each team's likely first pick.
- **Model and data**: how well the draft model predicts held-out drafts, the pick value chart, hit rates by pick, and every AI setting.

## Docs

- `docs/plan.md`: the plan, every choice Claude made for Raichel to confirm, and what comes next.
- `docs/model-report.md`: the draft model's test results.
- `docs/data.md`: data sources, how they're joined, and known gaps.

## Rebuild the data

Python 3.11+ with pandas, numpy, scikit-learn, scipy and pyarrow.

```
python3 pipeline/fetch.py            # downloads about 550 MB into raw/ (not in git)
python3 pipeline/run_all.py          # about 2 minutes; writes app/data/
```

During the season, `python3 pipeline/fetch.py --fresh` re-downloads only what changes each week (2026 college stats and rosters, NFL games, rosters and snaps). The public boards are copied by hand into `data/boards/` (see `docs/data.md`).

## Tests

```
npm test                                 # the mock draft engine
python3 -m unittest discover tests       # the built data
```
