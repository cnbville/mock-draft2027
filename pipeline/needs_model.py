"""Needs learned from real drafts.

A team's need at a position is not a guess: it is how much the facts about its roster (starters' pay and
pedigree, snaps, age, expiring deals, depth, recent picks, QB level) changed what real teams drafted.
A conditional logit is fitted on every pick of the 2015-2023 drafts: at each pick the team chooses one of 13
position groups, with group base rates by round and the roster facts as features. Drafts 2024-2026 are kept
out to test it. The fitted model gives each team a need multiplier per group and round.

Output: build/need_features.csv, build/need_model.json, docs/needs-model.md (a study: the draft AI fits needs
itself, together with talent and position, in tools/fit_pick_model.mjs)
"""
import json
import sys

import numpy as np
import pandas as pd
from scipy.optimize import minimize

import asof
from common import APP_DATA, BUILD, RAW, ROOT
from players import DRAFT_POS

GROUPS = list(asof.STARTERS)
FEATS = asof.NEED_FEATURES + ["taken"]
BUCKETS = [(1, 2), (3, 4), (5, 7)]
TRAIN = list(range(2015, 2024))
TEST = [2024, 2025, 2026]
L2 = 1.0


def bucket(rnd):
    return next(i for i, (a, b) in enumerate(BUCKETS) if a <= rnd <= b)


def all_features():
    f = BUILD / "need_features.csv"
    if f.exists():
        return pd.read_csv(f)
    parts = []
    for Y in TRAIN + TEST:
        nf = asof.need_features(Y).drop(columns=["starters"])
        parts.append(nf)
        print("need features", Y, len(nf), file=sys.stderr)
    out = pd.concat(parts)
    out.to_csv(f, index=False)
    return out


def picks(years):
    d = pd.read_csv(RAW / "draft_picks.csv", low_memory=False)
    d = d[d.season.isin(years)].copy()
    d["team"] = d.team.map(asof.fix)
    d["group"] = d.position.map(DRAFT_POS).replace({"OL": "IOL", "DL": "DT", "DB": "CB"})
    d = d[d.group.isin(GROUPS)].sort_values(["season", "pick"])
    return d


def design(F, d):
    """Stack choice situations: X[n, g, f] features, y[n] chosen group, b[n] round bucket."""
    idx = {(r.year, r.team, r.group): r for r in F.itertuples()}
    mu = F.groupby("group")[asof.NEED_FEATURES].mean()
    sd = F[asof.NEED_FEATURES].std().replace(0, 1)
    X, y, b = [], [], []
    for (Y, t), part in d.groupby(["season", "team"]):
        taken = {g: 0 for g in GROUPS}
        for r in part.itertuples():
            rows = []
            for g in GROUPS:
                q = idx.get((Y, t, g))
                v = [(getattr(q, f) - mu.at[g, f]) / sd[f] if q is not None else 0.0 for f in asof.NEED_FEATURES]
                rows.append(v + [float(taken[g])])
            X.append(rows)
            y.append(GROUPS.index(r.group))
            b.append(bucket(int(r.round)))
            taken[r.group] += 1
    return np.array(X), np.array(y), np.array(b), mu, sd


def unpack(theta, nb, ng, nf):
    a = theta[:nb * ng].reshape(nb, ng)
    w = theta[nb * ng:].reshape(nb, nf)
    return a, w


def nll(theta, X, y, b, with_needs=True):
    nb, ng, nf = len(BUCKETS), X.shape[1], X.shape[2]
    a, w = unpack(theta, nb, ng, nf)
    if not with_needs:
        w = w * 0
    u = a[b] + np.einsum("ngf,nf->ng", X, w[b])
    u = u - u.max(axis=1, keepdims=True)
    lse = np.log(np.exp(u).sum(axis=1))
    ll = u[np.arange(len(y)), y] - lse
    pen = L2 * (w ** 2).sum()
    return -ll.sum() + pen


def fit(X, y, b):
    nb, ng, nf = len(BUCKETS), X.shape[1], X.shape[2]
    theta0 = np.zeros(nb * ng + nb * nf)
    res = minimize(nll, theta0, args=(X, y, b), method="L-BFGS-B", options={"maxiter": 2000})
    base = minimize(lambda t: nll(np.concatenate([t, np.zeros(nb * nf)]), X, y, b, False), np.zeros(nb * ng),
                    method="L-BFGS-B")
    return res.x, np.concatenate([base.x, np.zeros(nb * nf)])


