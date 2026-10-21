// Standings and the projected 2027 draft order, worked out in the page so the order follows the season.
// Games come live from nflverse (free, no key). If that fails: the last games this browser fetched, or the games
// built into teams.json, whichever is newer. Records you enter on the Standings page replace a team's own.
// The projection is pipeline/nfl.py's, ported: a rating from point margins, the rest of the season and the playoffs
// simulated, then the published order rules (non-playoff teams by record, playoff teams by how far they went,
// ties by strength of schedule: the weaker schedule picks first).
import { rng } from './draft.js';

export const GAMES_URL = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';
const CACHE_KEY = 'mockdraft2027.games.v1';
// Estimated, as in pipeline/nfl.py: game margin spread, home edge, and how many games of last season's form the
// rating starts from.
const MARGIN_SD = 13.5, HOME_EDGE = 1.5, PRIOR_K = 4;
export const SIMS = 2000;
const ROUND = { WC: 1, DIV: 2, CON: 3, SB: 4 };
// How far a team went: 0 missed the playoffs, 1-4 lost in that round, 5 won the Super Bowl.
export const EXITS = [
  ['missed', 0, 'Missed playoffs'], ['WC', 1, 'Lost wild card'], ['DIV', 2, 'Lost divisional'],
  ['CON', 3, 'Lost conference final'], ['SB', 4, 'Lost Super Bowl'], ['champ', 5, 'Won Super Bowl'],
];
const EXIT_ROUND = Object.fromEntries(EXITS.map(([k, r]) => [k, r]));

function splitCsv(line) {
  if (!line.includes('"')) return line.split(',');
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c !== '"') cur += c;
      else if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

// nflverse games.csv to compact games: { s season, type, wk, day, away, home, as, hs (null until played), neutral }.
export function parseGames(text, seasons) {
  const lines = text.split(/\r?\n/);
  const h = splitCsv(lines[0]);
  const need = ['season', 'game_type', 'week', 'gameday', 'away_team', 'away_score', 'home_team', 'home_score', 'location'];
  const c = Object.fromEntries(need.map(k => [k, h.indexOf(k)]));
  const missing = need.filter(k => c[k] < 0);
  if (missing.length) throw new Error(`games file has no ${missing.join(', ')} column`);
  const want = new Set(seasons.map(String));
  const num = v => (v === '' || v === 'NA' || v == null ? null : +v);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const r = splitCsv(lines[i]);
    if (!want.has(r[c.season])) continue;
    out.push({ s: +r[c.season], type: r[c.game_type], wk: +r[c.week], day: r[c.gameday], away: r[c.away_team],
      home: r[c.home_team], as: num(r[c.away_score]), hs: num(r[c.home_score]), neutral: r[c.location] === 'Neutral' });
  }
  return out;
}

const played = g => g.hs != null && g.as != null;
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
// Estimated: margin per game that goes with a win share, from the normal game model (logistic approximation).
const marginFor = p => MARGIN_SD * Math.log(p / (1 - p)) / 1.702;
const pct = (sorted, q) => {
  const x = q * (sorted.length - 1), lo = Math.floor(x);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (x - lo);
};

// A record you entered counts when W, L and T are whole numbers that fit the schedule. A playoff result counts alone.
export function cleanManual(manual, games = null) {
  const out = {};
  for (const [t, m] of Object.entries(manual ?? {})) {
    if (!m) continue;
    const n = games ? games.filter(g => g.home === t || g.away === t).length : 17;
    const rec = ['w', 'l', 't'].every(k => Number.isInteger(m[k]) && m[k] >= 0) && m.w + m.l + m.t <= n
      ? { w: m.w, l: m.l, t: m.t } : null;
    const exit = EXIT_ROUND[m.po];
    if (rec || exit != null) out[t] = { rec, exit };
  }
  return out;
}

