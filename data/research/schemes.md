# Schemes: NFL play-callers and scheme families, 2015-2026

Built 2026-10-16 for the mock draft simulator.

## Files

| File | Rows | What it holds |
|---|---|---|
| `schemes.csv` | 384 (32 teams x 12 seasons) | season, team, off_playcaller, off_family, run_scheme, def_playcaller, def_family, front, coverage, notes, source |
| `staff.csv` | 384 | The checked staff data behind it: head coach, offensive coordinator and defensive coordinator, plus PFR's own "Offensive Scheme" and "Defensive Alignment" labels, one PFR URL per row |

Team codes follow the task list (LA = Rams, LAC = Chargers, LV = Raiders for all seasons, WAS = Washington).

## How each column was filled

- **Coordinators (`staff.csv`)**: checked (published). They come from every Pro-Football-Reference team-season page (`/teams/<code>/<year>.htm`), all 384 fetched. When a coordinator was replaced mid-season, PFR lists both names. A blank cell means PFR had no coordinator with that title. Examples: SF and LA, where the head coach called plays; NE 2018-2023, where Belichick named no DC; BUF 2023, when McDermott ran the defense.
- **off_playcaller / def_playcaller**: the person who actually called plays, which is often not the coordinator. Head coaches who called their own plays are shown as "Name (HC; X OC)". Mid-season handoffs give both names in order.
  - 2024 offense: checked against ABC's "Who calls plays for every NFL team in 2024".
  - 2026 offense: checked against ABC's 2026 list and TSN's 3 Sep 2026 breakdown.
  - 2026 defense: checked for BAL (Minter calls), NYJ (Glenn calls), TEN (Saleh calls), MIA (Hafley calls), LV (Leonard calls) and NE (Kuhr). The rest are marked "play-caller not confirmed" where the head coach might call instead.
  - Other checked handoffs: WAS 2015-16 (McVay called), HOU 2016, NYJ 2020, TB 2018, CHI 2024, BUF 2024-25, DET 2025, NE 2025, NYJ 2025, WAS 2025, NO 2022.
  - The rest came from memory, and every row's source says so. Doubtful ones are flagged "(from memory)" or "not confirmed" in the cell itself.
- **off_family, run_scheme, def_family, front, coverage**: estimated (Claude's classification), from the play-caller's coaching tree. Every row's notes say "estimated from coaching tree". Each row also keeps PFR's own labels ("PFR labels: X / Y") so you can compare. TSN or other write-up facts are quoted in the notes where found, mostly for 2026.
- **front**: the base front, following PFR's 3-4/4-3 label except where the defense was clearly something else. "hybrid" is used for multiple-front defenses (NE under Belichick, DET 2018-20, DAL 2020-23, CAR 2019, MIA 2019, SEA 2022-23, ATL 2025-26, NO 2025-26). Each override is explained in the notes.
- **coverage**: a coarse family default (single_high = mostly Cover 1/3, two_high = quarters/Cover 2/6, multiple = mixed or unknown). It was not charted per season. The simulator's man/zone shares from charting data should take priority.

## Classification rules used (estimated)

- shanahan_wcoast: the Shanahan, Kubiak, McVay and LaFleur trees, plus Stefanski, O'Connell, McDaniel, Arthur Smith, Coen, Canales and Waldron.
- wcoast: the Reid, Pederson, Gruden, McCarthy, Shurmur, Reich and Holmgren-style trees. CIN from 2021 on is also wcoast: it began on McVay roots but turned into a shotgun passing offense.
- erhardt_perkins: the New England tree, Daboll and his BUF successors, Gase and O'Brien. Ben Johnson's DET/CHI offense and its offshoots are here because PFR labels them that way (noted as a judgment call).
- air_coryell_vertical: Arians, Koetter, Turner, Linehan, Kellen Moore, Whisenhunt and Chudzinski. Payton's offenses are here because PFR labels them that way.
- spread_rpo: Kingsbury, Chip Kelly, Gailey, Joe Brady at CAR, Grubb, and PHI under Sirianni.
- other: Greg Roman's gap-power and QB-run offenses, CAR's Cam Newton offense under Shula, and TEN's "exotic smashmouth" under Mularkey.
- Defense:
  - fangio_two_high: Fangio, Staley, Donatell, Desai, Barry, Evero, the Rams under Morris and Shula, Gannon and Rallis, and Christian Parker.
  - seattle_cover3: Carroll, Quinn, Bradley and Hafley.
  - 43_wide9: Saleh, Ryans, Ulbrich and Schwartz, plus MIA 2016-18.
  - 34_two_gap: the LeBeau/Capers zone-blitz 3-4 and the Crennel 3-4 (PIT, GB to 2017, HOU to 2020, TEN 2015-17).
  - 43_over_under: Zimmer, Marinelli/Eberflus, Frazier/McDermott (Tampa-2 lineage), Lovie Smith, Dennis Allen and Del Rio.
  - multiple_hybrid: Belichick and his offshoots, the Ravens tree (Pees, Martindale, Macdonald, Minter), Spagnuolo, Flores, Bowles, Vance Joseph and Gregg Williams.
  - other: Wade Phillips' one-gap 3-4.

## Known gaps

- The families and coverage are judgment calls, not charting. run_scheme is "mixed" for 258 rows: most teams blend zone and gap, and no season-level public charting was gathered.
- The PFR pages were read through a page summarizer, not parsed raw. Names were checked against memory, and none conflicted. A raw re-scrape would make this airtight.
- Defensive play-callers before 2024 are mostly from memory. They are least certain for NO 2023-24 (Allen or Woods), CAR 2018 (Rivera's late takeover), CIN 2018 (Lewis after Austin was fired), NYJ 2025 after Wilks was fired, and the head-coach or DC splits flagged in the cells.
- Offensive handoff timing ("until Oct", "from week 11") is approximate unless a source URL is given.
- 2026 is a partial season (as of 16 Oct 2026). The SF 2026 offense was being called by Klay Kubiak while Shanahan recovered; check whether Shanahan is back.
- Coaches without a public scheme write-up are classified from their mentors: Campanile (JAX), O'Leary (LAC), Dennard Wilson (NYG), Daronte Jones (WAS), Rutenberg (CLE) and Kuhr (NE).

## Main sources

- Pro-Football-Reference team-season pages, e.g. https://www.pro-football-reference.com/teams/crd/2015.htm (all 384).
- https://abc7.com/post/calls-plays-every-nfl-team-2024-what-know/15246862/
- https://abc7news.com/post/calls-plays-every-nfl-team-2026-what-know/19783946/
- https://www.tsn.ca/nfl/article/breaking-down-every-teams-playcaller-and-strategy-ahead-of-nfl-kickoff-next-week-on-tsn/
- Team-specific articles are listed in each row's `source` cell (thebanner.com, jetsxfactor.com, aol.com, si.com, abc7news.com, bloggingtheboys.com, fantasynerds.com, hogshaven.com, patspulpit.com, newyorkjets.com, wsls.com, profootballrumors.com, cbssports.com, commanders.com, bleachernation.com, nfl.com).
