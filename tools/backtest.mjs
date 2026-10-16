// The standing backtest: replays real past drafts through the app's own engine and scores it the way mock
// drafts are scored, plus the behaviour checks (how far picks stray from the board, falls, ranges, positions,
// trades) and the offers test (every real draft-day trade put to the AI both ways, and the same trade 15% short).
//
// node tools/backtest.mjs --years 2024,2025,2026 --model app/data/ai_model.json [--sims 200] [--offer-seeds 40]
//   [--out build/backtest.json] [--set noise.shared=0.4,trades.dealRate.0=0.5]
// Inputs come from pipeline/draft_inputs.py (build/drafts/draft_<year>.json).
import fs from 'node:fs';
import * as D from '../app/js/draft.js';
import { judge } from '../app/js/ai/offers.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const YEARS = arg('--years', '2024,2025,2026').split(',').map(Number);
const SIMS = Number(arg('--sims', '200'));
const OFFER_SEEDS = Number(arg('--offer-seeds', '40'));
const OUT = arg('--out', null);
const DIR = arg('--dir', 'build/drafts');
const QUIET = process.argv.includes('--quiet');
const model = JSON.parse(fs.readFileSync(arg('--model', 'app/data/ai_model.json'), 'utf8'));
const market = JSON.parse(fs.readFileSync('app/data/trade_market.json', 'utf8'));
const chart = JSON.parse(fs.readFileSync('app/data/value_chart.json', 'utf8'));
const realTrades = JSON.parse(fs.readFileSync('build/real_trades.json', 'utf8'));

// --set noise.shared=0.4,trades.dealRate=0.5,trades.dealRate.3=0.3 overrides model numbers for tuning runs.
for (const kv of (arg('--set', '') || '').split(',').filter(Boolean)) {
  const [path, v] = kv.split('=');
  const [grp, key, idx] = path.split('.');
  const base = grp === 'noise' ? D.TUNING.noise : D.TUNING.trades;
  model[grp] = { ...base, ...(model[grp] ?? {}) };
  if (idx != null) { const a = [...model[grp][key]]; a[Number(idx)] = Number(v); model[grp][key] = a; }
  else if (Array.isArray(base[key])) model[grp][key] = base[key].map(() => Number(v));
  else model[grp][key] = Number(v);
}

const POS = { QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', T: 'OT', OT: 'OT', G: 'IOL', OG: 'IOL', C: 'IOL', OL: 'IOL',
  DE: 'EDGE', OLB: 'EDGE', EDGE: 'EDGE', DT: 'DT', NT: 'DT', DL: 'DT', LB: 'LB', ILB: 'LB', MLB: 'LB', CB: 'CB', DB: 'CB',
  S: 'S', SAF: 'S', FS: 'S', SS: 'S', K: 'K', P: 'P', LS: 'LS' };
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : null; };
const r2 = x => (x == null ? null : Math.round(x * 100) / 100);

function inputs(Y) {
  const d = JSON.parse(fs.readFileSync(`${DIR}/draft_${Y}.json`, 'utf8'));
  const key = d.draft_day_trades_in_data ? 'eve' : 'final';
  const prospects = d.prospects.map(p => ({ ...p, p_declare: 1 }));
  const byPick = new Map();
  prospects.forEach((p, i) => { if (p.real_pick) byPick.set(p.real_pick, i); });
  const ghosts = [];
  for (const p of d.picks) {
    if (byPick.has(p.overall)) continue;
    byPick.set(p.overall, prospects.length);
    ghosts.push(prospects.length);
    prospects.push({ id: -p.overall, name: p.player, group: POS[p.pos] ?? 'WR', board_value: 0, model_rank: 999,
      p_declare: 0, real_pick: p.overall, real_team: p.final, ghost: true });
  }
  const teams = {
    order: Object.keys(d.teams).sort(), draft_year: Y,
    picks: d.picks.map(p => ({ round: p.round, overall: p.overall, owner: p[key], original: p.eve })),
    teams: Object.fromEntries(Object.entries(d.teams).map(([t, x]) => [t, { ...x,
      future_picks: (x.future_picks ?? []).map(f => ({ ...f, season: Y + 1 })) }])),
  };
  return { d, key, prospects, teams, ghosts, byPick };
}

