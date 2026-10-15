"""Players: rosters + stats -> feature rows for past draft classes and the 2027 class.

Output:
  build/history_rows.csv   one row per player who left college after 2014-2025, with draft result
  build/prospects_2027.csv one row per 2027-eligible player
"""
import sys

import numpy as np
import pandas as pd

from common import BUILD, CURRENT_SEASON, RAW, YEARS_COLLEGE, norm_college, norm_name

P4 = {"SEC", "Big Ten", "Big 12", "ACC", "Pac-12"}

# Roster position -> position group.
ROSTER_POS = {
    "QB": "QB", "RB": "RB", "FB": "RB", "WR": "WR", "TE": "TE",
    "OL": "OL", "OT": "OT", "T": "OT", "G": "IOL", "OG": "IOL", "C": "IOL",
    "DL": "DL", "DE": "EDGE", "EDGE": "EDGE", "OLB": "EDGE", "DT": "DT", "NT": "DT",
    "LB": "LB", "ILB": "LB", "MLB": "LB",
    "DB": "DB", "CB": "CB", "S": "S", "SAF": "S", "FS": "S", "SS": "S",
    "PK": "K", "K": "K", "P": "P", "LS": "LS", "ATH": "WR",
}

# Draft (Pro Football Reference) position -> position group.
DRAFT_POS = {
    "QB": "QB", "RB": "RB", "FB": "RB", "WR": "WR", "TE": "TE",
    "T": "OT", "OT": "OT", "G": "IOL", "OG": "IOL", "C": "IOL", "OL": "OL",
    "DE": "EDGE", "OLB": "EDGE", "DT": "DT", "NT": "DT", "DL": "DL",
    "LB": "LB", "ILB": "LB", "CB": "CB", "DB": "DB", "S": "S", "SAF": "S", "FS": "S",
    "K": "K", "P": "P", "LS": "LS",
}

GROUPS = ["QB", "RB", "WR", "TE", "OT", "IOL", "EDGE", "DT", "LB", "CB", "S", "K", "P", "LS"]


def split_group(group, height, weight, row=None):
    """Resolve vague roster groups (OL, DL, DB) with size and stats. Estimated cut-offs."""
    if group == "OL":
        return "OT" if (height or 0) >= 77 else "IOL"
    if group == "DL":
        if row is not None and (row.get("sacks_pg", 0) or 0) >= 0.35:
            return "EDGE"
        return "DT" if (weight or 0) >= 285 else "EDGE"
    if group == "DB":
        return "S" if (weight or 0) >= 200 else "CB"
    return group


def load_rosters():
    frames = []
    for y in range(2013, CURRENT_SEASON + 1):
        r = pd.read_csv(RAW / f"cfb_rosters_{y}.csv", low_memory=False)
        r["season"] = y
        frames.append(r)
    r = pd.concat(frames)
    r = r[r.athlete_id.notna()].copy()
    r["athlete_id"] = pd.to_numeric(r.athlete_id, errors="coerce")
    r = r[r.athlete_id.notna()]
    r["athlete_id"] = r.athlete_id.astype(np.int64)
    r["name"] = (r.first_name.fillna("") + " " + r.last_name.fillna("")).str.strip()
    r["height"] = pd.to_numeric(r.height, errors="coerce")
    r["weight"] = pd.to_numeric(r.weight, errors="coerce")
    r["year"] = pd.to_numeric(r.year, errors="coerce")
    r.loc[~r.year.between(1, 6), "year"] = np.nan
    r["group0"] = r.position.map(ROSTER_POS)
    return r.drop_duplicates(["athlete_id", "season", "team"])


def team_divisions():
    out = []
    for y in YEARS_COLLEGE:
        s = pd.read_csv(RAW / f"cfb_schedules_{y}.csv", low_memory=False)
        for side in ("home", "away"):
            p = s[[f"{side}_team", f"{side}_division"]].copy()
            p.columns = ["team", "division"]
            p["season"] = y
            out.append(p)
    return pd.concat(out).drop_duplicates(["team", "season"])


STAT_COLS = ["pass_att", "pass_comp", "pass_yds", "pass_td", "pass_int", "sacked", "rush_att", "rush_yds",
             "rush_td", "rec", "rec_yds", "rec_td", "targets", "sacks", "ints", "pbu", "ff", "fg_made", "fg_missed",
             "adj_scrimmage", "adj_sacks", "adj_takeaways"]
