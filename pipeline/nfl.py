"""NFL side: teams, the 2026 season so far, projected 2027 draft order, pick ownership,
needs, cap commitments and each team's draft habits.

Output: app/data/teams.json
"""
import json
import sys
from collections import defaultdict

import numpy as np
import pandas as pd

from common import APP_DATA, CURRENT_SEASON, DATA, DRAFT_YEAR, RAW, norm_name
from players import DRAFT_POS

# Published, stable: conference and division of each team.
DIVISIONS = {
    "AFC East": ["BUF", "MIA", "NE", "NYJ"], "AFC North": ["BAL", "CIN", "CLE", "PIT"],
    "AFC South": ["HOU", "IND", "JAX", "TEN"], "AFC West": ["DEN", "KC", "LV", "LAC"],
    "NFC East": ["DAL", "NYG", "PHI", "WAS"], "NFC North": ["CHI", "DET", "GB", "MIN"],
    "NFC South": ["ATL", "CAR", "NO", "TB"], "NFC West": ["ARI", "LA", "SF", "SEA"],
}
NAMES = {
    "ARI": "Arizona Cardinals", "ATL": "Atlanta Falcons", "BAL": "Baltimore Ravens", "BUF": "Buffalo Bills",
    "CAR": "Carolina Panthers", "CHI": "Chicago Bears", "CIN": "Cincinnati Bengals", "CLE": "Cleveland Browns",
    "DAL": "Dallas Cowboys", "DEN": "Denver Broncos", "DET": "Detroit Lions", "GB": "Green Bay Packers",
    "HOU": "Houston Texans", "IND": "Indianapolis Colts", "JAX": "Jacksonville Jaguars", "KC": "Kansas City Chiefs",
    "LA": "Los Angeles Rams", "LAC": "Los Angeles Chargers", "LV": "Las Vegas Raiders", "MIA": "Miami Dolphins",
    "MIN": "Minnesota Vikings", "NE": "New England Patriots", "NO": "New Orleans Saints", "NYG": "New York Giants",
    "NYJ": "New York Jets", "PHI": "Philadelphia Eagles", "PIT": "Pittsburgh Steelers", "SEA": "Seattle Seahawks",
    "SF": "San Francisco 49ers", "TB": "Tampa Bay Buccaneers", "TEN": "Tennessee Titans", "WAS": "Washington Commanders",
}
TEAMS = sorted(NAMES)
CONF = {t: d.split()[0] for d, ts in DIVISIONS.items() for t in ts}
DIV = {t: d for d, ts in DIVISIONS.items() for t in ts}
NICK = {v.split()[-1]: k for k, v in NAMES.items()}
DRAFT_ABBR = {"LAR": "LA", "STL": "LA", "SD": "LAC", "OAK": "LV", "GNB": "GB", "KAN": "KC", "NWE": "NE",
              "NOR": "NO", "SFO": "SF", "TAM": "TB", "RAM": "LA", "SDG": "LAC", "LVR": "LV"}

# Estimated: game margin spread and home edge in recent NFL seasons.
MARGIN_SD = 13.5
HOME_EDGE = 1.5
SIMS = 2000
CAP_2027_ESTIMATE = 305_000_000  # estimated; the real 2027 cap is set in early 2027

# Starters per position group, for needs.
STARTERS = {"QB": 1, "RB": 1, "WR": 3, "TE": 1, "OT": 2, "IOL": 3, "EDGE": 2, "DT": 2, "LB": 2, "CB": 3, "S": 2,
            "K": 1, "P": 1}
ROSTER_POS = {"QB": "QB", "RB": "RB", "FB": "RB", "WR": "WR", "TE": "TE", "T": "OT", "OT": "OT", "G": "IOL",
              "C": "IOL", "OL": "IOL", "DE": "EDGE", "OLB": "EDGE", "DT": "DT", "NT": "DT", "DL": "DT", "LB": "LB",
              "ILB": "LB", "MLB": "LB", "CB": "CB", "DB": "CB", "S": "S", "SS": "S", "FS": "S", "SAF": "S",
              "K": "K", "P": "P", "LS": "LS"}
