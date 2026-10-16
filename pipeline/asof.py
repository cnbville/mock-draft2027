"""Team data as of a draft: the same code builds the live 2027 draft and every past draft for the backtest.

For draft year Y the season before is S = Y - 1. Everything here uses only what was known on draft eve
(rosters, snaps and stats from season S and earlier, contracts signed in S or earlier, trades before the
draft). The live app calls it with Y = 2027 while season 2026 is still being played.

Raw inputs (pipeline/fetch.py downloads them): raw/hist/roster_<S>.csv, snaps_<S>.csv, stats_reg_<S>.csv,
depth_<S>.csv, part_<S>.csv, raw/contracts.parquet, raw/draft_picks.csv, raw/trades.csv, raw/games.csv.
"""
from collections import defaultdict
from functools import lru_cache

import numpy as np
import pandas as pd

from common import RAW, norm_name

HIST = RAW / "hist"

TEAMS = sorted(["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND",
                "JAX", "KC", "LV", "LAC", "LA", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF",
                "TB", "TEN", "WAS"])
FIX = {"LAR": "LA", "STL": "LA", "SD": "LAC", "OAK": "LV", "GNB": "GB", "KAN": "KC", "NWE": "NE", "NOR": "NO",
       "SFO": "SF", "TAM": "TB", "RAM": "LA", "SDG": "LAC", "LVR": "LV", "JAC": "JAX", "WSH": "WAS"}
NICK = {"Cardinals": "ARI", "Falcons": "ATL", "Ravens": "BAL", "Bills": "BUF", "Panthers": "CAR", "Bears": "CHI",
        "Bengals": "CIN", "Browns": "CLE", "Cowboys": "DAL", "Broncos": "DEN", "Lions": "DET", "Packers": "GB",
        "Texans": "HOU", "Colts": "IND", "Jaguars": "JAX", "Chiefs": "KC", "Raiders": "LV", "Chargers": "LAC",
        "Rams": "LA", "Dolphins": "MIA", "Vikings": "MIN", "Patriots": "NE", "Saints": "NO", "Giants": "NYG",
        "Jets": "NYJ", "Eagles": "PHI", "Steelers": "PIT", "Seahawks": "SEA", "49ers": "SF", "Buccaneers": "TB",
        "Titans": "TEN", "Commanders": "WAS", "Redskins": "WAS", "Team": "WAS"}

# Starters per group (a base defense plays 2 EDGE, 2 DT, 2 LB, 3 CB with the nickel back, 2 S).
STARTERS = {"QB": 1, "RB": 1, "WR": 3, "TE": 1, "OT": 2, "IOL": 3, "EDGE": 2, "DT": 2, "LB": 2, "CB": 3, "S": 2,
            "K": 1, "P": 1}
GROUPS = list(STARTERS) + ["LS"]
# Age at which each group usually starts to decline (estimated).
DECLINE_AGE = {"QB": 35, "RB": 28, "WR": 30, "TE": 31, "OT": 32, "IOL": 32, "EDGE": 31, "DT": 31, "LB": 30,
               "CB": 30, "S": 31, "K": 38, "P": 38, "LS": 36}
POS = {"QB": "QB", "RB": "RB", "FB": "RB", "HB": "RB", "WR": "WR", "TE": "TE", "T": "OT", "OT": "OT", "LT": "OT",
       "RT": "OT", "G": "IOL", "OG": "IOL", "LG": "IOL", "RG": "IOL", "C": "IOL", "OL": "OL", "DE": "DE",
       "EDGE": "EDGE", "OLB": "OLB", "DT": "DT", "NT": "DT", "DL": "DL", "LB": "LB", "ILB": "LB", "MLB": "LB",
       "CB": "CB", "DB": "DB", "S": "S", "SS": "S", "FS": "S", "SAF": "S", "K": "K", "P": "P", "LS": "LS"}


def fix(t):
    return FIX.get(t, t)


@lru_cache(maxsize=None)
def season_stats(S):
    f = HIST / f"stats_reg_{S}.csv"
    if not f.exists():
        return pd.DataFrame()
    s = pd.read_csv(f, low_memory=False)
    return s


