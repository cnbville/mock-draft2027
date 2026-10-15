// The mock draft engine. Pure logic, no page code, so it runs in the browser and in Node tests.
// Every tuning number is here, in TUNING, and is estimated unless it says otherwise.

export const TUNING = {
  // How much each position is worth on draft day against its board rank (estimated from how early
  // each position goes in real drafts; a QB premium needs a team that needs a QB).
  posValue: { QB: 1.18, EDGE: 1.08, OT: 1.06, CB: 1.03, WR: 1.0, DT: 1.0, TE: 0.95, IOL: 0.94, LB: 0.92,
    S: 0.92, RB: 0.9, K: 0.35, P: 0.35, LS: 0.2 },
  qbWithoutNeed: 0.92,     // QB value for a team whose QB need is low
  needWeight: [0.3, 0.35, 0.4, 0.45, 0.45, 0.5, 0.5],  // need weight by round
  needAfterPick: 0.35,     // need left at a group after drafting a player there
  boardNoise: 0.2,         // how much each team's board differs (log scale)
  gradeSpread: 1.6,        // teams' grades separate players more than the flat pick-value chart does
  pickNoise: 0.05,         // day-of randomness on each pick (log scale)
  reachChance: [0.04, 0.07, 0.1, 0.12, 0.14, 0.16, 0.18],  // chance a pick looks past the top choice
  candidates: 60,          // how many available players each pick considers
  runBonus: 1.04,          // a team that needs a position moves it up when a run starts
  tradeRounds: 3,          // AI trades happen in rounds 1-3
  tradeLookahead: 12,      // a team trading up looks at picks this many slots ahead of its own
  tradeUrgency: 0.2,       // how much better its target must be than what it expects at its own pick
  tradePremium: 1.05,      // the team trading up pays 5% over the chart
  // Chance per pick that a team with a strong reason moves up (for a team that trades as often as average).
  // Tuned so a mock has about 6 trades at first-round picks and 17 in rounds 1-3; real April trades
  // 2018-2025 averaged 6.1 and 20 (nflverse trades; computed, includes a few pre-draft April deals).
  tradeChance: 0.32,
  maxTradesPerRound: 7,
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
  return r;
}

export function makeValue(chart) {
  const v = new Map(chart.points.map(p => [p.pick, p.value]));
  return pick => v.get(Math.max(1, Math.min(262, Math.round(pick)))) ?? 1;
}