# Age at which each group usually starts to decline (estimated).
DECLINE_AGE = {"QB": 35, "RB": 28, "WR": 30, "TE": 31, "OT": 32, "IOL": 32, "EDGE": 31, "DT": 31, "LB": 30,
               "CB": 30, "S": 31, "K": 38, "P": 38}


def season_games():
    g = pd.read_csv(RAW / "games.csv", low_memory=False)
    g = g[(g.game_type == "REG") & g.season.isin([CURRENT_SEASON - 1, CURRENT_SEASON])]
    return g


def app_games():
    """This season and last, regular season and playoffs, for the page's own projection (app/js/standings.js).
    The page fetches newer games live; these are its fallback when it can't."""
    g = pd.read_csv(RAW / "games.csv", low_memory=False)
    g = g[g.season.isin([CURRENT_SEASON - 1, CURRENT_SEASON])].sort_values(["season", "week", "gameday"])
    num = lambda v: None if pd.isna(v) else int(v)
    return [{"s": int(r.season), "type": r.game_type, "wk": int(r.week), "day": str(r.gameday), "away": r.away_team,
             "home": r.home_team, "as": num(r.away_score), "hs": num(r.home_score), "neutral": r.location == "Neutral"}
            for r in g.itertuples()]


def ratings(g):
    """Team strength in points per game: 2026 margin, shrunk toward half of 2025's (estimated weights)."""
    played = g[g.result.notna()]
    out = {}
    for t in TEAMS:
        def margins(season):
            h = played[(played.season == season) & (played.home_team == t)]
            a = played[(played.season == season) & (played.away_team == t)]
            m = list(h.home_score - h.away_score) + list(a.away_score - a.home_score)
            return m
        cur, prev = margins(CURRENT_SEASON), margins(CURRENT_SEASON - 1)
        prior = 0.5 * (np.mean(prev) if prev else 0.0)
        k = 4.0
        out[t] = (sum(cur) + k * prior) / (len(cur) + k)
    return out


def record(g):
    played = g[(g.season == CURRENT_SEASON) & g.result.notna()]
    w = defaultdict(float)
    n = defaultdict(int)
    for _, r in played.iterrows():
        n[r.home_team] += 1
        n[r.away_team] += 1
        if r.home_score > r.away_score:
            w[r.home_team] += 1
        elif r.home_score < r.away_score:
            w[r.away_team] += 1
        else:
            w[r.home_team] += 0.5
            w[r.away_team] += 0.5
    return {t: (w[t], n[t] - w[t]) for t in TEAMS}


def simulate_order(g, rate, rng):
    """One simulated finish: the 2027 draft order of the 32 original first-round slots."""
    season = g[g.season == CURRENT_SEASON]
    wins = defaultdict(float)
    for _, r in season[season.result.notna()].iterrows():
        if r.home_score > r.away_score:
            wins[r.home_team] += 1
        elif r.home_score < r.away_score:
            wins[r.away_team] += 1
        else:
            wins[r.home_team] += .5
            wins[r.away_team] += .5
    rest = season[season.result.isna()]
    mu = np.array([rate[h] - rate[a] + (HOME_EDGE if loc != "Neutral" else 0)
                   for h, a, loc in zip(rest.home_team, rest.away_team, rest.location)])
    m = rng.normal(mu, MARGIN_SD)
    for h, a, x in zip(rest.home_team, rest.away_team, m):
        wins[h if x > 0 else a] += 1
    tieb = {t: rng.random() for t in TEAMS}  # stands in for the real tiebreakers
    key = lambda t: (wins[t], tieb[t])
    seeds = {}
    for conf in ("AFC", "NFC"):
        divs = [d for d in DIVISIONS if d.startswith(conf)]
        winners = [max(DIVISIONS[d], key=key) for d in divs]
        others = sorted([t for d in divs for t in DIVISIONS[d] if t not in winners], key=key, reverse=True)
        seeds[conf] = sorted(winners, key=key, reverse=True) + others[:3]
    playoff = set(seeds["AFC"] + seeds["NFC"])
    out_round = {}

    def game(a, b):
        x = rng.normal(rate[a] - rate[b] + HOME_EDGE, MARGIN_SD)
        return (a, b) if x > 0 else (b, a)

    champs = {}
    for conf, s in seeds.items():
        alive = [s[0]]
        for hi, lo in ((1, 6), (2, 5), (3, 4)):
            w, l = game(s[hi], s[lo])
            out_round[l] = 1
            alive.append(w)
        alive.sort(key=lambda t: s.index(t))
        pairs = [(alive[0], alive[3]), (alive[1], alive[2])]
        nxt = []
        for a, b in pairs:
            w, l = game(a, b)
            out_round[l] = 2
            nxt.append(w)
        nxt.sort(key=lambda t: s.index(t))
        w, l = game(nxt[0], nxt[1])
        out_round[l] = 3
        champs[conf] = w
    w, l = game(champs["AFC"], champs["NFC"])
    out_round[l], out_round[w] = 4, 5
    non = sorted([t for t in TEAMS if t not in playoff], key=key)
    po = sorted(playoff, key=lambda t: (out_round[t], wins[t], tieb[t]))
    return non + po, {t: wins[t] for t in TEAMS}


