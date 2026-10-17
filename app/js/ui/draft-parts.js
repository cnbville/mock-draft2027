// Draft room pieces (used by views/draft.js and ui/draft-recap.js): read-only helpers over the engine state and
// small HTML builders. Nothing here changes the draft. Numbers come from the engine (draft.js, ai/market.js) and
// the data files; every figure shown says where it comes from.

import { h, raw } from './dom.js';
import { logo, teamArt } from './art.js';
import { face } from './face.js';
import { pill, src } from './parts.js';
import { ht, num, pct, posName, posPlural, classShort } from './fmt.js';
import { classRanks } from '../draft.js';
import { assetValue, label } from '../ai/market.js';

export const nick = abbr => teamArt(abbr).nick;
export const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);

// A team's needs from teams.json (computed from contracts, snaps and depth), biggest first: [[group, 0..1], ...]
export function needsOf(D, team) {
  const nd = D.teams.teams[team]?.needs ?? {};
  return Object.entries(nd).map(([g, v]) => [g, v?.need ?? 0]).sort((a, b) => b[1] - a[1]);
}
export const needWord = v => (v >= 0.6 ? 'High' : v >= 0.35 ? 'Medium' : 'Low');

// The hit-rate band for a position at a pick (published draft history, computed rates).
export function hitBand(D, group, pick) {
  const rows = D.hit_rates.by_group?.[group] ?? D.hit_rates.bands;
  return rows.find(b => pick >= b.lo && pick <= b.hi) ?? rows[rows.length - 1];
}

// Key numbers from his last full college season (cfbfastR play data, totals computed by the pipeline).
export function keyStats(p) {
  const ss = p.seasons ?? [];
  const s = [...ss].reverse().find(x => x.games >= 3) ?? ss[ss.length - 1];
  const size = { items: [{ label: 'Height', value: ht(p.height) }, { label: 'Pounds', value: p.weight ? num(p.weight) : '–' },
    { label: 'Class', value: classShort(p.class_year) }], note: 'Size. No public stats at this position.', stats: false };
  if (!s) return size;
  const sk = v => num(v, v % 1 ? 1 : 0);
  const rate = (a, b) => (b ? `${num((a / b) * 100)}%` : '–');
  const rec = [['Catches', num(s.rec)], ['Yards', num(s.rec_yds)], ['TD', num(s.rec_td)]];
  const front = [['Sacks', sk(s.sacks)], ['Forced fum.', num(s.ff)], ['Team sacks', s.sh_sacks != null ? pct(s.sh_sacks) : '–']];
  const back = [['INT', num(s.ints)], ['Breakups', num(s.pbu)], ['Games', num(s.games)]];
  const m = {
    QB: [['Pass yds', num(s.pass_yds)], ['TD', num(s.pass_td)], ['Comp.', rate(s.pass_comp, s.pass_att)]],
    RB: [['Rush yds', num(s.rush_yds)], ['TD', num(s.rush_td)], ['Per carry', s.rush_att ? num(s.rush_yds / s.rush_att, 1) : '–']],
    WR: rec, TE: rec, EDGE: front, DT: front,
    LB: [['Sacks', sk(s.sacks)], ['INT', num(s.ints)], ['Breakups', num(s.pbu)]],
    CB: back, S: back,
    K: [['FG made', num(s.fg_made)], ['FG missed', num(s.fg_missed)], ['Games', num(s.games)]],
  }[p.group];
  if (!m) return size;
  return { items: m.map(([l, v]) => ({ label: l, value: v })), note: `${s.season} season, ${s.games} games`, stats: true };
}

// The next open pick of any of `teams` at or after index `from`.
export function nextOwnPick(S, teams, from) {
  for (let k = from; k < S.picks.length; k++) {
    const p = S.picks[k];
    if (p.player == null && teams.has(p.owner)) return k;
  }
  return null;
}

// Market chart points (fitted to real draft-day trades 2011-2025) for a list of assets.
export const points = (S, list) => list.reduce((s, a) => s + assetValue(S, '_market', a), 0);

// One line of the trade log.
export function tradeRow(t) {
  return h`<div class="dr-trow">${logo(t.buyer, 30)}<span><b>${nick(t.buyer)} get ${t.got.join(', ')}</b>
    <small>From ${nick(t.seller)} for ${t.gave.join(', ')}${t.note && t.note !== 'your trade' ? ` · ${t.note}` : ''}</small></span>
    ${t.user ? pill('Your trade', 'gold') : ''}</div>`;
}

