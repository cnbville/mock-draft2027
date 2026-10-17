// Formatting: numbers, sizes, dates, positions, classes, picks. Plain words, short labels.
// util.js keeps its own exports (tests and old views use them); this file is what the new screens use.
//
//   num(v, d)        1,234 / 12.3     int(v)  rounded with separators     dash = '–' for missing values
//   pct(v, d)        0.42 -> '42%'    pts(v)  value-chart points '1,234'
//   ht(in)           75 -> 6'3"        wt(lb)  223 -> '223 lb'             size(p)  '6'3" · 223 lb'
//   money(v)         15.5e6 -> '$15.5M'
//   ordinal(n)       1 -> '1st'       rank(n) 'No. 7' (or '–')            plural(n, 'pick') '3 picks'
//   date(s)          '2026-10-15 23:34' -> 'Oct 15'    dateLong(s) -> 'October 15, 2026'
//   POS_NAME / posName(g) / posPlural(g)      'Edge rusher', 'Edge rushers'
//   CLASS_NAME / className(y) / classShort(y)  3 -> 'Junior' / 'Jr'
//   pickLabel(round, slot)  'Round 1, pick 7'    roundLabel(r) 'Round 1'
//   firstLast(name)  ['Jeremiah', 'Smith'] for two-line hero names
//   boardShort(label, meta)  'CBS Sports (Mike Renner)' -> 'CBS'
//   OUTCOMES         [[key, label], ...] hit-rate outcomes in order, worst to best
//   hitRatesAt(hit, group, pick), athleticScore(...)  re-exported from util.js

export { hitRatesAt, athleticScore } from '../util.js';

export const dash = '–';
const bad = v => v == null || v === '' || Number.isNaN(+v);

export const num = (v, d = 0) => bad(v) ? dash : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const int = v => bad(v) ? dash : Math.round(+v).toLocaleString('en-US');
export const pct = (v, d = 0) => bad(v) ? dash : `${(v * 100).toFixed(d)}%`;
export const pts = v => bad(v) ? dash : Math.round(+v).toLocaleString('en-US');
export const ht = h => bad(h) || !h ? dash : `${Math.floor(h / 12)}'${Math.round(h % 12)}"`;
export const wt = w => bad(w) || !w ? dash : `${Math.round(w)} lb`;
export const size = p => `${ht(p?.height)} · ${wt(p?.weight)}`;
export const money = v => bad(v) ? dash : `${v < 0 ? '−' : ''}$${(Math.abs(v) / 1e6).toFixed(Math.abs(v) >= 1e8 ? 0 : 1)}M`;

export function ordinal(n) {
  if (bad(n)) return dash;
  const k = Math.round(n), t = k % 100;
  const s = t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[k % 10] ?? 'th');
  return `${k}${s}`;
}
export const rank = n => bad(n) || !n ? dash : `No. ${Math.round(n)}`;
export const plural = (n, word, many = `${word}s`) => `${num(n)} ${Math.round(n) === 1 ? word : many}`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function parts(s) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ''));
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
}
export const date = s => { const p = parts(s); return p ? `${MONTHS[p.m].slice(0, 3)} ${p.d}` : String(s ?? dash); };
export const dateLong = s => { const p = parts(s); return p ? `${MONTHS[p.m]} ${p.d}, ${p.y}` : String(s ?? dash); };

export const POS_NAME = {
  QB: 'Quarterback', RB: 'Running back', WR: 'Wide receiver', TE: 'Tight end', OT: 'Offensive tackle',
  IOL: 'Interior offensive line', EDGE: 'Edge rusher', DT: 'Defensive tackle', LB: 'Linebacker', CB: 'Cornerback',
  S: 'Safety', K: 'Kicker', P: 'Punter', LS: 'Long snapper',
};
const POS_PLURAL = {
  QB: 'Quarterbacks', RB: 'Running backs', WR: 'Wide receivers', TE: 'Tight ends', OT: 'Offensive tackles',
  IOL: 'Interior linemen', EDGE: 'Edge rushers', DT: 'Defensive tackles', LB: 'Linebackers', CB: 'Cornerbacks',
  S: 'Safeties', K: 'Kickers', P: 'Punters', LS: 'Long snappers',
};
export const posName = g => POS_NAME[g] ?? g ?? '';
export const posPlural = g => POS_PLURAL[g] ?? `${g}s`;
// Positions in the order a board lists them.
export const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P', 'LS'];

export const CLASS_NAME = { 1: 'Freshman', 2: 'Sophomore', 3: 'Junior', 4: 'Senior', 5: 'Fifth year', 6: 'Sixth year' };
const CLASS_SHORT = { 1: 'Fr', 2: 'So', 3: 'Jr', 4: 'Sr', 5: 'Sr+', 6: 'Sr+' };
export const className = y => CLASS_NAME[y] ?? 'Class unknown';
export const classShort = y => CLASS_SHORT[y] ?? dash;

export const roundLabel = r => `Round ${r}`;
export const pickLabel = (round, slot) => `Round ${round}, pick ${slot}`;

export function firstLast(name) {
  const w = String(name ?? '').trim().split(/\s+/);
  if (w.length < 2) return [w[0] ?? '', ''];
  // keep suffixes with the last name: "Kenneth Grant Jr."
  return [w[0], w.slice(1).join(' ')];
}

export function boardShort(label, meta) {
  const b = meta?.boards?.find(x => x.label === label);
  return b?.short ?? String(label ?? '').split(/[\s(]/)[0];
}

export const OUTCOMES = [
  ['bust', 'Bust'], ['backup', 'Backup'], ['starter', 'Starter'], ['good_starter', 'Good starter'], ['pro_bowl', 'Pro Bowl level'],
];
export const OUTCOME_HELP = {
  bust: 'No seasons as a primary starter',
  backup: '1 or 2 seasons as a starter',
  starter: '3 or 4 seasons as a starter',
  good_starter: '5 or more seasons as a starter',
  pro_bowl: 'At least one Pro Bowl or All-Pro',
};