SHARE_COLS = ["sh_rec_yds", "sh_rec_td", "sh_rush_yds", "sh_sacks", "sh_ints", "sh_pbu", "sh_scrimmage", "sh_dominator"]


def season_features(ps):
    """Per-game numbers and shares for each player season (one row per player and season)."""
    ps = ps.copy()
    team_games = ps.groupby(["team", "season"]).games.max().rename("team_games")
    ps = ps.join(team_games, on=["team", "season"])
    # A transfer mid-season is rare; keep the team where he played most.
    ps = ps.sort_values("games").drop_duplicates(["player_id", "season"], keep="last")
    g = ps.games.clip(lower=1)
    for c in STAT_COLS:
        ps[c + "_pg"] = ps[c] / g
    ps["games_frac"] = (ps.games / ps.team_games.clip(lower=1)).clip(0, 1)
    ps["comp_pct"] = np.where(ps.pass_att >= 20, ps.pass_comp / ps.pass_att.clip(lower=1), np.nan)
    ps["ypa"] = np.where(ps.pass_att >= 20, ps.pass_yds / ps.pass_att.clip(lower=1), np.nan)
    ps["ypc"] = np.where(ps.rush_att >= 10, ps.rush_yds / ps.rush_att.clip(lower=1), np.nan)
    ps["ypt"] = np.where(ps.targets >= 10, ps.rec_yds / ps.targets.clip(lower=1), np.nan)
    ps["catch_rate"] = np.where(ps.targets >= 10, ps.rec / ps.targets.clip(lower=1), np.nan)
    ps["p4"] = ps.conference.isin(P4).astype(int) | (ps.team == "Notre Dame").astype(int)
    ps["fcs"] = (ps.division == "fcs").astype(int)
    return ps


FEATS_SEASON = ([c + "_pg" for c in STAT_COLS] + SHARE_COLS +
                ["games", "games_frac", "comp_pct", "ypa", "ypc", "ypt", "catch_rate", "opp_elo", "team_elo"])


def career(sf):
    """Career summaries per player: best dominator, productive seasons, breakout season number."""
    sf = sf.sort_values("season")
    out = sf.groupby("player_id").agg(
        c_games=("games", "sum"), c_best_dom=("sh_dominator", "max"), c_best_scrim=("sh_scrimmage", "max"),
        c_sacks=("sacks", "sum"), c_ints=("ints", "sum"), c_pbu=("pbu", "sum"),
        c_rec_yds=("rec_yds", "sum"), c_rush_yds=("rush_yds", "sum"), c_pass_yds=("pass_yds", "sum"),
        c_first=("season", "min"),
    )
    return out


def main():
    r = load_rosters()
    div = team_divisions()
    r = r.merge(div, on=["team", "season"], how="left")
    r = r[r.division.isin(["fbs", "fcs"]) | (r.season == CURRENT_SEASON)]
    ps = pd.read_csv(BUILD / "player_seasons.csv", low_memory=False)
    ps["player_id"] = ps.player_id.astype(np.int64)
    sf = season_features(ps)
    car = career(sf)

    seasons_by_player = r.groupby("athlete_id").season.agg(["min", "max", "nunique"])
    first_seen = seasons_by_player["min"]

    # History: players whose last roster season is S (2014-2025) -> draft S+1.
    hist = []
    for S in range(2014, CURRENT_SEASON):
        last = seasons_by_player[seasons_by_player["max"] == S].index
        cand = r[(r.season == S) & r.athlete_id.isin(last)]
        # Eligible: three seasons since first seen, or listed as junior or older.
        cand = cand[(S - cand.athlete_id.map(first_seen) >= 2) | (cand.year >= 3)]
        cand = cand.drop_duplicates("athlete_id")
        hist += [(a, S) for a in cand.athlete_id]
    print("history candidates", len(hist), file=sys.stderr)

    # 2027 class: on a 2026 roster, junior or older, or seen on a roster since 2024.
    cur = r[r.season == CURRENT_SEASON].drop_duplicates("athlete_id")
    elig = cur[(cur.year >= 3) | (cur.athlete_id.map(first_seen) <= CURRENT_SEASON - 2)]
    pros = [(a, CURRENT_SEASON) for a in elig.athlete_id]
    print("2027 eligible", len(pros), file=sys.stderr)

    r = r.sort_values("season")
    H = build_rows(r, sf, hist)
    Pn = build_rows(r, sf, pros)
    H = H.join(car, on="athlete_id")
    Pn = Pn.join(car, on="athlete_id")
    H = label_drafts(H)
    H.to_csv(BUILD / "history_rows.csv", index=False, float_format="%.4f")
    Pn.to_csv(BUILD / "prospects_2027.csv", index=False, float_format="%.4f")


