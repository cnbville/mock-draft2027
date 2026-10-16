// Fits the pick model to real drafts: a conditional logit where each real pick is the team's choice among the
// players still on the board. Uses the engine's own feature code (app/js/ai/model.js), so the app runs exactly
// what was fitted.
//
// node tools/fit_pick_model.mjs --train 2020,2021,2023 --test 2024,2025,2026 [--l2 2] [--out app/data/ai_model.json]
//   [--max-pick 2021:64]   only the first 64 picks of 2021 count (its public board has 130 players)
import fs from 'node:fs';
import { GROUPS, NEED_FEATURES, compile, features, featureNames, playerFacts, teamFacts, dot } from '../app/js/ai/model.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const TRAIN = arg('--train', '2024,2025').split(',').map(Number);
const TEST = arg('--test', '2026').split(',').filter(Boolean).map(Number);
const L2 = Number(arg('--l2', '2'));
const OUT = arg('--out', null);
const DIR = arg('--dir', 'build/drafts');
const MAX_PICK = Object.fromEntries((arg('--max-pick', '') || '').split(',').filter(Boolean).map(x => x.split(':').map(Number)));
const load = Y => JSON.parse(fs.readFileSync(`${DIR}/draft_${Y}.json`, 'utf8'));

// League means and spreads of the need facts, from the training years only.
function needStats(years) {
  const vals = {}, all = {};
  for (const Y of years) for (const t of Object.values(load(Y).teams)) for (const g of GROUPS) {
    const x = t.needs?.[g]; if (!x) continue;
    for (const f of NEED_FEATURES) { ((vals[g] ??= {})[f] ??= []).push(x[f]); (all[f] ??= []).push(x[f]); }
  }
  const mean = {}, sd = {};
  for (const g of Object.keys(vals)) { mean[g] = {}; for (const f of NEED_FEATURES) { const a = vals[g][f]; mean[g][f] = a.reduce((s, v) => s + v, 0) / a.length; } }
  for (const f of NEED_FEATURES) { const a = all[f], m = a.reduce((s, v) => s + v, 0) / a.length; sd[f] = Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length) || 1; }
  return { mean, sd };
}

export const CANDIDATES = 150, PER_GROUP = 4;

// Replays one real draft and returns its choice situations: { f: [features of each candidate], y: index }.
export function situations(D, model, C, maxPick = MAX_PICK[D.year] ?? Infinity) {
  const P = D.prospects.map(p => playerFacts(p, { combineDone: true }));
  const T = Object.fromEntries(Object.entries(D.teams).map(([k, t]) => [k, teamFacts(t, model)]));
  const byPick = new Map(D.prospects.map((p, i) => [p.real_pick, i]).filter(([k]) => k != null));
  const order = P.map((_, i) => i).sort((a, b) => P[b].talent - P[a].talent);
  const taken = new Set();
  const teamTaken = {};
  const recent = [];
  const out = [];
  for (const pk of D.picks) {
    const team = pk.final;
    const real = byPick.get(pk.overall);
    const avail = order.filter(i => !taken.has(i));
    const cand = new Set(avail.slice(0, CANDIDATES));
    const seen = {};
    const grank = new Map();
    for (const i of avail) {
      const g = P[i].group;
      seen[g] = (seen[g] ?? 0) + 1;
      grank.set(i, seen[g]);
      if (seen[g] <= PER_GROUP) cand.add(i);
    }
    if (real != null && cand.has(real) && T[team] && pk.overall <= maxPick) {
      const list = [...cand];
      const tk = teamTaken[team] ?? {};
      const fs_ = list.map(i => features(C, T[team], P[i], {
        round: pk.round, taken: tk[P[i].group] ?? 0, run: Math.min(4, recent.filter(g => g === P[i].group).length),
        groupRank: grank.get(i) }, []));
      out.push({ f: fs_, y: list.indexOf(real), year: D.year, pick: pk.overall, team, round: pk.round });
    }
    if (real != null) {
      taken.add(real);
      const g = P[real].group;
      ((teamTaken[team] ??= {})[g] = ((teamTaken[team] ??= {})[g] ?? 0) + 1);
      recent.push(g);
      if (recent.length > 8) recent.shift();
    }
  }
  return out;
}

