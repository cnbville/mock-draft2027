// Pick values, player values and the situational value of a pick, shared by the AI-to-AI market (trades.js) and
// your offers (offers.js), so both are judged the same way.
//
// The market chart is fitted to real draft-day trades 2011-2023 (pipeline/trade_history.py):
// V(p) = 1000 exp(-a (p - 1)^b), and a future pick is worth f x V(its likely slot). Each team's chart leans the
// way its GM has traded (steeper for GMs who pay like the old Jimmy Johnson chart, flatter for ones who pay like
// the newer charts). A player's value to a team is the market value of the pick his grade is worth to that team
// ("he's a top-10 player to us"). A pick's situational value is what the team expects to get with it: its top
// player if he lasts, else the next one, with the chance each is gone taken from the other teams' own boards.


const DEFAULT_MARKET = { a: 0.079023, b: 0.784641, future_factor: 0.4671 };

export function makeCharts(market, teams, value) {
  const mc = { ...DEFAULT_MARKET, ...(market?.market_chart ?? {}) };
  const make = steep => p => 1000 * Math.exp(-mc.a * steep * Math.pow(Math.max(1, p) - 1, mc.b));
  const base = make(1);
  const per = { _market: { chart: base, future: mc.future_factor, margin: 0 } };
  for (const t of Object.keys(teams.teams)) {
    const pr = teams.teams[t].front_office?.profile ?? {};
    per[t] = { chart: make(1 + (pr.chart_tilt ?? 0)), future: mc.future_factor * (1 + (pr.future_tilt ?? 0)),
      margin: pr.trade_margin ?? 0 };
  }
  return { base, per, mc, value };
}

// The pick number a chart value is worth on the market chart (for plain reasons: "about pick 70's value").
export function pickOfValue(state, v) {
  const { a, b } = state.charts.mc;
  if (v >= 1000) return 1;
  if (v <= 0.5) return 300;
  return Math.round(1 + Math.pow(-Math.log(v / 1000) / a, 1 / b));
}

export const isCurrent = a => typeof a === 'number';
export const isFuture = a => a != null && typeof a === 'object' && a.round != null && a.player == null;
export const isPlayer = a => a != null && typeof a === 'object' && a.player != null;

// Where a future pick will probably land: worse teams pick earlier (regressed toward the middle).
export function futureSlot(state, f) {
  const t = state.teams.teams[f.original];
  const wp = t?.standing?.win_pct ?? (t?.slot_mean != null ? 1 - (t.slot_mean - 1) / 31 : 0.5);
  const within = Math.max(1, Math.min(32, 16.5 + (0.5 - wp) * 31 * 0.6));
  return (f.round - 1) * 32 + within;
}

const chartOf = (state, team) => state.charts.per[team] ?? state.charts.per._market;

export function futureValue(state, team, f) {
  const c = chartOf(state, team);
  return c.future * c.chart(futureSlot(state, f));
}

export function pickValue(state, team, k) {
  return chartOf(state, team).chart(state.picks[k].overall);
}

export function assetValue(state, team, a) {
  if (isCurrent(a)) return pickValue(state, team, a);
  if (isPlayer(a)) return a.value ?? 0;
  return futureValue(state, team, a);
}

// A player's place on a team's current list, valued from the pick on the clock: its first choice now is worth
// this pick, its second the next pick, and so on. If every team saw the same board, every move would be a wash.
export function listValue(state, team, n) {
  return chartOf(state, team).chart(state.picks[state.next].overall + n);
}

// A team's trade board: every player in the class ranked by how it grades him, and a player's value in a trade
// talk is the market value of his place on that board ("he's 40th on our board, so he's worth pick 40 to us").
// The grade starts from the public board and adds the team's position values and the league's shared view of the
// player (what every team hears), then a share (trust) of its own view: needs, scheme fit, GM tastes, flags and
// its scouts' own read. Teams know their own reads are noisy, so they
// put only part of them on the line when they trade (trust is tuned so trade counts match real drafts). Ranks
// count the whole class, so a player who slides keeps his grade.
export function boardRank(state, team, i) {
  state._board ??= {};
  let r = state._board[team];
  if (!r) {
    const w = state.C.w, I = state.C.idx;
    // The team's round-1 view (cache slot 0): talent and position terms of rounds 1-2 plus round 1's own.
    const theta = Math.max(0.3, (w[I['talent|0']] || 1) + (w[I['talent|r1']] ?? 0));
    const trust = state.tuning.trust ?? 0.5;
    const ids = [];
    for (let n = 0; n < state.P.length; n++) if (state.declared[n]) ids.push(n);
    const sc = new Float64Array(state.P.length);
    for (const n of ids) {
      const P = state.P[n];
      const pos = (w[I[`pos|${P.group}|0`]] ?? 0) + (w[I[`pos|${P.group}|r1`]] ?? 0);
      // The league's shared view of a player (what every team hears) counts in full; the team's own read only in part.
      const own = state.baseFn(state, team, n, 0) - theta * P.talent - pos - state.shared[n];
      sc[n] = P.talent + (pos + state.shared[n] + trust * own) / theta;
    }
    ids.sort((x, y) => sc[y] - sc[x]);
    r = state._board[team] = new Int32Array(state.P.length).fill(state.P.length);
    ids.forEach((n, k) => { r[n] = k + 1; });
  }
  return r[i];
}