def project_order(g):
    rate = ratings(g)
    rng = np.random.default_rng(2027)
    slots = defaultdict(list)
    wins = defaultdict(list)
    for _ in range(SIMS):
        order, w = simulate_order(g, rate, rng)
        for i, t in enumerate(order):
            slots[t].append(i + 1)
            wins[t].append(w[t])
    proj = {t: {"rating": round(rate[t], 2), "slot_mean": float(np.mean(slots[t])),
                "slot_p10": int(np.percentile(slots[t], 10)), "slot_p90": int(np.percentile(slots[t], 90)),
                "proj_wins": round(float(np.mean(wins[t])), 1),
                "slot_dist": np.bincount(slots[t], minlength=33)[1:].tolist()} for t in TEAMS}
    order = sorted(TEAMS, key=lambda t: proj[t]["slot_mean"])
    return order, proj


def pick_ownership():
    """Who holds each team's 2027 picks after the listed trades (rounds 1-7)."""
    owner = {(t, r): t for t in TEAMS for r in range(1, 8)}
    holds = defaultdict(list)
    for t in TEAMS:
        for r in range(1, 8):
            holds[(t, r)].append(t)
    overrides = {}
    p = DATA / "pick_overrides.csv"
    if p.exists():
        o = pd.read_csv(p)
        overrides = {int(r.trade_id): r.original_team for r in o.itertuples()}
    tr = pd.read_csv(RAW / "trades.csv", low_memory=False)
    tr = tr[tr.pick_season == DRAFT_YEAR].sort_values(["trade_date", "trade_id"])
    log = []
    for r in tr.itertuples():
        gave, got, rnd = DRAFT_ABBR.get(r.gave, r.gave), DRAFT_ABBR.get(r.received, r.received), int(r.pick_round)
        held = holds[(gave, rnd)]
        if not held:
            log.append(f"trade {r.trade_id}: {gave} gave a round {rnd} pick it did not hold; skipped")
            continue
        orig = overrides.get(int(r.trade_id))
        if orig not in held:
            orig = gave if gave in held else held[0]
        held.remove(orig)
        holds[(got, rnd)].append(orig)
        owner[(orig, rnd)] = got
        log.append(f"trade {r.trade_id} ({r.trade_date}): {orig}'s round {rnd} pick, {gave} -> {got}"
                   + (" (conditional)" if r.conditional == 1 else ""))
    return owner, log


