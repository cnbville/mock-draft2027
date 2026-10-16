# Past public big boards (for the backtest)

The backtest replays past drafts with the board the public had on draft day (pipeline/draft_inputs.py). Each
file has `ovr` (overall consensus rank), `eval` (Hasan's evaluator-only rank, when published), `name`, `position`,
`school` and `variance` (Hasan's measure of how much the boards disagree, when published).

| File | Board | Boards averaged | As of | Rows | Notes |
|---|---|---|---|---|---|
| hasan_2020.csv | Arif Hasan, consensus board (Google Sheet "Consensus Board (Upd 4-23-20) - 68 Boards") | 68 | 2020-04-23 (round 1 day) | 300 | Has the evaluator split. No variance. |
| consensus_2021.csv | Still Curtain (FanSided), Tyler Jaggi, "2021 NFL Draft Consensus Board: Top 130 Prospects" | 24 | 2021-04-29 | 130 | Fallback: Hasan's 2021 board ran at The Athletic and could not be reached. The page has no schools; they were filled in by the research step from memory (unchecked). "Abry Thomas" on the page is Ambry Thomas. Only the first 64 picks of 2021 are used to fit the model, since the board stops at 130. |
| consensus_2023.csv | Arif Hasan, "2023 NFL Draft Industry Consensus Big Board", Pro Football Network | more than 70 | 2023-04-27 (before round 1) | 300 | Overall rank only. The variance column exists on the page but is not in this file. |
| hasan_2024.csv | Arif Hasan, Wide Left consensus board (Google Sheet "2024 Consensus Board (101 Boards)") | 101 | 2024-04-25 | 300 | Evaluator split and variance. |
| hasan_2025.csv | Arif Hasan, Wide Left consensus board | 112 | 2025-04-24 | 300 | Evaluator split and variance. |
| hasan_2026.csv | Arif Hasan, Wide Left consensus board | 134 | 2026-04-23 | 300 | Evaluator split and variance. |

Sources:
- 2020: https://docs.google.com/spreadsheets/d/e/2PACX-1vSTYaxInC66nU_dSdw8HEMMI-n4Mh4WcaZDxVkEHw_8Mv2326DRo68HcVYuZL3zS7fv2PtZtCKE_7Fd/pubhtml
- 2021: https://stillcurtain.com/2021/04/29/2021-nfl-draft-consensus-board/
- 2023: https://www.profootballnetwork.com/2023-nfl-draft-industry-consensus-big-board/
- 2024: https://wideleft.football/p/2024-consensus-big-board-the-top (sheet https://docs.google.com/spreadsheets/d/1u_7bYeFLyPGldL6OqvyEXICH4LCvNZb_iqc2Z3740mo/edit)
- 2025: https://wideleft.football/p/2025-consensus-big-board-the-top (sheet https://docs.google.com/spreadsheets/d/1IUxTL9PXAmkasscUiGVYovtdKo7tawIuzXdMfDzmqI4/edit)
- 2026: https://wideleft.football/p/2026-nfl-draft-consensus-big-board (sheet https://docs.google.com/spreadsheets/d/1kMMdFfdPhcIlmSRFWnKVzx3IGm5VODx5oqJRraGms5E/edit)

Gaps: no usable 2022 board was found. Hasan's 2021 and 2022 boards (The Athletic), the NFL Mock Draft Database
consensus pages and the Grinding the Mocks dashboard could not be reached. Anyone with access to The Athletic can
add Hasan's 2021 and 2022 sheets here as hasan_2021.csv and hasan_2022.csv; draft_inputs.py prefers them.
