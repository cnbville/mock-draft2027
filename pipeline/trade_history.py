"""Real draft-weekend trades 2011-2025: the shapes and prices the trade AI is tuned to, and a market value chart
fitted to what real teams paid.

Output: build/real_trades.json (one record per trade), app/data/trade_market.json (market chart, future-pick
discount, and per-draft trade shapes for 2018-2025).
"""
import json
import sys
from collections import Counter, defaultdict

import numpy as np
import pandas as pd
from scipy.optimize import minimize

import asof
from common import APP_DATA, BUILD, RAW

YEARS = list(range(2011, 2026))
FIRST_DAY = {2011: "2011-04-28", 2012: "2012-04-26", 2013: "2013-04-25", **asof.DRAFT_EVE}
FIT_YEARS = range(2011, 2024)   # the chart is fitted on drafts before the backtest years


def draft_days(Y):
    d0 = pd.Timestamp(FIRST_DAY[Y])
    return {str((d0 + pd.Timedelta(days=i)).date()) for i in range(3)}


def raw_trades(Y):
    """Draft-weekend trade rows, repaired the way the backtest repairs them (true pick numbers from the drafted
    player; a single-row pick whose giver used it is reversed)."""
    tr = pd.read_csv(RAW / "trades.csv", low_memory=False)
    x = tr[tr.trade_date.isin(draft_days(Y))].copy()
    if Y == 2025 and not ((x.trade_id == 1922) & (x.pick_number == 32)).any():
        x = pd.concat([x, pd.DataFrame([{"trade_id": 1922, "season": 2025, "trade_date": "2025-04-24", "gave": "PHI",
                                         "received": "KC", "pick_season": 2025.0, "pick_round": 1.0,
                                         "pick_number": 32.0, "conditional": 0.0, "pfr_id": "SimmJo01",
                                         "pfr_name": "Josh Simmons", "incomplete": True}])], ignore_index=True)
    d = pd.read_csv(RAW / "draft_picks.csv", low_memory=False)
    d = d[d.season == Y].drop_duplicates("pfr_player_id").set_index("pfr_player_id")
    cur = (x.pick_season == Y) & x.pfr_id.isin(d.index)
    x.loc[cur, "pick_number"] = x.loc[cur, "pfr_id"].map(d.pick).astype(float)
    x.loc[cur, "pick_round"] = x.loc[cur, "pfr_id"].map(d["round"]).astype(float)
    picker = d.reset_index().set_index("pick").team.map(asof.fix)
    one = x[(x.pick_season == Y) & x.pick_number.notna()].groupby("pick_number").size()
    for i in x.index[(x.pick_season == Y) & x.pick_number.notna()]:
        pn = x.at[i, "pick_number"]
        if one.get(pn) == 1 and picker.get(int(pn)) == asof.fix(x.at[i, "gave"]) != asof.fix(x.at[i, "received"]):
            x.at[i, "gave"], x.at[i, "received"] = x.at[i, "received"], x.at[i, "gave"]
    x["gave"] = x.gave.map(asof.fix)
    x["received"] = x.received.map(asof.fix)
    return x


def trades(Y):
    x = raw_trades(Y)
    out = []
    for tid, part in x.groupby("trade_id"):
        teams = sorted(set(part.gave) | set(part.received))
        rec = {"year": Y, "id": int(tid), "teams": teams, "incomplete": bool(part.get("incomplete", pd.Series(False)).fillna(False).any())}
        sides = defaultdict(lambda: {"current": [], "future": [], "players": []})
        for r in part.itertuples():
            s = sides[r.gave]
            if pd.notna(r.pick_season) and int(r.pick_season) == Y and pd.notna(r.pick_number):
                s["current"].append(int(r.pick_number))
            elif pd.notna(r.pick_season) and int(r.pick_season) > Y:
                s["future"].append({"season": int(r.pick_season), "round": int(r.pick_round) if pd.notna(r.pick_round) else None,
                                    "to": r.received})
            elif isinstance(r.pfr_name, str) and pd.isna(r.pick_season):
                s["players"].append(r.pfr_name)
        rec["sides"] = {t: sides[t] for t in teams}
        cur = [(min(sides[t]["current"]) if sides[t]["current"] else 999, t) for t in teams]
        if len(teams) == 2:
            # The team moving up receives the earliest current pick, so it is the other team's earliest pick giver.
            first_giver = min(cur)[1]
            down = first_giver
            up = [t for t in teams if t != down][0]
            rec.update({"up": up, "down": down, "up_gives": sorted(sides[up]["current"]),
                        "down_gives": sorted(sides[down]["current"]),
                        "up_future": sides[up]["future"], "down_future": sides[down]["future"],
                        "up_players": sides[up]["players"], "down_players": sides[down]["players"]})
            fp = [p for t in teams for p in sides[t]["current"]]
            rec["first_pick"] = min(fp) if fp else None
            rec["round"] = None if not fp else int(np.searchsorted(ROUND_ENDS[Y], min(fp)) + 1)
            if rec["up_gives"] and rec["down_gives"]:
                rec["slots_moved"] = min(rec["up_gives"]) - min(rec["down_gives"])
        out.append(rec)
    return out