function start(inp, seed, opts = {}) {
  const st = D.newDraft({ prospects: inp.prospects, teams: inp.teams, chart, model, market, seed, allDeclare: true,
    combineDone: true, year: inp.d.year, ...opts });
  for (const g of inp.ghosts) st.declared[g] = false;
  return st;
}

// Board rank of every pool player: his place in the class by the engine's own board order.
function boardRanks(st) {
  const m = new Map();
  st.ordered.filter(i => st.declared[i]).forEach((i, n) => m.set(i, n + 1));
  return m;
}

// Behaviour of one draft's picks: [{ pick, i, team }] with board ranks.
function behaviour(list, rank, P) {
  const dist = { r1: [], r2: [], r3: [] };
  let bestLeft1 = 0, bestLeft2 = 0, n1 = 0, n2 = 0, reaches = 0;
  const taken = new Set();
  const ranked = [...rank.entries()].sort((a, b) => a[1] - b[1]).map(([i]) => i);
  let ptr = 0;
  const pos = {};
  for (const x of list) {
    if (x.i == null) continue;
    const r = rank.get(x.i);
    while (ptr < ranked.length && taken.has(ranked[ptr])) ptr++;
    const best = ranked[ptr];
    taken.add(x.i);
    const g = P[x.i].group;
    pos[g] = (pos[g] ?? 0) + 1;
    if (x.pick <= 32) { pos[`${g}_r1`] = (pos[`${g}_r1`] ?? 0) + 1; }
    if (r == null) continue;
    const bucket = x.pick <= 32 ? 'r1' : x.pick <= 100 ? 'r2' : 'r3';
    dist[bucket].push(Math.abs(x.pick - r));
    if (x.pick <= 32) { n1++; if (x.i === best) bestLeft1++; } else if (x.pick <= 100) { n2++; if (x.i === best) bestLeft2++; }
    if (x.pick <= 100 && r - x.pick >= 30) reaches++;
  }
  const pickOf = new Map(list.filter(x => x.i != null).map(x => [x.i, x.pick]));
  let falls = 0;
  for (const [i, r] of rank) if (r <= 50 && (pickOf.get(i) ?? 300) - r >= 30) falls++;
  const qb = list.filter(x => x.i != null && x.pick <= 64 && P[x.i].group === 'QB' && rank.get(x.i)).map(x => rank.get(x.i) - x.pick);
  return { d1: med(dist.r1), d2: med(dist.r2), d3: med(dist.r3), best1: n1 ? bestLeft1 / n1 : 0, best2: n2 ? bestLeft2 / n2 : 0,
    reaches, falls, edge: pos.EDGE ?? 0, spec: (pos.K ?? 0) + (pos.P ?? 0) + (pos.LS ?? 0), iolR1: pos.IOL_r1 ?? 0,
    otR1: pos.OT_r1 ?? 0, qbR1: pos.QB_r1 ?? 0, qbReach: qb.length ? med(qb) : null };
}

function scoreRound1(st, inp) {
  const realR1 = inp.d.picks.filter(p => p.overall <= 32).map(p => ({ i: inp.byPick.get(p.overall), team: p.final, pick: p.overall }));
  const simR1 = new Map(st.picks.slice(0, 32).map(p => [p.player, { team: p.owner, pick: p.overall }]));
  let hits = 0, team = 0, exact = 0;
  for (const r of realR1) {
    const s = simR1.get(r.i);
    if (!s) continue;
    hits++;
    if (s.team === r.team) team++;
    if (s.pick === r.pick) exact++;
  }
  return { hits, team, exact, huddle: hits + 2 * team };
}