// Build the 257 picks: 224 owned picks plus 33 placeholder compensatory picks in rounds 3-7.
export function buildPicks(teams) {
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

function needMap(team) {
  const m = {};
  for (const [g, v] of Object.entries(team.needs)) m[g] = v.need;
  return m;
}

// Each team's own board: the shared board value with its own noise.
function teamBoards(prospects, teamIds, r) {
  const boards = {};
  for (const t of teamIds) {
    const b = new Float64Array(prospects.length);
    for (let i = 0; i < prospects.length; i++) {
      b[i] = 3000 * Math.pow(prospects[i].board_value / 3000, TUNING.gradeSpread) * Math.exp(TUNING.boardNoise * r.normal());
    }
    boards[t] = b;
  }
  return boards;
}

export function newDraft({ prospects, teams, chart, seed = 1, allDeclare = false, trades = true, userTeams = [] }) {
  const r = rng(seed);
  const value = makeValue(chart);
  const teamIds = Object.keys(teams.teams);
  const declared = prospects.map(p => allDeclare || r() < p.p_declare);
  const state = {
    r, value, prospects, teams, teamIds, declared, trades, userTeams: new Set(userTeams),
    picks: buildPicks(teams), next: 0, taken: new Map(), // prospect index -> pick index
    needs: Object.fromEntries(teamIds.map(t => [t, needMap(teams.teams[t])])),
    boards: teamBoards(prospects, teamIds, r), tradeLog: [], tradesThisRound: 0, round: 1,
    avgTradeRate: teamIds.reduce((a, t) => a + teams.teams[t].habits.draft_trades_per_year, 0) / teamIds.length || 1,
    ordered: prospects.map((_, i) => i).sort((a, b) => prospects[b].board_value - prospects[a].board_value),
  };
  return state;
}

export function available(state) {
  return state.ordered.filter(i => state.declared[i] && !state.taken.has(i));
}

function score(state, team, i, round, recentGroups) {
  const p = state.prospects[i];
  const t = state.teams.teams[team];
  const need = state.needs[team][p.group] ?? 0;
  let pv = TUNING.posValue[p.group] ?? 1;
  if (p.group === 'QB' && need < 0.5) pv = TUNING.qbWithoutNeed;
  const habit = t.habits.pos_mult[p.group] ?? 1;
  const nw = TUNING.needWeight[round - 1] ?? 0.5;
  let s = state.boards[team][i] * pv * habit * (1 + nw * need);
  if (need > 0.5 && recentGroups.filter(g => g === p.group).length >= 2) s *= TUNING.runBonus;
  return s;
}

function recent(state) {
  const out = [];
  for (let k = Math.max(0, state.next - 6); k < state.next; k++) {
    const i = state.picks[k].player;
    if (i != null) out.push(state.prospects[i].group);
  }
  return out;
}

// Ranked choices for a team at this pick.
export function choices(state, team, n = 10) {
  const pick = state.picks[state.next];
  const rg = recent(state);
  const avail = available(state).slice(0, TUNING.candidates);
  return avail.map(i => ({ i, s: score(state, team, i, pick.round, rg) }))
    .sort((a, b) => b.s - a.s).slice(0, n);
}

function aiChoose(state, team) {
  const pick = state.picks[state.next];
  // A team that just traded up takes the player it moved up for.
  if (pick.target != null && !state.taken.has(pick.target) && state.declared[pick.target]) return pick.target;
  const list = choices(state, team, 8).map(c => ({ ...c, s: c.s * Math.exp(TUNING.pickNoise * state.r.normal()) }))
    .sort((a, b) => b.s - a.s);
  if (!list.length) return null;
  const reach = TUNING.reachChance[pick.round - 1] ?? 0.15;
  if (list.length > 2 && state.r() < reach) {
    // A reach: one of the next few names on his board.
    return list[1 + Math.floor(state.r() * Math.min(3, list.length - 1))].i;
  }
  return list[0].i;
}

export function makePick(state, i, how = 'ai') {
  const pick = state.picks[state.next];
  const p = state.prospects[i];
  pick.player = i;
  pick.how = how;
  state.taken.set(i, state.next);
  const nd = state.needs[pick.owner];
  if (nd[p.group] != null) nd[p.group] *= TUNING.needAfterPick;
  if (p.group === 'QB') nd.QB = Math.min(nd.QB ?? 0, 0.05);
  state.next++;
  const nr = state.picks[state.next]?.round;
  if (nr && nr !== state.round) { state.round = nr; state.tradesThisRound = 0; }
}

// Value of a set of picks on the chart; future-year picks would count a round lower (not used tonight).
function pickValue(state, idxs) {
  return idxs.reduce((s, k) => s + state.value(state.picks[k].overall), 0);
}

// Picks a team still owns after `from`, in order.
function ownedPicks(state, team, from) {
  const out = [];
  for (let k = from; k < state.picks.length; k++) if (state.picks[k].owner === team && state.picks[k].player == null) out.push(k);
  return out;
}

// Can `buyer` pay for pick `k` with its picks? Returns the package or null.
function package_(state, buyer, k, premium) {
  const target = state.value(state.picks[k].overall) * premium;
  const own = ownedPicks(state, buyer, k + 1);
  if (!own.length) return null;
  const pkg = [own[0]];
  let v = pickValue(state, pkg);
  for (let j = 1; j < own.length && v < target; j++) {
    pkg.push(own[j]);
    v += state.value(state.picks[own[j]].overall);
  }
  return v >= target ? pkg : null;
}

function swap(state, k, seller, buyer, pkg, note) {
  state.picks[k].owner = buyer;
  for (const j of pkg) state.picks[j].owner = seller;
  state.tradeLog.push({ at: state.picks[k].overall, round: state.picks[k].round, buyer, seller,
    got: [state.picks[k].overall], gave: pkg.map(j => state.picks[j].overall), note });
  state.tradesThisRound++;
}

// An AI team behind the current pick may trade up for a player it rates far above its other options.
function tryTradeUp(state) {
  const k = state.next;
  const pick = state.picks[k];
  if (!state.trades || pick.round > TUNING.tradeRounds || state.tradesThisRound >= TUNING.maxTradesPerRound) return;
  const seller = pick.owner;
  if (state.userTeams.has(seller)) return;
  const sellerTop = choices(state, seller, 3);
  if (sellerTop.length < 2) return;
  // The seller is happy to move down when its top two are close.
  const sellerGap = (sellerTop[0].s - sellerTop[1].s) / sellerTop[0].s;
  if (sellerGap > 0.12) return;
  // Find the team behind with the strongest reason to move up, then roll once for this pick.
  const seen = new Set([seller]);
  let best = null;
  for (let j = k + 1; j < Math.min(state.picks.length, k + 1 + TUNING.tradeLookahead); j++) {
    const buyer = state.picks[j].owner;
    if (seen.has(buyer) || state.userTeams.has(buyer)) continue;
    seen.add(buyer);
    const top = choices(state, buyer, 6);
    if (top.length < 5) continue;
    const target = top[0];
    // What it expects to get at its own pick: about its (picks in between)th choice, capped.
    const between = Math.min(5, j - k);
    const fallback = top[Math.min(top.length - 1, between)];
    const urgency = (target.s - fallback.s) / target.s;
    const qb = state.prospects[target.i].group === 'QB' && (state.needs[buyer].QB ?? 0) > 0.6;
    const bar = TUNING.tradeUrgency * (qb ? 0.6 : 1);
    if (urgency < bar) continue;
    const score = urgency / bar;
    if (!best || score > best.score) best = { buyer, target, qb, score };
  }
  if (!best) return;
  const rate = state.teams.teams[best.buyer].habits.draft_trades_per_year / state.avgTradeRate;
  const chance = TUNING.tradeChance * Math.max(0.3, Math.min(2, rate)) * (best.qb ? 1.5 : 1);
  if (state.r() > chance) return;
  const pkg = package_(state, best.buyer, k, TUNING.tradePremium);
  if (!pkg) return;
  swap(state, k, seller, best.buyer, pkg, `${best.buyer} moves up for ${state.prospects[best.target.i].name}`);
  pick.target = best.target.i;
}

// The user offers a trade. The AI side accepts when it gets enough chart value, plus more if it
// loves the player it would give up the chance at. Returns { ok, reason }.
export function proposeTrade(state, user, give, get) {
  const other = new Set(get.map(k => state.picks[k].owner));
  if (other.size !== 1) return { ok: false, reason: 'Ask for picks from one team at a time.' };
  const partner = [...other][0];
  if (give.some(k => state.picks[k].owner !== user)) return { ok: false, reason: 'You can only give your own picks.' };
  if ([...give, ...get].some(k => state.picks[k].player != null)) return { ok: false, reason: 'Those picks are used.' };
  const vGive = pickValue(state, give), vGet = pickValue(state, get);
  let premium = TUNING.tradePremium;
  if (get.includes(state.next)) {
    const top = choices(state, partner, 3);
    if (top.length > 1) premium += Math.max(0, (top[0].s - top[1].s) / top[0].s);
  }
  if (vGive >= vGet * premium) {
    for (const k of get) state.picks[k].owner = user;
    for (const k of give) state.picks[k].owner = partner;
    state.tradeLog.push({ at: Math.min(...get.map(k => state.picks[k].overall)), buyer: user, seller: partner,
      got: get.map(k => state.picks[k].overall), gave: give.map(k => state.picks[k].overall), note: 'your trade' });
    return { ok: true, reason: `${partner} accepts: ${Math.round(vGive)} points for ${Math.round(vGet)}.` };
  }
  return { ok: false, reason: `${partner} wants about ${Math.round(vGet * premium)} points; you offered ${Math.round(vGive)}.` };
}

// Run AI picks until a user team is on the clock or the draft ends.
export function advance(state, { stopAtUser = true, until = Infinity } = {}) {
  while (state.next < state.picks.length && state.next < until) {
    tryTradeUp(state);
    const team = state.picks[state.next].owner;
    if (stopAtUser && state.userTeams.has(team)) return 'user';
    const i = aiChoose(state, team);
    if (i == null) break;
    makePick(state, i);
  }
  return state.next >= state.picks.length ? 'done' : 'paused';
}

// Undrafted free agents: each team signs a few of the best left, by its own board and need.
export function udfaRush(state, perTeam = 3, top = 60) {
  const left = available(state).slice(0, top);
  const order = state.teamIds.slice().sort(() => state.r() - 0.5);
  const signed = [];
  const taken = new Set();
  for (let round = 0; round < perTeam; round++) {
    for (const t of order) {
      let best = null, bs = -1;
      for (const i of left) {
        if (taken.has(i)) continue;
        const s = state.boards[t][i] * (1 + 0.5 * (state.needs[t][state.prospects[i].group] ?? 0));
        if (s > bs) { bs = s; best = i; }
      }
      if (best != null) { taken.add(best); signed.push({ team: t, i: best }); }
    }
  }
  return signed;
}

// Class grade: value of players taken against the value of the picks spent, plus needs filled.
// Rank of each declared player in this draft's class (board ranks include players who stayed in school).
export function classRanks(state) {
  const m = new Map();
  state.ordered.filter(i => state.declared[i]).forEach((i, k) => m.set(i, k + 1));
  return m;
}

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

// Many drafts: landing ranges per prospect and likely picks per team.
export function simulate({ prospects, teams, chart, n = 200, seed = 7, allDeclare = false, trades = true, onProgress }) {
  const res = prospects.map(() => ({ picks: [], teams: {} }));
  const firstPick = {};
  let tradeCount = 0;
  for (let s = 0; s < n; s++) {
    const st = newDraft({ prospects, teams, chart, seed: seed + s * 7919, allDeclare, trades });
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
