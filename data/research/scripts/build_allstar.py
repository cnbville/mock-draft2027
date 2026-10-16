import csv, sys, os, re, unicodedata
raw, out = sys.argv[1], sys.argv[2]
SB = {y: f"https://en.wikipedia.org/wiki/{y}_Senior_Bowl" for y in range(2016, 2027)}
SH = {
 2016: ("https://www.nfl.com/news/2016-east-west-shrine-game-rosters-0ap3000000618975", "game roster"),
 2017: ("https://www.nfl.com/news/2017-east-west-shrine-game-rosters-0ap3000000766394", "game roster"),
 2018: ("https://www.nfl.com/news/2018-east-west-shrine-game-rosters-0ap3000000904349", "game roster"),
 2019: ("https://vikings.com/news/94th-east-west-shrine-game-rosters-include-2-minnesotans", "game roster (may be incomplete)"),
 2020: (None, "partial: only players named in game coverage"),
 2021: ("https://fantasypros.com/2021/01/2021-east-west-shrine-bowl-notable-invites", "invited; game canceled (COVID); partial list of skill-position invites only"),
 2022: ("https://www.profootballnetwork.com/east-west-shrine-bowl-invites-2022-accepted-invitations-for-college-football-all-star-game/", "accepted invite (running list, not final roster)"),
 2023: ("https://www.yahoo.com/now/2023-east-west-shrine-bowl-224520952.html", "game roster"),
 2024: ("https://www.giants.com/news/2024-east-west-shrine-bowl-college-all-star-game-nfl-draft-prospects-roster", "announced roster"),
 2025: ("https://www.giants.com/news/east-west-shrine-bowl-preview-2025-players-to-watch-full-roster-shedeur-sanders-kenneth-grant", "announced roster"),
 2026: ("https://www.buccaneers.com/news/full-2026-east-west-shrine-bowl-roster-nfl-draft-prospects", "announced roster"),
}
def key(n):
    n = unicodedata.normalize("NFKD", n).encode("ascii","ignore").decode().lower()
    n = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", "", n)
    return re.sub(r"[^a-z]", "", n)
rows = []
sbkeys = {}
for y in range(2016, 2027):
    p = os.path.join(raw, f"sb{y}.txt")
    sbkeys[y] = set()
    for line in open(p, encoding="utf-8"):
        f = line.rstrip("\n").split("|")
        if len(f) < 3: continue
        sbkeys[y].add((key(f[0]),key(f[1])))
        rows.append([y, "senior_bowl", f[0], f[1], f[2], "game roster", SB[y]])
for y in range(2016, 2027):
    src, note = SH[y]
    for line in open(os.path.join(raw, f"sh{y}.txt"), encoding="utf-8"):
        f = line.rstrip("\n").split("|")
        if len(f) < 3: continue
        s = f[3] if len(f) > 3 else src
        n = note
        if (key(f[0]),key(f[1])) in sbkeys[y]:
            n += "; also on Senior Bowl roster same year (moved up to it, or played both when the games were in different weeks)"
        if y == 2025 and f[0] == "Shedeur Sanders":
            n += "; reported to have skipped practices and the game (memory, unchecked)"
        rows.append([y, "shrine", f[0], f[1], f[2], n, s])
with open(out, "w", newline="", encoding="utf-8") as fh:
    w = csv.writer(fh)
    w.writerow(["draft_year","game","player","school","position","notes","source"])
    w.writerows(rows)
from collections import Counter
c = Counter((r[0], r[1]) for r in rows)
for k in sorted(c): print(k, c[k])
print("total", len(rows), "both-games flags", sum("also on Senior Bowl" in r[5] for r in rows))
