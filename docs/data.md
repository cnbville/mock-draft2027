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

The public boards were copied from the public pages by a summariser on 2026-10-15. Spot-check them. The CBS list had Carter Smith twice (99 and 108); the second was dropped.

## How things are joined

- **Stats to players**: the play rows carry the offense's team, so defensive stats sat under the opponent. Every player-game is moved to the player's roster team for that season.
- **Past drafts to college players**: last roster season S, drafted in S+1, by normalised name and school, then by name alone when it is unique that year. Matched share of real picks: 82-85% for 2017-18, 90-99% from 2019. Before 2017 the rosters are too thin, so the model trains on 2017-2026.
- **Board players to roster players**: by normalised name, then school. Two nicknames are mapped by hand (`NAME_ALIASES` in `pipeline/build_app.py`). Not found on a 2026 roster and left out: Brendan Sorsby, Cade Uluavu, Ezra Christensen.
- **Positions**: the boards' position wins. Otherwise the roster position, with vague ones split by size (OL: 6'5" and up is a tackle; DL: 285 lb and up is an interior lineman unless he has a sack every three games; DB: 200 lb and up is a safety). Estimated cut-offs.
- **Pick ownership**: each team's own picks moved by the trade list in date order. When a team traded a pick in a round where it held two, the data doesn't say which; the tool assumes its own. `data/pick_overrides.csv` can fix a known case (empty for now).

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