function nll(w, data, grad) {
  let ll = 0;
  if (grad) grad.fill(0);
  for (const s of data) {
    const u = s.f.map(f => dot(w, f));
    const m = Math.max(...u);
    let z = 0;
    const e = u.map(v => { const x = Math.exp(v - m); z += x; return x; });
    ll += u[s.y] - m - Math.log(z);
    if (grad) {
      for (let j = 0; j < s.f.length; j++) {
        const p = e[j] / z - (j === s.y ? 1 : 0);
        if (!p) continue;
        const f = s.f[j];
        for (let k = 0; k < f.length; k += 2) grad[f[k]] += p * f[k + 1];
      }
    }
  }
  return -ll;
}

export function fit(data, n, l2 = L2, iters = 600) {
  // Adam on the penalised negative log-likelihood (convex, so it converges to the one optimum).
  const w = new Float64Array(n), g = new Float64Array(n), m = new Float64Array(n), v = new Float64Array(n);
  let lr = 0.05;
  for (let t = 1; t <= iters; t++) {
    nll(w, data, g);
    for (let k = 0; k < n; k++) {
      const gk = g[k] / data.length + 2 * l2 * w[k] / data.length;
      m[k] = 0.9 * m[k] + 0.1 * gk;
      v[k] = 0.999 * v[k] + 0.001 * gk * gk;
      w[k] -= lr * (m[k] / (1 - 0.9 ** t)) / (Math.sqrt(v[k] / (1 - 0.999 ** t)) + 1e-8);
    }
    if (t === 400) lr = 0.02;
  }
  return w;
}

export function score(w, data) {
  let ll = 0, top1 = 0, top5 = 0, r1top1 = 0, r1n = 0;
  for (const s of data) {
    const u = s.f.map(f => dot(w, f));
    const m = Math.max(...u);
    const z = u.reduce((a, v) => a + Math.exp(v - m), 0);
    ll += u[s.y] - m - Math.log(z);
    const rank = u.filter(v => v > u[s.y]).length;
    if (rank === 0) top1++;
    if (rank < 5) top5++;
    if (s.round === 1) { r1n++; if (rank === 0) r1top1++; }
  }
  return { picks: data.length, ll_per_pick: +(ll / data.length).toFixed(4), top1: +(top1 / data.length).toFixed(3),
    top5: +(top5 / data.length).toFixed(3), round1_top1: +(r1top1 / Math.max(1, r1n)).toFixed(3) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const needs = needStats(TRAIN);
  const model = { needs, weights: {} };
  const C = compile(model);
  const train = TRAIN.flatMap(Y => situations(load(Y), model, C));
  const test = TEST.flatMap(Y => situations(load(Y), model, C));
  const t0 = Date.now();
  const w = fit(train, C.names.length);
  const names = featureNames();
  // A talent-only baseline: board order plus position by round.
  const keep = new Set(names.map((n, i) => (n.startsWith('talent') || n.startsWith('pos|') || n.startsWith('offboard') ? i : -1)).filter(i => i >= 0));
  const base = fit(train.map(s => ({ ...s, f: s.f.map(f => { const o = []; for (let k = 0; k < f.length; k += 2) if (keep.has(f[k])) o.push(f[k], f[k + 1]); return o; }) })), C.names.length);
  const res = { train_years: TRAIN, test_years: TEST, l2: L2, seconds: (Date.now() - t0) / 1000,
    train: score(w, train), test: score(w, test), test_board_and_position_only: score(base, test), train_board_and_position_only: score(base, train) };
  console.error(JSON.stringify(res, null, 1));
  const weights = Object.fromEntries(names.map((n, i) => [n, +w[i].toFixed(5)]).filter(([, v]) => v !== 0));
  const top = Object.entries(weights).filter(([n]) => !n.startsWith('pos|')).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 40);
  console.error(top.map(([n, v]) => `${n} ${v}`).join('\n'));
  if (OUT) {
    const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
    fs.writeFileSync(OUT, JSON.stringify({ ...prev, source: `conditional logit fitted on the ${TRAIN.join(', ')} drafts with their consensus boards (computed); tested on ${TEST.join(', ')}`,
      needs, weights, fit: res }, null, 1));
  }
}
