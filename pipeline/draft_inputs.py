"""Everything the draft AI needs for one draft, as of draft eve. The live 2027 draft and every past draft in the
backtest are built by the same functions, so the backtest measures the code the app runs.

python3 pipeline/draft_inputs.py 2020 2021 ... [--fresh] -> build/drafts/draft_<Y>.json

Each file holds
  prospects  the pool (700) with board rank, model view and traits (size, testing, experience, level, all-star
             games, public pre-draft flags)
  teams      per team: need facts per group, QB situation, scheme, standings, front office, future picks
  picks      the real picks: draft-eve owner (draft-day trades undone) and final owner
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

import asof
import build_app as BA
import common as C
import model as M
from players import DRAFT_POS

OUT = C.BUILD / "drafts"
BOARDS = C.DATA / "history_boards"
RESEARCH = C.DATA / "research"
BOARD_POS = {"DE": "EDGE", "OLB": "EDGE", "EDGE": "EDGE", "ED": "EDGE", "DL": "DT", "DI": "DT", "IDL": "DT",
             "NT": "DT", "DT": "DT", "OG": "IOL", "G": "IOL", "C": "IOL", "OC": "IOL", "IOL": "IOL", "OL": "OT",
             "T": "OT", "OT": "OT", "ILB": "LB", "MLB": "LB", "LB": "LB", "FS": "S", "SS": "S", "SAF": "S", "S": "S",
             "CB": "CB", "DB": "CB", "NCB": "CB", "RB": "RB", "HB": "RB", "FB": "RB", "WR": "WR", "TE": "TE",
             "QB": "QB", "K": "K", "PK": "K", "P": "P", "LS": "LS", "DL1T": "DT", "DL3T": "DT", "DL5T": "DT",
             "OLB/ED": "EDGE", "ATH": "WR"}
TESTS = {"forty": -1, "vertical": 1, "broad_jump": 1, "cone": -1, "shuttle": -1, "bench": 1}


# ---------- the model, retrained on earlier drafts only ----------
def model_rows(Y):
    """Every college player in his last season before draft Y, scored by a model trained on drafts before Y."""
    from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
    H = pd.read_csv(C.BUILD / "history_rows.csv", low_memory=False)
    H = H[H.draft_year >= M.TRAIN_FROM].copy()
    H["group"] = M.resolve_groups(H)
    H = H[H.height.notna() | H.f_games.notna()].copy()
    XH = M.feature_frame(H)
    cat = [XH.columns.get_loc("group")]
    tr = (H.draft_year < Y).values
    te = (H.draft_year == Y).values
    clf = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=31,
                                         categorical_features=cat, random_state=7)
    clf.fit(XH[tr], H.drafted[tr])
    dr = tr & (H.drafted == 1).values
    reg = HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05, max_leaf_nodes=15,
                                        categorical_features=cat, random_state=7)
    reg.fit(XH[dr], np.log(H.pick[dr]))
    P = H[te].copy()
    P["p_drafted"] = clf.predict_proba(XH[te])[:, 1]
    P["exp_pick"] = np.exp(reg.predict(XH[te]))
    return P


# ---------- boards ----------
def load_board(Y):
    # Arif Hasan's consensus board, or another public consensus board for years his isn't available.
    f = BOARDS / f"hasan_{Y}.csv"
    if not f.exists():
        f = BOARDS / f"consensus_{Y}.csv"
    if not f.exists():
        return None
    b = pd.read_csv(f)
    b["eval"] = pd.to_numeric(b.get("eval"), errors="coerce")
    # The scouting ("evaluation") order when the sheet has one, else the overall order.
    key = b["eval"].where(b["eval"].notna(), b["ovr"] + 0.5)
    b = b.assign(key=key).sort_values(["key", "ovr"]).reset_index(drop=True)
    b["rank"] = np.arange(1, len(b) + 1)
    b["k"] = b.name.map(C.norm_name).replace(BA.NAME_ALIASES)
    b["kc"] = b.school.map(C.norm_college)
    pos = b.position.astype(str).str.upper().str.strip()
    # Two positions ("OT/OG", "WR/RB"): the first is the one he is listed at.
    b["bgroup"] = pos.map(BOARD_POS).fillna(pos.str.split("/").str[0].map(BOARD_POS))
    b["variance"] = pd.to_numeric(b.get("variance"), errors="coerce")
    return b


def shares_before(Y):
    d = pd.read_csv(C.RAW / "draft_picks.csv", low_memory=False)
    d = d[d.season.between(Y - 10, Y - 1)]
    g = d.position.map(DRAFT_POS).replace({"OL": "IOL", "DL": "DT", "DB": "CB"})
    return g.value_counts(normalize=True).to_dict()


def research(name):
    f = RESEARCH / name
    return pd.read_csv(f) if f.exists() else None


def combine_rows(Y):
    c = pd.read_csv(C.RAW / "combine.csv", low_memory=False)
    c = c[c.draft_year == Y].copy()
    c["k"] = c.player_name.map(C.norm_name)
    c["kc"] = c.school.map(C.norm_college)
    return c


def athletic_scores(P, Y):
    """Combine results (published at the February combine, so known before the draft) as percentiles within
    the group among combine invitees of earlier years (computed)."""
    c = pd.read_csv(C.RAW / "combine.csv", low_memory=False)
    pos = {"WR": "WR", "CB": "CB", "RB": "RB", "FB": "RB", "OT": "OT", "DT": "DT", "S": "S", "SAF": "S", "DE": "EDGE",
           "EDGE": "EDGE", "OLB": "EDGE", "TE": "TE", "QB": "QB", "OG": "IOL", "G": "IOL", "C": "IOL", "OL": "IOL",
           "ILB": "LB", "LB": "LB", "DL": "DT", "DB": "CB", "P": "P", "K": "K", "LS": "LS"}
    c["group"] = c.pos.map(pos)
    ref = c[c.draft_year.between(Y - 15, Y - 1)]
    cy = combine_rows(Y)
    by_k = {k: part for k, part in cy.groupby("k")}
    out = {t: [] for t in TESTS}
    for r in P.itertuples():
        part = by_k.get(r.k)
        if part is not None and len(part) > 1:
            same = part[part.kc == r.kc]
            part = same if len(same) else None
        row = part.iloc[0] if part is not None and len(part) else None
        for t, sign in TESTS.items():
            v = pd.to_numeric(row[t], errors="coerce") if row is not None else np.nan
            if pd.isna(v):
                out[t].append(None)
                continue
            pool = pd.to_numeric(ref[ref.group == r.group][t], errors="coerce").dropna()
            if len(pool) < 30:
                out[t].append(None)
                continue
            p = float((pool < v).mean())
            out[t].append(round(p if sign > 0 else 1 - p, 3))
    return out


def size_z(P, Y):
    """Height and weight as z-scores within the group, among the pool (computed)."""
    stats = P.groupby("group")[["height", "weight"]].agg(["mean", "std"])
    hz, wz = [], []
    for r in P.itertuples():
        if r.group in stats.index:
            m = stats.loc[r.group]
            hz.append(None if pd.isna(r.height) else round(float((r.height - m[("height", "mean")]) / (m[("height", "std")] or 1)), 3))
            wz.append(None if pd.isna(r.weight) else round(float((r.weight - m[("weight", "mean")]) / (m[("weight", "std")] or 1)), 3))
        else:
            hz.append(None)
            wz.append(None)
    return hz, wz


def prospects(Y, P, vpick):
    """The pool, built like the live app's (pipeline/build_app.py), with the backtest's two name repairs."""
    P = P.copy()
    # The college data sometimes holds one player twice (two ids, e.g. a transfer). Keep one row per real pick:
    # the real id first, then the one the model rates higher.
    P = P.assign(_neg=(P.athlete_id < 0).astype(int)).sort_values(["_neg", "p_drafted"], ascending=[True, False])
    P = P[P.pick.isna() | ~P.pick.duplicated(keep="first")].drop(columns="_neg").sort_index()
    P["k"] = P.name.map(C.norm_name)
    P["kc"] = P.team.map(C.norm_college)
    board = load_board(Y)
    P["consensus_rank"] = np.nan
    P["board_name"] = None
    P["variance"] = np.nan
    unmatched, added = [], []
    if board is not None:
        for r in board.itertuples():
            cand = P[(P.k == r.k) & P.consensus_rank.isna()]
            if len(cand) > 1:
                same = cand[cand.kc == r.kc]
                cand = same if len(same) else cand.sort_values("p_drafted", ascending=False)
            if not len(cand):
                first = r.k.split()[0] if r.k else ""
                fz = P[(P.kc == r.kc) & P.consensus_rank.isna() & (P.k.str.split().str[0] == first)]
                fz = fz[[r.k.startswith(k) or k.startswith(r.k) or k.split()[-1] in r.k.split() for k in fz.k]]
                cand = fz
            if len(cand):
                i = cand.index[0]
                P.at[i, "consensus_rank"] = int(r.rank)
                P.at[i, "board_name"] = r.name
                P.at[i, "variance"] = r.variance
                if isinstance(r.bgroup, str):
                    P.at[i, "group"] = r.bgroup
            else:
                unmatched.append(r)
    P["p_declare"] = 1.0
    P["model_value"] = P.p_drafted * P.exp_pick.map(vpick)
    P["cons_value"] = P.consensus_rank.map(lambda r: vpick(r) if pd.notna(r) else np.nan)
    on_board = P[P.consensus_rank.notna()]
    for r in unmatched:
        near = on_board[(on_board.consensus_rank - r.rank).abs() <= 10].model_value
        added.append({"athlete_id": -(Y * 1000 + int(r.rank)), "name": r.name, "team": r.school,
                      "group": r.bgroup if isinstance(r.bgroup, str) else "WR", "consensus_rank": int(r.rank),
                      "board_name": r.name, "k": r.k, "kc": r.kc, "p_drafted": np.nan, "exp_pick": np.nan,
                      "p_declare": 1.0, "model_value": float(near.median()) if len(near) else 0.0,
                      "cons_value": vpick(r.rank), "pick": np.nan, "nfl_team": None, "draft_pos": None,
                      "variance": r.variance})
    if added:
        P = pd.concat([P, pd.DataFrame(added)], ignore_index=True)
    P["board_value"] = np.where(P.cons_value.notna(), 0.8 * P.cons_value + 0.2 * P.model_value, 0.6 * P.model_value)
    BA.group_shares = lambda: shares_before(Y)
    pool = BA.select_pool(P).copy()
    pool = add_specialists(pool, P)
    pool["board_rank"] = range(1, len(pool) + 1)
    match_real_picks(pool, Y)
    return pool, unmatched


def add_specialists(pool, P):
    """Kickers, punters and long snappers are drafted 3-4 times a draft but rarely make boards: keep the best
    ones by the model in the pool (6 K, 6 P, 3 LS)."""
    extra = []
    for g, n in (("K", 6), ("P", 6), ("LS", 3)):
        have = (pool.group == g).sum()
        if have >= n:
            continue
        cand = P[(P.group == g) & ~P.index.isin(pool.index)].sort_values("model_value", ascending=False).head(n - have)
        extra.append(cand)
    if extra:
        pool = pd.concat([pool] + extra)
        pool = pool.sort_values("board_value", ascending=False)
    return pool


def match_real_picks(pool, Y):
    d = pd.read_csv(C.RAW / "draft_picks.csv", low_memory=False)
    d = d[d.season == Y].copy()
    if not len(d):
        return
    d["k"] = d.pfr_player_name.map(C.norm_name)
    used = set(pool.pick.dropna().astype(int)) if "pick" in pool else set()
    byk = {k: part for k, part in d.groupby("k")}
    for i in pool.index[pool.pick.isna()]:
        for k in (C.norm_name(pool.at[i, "board_name"]) if isinstance(pool.at[i, "board_name"], str) else None,
                  pool.at[i, "k"]):
            if k in byk:
                part = byk[k]
                if len(part) > 1:
                    part = part[part.college.map(C.norm_college) == pool.at[i, "kc"]]
                if len(part) == 1 and int(part.pick.iloc[0]) not in used:
                    pool.at[i, "pick"] = int(part.pick.iloc[0])
                    pool.at[i, "nfl_team"] = part.team.iloc[0]
                    pool.at[i, "draft_pos"] = part.position.iloc[0]
                    used.add(int(part.pick.iloc[0]))
                    break
    d["last"] = d.k.str.split().str[-1]
    d["kc"] = d.college.map(C.norm_college)
    for i in pool.index[pool.pick.isna()]:
        last = str(pool.at[i, "k"]).split()[-1] if isinstance(pool.at[i, "k"], str) else None
        part = d[(d["last"] == last) & (d.kc == pool.at[i, "kc"]) & ~d.pick.isin(used)]
        if last and len(part) == 1:
            pool.at[i, "pick"] = int(part.pick.iloc[0])
            pool.at[i, "nfl_team"] = part.team.iloc[0]
            pool.at[i, "draft_pos"] = part.position.iloc[0]
            used.add(int(part.pick.iloc[0]))
    assert pool.pick.dropna().is_unique, "a real pick was given to two pool players"


def rank_equivalent(value, vpick):
    """The board rank whose chart value equals this value (for players off the public board)."""
    lo, hi = 1, 400
    if value >= vpick(1):
        return 1.0
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if vpick(mid) > value:
            lo = mid
        else:
            hi = mid
    return float(hi)


def prospect_records(pool, Y, vpick):
    ath = athletic_scores(pool, Y)
    hz, wz = size_z(pool, Y)
    sb = research("allstar.csv")
    flags = research("flags.csv")
    sbk, flk = set(), {}
    if sb is not None:
        sb = sb[sb.draft_year == Y]
        sbk = {(C.norm_name(r.player), r.game) for r in sb.itertuples()}
    if flags is not None:
        fl = flags[(flags.draft_year == Y)]
        for r in fl.itertuples():
            k = C.norm_name(r.player)
            flk.setdefault(k, []).append({"type": r.type, "severity": int(r.severity), "detail": str(r.detail)})
    rows = []
    for j, r in enumerate(pool.itertuples()):
        k = C.norm_name(r.board_name) if isinstance(r.board_name, str) else r.k
        tests = {t: ath[t][j] for t in TESTS}
        have = [v for v in tests.values() if v is not None]
        athletic = round(float(np.mean(have)), 3) if len(have) >= 2 else None
        model_rank = rank_equivalent(float(r.model_value), vpick) if pd.notna(r.model_value) else 400.0
        roster_year = getattr(r, "roster_year", np.nan)
        nseas = getattr(r, "n_roster_seasons", np.nan)
        senior = bool((pd.notna(roster_year) and roster_year >= 4) or (pd.notna(nseas) and nseas >= 4))
        rows.append({
            "id": int(r.athlete_id), "name": r.board_name if isinstance(r.board_name, str) else r.name,
            "school": r.team, "group": r.group, "board_value": round(float(r.board_value), 2), "p_declare": 1.0,
            "consensus_rank": None if pd.isna(r.consensus_rank) else int(r.consensus_rank),
            "variance": None if pd.isna(getattr(r, "variance", np.nan)) else round(float(r.variance), 1),
            "model_rank": round(model_rank, 1), "model_value": round(float(r.model_value), 2) if pd.notna(r.model_value) else 0.0,
            "board_rank": int(r.board_rank), "board_only": bool(r.athlete_id < 0),
            "height": None if pd.isna(getattr(r, "height", np.nan)) else int(r.height),
            "weight": None if pd.isna(getattr(r, "weight", np.nan)) else int(r.weight),
            "height_z": hz[j], "weight_z": wz[j], "tests": tests, "athletic": athletic,
            "senior": senior, "p4": bool(getattr(r, "p4", 0) == 1), "fcs": bool(getattr(r, "fcs", 0) == 1),
            "senior_bowl": (k, "senior_bowl") in sbk, "shrine": (k, "shrine") in sbk,
            "flags": flk.get(k, []),
            "real_pick": None if pd.isna(r.pick) else int(r.pick),
            "real_team": None if pd.isna(r.pick) else asof.fix(r.nfl_team),
            "real_pos": None if pd.isna(r.pick) else str(r.draft_pos)})
    return rows


# ---------- teams ----------
def team_block(Y, S=None, roster_file=None):
    """Per team as of draft eve: needs, QB, standings, scheme (charted shares from season S plus the labels of
    the staff in place for season Y) and the front office with its profile (pipeline/profiles.py)."""
    import profiles as PR
    S = S if S is not None else Y - 1
    nf = asof.need_features(Y, S, roster_file)
    qb = asof.qb_situation(Y, S, roster_file)
    st = asof.standings(Y)
    sc = asof.scheme_computed(S)
    # Charting for a season in progress is not out yet (play participation): the season before fills the gaps.
    prev = asof.scheme_computed(S - 1) if any("man_share" not in sc[t] for t in asof.TEAMS) else {}
    fut = asof.future_picks(Y)
    teams = {}
    for t in asof.TEAMS:
        part = nf[nf.team == t]
        needs = {r.group: {f: round(float(getattr(r, f)), 4) for f in asof.NEED_FEATURES} | {"starters": r.starters}
                 for r in part.itertuples()}
        scheme = {**prev.get(t, {}), **sc[t]}
        lab = PR.scheme_labels(Y, t) or PR.scheme_labels(S, t)
        if lab:
            scheme.update({k: v for k, v in lab.items() if k != "front_label"})
            # The labelled base front of the current staff wins over the one read from last year's depth charts.
            if lab["front_label"] in ("34", "43"):
                scheme["front"] = lab["front_label"]
            elif lab["front_label"] == "hybrid":
                scheme["front"] = "hybrid"
        teams[t] = {"abbr": t, "needs": needs, "qb": qb[t], "standing": st[t], "scheme": scheme,
                    "front_office": PR.profile(Y, t) or {},
                    "future_picks": [f for f in fut if f["owner"] == t]}
    return teams


def picks(Y):
    """Real picks with draft-eve and final owners (draft-day trades undone by following each pick's chain)."""
    import trade_history as TH
    d = pd.read_csv(C.RAW / "draft_picks.csv", low_memory=False)
    d = d[d.season == Y].sort_values("pick")
    tr = TH.raw_trades(Y) if Y in TH.FIRST_DAY else pd.DataFrame(columns=["pick_season", "pick_number"])
    tr = tr[(tr.pick_season == Y) & tr.pick_number.notna()]
    eve = {}
    for p, part in tr.groupby("pick_number"):
        gave = list(part.gave)
        got = list(part.received)
        start = [g for g in gave if g not in got] or gave[:1]
        eve[int(p)] = start[0]
    out = []
    for r in d.itertuples():
        final = asof.fix(r.team)
        out.append({"overall": int(r.pick), "round": int(r.round), "final": final, "eve": eve.get(int(r.pick), final),
                    "player": r.pfr_player_name, "pos": r.position})
    return out, len(tr.trade_id.unique()) if len(tr) else 0


def build(Y, fresh=False):
    chart = json.loads((C.APP_DATA / "value_chart.json").read_text())
    vpick = BA.value_of_pick(chart)
    # The model's view of the class only changes when the college data or the model does: kept between runs.
    cache = OUT / f"model_rows_{Y}.pkl"
    if cache.exists() and not fresh:
        P = pd.read_pickle(cache)
    else:
        P = model_rows(Y)
        OUT.mkdir(parents=True, exist_ok=True)
        P.to_pickle(cache)
    pool, unmatched = prospects(Y, P, vpick)
    pros = prospect_records(pool, Y, vpick)
    pk, ntr = picks(Y)
    teams = team_block(Y)
    out = {"year": Y, "has_board": load_board(Y) is not None, "board_unmatched": [f"{r.rank} {r.name}" for r in unmatched],
           "draft_day_trades_in_data": ntr, "prospects": pros, "picks": pk, "teams": teams}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"draft_{Y}.json").write_text(json.dumps(out, allow_nan=False))
    inpool = sum(1 for p in pros if p["real_pick"])
    print(Y, "pool", len(pros), "real picks in pool", inpool, "of", len(pk), "R1 in pool",
          sum(1 for p in pros if p["real_pick"] and p["real_pick"] <= 32), "board unmatched", len(unmatched),
          "trades", ntr, file=sys.stderr)


if __name__ == "__main__":
    fresh = "--fresh" in sys.argv
    for a in sys.argv[1:]:
        if a != "--fresh":
            build(int(a), fresh)
