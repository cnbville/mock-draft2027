"""Checks on the built app data and the pipeline helpers: python3 -m unittest discover tests"""
import json
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


if __name__ == "__main__":
    unittest.main()
