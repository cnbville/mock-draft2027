"""Build the prospect pool for the web app.

Output: app/data/prospects.json, app/data/combine_pct.json, app/data/meta.json
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from common import APP_DATA, BUILD, CURRENT_SEASON, DATA, RAW, norm_name
from players import GROUPS

POOL_SIZE = 700

# Board files: weight in the consensus (picked by Claude: the newest board counts double).
BOARDS = [
    {"file": "cbs-renner_2026-10-14.csv", "label": "CBS Sports (Mike Renner)", "short": "CBS", "date": "2026-10-14", "weight": 2.0},
    {"file": "nfldraftbuzz_2026-10-15.csv", "label": "NFL Draft Buzz", "short": "Buzz", "date": "fetched 2026-10-15", "weight": 1.0},
    {"file": "pff_2026-04-28.csv", "label": "PFF", "short": "PFF", "date": "2026-04-28", "weight": 1.0},
]
BOARD_POS = {"ED": "EDGE", "EDGE": "EDGE", "DE": "EDGE", "T": "OT", "OT": "OT", "G": "IOL", "OG": "IOL", "C": "IOL",
             "IOL": "IOL", "DI": "DT", "DT": "DT", "DL": "DT", "HB": "RB", "RB": "RB", "LB": "LB", "CB": "CB",
             "S": "S", "QB": "QB", "WR": "WR", "TE": "TE"}

# Trait list per group. "stat" names the stat behind a stat estimate; None = film only.
TRAITS = {
    "QB": [("Accuracy", "f_comp_pct", 1), ("Big-play passing", "f_ypa", 1), ("Avoids turnovers", "int_rate", -1),
           ("Avoids sacks", "sack_rate", -1), ("Mobility", "f_rush_yds_pg", 1), ("Arm strength", None, 0),
           ("Processing", None, 0), ("Pocket feel", None, 0)],
    "RB": [("Explosiveness", "f_ypc", 1), ("Workload", "f_rush_att_pg", 1), ("Receiving", "f_rec_yds_pg", 1),
           ("Share of offense", "f_sh_scrimmage", 1), ("Vision", None, 0),
           ("Pass protection", None, 0), ("Contact balance", None, 0)],
    "WR": [("Hands", "f_catch_rate", 1), ("Efficiency per target", "f_ypt", 1),
           ("Share of passing game", "f_sh_dominator", 1), ("Scoring", "f_sh_rec_td", 1),
           ("Route running", None, 0), ("Release vs press", None, 0), ("After the catch", None, 0)],
    "TE": [("Hands", "f_catch_rate", 1), ("Efficiency per target", "f_ypt", 1),
           ("Share of passing game", "f_sh_rec_yds", 1), ("Inline blocking", None, 0), ("Route running", None, 0)],
    "OT": [("Pass sets", None, 0), ("Hand use", None, 0), ("Anchor", None, 0), ("Run blocking", None, 0),
           ("Feet and recovery", None, 0)],
    "IOL": [("Pass protection", None, 0), ("Hand use", None, 0), ("Anchor", None, 0), ("Run blocking", None, 0),
            ("Awareness vs stunts", None, 0)],
    "EDGE": [("Sack production", "f_sacks_pg", 1), ("Share of team sacks", "f_sh_sacks", 1),
             ("Forced fumbles", "f_ff_pg", 1), ("Get-off", None, 0), ("Bend", None, 0), ("Hand use", None, 0),
             ("Run defense", None, 0)],
    "DT": [("Sack production", "f_sacks_pg", 1), ("Share of team sacks", "f_sh_sacks", 1), ("Power", None, 0),
           ("Run defense", None, 0), ("Hand use", None, 0)],
    "LB": [("Coverage plays", "cov_pg", 1), ("Pass rush", "f_sacks_pg", 1), ("Range", None, 0),
           ("Tackling", None, 0), ("Instincts", None, 0)],
    "CB": [("Ball skills", "cov_pg", 1), ("Share of team pass defense", "cov_share", 1),
           ("Interceptions", "f_ints_pg", 1), ("Press", None, 0), ("Hips and transition", None, 0),
           ("Long speed", None, 0), ("Tackling", None, 0)],
    "S": [("Ball skills", "cov_pg", 1), ("Share of team pass defense", "cov_share", 1),
          ("Interceptions", "f_ints_pg", 1), ("Range", None, 0), ("Tackling", None, 0), ("Versatility", None, 0)],
    "K": [("Field goal accuracy", "fg_pct", 1), ("Leg strength", None, 0)],
    "P": [("Hang time and distance", None, 0), ("Directional punting", None, 0)],
    "LS": [("Snap speed and accuracy", None, 0)],
}

# Board names that differ from the roster name (nicknames). Checked by hand.
NAME_ALIASES = {"tae johnson": "brauntae johnson", "dom nichols": "dominic nichols"}

COMP_FEATS = ["height", "weight", "f_sh_dominator", "f_sh_rush_yds", "f_sacks_pg", "cov_pg", "f_rec_yds_pg",
              "f_rush_yds_pg", "f_pass_yds_pg", "f_comp_pct", "p4", "f_team_elo"]


def add_derived(df):
    df = df.copy()
    att = df.get("f_pass_att_pg", 0)
    df["int_rate"] = np.where(att > 5, df.f_pass_int_pg / att.clip(lower=1), np.nan)
    df["sack_rate"] = np.where(att > 5, df.f_sacked_pg / (att + df.f_sacked_pg).clip(lower=1), np.nan)
    df["cov_pg"] = df.f_pbu_pg.fillna(0) + df.f_ints_pg.fillna(0)
    df["cov_share"] = (df.f_sh_pbu.fillna(0) + df.f_sh_ints.fillna(0)) / 2
    fga = df.f_fg_made_pg.fillna(0) + df.f_fg_missed_pg.fillna(0)
    df["fg_pct"] = np.where(fga > 0.3, df.f_fg_made_pg / fga.clip(lower=0.01), np.nan)
    return df


def value_of_pick(chart):
    vals = {p["pick"]: p["value"] for p in chart["points"]}
    return lambda pick: vals.get(int(np.clip(round(pick), 1, 262)), 1.0)


def load_boards():
    rows = []
    for b in BOARDS:
        d = pd.read_csv(DATA / "boards" / b["file"])
        d["board"] = b["label"]
        d["weight"] = b["weight"]
        d["n"] = d["rank"].max()
        rows.append(d)
    d = pd.concat(rows)
    d["k"] = d.name.map(norm_name).replace(NAME_ALIASES)
    d["bgroup"] = d.position.map(BOARD_POS)
    return d


def consensus(boards):
    out = {}
    labels = [b["label"] for b in BOARDS]
    for k, part in boards.groupby("k"):
        ranks = {r.board: int(r.rank) for r in part.itertuples()}
        tot, wsum = 0.0, 0.0
        for b in BOARDS:
            r = ranks.get(b["label"])
            if r is None:
                r = boards[boards.board == b["label"]].n.max() + 30  # not on that board (estimated penalty)
            tot += b["weight"] * r
            wsum += b["weight"]
        group = part.bgroup.mode().iloc[0]
        for lab in ("CBS Sports (Mike Renner)", "PFF"):
            g = part[part.board == lab].bgroup
            if len(g):
                group = g.iloc[0]
                break
        out[k] = {"avg_rank": tot / wsum, "ranks": ranks, "group": group, "name": part.name.iloc[0],
                  "school": part.school.mode().iloc[0], "boards_listed": len(ranks)}
    ordered = sorted(out, key=lambda k: out[k]["avg_rank"])
    for i, k in enumerate(ordered):
        out[k]["consensus_rank"] = i + 1
    return out, labels


def p_declare(row, cons_rank):
    """Chance an underclassman enters the draft (estimated from how early entrants usually project)."""
    senior = (row.roster_year >= 4) if pd.notna(row.roster_year) else (row.n_roster_seasons >= 4)
    if senior or row.n_roster_seasons >= 5:
        return 1.0
    r = cons_rank if cons_rank else 400
    for cut, p in ((32, 0.92), (64, 0.8), (100, 0.6), (150, 0.4), (250, 0.2)):
        if r <= cut:
            return p
    return 0.1


def percentile_tables():
    c = pd.read_csv(RAW / "combine.csv", low_memory=False)
    pos = {"WR": "WR", "CB": "CB", "RB": "RB", "FB": "RB", "OT": "OT", "DT": "DT", "S": "S", "SAF": "S", "DE": "EDGE",
           "EDGE": "EDGE", "OLB": "EDGE", "TE": "TE", "QB": "QB", "OG": "IOL", "G": "IOL", "C": "IOL", "OL": "IOL",
           "ILB": "LB", "LB": "LB", "DL": "DT", "DB": "CB", "P": "P", "K": "K", "LS": "LS"}
    c["group"] = c.pos.map(pos)

    def inches(h):
        try:
            f, i = str(h).split("-")
            return int(f) * 12 + int(i)
        except ValueError:
            return np.nan
    c["height"] = c.ht.map(inches)
    c["weight"] = pd.to_numeric(c.wt, errors="coerce")
    tests = {"height": 1, "weight": 1, "forty": -1, "vertical": 1, "bench": 1, "broad_jump": 1, "cone": -1,
             "shuttle": -1}
    out = {"source": "nflverse combine 2000-2026 (computed)", "tests": tests, "groups": {}}
    for g, part in c.groupby("group"):
        out["groups"][g] = {}
        for t in tests:
            v = pd.to_numeric(part[t], errors="coerce").dropna()
            if len(v) >= 20:
                out["groups"][g][t] = [round(float(x), 2) for x in np.quantile(v, np.linspace(0, 1, 101))]
    return out


def pct_of(table, value, direction):
    if table is None or value is None or pd.isna(value):
        return None
    p = np.searchsorted(table, value) / (len(table) - 1)
    p = float(np.clip(p, 0, 1))
    return round(p if direction > 0 else 1 - p, 3)


def group_shares():
    """Share of real draft picks per group, 2015-2026 (computed)."""
    from players import DRAFT_POS
    d = pd.read_csv(RAW / "draft_picks.csv", low_memory=False)
    d = d[d.season >= 2015]
    g = d.position.map(DRAFT_POS).replace({"OL": "IOL", "DL": "DT", "DB": "CB"})
    return g.value_counts(normalize=True).to_dict()


def select_pool(P):
    """Every board player, then the best of the rest by the model, in real draft proportions per group.
    The model's lineman grades are weak, so quotas stop it from flooding the pool with tackles."""
    board = P[P.consensus_rank.notna()]
    # Fill-ins are ranked by value times the chance they enter the draft, so the pool holds enough
    # likely entrants for 257 picks and the UDFA rush.
    rest = P[P.consensus_rank.isna()].assign(entry_value=lambda d: d.board_value * d.p_declare)
    rest = rest.sort_values("entry_value", ascending=False)
    shares = group_shares()
    room = POOL_SIZE - len(board)
    picks = []
    for g, sh in shares.items():
        quota = int(round(sh * POOL_SIZE)) - int((board.group == g).sum())
        if quota > 0:
            picks.append(rest[rest.group == g].head(quota))
    extra = pd.concat(picks).sort_values("entry_value", ascending=False).head(room)
    if len(extra) < room:  # quotas round down: top up with the best of the rest
        more = rest[~rest.index.isin(extra.index)].head(room - len(extra))
        extra = pd.concat([extra, more])
    pool = pd.concat([board, extra]).sort_values("board_value", ascending=False).copy()
    return pool


