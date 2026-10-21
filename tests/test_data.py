"""Checks on the built app data and the pipeline helpers: python3 -m unittest discover tests"""
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))

from common import norm_college, norm_name  # noqa: E402


def load(name):
    return json.loads((ROOT / "app" / "data" / f"{name}.json").read_text())


class Helpers(unittest.TestCase):
    def test_names(self):
        self.assertEqual(norm_name("Ellis Robinson IV"), "ellis robinson")
        self.assertEqual(norm_name("Ahmad Moten Sr."), "ahmad moten")
        self.assertEqual(norm_name("A'Mauri Washington"), "amauri washington")
        self.assertEqual(norm_name("José Núñez"), "jose nunez")

    def test_colleges(self):
        self.assertEqual(norm_college("Ohio St."), "ohio state")
        self.assertEqual(norm_college("Mississippi"), "ole miss")
        self.assertEqual(norm_college("Miami (FL)"), "miami")


class AppData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.P = load("prospects")
        cls.T = load("teams")
        cls.V = load("value_chart")
        cls.H = load("hit_rates")

    def test_pool(self):
        self.assertEqual(len(self.P), 700)
        ids = [p["id"] for p in self.P]
        self.assertEqual(len(set(ids)), len(ids))
        self.assertEqual([p["board_rank"] for p in self.P], list(range(1, 701)))
        for p in self.P:
            self.assertTrue(0 < p["p_declare"] <= 1)
            self.assertTrue(0 <= p["p_drafted"] <= 1)
            self.assertIn(p["group"], ("QB", "RB", "WR", "TE", "OT", "IOL", "EDGE", "DT", "LB", "CB", "S", "K", "P", "LS"))

    def test_consensus_top(self):
        top = sorted((p for p in self.P if p["consensus_rank"]), key=lambda p: p["consensus_rank"])
        self.assertEqual(top[0]["name"], "Jeremiah Smith")
        self.assertGreater(len(top), 190)

    def test_value_chart_falls(self):
        v = [p["value"] for p in self.V["points"]]
        self.assertEqual(v[0], 3000)
        self.assertTrue(all(a >= b for a, b in zip(v, v[1:])))

    def test_hit_rates_sum_to_one(self):
        for b in self.H["bands"]:
            self.assertAlmostEqual(sum(b["rates"].values()), 1, delta=0.01)
        for rows in self.H["by_group"].values():
            for b in rows:
                self.assertAlmostEqual(sum(b["rates"].values()), 1, delta=0.01)

    def test_teams_and_picks(self):
        self.assertEqual(len(self.T["teams"]), 32)
        self.assertEqual(sorted(self.T["order"]), sorted(self.T["teams"]))
        self.assertEqual(len(self.T["picks"]), 224)
        # Every original team has one pick per round.
        for r in range(1, 8):
            self.assertEqual(len({p["original"] for p in self.T["picks"] if p["round"] == r}), 32)
        dist = self.T["teams"][self.T["order"][0]]["slot_dist"]
        self.assertEqual(sum(dist), self.T["sims"])

    def test_built_in_games(self):
        # The page's fallback when it can't fetch live games: this season and last, every team in both.
        season = self.T["draft_year"] - 1
        g = self.T["games"]
        for s in (season - 1, season):
            reg = [x for x in g if x["s"] == s and x["type"] == "REG"]
            self.assertEqual({x["home"] for x in reg} | {x["away"] for x in reg}, set(self.T["teams"]))
        played = [x for x in g if x["s"] == season and x["hs"] is not None]
        self.assertTrue(played)
        self.assertLessEqual(max(x["day"] for x in played), self.T["as_of"])


HEX = re.compile(r"^#[0-9A-F]{6}$")


