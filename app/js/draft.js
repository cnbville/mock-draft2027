// The mock draft engine. Pure logic, no page code, so it runs in the browser, in Node tests and in the backtest.
//
// How an AI team picks: app/js/ai/model.js scores every available player for that team (talent, position by
// round, needs, scheme fit, GM tastes, testing, flags, runs), with weights fitted on real drafts
// (app/data/ai_model.json). Each simulated draft adds three layers of noise: the league's view of a player, each
// team's own view, and the call on the day.
// How trades work: app/js/ai/market.js. Every team values picks on a chart fitted to real draft-day trades
// (with its own GM's slant), and values the player it would take at a pick through its own board. A trade
// happens when the team moving up gains more than the team moving down asks, both ways and in every round.
// Your offers get the same judgement, plus counteroffers, plain reasons, memory and the clock (app/js/ai/offers.js).

import { GROUPS, compile, features, playerFacts, teamFacts, dot, bucketOf, slotOf, SLOT_ROUND } from './ai/model.js';
import { makeCharts, futureValue } from './ai/market.js';
import { tryMarket } from './ai/trades.js';
import { evaluateOffer as evalOffer, executeTrade, makeCalls, callStillGood, CLOCK } from './ai/offers.js';

// Numbers that are not fitted to data are here, labelled estimated. Fitted ones come from ai_model.json.
export const TUNING = {
  candidates: 150,          // players each pick looks at (the best by board rank, plus the top 4 at each position)
  perGroup: 4,
  // Noise shares (of the logit's day-to-day spread): the league's view of a player, each team's own view, and
  // the day itself. Fitted in the backtest to real drafts' falls and ranges (ai_model.json overrides these).
  // scale: the whole spread against the fitted logit's. Below 1, the AI is surer than a single-pick fit says: the fit's
  // spread also holds what the model can't see (visits, medicals), which real teams know, so sims spread too wide.
  noise: { shared: 0.3, team: 0.3, tail: 4, varianceScale: 0.15, scale: 1 },
  trades: {
    window: [40, 40, 32, 32, 32, 32, 32],      // how far behind a buyer can be, by round (slots; estimated)
    // Chance a workable deal gets done when a team calls, by round (most don't: minutes, few calls, cold feet).
    // Tuned with overconfidence so trade counts match real draft weekends 2018-2023.
    dealRate: [0.27, 0.21, 0.145, 0.13, 0.13, 0.13, 0.13],
    maxPerRound: [12, 12, 12, 10, 10, 10, 10],  // a safety cap only
    attachment: 0.6,        // how much a team on the clock charges for loving its player (share of the gap)
    // How much a buyer pays over the gain it expects, by round. Teams overrate the right to choose (Massey and
    // Thaler, "The Loser's Curse", 2013), and on day 3 the model's own read of the risk is too calm, so these are
    // fitted: with dealRate they make trade counts, distances and prices match real draft weekends 2018-2023.
    overconfidence: [1.0, 2.2, 3.2, 4, 4, 4, 4],
    trust: 0.5,             // share of its own read a team puts on the line when it values players on its board
    eager: 0.15,            // how much below chart a team with a deep tier takes to move back (share of the gap)
    split: 1,               // they settle anywhere between the seller's ask and the buyer's most
    qbUrgency: 1.35,        // a QB-needy buyer pays more for a QB
    margin: 0.02,           // the team moving down wants a little more than chart value
    maxOverpay: 1.35,       // the most a buyer pays over the chart gap (more for a QB it needs; estimated)
    assetFuss: 0.1,         // simple deals win: each extra pick counts against a package (share of the price; tuned)
    slack: 0.3,             // either side gives a little to get a deal done in minutes (share of the price; tuned)
    vetRate: [0.04, 0.04, 0.025, 0.015, 0, 0, 0],  // chance per pick of a veteran-for-pick look, by round (estimated)
    callRate: [0.6, 0.5, 0.45, 0.35, 0.35, 0.3, 0.3], // chance an interested AI team calls you, by round (estimated)
  },
};