def players_now():
    """2026 rosters with snaps, age, contract and draft pedigree."""
    ro = pd.read_csv(RAW / "roster_2026.csv", low_memory=False)
    ro = ro.sort_values("week").drop_duplicates("gsis_id", keep="last")
    ro = ro[ro.status.isin(["ACT", "RES", "INA"])].copy()
    ro["group"] = ro.depth_chart_position.fillna(ro.position).map(ROSTER_POS).fillna(ro.position.map(ROSTER_POS))
    ro["age"] = (pd.Timestamp("2027-09-01") - pd.to_datetime(ro.birth_date, errors="coerce")).dt.days / 365.25
    sn = pd.read_csv(RAW / "snaps_2026.csv", low_memory=False)
    sn["share"] = np.where(sn.position.isin(["K", "P", "LS"]), sn.st_pct, sn[["offense_pct", "defense_pct"]].max(axis=1))
    team_games = sn.groupby("team").game_id.nunique()
    sn["k"] = sn.player.map(norm_name)
    share = sn.groupby(["pfr_player_id", "k", "team"]).share.sum().reset_index()
    share["share"] = share.share / share.team.map(team_games)
    share["team"] = share.team.map(lambda t: DRAFT_ABBR.get(t, t))
    by_id = share.groupby(["pfr_player_id", "team"]).share.sum()
    by_name = share.groupby(["k", "team"]).share.sum()
    ro["k"] = ro.full_name.map(norm_name)
    ro["share"] = [by_id.get((i, t), np.nan) for i, t in zip(ro.pfr_id, ro.team)]
    miss = ro.share.isna()
    ro.loc[miss, "share"] = [by_name.get((k, t), np.nan) for k, t in zip(ro.k[miss], ro.team[miss])]
    ro["share"] = ro.share.fillna(0)
    c = pd.read_parquet(RAW / "contracts.parquet")
    c = c[c.is_active == True].copy()  # noqa: E712
    c["team_abbr"] = c.team.map(lambda s: NICK.get(str(s).split("/")[-1].strip().split()[-1], None))
    c["k"] = c.player.map(norm_name)
    c["end_year"] = c.year_signed + c.years - 1
    c = c.sort_values("year_signed").drop_duplicates(["k", "team_abbr"], keep="last")
    by_id = c[c.gsis_id.notna()].drop_duplicates("gsis_id", keep="last").set_index("gsis_id")
    ro["k"] = ro.full_name.map(norm_name)
    for col in ("apy", "apy_cap_pct", "end_year"):
        ro[col] = ro.gsis_id.map(by_id[col])
    # Fallback for contracts without an id: name + team.
    by_name = c.set_index(["k", "team_abbr"])
    miss = ro.apy.isna()
    keys = list(zip(ro.k[miss], ro.team[miss]))
    for col in ("apy", "apy_cap_pct", "end_year"):
        ro.loc[miss, col] = [by_name[col].get(k, np.nan) for k in keys]
    ro["draft_number"] = pd.to_numeric(ro.draft_number, errors="coerce")
    return ro, c


def needs(ro):
    """Need per team and group: weak, old or expiring starters mean a bigger need. Weights estimated."""
    out = {}
    pct_by_group = {}
    for gname, part in ro.groupby("group"):
        pct_by_group[gname] = part.apy_cap_pct.dropna()
    for t in TEAMS:
        team = ro[ro.team == t]
        res = {}
        for gname, n in STARTERS.items():
            st = team[team.group == gname].sort_values("share", ascending=False).head(n)
            scores, notes = [], []
            for p in st.itertuples():
                pool = pct_by_group.get(gname, pd.Series(dtype=float))
                pay = float((pool < (p.apy_cap_pct if pd.notna(p.apy_cap_pct) else 0)).mean()) if len(pool) else 0.5
                ped = 1 - min(p.draft_number, 260) / 260 if pd.notna(p.draft_number) else 0.15
                q = 0.65 * pay + 0.35 * ped
                if pd.notna(p.age) and p.age > DECLINE_AGE.get(gname, 31):
                    q -= 0.08 * (p.age - DECLINE_AGE[gname])
                    notes.append(f"{p.full_name} {p.age:.0f} in 2027")
                if pd.notna(p.end_year) and p.end_year <= CURRENT_SEASON:
                    q -= 0.25
                    notes.append(f"{p.full_name} contract ends after 2026")
                scores.append(q)
            while len(scores) < n:
                scores.append(0.0)
                notes.append("open starting spot")
            need = float(np.clip(1 - np.mean(scores), 0, 1))
            if gname in ("K", "P"):
                need *= 0.5  # teams rarely spend picks on specialists (estimated)
            res[gname] = {"need": round(need, 3),
                          "starters": [{"name": p.full_name, "age": None if pd.isna(p.age) else round(p.age, 1),
                                        "snap_share": round(p.share, 2),
                                        "apy": None if pd.isna(p.apy) else round(p.apy, 2),
                                        "contract_end": None if pd.isna(p.end_year) else int(p.end_year),
                                        "draft_pick": None if pd.isna(p.draft_number) else int(p.draft_number)}
                                       for p in st.itertuples()],
                          "notes": notes}
        # Rank 0..1 within the team, so every team has a top need.
        vals = sorted(res, key=lambda k: res[k]["need"], reverse=True)
        for i, k in enumerate(vals):
            res[k]["rank"] = i + 1
        out[t] = res
    return out


