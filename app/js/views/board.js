// Big Board: the 700 players most likely to be drafted, as mockup C's glass rows.
//
// Everything the old table had: search by name or school, position filter, level filter (Power 4, Group of 5, FCS),
// "on a public board" filter, sort by any figure (both ways), a star per row for My Board, the three public board
// ranks, model rank, chance to declare, mock ranges and round 1 chance from simulated drafts (200 on demand, or the
// latest run from anywhere in the app), and flags. New: expected pick and chance drafted as columns, and filters kept for the session.
//
// Columns follow the width: all of them on a wide window, fewer on a laptop or tablet, and on a phone one column
// (the one you sort by, else expected pick). Rows render in batches as you scroll, so 700 rows stay smooth.

import { h, raw, icon, on } from '../ui/dom.js';
import { face } from '../ui/face.js';
import { playerStyle } from '../ui/art.js';
import { classShort, ht, wt, pct, int, posName, posPlural, POS_ORDER, dash } from '../ui/fmt.js';
import { starBtn, chips, src, ring, setRing, empty } from '../ui/parts.js';
import { shared } from './shared.js';
import { runSimsInBackground } from '../ui/sims-run.js';

const KEY = 'md27.board';          // sessionStorage: filters and sort, kept for this session only
const FIRST = 60, MORE = 120;      // rows in the first paint, then per batch
const LEVELS = ['Power 4', 'Group of 5', 'FCS'];

function loadState() {
  try { return JSON.parse(sessionStorage.getItem(KEY)) ?? {}; } catch (e) { return {}; }
}
function saveState(s) {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked: filters just aren't kept */ }
}

