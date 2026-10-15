# Mock Draft 2027: the plan

A front-office draft room for the real 2027 NFL draft. It is its own project, fully separate from AFM (Raichel, 2026-10-15). It shares no code with AFM.

Written 2026-10-15, built the same night (see "Build status" at the end). Raichel asked for the build to start straight away and not pause for decisions. So every open choice below was **picked by Claude, confirm later**. Each one says what was picked and why. Change any of them and the build follows.

How figures are labelled:
- **Published**: a real figure, with its source.
- **Computed**: computed here from real data (named).
- **Estimated**: Claude's guess, to be checked.

## 1. What it does

1. **Prospect pool.** Every real college player who can enter the 2027 draft, with a profile page.
2. **Scouting.** Stats by season, stats adjusted for context, stat-based trait estimates, size scores (athletic scores once the combine is in), past-player comparisons, risk flags.
3. **Prediction.** A model trained on past drafts: where a player is likely to go, and what players drafted there became (bust, backup, starter, good starter, Pro Bowl level).
4. **Pick value.** A value for every pick, computed from what real picks produced, next to the classic Jimmy Johnson chart.
5. **Your board.** Your own ranking, tiers, notes and trait grades, next to three public boards and the model's board. Saved in the browser, exportable to a file.
6. **Teams.** All 32 teams with roster holes, cap commitments, their real 2027 picks (with trades) and a projected draft order from the 2026 season so far.
7. **Draft day.** A full 7-round mock. You pick for any team; the AI picks for the rest using needs, position value, its own board, its draft habits and some chance of a reach. Trades up and down, a live board, position runs, and the undrafted free agent rush.
8. **Many drafts.** Run hundreds of mocks at once to see each prospect's range and likely teams.