export function rng(seed) {
  // mulberry32: small seeded random generator, so a seed gives the same draft every time.
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.normal = () => {
    const u = Math.max(r(), 1e-12), v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  r.gumbel = () => -Math.log(-Math.log(Math.max(r(), 1e-12)));
  r.t = nu => {
    // Student t: fat tails, so a few players a year fall (or rise) far more than the rest.
    let chi = 0;
    for (let k = 0; k < nu; k++) { const z = r.normal(); chi += z * z; }
    return r.normal() / Math.sqrt(chi / nu) * Math.sqrt((nu - 2) / nu);
  };
  return r;
}

export function makeValue(chart) {
  const v = new Map(chart.points.map(p => [p.pick, p.value]));
  return pick => v.get(Math.max(1, Math.min(262, Math.round(pick)))) ?? 1;
}

// Build the 257 picks: 224 owned picks plus 33 placeholder compensatory picks in rounds 3-7.
export function buildPicks(teams) {
  // A full real pick list (past drafts, or this year's once compensatory picks are out) is used as it is.
  if (teams.picks.length >= 250 && teams.picks.every(p => p.overall != null)) {
    return teams.picks.slice().sort((a, b) => a.overall - b.overall)
      .map(p => ({ round: p.round, owner: p.owner, original: p.original ?? p.owner, comp: !!p.comp, overall: p.overall }));
  }
  const order = teams.order;
  const byRound = {};
  for (const p of teams.picks) (byRound[p.round] ??= []).push(p);
  const comp = { 3: 7, 4: 7, 5: 7, 6: 6, 7: 6 };  // estimated spread of 33 compensatory picks
  const out = [];
  for (let r = 1; r <= 7; r++) {
    const list = byRound[r].slice().sort((a, b) => a.slot - b.slot);
    for (const p of list) out.push({ round: r, owner: p.owner, original: p.original, comp: false });
    const n = comp[r] ?? 0;
    // Placeholder: compensatory picks go to the better teams, in reverse order (real ones come out in March).
    for (let i = 0; i < n; i++) {
      const t = order[order.length - 1 - ((i * 3 + r) % order.length)];
      out.push({ round: r, owner: t, original: t, comp: true });
    }
  }
  out.forEach((p, i) => { p.overall = i + 1; });
  return out;
}

// A small default so the engine runs before a model is fitted (tests, first build). Fitted values replace it.
export const DEFAULT_MODEL = {
  weights: { 'talent|0': 1.7, 'talent|1': 1.05, 'talent|2': 0.9, 'offboard|1': -1, 'offboard|2': -2, 'taken|0': -0.6,
    'taken|1': -0.6, 'taken|2': -0.8, 'scarce|0': -0.5, 'scarce|1': -0.4, 'scarce|2': -0.2, 'need|exp_now|0': 0.15,
    'need|snap|0': -0.2, 'need|ped|0': -0.15, 'qb|prod|early': -0.3, 'pos|K|0': -6, 'pos|P|0': -6, 'pos|LS|0': -8,
    'pos|K|1': -3, 'pos|P|1': -3, 'pos|LS|1': -5, 'pos|LS|2': -1.5, 'ath': 0.3 },
  noise: TUNING.noise,
};

// noise: false gives the AI's single most likely draft (no random views, no day noise, no trades).
export function newDraft({ prospects, teams, chart, model = DEFAULT_MODEL, market = null, seed = 1, allDeclare = false,
  trades = true, userTeams = [], combineDone = false, year = null, noise = true }) {
  const r = rng(seed);
  const value = makeValue(chart);
  const teamIds = Object.keys(teams.teams);
  const declared = prospects.map(p => allDeclare || r() < p.p_declare);
  const C = compile(model);
  const P = prospects.map(p => playerFacts(p, { combineDone }));
  const T = Object.fromEntries(teamIds.map(t => [t, teamFacts(teams.teams[t], model)]));
  const nz = { ...TUNING.noise, ...(model.noise ?? {}) };
  const tr = { ...TUNING.trades, ...(model.trades ?? {}) };
  // Noise layers, each a share of the logit's spread (a standard Gumbel has variance pi^2/6).
  const G2 = Math.PI ** 2 / 6;
  const on = noise ? 1 : 0;
  const k = nz.scale ?? 1;
  const sdS = on * k * Math.sqrt(nz.shared * G2), sdT = on * k * Math.sqrt(nz.team * G2);
  const scE = k * Math.sqrt(Math.max(0.05, 1 - nz.shared - nz.team));
  const shared = new Float64Array(P.length);
  for (let i = 0; i < P.length; i++) shared[i] = sdS * (1 + nz.varianceScale * P[i].variance) * r.t(nz.tail);
  const own = {};
  for (const t of teamIds) {
    const a = new Float64Array(P.length);
    for (let i = 0; i < P.length; i++) a[i] = sdT * (1 + nz.varianceScale * P[i].variance) * r.normal();
    own[t] = a;
  }
  const charts = makeCharts(market, teams, value);
  const state = {
    r, value, prospects, teams, teamIds, declared, userTeams: new Set(userTeams),
    picks: buildPicks(teams), next: 0, taken: new Map(), C, P, T, shared, own, scE, dayNoise: on, tuning: tr, charts,
    utilityFn: utility, baseFn: baseUtility, base: {},
    dynW: [0, 1, 2].map(b => ({ taken: C.w[C.idx[`taken|${b}`]], run: C.w[C.idx[`run|${b}`]], scarce: C.w[C.idx[`scarce|${b}`]] })),
    teamTaken: Object.fromEntries(teamIds.map(t => [t, {}])), recent: [], tradeLog: [], tradesThisRound: 0, round: 1,
    future: Object.fromEntries(teamIds.map(t => [t, (teams.teams[t].future_picks ?? []).map(f => ({ ...f, owner: t }))])),
    year: year ?? teams.draft_year ?? 2027, trades: trades && noise, firm: {}, clock: { pick: -1, used: 0 }, calls: [], callLog: [],
    ordered: prospects.map((_, i) => i).sort((a, b) => P[b].talent - P[a].talent || prospects[b].board_value - prospects[a].board_value),
  };
  state.avgTradeRate = teamIds.reduce((a, t) => a + (teams.teams[t].habits?.draft_trades_per_year ?? 1), 0) / teamIds.length || 1;
  return state;
}

export function available(state) {
  return state.ordered.filter(i => state.declared[i] && !state.taken.has(i));
}

// The players a pick considers, with each one's rank within his group among the players still available.
export function candidates(state) {
  const out = [];
  const seen = {};
  let n = 0;
  for (const i of state.ordered) {
    if (!state.declared[i] || state.taken.has(i)) continue;
    const g = state.P[i].group;
    seen[g] = (seen[g] ?? 0) + 1;
    if (n < TUNING.candidates || seen[g] <= TUNING.perGroup) out.push({ i, gr: seen[g] });
    n++;
  }
  return out;
}

const fbuf = [];
// A team's utility for player i at the current pick, without the day's noise. The part that doesn't change during
// the draft (everything but runs, scarcity and what the team already took) is cached per team, player and round
// slot (model.js slotOf), so a whole draft stays fast.
export function baseUtility(state, team, i, s) {
  let base = state.base[team];
  if (!base) { base = state.base[team] = new Float64Array(state.P.length * 4).fill(NaN); }
  let u = base[i * 4 + s];
  if (Number.isNaN(u)) {
    const f = features(state.C, state.T[team], state.P[i], { round: SLOT_ROUND[s], taken: 0, run: 0, groupRank: 1 }, fbuf);
    u = base[i * 4 + s] = dot(state.C.w, f) + state.shared[i] + state.own[team][i];
  }
  return u;
}

export function utility(state, team, i, round, groupRank, extraTaken = null) {
  const b = bucketOf(round);
  const P = state.P[i];
  const u = baseUtility(state, team, i, slotOf(round));
  const tk = (extraTaken ?? state.teamTaken[team])[P.group] ?? 0;
  let run = 0;
  for (const g of state.recent) if (g === P.group) run++;
  const W = state.dynW[b];
  return u + W.taken * tk + W.run * Math.min(4, run) + W.scarce * Math.log(groupRank);
}

// Ranked choices for a team at this pick (no day noise): [{ i, s }], s = utility.
export function choices(state, team, n = 10) {
  const pick = state.picks[state.next];
  if (!pick) return [];
  return candidates(state).map(({ i, gr }) => ({ i, s: utility(state, team, i, pick.round, gr) }))
    .sort((a, b) => b.s - a.s).slice(0, n);
}

function aiChoose(state, team) {
  const pick = state.picks[state.next];
  // A team that just traded up takes the player it moved up for.
  if (pick.target != null && !state.taken.has(pick.target) && state.declared[pick.target]) return pick.target;
  let best = null, bs = -Infinity;
  for (const { i, gr } of candidates(state)) {
    const s = utility(state, team, i, pick.round, gr) + (state.dayNoise ? state.scE * state.r.gumbel() : 0);
    if (s > bs) { bs = s; best = i; }
  }
  return best;
}

export function makePick(state, i, how = 'ai') {
  const pick = state.picks[state.next];
  const p = state.P[i];
  pick.player = i;
  pick.how = how;
  state.taken.set(i, state.next);
  const tk = state.teamTaken[pick.owner];
  tk[p.group] = (tk[p.group] ?? 0) + 1;
  state.recent.push(p.group);
  if (state.recent.length > 8) state.recent.shift();
  state.next++;
  state.calls = [];
  const nr = state.picks[state.next]?.round;
  if (nr && nr !== state.round) { state.round = nr; state.tradesThisRound = 0; }
}

// Run AI picks until a user team is on the clock, an AI team calls a user team, or the draft ends.
export function advance(state, { stopAtUser = true, until = Infinity } = {}) {
  while (state.next < state.picks.length && state.next < until) {
    const k = state.next;
    if (state.trades && state.marketChecked !== k) {
      state.marketChecked = k;
      tryMarket(state);
      if (stopAtUser && state.userTeams.size) {
        const calls = makeCalls(state);
        if (calls.length) { state.calls = calls; return 'call'; }
      }
    }
    const team = state.picks[state.next].owner;
    if (stopAtUser && state.userTeams.has(team)) return 'user';
    const i = aiChoose(state, team);
    if (i == null) break;
    makePick(state, i);
  }
  return state.next >= state.picks.length ? 'done' : 'paused';
}

// Your offer: give and get are lists of assets, each a current pick index (number) or a future pick
// { season, round, original, owner }. Returns { ok, decision, reason, counter } and makes the trade if accepted.
export function proposeTrade(state, user, give, get) {
  const res = evalOffer(state, user, give, get);
  if (res.decision === 'accept') {
    executeTrade(state, user, res.partner, give, get, 'your trade', { user: true });
    return { ...res, ok: true };
  }
  return { ...res, ok: false };
}

export function evaluateOffer(state, user, give, get) {
  return evalOffer(state, user, give, get);
}

// Accept an incoming call: the AI's offer as it stands.
export function acceptCall(state, call) {
  state.calls = state.calls.filter(c => c !== call);
  if (!callStillGood(state, call)) { state.callLog.push({ ...call, answer: 'expired' }); return false; }
  executeTrade(state, call.user, call.team, call.userGives, call.userGets, call.note, { user: true });
  if (call.kind === 'buy' && call.target != null) state.picks[call.at].target = call.target;
  state.callLog.push({ ...call, answer: 'accepted' });
  return true;
}

export function declineCall(state, call) {
  state.callLog.push({ ...call, answer: 'declined' });
  state.calls = state.calls.filter(c => c !== call);
}

// Undrafted free agents: each team signs a few of the best left, by its own board and need.
export function udfaRush(state, perTeam = 3, top = 60) {
  const left = available(state).slice(0, top);
  const order = state.teamIds.slice().sort(() => state.r() - 0.5);
  const signed = [];
  const taken = new Set();
  for (let round = 0; round < perTeam; round++) {
    for (const t of order) {
      let best = null, bs = -Infinity;
      for (const i of left) {
        if (taken.has(i)) continue;
        const s = utility(state, t, i, 7, 1);
        if (s > bs) { bs = s; best = i; }
      }
      if (best != null) { taken.add(best); signed.push({ team: t, i: best }); }
    }
  }
  return signed;
}

// Rank of each declared player in this draft's class (board ranks include players who stayed in school).
export function classRanks(state) {
  const m = new Map();
  state.ordered.filter(i => state.declared[i]).forEach((i, k) => m.set(i, k + 1));
  return m;
}

// Class grade: value of players taken against the value of the picks spent, ranked against the other classes.
export function classGrades(state) {
  const rank = classRanks(state);
  const out = {};
  for (const t of state.teamIds) out[t] = { picks: [], surplus: 0, spent: 0 };
  for (const p of state.picks) {
    if (p.player == null) continue;
    const got = state.value(rank.get(p.player)), cost = state.value(p.overall);
    const o = out[p.owner];
    o.picks.push(p);
    o.surplus += got - cost;
    o.spent += cost;
  }
  const scores = state.teamIds.map(t => out[t].spent ? out[t].surplus / out[t].spent : 0).sort((a, b) => a - b);
  const letter = x => {
    const q = scores.filter(s => s <= x).length / scores.length;
    return q > 0.9 ? 'A' : q > 0.75 ? 'B+' : q > 0.55 ? 'B' : q > 0.35 ? 'C+' : q > 0.15 ? 'C' : 'D';
  };
  for (const t of state.teamIds) {
    const o = out[t];
    o.score = o.spent ? o.surplus / o.spent : 0;
    o.grade = letter(o.score);
  }
  return out;
}

// Why a team took a player: the parts of its score that stood out, in plain words.
export function explainPick(state, k) {
  const pick = state.picks[k];
  if (pick?.player == null) return [];
  const i = pick.player, team = pick.owner, P = state.P[i], T = state.T[team];
  const out = [];
  const nd = T.need[P.group];
  if (nd && (nd[5] > 0.8 || nd[2] < -0.8 || nd[8] > 0.8)) out.push(`need at ${P.group}`);
  if (state.shared[i] + state.own[team][i] > 0.8) out.push('graded him above the public board');
  if (P.athletic > 1) out.push('elite testing');
  if (P.sb) out.push('Senior Bowl');
  if ((T.gmPos[P.group] ?? 0) > 0.1) out.push(`this GM drafts ${P.group}s early`);
  if (pick.target === i) out.push('traded up for him');
  return out;
}

// Many drafts: landing ranges per prospect and likely picks per team.
export function simulate({ prospects, teams, chart, model, market, n = 200, seed = 7, allDeclare = false, trades = true, onProgress }) {
  const res = prospects.map(() => ({ picks: [], teams: {} }));
  const firstPick = {};
  let tradeCount = 0;
  for (let s = 0; s < n; s++) {
    const st = newDraft({ prospects, teams, chart, model, market, seed: seed + s * 7919, allDeclare, trades });
    advance(st, { stopAtUser: false });
    tradeCount += st.tradeLog.filter(t => t.round === 1).length;
    const seen = new Set();
    for (const p of st.picks) {
      if (p.player == null) continue;
      res[p.player].picks.push(p.overall);
      res[p.player].teams[p.owner] = (res[p.player].teams[p.owner] ?? 0) + 1;
      if (!seen.has(p.owner)) {
        seen.add(p.owner);
        const f = (firstPick[p.owner] ??= {});
        f[p.player] = (f[p.player] ?? 0) + 1;
      }
    }
    if (onProgress) onProgress(s + 1, n);
  }
  const summary = res.map((x, i) => {
    const sorted = x.picks.slice().sort((a, b) => a - b);
    const q = f => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))] : null;
    return {
      i, drafted: sorted.length / n, mean: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null,
      p10: q(0.1), p50: q(0.5), p90: q(0.9), r1: sorted.filter(v => v <= 32).length / n,
      teams: Object.entries(x.teams).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, c]) => [t, c / n]),
    };
  });
  return { n, summary, firstPick, round1TradesPerDraft: tradeCount / n };
}

export { GROUPS, bucketOf, futureValue, CLOCK };