function tradeShape(log) {
  const t = { r1: 0, r2: 0, r3: 0, r4_7: 0, all: log.length, future: 0, player: 0, downAdds: 0, slots: [], price: [] };
  for (const x of log) {
    if (x.round <= 3) t[`r${x.round}`]++; else t.r4_7++;
    if (x.withFuture) t.future++;
    if (x.withPlayer) t.player++;
    if (x.downAdds) t.downAdds++;
    if (x.slotsMoved != null) t.slots.push(x.slotsMoved);
    if (x.price != null && !x.withPlayer) t.price.push(x.price);
  }
  return t;
}

function replayYear(Y) {
  const inp = inputs(Y);
  const t0 = Date.now();
  const sims = [];
  const landing = new Map();
  let st0 = null;
  for (let s = 0; s < SIMS; s++) {
    const st = start(inp, 1000 + s * 7919);
    st0 ??= st;
    D.advance(st, { stopAtUser: false });
    const rank = boardRanks(st);
    const list = st.picks.map(p => ({ pick: p.overall, i: p.player, team: p.owner }));
    for (const x of list) if (x.i != null) (landing.get(x.i) ?? landing.set(x.i, []).get(x.i)).push(x.pick);
    sims.push({ r1: scoreRound1(st, inp), beh: behaviour(list, rank, st.P), trades: tradeShape(st.tradeLog) });
  }
  const seconds = (Date.now() - t0) / 1000;
  // The real draft, measured the same way on the same board.
  const rank = boardRanks(st0);
  const realList = inp.d.picks.map(p => ({ pick: p.overall, i: inp.byPick.get(p.overall), team: p.final }));
  const real = behaviour(realList, rank, st0.P);
  // Ranges: was the real pick inside the AI's own 10-90% range? Undrafted counts as pick 300.
  const cover = { r1: [0, 0], top100: [0, 0], all: [0, 0] };
  for (const x of realList) {
    if (x.i == null || inp.ghosts.includes(x.i)) continue;
    const a = (landing.get(x.i) ?? []).slice();
    while (a.length < SIMS) a.push(300);
    const lo = q(a, 0.1), hi = q(a, 0.9);
    const inside = x.pick >= lo && x.pick <= hi ? 1 : 0;
    for (const [k, ok] of [['r1', x.pick <= 32], ['top100', x.pick <= 100], ['all', true]]) if (ok) { cover[k][0] += inside; cover[k][1]++; }
  }
  // The AI's single most likely draft (no noise, no trades), scored like one expert mock.
  const sm = start(inp, 1, { noise: false });
  D.advance(sm, { stopAtUser: false });
  const avg = f => r2(mean(sims.map(f)));
  const realShape = market.per_draft?.find(x => x.year === Y) ?? null;
  return {
    year: Y, owners: inp.key, sims: SIMS, seconds,
    round1: { hits: avg(s => s.r1.hits), team: avg(s => s.r1.team), exact: avg(s => s.r1.exact), huddle: avg(s => s.r1.huddle),
      huddle_p10: q(sims.map(s => s.r1.huddle), 0.1), huddle_p90: q(sims.map(s => s.r1.huddle), 0.9) },
    most_likely: scoreRound1(sm, inp),
    behaviour: { real, ai: Object.fromEntries(Object.keys(real).map(k => [k, avg(s => s.beh[k] ?? 0)])) },
    ranges: Object.fromEntries(Object.entries(cover).map(([k, [a, n]]) => [k, r2(a / Math.max(1, n))])),
    trades: {
      real: realShape,
      ai: { r1: avg(s => s.trades.r1), r2: avg(s => s.trades.r2), r3: avg(s => s.trades.r3), r4_7: avg(s => s.trades.r4_7),
        all: avg(s => s.trades.all), future: avg(s => s.trades.future), player: avg(s => s.trades.player),
        downAdds: avg(s => s.trades.downAdds), slots_median: med(sims.flatMap(s => s.trades.slots)),
        slots_p90: q(sims.flatMap(s => s.trades.slots), 0.9), slots_max: Math.max(0, ...sims.flatMap(s => s.trades.slots)),
        price_median: r2(med(sims.flatMap(s => s.trades.price))), price_p10: r2(q(sims.flatMap(s => s.trades.price), 0.1)),
        price_p90: r2(q(sims.flatMap(s => s.trades.price), 0.9)) },
    },
  };
}