Later (planned, not in tonight's build): class grades after the real draft, results tracking over the years, and your scouting accuracy.

## 2. Data sources (honest)

All free and open. What tonight's network allowed is noted.

| What | Source | Notes |
|---|---|---|
| College play-by-play player stats 2013-2026 (passes, targets, catches, rushes, sacks, interceptions, breakups, forced fumbles, kicks) | cfbfastR-data on GitHub (built from CFBD and ESPN) | Updated weekly in season. **No tackles, pressures or snaps**, so linemen and linebackers have thin stats. |
| College rosters 2013-2026 (position, class, height, weight, hometown, photo link) | cfbfastR-data | Class year comes from ESPN. Listed heights and weights are the school's. |
| College schedules and team strength (Elo) | cfbfastR-data | Used for opponent strength. |
| Past drafts 1980-2026 with careers (seasons started, Pro Bowls, All-Pro, career value) | nflverse `draft_picks` | Career value is Pro Football Reference's "Approximate Value" (AV). |
| Combine 2000-2026 | nflverse `combine` | For percentiles and comparisons. |
| NFL rosters, snaps and contracts | nflverse (contracts from OverTheCap) | Cap numbers are estimated from contract averages. |
| NFL 2026 games and results, pick trades | nflverse `nfldata` | Trades are listed up to April 2026. |
| Public big boards | PFF (2026-04-28, top 150), CBS Sports Mike Renner (2026-10-14, top 150), NFL Draft Buzz (fetched 2026-10-15, top 100) | Copied from the public pages by a summariser; spot-check against the source. |
| College Football Data API directly, PFF grades, film, medicals, interviews, Pro Football Reference pages | **Not available** | The CFBD API and most sports sites were blocked by tonight's network. PFF grades and film are never free. |

## 3. How each part works

### 3.1 The prospect pool
- **Eligible** (published NFL rule): three years out of high school. Picked by Claude: a player is eligible if his 2026 roster class is junior or senior, or he appears on a 2024 roster (so a redshirt sophomore counts).
- Underclassmen are marked "may return to school" until the declare deadline in mid-January (published rule; exact 2027 date to check).
- The pool shown is every board player plus the best of the rest by the model (value times chance to declare), 700 players, filled in real draft proportions per position so the model's weak lineman grades can't flood it.
- **Chance to declare**, picked by Claude (estimated): seniors and fifth-year players 100%; underclassmen by consensus rank: top 32 92%, 33-64 80%, 65-100 60%, 101-150 40%, 151-250 20%, others 10%. Each simulated draft draws who declares.

### 3.2 Context-adjusted stats
From the play-level data, per player season:
- Totals and per-game numbers.
- **Share of team output** ("dominator" style, published concept): his share of team receiving yards and touchdowns, rushing yards, sacks, takeaways.
- **Opponent strength**: his production in each game weighted by the opponent's Elo before the game (computed). Production against good teams counts more.
- **Level**: Power 4, Group of 5 and FCS are kept apart; the model learns how much each level's production is worth from past drafts (computed).
- **Age proxy**: class year. True ages aren't in the data. **Breakout year** (first season above a share threshold) is shown for receivers, backs and tight ends.
- **Games played** by season.

### 3.3 Trait estimates
Each position has the traits a scout grades. Where the stats say something, the trait gets a stat estimate labelled "from stats, not film" (for example: catch rate and yards per target for hands and separation; sack and breakup rates for pass rush and coverage). Traits stats can't see (a lineman's hand use, a corner's hips) show "film only". You fill in your own grade, which replaces the estimate on your board. Claude never invents film grades.

### 3.4 Size and athletic scores
- **Size score** now: height and weight as percentiles at the player's position among combine invitees 2000-2026 (computed).
- **Athletic score** after the combine: a RAS-style score (published concept by Kent Lee Platte, computed our own way): each test as a percentile at his position, averaged. You can type combine and pro day numbers into a player's page and the score updates.

### 3.5 Comparisons
Each prospect is matched to past drafted players (2014-2026) at the same position with the closest size, production shares, level and class. The page shows the five closest and what they became. A comparison is a range of outcomes, not one name.

### 3.6 Risk flags
Computed from the data: low games played in a season (could be injury, suspension or depth; the data can't say which), one-year production, small sample, a move between positions, a move between levels, an older class. Character and injury reports are **not** auto-filled: you can add them by hand with a link. Missing info shows as "no public reports in this tool", never as clean.

### 3.7 The draft position model
- Trained on the 2015-2026 drafts (computed): every player in his last college season, drafted or not. It learns what got players drafted and how early: position, production shares, opponent strength, level, team strength, size, class, and how many productive seasons.
- Gives each prospect a chance of being drafted and an expected pick.
- Tested on drafts it didn't see (trained on 2017-2023, tested on 2024-2026): drafted-or-not AUC 0.94, but only 0.36 rank agreement on where drafted players went, and 0.74 for tackles (no lineman stats). It is a second opinion; the boards lead. Details in `docs/model-report.md`.

### 3.8 The hit-rate model
- Built on the 2000-2021 drafts (computed; later drafts are too recent to judge careers).
- Outcomes, picked by Claude: **bust** (0 seasons as a primary starter), **backup** (1-2), **starter** (3-4), **good starter** (5+), **Pro Bowl level** (at least one Pro Bowl or All-Pro). Seasons started is Pro Football Reference's count.
- Chances are smoothed by pick and position group, so "an edge rusher taken around pick 20" has its own numbers.

### 3.9 Pick value chart
- **Computed:** the average career value (AV) each pick produced 2000-2019, smoothed and forced to fall pick by pick, scaled so pick 1 = 3000 points. It is much flatter than the old chart: pick 32 is worth 57% of pick 1 (Jimmy Johnson: 20%).
- Shown next to the Jimmy Johnson chart (published in the 1990s; the version here is an approximation, to check).
- Future-year picks: worth about one round less (published rule of thumb).

### 3.10 Teams, picks and order
- **Draft order**: the 2026 season so far plus the rest simulated 2,000 times from each team's point margin so far, blended with last season (computed). Non-playoff teams pick 1-18 by record; playoff teams 19-32 by how far they go. The page shows each team's likely range.
- **Pick ownership**: each team's own seven picks, moved by the listed trades. Where a team gave a pick in a round it held twice, the trade data doesn't say which; a small hand table fixes known cases (marked "from memory, check").
- **Compensatory picks** (rounds 3-7) are announced in March and aren't modelled yet; the draft has 224 picks plus a placeholder count of 33 compensatory picks spread across rounds 3-7 at the end of each round (estimated) so it reaches the usual 257.
- **Needs**: for each position group, the team's current starters by 2026 snaps, how good they look (pay as a share of the cap and draft pick spent on them), their age and whether their contract ends after 2026 (computed, estimated weights).
- **Cap**: 2027 commitments from active contracts, estimated from contract averages. Real cap sheets differ.

### 3.11 The AI teams on draft day
Each pick weighs, picked by Claude:
- **Board value**: the consensus of the three public boards (average rank, weighted to the newest; a player missing from a board counts as 30 past its end), 80% consensus and 20% model for board players, the model alone (discounted) for the rest. Each team's grades then spread players apart more than the flat value chart (power 1.6) and add their own noise (each team's board differs, as real boards do).
- **Position value**: how early each position goes in real drafts 2000-2026 compared with board rank (computed). A QB or edge rusher gets a premium, a running back or safety a discount.
- **Need**: bigger at the top of a team's needs, fading in later rounds.
- **Team habits**: each team's own position habits and trade rate from its last five drafts, blended with the league average (computed). Picked by Claude: team habits, not GM habits, because GM changes aren't in the data.
- **Reaches**: a small chance per pick of taking a player rated lower, more common in later rounds.
- **Trades**: a team trades up when a player it rates far above what it expects at its own pick is about to go, pays the value chart plus 5%, and takes that player. The team on the clock only moves down when its top two are close. A QB-needy team is more eager. Tuned to about 6 trades at first-round picks and 17 in rounds 1-3 per draft; real April trades 2018-2025 averaged 6.1 and 20 (computed from nflverse trades).
- **Runs**: when two players at one position go close together, teams that need that position move it up a little (a real draft-room effect, estimated size).

### 3.12 Your board and the app
A web page, opened from the repo (`npm start` serves it locally; no internet needed except player photos). Your board, notes and grades are saved in the browser and can be exported to a JSON file and imported again.

## 4. Claude's picks (confirm later)

1. Separate project, no AFM code or data. **Picked by Raichel.**
2. Tech: Python scripts build the data; a plain web page (no framework) runs the board and the mock draft in the browser; tests in Python and Node. Simple to open and debug.
3. Eligibility rule in 3.1.
4. Pool size 700, the declare chances in 3.1, and the position quotas.
5. Trait list per position and the stat behind each trait estimate.
6. No auto-filled character or injury notes; hand entry with links only.
7. Hit outcome definitions in 3.8.
8. Our own value chart from career value, with Jimmy Johnson alongside.
9. Team habits instead of GM habits.
10. The consensus: average rank of the three boards, the newest board counted double.
11. AI pick weights and noise sizes (in `app/js/draft.js`, all in one place, labelled estimated): position values (QB 1.18 if needed, EDGE 1.08, OT 1.06 ... RB 0.9), need weight 0.3 in round 1 rising to 0.5, reach chance 4% in round 1 rising to 18%, grade spread 1.6, board noise 0.2.
12. Placeholder compensatory picks.
13. Draft order uses the average projected slot; the mock doesn't yet redraw the order per simulation.
14. Class grades and steals/reaches use each player's rank among the players who entered that mock.
15. Needs weights: 65% pay percentile at the position, 35% draft pedigree, minus age past a decline age per position, minus 0.25 for a contract ending after 2026; kicker and punter needs halved.

## 5. The realism pass (planned next)
Things real draft rooms have that tonight's build leaves for later:
- All-star games (Senior Bowl, East-West Shrine) with weigh-ins and practice notes.
- Top-30 visits and private workouts as events that hint at interest.
- Medicals and re-checks; a failed physical with one team only.
- Smoke screens: fake interest in mocks.
- Scouts and coaches disagreeing on one player.
- Rookie contract value and the fifth-year option in the value chart.
- Late news (an injury at a pro day, an arrest) entered by hand.
- Position projection: a college edge who projects to linebacker, a tackle who moves inside.
- Scheme fit from each team's real play-by-play (personnel, coverage shells).
- After the draft: class grades, then results tracking each year against the experts.

## 6. Known gaps
- No tackles, pressures, snaps or grades in the free data, so linemen and linebackers rely on the boards and size.
- No birth dates for college players.
- The three boards were copied by a summariser; spot-check them.
- Draft order is a projection until January.
- Compensatory picks are placeholders until March.
- Pick ownership comes from trade data that ends in April 2026, plus a small hand table.

## Build status (2026-10-15)

Built tonight and merged to `main`:
- The data pipeline (`pipeline/`), the draft model with its test report, hit rates and the value chart.
- Teams: projected order, 2027 picks after trades, needs, estimated cap, draft habits.
- The web app: big board, player pages, my board, teams, mock draft with trades and the UDFA rush, simulations, model and data page.
- Tests for the engine and the data.

Not built yet (next, in this order unless Raichel changes it):
1. Raichel's calls on the picks in section 4.
2. Redraw the draft order in each simulation, and future-year picks in trades.
3. Scheme fit from each team's play-by-play.
4. The realism pass in section 5.
5. After the draft: class grades against real careers, results tracking, your scouting accuracy.
