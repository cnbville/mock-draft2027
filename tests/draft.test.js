// Tests for the mock draft engine: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as D from '../app/js/draft.js';

const j = f => JSON.parse(fs.readFileSync(new URL(`../app/data/${f}.json`, import.meta.url)));
const prospects = j('prospects'), teams = j('teams'), chart = j('value_chart');

test('the draft has 257 picks, every team owns picks, and the order is the projected one', () => {
  const picks = D.buildPicks(teams);
  assert.equal(picks.length, 257);
  assert.deepEqual(picks.map(p => p.overall), picks.map((_, i) => i + 1));
  const owners = new Set(picks.map(p => p.owner));
  assert.ok(owners.size >= 30);
  assert.equal(picks[0].original, teams.order[0]);
});

test('a full AI draft fills every pick with a different declared player', () => {
  const st = D.newDraft({ prospects, teams, chart, seed: 11 });
  assert.equal(D.advance(st, { stopAtUser: false }), 'done');
  const used = st.picks.map(p => p.player);
  assert.ok(used.every(i => i != null));
  assert.equal(new Set(used).size, 257);
  assert.ok(used.every(i => st.declared[i]));
});

test('the same seed gives the same draft', () => {
  const a = D.newDraft({ prospects, teams, chart, seed: 5 });
  const b = D.newDraft({ prospects, teams, chart, seed: 5 });
  D.advance(a, { stopAtUser: false });
  D.advance(b, { stopAtUser: false });
  assert.deepEqual(a.picks.map(p => [p.owner, p.player]), b.picks.map(p => [p.owner, p.player]));
});

test('the draft stops for a user team and resumes after the user picks', () => {
  const t = teams.order[5];
  const st = D.newDraft({ prospects, teams, chart, seed: 3, userTeams: [t], trades: false });
  assert.equal(D.advance(st), 'user');
  assert.equal(st.picks[st.next].owner, t);
  const pick = D.available(st)[0];
  D.makePick(st, pick, 'user');
  assert.equal(st.picks[st.next - 1].player, pick);
  assert.notEqual(D.advance(st), 'done');
});

test('a team that trades up pays at least the chart value and takes its target', () => {
  let checked = 0;
  for (let s = 0; s < 20; s++) {
    const st = D.newDraft({ prospects, teams, chart, seed: 200 + s });
    D.advance(st, { stopAtUser: false });
    for (const t of st.tradeLog) {
      const got = t.got.reduce((a, p) => a + st.value(p), 0);
      const gave = t.gave.reduce((a, p) => a + st.value(p), 0);
      assert.ok(gave >= got * D.TUNING.tradePremium - 1e-6, `trade at ${t.at} underpaid`);
      const pick = st.picks[t.at - 1];
      assert.equal(pick.owner, t.buyer);
      if (pick.target != null) { assert.equal(pick.player, pick.target); checked++; }
    }
  }
  assert.ok(checked > 0);
});

test('user trades: a fair offer is accepted, a lowball is refused', () => {
  const st = D.newDraft({ prospects, teams, chart, seed: 9, userTeams: [teams.order[10]], trades: false });
  const me = teams.order[10];
  const mine = st.picks.map((p, k) => ({ p, k })).filter(x => x.p.owner === me).map(x => x.k);
  const theirs = st.picks.map((p, k) => ({ p, k })).filter(x => x.p.owner !== me && x.p.round === 7).map(x => x.k);
  const low = D.proposeTrade(st, me, [mine[mine.length - 1]], [st.picks.findIndex(p => p.owner !== me && p.round === 1)]);
  assert.equal(low.ok, false);
  const fair = D.proposeTrade(st, me, [mine[0]], [theirs[0]]);
  assert.equal(fair.ok, true);
});

test('simulations: about 257 players drafted per run, sensible first-round shape', () => {
  const s = D.simulate({ prospects, teams, chart, n: 40 });
  const drafted = s.summary.reduce((a, x) => a + x.drafted, 0);
  assert.ok(Math.abs(drafted - 257) < 1e-6);
  const r1 = {};
  for (const x of s.summary) r1[prospects[x.i].group] = (r1[prospects[x.i].group] ?? 0) + x.r1;
  // Specialists essentially never go in round 1; QBs and edge rushers do.
  assert.ok((r1.K ?? 0) + (r1.P ?? 0) + (r1.LS ?? 0) < 0.05);
  assert.ok(r1.QB > 1 && r1.EDGE > 1);
  assert.ok(s.round1TradesPerDraft > 2 && s.round1TradesPerDraft < 10);
});

test('UDFA rush and class grades cover every team', () => {
  const st = D.newDraft({ prospects, teams, chart, seed: 4 });
  D.advance(st, { stopAtUser: false });
  const u = D.udfaRush(st);
  assert.ok(u.length > 30);
  assert.equal(new Set(u.map(x => x.i)).size, u.length);
  const g = D.classGrades(st);
  assert.equal(Object.keys(g).length, 32);
});