@lru_cache(maxsize=None)
def snap_share(S):
    """Each player's share of his team's snaps in season S (offense or defense; kickers by special teams)."""
    f = HIST / f"snaps_{S}.csv"
    if not f.exists() or f.stat().st_size < 1000:
        return pd.Series(dtype=float), pd.Series(dtype=float)
    sn = pd.read_csv(f, low_memory=False)
    sn = sn[sn.game_type == "REG"] if "game_type" in sn else sn
    sn["team"] = sn.team.map(fix)
    sn["share"] = np.where(sn.position.isin(["K", "P", "LS"]), sn.st_pct,
                           sn[["offense_pct", "defense_pct"]].max(axis=1)).astype(float)
    games = sn.groupby("team").game_id.nunique()
    sn["k"] = sn.player.map(norm_name)
    by_id = sn.groupby(["pfr_player_id", "team"]).share.sum() / pd.Series(
        [games.get(t, 17) for _, t in sn.groupby(["pfr_player_id", "team"]).share.sum().index],
        index=sn.groupby(["pfr_player_id", "team"]).share.sum().index)
    by_name = sn.groupby(["k", "team"]).share.sum()
    by_name = by_name / pd.Series([games.get(t, 17) for _, t in by_name.index], index=by_name.index)
    return by_id, by_name


@lru_cache(maxsize=None)
def contracts():
    """Every contract with the last season it covers. An extension (OverTheCap's contract type) adds its years after
    the old deal's end: Jalen Hurts' 5 years signed in 2023 run 2024-2028. Any other deal runs from the year it was
    signed. A first-round rookie deal carries a fifth-year club option; a player extended later had it picked up
    (CBA rules)."""
    c = pd.read_parquet(RAW / "contracts.parquet")
    c["team_abbr"] = c.team.map(contract_team)
    c["k"] = c.player.map(norm_name)
    c["years"] = c.years.fillna(1).clip(lower=1)
    # A tender and an extension in the same year: the shorter one came first.
    c = c.sort_values(["year_signed", "years"], kind="stable")
    key = c.gsis_id.where(c.gsis_id.notna(), c.player.astype(str) + "|" + c.draft_year.astype(str))
    c["rookie_r1"] = (c.year_signed == c.draft_year) & (c.draft_round == 1)

    def ctype(hist, y, n):
        for h in (hist if hist is not None else []):
            if h.get("year_signed") == y and h.get("yrs") == n:
                return h.get("contract_type")
        return None
    c["ctype"] = [ctype(h, y, n) for h, y, n in zip(c.contract_history, c.year_signed, c.years)]
    prev, end = {}, []
    for k, y, n, r1, t in zip(key, c.year_signed, c.years, c.rookie_r1, c.ctype):
        p = prev.get(k)
        e = p + n if t == "Extension" and p is not None and p >= y else y + n - 1
        end.append(e)
        prev[k] = e + (1 if r1 else 0)
    c["end_year"] = end
    return c


def contract_team(s):
    # "LAR/CLE": the signing team is the last name; the first one is a later team.
    s = str(s).split("/")[-1].strip()
    if s in TEAMS:
        return s
    if fix(s) in TEAMS:
        return fix(s)
    return NICK.get(s.split()[-1]) if s else None


def contracts_asof(S, Y):
    """The latest contract each player had signed by the end of season S (rookie deals from draft Y excluded)."""
    c = contracts()
    # Two deals in one year (a tender, then an extension): the one that runs longer is the newer.
    c = c[(c.year_signed <= S) & ~(c.draft_year == Y)].sort_values(["year_signed", "end_year"], kind="stable")
    return c


def group_of(pos, weight, height, sacks_pg):
    g = POS.get(pos, None)
    if g == "OL":
        return "OT" if (height or 0) >= 77 else "IOL"
    if g == "DL":
        return "DT" if (weight or 0) >= 285 else "EDGE"
    if g == "DE":
        # A 3-4 end who weighs like a tackle and rarely rushes is an interior lineman.
        return "DT" if (weight or 0) >= 290 and sacks_pg < 0.2 else "EDGE"
    if g == "OLB":
        # Off-ball outside linebackers (4-3 SAM/WILL) rarely rush; 3-4 OLBs do.
        return "EDGE" if sacks_pg >= 0.18 or (weight or 0) >= 250 else "LB"
    if g == "DB":
        return "S" if (weight or 0) >= 200 else "CB"
    return g