export function playerValue(state, team, i) {
  return chartOf(state, team).chart(boardRank(state, team, i));
}

// Each team's top candidates at this pick with their utilities (no day noise), for projections.
export function snapshot(state, top = 70) {
  const k = state.next;
  if (state._snap?.k === k) return state._snap;
  const round = state.picks[k].round;
  const cands = [];
  const seen = {};
  for (const i of state.ordered) {
    if (!state.declared[i] || state.taken.has(i)) continue;
    const g = state.P[i].group;
    seen[g] = (seen[g] ?? 0) + 1;
    if (cands.length < top || seen[g] <= 2) cands.push({ i, gr: seen[g] });
    if (cands.length >= top + 30) break;
  }
  const util = {};
  for (const t of state.teamIds) {
    util[t] = cands.map(({ i, gr }) => ({ i, u: state.utilityFn(state, t, i, round, gr) })).sort((a, b) => b.u - a.u);
  }
  state._snap = { k, round, util };
  state._odds = null;
  return state._snap;
}

// Clears the cached projections after a trade or a change to a team's needs.
export function invalidate(state, teams = []) { state._snap = null; state._odds = null; for (const t of teams) if (state._board) delete state._board[t]; }

// Projects the next picks: each owner takes its best remaining player. `owners` can override who holds a pick,
// `forced` fixes a pick's player (a team that trades up takes its target). Returns { at: Map pick -> player, gone: Set }.
export function project(state, from, to, owners = {}, forced = {}) {
  const snap = snapshot(state);
  const gone = new Set();
  const at = new Map();
  for (let k = from; k < Math.min(to, state.picks.length); k++) {
    const team = owners[k] ?? state.picks[k].owner;
    let i = forced[k];
    const tg = state.picks[k].target;
    if (i == null && tg != null && !gone.has(tg) && !state.taken.has(tg)) i = tg;
    if (i == null) i = snap.util[team].find(x => !gone.has(x.i))?.i;
    if (i == null) continue;
    gone.add(i);
    at.set(k, i);
  }
  return { at, gone };
}

// How far ahead teams look when they weigh a trade: the trade window for this round.
export function horizon(state) {
  const r = state.picks[state.next]?.round ?? 7;
  return state.tuning.window[r - 1] ?? 32;
}

// The chance each upcoming pick takes each candidate. A choice among utilities with Gumbel noise is a softmax, so
// each pick's odds come from its owner's own board and the day's noise. Players the base projection has gone
// earlier are left out. Stored as running log-survival per player, so a "still there at pick j" chance is O(1).
export function odds(state) {
  const k = state.next;
  const snap = snapshot(state);
  if (state._odds?.k === k) return state._odds;
  const to = Math.min(state.picks.length, k + horizon(state) + 1);
  const n = to - k;
  const cum = new Map();      // player -> Float64Array(n + 1) of summed log-survival from pick k
  const order = [];
  const gone = new Set();
  const s = Math.max(0.05, state.scE);
  for (const x of snap.util[state.teamIds[0]]) cum.set(x.i, new Float64Array(n + 1));
  for (let m = k; m < to; m++) {
    const pk = state.picks[m];
    const list = snap.util[pk.owner];
    const p = new Map();
    const tg = pk.target;
    let best = null;
    if (tg != null && !gone.has(tg) && !state.taken.has(tg)) { p.set(tg, 1); best = tg; }
    else {
      let mx = -Infinity;
      for (const x of list) if (!gone.has(x.i) && x.u > mx) { mx = x.u; best = x.i; }
      let z = 0;
      for (const x of list) if (!gone.has(x.i)) { const e = Math.exp((x.u - mx) / s); p.set(x.i, e); z += e; }
      for (const [i, e] of p) p.set(i, e / z);
    }
    const d = m - k;
    for (const [i, a] of cum) a[d + 1] = a[d] + Math.log(Math.max(1e-9, 1 - (p.get(i) ?? 0)));
    order.push(best);
    if (best != null) gone.add(best);
  }
  state._odds = { k, to, cum, order };
  return state._odds;
}