def webp_info(data):
    """(width, height, has_alpha) from a WebP file's header (standard library only)."""
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    kind = data[12:16]
    if kind == b"VP8X":
        return (1 + int.from_bytes(data[24:27], "little"), 1 + int.from_bytes(data[27:30], "little"),
                bool(data[20] & 0x10))
    if kind == b"VP8L":
        b = int.from_bytes(data[21:25], "little")
        return (b & 0x3FFF) + 1, ((b >> 14) & 0x3FFF) + 1, bool((b >> 28) & 1)
    if kind == b"VP8 ":
        return (int.from_bytes(data[26:28], "little") & 0x3FFF, int.from_bytes(data[28:30], "little") & 0x3FFF, False)
    return None


class Art(unittest.TestCase):
    """Team names, colours and logos (pipeline/art.py)."""

    @classmethod
    def setUpClass(cls):
        cls.A = load("art")
        cls.T = load("teams")
        cls.P = load("prospects")

    def test_nfl_teams_colours_and_logos(self):
        self.assertEqual(sorted(self.A["nfl"]), sorted(self.T["teams"]))
        for abbr, t in self.A["nfl"].items():
            self.assertIn(t["nick"], t["name"])
            self.assertRegex(t["c1"], HEX)
            self.assertRegex(t["c2"], HEX)
            self.assertEqual(t["logo"], f"img/nfl/{abbr}.webp")
            self.assertTrue(t.get("logo_src"), abbr)
            data = (ROOT / "app" / t["logo"]).read_bytes()
            info = webp_info(data)
            self.assertIsNotNone(info, abbr)
            w, h, alpha = info
            self.assertEqual((w, h), (256, 256), abbr)
            self.assertTrue(alpha, f"{abbr} logo has no transparency")
            self.assertLess(len(data), 64_000, abbr)

    def test_nfl_aliases(self):
        # The past drafts (comps) use Pro Football Reference codes: every one must map to a team with art.
        alias = self.A["nfl_alias"]
        for p in self.P:
            for c in p["comps"]:
                self.assertIn(alias.get(c["nfl_team"], c["nfl_team"]), self.A["nfl"], c["nfl_team"])

    def test_school_entries(self):
        for school, s in self.A["schools"].items():
            self.assertIsInstance(s["espn_id"], int)
            self.assertEqual(s["logo"], f"https://a.espncdn.com/i/teamlogos/ncaa/500/{s['espn_id']}.png")
            for k in ("c1", "c2"):
                if k in s:
                    self.assertRegex(s[k], HEX, school)
            if "c2" in s:
                self.assertIn("c1", s, school)

    def test_school_coverage(self):
        # Built 2026-10-17: 184 schools named in prospects.json (schools, former teams, comps' schools);
        # 184 have an ESPN id and 183 have colours (UT Rio Grande Valley is not in the colour table).
        need, top = set(), set()
        for p in self.P:
            names = [p["school"]] + [t for t in (p["teams"] or "").split("|") if t]
            need.update(names)
            need.update(c["school"] for c in p["comps"])
            if p["consensus_rank"] and p["consensus_rank"] <= 100:
                top.update(names)
        S = self.A["schools"]
        with_id = sum(1 for n in need if n in S)
        with_colour = sum(1 for n in need if "c1" in S.get(n, {}))
        self.assertGreaterEqual(with_id / len(need), 0.98)
        self.assertGreaterEqual(with_colour / len(need), 0.95)
        for n in top:
            self.assertIn("c1", S.get(n, {}), f"top-100 prospect's school without colours: {n}")

    def test_meta_schema(self):
        self.assertEqual(load("meta")["schema"], 1)

    def test_logos_really_transparent(self):
        try:
            from PIL import Image
        except ImportError:
            self.skipTest("Pillow not installed")
        for abbr, t in self.A["nfl"].items():
            with Image.open(ROOT / "app" / t["logo"]) as im:
                self.assertEqual(im.convert("RGBA").getchannel("A").getextrema()[0], 0, abbr)


if __name__ == "__main__":
    unittest.main()