@lru_cache(maxsize=None)
def players_asof(Y, S=None, roster_file=None):
    """Rosters at the end of season S (default Y - 1) with group, age, snaps (S and S-1), pay and pedigree."""
    S = S if S is not None else Y - 1
    ro = pd.read_csv(roster_file or (HIST / f"roster_{S}.csv"), low_memory=False)
    if "week" in ro:
        ro = ro.sort_values("week")
    ro = ro.drop_duplicates("gsis_id", keep="last")
    ro = ro[ro.status.isin(["ACT", "RES", "INA", "DEV"]) | ro.status.isna()].copy()
    ro["team"] = ro.team.map(fix)
    ro = ro[ro.team.isin(TEAMS)]
    st = season_stats(S)
    sacks = {}
    if len(st):
        g = st.games.clip(lower=1)
        sacks = dict(zip(st.player_id, (st.def_sacks.fillna(0) + 0.5 * st.def_qb_hits.fillna(0)) / g))
    pos = ro.depth_chart_position.where(ro.depth_chart_position.notna() & (ro.depth_chart_position != ""), ro.position)
    ro["height"] = pd.to_numeric(ro.height, errors="coerce")
    ro["weight"] = pd.to_numeric(ro.weight, errors="coerce")
    ro["group"] = [group_of(p, w, h, sacks.get(i, 0.0)) for p, w, h, i in zip(pos, ro.weight, ro.height, ro.gsis_id)]
    ro = ro[ro.group.notna()].copy()
    ro["age"] = (pd.Timestamp(f"{Y}-09-01") - pd.to_datetime(ro.birth_date, errors="coerce")).dt.days / 365.25
    ro["k"] = ro.full_name.map(norm_name)
    for lag, col in ((0, "share"), (1, "share_prev")):
        by_id, by_name = snap_share(S - lag)
        if len(by_id):
            v = [by_id.get((i, t), np.nan) for i, t in zip(ro.pfr_id, ro.team)]
            v = pd.Series(v, index=ro.index)
            miss = v.isna()
            v[miss] = [by_name.get((k, t), np.nan) for k, t in zip(ro.k[miss], ro.team[miss])]
            if lag == 1:
                # Last season he may have played elsewhere: his best share on any team.
                anyteam = by_name.groupby(level=0).max()
                v = v.fillna(ro.k.map(anyteam))
            ro[col] = v.fillna(0.0)
        else:
            ro[col] = 0.0
    c = contracts_asof(S, Y)
    # His latest deal: by player id, or by name and team when that one is newer (extensions often lack the id).
    cols = ("apy", "apy_cap_pct", "end_year", "year_signed")
    by_id = c[c.gsis_id.notna()].drop_duplicates("gsis_id", keep="last").set_index("gsis_id")
    by_name = c.drop_duplicates(["k", "team_abbr"], keep="last").set_index(["k", "team_abbr"])
    keys = list(zip(ro.k, ro.team))
    idv = {col: ro.gsis_id.map(by_id[col]) for col in cols}
    nmv = {col: pd.Series([by_name[col].get(k, np.nan) for k in keys], index=ro.index) for col in cols}
    use_name = idv["year_signed"].isna() | (nmv["year_signed"] > idv["year_signed"])
    for col in cols:
        ro[col] = idv[col].where(~use_name, nmv[col])
    ro["draft_number"] = pd.to_numeric(ro.draft_number, errors="coerce")
    # A first-rounder still on his rookie deal who starts will have his fifth-year option picked up.
    rookie = (ro.year_signed == pd.to_numeric(ro.get("entry_year", ro.get("rookie_year")), errors="coerce")) & (ro.draft_number <= 32)
    ro.loc[rookie & (ro[["share", "share_prev"]].max(axis=1) >= 0.5), "end_year"] += 1
    ro["pay_pct"] = np.nan
    for g, part in ro.groupby("group"):
        pool = part.apy_cap_pct.dropna().values
        if len(pool):
            ro.loc[part.index, "pay_pct"] = [float((pool < v).mean()) if pd.notna(v) else 0.0 for v in part.apy_cap_pct]
    ro["pay_pct"] = ro.pay_pct.fillna(0.0)
    ro["pedigree"] = np.where(ro.draft_number.notna(), 1 - ro.draft_number.clip(upper=260) / 260, 0.15)
    return ro.copy()