export function view(el, D) {
  const P = D.prospects;
  const boards = D.meta.boards ?? [];
  const sim = p => shared.sims?.summary?.[D.index.get(p.id)];
  const r0 = v => (v == null ? null : Math.round(v));

  // Sort options. dir 1 = low first (ranks, picks), -1 = high first (chances, size). Nulls always go last.
  const SORTS = [
    { k: 'board', label: 'Board', get: p => p.board_rank, dir: 1, rank: true },
    { k: 'cons', label: 'Consensus', get: p => p.consensus_rank, dir: 1, rank: true },
    ...boards.map((b, i) => ({ k: `b${i}`, label: b.label, get: p => p.board_ranks?.[b.label], dir: 1, rank: true })),
    { k: 'model', label: 'Model rank', get: p => p.model_rank, dir: 1, rank: true },
    { k: 'exp', label: 'Expected pick', get: p => p.exp_pick, dir: 1 },
    { k: 'drafted', label: 'Chance drafted', get: p => p.p_drafted, dir: -1 },
    { k: 'declare', label: 'Chance declares', get: p => p.p_declare, dir: -1 },
    { k: 'mock', label: 'Mock range (middle pick)', get: p => sim(p)?.p50, dir: 1, sims: true },
    { k: 'r1', label: 'Chance of round 1 in mocks', get: p => sim(p)?.r1, dir: -1, sims: true },
    { k: 'flags', label: 'Flags', get: p => p.flags?.length || null, dir: -1 },
    { k: 'ht', label: 'Height', get: p => p.height || null, dir: -1 },
    { k: 'wt', label: 'Weight', get: p => p.weight || null, dir: -1 },
    { k: 'class', label: 'Class', get: p => p.class_year, dir: 1 },
    { k: 'name', label: 'Name', get: p => p.name, dir: 1 },
    { k: 'school', label: 'School', get: p => p.school, dir: 1 },
  ];
  const sortBy = k => SORTS.find(s => s.k === k) ?? SORTS[0];

  // Columns. tier: xl = wide windows only, lg = laptop and up, md = tablet and up. The sorted column always shows.
  const COLS = [
    { k: 'cons', label: 'Consensus', tier: 'md', v: p => p.consensus_rank ?? dash },
    ...boards.map((b, i) => ({ k: `b${i}`, label: b.short, title: b.label, tier: 'xl', v: p => p.board_ranks?.[b.label] ?? dash })),
    { k: 'model', label: 'Model', tier: 'lg', v: p => p.model_rank ?? dash },
    { k: 'exp', label: 'Exp. pick', tier: 'md', v: p => r0(p.exp_pick) ?? dash },
    { k: 'drafted', label: 'Drafted', tier: 'lg', v: p => pct(p.p_drafted) },
    { k: 'declare', label: 'Declares', tier: 'md', v: p => pct(p.p_declare) },
    { k: 'mock', label: 'Mock range', tier: 'xl', w: true, sims: true, v: p => { const s = sim(p); return s?.p50 ? `${s.p10}–${s.p90}` : dash; } },
    { k: 'r1', label: 'Round 1', tier: 'lg', sims: true, v: p => { const s = sim(p); return s ? pct(s.r1) : dash; } },
    { k: 'flags', label: 'Flags', tier: 'xl', n: true, v: p => p.flags?.length ? h`<span class="bd-flag" title="${p.flags.join('\n')}">${icon('info')}${p.flags.length}</span>` : '' },
  ];
  const colKeys = new Set(COLS.map(c => c.k));

  // ---------- state ----------
  const groups = POS_ORDER.filter(g => P.some(p => p.group === g));
  const saved = loadState();
  const S = {
    q: typeof saved.q === 'string' ? saved.q : '',
    g: groups.includes(saved.g) ? saved.g : 'All',
    lvl: LEVELS.includes(saved.lvl) ? saved.lvl : 'All',
    ob: !!saved.ob,
    sort: SORTS.some(s => s.k === saved.sort) ? saved.sort : 'board',
    dir: saved.dir === 1 || saved.dir === -1 ? saved.dir : null,
  };
  const dirOf = () => S.dir ?? sortBy(S.sort).dir;

  const counts = new Map(groups.map(g => [g, P.filter(p => p.group === g).length]));
  const posChips = chips([{ value: 'All', label: 'All', count: P.length }, ...groups.map(g => ({ value: g, label: g, count: counts.get(g) }))],
    S.g, v => { S.g = v; update(); }, 'Position');
  posChips.classList.add('bd-chips');
  posChips.querySelectorAll('button[data-v]').forEach(b => { if (b.dataset.v !== 'All') b.title = posName(b.dataset.v); });

  const boardDates = boards.map(b => `${b.short} ${String(b.date ?? '').replace(/^fetched /, '')}`).join(', ');

  el.innerHTML = String(h`<div class="page below-top">
    <header class="screen-head">
      <p class="label">Big Board</p>
      <h1 class="screen-title">The 2027 class</h1>
      <p class="lede">The ${P.length} players most likely to be drafted in April 2027. The Board rank is what the AI teams start from: three public boards, with the draft model filling in below them. The star adds a player to My Board.</p>
      <p class="bd-legend">
        ${src('published', `Consensus and ${boards.map(b => b.short).join(', ')}: public boards (${boardDates})`)}
        ${src('computed', 'Board, model rank, expected pick and chance drafted: the draft model')}
        ${src('estimated', 'Chance declares: from class and rank')}
      </p>
    </header>
    <div class="bd-bar glass" role="search" aria-label="Filter the Big Board">
      <div class="bd-row1">
        <label class="search-field bd-q">${icon('search')}<span class="sr">Search by name or school</span>
          <input class="input" type="search" id="bdQ" placeholder="Search name or school" autocomplete="off" spellcheck="false" value="${S.q}"></label>
        <label class="bd-sort"><span class="bd-lab">Sort</span>
          <select class="select" id="bdSort" aria-label="Sort by">${SORTS.map(s => h`<option value="${s.k}" ${s.k === S.sort ? raw('selected') : ''} ${s.sims && !shared.sims ? raw('disabled') : ''}>${s.label}</option>`)}</select></label>
        <button type="button" class="btn small glass bd-dir" id="bdDir"></button>
        <label class="bd-lvl"><span class="sr">Level</span>
          <select class="select" id="bdLvl" aria-label="Level">${['All', ...LEVELS].map(l => h`<option value="${l}" ${l === S.lvl ? raw('selected') : ''}>${l === 'All' ? 'All levels' : l}</option>`)}</select></label>
        <label class="check bd-ob"><input type="checkbox" id="bdOb" ${S.ob ? raw('checked') : ''}> On a public board</label>
      </div>
      <div class="bd-chipslot"></div>
    </div>
    <div class="bd-meta">
      <p class="bd-count" id="bdCount" aria-live="polite"></p>
      <div class="bd-sims">
        <span class="bd-ring" hidden>${ring(0, { size: 22, width: 4, label: 'Simulating drafts' })}</span>
        <span id="bdSimInfo" class="src computed"></span>
        <button type="button" class="btn small glass" id="bdRun">${icon('refresh')}Run 200 mock drafts</button>
      </div>
    </div>
    <div class="rows bd-rows" id="bdRows"></div>
    <div class="bd-more" id="bdMore" aria-hidden="true"></div>
  </div>`);

  el.querySelector('.bd-chipslot').append(posChips);
  const q = el.querySelector('#bdQ'), sortSel = el.querySelector('#bdSort'), dirBtn = el.querySelector('#bdDir');
  const lvl = el.querySelector('#bdLvl'), ob = el.querySelector('#bdOb');
  const rowsEl = el.querySelector('#bdRows'), more = el.querySelector('#bdMore'), countEl = el.querySelector('#bdCount');
  const runBtn = el.querySelector('#bdRun'), simInfo = el.querySelector('#bdSimInfo'), ringBox = el.querySelector('.bd-ring');

  // ---------- rows ----------
  function rowHtml(p, phoneKey) {
    const s = sortBy(S.sort);
    const n = s.rank ? s.get(p) : p.board_rank;
    const numLabel = s.rank ? s.label : 'Board';
    const sub = [p.group, p.school, classShort(p.class_year), p.height ? `${ht(p.height)}, ${wt(p.weight)}` : ''].filter(Boolean).join(' · ');
    return h`<div class="prow bd-r" style="${raw(playerStyle(p))}">
      <span class="num ${n != null && n >= 100 ? 'small-num' : ''}" title="${numLabel} rank">${n ?? dash}</span>${face(p, 'round')}
      <span class="who"><a class="stretch" href="#player/${p.id}" aria-label="${p.name}, ${posName(p.group)}, ${p.school}. ${numLabel} rank ${n ?? 'none'}.">${p.name}</a><small>${sub}</small></span>
      <span class="cols">${COLS.filter(c => !c.sims || shared.sims).map(c => h`<span class="col t-${c.tier}${c.w ? ' w' : ''}${c.n ? ' n' : ''}${c.k === S.sort ? ' on' : ''}${c.k === phoneKey ? ' ph' : ''}"${c.title ? raw(` title="${c.title}"`) : ''}>${c.label}<b>${c.v(p)}</b></span>`)}${starBtn(p.id, p.name)}</span>
    </div>`;
  }

  let list = [], shown = 0;
  function filtered() {
    const s = S.q.trim().toLowerCase();
    const out = P.filter(p => (S.g === 'All' || p.group === S.g) && (S.lvl === 'All' || p.level === S.lvl) &&
      (!S.ob || p.consensus_rank) && (!s || p.name.toLowerCase().includes(s) || p.school.toLowerCase().includes(s)));
    const { get } = sortBy(S.sort), d = dirOf();
    return out.sort((a, b) => {
      const x = get(a), y = get(b);
      const nx = x == null || x === '', ny = y == null || y === '';
      if (nx || ny) return nx === ny ? a.board_rank - b.board_rank : nx ? 1 : -1;
      const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
      return c ? c * d : a.board_rank - b.board_rank;
    });
  }

  function append(k) {
    if (shown >= list.length) return;
    const phoneKey = colKeys.has(S.sort) ? S.sort : 'exp';
    const next = list.slice(shown, shown + k);
    rowsEl.insertAdjacentHTML('beforeend', next.map(p => String(rowHtml(p, phoneKey))).join(''));
    shown += next.length;
    more.hidden = shown >= list.length;
  }

  function draw() {
    list = filtered();
    shown = 0;
    rowsEl.innerHTML = '';
    if (!list.length) {
      rowsEl.innerHTML = String(empty({ title: 'No players match', text: 'Try another position or level, or clear the search.', iconName: 'search',
        action: '<button type="button" class="btn small glass" id="bdClear">Clear the filters</button>' }));
      more.hidden = true;
    } else append(FIRST);
    const what = S.g === 'All' ? (list.length === 1 ? 'player' : 'players') : (list.length === 1 ? posName(S.g) : posPlural(S.g)).toLowerCase();
    countEl.textContent = list.length === P.length ? `All ${int(P.length)} players, by ${sortLabel()}.` : `${int(list.length)} ${what} of ${int(P.length)}, by ${sortLabel()}.`;
  }

  function sortLabel() {
    const s = sortBy(S.sort);
    const name = s.k === 'board' ? 'Board rank' : /^b\d/.test(s.k) ? `the ${s.label} rank` : s.k === 'cons' ? 'consensus rank' : s.label.toLowerCase();
    return `${name}, ${dirText(s, dirOf())}`;
  }
  function dirText(s, d) {
    if (['name', 'school'].includes(s.k)) return d === 1 ? 'A to Z' : 'Z to A';
    if (s.rank || ['exp', 'mock', 'class'].includes(s.k)) return d === 1 ? 'lowest first' : 'highest first';
    return d === -1 ? 'highest first' : 'lowest first';
  }

  function syncDir() {
    const s = sortBy(S.sort), d = dirOf();
    dirBtn.innerHTML = String(h`${icon(d === 1 ? 'up' : 'down')}<span>${dirText(s, d)}</span>`);
    dirBtn.setAttribute('aria-label', `Order: ${dirText(s, d)}. Press to reverse.`);
  }

  function update() {
    saveState(S);
    syncDir();
    draw();
  }

  // ---------- inputs ----------
  q.addEventListener('input', () => { S.q = q.value; update(); });
  sortSel.addEventListener('change', () => { S.sort = sortSel.value; S.dir = null; update(); });
  dirBtn.addEventListener('click', () => { S.dir = -dirOf(); update(); });
  lvl.addEventListener('change', () => { S.lvl = lvl.value; update(); });
  ob.addEventListener('change', () => { S.ob = ob.checked; update(); });
  const offClear = on(el, 'click', '#bdClear', () => {
    Object.assign(S, { q: '', g: 'All', lvl: 'All', ob: false });
    q.value = ''; lvl.value = 'All'; ob.checked = false; posChips.set('All');
    update();
    q.focus();
  });

  // progressive rendering: the next batch loads well before the end comes into view
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) append(MORE); }, { rootMargin: '1400px 0px' }) : null;
  if (io) io.observe(more); else append(P.length);

  // ---------- simulated drafts ----------
  function setSimInfo() {
    if (shared.running) return;
    ringBox.hidden = true;
    runBtn.disabled = false;
    simInfo.textContent = shared.sims ? `Mock range and round 1 chance from ${int(shared.sims.n)} simulated drafts in this browser.`
      : 'Run mock drafts to add each player\'s range and round 1 chance. About two minutes; the screen may pause.';
    for (const o of sortSel.options) if (sortBy(o.value).sims) o.disabled = !shared.sims;
  }
  const listener = ev => {
    if (ev.progress != null) {
      ringBox.hidden = false;
      runBtn.disabled = true;
      setRing(ringBox.querySelector('.ring'), ev.progress, `Simulating drafts, ${Math.round(ev.progress * 100)}%`);
      simInfo.textContent = `Simulating drafts… ${Math.round(ev.progress * 100)}%`;
    }
    if (ev.done) { setSimInfo(); draw(); }
  };
  shared.listeners.add(listener);
  runBtn.addEventListener('click', () => { runBtn.disabled = true; runSimsInBackground(D, {}); });

  if (sortBy(S.sort).sims && !shared.sims) { S.sort = 'board'; S.dir = null; sortSel.value = 'board'; }
  syncDir();
  setSimInfo();
  if (shared.running) listener({ progress: 0 });
  draw();
  // The old board ran 100 drafts on every first visit. The tuned draft AI takes about half a second per draft on the
  // main thread, so that froze the screen for about a minute; now the drafts run only when asked.

  return () => {
    io?.disconnect();
    offClear();
    shared.listeners.delete(listener);
  };
}
