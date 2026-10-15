"""Turn cfbfastR play-level player stats into one row per player season.

Input: raw/player_stats_{year}.csv, raw/cfb_schedules_{year}.csv
Output: build/player_seasons.csv
"""
import sys

import numpy as np
import pandas as pd

from common import BUILD, RAW, YEARS_COLLEGE

COLS = [
    "game_id", "season", "team", "opponent",
    "reception_player_id", "reception_player", "reception_yds",
    "completion_player_id", "completion_player", "completion_yds",
    "rush_player_id", "rush_player", "rush_yds",
    "interception_player_id", "interception_player",
    "interception_thrown_player_id",
    "touchdown_player_id",
    "incompletion_player_id",
    "target_player_id", "target_player",
    "fumble_forced_player_id", "fumble_player_id",
    "sack_player_id", "sack_player", "sack_stat",
    "sack_taken_player_id",
    "pass_breakup_player_id", "pass_breakup_player",
    "field_goal_made_player_id", "field_goal_made_player",
    "field_goal_missed_player_id",
]

# Elo given to opponents without one (FCS and below): about the bottom of FBS.
DEFAULT_OPP_ELO = 1150.0


def opponent_elo(year):
    """Pre-game Elo of each team's opponent, keyed by (game_id, team)."""
    s = pd.read_csv(RAW / f"cfb_schedules_{year}.csv", low_memory=False)
    home = pd.DataFrame({"game_id": s.game_id, "team": s.home_team, "opp_elo": s.away_pregame_elo})
    away = pd.DataFrame({"game_id": s.game_id, "team": s.away_team, "opp_elo": s.home_pregame_elo})
    out = pd.concat([home, away])
    out["opp_elo"] = out.opp_elo.fillna(DEFAULT_OPP_ELO)
    return out


def team_info(year):
    """Division (fbs/fcs/...) and season-end Elo per team."""
    s = pd.read_csv(RAW / f"cfb_schedules_{year}.csv", low_memory=False)
    rows = []
    for side in ("home", "away"):
        part = s[[f"{side}_team", f"{side}_division", f"{side}_conference", f"{side}_postgame_elo", "week"]].copy()
        part.columns = ["team", "division", "conference", "elo", "week"]
        rows.append(part)
    t = pd.concat(rows).sort_values("week")
    return t.groupby("team").agg(division=("division", "last"), conference=("conference", "last"),
                                 team_elo=("elo", "last")).reset_index()


def stat(df, id_col, name, value=None):
    """Count (or sum `value`) per (game_id, team, player)."""
    d = df[df[id_col].notna()]
    g = d.groupby(["game_id", "team", id_col])
    s = g[value].sum() if value else g.size()
    s.index = s.index.set_names(["game_id", "team", "player_id"])
    return s.rename(name)