@lru_cache(maxsize=None)
def qb_epa(S):
    """Passing plus rushing EPA and plays for each QB in season S (computed from nflverse player stats)."""
    st = season_stats(S)
    if not len(st):
        return {}
    q = st[st.position == "QB"].copy()
    plays = q.attempts.fillna(0) + q.sacks_suffered.fillna(0) + q.carries.fillna(0)
    epa = q.passing_epa.fillna(0) + q.rushing_epa.fillna(0)
    return {i: (float(e), float(p)) for i, e, p in zip(q.player_id, epa, plays)}


def qb_level(gsis, S):
    """EPA per play over the last two seasons, the one before at half weight, so a QB hurt for part of a season
    or a season in progress is judged on more than a few games (weights estimated). None under 100 plays."""
    num = den = 0.0
    for lag, w in ((0, 1.0), (1, 0.5)):
        e = qb_epa(S - lag).get(gsis)
        if e:
            num += w * e[0]
            den += w * e[1]
    return num / den if den >= 100 else None


def recent_picks(Y):
    """Each team's picks per group in rounds 1-3 of the two drafts before Y (recent investment)."""
    from players import DRAFT_POS
    d = pd.read_csv(RAW / "draft_picks.csv", low_memory=False)
    d = d[d.season.between(Y - 2, Y - 1) & (d["round"] <= 3)].copy()
    d["team"] = d.team.map(fix)
    d["group"] = d.position.map(DRAFT_POS).replace({"OL": "IOL", "DL": "DT", "DB": "CB"})
    return d.groupby(["team", "group"]).size().to_dict()


NEED_FEATURES = ["pay", "ped", "snap", "snap_prev", "old", "exp_now", "exp_next", "depth", "open", "invest", "prod"]


def need_features(Y, S=None, roster_file=None):
    """One row per team and group with the facts a front office weighs (all as of draft eve)."""
    S = S if S is not None else Y - 1
    ro = players_asof(Y, S, roster_file)
    inv = recent_picks(Y)
    rows = []
    for t in TEAMS:
        team = ro[ro.team == t]
        for g, n in STARTERS.items():
            part = team[team.group == g].sort_values(["share", "share_prev", "pay_pct"], ascending=False)
            st, bench = part.head(n), part.iloc[n:n + 2]
            pad = n - len(st)
            pay = (st.pay_pct.sum()) / n
            ped = (st.pedigree.sum()) / n
            snap = (st.share.clip(upper=1).sum()) / n
            snap_prev = (st.share_prev.clip(upper=1).sum()) / n
            old = float(np.mean([max(0.0, a - DECLINE_AGE[g]) if pd.notna(a) else 0.0 for a in st.age] + [0.0] * pad))
            exp_now = float(((st.end_year <= S).sum() + pad) / n)
            exp_next = float((st.end_year == S + 1).sum() / n)
            depth = float(np.mean([0.5 * p + 0.3 * d + 0.2 * min(1, s) for p, d, s in
                                   zip(bench.pay_pct, bench.pedigree, bench.share)] or [0.0]))
            # A starting spot is open when no one played much of it (kickers and punters by special-teams snaps).
            open_ = float((n - (st.share >= (0.15 if g in ("K", "P") else 0.3)).sum()) / n)
            prod = 0.0
            if g == "QB" and len(st):
                e = qb_level(st.gsis_id.iloc[0], S)
                prod = float(np.clip(e, -0.4, 0.4)) / 0.15 if e is not None else -1.0
            rows.append({"year": Y, "team": t, "group": g, "pay": pay, "ped": ped, "snap": snap,
                         "snap_prev": snap_prev, "old": old, "exp_now": exp_now, "exp_next": exp_next,
                         "depth": depth, "open": open_, "invest": float(inv.get((t, g), 0)), "prod": prod,
                         "starters": [{"name": p.full_name, "age": None if pd.isna(p.age) else round(float(p.age), 1),
                                       "snap_share": round(float(p.share), 2),
                                       "apy": None if pd.isna(p.apy) else round(float(p.apy), 2),
                                       "contract_end": None if pd.isna(p.end_year) else int(p.end_year),
                                       "draft_pick": None if pd.isna(p.draft_number) else int(p.draft_number)}
                                      for p in st.itertuples()]})
    return pd.DataFrame(rows)


