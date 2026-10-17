"""Team art: NFL and college names, colours and logos.

Output: app/data/art.json and app/img/nfl/<ABBR>.webp (the 32 NFL logos, bundled with the app).
Run after build_app.py (it reads app/data/prospects.json and teams.json):

python3 pipeline/art.py          # rebuild; downloads the two team tables into raw/art/ when missing
python3 pipeline/art.py --fresh  # download the tables and the NFL logos again

Sources (published data):
- NFL names, nicknames and colours: nflverse `teams_colors_logos.csv` (nflverse-pbp on GitHub).
- NFL logos: ESPN's 500px logo for each team (the link in that same table), then the table's Wikipedia
  link. When neither can be reached (the cloud build machine blocks both), the logo already in
  app/img/nfl is kept, and its source stays as recorded in art.json ("logo_src"). Last resort:
  nflverse's square logo tile (opaque).
- College colours: cfbfastR-data `teams/teams_colors_logos.csv` (College Football Data team info).
- College ESPN ids: the cfbfastR schedules in raw/ (home_id/away_id are ESPN team ids), checked
  against the colour table. College logos are ESPN links built from the id; the app loads them
  when it runs (the Mac app caches them), nothing is downloaded here.
"""
import csv
import io
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import date

import pandas as pd
from PIL import Image

from common import APP_DATA, RAW, ROOT, norm_college

NFL_TABLE = "https://raw.githubusercontent.com/nflverse/nflverse-pbp/master/teams_colors_logos.csv"
NFL_SQUARED = "https://raw.githubusercontent.com/nflverse/nflverse-pbp/master/squared_logos/{abbr}.png"
CFB_TABLE = "https://raw.githubusercontent.com/sportsdataverse/cfbfastR-data/main/teams/teams_colors_logos.csv"
ESPN_NCAA_LOGO = "https://a.espncdn.com/i/teamlogos/ncaa/500/{id}.png"

ART_RAW = RAW / "art"
LOGO_DIR = ROOT / "app" / "img" / "nfl"
LOGO_PX = 256  # logos are fitted into a transparent 256 x 256 square
UA = "MockDraft2027-pipeline/0.2 (github.com/cnbville/mock-draft2027)"

# Pro Football Reference team codes (used by the past drafts, e.g. prospects' comps) -> nflverse codes.
NFL_ALIAS = {"GNB": "GB", "KAN": "KC", "LAR": "LA", "LVR": "LV", "NOR": "NO", "NWE": "NE", "SFO": "SF",
             "TAM": "TB", "OAK": "LV", "SDG": "LAC", "SD": "LAC", "STL": "LA", "RAM": "LA", "RAI": "LV"}

