// The AI-to-AI trade market. Pure logic.
//
// When an AI team is on the clock, every AI team whose next pick is within reach asks itself: will the player I
// want be gone by my pick? Its gain from moving up is what it expects with this pick minus what it expects with
// its own (market.js, from the other teams' boards). The team on the clock asks the chart gap plus its margin,
// plus a share of what it loses in players beyond the chart (a deep tier makes it cheap; a player it loves makes
// it dear). A deal is possible when the buyer's most is above the seller's ask. The buyer pays in later picks
// this year or 2028 picks, and the seller sometimes hands back a later pick to even it out. Which possible deals
// get done is friction, set per round so the counts match real draft weekends 2018-2025.
// A few trades a year send a veteran for a pick; those are here too.

import { buyerMax, sellerAsk, findPackage, spareAssets, giveBacks, assetValue, invalidate, label, isCurrent, isFuture, isPlayer,
  picksOf } from './market.js';
import { NEED_FEATURES } from './model.js';

// How keen a team is to trade, against the league (1 = average), from its GM's record when known.
export function propensity(state, team, side) {
  const t = state.teams.teams[team];
  const pr = t?.front_office?.profile ?? {};
  const v = side === 'up' ? pr.trade_up_rate : pr.trade_down_rate;
  if (v != null) return v;
  const h = t?.habits?.draft_trades_per_year;
  return h != null && state.avgTradeRate ? Math.sqrt(h / state.avgTradeRate) : 1;
}

// Moves assets between two teams and logs the trade. `a` gives `giveA`, `b` gives `giveB`.
export function executeTrade(state, a, b, giveA, giveB, note = '', meta = {}) {
  const move = (x, from, to) => {
    if (isCurrent(x)) { state.picks[x].owner = to; state.picks[x].target = null; return; }
    if (isPlayer(x)) return;
    const list = state.future[from] ?? [];
    const n = list.findIndex(f => f.round === x.round && f.original === x.original && (f.season ?? state.year + 1) === (x.season ?? state.year + 1));
    if (n < 0) return;
    const [f] = list.splice(n, 1);
    (state.future[to] ??= []).push({ ...f, owner: to });
  };
  const la = giveA.map(x => label(state, x)), lb = giveB.map(x => label(state, x));
  for (const x of giveA) move(x, a, b);
  for (const x of giveB) move(x, b, a);
  const first = list => Math.min(Infinity, ...list.filter(isCurrent));
  // The buyer is the team that gets the earliest pick of this draft.
  const aUp = first(giveB) < first(giveA);
  const [buyer, seller, got, gave, gotA, gaveA] = aUp ? [a, b, lb, la, giveB, giveA] : [b, a, la, lb, giveA, giveB];
  const up = first(gotA), down = first(gaveA);
  const v = (list, team) => list.reduce((s, x) => s + assetValue(state, team, x), 0);
  state.tradeLog.push({
    at: state.next, round: state.picks[state.next]?.round ?? 7, buyer, seller, got, gave, note,
    gotAssets: gotA, gaveAssets: gaveA,
    slotsMoved: Number.isFinite(up) && Number.isFinite(down) && ![...giveA, ...giveB].some(isPlayer)
      ? state.picks[down].overall - state.picks[up].overall : null,
    withFuture: [...giveA, ...giveB].some(isFuture), withPlayer: [...giveA, ...giveB].some(isPlayer),
    downAdds: gotA.filter(isCurrent).length > 1 || gotA.some(isFuture),
    // Price on the market chart: what the buyer paid over what it got.
    price: v(gotA, '_market') ? v(gaveA, '_market') / v(gotA, '_market') : null,
    user: !!meta.user,
  });
  state.tradesThisRound++;
  invalidate(state);
}

// The deals that work at pick k with seller s, best first. `buyers` limits who is asked.
export function workableDeals(state, k, s, { buyers = null, extraMargin = 0 } = {}) {
  const round = state.picks[k].round, tr = state.tuning;
  const W = tr.window[round - 1];
  const first = new Map();
  for (let m = k + 1; m < Math.min(state.picks.length, k + 1 + W); m++) {
    const o = state.picks[m].owner;
    if (o !== s && !first.has(o) && state.picks[m].player == null) first.set(o, m);
  }
  const out = [];
  for (const [b, j] of first) {
    if (buyers ? !buyers(b) : state.userTeams.has(b)) continue;
    const bm = buyerMax(state, b, k, j);
    if (!bm || bm.max <= 0) continue;
    const sa = sellerAsk(state, s, k, j, bm.target, extraMargin);
    if (sa.ask > bm.max) continue;
    out.push({ b, j, bm, sa, room: bm.max - sa.ask });
  }
  // The keenest buyers call first: room as a share of the price.
  return out.sort((x, y) => y.room / Math.max(1, y.sa.ask) - x.room / Math.max(1, x.sa.ask));
}

