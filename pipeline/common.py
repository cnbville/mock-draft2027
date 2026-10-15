"""Shared paths, years and name helpers for the data pipeline."""
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"          # downloads (not in git)
BUILD = ROOT / "build"      # intermediate files (not in git)
APP_DATA = ROOT / "app" / "data"
DATA = ROOT / "data"        # hand-entered data (in git)

YEARS_COLLEGE = list(range(2014, 2027))
DRAFT_YEAR = 2027
CURRENT_SEASON = 2026

SUFFIX = re.compile(r"\b(jr|sr|ii|iii|iv|v)\b\.?")


def norm_name(name):
    """Lower case, no accents, punctuation or suffixes: 'Ellis Robinson IV' -> 'ellis robinson'."""
    if not isinstance(name, str):
        return ""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = s.replace("'", "").replace(".", "").replace("-", " ")
    s = SUFFIX.sub("", s)
    return " ".join(s.split())


# College names as the drafts (Pro Football Reference) spell them -> as ESPN/CFBD spell them.
COLLEGE_ALIASES = {
    "ohio st": "ohio state", "penn st": "penn state", "florida st": "florida state",
    "michigan st": "michigan state", "mississippi st": "mississippi state", "oklahoma st": "oklahoma state",
    "oregon st": "oregon state", "washington st": "washington state", "arizona st": "arizona state",
    "iowa st": "iowa state", "kansas st": "kansas state", "boise st": "boise state",
    "san diego st": "san diego state", "fresno st": "fresno state", "colorado st": "colorado state",
    "utah st": "utah state", "app st": "app state", "appalachian st": "app state",
    "appalachian state": "app state", "north dakota st": "north dakota state",
    "south dakota st": "south dakota state", "louisiana st": "lsu", "mississippi": "ole miss",
    "southern california": "usc", "central florida": "ucf", "brigham young": "byu",
    "southern methodist": "smu", "texas christian": "tcu", "miami (fl)": "miami", "miami fl": "miami",
    "miami (oh)": "miami (oh)", "pittsburgh": "pittsburgh", "pitt": "pittsburgh",
    "nc state": "nc state", "north carolina st": "nc state", "north carolina state": "nc state",
    "texas a&amp;m": "texas a&m", "ala-birmingham": "uab", "alabama-birmingham": "uab",
    "louisiana-lafayette": "louisiana", "la-lafayette": "louisiana", "louisiana-monroe": "ul monroe",
    "texas-san antonio": "utsa", "texas-el paso": "utep", "nevada-las vegas": "unlv",
    "middle tennessee st": "middle tennessee", "middle tenn st": "middle tennessee",
    "western kentucky": "western kentucky", "florida international": "fiu", "florida intl": "fiu",
    "southern miss": "southern miss", "southern mississippi": "southern miss",
    "connecticut": "uconn", "massachusetts": "umass", "hawaii": "hawai'i", "hawai'i": "hawai'i",
    "georgia st": "georgia state", "kent st": "kent state", "ball st": "ball state",
    "jacksonville st": "jacksonville state", "sam houston st": "sam houston", "sam houston state": "sam houston",
    "east carolina": "east carolina", "tennessee st": "tennessee state", "youngstown st": "youngstown state",
    "illinois st": "illinois state", "missouri st": "missouri state", "montana st": "montana state",
    "san jose st": "san jose state", "san josé state": "san jose state", "weber st": "weber state",
    "wichita st": "wichita state", "jackson st": "jackson state", "alcorn st": "alcorn state",
    "delaware st": "delaware state", "morgan st": "morgan state", "norfolk st": "norfolk state",
    "south carolina st": "south carolina state", "grambling st": "grambling", "grambling state": "grambling",
    "texas st": "texas state", "arkansas st": "arkansas state", "new mexico st": "new mexico state",
    "northwestern st": "northwestern state", "mcneese st": "mcneese", "mcneese state": "mcneese",
    "nicholls st": "nicholls", "nicholls state": "nicholls", "southeastern louisiana": "se louisiana",
    "central michigan": "central michigan", "bowling green": "bowling green",
}


def norm_college(name):
    s = norm_name(name).replace("&amp;", "&")
    s = s.replace(" university", "").strip()
    return COLLEGE_ALIASES.get(s, s)
