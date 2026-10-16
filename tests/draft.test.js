// Tests for the mock draft engine: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as D from '../app/js/draft.js';

const j = f => JSON.parse(fs.readFileSync(new URL(`../app/data/${f}.json`, import.meta.url)));
const prospects = j('prospects'), teams = j('teams'), chart = j('value_chart');
// The app's own model and trade market, so the tests check what the page runs.
const model = j('ai_model'), market = j('trade_market');
const draft = o => D.newDraft({ prospects, teams, chart, model, market, ...o });

test('the draft has 257 picks, every team owns picks, and the order is the projected one', () => {
  const picks = D.buildPicks(teams);
  assert.equal(picks.length, 257);
  assert.deepEqual(picks.map(p => p.overall), picks.map((_, i) => i + 1));
  const owners = new Set(picks.map(p => p.owner));
  assert.ok(owners.size >= 30);
  assert.equal(picks[0].original, teams.order[0]);
});

test('a full AI draft fills every pick with a different declared player', () => {
  const st = draft({ seed: 11 });
  assert.equal(D.advance(st, { stopAtUser: false }), 'done');
  const used = st.picks.map(p => p.player);
  assert.ok(used.every(i => i != null));
  assert.equal(new Set(used).size, 257);
  assert.ok(used.every(i => st.declared[i]));
});

test('the same seed gives the same draft', () => {
  const a = draft({ seed: 5 });
  const b = draft({ seed: 5 });
  D.advance(a, { stopAtUser: false });
  D.advance(b, { stopAtUser: false });
  assert.deepEqual(a.picks.map(p => [p.owner, p.player]), b.picks.map(p => [p.owner, p.player]));
});

test('the draft stops for a user team and resumes after the user picks', () => {
  const t = teams.order[5];
  const st = draft({ seed: 3, userTeams: [t], trades: false });
  assert.equal(D.advance(st), 'user');
  assert.equal(st.picks[st.next].owner, t);
  const pick = D.available(st)[0];
  D.makePick(st, pick, 'user');
  assert.equal(st.picks[st.next - 1].player, pick);
  assert.notEqual(D.advance(st), 'done');
});

test('AI trades: the buyer pays about the market price in every round and takes its target', () => {
  let checked = 0, late = 0, n = 0;
  for (let s = 0; s < 20; s++) {
    const st = draft({ seed: 200 + s });
    D.advance(st, { stopAtUser: false });
    for (const t of st.tradeLog) {
      n++;
      if (t.round >= 4) late++;
      // Real draft-day trades 2011-2025 sat between 0.91 and 1.14 of the market chart (10-90%); a few go further.
      if (!t.withPlayer) assert.ok(t.price > 0.75 && t.price < 1.7, `trade at ${t.at} priced ${t.price}`);
      const pick = st.picks[t.at];
      assert.equal(pick.owner, t.buyer);
      if (pick.target != null) { assert.equal(pick.player, pick.target); checked++; }
    }
  }
  assert.ok(checked > 0 && n > 20 * 10, `${n} trades`);
  assert.ok(late > 0, 'day-3 trades happen');
});

test('user trades: a fair offer is accepted, a lowball is refused', () => {
  const st = draft({ seed: 9, userTeams: [teams.order[10]], trades: false });
  const me = teams.order[10];
  const mine = st.picks.map((p, k) => ({ p, k })).filter(x => x.p.owner === me).map(x => x.k);
  const theirs = st.picks.map((p, k) => ({ p, k })).filter(x => x.p.owner !== me && x.p.round === 7).map(x => x.k);
  const low = D.proposeTrade(st, me, [mine[mine.length - 1]], [st.picks.findIndex(p => p.owner !== me && p.round === 1)]);
  assert.equal(low.ok, false);
  const fair = D.proposeTrade(st, me, [mine[0]], [theirs[0]]);
  assert.equal(fair.ok, true);
});

test('simulations: about 257 players drafted per run, sensible first-round shape', () => {
  const s = D.simulate({ prospects, teams, chart, model, market, n: 40 });
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
  const st = draft({ seed: 4 });
  D.advance(st, { stopAtUser: false });
  const u = D.udfaRush(st);
  assert.ok(u.length > 30);
  assert.equal(new Set(u.map(x => x.i)).size, u.length);
  const g = D.classGrades(st);
  assert.equal(Object.keys(g).length, 32);
});

test('your offers: counteroffers, 2028 picks, lowball memory and the clock', () => {
  const me = teams.order[10];
  const st = draft({ seed: 9, userTeams: [me], trades: false });
  assert.equal(D.advance(st), 'user');
  const k = st.next;
  const mine = st.picks.map((p, i) => ({ p, i })).filter(x => x.p.owner === me && x.p.player == null).map(x => x.i);
  // A team a few picks back wants to move up to your pick: it should answer, and a counter it makes must work.
  const later = st.picks.findIndex((p, i) => i > k + 3 && p.owner !== me && p.round === 1);
  const partner = st.picks[later].owner;
  const r1 = D.evaluateOffer(st, me, [k], [later]);
  assert.ok(['accept', 'counter', 'reject'].includes(r1.decision) && r1.reason.length > 3, r1.reason);
  // Your 2028 first for a late first-rounder of theirs: valued on their chart, the pick moves if accepted.
  const fut = st.future[me].find(f => f.round === 1);
  const res = D.proposeTrade(st, me, [fut, mine[2]], [later]);
  if (res.decision === 'counter') {
    const again = D.proposeTrade(st, me, res.counter.give, res.counter.get);
    assert.equal(again.ok, true, again.reason);
  }
  const moved = res.ok || res.decision === 'counter';
  if (moved) assert.ok(st.future[partner].some(f => f.round === 1 && f.original === me), '2028 pick moved');
  // Three lowballs and a team stops taking your calls this round.
  const other = st.picks.findIndex((p, i) => i > k && p.owner !== me && p.owner !== partner && p.round === 1);
  const cheap = mine[mine.length - 1];
  const answers = [0, 1, 2, 3].map(() => D.evaluateOffer(st, me, [cheap], [other]));
  assert.match(answers[3].reason, /done talking|stopped taking/);
  // The clock: about a minute per offer, 10 minutes in round 1.
  let last;
  for (let n = 0; n < 14; n++) last = D.evaluateOffer(st, me, [cheap], [st.picks.findIndex((p, i) => i > k && p.round === 7 && p.owner !== me)]);
  assert.match(last.reason, /time is up/);
});

test('calls: AI teams call you to move up or back, and accepting one makes the trade', () => {
  let seen = 0, accepted = 0;
  for (let s = 0; s < 12 && accepted < 2; s++) {
    const me = teams.order[(s * 5) % 32];
    const st = draft({ seed: 300 + s, userTeams: [me] });
    for (let guard = 0; guard < 400 && st.next < st.picks.length; guard++) {
      const status = D.advance(st);
      if (status === 'call') {
        seen++;
        const c = st.calls[0];
        assert.ok(c.userGives.length && c.userGets.length && c.note);
        const owner = st.picks[c.userGets.find(x => typeof x === 'number')]?.owner;
        if (D.acceptCall(st, c)) {
          accepted++;
          assert.notEqual(owner, me);
          assert.equal(st.picks[c.userGets.find(x => typeof x === 'number')].owner, me);
        }
        st.calls = [];
        continue;
      }
      if (status === 'user') { D.makePick(st, D.choices(st, me, 1)[0].i, 'user'); continue; }
      break;
    }
  }
  assert.ok(seen > 0 && accepted > 0, `${seen} calls, ${accepted} accepted`);
});
