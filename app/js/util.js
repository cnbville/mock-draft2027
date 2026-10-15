// Shared helpers for the views.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const fmt = {
  ht: h => h ? `${Math.floor(h / 12)}'${h % 12}"` : '–',
  num: (v, d = 0) => v == null || Number.isNaN(v) ? '–' : Number(v).toFixed(d),
  pct: v => v == null ? '–' : `${Math.round(v * 100)}%`,
  money: v => v == null ? '–' : `$${(v / 1e6).toFixed(1)}M`,
};

export const CLASS = { 1: 'Fr', 2: 'So', 3: 'Jr', 4: 'Sr', 5: 'Sr+', 6: 'Sr+' };

export const OUTCOME_COLORS = { bust: '#c0392b', backup: '#e08e0b', starter: '#9aa5b1', good_starter: '#3a7bd5', pro_bowl: '#1b7f3b' };
export const OUTCOME_LABELS = { bust: 'Bust', backup: 'Backup', starter: 'Starter', good_starter: 'Good starter', pro_bowl: 'Pro Bowl level' };

export function hitRatesAt(hit, group, pick) {
  const rows = hit.by_group[group] ?? hit.bands;
  const row = rows.find(b => pick >= b.lo && pick <= b.hi) ?? rows[rows.length - 1];
  return row.rates;
}

export function outcomeBar(rates) {
  const parts = Object.entries(OUTCOME_COLORS).map(([k, c]) =>
    `<span title="${OUTCOME_LABELS[k]} ${Math.round(rates[k] * 100)}%" style="width:${rates[k] * 100}%;background:${c}"></span>`).join('');
  return `<div class="stack">${parts}</div>`;
}

export function outcomeLegend() {
  return `<div class="legend">${Object.entries(OUTCOME_COLORS).map(([k, c]) => `<span><i style="background:${c}"></i>${OUTCOME_LABELS[k]}</span>`).join('')}</div>`;
}

export function bar(v) {
  return `<div class="bar"><span style="width:${Math.max(0, Math.min(1, v)) * 100}%"></span></div>`;
}

// Sortable table: cols = [{key, label, num, get(row), html(row)}]
export function table(cols, rows, { onRow, sortKey, sortDir = 1, id = '', rowClass } = {}) {
  let key = sortKey, dir = sortDir;
  const wrap = document.createElement('div');
  wrap.className = 'tablewrap';
  const draw = () => {
    const col = cols.find(c => c.key === key);
    const data = col ? rows.slice().sort((a, b) => {
      const x = col.get(a), y = col.get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x > y ? 1 : x < y ? -1 : 0) * dir;
    }) : rows;
    wrap.innerHTML = `<table id="${id}"><thead><tr>${cols.map(c => `<th data-k="${c.key}" class="${c.num ? 'num' : ''}">${esc(c.label)}${c.key === key ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${data.map((r, i) => `<tr class="${onRow ? 'click' : ''} ${rowClass ? rowClass(r) : ''}" data-i="${rows.indexOf(r)}">${cols.map(c => `<td class="${c.num ? 'num' : ''}">${c.html ? c.html(r) : esc(c.get(r) ?? '–')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    wrap.querySelectorAll('th').forEach(th => th.onclick = () => {
      const k = th.dataset.k;
      dir = k === key ? -dir : 1;
      key = k;
      draw();
    });
    if (onRow) wrap.querySelectorAll('tbody tr').forEach(tr => tr.onclick = e => {
      if (e.target.closest('button,input,select,a')) return;
      onRow(rows[+tr.dataset.i]);
    });
  };
  draw();
  return wrap;
}

export function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// RAS-style athletic score: each test as a percentile at the position, averaged, on a 0-10 scale.
export function athleticScore(combinePct, group, entries) {
  const g = combinePct.groups[group];
  if (!g) return null;
  const parts = [];
  for (const [t, dir] of Object.entries(combinePct.tests)) {
    const v = parseFloat(entries?.[t]);
    if (!g[t] || Number.isNaN(v)) continue;
    const q = g[t];
    let k = 0;
    while (k < q.length && q[k] < v) k++;
    let p = k / (q.length - 1);
    if (dir < 0) p = 1 - p;
    parts.push({ test: t, pct: p });
  }
  const tests = parts.filter(p => p.test !== 'height' && p.test !== 'weight');
  if (!tests.length) return { score: null, parts };
  return { score: 10 * parts.reduce((s, p) => s + p.pct, 0) / parts.length, parts };
}
