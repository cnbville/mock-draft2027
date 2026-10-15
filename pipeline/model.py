"""The draft position model, the hit-rate tables and the pick value chart.

Output:
  build/prospects_scored.csv   2027 prospects with model chance of being drafted and expected pick
  build/history_scored.csv     past players with out-of-sample predictions (for comparisons)
  app/data/hit_rates.json, app/data/value_chart.json
  docs/model-report.md
"""
import json
import sys

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import roc_auc_score

from common import APP_DATA, BUILD, RAW, ROOT
from players import DRAFT_POS, GROUPS, split_group

TRAIN_FROM = 2017      # match rates before 2017 are too low (see players.py output)
TEST_FROM = 2024       # held-out drafts for the report


def resolve_groups(df):
    sacks = df.get("f_sacks_pg", pd.Series(0, index=df.index)).fillna(0)
    out = []
    for g, h, w, s in zip(df.group0, df.height, df.weight, sacks):
        out.append(split_group(g, h, w, {"sacks_pg": s}) if isinstance(g, str) else "UNK")
    return out


def feature_frame(df):
    feats = [c for c in df.columns if c.startswith(("f_", "p_", "c_"))
             and c not in ("c_first",)] + ["height", "weight", "n_roster_seasons", "p4", "fcs"]
    X = df[feats].astype(float).copy()
    X["group"] = pd.Categorical(df.group, categories=GROUPS + ["UNK"]).codes
    return X