// The two sides of a deal with market chart points, and a fairness scale from your side.
export function ledger(S, give, get, { giveTitle = 'You give', getTitle = 'You get' } = {}) {
  const side = (title, list) => h`<div><p class="label">${title}</p>
    ${list.length ? list.map(a => h`<span class="item"><span>${cap(label(S, a))}</span><b>${num(assetValue(S, '_market', a))}</b></span>`) : h`<span class="item muted"><span>Nothing yet</span><b></b></span>`}
    <span class="item tot"><span>Total</span><b>${num(points(S, list))}</b></span></div>`;
  return h`<div class="dr-ledger">${side(giveTitle, give)}${side(getTitle, get)}</div>`;
}

export function scale(S, give, get) {
  const a = points(S, give), b = points(S, get);
  const d = b - a, big = Math.max(a, b, 1);
  const pos = Math.max(4, Math.min(96, 50 + (d / big) * 60));
  const text = !a && !b ? 'Choose picks on both sides.'
    : Math.abs(d) < big * 0.03 ? 'About even on the market chart.'
      : d > 0 ? `You come out ${num(d)} points ahead on the market chart.` : `You give ${num(-d)} points more than you get on the market chart.`;
  return h`<div class="dr-scale"><span class="track"><span class="knob" style="left:${pos.toFixed(1)}%"></span></span>
    <span class="ends"><span>Bad for you</span><span>Even</span><span>Good for you</span></span>
    <p>${text} ${src('computed', 'Market chart from real draft-day trades 2011-2025')}</p></div>`;
}

// The quick read on a pick: class rank against the pick, the team's need, and what became of players taken there.
// Letter: the value of his class rank over the value of the pick (the engine's value chart, career AV per pick),
// moved one step up for a top-3 need and one step down for a small need. A quick read, not a forecast.
const LETTERS = ['A+', 'A', 'A−', 'B+', 'B', 'C+', 'C', 'D'];
export function quickRead(S, D, k) {
  const pk = S.picks[k];
  const p = D.prospects[pk.player];
  const rank = classRanks(S).get(pk.player);
  const ratio = S.value(rank) / Math.max(1e-9, S.value(pk.overall));
  let step = ratio >= 1.5 ? 0 : ratio >= 1.2 ? 1 : ratio >= 1.05 ? 2 : ratio >= 0.95 ? 3 : ratio >= 0.85 ? 4 : ratio >= 0.7 ? 5 : ratio >= 0.5 ? 6 : 7;
  const needs = needsOf(D, pk.owner);
  const nIdx = needs.findIndex(([g]) => g === p.group);
  const nVal = nIdx >= 0 ? needs[nIdx][1] : 0;
  if (nIdx >= 0 && nIdx < 3) step -= 1; else if (nVal < 0.2) step += 1;
  const grade = LETTERS[Math.max(0, Math.min(LETTERS.length - 1, step))];
  const d = pk.overall - rank;
  const value = d > 0 ? `He was No. ${rank} in this class, so pick ${pk.overall} is ${d} spot${d === 1 ? '' : 's'} of value.`
    : d === 0 ? `He went right at his class rank, No. ${rank}.` : `He was No. ${rank} in this class, so this is a reach of ${-d} spot${d === -1 ? '' : 's'}.`;
  const t = nick(pk.owner);
  const need = nIdx >= 0 && nIdx < 3 ? `${posName(p.group)} is the ${t}' No. ${nIdx + 1} need.`
    : nVal >= 0.35 ? `${posName(p.group)} is a real need for the ${t}.` : `${posName(p.group)} was not a big need for the ${t}.`;
  const band = hitBand(D, p.group, pk.overall);
  const good = (band.rates.good_starter ?? 0) + (band.rates.pro_bowl ?? 0);
  const hist = `Of ${posPlural(p.group).toLowerCase()} taken at picks ${band.lo}-${band.hi} from 2000 to 2021, ${pct(good)} became good starters or better.`;
  return { grade, rank, lines: [value, need, hist], rates: band.rates };
}

// A small face + name row (your picks, steals, UDFA).
export function miniRow(p, { n, sub, tag } = {}) {
  return h`<a class="dr-mini" href="#player/${p.id}">${n != null ? h`<span class="n">${n}</span>` : ''}${face(p, 'round')}
    <span class="who"><b>${p.name}</b><small>${sub ?? `${p.group} · ${p.school}`}</small></span>${tag ? raw(String(tag)) : ''}</a>`;
}