HEX = re.compile(r"^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def log(*a):
    print(*a, file=sys.stderr)


def get(url, timeout=20):
    """Bytes at url, or None when it can't be reached."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except (urllib.error.URLError, OSError, ValueError) as e:
        log(f"  not reached: {url} ({getattr(e, 'code', None) or getattr(e, 'reason', e)})")
        return None


def cached(url, path, fresh):
    """Download url to path (under raw/) unless it is there already; return the bytes or None."""
    if path.exists() and not fresh:
        return path.read_bytes()
    data = get(url)
    if data:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    elif path.exists():
        return path.read_bytes()
    return data


def read_csv_text(data):
    """The college table is not pure UTF-8 (one Latin-1 'é'): fall back to Latin-1."""
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("latin-1")
    return list(csv.DictReader(io.StringIO(text)))


def hex_color(s):
    """'#a5acaf' -> '#A5ACAF'; anything that isn't a hex colour -> None (never guessed)."""
    m = HEX.match((s or "").strip())
    if not m:
        return None
    h = m.group(1)
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return "#" + h.upper()


def is_image(data):
    try:
        Image.open(io.BytesIO(data)).verify()
        return True
    except Exception:
        return False


def to_webp(img, dest, size=LOGO_PX):
    """Trim the transparent edge, fit into a size x size transparent square, save as a small webp."""
    im = img.convert("RGBA")
    box = im.getchannel("A").getbbox()
    if box:
        im = im.crop(box)
    scale = size / max(im.size)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(im, ((size - im.width) // 2, (size - im.height) // 2))
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest, "WEBP", quality=90, alpha_quality=100, method=6)


def wiki_250(url):
    """nflverse's Wikipedia links are ~100px thumbnails; ask for the 250px one instead."""
    return re.sub(r"/\d+px-", "/250px-", url) if "/thumb/" in url else url


def nfl_art(abbrs, fresh, prev):
    table = cached(NFL_TABLE, ART_RAW / "nfl_teams_colors_logos.csv", fresh)
    rows = {r["team_abbr"]: r for r in read_csv_text(table)}
    out, srcs = {}, {}
    for abbr in abbrs:
        r = rows[abbr]
        dest = LOGO_DIR / f"{abbr}.webp"
        src = None
        tries = (("ESPN", r.get("team_logo_espn")), ("Wikipedia", wiki_250(r.get("team_logo_wikipedia") or "")))
        for kind, url in tries:
            if not url:
                continue
            data = cached(url, ART_RAW / "nfl" / f"{abbr}.{kind.lower()}.png", fresh)
            if data and is_image(data):
                to_webp(Image.open(io.BytesIO(data)), dest)
                src = kind
                break
        if src is None and dest.exists():
            src = prev.get(abbr, {}).get("logo_src") or "bundled file"
        if src is None:
            data = cached(NFL_SQUARED.format(abbr=abbr), ART_RAW / "nfl" / f"{abbr}.squared.png", fresh)
            if data and is_image(data):
                to_webp(Image.open(io.BytesIO(data)), dest)
                src = "nflverse square tile (opaque)"
        entry = {"name": r["team_name"], "nick": r["team_nick"], "c1": hex_color(r["team_color"]),
                 "c2": hex_color(r["team_color2"])}
        if src:
            entry["logo"] = f"img/nfl/{abbr}.webp"
            entry["logo_src"] = src
        out[abbr] = {k: v for k, v in entry.items() if v}
        srcs[src or "none"] = srcs.get(src or "none", 0) + 1
    return out, srcs


def schools_needed():
    P = json.loads((APP_DATA / "prospects.json").read_text())
    need = {}
    for p in P:
        rank = p.get("consensus_rank") or 10**6
        for n in [p["school"]] + [t for t in (p.get("teams") or "").split("|") if t]:
            need[n] = min(need.get(n, 10**9), rank)
        for c in p.get("comps") or []:
            if c.get("school"):
                need.setdefault(c["school"], 10**9)
    return need  # school -> best consensus rank of a prospect who played there (comps' schools: none)


def espn_ids():
    """School name -> ESPN team id from the cfbfastR schedules (newest season wins)."""
    ids = {}
    for f in sorted(RAW.glob("cfb_schedules_*.csv")):
        d = pd.read_csv(f, usecols=["home_id", "home_team", "away_id", "away_team"])
        for idc, namec in (("home_id", "home_team"), ("away_id", "away_team")):
            for i, n in zip(d[idc], d[namec]):
                if isinstance(n, str) and pd.notna(i):
                    ids[n] = int(i)
    return ids


def college_art(fresh):
    rows = read_csv_text(cached(CFB_TABLE, ART_RAW / "cfb_teams_colors_logos.csv", fresh))
    by_id = {int(r["team_id"]): r for r in rows if r["team_id"].isdigit()}
    by_name = {}
    for r in rows:  # exact names first, then normalised names and the table's other spellings
        by_name.setdefault(r["school"], r)
    for r in rows:
        for n in (r["school"], r["alt_name1"], r["alt_name2"], r["alt_name3"], r["abbreviation"]):
            if n:
                by_name.setdefault(norm_college(n), r)
    ids = espn_ids()
    ids_norm = {}
    for n, i in ids.items():
        ids_norm.setdefault(norm_college(n), i)
    need = schools_needed()
    out, report = {}, {"no_id": [], "no_colours": [], "id_differs": []}
    for school in sorted(need):
        sid = ids.get(school) or ids_norm.get(norm_college(school))
        row = by_id.get(sid) if sid else None
        same_name = by_name.get(school)
        if sid and same_name is not None and int(same_name["team_id"]) != sid:
            report["id_differs"].append(f"{school}: schedules {sid}, colour table {same_name['team_id']}")
        if row is None:
            row = by_name.get(school) or by_name.get(norm_college(school))
            if row is not None and sid and int(row["team_id"]) != sid:
                report["id_differs"].append(f"{school}: schedules {sid}, colour table {row['team_id']}")
                row = None
            elif row is not None and not sid:
                sid = int(row["team_id"])
        if not sid:
            report["no_id"].append(school)
            continue
        entry = {"c1": hex_color(row["color"]) if row else None, "c2": hex_color(row["alt_color"]) if row else None,
                 "espn_id": sid, "logo": ESPN_NCAA_LOGO.format(id=sid)}
        if not entry["c1"]:
            report["no_colours"].append(school)
        out[school] = {k: v for k, v in entry.items() if v}
    return out, need, report


def fetched_on(path):
    return date.fromtimestamp(path.stat().st_mtime).isoformat() if path.exists() else "unknown date"


def main():
    fresh = "--fresh" in sys.argv
    teams = json.loads((APP_DATA / "teams.json").read_text())
    abbrs = sorted(teams["teams"])
    prev_path = APP_DATA / "art.json"
    prev = json.loads(prev_path.read_text(encoding="utf-8")).get("nfl", {}) if prev_path.exists() else {}

    nfl, logo_srcs = nfl_art(abbrs, fresh, prev)
    schools, need, report = college_art(fresh)

    logo_note = ", ".join(f"{n} {k}" for k, n in sorted(logo_srcs.items(), key=lambda x: -x[1]))
    source = (
        f"NFL names, nicknames and colours: nflverse teams_colors_logos.csv "
        f"(fetched {fetched_on(ART_RAW / 'nfl_teams_colors_logos.csv')}). "
        f"NFL logos (each team's logo_src): {logo_note}. "
        f"College colours: cfbfastR-data teams_colors_logos.csv, from College Football Data team info "
        f"(fetched {fetched_on(ART_RAW / 'cfb_teams_colors_logos.csv')}). "
        f"College ESPN ids: cfbfastR schedules; college logos: ESPN, loaded by the app. "
        f"Built {date.today().isoformat()}."
    )
    art = {"nfl": nfl, "nfl_alias": NFL_ALIAS, "schools": schools, "source": source}
    prev_path.write_text(json.dumps(art, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    with_colour = sum(1 for s in schools.values() if "c1" in s)
    top100 = [s for s, rank in need.items() if rank <= 100]
    top_ok = sum(1 for s in top100 if "c1" in schools.get(s, {}))
    log(f"NFL: {len(nfl)} teams; logos: {logo_note}")
    log(f"schools: {len(need)} needed, {len(schools)} with an ESPN id, {with_colour} with colours; "
        f"top-100 prospects' schools {top_ok}/{len(top100)} with colours")
    for k, v in report.items():
        if v:
            log(f"  {k}: {', '.join(v)}")


if __name__ == "__main__":
    main()