def qb_situation(Y, S=None, roster_file=None):
    """The starting QB on draft eve: age, contract, last season's level (EPA per play) and pedigree."""
    S = S if S is not None else Y - 1
    ro = players_asof(Y, S, roster_file)
    out = {}
    for t in TEAMS:
        q = ro[(ro.team == t) & (ro.group == "QB")].sort_values(["share", "pay_pct"], ascending=False)
        if not len(q):
            out[t] = {"starter": None}
            continue
        p = q.iloc[0]
        e = qb_level(p.gsis_id, S)
        out[t] = {"starter": p.full_name, "age": None if pd.isna(p.age) else round(float(p.age), 1),
                  "contract_end": None if pd.isna(p.end_year) else int(p.end_year),
                  "apy_cap_pct": None if pd.isna(p.apy_cap_pct) else round(float(p.apy_cap_pct), 3),
                  "draft_pick": None if pd.isna(p.draft_number) else int(p.draft_number),
                  "epa_play": None if e is None else round(float(e), 3),
                  "snap_share": round(float(p.share), 2)}
    return out


def standings(Y):
    """Win share in the last two regular seasons and the head coach's record there (computed)."""
    g = pd.read_csv(RAW / "games.csv", low_memory=False)
    g = g[(g.game_type == "REG") & g.result.notna()]
    out = {}
    for t in TEAMS:
        res = []
        for S in (Y - 1, Y - 2):
            h = g[(g.season == S) & (g.home_team.map(fix) == t)]
            a = g[(g.season == S) & (g.away_team.map(fix) == t)]
            w = (h.home_score > h.away_score).sum() + (a.away_score > a.home_score).sum()
            ties = (h.home_score == h.away_score).sum() + (a.away_score == a.home_score).sum()
            n = len(h) + len(a)
            res.append((w + 0.5 * ties) / n if n else 0.5)
        out[t] = {"win_pct": round(float(res[0]), 3), "win_pct_prev": round(float(res[1]), 3)}
    return out