// games: compact games for this season and the one before; teams: teams.json's teams (conference, division).
export function project({ games, teams, season, manual = {}, sims = SIMS, seed = 2027 }) {
  const T = Object.keys(teams).sort();
  const cur = games.filter(g => g.s === season && g.type === 'REG').sort((a, b) => a.wk - b.wk || a.day.localeCompare(b.day));
  const prev = games.filter(g => g.s === season - 1 && g.type === 'REG' && played(g));
  const sched = Object.fromEntries(T.map(t => [t, []]));
  cur.forEach((g, k) => { sched[g.home]?.push(k); sched[g.away]?.push(k); });
  if (T.some(t => !sched[t].length)) return null;
  const man = cleanManual(manual, cur);
  // A record with fewer games than the data has is out of date: the games win, and the page says so.
  const stale = T.filter(t => man[t]?.rec && Object.values(man[t].rec).reduce((a, b) => a + b, 0) < sched[t].filter(k => played(cur[k])).length);
  for (const t of stale) { man[t].rec = null; if (man[t].exit == null) delete man[t]; }
  const exit = t => man[t]?.exit;
  const margin = (g, t) => (g.home === t ? g.hs - g.as : g.as - g.hs);

  // Which games count as played for each side: the data's, or the first W+L+T on the schedule for a record you set.
  const doneH = [], doneA = [];
  const base = {}, rec = {}, rate = {};
  for (const t of T) {
    const r = man[t]?.rec, n = r ? r.w + r.l + r.t : null;
    sched[t].forEach((k, pos) => { (cur[k].home === t ? doneH : doneA)[k] = n != null ? pos < n : played(cur[k]); });
    const data = sched[t].filter(k => played(cur[k]));
    const res = data.map(k => Math.sign(margin(cur[k], t)));
    rec[t] = r ?? { w: res.filter(x => x > 0).length, l: res.filter(x => x < 0).length, t: res.filter(x => x === 0).length };
    base[t] = rec[t].w + rec[t].t / 2;
    // Rating: this season's margins, shrunk toward half of last season's (computed, estimated weights). Games in
    // your record that the data doesn't have yet count at the margin that goes with their win share (estimated).
    const used = n != null ? data.slice(0, n) : data;
    const m = used.map(k => margin(cur[k], t));
    if (n != null && n > used.length) {
      const e = n - used.length;
      const dw = used.reduce((a, k) => a + (margin(cur[k], t) > 0 ? 1 : margin(cur[k], t) === 0 ? 0.5 : 0), 0);
      const xw = Math.max(0, Math.min(e, base[t] - dw));
      m.push(...Array(e).fill(marginFor((xw + 0.5) / (e + 1))));
    }
    const pm = prev.filter(g => g.home === t || g.away === t).map(g => margin(g, t));
    const prior = 0.5 * (pm.length ? mean(pm) : 0);
    rate[t] = (m.reduce((a, b) => a + b, 0) + PRIOR_K * prior) / (m.length + PRIOR_K);
  }

  const open = cur.map((_, k) => k).filter(k => !doneH[k] || !doneA[k]);
  const mu = cur.map(g => rate[g.home] - rate[g.away] + (g.neutral ? 0 : HOME_EDGE));
  const pairKey = (r, a, b) => `${r}|${[a, b].sort().join('|')}`;
  const realPost = new Map(games.filter(g => g.s === season && ROUND[g.type] && played(g) && g.hs !== g.as)
    .map(g => [pairKey(ROUND[g.type], g.home, g.away), g.hs > g.as ? g.home : g.away]));
  const confs = {};
  for (const t of T) ((confs[teams[t].conference] ??= {})[teams[t].division] ??= []).push(t);

  const R = rng(seed);
  const slots = Object.fromEntries(T.map(t => [t, []])), winSum = Object.fromEntries(T.map(t => [t, 0]));
  for (let s = 0; s < sims; s++) {
    const w = { ...base };
    for (const k of open) {
      const g = cur[k];
      if (mu[k] + R.normal() * MARGIN_SD > 0) { if (!doneH[k]) w[g.home]++; } else if (!doneA[k]) w[g.away]++;
    }
    const tb = Object.fromEntries(T.map(t => [t, R()]));  // stands in for the head-to-head and other tiebreakers
    const sos = Object.fromEntries(T.map(t => [t, sched[t].reduce((a, k) => a + w[cur[k].home === t ? cur[k].away : cur[k].home], 0) / sched[t].length]));
    const better = (a, b) => w[b] - w[a] || tb[b] - tb[a];
    const seeds = {};
    for (const [conf, divs] of Object.entries(confs)) {
      const ok = t => exit(t) !== 0;
      const all = Object.values(divs).flat();
      const winners = Object.values(divs).map(d => (d.filter(ok).length ? d.filter(ok) : d).slice().sort(better)[0]).sort(better);
      const wc = all.filter(t => !winners.includes(t) && ok(t)).sort(better).slice(0, 3);
      // A team you marked as making the playoffs is in: it takes the lowest wild card nobody marked.
      for (const t of all.filter(t => exit(t) > 0 && !winners.includes(t) && !wc.includes(t))) {
        const i = wc.findLastIndex(x => !(exit(x) > 0));
        if (i >= 0) wc[i] = t;
      }
      seeds[conf] = [...winners, ...wc.sort(better)];
    }
    const out = {};
    const game = (a, b, r) => {
      const real = realPost.get(pairKey(r, a, b));
      if (real) return real === a ? [a, b] : [b, a];
      const ea = exit(a), eb = exit(b);
      if (ea === r && eb !== r) return [b, a];
      if (eb === r && ea !== r) return [a, b];
      if (ea > r && !(eb > r)) return [a, b];
      if (eb > r && !(ea > r)) return [b, a];
      return rate[a] - rate[b] + (r < 4 ? HOME_EDGE : 0) + R.normal() * MARGIN_SD > 0 ? [a, b] : [b, a];
    };
    const champs = [];
    for (const sd of Object.values(seeds)) {
      const alive = [sd[0]];
      for (const [hi, lo] of [[1, 6], [2, 5], [3, 4]]) {
        const [x, y] = game(sd[hi], sd[lo], 1);
        out[y] = 1; alive.push(x);
      }
      alive.sort((a, b) => sd.indexOf(a) - sd.indexOf(b));
      const nxt = [];
      for (const [a, b] of [[alive[0], alive[3]], [alive[1], alive[2]]]) {
        const [x, y] = game(a, b, 2);
        out[y] = 2; nxt.push(x);
      }
      nxt.sort((a, b) => sd.indexOf(a) - sd.indexOf(b));
      const [x, y] = game(nxt[0], nxt[1], 3);
      out[y] = 3; champs.push(x);
    }
    const [x, y] = game(champs[0], champs[1], 4);
    out[y] = 4; out[x] = 5;
    const key = (a, b) => w[a] - w[b] || sos[a] - sos[b] || tb[a] - tb[b];
    const order = [...T.filter(t => out[t] == null).sort(key), ...T.filter(t => out[t] != null).sort((a, b) => out[a] - out[b] || key(a, b))];
    order.forEach((t, i) => slots[t].push(i + 1));
    for (const t of T) winSum[t] += w[t];
  }

  const proj = {};
  for (const t of T) {
    const sl = slots[t].slice().sort((a, b) => a - b);
    const dist = Array(32).fill(0);
    sl.forEach(v => dist[v - 1]++);
    const r = rec[t];
    proj[t] = { rating: Math.round(rate[t] * 100) / 100, slot_mean: mean(sl), slot_p10: Math.trunc(pct(sl, 0.1)),
      slot_p90: Math.trunc(pct(sl, 0.9)), proj_wins: Math.round(winSum[t] / sims * 10) / 10, slot_dist: dist,
      record: `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`, games_played: r.w + r.l + r.t, manual: !!man[t] };
  }
  const days = games.filter(g => g.s === season && played(g)).map(g => g.day).sort();
  return { order: T.slice().sort((a, b) => proj[a].slot_mean - proj[b].slot_mean), teams: proj, sims,
    asOf: days[days.length - 1] ?? null, done: open.length === 0, manual: Object.keys(man), stale };
}

