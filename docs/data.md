# Data: sources, joins and gaps

Every figure in the app is labelled as **published** (with its source), **computed** (from the data below) or **estimated** (a guess to check).

## Sources

| File in `raw/` | Source | Used for |
|---|---|---|
| `player_stats_{2014-2026}.csv` | cfbfastR-data (`sportsdataverse/cfbfastR-data`, play-level player stats) | College stats per player season |
| `cfb_rosters_{2013-2026}.csv` | cfbfastR-data | Names, schools, position, class, height, weight, hometown, photo link |
| `cfb_schedules_{2014-2026}.csv` | cfbfastR-data | Opponent Elo, division (FBS/FCS), conference |
| `draft_picks.csv` | nflverse | Past drafts and careers (seasons started, Pro Bowls, career value AV) |
| `combine.csv` | nflverse | Size and test percentiles by position |
| `contracts.parquet` | nflverse (from OverTheCap) | Pay, contract end years, cap commitments |
| `roster_2026.csv`, `snaps_2026.csv` | nflverse | NFL starters, ages, snap shares |
| `games.csv`, `trades.csv` | nflverse `nfldata` | 2026 results and schedule, pick trades |
| `data/boards/*.csv` (in git) | PFF (2026-04-28), CBS Sports Mike Renner (2026-10-14), NFL Draft Buzz (fetched 2026-10-15) | The consensus |
| `art/nfl_teams_colors_logos.csv`, `art/cfb_teams_colors_logos.csv` | nflverse (`nflverse-pbp`), cfbfastR-data (`teams/`) | Team names, colours and logos (`pipeline/art.py`, see "Team art") |

The public boards were copied from the public pages by a summariser on 2026-10-15. Spot-check them. The CBS list had Carter Smith twice (99 and 108); the second was dropped.

## How things are joined

- **Stats to players**: the play rows carry the offense's team, so defensive stats sat under the opponent. Every player-game is moved to the player's roster team for that season.
- **Past drafts to college players**: last roster season S, drafted in S+1, by normalised name and school, then by name alone when it is unique that year. Matched share of real picks: 82-85% for 2017-18, 90-99% from 2019. Before 2017 the rosters are too thin, so the model trains on 2017-2026.
- **Board players to roster players**: by normalised name, then school. Two nicknames are mapped by hand (`NAME_ALIASES` in `pipeline/build_app.py`). Not found on a 2026 roster and left out: Brendan Sorsby, Cade Uluavu, Ezra Christensen.
- **Positions**: the boards' position wins. Otherwise the roster position, with vague ones split by size (OL: 6'5" and up is a tackle; DL: 285 lb and up is an interior lineman unless he has a sack every three games; DB: 200 lb and up is a safety). Estimated cut-offs.
- **Pick ownership**: each team's own picks moved by the trade list in date order. When a team traded a pick in a round where it held two, the data doesn't say which; the tool assumes its own. `data/pick_overrides.csv` can fix a known case (empty for now).

## Team art (logos and colours)

Built by `pipeline/art.py` into `app/data/art.json` and `app/img/nfl/<ABBR>.webp`. All of it is **published** data; `art.json` carries a `source` line with the fetch dates.

- **NFL names, nicknames and colours** (`c1`, `c2`): nflverse `teams_colors_logos.csv` (`nflverse/nflverse-pbp` on GitHub), fetched 2026-10-17. All 32 teams.
- **NFL logos**: 32 files bundled with the app, transparent, 256 x 256, 6-26 KB each (375 KB in all). The pipeline takes each team's ESPN logo (500 px, the link in the nflverse table), then its Wikipedia logo. The build machine on 2026-10-17 could reach neither (ESPN, Wikipedia and the NFL's sites are blocked there; only GitHub and the package registries work). So these files were made once from vector logos and checked by eye against nflverse's square logo tiles (which come from ESPN):
  - 30 teams: the SVG logos in the npm package `nfl-team-logos` 1.5.0 (2025-07-05).
  - Bears: that package has the bear-head alternate, so the "C" comes from the npm package `react-native-nfl-logos` 1.0.0 (SVG).
  - Titans: `titans.png` in `nflverse/nflverse-pbp` (the current logo).
  - Each team's `logo_src` in `art.json` names its file's source. When `art.py` runs on a machine that reaches ESPN, it replaces the files with ESPN's logos and says so in `logo_src`. When nothing is reachable it keeps the bundled files. Last resort for a missing file: nflverse's square tile (opaque).
- **Past-draft team codes**: the comps use Pro Football Reference codes (`GNB`, `KAN`, `OAK`...). `art.json` `nfl_alias` maps them to the app's codes (`OAK` -> `LV`).
- **College colours**: cfbfastR-data `teams/teams_colors_logos.csv` (College Football Data team info, updated 2026-10-12). These are the data feed's colours, which can differ a little from a school's own brand guide. Never filled in by hand.
- **College ESPN ids**: the cfbfastR schedules (`home_id`/`away_id` are ESPN team ids), matched by the exact school name; the colour table is then read by id, which also covers its other spellings ("Appalachian State" for App State, "UMass" for Massachusetts, "Dixie State" for Utah Tech...). **College logos** are ESPN links built from the id (`https://a.espncdn.com/i/teamlogos/ncaa/500/<id>.png`). The app loads them when it runs; the Mac app saves them after the first load.
- **Coverage** (2026-10-17): 184 schools are named in `prospects.json` (schools, former teams and comps' schools). All 184 have an ESPN id and a logo link; 183 have colours. All 59 schools of the top-100 consensus prospects have colours. `tests/test_data.py` checks this.
- **Gaps**: UT Rio Grande Valley is not in the colour table (id and logo only). 12 schools have no second colour (East Texas A&M, Hampton, Houston Christian, Lindenwood, Louisiana, Massachusetts, McNeese, Monmouth, New Haven, South Alabama, Utah Tech, West Georgia). In some pairs the second colour is the same or nearly the same as the first (Florida, Missouri, Minnesota, Ole Miss, Penn State and 15 more); the app's colour helper (`lightPair` in `app/js/ui/art.js`) lifts very dark colours so a screen never goes dark. College logos can't be checked from the build machine (ESPN is blocked there).
- Refresh: `python3 pipeline/art.py --fresh` downloads the tables (and tries the logos) again; `run_all.py` runs `art.py` after `build_app.py`.

## Known gaps

- No tackles, pressures, snaps or grades in the free college data. Offensive linemen have no stats at all.
- "Games" counts games with a recorded stat, so it undercounts defenders and can't tell injury from depth.
- ESPN's class year was broken before 2017 in the rosters, so class is also estimated from seasons on a roster.
- College birth dates aren't in the data, so age can't be used.
- Trades in the data end in April 2026. Summer 2026 trades and the coming trade deadline are missing.
- Compensatory picks are announced in March 2027; the mock uses 33 placeholders in rounds 3-7.
- Cap space uses contract averages and an estimated $305M 2027 cap.
- Some board players may have been hurt or changed position since the board was written.
- The College Football Data API itself, ESPN and Pro Football Reference were blocked by the build machine's network. The data came through the GitHub mirrors above.