// Every real draft-day trade of this year, offered to the AI both ways with the real picks made up to it.
function offersYear(Y) {
  const inp = inputs(Y);
  const trades = realTrades.filter(t => t.year === Y);
  const out = [];
  for (const t of trades) {
    const rec = { id: t.id, round: t.round, first_pick: t.first_pick, up: t.up, down: t.down, slots: t.slots_moved };
    if (t.round == null || t.incomplete || t.teams.length !== 2) { rec.skip = 'not testable (no picks this year, partial, or three teams)'; out.push(rec); continue; }
    if ((t.up_players?.length ?? 0) + (t.down_players?.length ?? 0) > 0) { rec.skip = 'includes a player'; out.push(rec); continue; }
    const res = { down: [], up: [], downLow: [], upLow: [] };
    for (let s = 0; s < OFFER_SEEDS; s++) {
      for (const side of ['down', 'up']) {
        // side 'down': you are the team that moved up, the AI moves down. 'up': the AI moves up.
        const user = side === 'down' ? t.up : t.down;
        const st = start(inp, 500 + s * 104729, { trades: false, userTeams: [user] });
        for (let k = 1; k < t.first_pick; k++) {
          st.picks[k - 1].owner = inp.d.picks[k - 1].final;
          D.makePick(st, inp.byPick.get(k), 'real');
        }
        const asset = (team, list, fut) => {
          const cur = list.map(n => n - 1);
          for (const n of cur) st.picks[n].owner = team;
          const f = (fut ?? []).map(x => {
            const own = st.future[team] ?? [];
            let m = own.find(y => y.round === x.round && y.original === team) ?? own.find(y => y.round === x.round);
            if (!m) { m = { round: x.round, original: team, owner: team, season: Y + 1 }; own.push(m); st.future[team] = own; }
            return m;
          });
          return [...cur, ...f];
        };
        const upA = asset(t.up, t.up_gives, t.up_future), downA = asset(t.down, t.down_gives, t.down_future);
        const give = user === t.up ? upA : downA, get = user === t.up ? downA : upA;
        const partner = user === t.up ? t.down : t.up;
        const ans = D.evaluateOffer(st, user, give, get);
        res[side].push(ans.decision === 'accept' ? 1 : ans.decision === 'counter' ? 0.5 : 0);
        st.firm = {};
        const low = judge(st, partner, give, get, { discount: 0.15 });
        res[`${side}Low`].push(low.net >= 0 ? 1 : 0);
      }
    }
    for (const [k, v] of Object.entries(res)) rec[k] = r2(mean(v.map(x => (x === 1 ? 1 : 0))));
    rec.downCounter = r2(mean(res.down.map(x => (x === 0.5 ? 1 : 0))));
    rec.upCounter = r2(mean(res.up.map(x => (x === 0.5 ? 1 : 0))));
    out.push(rec);
  }
  const ok = out.filter(r => !r.skip);
  const sum = k => r2(ok.reduce((s, r) => s + (r[k] ?? 0), 0));
  return { year: Y, tested: ok.length, skipped: out.length - ok.length,
    you_move_up_accepted: sum('down'), you_move_up_countered: sum('downCounter'), you_move_up_15pct_short_accepted: sum('downLow'),
    you_move_down_accepted: sum('up'), you_move_down_countered: sum('upCounter'), you_move_down_15pct_short_accepted: sum('upLow'),
    trades: out };
}

const results = { model_source: model.source ?? null, sims: SIMS, years: [] };
for (const Y of YEARS) {
  const r = replayYear(Y);
  if (OFFER_SEEDS > 0) r.offers = offersYear(Y);
  results.years.push(r);
  if (!QUIET) {
    const { trades: _t, ...offerSummary } = r.offers ?? {};
    console.error(JSON.stringify({ ...r, offers: offerSummary }, null, 1));
  }
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
if (QUIET) for (const r of results.years) console.log(JSON.stringify({ y: r.year, r1: r.round1, ml: r.most_likely, rng: r.ranges, t: r.trades.ai }));
