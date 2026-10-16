// Your trades with the AI: how a GM answers your offer, counteroffers, plain reasons, memory of lowballs, your
// clock, and the calls AI teams make to you. Pure logic. It uses the same values as the AI-to-AI market
// (market.js), so the AI never judges your offer by a different rule than its own trades.

import { assetValue, sellerAsk, buyerMax, nextPick, picksOf, spareAssets, giveBacks, findPackage, pickOfValue, label,
  isCurrent, isFuture } from './market.js';
import { executeTrade, propensity } from './trades.js';

export { executeTrade };

// Minutes on the clock by round (NFL rule: 10 in round 1, 7 in round 2, 5 in rounds 3-6, 4 in round 7).
export const CLOCK = [10, 7, 5, 5, 5, 5, 4];
const MINUTES_PER_CALL = 1;   // estimated: one offer and answer takes about a minute

const ownerOf = (state, x) => (isCurrent(x) ? state.picks[x].owner : x.owner);
const same = (a, b) => (isCurrent(a) || isCurrent(b) ? a === b
  : a.round === b.round && a.original === b.original && (a.season ?? 0) === (b.season ?? 0));
const has = (list, x) => list.some(y => same(x, y));

function firmness(state, team, round) {
  const f = (state.firm[team] ??= { round, lowballs: 0 });
  if (f.round !== round) { f.round = round; f.lowballs = 0; }
  return f;
}

// A team's judgement of a deal: it receives `receive` and gives `give`. Returns { net, kind, ... }, net in its
// own chart units (>= 0 means yes). `pressure` (0-1) is how far your clock has run when the team is buying your
// pick on the clock: buyers wait you out.
export function judge(state, A, receive, give, { pressure = 0, discount = 0 } = {}) {
  const k = state.next;
  const round = state.picks[k].round;
  const tr = state.tuning;
  const W = tr.window[round - 1];
  const near = x => x != null && x - k <= W;
  const f = state.firm[A];
  const extraMargin = f && f.round === round ? Math.min(0.16, 0.04 * f.lowballs) : 0;
  const m = tr.margin + (state.charts.per[A]?.margin ?? 0) + extraMargin;
  const v = x => assetValue(state, A, x);
  // discount: the backtest's lowball check (what it receives, made 15% smaller).
  const vin = (1 - discount) * receive.reduce((s, x) => s + v(x), 0), vout = give.reduce((s, x) => s + v(x), 0);
  const rc = receive.filter(isCurrent).sort((a, b) => a - b), gc = give.filter(isCurrent).sort((a, b) => a - b);
  const r0 = rc[0] ?? null, g0 = gc[0] ?? null;
  // Moving down: it gives its soonest pick, and its next pick becomes a later one.
  if (g0 != null && near(g0) && (r0 == null || g0 < r0)) {
    const own = nextPick(state, A, g0, give);
    const j = [r0, own].filter(x => x != null).sort((a, b) => a - b)[0] ?? null;
    if (j == null) return { net: vin - vout * (1 + m), kind: 'chart' };
    // On the clock, it assumes you're after its top player.
    const top = g0 === k ? state._snap?.util?.[A]?.[0]?.i ?? null : null;
    const sa = sellerAsk(state, A, g0, j, top, extraMargin);
    // You called, so it wasn't shopping the pick: no deep-tier discount, and its call premium (TUNING.trades).
    const extra = sa.ask - sa.gap * (1 + m) + tr.eager * Math.max(0, sa.gap - sa.loss) + (tr.callPremium?.[round - 1] ?? 0) * vout;
    return { net: vin - vout * (1 + m) - extra, kind: 'down', loss: sa.loss, gap: sa.gap, extra, at: g0, j };
  }
  // Moving up: it gets a pick before its own next one.
  if (r0 != null && near(r0) && (g0 == null || r0 < g0)) {
    const own = picksOf(state, A)[0] ?? null;
    if (own != null && own > r0 && has(give, own)) {
      const bm = buyerMax(state, A, r0, own);
      // A fair price for the right to pick first: a team with a player it likes at risk pays about its chart gap.
      const fair = bm ? (bm.gap + (tr.fairBuy?.[round - 1] ?? 0) * v(r0)) * Math.min(1, (bm.risk ?? 0) / (tr.fairRisk ?? 1)) : 0;
      const max = Math.max(bm?.max ?? 0, fair) * (1 - 0.25 * pressure);
      const paid = vout - v(own), back = vin - v(r0);
      return { net: max - paid + back, kind: 'up', gain: bm?.gain ?? 0, max, at: r0, j: own, isQB: bm?.isQB };
    }
  }
  // Otherwise (picks far off, an extra pick, or only 2028 picks): the chart decides.
  return { net: vin - vout * (1 + m), kind: 'chart' };
}