// Each team's record in the games themselves, before anything you entered: { BUF: { w, l, t } }.
export function dataRecords(games, season) {
  const out = {};
  for (const g of games ?? []) {
    if (g.s !== season || g.type !== 'REG' || !played(g)) continue;
    for (const [t, m] of [[g.home, g.hs - g.as], [g.away, g.as - g.hs]]) {
      const r = (out[t] ??= { w: 0, l: 0, t: 0 });
      r[m > 0 ? 'w' : m < 0 ? 'l' : 't']++;
    }
  }
  return out;
}

// Write a projection into teams.json's shape: order, each team's record and range, and the picks re-slotted.
export function applyProjection(T, p, info = {}) {
  T.order = p.order;
  for (const [t, x] of Object.entries(p.teams)) {
    const { manual, ...rest } = x;
    Object.assign(T.teams[t], rest, { record_manual: manual });
    T.teams[t].standing = { ...T.teams[t].standing, win_pct: Math.round(x.proj_wins / 17 * 1000) / 1000, win_pct_projected: !p.done };
  }
  // Once the real pick list is out (every pick numbered), it stands; until then picks follow the projected order.
  if (!T.picks.every(x => x.overall != null)) {
    const owner = new Map(T.picks.map(x => [`${x.original}|${x.round}`, x.owner]));
    T.picks = [];
    for (let r = 1; r <= 7; r++) {
      p.order.forEach((t, i) => T.picks.push({ round: r, slot: i + 1, original: t, owner: owner.get(`${t}|${r}`) ?? t }));
    }
  }
  if (p.asOf) T.as_of = p.asOf;
  T.sims = p.sims;
  T.standings = { ...info, done: p.done, manual: p.manual, stale: p.stale };
}