def probs(theta, X, b):
    nb, ng, nf = len(BUCKETS), X.shape[1], X.shape[2]
    a, w = unpack(theta, nb, ng, nf)
    u = a[b] + np.einsum("ngf,nf->ng", X, w[b])
    e = np.exp(u - u.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True)


def main():
    F = all_features()
    dtr, dte = picks(TRAIN), picks(TEST)
    Xtr, ytr, btr, mu, sd = design(F, dtr)
    theta, base = fit(Xtr, ytr, btr)
    Xte, yte, bte, _, _ = design(F, dte)
    # Held-out check: log-likelihood per pick with needs vs group base rates alone, and how often the real pick
    # was one of the team's top-3 needs (by the model's need multiplier) in rounds 1-3.
    nte = len(yte)
    ll_needs = -nll(theta, Xte, yte, bte) - L2 * 0  # penalty is on weights; report raw below
    p = probs(theta, Xte, bte)
    p0 = probs(base, Xte, bte)
    ll1 = float(np.log(p[np.arange(nte), yte]).mean())
    ll0 = float(np.log(p0[np.arange(nte), yte]).mean())
    nb, ng, nf = len(BUCKETS), Xte.shape[1], Xte.shape[2]
    a, w = unpack(theta, nb, ng, nf)
    need_u = np.einsum("ngf,nf->ng", Xte, w[bte])
    rank = (-need_u).argsort(axis=1).argsort(axis=1)
    r13 = bte == 0
    top3 = float((rank[np.arange(nte), yte] < 3)[r13].mean())
    hits = float((p.argmax(axis=1) == yte).mean()), float((p0.argmax(axis=1) == yte).mean())
    report = {"train": TRAIN, "test": TEST, "picks_train": int(len(ytr)), "picks_test": int(nte),
              "test_loglik_per_pick_with_needs": round(ll1, 4), "test_loglik_per_pick_base_rates_only": round(ll0, 4),
              "test_top3_need_share_rounds_1_2": round(top3, 3), "test_top1_hit": [round(h, 3) for h in hits]}
    print(json.dumps(report, indent=1), file=sys.stderr)
    _ = ll_needs
    out = {"source": "conditional logit on every pick of the 2015-2023 drafts (computed); tested on 2024-2026",
           "groups": GROUPS, "features": FEATS, "buckets": BUCKETS,
           "weights": [[round(float(x), 4) for x in row] for row in w],
           "base": [[round(float(x), 4) for x in row] for row in a],
           "mean": {g: {f: round(float(mu.at[g, f]), 4) for f in asof.NEED_FEATURES} for g in GROUPS},
           "sd": {f: round(float(sd[f]), 4) for f in asof.NEED_FEATURES}, "report": report}
    (BUILD / "need_model.json").write_text(json.dumps(out, indent=1))
    lines = ["# Needs model", "", "Computed by `pipeline/needs_model.py`. Fitted on every pick of the 2015-2023 drafts and tested on 2024-2026.", "",
             "| Held-out check (2024-2026) | Value |", "|---|---|",
             f"| Picks tested | {nte} |",
             f"| Log-likelihood per pick, with needs | {ll1:.3f} |",
             f"| Same, group base rates only | {ll0:.3f} |",
             f"| Rounds 1-2: real pick was one of the team's top-3 needs | {top3:.0%} (chance about 23%) |", "",
             "Weights per round bucket (standardised features; positive = more likely to draft the group):", "",
             "| Feature | " + " | ".join(f"Rounds {x}-{y}" for x, y in BUCKETS) + " |", "|---|" + "---|" * len(BUCKETS)]
    for j, f in enumerate(FEATS):
        lines.append(f"| {f} | " + " | ".join(f"{w[i, j]:+.2f}" for i in range(len(BUCKETS))) + " |")
    (ROOT / "docs" / "needs-model.md").write_text("\n".join(lines) + "\n")


def need_multipliers(nf_row_by_group, model, taken=None):
    """exp(weights . standardised features) per group and round bucket, mean-centred by the model's league means."""
    out = {}
    for g in model["groups"]:
        q = nf_row_by_group.get(g)
        mults = []
        for i in range(len(model["buckets"])):
            u = 0.0
            for j, f in enumerate(model["features"]):
                if f == "taken":
                    continue
                v = (q[f] - model["mean"][g][f]) / model["sd"][f] if q is not None else 0.0
                u += model["weights"][i][j] * v
            mults.append(u)
        out[g] = mults
    return out


if __name__ == "__main__":
    main()