def main():
    P = pd.read_csv(BUILD / "prospects_scored.csv", low_memory=False)
    H = pd.read_csv(BUILD / "history_scored.csv", low_memory=False)
    P, H = add_derived(P), add_derived(H)
    chart = json.loads((APP_DATA / "value_chart.json").read_text())
    vpick = value_of_pick(chart)
    boards = load_boards()
    cons, labels = consensus(boards)

    # Match board players to roster players: name, then school if several share a name.
    P["k"] = P.name.map(norm_name)
    matched = {}
    for k, c in cons.items():
        cand = P[P.k == k]
        if len(cand) > 1:
            same = cand[cand.team.str.lower() == str(c["school"]).lower()]
            cand = same if len(same) else cand.sort_values("p_drafted", ascending=False)
        if len(cand):
            matched[k] = cand.index[0]
    unmatched = [cons[k]["name"] for k in cons if k not in matched]
    print("board players not found on a 2026 roster:", unmatched, file=sys.stderr)

    P["cons_key"] = None
    for k, i in matched.items():
        P.at[i, "cons_key"] = k
    P["consensus_rank"] = P.cons_key.map(lambda k: cons[k]["consensus_rank"] if k else None)
    P.loc[P.cons_key.notna(), "group"] = P.cons_key.dropna().map(lambda k: cons[k]["group"])
    P["p_declare"] = [p_declare(r, r.consensus_rank if pd.notna(r.consensus_rank) else None) for r in P.itertuples()]
    P["model_value"] = P.p_drafted * P.exp_pick.map(vpick)
    P["model_rank"] = P.model_value.rank(ascending=False, method="first").astype(int)
    # Blended board value for the AI (picked by Claude, estimated weights).
    P["cons_value"] = P.consensus_rank.map(lambda r: vpick(r) if pd.notna(r) else np.nan)
    P["board_value"] = np.where(P.cons_value.notna(), 0.8 * P.cons_value + 0.2 * P.model_value, 0.6 * P.model_value)
    pool = select_pool(P)
    pool["board_rank"] = range(1, len(pool) + 1)

    # Season stat lines for each pool player.
    ps = pd.read_csv(BUILD / "player_seasons.csv", low_memory=False)
    ps["player_id"] = ps.player_id.astype(np.int64)
    ps = ps[ps.player_id.isin(pool.athlete_id)]
    keep = ["season", "team", "games", "pass_comp", "pass_att", "pass_yds", "pass_td", "pass_int", "sacked",
            "rush_att", "rush_yds", "rush_td", "targets", "rec", "rec_yds", "rec_td", "sacks", "ints", "pbu", "ff",
            "fg_made", "fg_missed", "opp_elo", "sh_dominator", "sh_scrimmage", "sh_sacks"]
    lines = {pid: part.sort_values("season")[keep].round(3).to_dict("records") for pid, part in ps.groupby("player_id")}

    # Trait estimates: percentile among drafted players of the same group in their final season.
    drafted = H[H.drafted == 1]
    pcts = percentile_tables()

    def trait_rows(r):
        out = []
        ref = drafted[drafted.group == r.group]
        for name, col, direction in TRAITS.get(r.group, []):
            if col is None:
                out.append({"trait": name, "source": "film only", "est": None})
                continue
            v = getattr(r, col, np.nan)
            vals = ref[col].dropna() if col in ref else pd.Series(dtype=float)
            if pd.isna(v) or len(vals) < 15:
                out.append({"trait": name, "source": "from stats, not film", "est": None, "note": "not enough data"})
                continue
            p = float((vals < v).mean())
            if direction < 0:
                p = 1 - p
            out.append({"trait": name, "source": "from stats, not film", "est": round(1 + 9 * p, 1),
                        "pct": round(p, 3), "stat": col, "value": round(float(v), 3)})
        return out

    # Comparisons: nearest drafted players at the same group (standardised features).
    comp_ref = drafted.copy()
    stats = {}
    for g, part in comp_ref.groupby("group"):
        X = part[COMP_FEATS].astype(float)
        mu, sd = X.mean(), X.std().replace(0, 1)
        stats[g] = (part, ((X - mu) / sd).fillna(0).values, mu, sd)

    def comps(r):
        if r.group not in stats:
            return []
        part, Z, mu, sd = stats[r.group]
        x = ((pd.Series({c: getattr(r, c, np.nan) for c in COMP_FEATS}).astype(float) - mu) / sd).fillna(0).values
        dist = np.sqrt(((Z - x) ** 2).sum(axis=1))
        idx = np.argsort(dist)[:5]
        out = []
        for i in idx:
            q = part.iloc[i]
            out.append({"name": q["name"], "school": q.team, "draft_year": int(q.draft_year), "pick": int(q.pick),
                        "nfl_team": q.nfl_team, "seasons_started": None if pd.isna(q.seasons_started) else int(q.seasons_started),
                        "probowls": None if pd.isna(q.probowls) else int(q.probowls),
                        "similarity": round(float(1 / (1 + dist[i])), 3)})
        return out

    def flags(r, line):
        out = []
        if r.fcs == 1:
            out.append("FCS level: production discounted by how FCS players have done before")
        teams = str(r.teams).split("|") if isinstance(r.teams, str) else []
        if len(teams) > 1:
            out.append(f"Played for {len(teams)} schools: {', '.join(teams)}")
        if r.n_roster_seasons >= 5:
            out.append("Older prospect: fifth season or more on a college roster")
        if pd.notna(r.roster_year) and r.roster_year <= 3 and r.p_declare < 1:
            out.append("Underclassman: may return to school (declare deadline mid-January)")
        if r.group in ("WR", "TE", "RB") and len(line) >= 2:
            best = max(x["sh_scrimmage"] for x in line)
            prev = [x["sh_scrimmage"] for x in line[:-1]]
            if best > 0.18 and max(prev) < 0.06 and r.n_roster_seasons >= 3:
                out.append("Late or one-year production")
        if r.group in ("QB", "RB", "WR", "TE") and line:
            last = [x for x in line if x["season"] == CURRENT_SEASON - 1]
            if last and last[0]["games"] < 7:
                out.append(f"Played only {int(last[0]['games'])} games with a recorded stat in {CURRENT_SEASON - 1} "
                           "(injury, suspension or depth: the data can't say which)")
        return out

    out = []
    for r in pool.itertuples():
        line = lines.get(r.athlete_id, [])
        size = {t: pct_of(pcts["groups"].get(r.group, {}).get(t), getattr(r, t), 1) for t in ("height", "weight")}
        ck = r.cons_key if isinstance(r.cons_key, str) else None
        out.append({
            "id": int(r.athlete_id), "name": cons[ck]["name"] if ck else r.name, "school": r.team,
            "group": r.group, "roster_pos": r.roster_pos, "class_year": None if pd.isna(r.roster_year) else int(r.roster_year),
            "roster_seasons": int(r.n_roster_seasons), "height": None if pd.isna(r.height) else int(r.height),
            "weight": None if pd.isna(r.weight) else int(r.weight), "home": f"{r.home_city}, {r.home_state}" if isinstance(r.home_city, str) else None,
            "headshot": r.headshot if isinstance(r.headshot, str) else None, "teams": r.teams,
            "level": "FCS" if r.fcs == 1 else ("Power 4" if r.p4 == 1 else "Group of 5"),
            "conference": r.conference if isinstance(r.conference, str) else None,
            "consensus_rank": None if pd.isna(r.consensus_rank) else int(r.consensus_rank),
            "board_ranks": cons[ck]["ranks"] if ck else {}, "model_rank": int(r.model_rank),
            "board_rank": int(r.board_rank), "board_value": round(float(r.board_value), 1),
            "p_drafted": round(float(r.p_drafted), 3), "exp_pick": round(float(r.exp_pick), 1),
            "p_declare": r.p_declare, "size_pct": size, "traits": trait_rows(r), "comps": comps(r),
            "flags": flags(r, line), "seasons": line,
        })
    meta = {"built": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M"), "boards": BOARDS, "pool_size": len(out),
            "unmatched_board_players": unmatched, "groups": GROUPS,
            "traits": {g: [t[0] for t in v] for g, v in TRAITS.items()}}
    (APP_DATA / "prospects.json").write_text(json.dumps(out, separators=(",", ":")))
    (APP_DATA / "combine_pct.json").write_text(json.dumps(pcts))
    (APP_DATA / "meta.json").write_text(json.dumps(meta))
    print("pool", len(out), "on boards", sum(1 for x in out if x["consensus_rank"]), file=sys.stderr)


if __name__ == "__main__":
    main()