def round_ends():
    d = pd.read_csv(RAW / "draft_picks.csv", low_memory=False)
    return {Y: d[d.season == Y].groupby("round").pick.max().sort_index().values for Y in range(2000, 2027)}


ROUND_ENDS = round_ends()


def chart_curve(params, picks):
    a, b = params
    return 1000.0 * np.exp(-a * (np.asarray(picks, dtype=float) - 1) ** b)


def fit_market(T):
    """Market chart V(p) = 1000 exp(-a (p - 1)^b) and a future-pick factor: each future pick is worth
    f x V(the middle of its round) (computed from what real teams paid in 2011-2023)."""
    rows = []
    for t in T:
        if t["year"] not in FIT_YEARS or len(t["teams"]) != 2 or t.get("incomplete"):
            continue
        if not t.get("up_gives") or not t.get("down_gives") or t["up_players"] or t["down_players"]:
            continue
        rows.append(t)

    def side_value(params, fut, picks, futs, Y):
        v = chart_curve(params, picks).sum()
        for f in futs:
            rnd = f["round"] or 4
            mid = (rnd - 1) * 32 + 16
            v += fut * chart_curve(params, [mid])[0]
        return v

    def loss(theta):
        a, b, fut = np.exp(theta[0]), np.exp(theta[1]), 1 / (1 + np.exp(-theta[2]))
        err = []
        for t in rows:
            up = side_value((a, b), fut, t["up_gives"], t["up_future"], t["year"])
            dn = side_value((a, b), fut, t["down_gives"], t["down_future"], t["year"])
            err.append(np.log(up / dn))
        err = np.array(err)
        # The team moving up pays a small premium on average; fit the chart so the median log price is near 0.
        return float(np.mean(np.abs(err)))

    best = minimize(loss, np.array([np.log(0.02), np.log(0.9), 0.5]), method="Nelder-Mead",
                    options={"maxiter": 4000, "xatol": 1e-5, "fatol": 1e-7})
    a, b, fut = np.exp(best.x[0]), np.exp(best.x[1]), 1 / (1 + np.exp(-best.x[2]))
    ratios = []
    for t in rows:
        up = side_value((a, b), fut, t["up_gives"], t["up_future"], t["year"])
        dn = side_value((a, b), fut, t["down_gives"], t["down_future"], t["year"])
        ratios.append(up / dn)
    return {"a": round(float(a), 6), "b": round(float(b), 6), "future_factor": round(float(fut), 4),
            "fit_trades": len(rows), "median_ratio": round(float(np.median(ratios)), 4),
            "p10_ratio": round(float(np.percentile(ratios, 10)), 4), "p90_ratio": round(float(np.percentile(ratios, 90)), 4),
            "mean_abs_log_err": round(float(best.fun), 4)}


def shapes(T, years):
    per = []
    for Y in years:
        ts = [t for t in T if t["year"] == Y]
        two = [t for t in ts if len(t["teams"]) == 2 and t.get("round")]
        rounds = Counter(t["round"] for t in two)
        per.append({
            "year": Y, "trades": len(ts), "with_current_picks": len(two),
            "r1": rounds.get(1, 0), "r2": rounds.get(2, 0), "r3": rounds.get(3, 0),
            "r4_7": sum(rounds.get(r, 0) for r in range(4, 8)),
            "with_future": sum(bool(t["up_future"] or t["down_future"]) for t in two),
            "future_only": sum(1 for t in ts if len(t["teams"]) == 2 and not t.get("round")),
            "with_players": sum(bool(t["up_players"] or t["down_players"]) for t in two),
            "down_adds_pick": sum(len(t["down_gives"]) >= 2 for t in two),
            "slots_moved": [t["slots_moved"] for t in two if t.get("slots_moved") is not None]})
    sm = [x for p in per for x in p["slots_moved"]]
    agg = {k: round(float(np.mean([p[k] for p in per])), 2) for k in
           ("trades", "with_current_picks", "r1", "r2", "r3", "r4_7", "with_future", "future_only", "with_players", "down_adds_pick")}
    agg["slots_moved_median"] = float(np.median(sm))
    agg["slots_moved_p90"] = float(np.percentile(sm, 90))
    agg["slots_moved_max"] = int(max(sm))
    for p in per:
        p["slots_moved"] = {"median": float(np.median(p["slots_moved"])) if p["slots_moved"] else None,
                            "max": max(p["slots_moved"]) if p["slots_moved"] else None}
    return per, agg


def main():
    T = [t for Y in YEARS for t in trades(Y)]
    (BUILD / "real_trades.json").write_text(json.dumps(T))
    market = fit_market(T)
    per, agg = shapes(T, range(2018, 2024))
    per_test, agg_test = shapes(T, range(2024, 2026))
    out = {"source": "nflverse trades 2011-2025, draft weekends only (computed)", "market_chart": market,
           "shapes_2018_2023": agg, "shapes_2024_2025": agg_test, "per_draft": per + per_test}
    (APP_DATA / "trade_market.json").write_text(json.dumps(out, indent=1))
    print(json.dumps({"market": market, "train": agg, "test": agg_test}, indent=1), file=sys.stderr)


if __name__ == "__main__":
    main()
