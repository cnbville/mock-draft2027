# Front offices, 2010-2027 drafts

## Files
- `front_offices.csv`: one row per team per draft year, 2010-2027 (32 x 18 = 576 rows). It has these columns:
  - `draft_year`, `team` (the project's team codes; LV, LAC and LA are used even before the moves, and `notes` gives the old name).
  - `gm`: who held the GM title at the late-April draft. When a team had no GM, it is the top personnel executive: Mike Brown (CIN), Jerry Jones (DAL), Al Davis (LV 2010-11), Bill Belichick (NE 2010-23), Eliot Wolf (NE 2024+), Chip Kelly (PHI 2015), Sashi Brown (CLE 2016-17), Bill O'Brien (HOU 2020), Bruce Allen (WAS 2017-19), Ron Rivera (WAS 2020) and Rick Spielman (MIN 2010-11). If a football president sat above the GM, as Bill Polian, Tom Coughlin, Elway in 2011, Parcells, Tannenbaum, Holmgren, Brinker or Matt Ryan did, that person is named in `notes`.
  - `hc`: the head coach at the draft.
  - `draft_lead`: who had final say. It is `gm` by default, meaning the front office. It is set to `hc`, `owner` or `shared` only where reporting or a structural fact supports it. Counts: gm 470, hc 50, owner 38, shared 18.
  - `gm_start`: the first draft the person ran in that job. A GM hired after a draft starts the next year: Whaley 2014, Beane 2018, Douglas 2020, Khan 2023.
  - `hc_start`: the first season as that team's head coach, interim stints included (Garrett 2010, Frazier 2010, Crennel 2011, Mularkey 2015, Marrone 2016, Pierce 2023).
  - `gm_prev` / `hc_prev`: the job held just before this one.
  - `notes`, `source`: sources are URLs separated by ` | `. The word "memory" marks rows where some field was filled from Claude's knowledge without a check.
- `scripts/build_front_offices.py`: the script that writes the CSV. It holds the tenure tables and checks every 2010-2025 head coach against nflverse. Run it with `python3 -I build_front_offices.py raw/nflverse_games.csv`.
- `raw/nflverse_games.csv`: the nflverse game file, with the head coach of every game since 1999.

## Sources and checks
- **Head coaches, 2010-2025:** checked against the first regular-season game of each season in nflverse `games.csv` (https://github.com/nflverse/nfldata). 511 of the 512 team-years match. The one exception is NO 2012. Payton was suspended from April 16, 2012, so the file shows the interim coach, and the row keeps Payton with a note.
- **Head coaches, 2026-2027:** Wikipedia, 2026 NFL season (https://en.wikipedia.org/wiki/2026_NFL_season) and the NBC hires tracker. Do not use nflverse's 2026 coach names: they are stale for ARI, ATL and BUF.
- **GMs:** the Pro-Football-Reference executives index (https://www.pro-football-reference.com/executives/), which lists each executive's team and seasons. Hires made after the draft were placed by hand.
- **2026 front office changes:** ATL hired Ian Cunningham. MIA hired Jon-Eric Sullivan. MIN fired Kwesi Adofo-Mensah on Jan 30, 2026; Rob Brzezinski ran the 2026 draft as acting GM (Fox 9), and Nolan Teasley was hired in June 2026.
- **Spot checks:** person pages for Graves, Devaney, Nix, Chris Polian, Loomis and Reinfeldt.
- **Final-say reporting:**
  - KC: Reid said the GM has final say (SI, 2013), and Veach has final say on the roster (2017). So KC is `gm` in every year, including 2013-2017.
  - LA: Snead has final authority (2012), so LA is `gm` under Fisher.
  - DEN 2023+: Paton won't pick without Payton's approval (SI, 2023), so it is `shared`.
  - NE 2025+: Vrabel is reported as the final decision maker (NBC Sports Boston), so it is `hc`.
  - NYG 2026+: Harbaugh reports only to ownership (Feb 2026), so it is `shared`.

## Coverage
- All 576 rows have a gm, hc, draft_lead, both start years, both prev fields and a source. No cells are empty except `notes`.
- **As of 2026-10-16:** I found no head coach or GM firings during the 2026 season, so the 2027 rows repeat the people in place now.

## Known gaps
- **Mostly from memory:**
  - `gm_prev` / `hc_prev`, except the 2026 hires and the person pages listed above. Exact titles may be slightly off, for example "director" versus "VP" of player personnel.
  - These `draft_lead` calls rest on widely reported structures I did not re-check:
    - SEA 2010-23 Carroll (`hc`)
    - SF 2017+ Shanahan/Lynch (`shared`)
    - LV 2018-21 Gruden (`hc`)
    - DEN 2010 McDaniels (`hc`)
    - JAX 2021 Meyer (`hc`)
    - WAS 2021-23 Rivera (`hc`)
  - The presidents named in `notes`.
- **Not marked `hc` because I found no clear reporting:** Lovie Smith (TB 2014-15), O'Brien (HOU 2014-19), Rhule (CAR 2020-22), Payton in NO, and McDermott's role in BUF's 2017 draft.
- **PFR differs from this file in one place:** it credits Buddy Nix only from 2011. Wikipedia says Nix was named GM on Dec 31, 2009, so he is kept for the 2010 draft.
- `gm_start` for a returning GM is the start of the new stint: Hurney 2018 and Roseman 2016. Bruce Allen keeps 2010, because he was the top executive the whole time.