def value_chart(d):
    """Average career value (weighted AV) by pick 2000-2019, smoothed, scaled to pick 1 = 3000."""
    d = d[d.season.between(2000, 2019) & d.pick.between(1, 262)].copy()
    d["w_av"] = d.w_av.fillna(0)
    av = d.groupby("pick").w_av.mean().reindex(range(1, 263)).interpolate()
    # Smooth: a centred rolling mean (wider later in the draft), then force it to fall pick by pick.
    smooth = np.array([av.iloc[max(0, i - w):i + w + 1].mean()
                       for i, w in zip(range(len(av)), [min(2 + i // 6, 12) for i in range(len(av))])])
    smooth = np.maximum.accumulate(smooth[::-1])[::-1]
    scaled = smooth / smooth[0] * 3000
    jj = jimmy_johnson()
    return {"source": "nflverse draft_picks 2000-2019, weighted career AV per pick, smoothed (computed)",
            "points": [{"pick": int(p), "av": round(float(a), 2), "value": round(float(v), 1),
                        "jimmy_johnson": jj.get(int(p))}
                       for p, a, v in zip(av.index, av.values, scaled)]}


def jimmy_johnson():
    """Approximation of the 1990s Jimmy Johnson trade chart (published; this curve is an approximation to check)."""
    pts = {1: 3000, 2: 2600, 3: 2200, 4: 1800, 5: 1700, 6: 1600, 7: 1500, 8: 1400, 9: 1350, 10: 1300,
           11: 1250, 12: 1200, 13: 1150, 14: 1100, 15: 1050, 16: 1000, 17: 950, 18: 900, 19: 875, 20: 850,
           21: 800, 22: 780, 23: 760, 24: 740, 25: 720, 26: 700, 27: 680, 28: 660, 29: 640, 30: 620,
           31: 600, 32: 590, 33: 580, 40: 500, 48: 420, 56: 340, 64: 270, 72: 230, 80: 190, 88: 160,
           96: 116, 104: 96, 112: 76, 120: 56, 128: 43, 136: 37, 144: 32, 160: 23, 176: 15, 192: 8,
           208: 4, 224: 2, 257: 1}
    keys = sorted(pts)
    out = {}
    for p in range(1, 263):
        if p in pts:
            out[p] = pts[p]
            continue
        lo = max(k for k in keys if k < p) if p > 1 else 1
        hi = min((k for k in keys if k > p), default=257)
        if p > 257:
            out[p] = 1
            continue
        t = (p - lo) / (hi - lo)
        out[p] = round(pts[lo] + (pts[hi] - pts[lo]) * t)
    return out


def hit_rates(d):
    """Chance of each outcome by pick band and position group, drafts 2000-2021 (computed)."""
    d = d[d.season.between(2000, 2021)].copy()
    d["group"] = d.position.map(DRAFT_POS).fillna("UNK")
    d.loc[d.group == "OL", "group"] = "IOL"
    d.loc[d.group == "DL", "group"] = "DT"
    d.loc[d.group == "DB", "group"] = "CB"
    st = d.seasons_started.fillna(0)
    pb = (d.probowls.fillna(0) + d.allpro.fillna(0)) > 0
    d["outcome"] = np.select([pb, st >= 5, st >= 3, st >= 1], ["pro_bowl", "good_starter", "starter", "backup"], "bust")
    bands = [(1, 5), (6, 10), (11, 20), (21, 32), (33, 48), (49, 64), (65, 100), (101, 140), (141, 180), (181, 224), (225, 262)]
    order = ["bust", "backup", "starter", "good_starter", "pro_bowl"]
    out = {"source": "nflverse draft_picks 2000-2021: seasons started and Pro Bowls (computed)",
           "definitions": {"bust": "0 seasons as a primary starter", "backup": "1-2 seasons as a starter",
                           "starter": "3-4 seasons as a starter", "good_starter": "5+ seasons as a starter",
                           "pro_bowl": "at least one Pro Bowl or All-Pro"},
           "outcomes": order, "bands": [], "by_group": {}}
    for lo, hi in bands:
        part = d[d.pick.between(lo, hi)]
        out["bands"].append({"lo": lo, "hi": hi, "n": int(len(part)),
                             "rates": {o: round(float((part.outcome == o).mean()), 3) for o in order}})
    # Position groups: blend the group's own rate with the overall band rate by sample size (k = 20).
    for g in GROUPS:
        rows = []
        for i, (lo, hi) in enumerate(bands):
            part = d[(d.group == g) & d.pick.between(lo, hi)]
            n = len(part)
            w = n / (n + 20)
            rates = {o: round(float(w * ((part.outcome == o).mean() if n else 0) +
                                    (1 - w) * out["bands"][i]["rates"][o]), 3) for o in order}
            rows.append({"lo": lo, "hi": hi, "n": int(n), "rates": rates})
        out["by_group"][g] = rows
    return out


def main():
    H = pd.read_csv(BUILD / "history_rows.csv", low_memory=False)
    P = pd.read_csv(BUILD / "prospects_2027.csv", low_memory=False)
    H = H[H.draft_year >= TRAIN_FROM].copy()
    H["group"] = resolve_groups(H)
    P["group"] = resolve_groups(P)
    # Skip players with no size and no stats at all (mostly roster placeholders).
    H = H[H.height.notna() | H.f_games.notna()]
    XH, XP = feature_frame(H), feature_frame(P)
    cat = [XH.columns.get_loc("group")]

    def fit(train):
        clf = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=31,
                                             categorical_features=cat, random_state=7)
        clf.fit(XH[train], H.drafted[train])
        dr = train & (H.drafted == 1)
        reg = HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05, max_leaf_nodes=15,
                                            categorical_features=cat, random_state=7)
        reg.fit(XH[dr], np.log(H.pick[dr]))
        return clf, reg

    # Held-out test.
    tr, te = (H.draft_year < TEST_FROM).values, (H.draft_year >= TEST_FROM).values
    clf, reg = fit(tr)
    p_te = clf.predict_proba(XH[te])[:, 1]
    auc = roc_auc_score(H.drafted[te], p_te)
    dr_te = te & (H.drafted == 1).values
    rho = spearmanr(np.exp(reg.predict(XH[dr_te])), H.pick[dr_te]).correlation
    # Top-N: of the model's top 100 each test year, how many went in round 1-3?
    Ht = H[te].copy()
    Ht["p"] = p_te
    Ht["epick"] = np.exp(reg.predict(XH[te]))
    Ht["score"] = Ht.p / np.log1p(Ht.epick)
    by_group = []
    for g in GROUPS:
        m = (Ht.group == g)
        if m.sum() > 50 and Ht.drafted[m].nunique() == 2:
            by_group.append((g, int(Ht.drafted[m].sum()), roc_auc_score(Ht.drafted[m], Ht.p[m])))
    top = []
    for y, part in Ht.groupby("draft_year"):
        best = part.sort_values("score", ascending=False).head(100)
        top.append((y, int((best.pick <= 100).sum()), int(best.drafted.sum())))

    # Out-of-sample predictions for every past year (for comparisons), then the final fit on everything.
    H["p_drafted"], H["exp_pick"] = np.nan, np.nan
    for y in sorted(H.draft_year.unique()):
        m_tr, m_te = (H.draft_year != y).values, (H.draft_year == y).values
        c, r = fit(m_tr)
        H.loc[m_te, "p_drafted"] = c.predict_proba(XH[m_te])[:, 1]
        H.loc[m_te, "exp_pick"] = np.exp(r.predict(XH[m_te]))
    clf, reg = fit(np.ones(len(H), bool))
    P["p_drafted"] = clf.predict_proba(XP)[:, 1]
    P["exp_pick"] = np.exp(reg.predict(XP))
    H.to_csv(BUILD / "history_scored.csv", index=False, float_format="%.4f")
    P.to_csv(BUILD / "prospects_scored.csv", index=False, float_format="%.4f")

    d = pd.read_csv(RAW / "draft_picks.csv", low_memory=False)
    APP_DATA.mkdir(parents=True, exist_ok=True)
    (APP_DATA / "value_chart.json").write_text(json.dumps(value_chart(d)))
    (APP_DATA / "hit_rates.json").write_text(json.dumps(hit_rates(d)))

    n_tr, n_te = int(tr.sum()), int(te.sum())
    lines = [
        "# Draft position model: report",
        "",
        f"Built by `pipeline/model.py`. Trained on the {TRAIN_FROM}-{TEST_FROM - 1} drafts ({n_tr} players who left college), "
        f"tested on the {TEST_FROM}-2026 drafts it never saw ({n_te} players).",
        "",
        "What it predicts: the chance a player is drafted, and if drafted, how early. It uses only what the free data has: "
        "position, size, play-level stats (no tackles, pressures or snaps), shares of team output, opponent strength, "
        "level, team strength and how many seasons he was on a roster.",
        "",
        "## Results on the held-out drafts (computed)",
        "",
        f"- Drafted or not, ranking quality (AUC, 0.5 = coin flip, 1 = perfect): **{auc:.3f}**.",
        f"- Among drafted players, rank agreement between predicted and real pick (Spearman): **{rho:.3f}**.",
        "- The model's top 100 each year, and how many went in the top 100 / were drafted at all:",
        "",
        "| Draft | Top-100 picks | Drafted |",
        "|---|---|---|",
    ] + [f"| {y} | {a} | {b} |" for y, a, b in top] + [
        "",
        "Drafted-or-not AUC by position group (low numbers mean the free stats say little about that position):",
        "",
        "| Group | Drafted in test | AUC |",
        "|---|---|---|",
    ] + [f"| {g} | {n} | {a:.3f} |" for g, n, a in by_group] + [
        "",
        "## What this means",
        "",
        "- The model is a second opinion, mainly useful below the public boards' top 150, where it fills out a 257-pick draft.",
        "- Offensive linemen have no stats at all in the free data (only size, team and level), so their AUC is the lowest and the public boards carry them.",
        "- The match between college rosters and the draft list is 82-99% per year (lower before 2019); unmatched picks count as "
        "undrafted in training, which makes the model a little too pessimistic for those years.",
    ]
    (ROOT / "docs" / "model-report.md").write_text("\n".join(lines) + "\n")
    (APP_DATA / "model_report.json").write_text(json.dumps({
        "train": f"{TRAIN_FROM}-{TEST_FROM - 1}", "test": f"{TEST_FROM}-2026", "auc": auc, "spearman": rho,
        "top100": [{"year": int(y), "top100": a, "drafted": b} for y, a, b in top],
        "by_group": [{"group": g, "n": n, "auc": a} for g, n, a in by_group]}))
    print("\n".join(lines), file=sys.stderr)


if __name__ == "__main__":
    main()