export function cachedGames() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    return c?.games?.length ? c : null;
  } catch (e) { return null; }
}

export async function fetchGames(season, { timeout = 8000 } = {}) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(GAMES_URL, { signal: ctl.signal, cache: 'no-cache' });
    if (!r.ok) throw new Error(`nflverse answered ${r.status}`);
    const games = parseGames(await r.text(), [season - 1, season]);
    if (!games.some(g => g.s === season)) throw new Error(`no ${season} games in the file yet`);
    const c = { fetchedAt: new Date().toISOString(), games };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) { /* storage blocked: live only */ }
    return c;
  } finally { clearTimeout(id); }
}

const latest = games => games.reduce((m, g) => (played(g) && g.day > m ? g.day : m), '');

// Live first (live: true, or a fetchGames call already under way). If that fails, whichever is newer of this
// browser's last fetch and the games built into teams.json.
export async function chooseGames(T, { live = true } = {}) {
  const season = (T.draft_year ?? 2027) - 1;
  let error = null;
  if (live) {
    try { return { source: 'live', ...(await (live === true ? fetchGames(season) : live)) }; } catch (e) {
      error = e.name === 'AbortError' ? 'the request timed out' : e.message;
    }
  }
  const cache = cachedGames();
  const opts = [cache && { source: 'cache', ...cache }, T.games?.length && { source: 'built', games: T.games }].filter(Boolean)
    .sort((a, b) => latest(b.games).localeCompare(latest(a.games)));
  return opts[0] ? { ...opts[0], error } : { source: 'none', games: null, error };
}

// Re-project D.teams from the chosen games and your records. With no games at all, the built order stands.
export function applyStandings(D, games, manual) {
  const T = D.teams;
  const info = { source: games.source, fetchedAt: games.fetchedAt ?? null, error: games.error ?? null };
  const p = games.games && project({ games: games.games, teams: T.teams, season: (T.draft_year ?? 2027) - 1, manual });
  if (!p) { T.standings = { ...info, source: 'none', done: false, manual: [], stale: [] }; return null; }
  applyProjection(T, p, info);
  return p;
}