def scheme_computed(S):
    """Front, coverage and personnel from charting data for season S (computed where the data has it)."""
    out = {t: {} for t in TEAMS}
    f = HIST / f"depth_{S}.csv"
    if f.exists():
        d = pd.read_csv(f, low_memory=False)
        if "pos_grp" in d:  # ESPN format (2025 on): the base defence is named.
            d["team"] = d.team.map(fix)
            dd = d[d.pos_grp.str.startswith("Base", na=False)]
            for t, part in dd.groupby("team"):
                if t in out:
                    out[t]["front"] = "34" if (part.pos_grp == "Base 3-4 D").mean() > 0.5 else "43"
        else:
            d = d[(d.formation == "Defense") & (d.depth_team.astype(str) == "1")].copy()
            d["team"] = d.club_code.map(fix)
            for t, part in d.groupby("team"):
                if t not in out:
                    continue
                pos = part.depth_position.astype(str).str.strip()
                wk = part.groupby("week").depth_position.apply(lambda s: set(s.astype(str).str.strip()))
                is34 = [bool(({"LILB", "RILB"} <= x) or ({"LOLB", "ROLB"} <= x) or ("NT" in x and "ILB" in " ".join(x)))
                        for x in wk]
                is43 = [bool({"WLB", "SLB"} & x or "MLB" in x) for x in wk]
                v34, v43 = np.mean(is34) if is34 else 0, np.mean(is43) if is43 else 0
                out[t]["front"] = "34" if v34 > v43 else "43"
                _ = pos
    f = HIST / f"part_{S}.csv"
    if f.exists():
        p = pd.read_csv(f, low_memory=False, usecols=lambda c: c in (
            "nflverse_game_id", "possession_team", "offense_personnel", "defense_man_zone_type",
            "defense_coverage_type", "number_of_pass_rushers", "defense_personnel"))
        gid = p.nflverse_game_id.astype(str).str.split("_")
        p["home"] = gid.str[3].map(fix)
        p["away"] = gid.str[2].map(fix)
        p["off"] = p.possession_team.map(fix)
        p["def"] = np.where(p.off == p.home, p.away, p.home)
        cov = p[p.defense_man_zone_type.isin(["MAN_COVERAGE", "ZONE_COVERAGE"])]
        man = cov.groupby("def").defense_man_zone_type.apply(lambda s: (s == "MAN_COVERAGE").mean())
        two = cov[cov.defense_coverage_type.notna()].groupby("def").defense_coverage_type.apply(
            lambda s: s.isin(["COVER_2", "COVER_4", "COVER_6", "2_MAN"]).mean())
        rush = p[p.number_of_pass_rushers.fillna(0) > 0]
        blitz = rush.groupby("def").number_of_pass_rushers.apply(lambda s: (s >= 5).mean())
        pers = p[p.offense_personnel.notna()].copy()
        pers["rb"] = pers.offense_personnel.str.extract(r"(\d) RB").astype(float)
        pers["te"] = pers.offense_personnel.str.extract(r"(\d) TE").astype(float)
        pers["wr"] = pers.offense_personnel.str.extract(r"(\d) WR").astype(float)
        p11 = pers.groupby("off").apply(lambda x: ((x.rb == 1) & (x.te == 1) & (x.wr == 3)).mean())
        p12 = pers.groupby("off").apply(lambda x: ((x.rb == 1) & (x.te == 2)).mean())
        p21 = pers.groupby("off").apply(lambda x: (x.rb == 2).mean())
        for t in TEAMS:
            for k, s in (("man_share", man), ("two_high_share", two), ("blitz_rate", blitz), ("p11", p11),
                         ("p12", p12), ("p21", p21)):
                if t in s.index and pd.notna(s[t]):
                    out[t][k] = round(float(s[t]), 3)
    return out


def future_picks(Y):
    """Who holds each team's Y+1 picks on draft eve (rounds 1-7), from trades dated before the draft."""
    owner = {(t, r): t for t in TEAMS for r in range(1, 8)}
    holds = defaultdict(list)
    for t in TEAMS:
        for r in range(1, 8):
            holds[(t, r)].append(t)
    tr = pd.read_csv(RAW / "trades.csv", low_memory=False)
    eve = DRAFT_EVE.get(Y)
    tr = tr[(tr.pick_season == Y + 1) & (tr.trade_date < eve)].sort_values(["trade_date", "trade_id"])
    for r in tr.itertuples():
        if pd.isna(r.pick_round):
            continue
        gave, got, rnd = fix(r.gave), fix(r.received), int(r.pick_round)
        if gave not in TEAMS or got not in TEAMS:
            continue
        held = holds[(gave, rnd)]
        if not held:
            continue
        orig = gave if gave in held else held[0]
        held.remove(orig)
        holds[(got, rnd)].append(orig)
        owner[(orig, rnd)] = got
    return [{"round": r, "original": t, "owner": owner[(t, r)]} for r in range(1, 8) for t in TEAMS]


# First day of each draft (published).
DRAFT_EVE = {2014: "2014-05-08", 2015: "2015-04-30", 2016: "2016-04-28", 2017: "2017-04-27", 2018: "2018-04-26",
             2019: "2019-04-25", 2020: "2020-04-23", 2021: "2021-04-29", 2022: "2022-04-28", 2023: "2023-04-27",
             2024: "2024-04-25", 2025: "2025-04-24", 2026: "2026-04-23", 2027: "2027-04-22"}