function check(state, user, give, get) {
  if (!state.userTeams.has(user)) return 'Pick one of your teams.';
  if (!give.length || !get.length) return 'Put something on both sides.';
  const used = x => isCurrent(x) && state.picks[x].player != null;
  if (give.some(x => ownerOf(state, x) !== user || used(x))) return 'You can only offer picks you still hold.';
  const partners = new Set(get.map(x => ownerOf(state, x)));
  if (partners.size !== 1) return 'A trade is with one team at a time.';
  const partner = [...partners][0];
  if (state.userTeams.has(partner)) return 'Both sides are your picks.';
  if (get.some(used)) return 'That pick has been used.';
  const future = x => (state.future[ownerOf(state, x)] ?? []).some(f => same(f, x));
  if ([...give, ...get].some(x => isFuture(x) && !future(x))) return 'That 2028 pick has moved.';
  return null;
}

const marketValue = (state, list) => list.reduce((s, x) => s + assetValue(state, '_market', x), 0);

// Your offer: you give `give` and get `get` (current pick indices or 2028 picks { round, original, owner }).
// Returns { decision: accept | counter | reject, reason, counter?, partner }. Nothing changes hands here.
export function evaluateOffer(state, user, give, get) {
  const bad = check(state, user, give, get);
  if (bad) return { decision: 'reject', reason: bad, partner: null };
  const partner = ownerOf(state, get[0]);
  const k = state.next, round = state.picks[k].round;
  const onClock = state.picks[k].owner === user;
  let pressure = 0;
  if (onClock) {
    if (state.clock.pick !== k) state.clock = { pick: k, used: 0 };
    const limit = CLOCK[round - 1];
    if (state.clock.used >= limit) return { decision: 'reject', reason: 'Your time is up. Make your pick.', partner };
    state.clock.used += MINUTES_PER_CALL;
    pressure = Math.min(1, state.clock.used / limit);
  }
  const f = firmness(state, partner, round);
  if (f.lowballs >= 3) return { decision: 'reject', reason: `${partner} has stopped taking your calls this round.`, partner };
  const j = judge(state, partner, give, get, { pressure });
  const size = Math.max(marketValue(state, give), marketValue(state, get), 1);
  if (j.net >= 0) return { decision: 'accept', reason: acceptReason(state, j, size), partner, judge: j };
  if (j.net < -0.15 * size) {
    f.lowballs++;
    if (f.lowballs >= 3) return { decision: 'reject', reason: `That's three lowballs. ${partner} is done talking this round.`, partner, judge: j };
  }
  const nextPressure = onClock ? Math.min(1, (state.clock.used + MINUTES_PER_CALL) / CLOCK[round - 1]) : 0;
  const c = findCounter(state, user, partner, give, get, nextPressure, j);
  if (c) return { decision: 'counter', reason: c.reason, counter: { give: c.give, get: c.get }, partner, judge: j };
  return { decision: 'reject', reason: rejectReason(state, partner, j, give), partner, judge: j };
}

function acceptReason(state, j, size) {
  if (j.kind === 'down' && j.extra > 0) return `Done. We liked our player at ${state.picks[j.at].overall}, but this is enough.`;
  if (j.kind === 'down' && j.loss < j.gap) return 'Done. Our board is deep here, so moving back suits us.';
  if (j.kind === 'up') return j.isQB ? 'Done. We wanted to get ahead of the others for a quarterback.' : 'Done. We wanted to get ahead of the others for our guy.';
  if (j.net > 0.2 * size) return 'Done, gladly.';
  return 'Done.';
}

function rejectReason(state, partner, j, give) {
  if (j.kind === 'down' && j.extra > 0.25 * j.gap) return `We like the player we'd take at ${state.picks[j.at].overall} too much to move back that far.`;
  if (j.kind === 'up' && j.max <= 0) return `We don't need to move up. We expect our player to be there at ${state.picks[j.j].overall}.`;
  const short = pickOfValue(state, -j.net);
  if (give.some(isFuture)) return `Not enough. We value 2028 picks lower than that. Short by about pick ${short}'s value.`;
  return `Not enough. Short by about pick ${short}'s value on our chart.`;
}

