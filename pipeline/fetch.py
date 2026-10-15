"""Download the raw data into raw/ (not kept in git). About 550 MB.

python3 pipeline/fetch.py          # everything
python3 pipeline/fetch.py --fresh  # only what changes during the season (2026 stats, rosters, games, NFL rosters and snaps)
"""
import sys
import urllib.request

from common import CURRENT_SEASON, RAW, YEARS_COLLEGE

CFB = "https://raw.githubusercontent.com/sportsdataverse/cfbfastR-data/main"
NFLV = "https://github.com/nflverse/nflverse-data/releases/download"
NFLD = "https://raw.githubusercontent.com/nflverse/nfldata/master/data"


def files(fresh):
    years = [CURRENT_SEASON] if fresh else YEARS_COLLEGE
    for y in years:
        yield f"{CFB}/player_stats/csv/player_stats_{y}.csv", f"player_stats_{y}.csv"
        yield f"{CFB}/schedules/csv/cfb_schedules_{y}.csv", f"cfb_schedules_{y}.csv"
    for y in ([CURRENT_SEASON] if fresh else range(2013, CURRENT_SEASON + 1)):
        yield f"{CFB}/rosters/csv/cfb_rosters_{y}.csv", f"cfb_rosters_{y}.csv"
    yield f"{NFLD}/games.csv", "games.csv"
    yield f"{NFLV}/rosters/roster_{CURRENT_SEASON}.csv", f"roster_{CURRENT_SEASON}.csv"
    yield f"{NFLV}/snap_counts/snap_counts_{CURRENT_SEASON}.csv", f"snaps_{CURRENT_SEASON}.csv"
    if not fresh:
        yield f"{NFLD}/trades.csv", "trades.csv"
        yield f"{NFLV}/draft_picks/draft_picks.csv", "draft_picks.csv"
        yield f"{NFLV}/combine/combine.csv", "combine.csv"
        yield f"{NFLV}/contracts/historical_contracts.parquet", "contracts.parquet"


def main():
    fresh = "--fresh" in sys.argv
    RAW.mkdir(exist_ok=True)
    for url, name in files(fresh):
        print("get", name, file=sys.stderr)
        urllib.request.urlretrieve(url, RAW / name)


if __name__ == "__main__":
    main()
