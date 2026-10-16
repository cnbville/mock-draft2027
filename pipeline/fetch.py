"""Download the raw data into raw/ (not kept in git). About 2 GB with the past NFL seasons.

python3 pipeline/fetch.py          # everything
python3 pipeline/fetch.py --fresh  # only what changes during the season (2026 stats, rosters, games, NFL rosters,
                                   # snaps, depth charts, trades)

Past NFL seasons (rosters, snaps, season stats, depth charts, play participation) go to raw/hist/. The draft AI's
team facts (pipeline/asof.py) and the backtest's past drafts are built from them.
"""
import sys
import urllib.error
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
    # Trades change all season (2027 and 2028 picks change hands).
    yield f"{NFLD}/trades.csv", "trades.csv"
    for y in ([CURRENT_SEASON] if fresh else range(2012, CURRENT_SEASON + 1)):
        yield f"{NFLV}/rosters/roster_{y}.csv", f"hist/roster_{y}.csv"
        yield f"{NFLV}/snap_counts/snap_counts_{y}.csv", f"hist/snaps_{y}.csv"
        yield f"{NFLV}/stats_player/stats_player_reg_{y}.csv", f"hist/stats_reg_{y}.csv"
        if y >= 2015:
            yield f"{NFLV}/depth_charts/depth_charts_{y}.csv", f"hist/depth_{y}.csv"
        if y >= 2016:
            # Not published for the season in progress; asof.py then uses the season before.
            yield f"{NFLV}/pbp_participation/pbp_participation_{y}.csv", f"hist/part_{y}.csv"
    if not fresh:
        yield f"{NFLV}/draft_picks/draft_picks.csv", "draft_picks.csv"
        yield f"{NFLV}/combine/combine.csv", "combine.csv"
        yield f"{NFLV}/contracts/historical_contracts.parquet", "contracts.parquet"


def main():
    fresh = "--fresh" in sys.argv
    (RAW / "hist").mkdir(parents=True, exist_ok=True)
    for url, name in files(fresh):
        print("get", name, file=sys.stderr)
        try:
            urllib.request.urlretrieve(url, RAW / name)
        except urllib.error.HTTPError as e:
            print(f"  skipped ({e.code}): not published yet", file=sys.stderr)


if __name__ == "__main__":
    main()