def habits():
    """Each team's position habits and trade rate from its last five drafts, against the league (computed)."""
    d = pd.read_csv(RAW / "draft_picks.csv", low_memory=False)
    d = d[d.season.between(CURRENT_SEASON - 4, CURRENT_SEASON)].copy()
    d["team"] = d.team.map(lambda t: DRAFT_ABBR.get(t, t))
    d["group"] = d.position.map(DRAFT_POS).replace({"OL": "IOL", "DL": "DT", "DB": "CB"})
    early = d[d["round"] <= 3]
    league = early.group.value_counts(normalize=True)
    tr = pd.read_csv(RAW / "trades.csv", low_memory=False)
    tr = tr[(tr.season >= CURRENT_SEASON - 4) & (tr.pick_season == tr.season)]
    tr["month"] = pd.to_datetime(tr.trade_date, errors="coerce").dt.month
    draft_trades = tr[tr.month == 4]
    per_team = defaultdict(set)
    for r in draft_trades.itertuples():
        for side in (r.gave, r.received):
            per_team[DRAFT_ABBR.get(side, side)].add(r.trade_id)
    out = {}
    for t in TEAMS:
        part = early[early.team == t]
        n = len(part)
        share = part.group.value_counts(normalize=True)
        mult = {}
        for gname in STARTERS:
            own = share.get(gname, 0.0)
            lg = league.get(gname, 0.01)
            w = n / (n + 15)
            mult[gname] = round(float(np.clip(1 + w * (own - lg) / max(lg, 0.02) * 0.15, 0.9, 1.12)), 3)
        out[t] = {"early_picks_5yr": int(n), "pos_mult": mult,
                  "draft_trades_per_year": round(len(per_team[t]) / 5, 2)}
    return out


def main():
    g = season_games()
    order, proj = project_order(g)
    rec = record(g)
    owner, log = pick_ownership()
    ro, c = players_now()
    nd = needs(ro)
    hb = habits()
    commit = c[c.end_year >= DRAFT_YEAR].groupby("team_abbr").apy.sum() * 1e6
    teams = {}
    for t in TEAMS:
        w, l = rec[t]
        teams[t] = {"abbr": t, "name": NAMES[t], "conference": CONF[t], "division": DIV[t],
                    "record": f"{w:g}-{l:g}", **proj[t], "needs": nd[t], "habits": hb[t],
                    "cap_commit_2027": float(commit.get(t, 0)),
                    "cap_space_2027_est": float(CAP_2027_ESTIMATE - commit.get(t, 0))}
    picks = []
    for rnd in range(1, 8):
        for i, t in enumerate(order):
            picks.append({"round": rnd, "slot": i + 1, "original": t, "owner": owner[(t, rnd)]})
    out = {"source": "nflverse games, rosters, snap counts, contracts (OverTheCap) and trades; standings as of the "
                     "latest game in the data, projected by simulation (computed, estimated weights)",
           "as_of": str(g[(g.season == CURRENT_SEASON) & g.result.notna()].gameday.max()),
           "cap_2027_estimate": CAP_2027_ESTIMATE, "sims": SIMS, "order": order, "teams": teams, "picks": picks,
           "trade_log": log, "games": app_games()}
    APP_DATA.mkdir(parents=True, exist_ok=True)
    (APP_DATA / "teams.json").write_text(json.dumps(out))
    print("order:", order, file=sys.stderr)
    print("\n".join(log), file=sys.stderr)


if __name__ == "__main__":
    main()