// One trade check at the pick on the clock. Returns the trade logged, or null.
export function tryMarket(state) {
  const k = state.next;
  const pk = state.picks[k];
  if (!pk || pk.player != null || pk.target != null) return null;
  const s = pk.owner;
  if (state.userTeams.has(s)) return null;
  const tr = state.tuning, round = pk.round;
  if (state.tradesThisRound >= tr.maxPerRound[round - 1]) return null;
  if (tryVeteran(state)) return state.tradeLog.at(-1);
  const deals = workableDeals(state, k, s).slice(0, 3);
  for (const d of deals) {
    // Any package between the seller's ask and the buyer's most works; they settle near a point in between.
    const target = d.sa.ask + state.r() * tr.split * d.room;
    const pkg = findPackage(state, {
      payer: d.b, payee: s, need: d.sa.ask, cap: d.bm.max, target,
      payerAssets: spareAssets(state, d.b, d.j), payeeAssets: giveBacks(state, s, d.j),
    });
    if (!pkg) continue;
    // Friction: a workable deal still needs both sides to make the call and agree in time. Teams with more
    // room are keener.
    const keen = Math.min(1, d.room / Math.max(1, 0.25 * d.bm.gap));
    const p = tr.dealRate[round - 1] * propensity(state, d.b, 'up') * propensity(state, s, 'down') * keen;
    if (state.r() >= p) continue;
    executeTrade(state, d.b, s, [d.j, ...pkg.extras], [k, ...pkg.back],
      d.bm.isQB ? 'moved up for a quarterback' : d.sa.loss < 0.5 * d.sa.gap ? 'moved down from a deep tier' : '');
    state.picks[k].target = d.bm.target;
    return state.tradeLog.at(-1);
  }
  return null;
}

// Veteran-for-pick trades (about 2 a year, 2018-2025). The team on the clock gives this pick for a starter at a
// position it badly needs, from a team that has his replacement in mind or can't pay him next year.
// The veteran's value is estimated: the market value of the pick his role, age and pedigree are worth, less a bit
// for his contract.
export function vetValue(v) {
  const slot = 8 + 150 * Math.max(0, 1 - v.snap_share) + 6 * Math.max(0, (v.age ?? 27) - 26) +
    (v.draft_pick == null ? 25 : v.draft_pick <= 32 ? 0 : v.draft_pick <= 100 ? 10 : 25);
  return slot;
}

function needScore(state, team, g, round) {
  const nd = state.T[team]?.need?.[g];
  if (!nd) return 0;
  const b = round <= 2 ? 0 : round <= 4 ? 1 : 2;
  const w = state.C.w, I = state.C.idx;
  return NEED_FEATURES.reduce((s, f, n) => s + (w[I[`need|${f}|${b}`]] ?? 0) * nd[n], 0);
}

export function tryVeteran(state) {
  const tr = state.tuning;
  if (!tr.vetRate) return false;
  const k = state.next, pk = state.picks[k], s = pk.owner, round = pk.round;
  if (round > 4 || state.r() >= tr.vetRate[round - 1]) return false;
  // Its biggest need by the fitted need weights.
  const groups = Object.keys(state.T[s].need).filter(g => !['K', 'P', 'LS'].includes(g));
  const scored = groups.map(g => [g, needScore(state, s, g, round)]).sort((a, b) => b[1] - a[1]);
  const [g] = scored[0];
  const year = state.year;
  let best = null;
  for (const v of state.teamIds) {
    if (v === s || state.userTeams.has(v)) continue;
    const st = state.teams.teams[v].needs?.[g]?.starters ?? [];
    if (needScore(state, v, g, round) > 0) continue;        // the other team needs him too
    for (const p of st) {
      if (state.vetsMoved?.has(p.name) || p.age == null || p.age < 24 || p.age > 30 || (p.snap_share ?? 0) < 0.55) continue;
      if (p.contract_end != null && p.contract_end > year) continue;   // only players due a new deal
      const slot = vetValue(p);
      const val = 0.8 * state.charts.per._market.chart(slot);
      if (!best || val > best.val) best = { v, p, val, slot };
    }
  }
  if (!best) return false;
  const pv = assetValue(state, best.v, k), ps = assetValue(state, s, k);
  // The veteran's team wants the pick to be worth him; the buyer pays more for a big need (estimated 30%).
  const sellerNeed = best.val * (1 + tr.margin) - pv;
  const buyerCap = best.val * 1.3 - ps;
  if (buyerCap < 0) return false;
  const pkg = findPackage(state, { payer: s, payee: best.v, need: sellerNeed, cap: buyerCap,
    payerAssets: spareAssets(state, s, k, { current: 4, future: 2 }), payeeAssets: picksOf(state, best.v, k + 1).slice(-4), backOnly: true });
  if (!pkg) return false;
  const asset = { player: best.p.name, group: g, from: best.v, value: best.val };
  (state.vetsMoved ??= new Set()).add(best.p.name);
  executeTrade(state, s, best.v, [k, ...pkg.extras], [asset, ...pkg.back], `traded for a veteran ${g}`);
  // Needs change: the buyer's need at his position eases, the seller's grows (estimated sizes).
  const sn = state.T[s].need[g], vn = state.T[best.v].need[g];
  for (let n = 0; n < sn.length; n++) sn[n] *= 0.5;
  vn[NEED_FEATURES.indexOf('snap')] -= 1;
  vn[NEED_FEATURES.indexOf('open')] += 1;
  delete state.base[s]; delete state.base[best.v];
  invalidate(state, [s, best.v]);
  return true;
}
