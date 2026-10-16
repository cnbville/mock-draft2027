"""Front-office profiles: how the person who runs each team's draft has drafted and traded before.

For draft year Y and team T, the draft lead (the GM, or the head coach or owner where reporting says they have
final say; data/research/front_offices.csv) is looked up, and every draft he ran before Y, at any team, is
measured against the league:

  pos_tilt    share of his round 1-3 picks at each position group, over the league's share (relative)
  ath_tilt    how athletic his picks tested (z within position), over the league
  senior_tilt share of his picks aged 22.5+ at the draft, over the league
  size_tilt   how big his picks were (weight z within position), over the league
  p4_tilt     share of his picks from Power 4 schools (and Notre Dame), over the league
  sb_tilt     share of his picks who played in the Senior Bowl, over the league (2016 on)
  trade_up_rate / trade_down_rate   his draft-day trades up / down per draft, against the league (1 = average)
  chart_tilt  how far his trade prices sat from the market chart (paid more to move up, asked more to move down)
  future_tilt how readily he spends future picks (negative = values them less than the market)

Every tilt is shrunk toward zero by how much history there is (few drafts = little tilt). Computed from
nflverse draft picks, combine results, trades and college schedules. The shrink sizes are estimated.
"""
import json
import math
from functools import lru_cache

import numpy as np
import pandas as pd

import asof
import common as C
from players import DRAFT_POS

GROUP_OF = {"OL": "IOL", "DL": "DT", "DB": "CB"}
P4 = {"SEC", "Big Ten", "Big 12", "ACC", "Pac-12"}
MARKET = {"a": 0.079023, "b": 0.784641, "f": 0.4671}


def research(name):
    f = C.DATA / "research" / name
    return pd.read_csv(f) if f.exists() else None


@lru_cache(maxsize=1)
def front_offices():
    fo = research("front_offices.csv")
    if fo is None:
        return None
    fo["lead"] = np.where(fo.draft_lead == "hc", fo.hc, fo.gm)
    fo["lead_start"] = np.where(fo.draft_lead == "hc", fo.hc_start, fo.gm_start)
    return fo


@lru_cache(maxsize=1)
def conferences():
    rows = []
    for y in range(2013, 2027):
        f = C.RAW / f"cfb_schedules_{y}.csv"
        if not f.exists():
            continue
        s = pd.read_csv(f, low_memory=False)
        for side in ("home", "away"):
            if f"{side}_team" in s:
                rows.append(pd.DataFrame({"season": y, "team": s[f"{side}_team"], "conf": s[f"{side}_conference"]}))
    t = pd.concat(rows).dropna()
    t["k"] = t.team.map(C.norm_college)
    return t.groupby(["season", "k"]).conf.last().to_dict()


@lru_cache(maxsize=1)
def pick_table():
    """Every pick 2010-2026 with group, age, testing and size z within group, and Power 4."""
    d = pd.read_csv(C.RAW / "draft_picks.csv", low_memory=False)
    d = d[d.season >= 2010].copy()
    d["team"] = d.team.map(asof.fix)
    d["group"] = d.position.map(DRAFT_POS).replace(GROUP_OF)
    c = pd.read_csv(C.RAW / "combine.csv", low_memory=False)
    c = c[c.pfr_id.notna()][["pfr_id", "wt", "forty", "vertical", "broad_jump", "cone", "shuttle", "bench"]]
    d = d.merge(c, left_on="pfr_player_id", right_on="pfr_id", how="left")
    sign = {"forty": -1, "vertical": 1, "broad_jump": 1, "cone": -1, "shuttle": -1, "bench": 1}
    zs = []
    for t, sg in sign.items():
        z = d.groupby("group")[t].transform(lambda x: (x - x.mean()) / (x.std() or 1)) * sg
        zs.append(z)
    d["ath"] = pd.concat(zs, axis=1).mean(axis=1, skipna=True)
    d.loc[pd.concat(zs, axis=1).notna().sum(axis=1) < 2, "ath"] = np.nan
    d["size"] = d.groupby("group").wt.transform(lambda x: (x - x.mean()) / (x.std() or 1))
    d["senior"] = (d.age >= 22.5).astype(float).where(d.age.notna())
    conf = conferences()
    d["p4"] = [1.0 if conf.get((s - 1, C.norm_college(str(col)))) in P4 or str(col) == "Notre Dame"
               else (0.0 if (s - 1, C.norm_college(str(col))) in conf else np.nan)
               for s, col in zip(d.season, d.college)]
    sb = research("allstar.csv")
    if sb is not None:
        keys = {(int(r.draft_year), C.norm_name(r.player)) for r in sb[sb.game == "senior_bowl"].itertuples()}
        d["sb"] = [float((s, C.norm_name(str(n))) in keys) if s >= 2016 else np.nan
                   for s, n in zip(d.season, d.pfr_player_name)]
    else:
        d["sb"] = np.nan
    return d


def chart(p):
    return 1000 * math.exp(-MARKET["a"] * max(0.0, p - 1) ** MARKET["b"])


