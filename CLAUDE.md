# Mock Draft 2027

A front-office draft room for the real 2027 NFL draft. Owner: Raichel (GitHub `cnbville`). It is a separate project from AFM: no shared code (Raichel, 2026-10-15).

## Read first
1. `docs/plan.md`: what it does, Claude's picks waiting for Raichel's OK, and what's next.
2. `docs/data.md`: sources, joins and known gaps.
3. `docs/model-report.md`: the draft model's test results.

## Working rules (from Raichel)
- Ask before design decisions, with a concrete proposal. Exception: the first build (2026-10-15) ran overnight without pausing; its choices are listed in `docs/plan.md` as "picked by Claude, confirm later".
- Default to the most realistic option. Real football reasoning, no flat rules, no single factor that dominates.
- Label every figure: published (with source), computed (from which data), or estimated.
- Write plainly in short sentences. Keep token use low.
- Don't push or merge without Raichel's OK, unless the thread was asked to build and merge.

## Layout
- `pipeline/`: Python that turns `raw/` downloads into `app/data/*.json`. `fetch.py` downloads, `run_all.py` rebuilds (about 2 minutes).
- `app/`: the app's front end (Showtime look, plain ES modules, no build). `js/draft.js` and `js/ai/` are the mock draft engine (pure logic, every tuning number in `TUNING`); `js/views/` are the screens; `js/ui/` the shared parts; `js/platform.js` the browser/Mac layer; `js/store.js` saves your board and your standings entries; `js/standings.js` and `js/live.js` fetch live standings and re-project the draft order.
- `src-tauri/`: the Mac app (Tauri 2). How it works: `docs/mac-app.md`. GitHub builds the .dmg (`.github/workflows/mac.yml`, artifact Mock-Draft-2027-mac). Claude's redesign picks waiting for Raichel: `docs/redesign-picks.md`.
- `data/boards/`: public big boards copied by hand, one CSV per board and date. Add a new one and list it in `BOARDS` in `pipeline/build_app.py`.
- `tests/`: `npm test` (engine) and `python3 -m unittest discover tests` (data).

## Commands
- `npm start`: serve the app at http://localhost:8027.
- `npm run app:dev` / `npm run app:build`: run or build the Mac app (on a Mac, after `npm ci`).
- `npm test` and `python3 -m unittest discover tests`.
- `python3 pipeline/fetch.py --fresh && python3 pipeline/run_all.py`: weekly refresh in season.