// Chance player i is still on the board at pick `to`, counting the picks from `from` (pick indices).
export function survival(state, i, from, to) {
  const o = odds(state);
  const a = o.cum.get(i);
  if (!a) return 1;
  const f = Math.max(0, Math.min(o.to, from) - o.k), t = Math.max(0, Math.min(o.to, to) - o.k);
  return t <= f ? 1 : Math.exp(a[t] - a[f]);
}

// What a team expects to get with pick j, in its own chart units: its top player if he lasts, else the next,
// and so on. `from` is the first pick that could take its players (state.next, or later when a pick before is
// already spoken for); `skip` is a player it can't have (another team traded up for him).
export function expectAt(state, team, j, { from = state.next, skip = null, depth = 12 } = {}) {
  const snap = snapshot(state);
  const list = [];
  for (const x of snap.util[team]) { if (x.i !== skip) list.push(x); if (list.length > depth) break; }
  const places = listPlaces(list);
  let mass = 1, ev = 0, n = 0, top = null;
  for (const x of list) {
    if (n >= depth) break;
    const pv = state.tuning.valuation === 'board' ? playerValue(state, team, x.i) : listValue(state, team, places[n]);
    if (top == null) top = { i: x.i, u: x.u, pv };
    const s = j <= from ? 1 : survival(state, x.i, from, j);
    ev += mass * s * pv;
    mass *= 1 - s;
    n++;
    if (mass < 0.01) break;
  }
  const rest = listValue(state, team, (places[n] ?? n) + 1);
  return { ev: ev + mass * rest, top };
}

// How far down a team's list each player sits, in "places": the gaps between its choices measured against the
// typical gap on its own list. Players it grades about the same are one place apart; a player it grades far
// above the next one stands several places clear (a tier of his own).
export function listPlaces(list) {
  const gaps = [];
  for (let n = 1; n < list.length; n++) gaps.push(Math.max(0, list[n - 1].u - list[n].u));
  const typical = gaps.length ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] || 1e-6 : 1;
  const places = [0];
  for (let n = 1; n < list.length; n++) places.push(places[n - 1] + Math.min(8, gaps[n - 1] / typical));
  return places;
}

// The team moving down: what it needs in extras to give pick k and pick at j instead, when the buyer takes
// `target` at k. Chart gap times its margin, plus a share of how much more it loses in players than the chart says.
export function sellerAsk(state, s, k, j, target, extraMargin = 0) {
  const c = chartOf(state, s);
  const gap = c.chart(state.picks[k].overall) - c.chart(state.picks[j].overall);
  const now = expectAt(state, s, k);
  const later = expectAt(state, s, j, { from: k + 1, skip: target });
  const loss = now.ev - later.ev;
  const m = state.tuning.margin + c.margin + extraMargin;
  // A player it loves costs extra; a deep tier (it loses less than the chart says) makes it take a little less.
  const ask = gap * (1 + m) + state.tuning.attachment * Math.max(0, loss - gap) - state.tuning.eager * Math.max(0, gap - loss);
  return { ask, gap, loss, top: now.top };
}

// How much a QB-needy team leans toward a QB, from the fitted need weights (0 = no lean, 1 = full).
export function qbWant(state, team) {
  state._qbw ??= {};
  if (team in state._qbw) return state._qbw[team];
  const nd = state.T[team]?.need?.QB;
  const w = state.C.w, I = state.C.idx;
  let u = 0;
  if (nd) {
    const F = ['pay', 'ped', 'snap', 'snap_prev', 'old', 'exp_now', 'exp_next', 'depth', 'open', 'invest', 'prod'];
    F.forEach((f, n) => { u += (w[I[`need|${f}|0`]] ?? 0) * nd[n]; if (I[`qb|${f}|early`] != null) u += w[I[`qb|${f}|early`]] * nd[n]; });
  }
  return (state._qbw[team] = Math.max(0, Math.min(1, u)));
}

// The team moving up from j to k: the most it would pay in extras (its own chart units), and its target.
export function buyerMax(state, b, k, j) {
  const c = chartOf(state, b);
  const tr = state.tuning;
  const now = expectAt(state, b, k);
  if (!now.top) return null;
  const t = now.top;
  // Quick out: if its top player will very likely still be there, there's nothing to gain.
  const s1 = survival(state, t.i, k, j);
  const gap = c.chart(state.picks[k].overall) - c.chart(state.picks[j].overall);
  const isQB = state.P[t.i].group === 'QB';
  const lam = (isQB ? 1 + (tr.qbUrgency - 1) * qbWant(state, b) : 1) * (tr.overconfidence?.[state.picks[k].round - 1] ?? 1);
  if (lam * (1 - s1) * t.pv < gap * 0.9) return { max: 0, target: t.i, gain: 0, gap };
  const later = expectAt(state, b, j);
  const gain = Math.max(0, now.ev - later.ev);
  const cap = gap * tr.maxOverpay * (isQB ? lam : 1);
  return { max: Math.min(lam * gain, cap), target: t.i, gain, gap, isQB };
}