@lru_cache(maxsize=1)
def trade_table():
    f = C.BUILD / "real_trades.json"
    if not f.exists():
        return pd.DataFrame()
    rows = []
    for t in json.loads(f.read_text()):
        if t.get("incomplete") or len(t["teams"]) != 2 or t.get("round") is None:
            continue
        val = lambda cur, fut: sum(chart(p) for p in cur) + sum(MARKET["f"] * chart((x["round"] - 1) * 32 + 16.5) for x in fut)
        gave = val(t["up_gives"], t["up_future"])
        got = val(t["down_gives"], t["down_future"])
        has_player = bool(t.get("up_players") or t.get("down_players"))
        ratio = gave / got if got > 0 and not has_player else np.nan
        rows.append({"year": t["year"], "up": t["up"], "down": t["down"], "ratio": ratio,
                     "up_future": len(t["up_future"]) > 0})
    return pd.DataFrame(rows)


def lead_history(fo, Y):
    """(year, team) pairs each lead ran before Y."""
    past = fo[fo.draft_year < Y]
    return {lead: list(zip(g.draft_year, g.team)) for lead, g in past.groupby("lead")}


def profile(Y, team):
    fo = front_offices()
    if fo is None:
        return None
    row = fo[(fo.draft_year == Y) & (fo.team == team)]
    if row.empty:
        return None
    r = row.iloc[0]
    hist = lead_history(fo, Y).get(r.lead, [])
    d = pick_table()
    years = sorted({y for y, _ in hist})
    league = d[d.season.between(min(years, default=Y) , Y - 1)] if years else d[d.season.between(Y - 5, Y - 1)]
    mine = pd.concat([d[(d.season == y) & (d.team == t)] for y, t in hist]) if hist else d.iloc[0:0]
    n_drafts = len(hist)

    def shrink(n, n0):
        return n / (n + n0)

    early = mine[mine["round"] <= 3]
    lg_early = league[league["round"] <= 3]
    lg_share = lg_early.group.value_counts(normalize=True)
    pos_tilt = {}
    if len(early):
        sh = early.group.value_counts(normalize=True)
        k = shrink(len(early), 20)
        for g, base in lg_share.items():
            pos_tilt[g] = round(float(np.clip(k * (sh.get(g, 0.0) - base) / base, -1, 1)), 3)

    def tilt(col, n0):
        a = mine[col].dropna()
        if not len(a):
            return 0.0
        return round(float(shrink(len(a), n0) * (a.mean() - league[col].mean())), 3)

    size = tilt("size", 30)
    tr = trade_table()
    up_rate = down_rate = 1.0
    chart_tilt = future_tilt = 0.0
    if len(tr):
        lg = tr[tr.year.between(2011, Y - 1)]
        ndraft = max(1, lg.year.nunique())
        lg_up = len(lg) / ndraft / 32
        mt = [(y, t) for y, t in hist if y >= 2011]
        ups = sum(((lg.year == y) & (lg.up == t)).sum() for y, t in mt)
        downs = sum(((lg.year == y) & (lg.down == t)).sum() for y, t in mt)
        nd = len(mt)
        # Shrunk toward the league rate with a prior of 3 drafts.
        up_rate = round(float(((ups + 3 * lg_up) / (nd + 3)) / lg_up), 3)
        down_rate = round(float(((downs + 3 * lg_up) / (nd + 3)) / lg_up), 3)
        mine_t = pd.concat([lg[(lg.year == y) & ((lg.up == t) | (lg.down == t))].assign(me=t) for y, t in mt]) if mt else lg.iloc[0:0]
        if len(mine_t):
            lr = []
            for x in mine_t.itertuples():
                if np.isnan(x.ratio):
                    continue
                lr.append(math.log(x.ratio) if x.up == x.me else -math.log(x.ratio))
            if lr:
                # Estimated mapping: twice the shrunk mean log price gap.
                chart_tilt = round(float(np.clip(2 * shrink(len(lr), 6) * np.mean(lr), -0.25, 0.25)), 3)
            upt = mine_t[mine_t.up == mine_t.me]
            if len(upt):
                share = upt.up_future.mean()
                base = lg.up_future.mean() or 0.2
                future_tilt = round(float(np.clip(-0.3 * shrink(len(upt), 6) * (share - base) / base, -0.3, 0.3)), 3)
    new_gm = bool(r.lead_start == Y)
    return {
        "lead": r.lead, "draft_lead": r.draft_lead, "gm": r.gm, "hc": r.hc, "gm_start": int(r.gm_start),
        "hc_start": int(r.hc_start), "new_gm": new_gm, "new_hc": bool(r.hc_start == Y), "drafts_run": n_drafts,
        "profile": {"pos_tilt": pos_tilt, "ath_tilt": tilt("ath", 30), "senior_tilt": tilt("senior", 30),
                    "size_tilt": {g: size for g in lg_share.index}, "p4_tilt": tilt("p4", 30), "sb_tilt": tilt("sb", 30),
                    "trade_up_rate": up_rate, "trade_down_rate": down_rate, "chart_tilt": chart_tilt,
                    "future_tilt": future_tilt},
    }


@lru_cache(maxsize=None)
def schemes():
    return research("schemes.csv")


def scheme_labels(season, team):
    s = schemes()
    if s is None:
        return {}
    r = s[(s.season == season) & (s.team == team)]
    if r.empty:
        return {}
    r = r.iloc[0]
    return {"off_family": r.off_family, "run_scheme": r.run_scheme, "def_family": r.def_family,
            "front_label": str(r.front), "coverage": r.coverage, "off_playcaller": r.off_playcaller,
            "def_playcaller": r.def_playcaller}


if __name__ == "__main__":
    import sys
    Y = int(sys.argv[1]) if len(sys.argv) > 1 else 2025
    for t in asof.TEAMS[:6]:
        print(t, json.dumps(profile(Y, t)))