def build_rows(r, sf, pairs):
    """Vectorised version of player_rows."""
    pairs = pd.DataFrame(pairs, columns=["athlete_id", "final_season"])
    base = r.drop_duplicates(["athlete_id", "season"], keep="last").rename(columns={"season": "final_season"})
    keep = ["athlete_id", "final_season", "name", "team", "height", "weight", "year", "position",
            "home_city", "home_state", "headshot_url", "group0", "division"]
    df = pairs.merge(base[keep], on=["athlete_id", "final_season"], how="left")
    df = df.rename(columns={"year": "roster_year", "position": "roster_pos", "headshot_url": "headshot"})
    seen = r.groupby("athlete_id").season.min()
    df["n_roster_seasons"] = df.final_season - df.athlete_id.map(seen) + 1
    teams = r.groupby("athlete_id").team.agg(lambda s: "|".join(dict.fromkeys(s)))
    df["teams"] = df.athlete_id.map(teams)
    sfx = sf.set_index(["player_id", "season"])
    for lag, tag in ((0, "f"), (1, "p")):
        idx = pd.MultiIndex.from_arrays([df.athlete_id, df.final_season - lag])
        part = sfx.reindex(idx)
        for c in FEATS_SEASON:
            df[f"{tag}_{c}"] = part[c].values
        if lag == 0:
            df["p4"] = part["p4"].values
            df["fcs"] = (df.division == "fcs").astype(int)
            df["conference"] = part["conference"].values
    df["p4"] = df.p4.fillna(0)
    return df


def label_drafts(H):
    d = pd.read_csv(RAW / "draft_picks.csv", low_memory=False)
    d = d[d.season.between(2015, CURRENT_SEASON)].copy()
    d["k_name"] = d.pfr_player_name.map(norm_name)
    d["k_college"] = d.college.map(norm_college)
    H = H.copy()
    H["draft_year"] = H.final_season + 1
    H["k_name"] = H.name.map(norm_name)
    H["k_college"] = H.team.map(norm_college)
    # Transfers: the draft lists the last school, which is the final season's team. Match name + college first.
    m = H.merge(d[["season", "k_name", "k_college", "pick", "round", "position", "team", "w_av", "seasons_started",
                   "probowls", "allpro", "pfr_player_id"]].rename(columns={"season": "draft_year", "team": "nfl_team",
                                                                           "position": "draft_pos"}),
                on=["draft_year", "k_name", "k_college"], how="left")
    m = m.drop_duplicates(["athlete_id", "final_season"])
    # Fallback: name only, when the name is unique among that year's candidates and that year's picks.
    unmatched = d[~d.pfr_player_id.isin(m.pfr_player_id.dropna())]
    cnt_h = H.groupby(["draft_year", "k_name"]).size()
    cnt_d = unmatched.groupby(["season", "k_name"]).size()
    for i in m.index[m.pick.isna()]:
        key = (m.at[i, "draft_year"], m.at[i, "k_name"])
        if cnt_h.get(key, 0) == 1 and cnt_d.get(key, 0) == 1:
            row = unmatched[(unmatched.season == key[0]) & (unmatched.k_name == key[1])].iloc[0]
            for a, b in (("pick", "pick"), ("round", "round"), ("draft_pos", "position"), ("nfl_team", "team"),
                         ("w_av", "w_av"), ("seasons_started", "seasons_started"), ("probowls", "probowls"),
                         ("allpro", "allpro"), ("pfr_player_id", "pfr_player_id")):
                m.at[i, a] = row[b]
    m["drafted"] = m.pick.notna().astype(int)
    rate = m.groupby("draft_year").drafted.sum() / d.groupby("season").size()
    print("share of real picks matched to a college player, by year:", file=sys.stderr)
    print(rate.round(3).to_string(), file=sys.stderr)
    return m


if __name__ == "__main__":
    main()