// The smallest change that would make it work: add one of your picks (or two), let them keep one of theirs, or
// (when they move back) a nearer pick of yours.
function findCounter(state, user, partner, give, get, pressure, j0) {
  const ok = (g, t) => judge(state, partner, g, t, { pressure }).net >= 0;
  const mv = x => assetValue(state, '_market', x);
  const options = [];
  const extras = spareAssets(state, user, state.next - 1, { current: 10, future: 7 }).filter(x => !has(give, x));
  for (const x of extras) if (ok([...give, x], get)) options.push({ cost: mv(x), give: [...give, x], get, reason: `Add your ${label(state, x)} and it's done.` });
  if (get.length > 1) for (const y of get) {
    const g2 = get.filter(z => !same(z, y));
    if (g2.some(isCurrent) || g2.length) if (ok(give, g2)) options.push({ cost: mv(y), give, get: g2, reason: `We'd keep ${label(state, y)}. Then it's done.` });
  }
  if (j0.kind === 'down') {
    const r0 = give.filter(isCurrent).sort((a, b) => a - b)[0];
    const nearer = picksOf(state, user).filter(x => x > j0.at && x < r0 && !has(give, x)).sort((a, b) => b - a);
    for (const x of nearer) {
      const g2 = give.map(z => (z === r0 ? x : z));
      if (ok(g2, get)) { options.push({ cost: mv(x) - mv(r0), give: g2, get, reason: `We'd move back, but not past ${state.picks[x].overall}.` }); break; }
    }
  }
  if (!options.length) {
    const top = extras.slice().sort((a, b) => mv(b) - mv(a)).slice(0, 8);
    for (let a = 0; a < top.length; a++) for (let b = a + 1; b < top.length; b++) {
      const g2 = [...give, top[a], top[b]];
      if (ok(g2, get)) options.push({ cost: mv(top[a]) + mv(top[b]), give: g2, get, reason: `Add your ${label(state, top[a])} and ${label(state, top[b])} and it's done.` });
    }
  }
  return options.sort((a, b) => a.cost - b.cost)[0] ?? null;
}

// Calls AI teams make to you. When your pick is on the clock, teams behind you that fear their player won't
// last call to move up. When an AI team is on the clock with a deep tier, it may call to move back to your pick.
export function makeCalls(state) {
  const k = state.next;
  state.calledAt ??= new Set();
  if (state.calledAt.has(k)) return [];
  state.calledAt.add(k);
  const pk = state.picks[k];
  if (!pk || pk.player != null) return [];
  const round = pk.round, tr = state.tuning, W = tr.window[round - 1];
  const rate = tr.callRate[round - 1];
  const calls = [];
  if (state.userTeams.has(pk.owner)) {
    const user = pk.owner;
    const firstPick = new Map();
    for (let m = k + 1; m < Math.min(state.picks.length, k + 1 + W); m++) {
      const o = state.picks[m].owner;
      if (!state.userTeams.has(o) && !firstPick.has(o) && state.picks[m].player == null) firstPick.set(o, m);
    }
    const cands = [];
    for (const [b, j] of firstPick) {
      const bm = buyerMax(state, b, k, j);
      const gap = assetValue(state, '_market', k) - assetValue(state, '_market', j);
      if (bm && bm.max >= gap * 0.97) cands.push({ b, j, bm, gap });
    }
    cands.sort((x, y) => y.bm.max / y.gap - x.bm.max / x.gap);
    for (const c of cands.slice(0, 3)) {
      if (state.r() >= rate * propensity(state, c.b, 'up')) continue;
      // Their opening offer: about the market price, never above their most.
      const need = Math.min(c.bm.max, c.gap * (1 + tr.margin));
      const pkg = findPackage(state, { payer: c.b, payee: '_market', need: need * 0.98, cap: c.bm.max,
        payerAssets: spareAssets(state, c.b, c.j), payeeAssets: giveBacks(state, user, c.j) });
      if (!pkg) continue;
      calls.push({ id: `${k}-${c.b}`, kind: 'buy', team: c.b, user, at: k, target: c.bm.target,
        userGives: [k, ...pkg.back], userGets: [c.j, ...pkg.extras],
        note: `${c.b} wants to move up to ${pk.overall}.` });
    }
  } else if (pk.target == null) {
    const s = pk.owner;
    for (const user of state.userTeams) {
      const j = nextPick(state, user, k);
      if (j == null || j - k > W) continue;
      const sa = sellerAsk(state, s, k, j, null);
      if (sa.loss >= sa.gap) continue;     // only a team whose tier is deep shops its pick
      if (state.r() >= rate * propensity(state, s, 'down')) continue;
      const pkg = findPackage(state, { payer: user, payee: s, need: sa.ask, payerAssets: spareAssets(state, user, j),
        payeeAssets: giveBacks(state, s, j) });
      if (!pkg) continue;
      calls.push({ id: `${k}-${s}`, kind: 'sell', team: s, user, at: k,
        userGives: [j, ...pkg.extras], userGets: [k, ...pkg.back],
        note: `${s} is open to moving back from ${pk.overall}.` });
    }
  }
  return calls;
}

// A call is still good if every pick in it is where it was.
export function callStillGood(state, call) {
  return !check(state, call.user, call.userGives, call.userGets);
}