// The picks a team still holds, from pick index `from` on.
export function picksOf(state, team, from = state.next) {
  const out = [];
  for (let k = from; k < state.picks.length; k++) {
    const p = state.picks[k];
    if (p.owner === team && p.player == null) out.push(k);
  }
  return out;
}

export function nextPick(state, team, after, skip = []) {
  for (let k = after + 1; k < state.picks.length; k++) {
    const p = state.picks[k];
    if (p.owner === team && p.player == null && !skip.includes(k)) return k;
  }
  return null;
}

// Finds extras from `payer` worth at least `need` to `payee` and at most `cap` to the payer, as close to `target`
// (default: `need`) as it can, with up to `max` assets. Teams deal in this year's picks first; 2028 picks come in only when this
// year's picks can't make it work (or when the payer's GM spends future picks freely), and the team moving down
// hands back a later pick only when that is what makes it fit. Each extra pick also counts against a package
// (assetFuss, a share of the price), so simple deals win.
export function findPackage(state, opts) {
  const { payer, payerAssets, payeeAssets = [] } = opts;
  const freeFuture = (state.teams.teams[payer]?.front_office?.profile?.future_tilt ?? 0) < -0.1;
  const cur = payerAssets.filter(a => !isFuture(a));
  const tiers = freeFuture ? [[payerAssets, []], [payerAssets, payeeAssets]]
    : [[cur, []], [cur, payeeAssets], [payerAssets, []], [payerAssets, payeeAssets]];
  for (const [A, B] of tiers) {
    const r = searchPackage(state, { ...opts, payerAssets: A, payeeAssets: B });
    if (r) return r;
  }
  return null;
}

function searchPackage(state, { payer, payee, need, cap = Infinity, target = null, payerAssets, payeeAssets = [], max = 3, backOnly = false }) {
  const tr = state.tuning;
  const A = payerAssets.map(a => ({ a, toPayee: assetValue(state, payee, a), toPayer: assetValue(state, payer, a) }));
  const B = [null, ...payeeAssets.map(a => ({ a, toPayee: assetValue(state, payee, a), toPayer: assetValue(state, payer, a) }))];
  const scale = Math.max(1, Math.abs(need));
  const slack = (tr.slack ?? 0) * scale;
  let best = null;
  const consider = set => {
    let vPayee = 0, vPayer = 0;
    for (const x of set) { vPayee += x.toPayee; vPayer += x.toPayer; }
    for (const g of B) {
      if (g && set.length === 0 && !backOnly) continue;
      const ee = vPayee - (g?.toPayee ?? 0), er = vPayer - (g?.toPayer ?? 0);
      // To get a deal done in minutes, either side gives a little (slack, a share of the price; tuned).
      if (ee < need - slack || er > cap + slack) continue;
      const score = Math.abs(ee - (target ?? need)) + scale * tr.assetFuss * (set.length + (g ? 1 : 0));
      if (!best || score < best.score) best = { score, extras: set.map(x => x.a), back: g ? [g.a] : [], toPayee: ee, toPayer: er };
    }
  };
  consider([]);
  for (let x = 0; x < A.length; x++) {
    consider([A[x]]);
    if (max < 2) continue;
    for (let y = x + 1; y < A.length; y++) {
      consider([A[x], A[y]]);
      if (max < 3) continue;
      for (let z = y + 1; z < A.length; z++) consider([A[x], A[y], A[z]]);
    }
  }
  return best;
}

// The assets a team can add to a deal: its nearest later picks this year, its last few (small change) and its
// 2028 picks.
export function spareAssets(state, team, after, { current = 4, late = 3, future = 6, skip = [] } = {}) {
  const all = picksOf(state, team, after + 1).filter(k => !skip.includes(k));
  const cur = [...new Set([...all.slice(0, current), ...all.slice(-late)])];
  const fut = (state.future[team] ?? []).slice().sort((x, y) => x.round - y.round).slice(0, future);
  return [...cur, ...fut];
}

// What the team moving down can hand back to even out a deal: a few of its later picks this year.
export function giveBacks(state, team, after) {
  const all = picksOf(state, team, after + 1);
  return [...new Set([...all.slice(0, 3), ...all.slice(-3)])];
}

export function label(state, a) {
  if (isCurrent(a)) return `pick ${state.picks[a].overall}`;
  if (isPlayer(a)) return `${a.group} ${a.player}`;
  const ord = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][a.round] ?? `${a.round}th`;
  return `${a.season ?? state.year + 1} ${ord}${a.original && a.original !== a.owner ? ` (${a.original})` : ''}`;
}
