"""Rebuild every data file the app uses, in order. Run fetch.py first."""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
STEPS = ["college.py", "players.py", "model.py", "nfl.py", "build_app.py"]

for s in STEPS:
    print(f"== {s}", file=sys.stderr)
    subprocess.run([sys.executable, str(HERE / s)], cwd=HERE, check=True)
