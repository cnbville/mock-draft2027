"""The live 2027 draft's AI inputs, built by the same functions as the backtest's past drafts (draft_inputs.py).

Runs after nfl.py and build_app.py and adds to their files:

  teams.json      per team: the need facts the AI weighs (merged into each group's need entry), the QB on draft
                  eve, standings (this season projected), scheme, the front office with its draft profile, and the
                  2028 picks it holds
  prospects.json  per player an "ai" block: the model's rank, size, testing, experience, level, all-star games,
                  public flags and how much the boards disagree on him

Testing, all-star games and most flags come out from January to March; until then those fields are empty and the
AI leaves them out (the same rule as a past draft built before its combine).
"""
import json
import math
import sys

import numpy as np
import pandas as pd

import asof
import build_app as BA
import common as C
import draft_inputs as DI

Y = 2027
S = C.CURRENT_SEASON  # the season in progress


def board_spread(prospects):
    """How much the public boards disagree on a player: the spread of his log ranks across the boards that list
    him (2 or more), as a z-score within the pool, put on the scale of Arif Hasan's variance column that the
    backtest's boards carry (mean 90, sd 15; computed). Players on fewer than two boards get none."""
    sd = {}
    for p in prospects:
        r = [v for v in (p.get("board_ranks") or {}).values() if v]
        if len(r) >= 2:
            sd[p["id"]] = float(np.std(np.log(r)))
    if len(sd) < 10:
        return {}
    v = np.array(list(sd.values()))
    mu, s = v.mean(), v.std() or 1
    return {k: round(90 + 15 * (x - mu) / s, 1) for k, x in sd.items()}


def prospect_ai(prospects, vpick):
    P = pd.read_csv(C.BUILD / "prospects_scored.csv", low_memory=False).set_index("athlete_id")
    rows = []
    for p in prospects:
        r = P.loc[p["id"]] if p["id"] in P.index else None
        mv = (p.get("p_drafted") or 0) * vpick(p.get("exp_pick") or 262)
        rows.append({"athlete_id": p["id"], "name": p["name"], "board_name": p["name"], "team": p["school"],
                     "group": p["group"], "k": C.norm_name(p["name"]), "kc": C.norm_college(p["school"]),
                     "board_value": p["board_value"], "consensus_rank": p.get("consensus_rank"),
                     "model_value": mv, "board_rank": p["board_rank"], "height": p.get("height"),
                     "weight": p.get("weight"), "roster_year": p.get("class_year"),
                     "n_roster_seasons": p.get("roster_seasons"),
                     "p4": float(r.p4) if r is not None and pd.notna(r.p4) else 0.0,
                     "fcs": float(r.fcs) if r is not None and pd.notna(r.fcs) else 0.0,
                     "pick": np.nan, "nfl_team": None, "draft_pos": None})
    pool = pd.DataFrame(rows)
    pool["consensus_rank"] = pd.to_numeric(pool.consensus_rank, errors="coerce")
    for c in ("height", "weight", "roster_year", "n_roster_seasons"):
        pool[c] = pd.to_numeric(pool[c], errors="coerce")
    spread = board_spread(prospects)
    pool["variance"] = pool.athlete_id.map(spread)
    recs = DI.prospect_records(pool, Y, vpick)
    keys = ("model_rank", "variance", "height_z", "weight_z", "tests", "athletic", "senior", "p4", "fcs",
            "senior_bowl", "shrine", "flags")
    # combine_invite stays unknown (null) until the invite list is out in early February.
    return {rec["id"]: {k: rec[k] for k in keys} | {"combine_invite": None} for rec in recs}


def main():
    teams = json.loads((C.APP_DATA / "teams.json").read_text())
    prospects = json.loads((C.APP_DATA / "prospects.json").read_text())
    chart = json.loads((C.APP_DATA / "value_chart.json").read_text())
    vpick = BA.value_of_pick(chart)

    block = DI.team_block(Y, S)
    for t, x in teams["teams"].items():
        b = block[t]
        for g, raw in b["needs"].items():
            # The fitted need facts sit next to the page's own need entry; its starters list stays.
            entry = x["needs"].setdefault(g, {"need": 0.0, "starters": raw["starters"], "notes": []})
            entry.update({f: raw[f] for f in asof.NEED_FEATURES})
        st = dict(b["standing"])
        if x.get("proj_wins") is not None:
            # This season is still being played: its projected record (nfl.py's simulation; computed).
            st["win_pct"] = round(float(x["proj_wins"]) / 17, 3)
            st["win_pct_projected"] = True
        x.update({"qb": b["qb"], "standing": st, "scheme": b["scheme"], "front_office": b["front_office"],
                  "future_picks": [f | {"season": Y + 1} for f in b["future_picks"]]})
    teams["draft_year"] = Y
    (C.APP_DATA / "teams.json").write_text(json.dumps(teams))

    ai = prospect_ai(prospects, vpick)
    for p in prospects:
        p["ai"] = ai[p["id"]]
    (C.APP_DATA / "prospects.json").write_text(json.dumps(prospects, separators=(",", ":"), allow_nan=False))

    n_tests = sum(1 for p in prospects if p["ai"]["athletic"] is not None)
    n_flags = sum(1 for p in prospects if p["ai"]["flags"])
    n_spread = sum(1 for p in prospects if p["ai"]["variance"] is not None)
    fo = sum(1 for x in teams["teams"].values() if x["front_office"])
    print(f"ai inputs: {fo} front offices, {n_tests} players tested, {n_flags} flagged, {n_spread} with a board spread",
          file=sys.stderr)


if __name__ == "__main__":
    main()
