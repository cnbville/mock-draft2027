# 2026 NFL draft trades

Built 2026-10-16. Pick and trade data checked against the sources below. No rows came from memory alone.

## Files
- `trades_2026_draft.csv`: every trade made during the 2026 draft (Apr 23-25, 2026). 42 trades, 149 asset rows.
- `trades_2026_predraft.csv`: every trade between 2026-03-01 and 2026-04-22 that moved 2026 or 2027 picks or players. 22 trades, 63 asset rows.

Columns: trade_no, date, team_from, team_to, asset_type (pick | player), pick_season, pick_round, pick_number (overall, 2026 picks only), player (player traded, or the player later drafted with that pick, whoever drafted him), conditional (0/1), source (URLs separated by " ; ").
Each trade has one row per asset, in both directions. Dates for draft trades: Day 1 (round 1) = 04-23, Day 2 (rounds 2-3) = 04-24, Day 3 (rounds 4-7) = 04-25.

## Sources
- NFL.com draft trade tracker: https://www.nfl.com/news/2026-nfl-draft-trade-tracker-full-details-on-every-draft-related-move (read through amp.nfl.com)
- Wikipedia, 2026 NFL draft (per-pick trade notes): https://en.wikipedia.org/wiki/2026_NFL_draft
- Fox Sports trade tracker (rounds 1-3 only): https://www.foxsports.com/stories/nfl/2026-nfl-draft-trades-tracker-grades
- Pro Football Rumors, 2026 NFL trades (dated list): https://www.profootballrumors.com/2026/03/2026-nfl-trades
- Pro Football Reference team trade pages (PHI, NYJ, ATL): https://www.pro-football-reference.com/teams/phi/2026_trades.htm and likewise for nyj and atl

## Trade count check (draft days)
- NFL.com: 42 (Day 1: 8, Day 2: 14, Day 3: 20). Pre-draft "draft-related": 14.
- Fox Sports: 22 through Day 2 (round 1: 8, round 2: 10, round 3: 4). This matches NFL.com's 8 + 14. Fox has no Day 3 list.
- Wikipedia: 40 draft-day trades seen in the notes for picks 1-204 (the page text was cut off after pick 204). The 2 trades that only touch picks 213+ (BUF-CHI #213, SEA-GB #216) come from NFL.com alone.
- The file holds 42, matching NFL.com.

## Pre-draft window
- Every trade in the Pro Football Rumors list dated Mar 1 to Apr 22 (22 trades), including the 14 on NFL.com's pre-draft list. Dates are from that list (agreement dates; some came before the league year opened on Mar 11).
- Includes player-only trades (Franklin for Wooden, Orhorhoro for Maason Smith) and one with only 2028 picks (Kai Kroeger, Mar 10), since a player moved.
- Left out: Maxx Crosby to BAL for No. 14 and a 2027 1st (agreed Mar 6, voided Mar 10 after a failed physical). Also left out: Jermaine Johnson for T'Vondre Sweat (Feb 26, before the window).

## Known gaps and conflicts
- Wikipedia notes for picks 205-257 could not be read (fetch cut off). Those picks were checked through NFL.com and PFR team pages only.
- Geno Smith trade: Pro Football Rumors says LV got No. 182. NFL.com and PFR (NYJ page) say No. 208. The file uses 208 (No. 182 had already gone LV to BUF on Mar 8).
- Greenard trade: Fox says MIN got a 2027 4th. NFL.com, Wikipedia and PFR say a 2027 3rd. The file uses 3rd.
- HOU-BUF Day 1 trade: Fox lists No. 169. NFL.com and Wikipedia say No. 167. The file uses 167.
- Wicks trade: the SI tracker says a 2027 7th, dated Apr 11. PFR and NFL.com say a 2027 6th, dated Apr 10. The file uses 6th and Apr 10.
- Orhorhoro and Maason Smith: the direction comes from the PFR Falcons page (ATL got Smith).
- No trade in either file has a stated condition, so `conditional` is 0 throughout. Pro Football Rumors gives no condition details for the deals in this window.
- Older trades that moved 2026 picks (2025 and earlier, e.g. Micah Parsons, Sauce Gardner, Quinnen Williams) are outside both files. Wikipedia's notes cover them.
- Player names follow NFL.com spellings (e.g. "DJ Moore"; Fox writes "Treydan Dukes", NFL.com "Treydan Stukes").
