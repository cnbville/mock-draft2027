# All-star game participants (Senior Bowl, East-West Shrine Bowl), 2016-2026 drafts

Built 2026-10-16.

## Files
- `allstar.csv`: 2,596 rows. Columns: draft_year, game (senior_bowl | shrine), player, school, position, notes, source.
  draft_year is the year of the draft. The game was played that January or February.
- `raw/sbYYYY.txt`, `raw/shYYYY.txt`: the lists as copied (player|school|position[|source]).
- `build_allstar.py`: turns `raw/` into `allstar.csv` (`python3 build_allstar.py raw allstar.csv`).
- No `captains.csv` (see below).

## Sources and coverage
| Game | Years | Source | Rows per year |
|---|---|---|---|
| Senior Bowl | 2016-2026 | Wikipedia "<year> Senior Bowl" roster tables | 108-143 (complete) |
| Shrine | 2016, 2017, 2018 | NFL.com "East-West Shrine Game rosters" articles | 107-123 (complete) |
| Shrine | 2019 | vikings.com roster article | 113 (near complete) |
| Shrine | 2020 | Wikipedia notable players + footballgameplan.com + NFL.com + hustlebelt.com | 53 (partial, about 40%) |
| Shrine | 2021 | fantasypros.com invite list | 48 (partial; game canceled for COVID, invites only, skill positions only) |
| Shrine | 2022 | profootballnetwork.com accepted-invite tracker | 118 (running list, not the final roster) |
| Shrine | 2023 | yahoo.com roster article (+ Taron Vincent from commanders.com) | 142 |
| Shrine | 2024, 2025, 2026 | team-site roster articles (giants.com, buccaneers.com) | 126-137 |

The source URL is on every row. All rows are checked against a web source. None come from memory. One note on Shedeur Sanders (2025 Shrine) is from memory and marked as unchecked.

## Notes column
- `game roster` / `announced roster`: on the published roster. A few late withdrawals or replacements may be missing.
- `invited...`, `accepted invite (running list...)`, `partial...`: see the table above.
- 42 Shrine rows have the flag "also on Senior Bowl roster same year". This means the player moved up to the Senior Bowl, or played both games (in 2016-2019 the Shrine game was played the week before the Senior Bowl). Match was on name and school.

## Known gaps
- **2027 invites: none found.** As of 2026-10-16 the Senior Bowl has published only its "Top 300" watch list. NFL.com ran a mid-season top-25 article (around 2026-10-14), and many of those players are juniors. No accepted invites were found in searches. Search again from November.
- Shrine 2020 and 2021 are partial. 2022 is a running invite list, not the final roster.
- Positions are as each source gave them (mixed: DL/DT/IDL, OL/IOL/G, EDGE/DE/OLB). Normalize them before use.
- School names were lightly standardized (Miami (FL), NC State, UConn, UCF, FIU). Canadian schools are marked "(U Sports)". Small-school names are kept as given.
- Names are as published, with suffixes kept (Jr., II). Join to draft data on a normalized name plus school.
- Wikipedia roster tables may include a few players who withdrew before the game.

## Captains (captains.csv not built)
There is no systematic public source for final-season team captains of top-100 prospects. Captaincy is listed only on each school's roster pages or in news, and the format differs by school and year. Building the file would mean one lookup per player (about 700 for 2020-2026), so it was skipped. A cheaper stand-in: grep scouting-report text (for example, NFL.com prospect profiles) for "captain".

## Housekeeping
The working folder `research2/allstar_raw/` also holds files this task did not write (`senior_bowl_YYYY.txt`, `official/`). They look like another run's copies of the same rosters. They were left in place and are not used here.
