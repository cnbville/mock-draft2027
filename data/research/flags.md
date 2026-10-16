# flags: pre-draft medical and character flags, drafts 2020-2027

## File
`flags.csv` has 279 rows, one row per concern, for 235 player-years. A player with a knee issue and a character issue gets two rows. A concern reported by two sources at different dates can also get two rows. That shows how it grew (for example Laiatu Latu 2024, Jermod McCoy 2026, Jalen Carter 2023).

Columns: `draft_year, player, school, position, type, detail, severity, report_date, source`.
- `type`: medical, character (makeup, work ethic, maturity, interviews), off_field (arrests, charges, failed or diluted drug tests, NCAA suspensions, gambling), age, other (size or arm length, conditioning, small sample, family distraction).
- `severity`: my judgment on the brief's 1-3 scale. 3 = failed physicals, serious surgery or a torn ACL/Achilles within the last year, an arrest or suspension, or teams reportedly removing him from boards.
- `report_date`: the date of the source article, which is before that year's draft. For 2027 it is before 2026-10-16. It is empty when the source page shows no date, and on every row from memory.
- `source`: a URL, or `memory` (49 rows) when the row comes from my own knowledge and was not checked this session.

| Draft | Rows | Players | From memory | Draft date used |
|---|---|---|---|---|
| 2020 | 34 | 34 | 12 | 2020-04-23 |
| 2021 | 35 | 29 | 8 | 2021-04-29 |
| 2022 | 38 | 29 | 5 | 2022-04-28 |
| 2023 | 38 | 31 | 9 | 2023-04-27 |
| 2024 | 41 | 33 | 8 | 2024-04-25 |
| 2025 | 33 | 31 | 6 | 2025-04-24 |
| 2026 | 43 | 32 | 0 | 2026-04-23 |
| 2027 | 17 | 16 | 0 | today, 2026-10-16 |

By type: medical 181, character 43, other 24, off_field 21, age 10. By severity: 1 = 92, 2 = 119, 3 = 68.

## Hindsight rule
Every dated row comes from an article published before that year's draft. Post-draft "why he fell" pieces were thrown out. Examples: ESPN's 2020 article on coronavirus-hit prospects (May 1), Bleacher Report's 2025 injured-rookies piece (June), the Draft Sharks note on Darnell Washington (April 30, 2023), and the Tyjae Spears "no ACL" story (May 2023).

Some rows are dated on draft day itself, from articles posted hours before round 1. They are 17 rows in 2020 (NBC Sports Bay Area and CBS, April 23), 11 in 2023 (FantasyPros and SIC Score, April 27) and 4 in 2021 (WalterFootball, April 29). Drop them if you need a strict "day before" cutoff.

Memory rows hold facts that were public before the draft, such as earlier surgeries, arrests and suspensions. The event itself predates the draft, but I did not find the pre-draft article this session.

## Roundups checked per year
A roundup is a multi-player list. Single-player news items are counted separately.
- **2020**: 3 roundups (NBC Sports Bay Area "could tumble on medicals", CBS "seven prospects poised to fall", WalterFootball 2020 rumor results with no hits). 6 single items: Kinlaw (PFR), Saahdiq Charles (Yahoo), Becton and Baun drug-test reports, Jaylon Johnson (CBS), Fulton (NFL.com). The rejected ESPN piece was post-draft. This is the thinnest year: no combine rechecks were held in 2020.
- **2021**: 7 roundups (SI Vikings medical list, The 33rd Team doctor list, TideAlabama health updates, SI BamaCentral draft week, Milwaukee Journal Sentinel CBs via PressReader, WalterFootball draft-week Tuesday/Wednesday/Thursday). 5 single items: Fields epilepsy, Parsons, Barmore, Farley recheck, Trey Smith.
- **2022**: 6 roundups (Dr. Jess Flynn's full injury guide, PFF injured-prospect concern levels, WalterFootball draft-week Monday/Tuesday/Wednesday, WalterFootball rumor archive page). 5 single items: Wyatt x2, Pickens, Sam Williams, Thibodeaux (PFR).
- **2023**: 7 roundups (Fantasy Injury Team, FantasyPros injury guide, SIC Score, DLF RB injuries, CBS buyer beware, WalterFootball draft-week Monday and Tuesday). 3 single items: Jalen Carter charges, Carter board removals, Mazi Smith.
- **2024**: 8 roundups (Yardbarker combine red flags, GiveMeSport (undated), DLF TE and RB, WalterFootball draft-week Monday/Tuesday/Wednesday). 8 single items: WalterFootball Wiggins, Taylor, McConkey and Latu; SI Fautanu; McKinstry; Sweat; Adonai Mitchell.
- **2025**: 9 roundups (Lions Wire/Yahoo medical tiers, SIC Score top-5, SIC Score injury guide, Yardbarker five red flags, SI Colts injury piece, PFF buyer beware, DLF WR and RB (mostly paywalled), WalterFootball draft-week Monday). 3 single items: Burden, Bond, Harmon.
- **2026**: 11 roundups (CBS red-flag tracker, Last Word injury list, DLF QB/TE/WR/RB, FanSided top-25 red flags, WalterFootball draft-week Monday through Thursday). Also checked: Jimmy Liao MD's medical big board. I did not use it because it has no publish date before the draft. 4 single items: PFN Tyson, PFT Mauigoa, TotalProSports Downs, CBS Branch.
- **2027**: 7 in-season sources (On3 on Kiper's top 25, B/R mock October 14, PFF stock report week 4, Yahoo midseason RB and QB reports, FTN October 1, Last Word week 7). Also news on Stewart, Moore, Iamaleava and Sorsby.

## Known gaps
- **Missing insider sources.** ESPN, The Athletic (Brugler, McGinn, Fowler), NFL.com insider items and X/Twitter could not be fetched: paywalls, blocks, and curl is blocked here. The Rapoport/Pelissero recheck lists and team-doctor notes are mostly missing, except where another outlet quoted them.
- **Position bias.** Fantasy injury series (DLF, FantasyPros, Fantasy Injury Team) cover QB, RB, WR and TE closely. OL, DL, LB and DB are covered mostly through general roundups and WalterFootball, so they are under-covered.
- **Players who fell are over-represented.** The data is skewed toward them despite effort to be systematic. Clean prospects simply have no row, so a missing row means none was found, not that there was no concern.
- **Top-150 filter.** Scope was judged from memory of consensus boards, not checked against a board file. A few rows are borderline: Thaddeus Moss, Stetson Bennett, Ollie Gordon, Tylan Wallace, Paris Ford, Nico Iamaleava, Brendan Sorsby.
- **Severity and type** are my reading, not a published grade. Some "other" rows (size, arm length) are judgment calls on what counts as a concern.
- **Detail cells.** A few add widely known context from memory to a sourced row, such as the type of surgery. Examples: the Tua, Dickerson, Nasirildeen and Kevin Winston Jr. rows.
- **2027 is in-season.** It is mostly injuries from the current season, with no medical rechecks or interviews yet. Re-run after the 2027 combine (February-March) and medical rechecks (April).
- **Schools left blank** where unsure (2027 Darius Taylor, Brendan Sorsby).

## In this repo
The 48 rows sourced from memory were dropped (pipeline use): a flag recalled after the fact may carry hindsight.
