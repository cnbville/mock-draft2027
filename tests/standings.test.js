// Tests for the live standings and the order projection (app/js/standings.js): node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as S from '../app/js/standings.js';

const teams = JSON.parse(fs.readFileSync(new URL('../app/data/teams.json', import.meta.url)));
const season = teams.draft_year - 1;
const run = o => S.project({ games: teams.games, teams: teams.teams, season, sims: 300, ...o });

// A finished season: every unplayed game goes to the home team, scored 20-10.
const finished = () => teams.games.map(g => (g.s === season && g.type === 'REG' && g.hs == null ? { ...g, hs: 20, as: 10 } : g));

test('the built-in games cover both seasons and every team', () => {
  assert.ok(teams.games.some(g => g.s === season) && teams.games.some(g => g.s === season - 1));
  const rec = S.dataRecords(teams.games, season);
  assert.equal(Object.keys(rec).length, 32);
  for (const t of Object.keys(teams.teams)) {
    const [w, l] = teams.teams[t].record.split('-').map(Number);
    assert.equal(rec[t].w + rec[t].t / 2, w, `${t} wins match the built record`);
    assert.equal(rec[t].l + rec[t].t / 2, l, `${t} losses match the built record`);
  }
});

test('parseGames reads the nflverse layout, quoted fields and unplayed games', () => {
  const csv = 'game_id,season,game_type,week,gameday,away_team,away_score,home_team,home_score,location,stadium\n' +
    '2026_01_A_B,2026,REG,1,2026-09-10,KC,24,BUF,27,Home,"Highmark Stadium, Orchard Park"\n' +
    '2026_02_A_B,2026,REG,2,2026-09-17,BUF,,MIA,,Neutral,X\n2019_01_A_B,2019,REG,1,2019-09-10,KC,1,BUF,2,Home,X\n';
  const g = S.parseGames(csv, [2025, 2026]);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0], { s: 2026, type: 'REG', wk: 1, day: '2026-09-10', away: 'KC', home: 'BUF', as: 24, hs: 27, neutral: false });
  assert.equal(g[1].hs, null);
  assert.equal(g[1].neutral, true);
  assert.throws(() => S.parseGames('a,b\n1,2', [2026]), /no season/);
});

test('the projection gives 32 distinct slots and close to the pipeline order', () => {
  const p = run();
  assert.equal(new Set(p.order).size, 32);
  assert.equal(p.done, false);
  // Same model as pipeline/nfl.py, so the worst team and the best stay at the ends.
  assert.ok(p.order.indexOf(teams.order[0]) < 4);
  assert.ok(p.order.indexOf(teams.order[31]) > 27);
  for (const x of Object.values(p.teams)) assert.equal(x.slot_dist.reduce((a, b) => a + b, 0), 300);
});

test('a finished season orders the non-playoff teams by record', () => {
  const p = S.project({ games: finished(), teams: teams.teams, season, sims: 50 });
  assert.equal(p.done, true);
  const non = p.order.slice(0, 18);
  const wins = t => Number(p.teams[t].record.split('-')[0]);
  for (let i = 1; i < 18; i++) assert.ok(wins(non[i]) >= wins(non[i - 1]), 'non-playoff teams ordered by wins');
  for (const t of p.order) assert.equal(p.teams[t].proj_wins, wins(t) + (Number(p.teams[t].record.split('-')[2]) || 0) / 2);
});

test('your record replaces a team\'s and moves it in the order', () => {
  const best = run().order[31];
  const n = S.dataRecords(teams.games, season)[best];
  const g = n.w + n.l + n.t;
  const p = run({ manual: { [best]: { w: 0, l: g, t: 0 } } });
  assert.equal(p.teams[best].record, `0-${g}`);
  assert.ok(p.teams[best].manual);
  assert.ok(p.order.indexOf(best) < 31);
  // Games your record has beyond the data's count toward the rating too.
  const q = run({ manual: { [best]: { w: n.w, l: n.l + 2, t: n.t } } });
  assert.ok(q.teams[best].rating < run().teams[best].rating, 'two more losses lower the rating');
});

test('a record with fewer games than the data is out of date and ignored', () => {
  const t = 'BUF';
  const p = run({ manual: { [t]: { w: 0, l: 0, t: 0 } } });
  assert.deepEqual(p.stale, [t]);
  assert.equal(p.teams[t].manual, false);
});

test('incomplete or impossible entries are ignored', () => {
  assert.deepEqual(S.cleanManual({ BUF: { w: 3, l: null, t: 0 }, MIA: { w: 10, l: 10, t: 0 }, NE: {} }), {});
  assert.deepEqual(S.cleanManual({ NE: { po: 'champ' } }), { NE: { rec: null, exit: 5 } });
});

test('playoff results you set decide the last slots', () => {
  const games = finished();
  const base = S.project({ games, teams: teams.teams, season, sims: 50 });
  const champ = base.order[20], loser = base.order[31];
  const p = S.project({ games, teams: teams.teams, season, sims: 50, manual: { [champ]: { po: 'champ' }, [loser]: { po: 'missed' } } });
  assert.equal(p.order[31], champ);
  assert.ok(p.order.indexOf(loser) < 18);
  assert.equal(p.teams[champ].slot_p10, 32);
});

test('applyProjection re-slots the picks and keeps who owns them', () => {
  const T = structuredClone(teams);
  const owners = new Map(T.picks.map(x => [`${x.original}|${x.round}`, x.owner]));
  const p = run({ manual: { [T.order[31]]: { w: 0, l: 17, t: 0 } } });
  S.applyProjection(T, p, { source: 'built' });
  assert.deepEqual(T.order, p.order);
  assert.equal(T.picks.length, 224);
  assert.equal(T.picks[0].original, p.order[0]);
  for (const x of T.picks) assert.equal(x.owner, owners.get(`${x.original}|${x.round}`));
  assert.equal(T.standings.source, 'built');
});

test('a failed live fetch falls back to the built-in games', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    const g = await S.chooseGames(teams);
    assert.equal(g.source, 'built');
    assert.equal(g.error, 'offline');
    assert.equal(g.games.length, teams.games.length);
    const none = await S.chooseGames({ draft_year: 2027 });
    assert.equal(none.source, 'none');
  } finally { globalThis.fetch = realFetch; }
});