def season(year):
    df = pd.read_csv(RAW / f"player_stats_{year}.csv", usecols=lambda c: c in COLS, low_memory=False)
    for c in [c for c in df.columns if c.endswith("_id") and c != "game_id"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    for c in ("reception_yds", "completion_yds", "rush_yds", "sack_stat"):
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
    td = df.touchdown_player_id.notna()
    is_pass = df.completion_player_id.notna()
    is_rush = df.rush_player_id.notna() & ~is_pass
    df["pass_td"] = (td & is_pass).astype(int)
    df["rush_td"] = (td & is_rush).astype(int)
    df["one"] = 1

    parts = [
        stat(df, "completion_player_id", "pass_comp"),
        stat(df, "completion_player_id", "pass_yds", "completion_yds"),
        stat(df, "completion_player_id", "pass_td", "pass_td"),
        stat(df, "incompletion_player_id", "pass_inc"),
        stat(df, "interception_thrown_player_id", "pass_int"),
        stat(df, "sack_taken_player_id", "sacked"),
        stat(df, "rush_player_id", "rush_att"),
        stat(df, "rush_player_id", "rush_yds", "rush_yds"),
        stat(df, "rush_player_id", "rush_td", "rush_td"),
        stat(df, "reception_player_id", "rec"),
        stat(df, "reception_player_id", "rec_yds", "reception_yds"),
        stat(df, "reception_player_id", "rec_td", "pass_td"),
        stat(df, "target_player_id", "inc_targets"),
        stat(df, "sack_player_id", "sacks", "sack_stat"),
        stat(df, "interception_player_id", "ints"),
        stat(df, "pass_breakup_player_id", "pbu"),
        stat(df, "fumble_forced_player_id", "ff"),
        stat(df, "fumble_player_id", "fumbles"),
        stat(df, "field_goal_made_player_id", "fg_made"),
        stat(df, "field_goal_missed_player_id", "fg_missed"),
    ]
    g = pd.concat(parts, axis=1).fillna(0).reset_index()
    # The play rows carry the offense's team, so defensive stats (and some turnovers) sit under the
    # opponent. Put every player-game under the player's roster team for that season.
    ro = pd.read_csv(RAW / f"cfb_rosters_{year}.csv", usecols=["athlete_id", "team"], low_memory=False)
    ro["athlete_id"] = pd.to_numeric(ro.athlete_id, errors="coerce")
    ro = ro.dropna().drop_duplicates("athlete_id", keep="last").set_index("athlete_id").team
    games = pd.concat([df[["game_id", "team"]], df[["game_id", "opponent"]].rename(columns={"opponent": "team"})])
    in_game = set(zip(games.game_id, games.team))
    roster_team = g.player_id.map(ro)
    ok = [isinstance(t, str) and (gid, t) in in_game for gid, t in zip(g.game_id, roster_team)]
    g.loc[ok, "team"] = roster_team[ok]
    g = g.groupby(["game_id", "team", "player_id"]).sum().reset_index()

    # Team totals per game, for shares.
    tg = g.groupby(["game_id", "team"])[["rec_yds", "rec_td", "rush_yds", "rush_td", "sacks", "ints", "pbu", "rec"]].sum()
    tg.columns = ["t_" + c for c in tg.columns]
    g = g.join(tg, on=["game_id", "team"])

    elo = opponent_elo(year).drop_duplicates(["game_id", "team"]).set_index(["game_id", "team"])
    g = g.join(elo, on=["game_id", "team"])
    g["opp_elo"] = g.opp_elo.fillna(DEFAULT_OPP_ELO)
    # Opponent-weighted production: a game against an Elo 1800 team counts 1.5x one against 1200.
    w = (g.opp_elo / 1500.0).clip(0.6, 1.4)
    g["adj_scrimmage"] = (g.rec_yds + g.rush_yds) * w
    g["adj_sacks"] = g.sacks * w
    g["adj_takeaways"] = (g.ints + g.pbu) * w

    sums = [c for c in g.columns if c not in ("game_id", "team", "player_id", "opp_elo")]
    s = g.groupby(["player_id", "team"]).agg(
        games=("game_id", "nunique"), opp_elo=("opp_elo", "mean"), **{c: (c, "sum") for c in sums}
    ).reset_index()
    s["season"] = year
    s["targets"] = s.rec + s.inc_targets
    s["pass_att"] = s.pass_comp + s.pass_inc + s.pass_int
    for a, b in (("rec_yds", "t_rec_yds"), ("rec_td", "t_rec_td"), ("rush_yds", "t_rush_yds"),
                 ("sacks", "t_sacks"), ("ints", "t_ints"), ("pbu", "t_pbu")):
        s[f"sh_{a}"] = np.where(s[b] > 0, s[a] / s[b].where(s[b] > 0, 1), 0.0)
    s["sh_scrimmage"] = np.where(s.t_rec_yds + s.t_rush_yds > 0,
                                 (s.rec_yds + s.rush_yds) / (s.t_rec_yds + s.t_rush_yds).clip(lower=1), 0)
    s["sh_dominator"] = (s.sh_rec_yds + s.sh_rec_td) / 2
    s = s.drop(columns=[c for c in s.columns if c.startswith("t_")] + ["inc_targets", "one"], errors="ignore")
    ti = team_info(year)
    s = s.merge(ti, on="team", how="left")
    return s


def main(years):
    BUILD.mkdir(exist_ok=True)
    out = []
    for y in years:
        print("college stats", y, file=sys.stderr)
        out.append(season(y))
    pd.concat(out).to_csv(BUILD / "player_seasons.csv", index=False, float_format="%.4f")


if __name__ == "__main__":
    main(YEARS_COLLEGE)
