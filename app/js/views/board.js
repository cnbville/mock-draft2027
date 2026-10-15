import { esc, fmt, table, CLASS } from '../util.js';
import { store } from '../store.js';
import { shared, runSims } from './shared.js';

export function boardView(el, D) {
  const boards = D.meta.boards;
  const groups = ['All', ...new Set(D.prospects.map(p => p.group))].sort((a, b) => a === 'All' ? -1 : a.localeCompare(b));
  el.innerHTML = `
    <h1>Big board</h1>
    <p class="muted small">The ${D.prospects.length} players most likely to be drafted in April 2027. "Board" is the blend the AI teams start from:
    the consensus of three public boards plus the draft model (the model fills in below the public boards). Click a player for his page.</p>
    <div class="row panel">
      <input id="q" placeholder="Search name or school" size="22">
      <select id="g">${groups.map(g => `<option>${g}</option>`).join('')}</select>
      <select id="lvl"><option>All levels</option><option>Power 4</option><option>Group of 5</option><option>FCS</option></select>
      <label><input type="checkbox" id="onlyBoards"> On a public board</label>
      <span class="spacer"></span>
      <span id="simInfo" class="muted small"></span>
      <button id="runSims">Run 200 mock drafts</button>
    </div>
    <div id="tbl" style="margin-top:10px"></div>`;
  const q = el.querySelector('#q'), g = el.querySelector('#g'), lvl = el.querySelector('#lvl'), ob = el.querySelector('#onlyBoards');
  const sim = i => shared.sims?.summary[D.index.get(D.prospects[i].id)];
  const cols = [
    { key: 'board_rank', label: 'Board', num: true, get: p => p.board_rank },
    { key: 'star', label: '★', get: p => store.onBoard(p.id) ? 1 : 0,
      html: p => `<button class="star" data-id="${p.id}" title="Add to my board">${store.onBoard(p.id) ? '★' : '☆'}</button>` },
    { key: 'name', label: 'Player', get: p => p.name, html: p => `<a href="#player/${p.id}">${esc(p.name)}</a>` },
    { key: 'group', label: 'Pos', get: p => p.group, html: p => `<span class="pos">${p.group}</span>` },
    { key: 'school', label: 'School', get: p => p.school },
    { key: 'class', label: 'Class', get: p => p.class_year, html: p => CLASS[p.class_year] ?? '–' },
    { key: 'ht', label: 'Ht', num: true, get: p => p.height, html: p => fmt.ht(p.height) },
    { key: 'wt', label: 'Wt', num: true, get: p => p.weight },
    { key: 'cons', label: 'Consensus', num: true, get: p => p.consensus_rank },
    ...boards.map((b, k) => ({ key: 'b' + k, label: b.short, num: true, get: p => p.board_ranks[b.label] })),
    { key: 'model', label: 'Model', num: true, get: p => p.model_rank },
    { key: 'pd', label: 'Declare', num: true, get: p => p.p_declare, html: p => fmt.pct(p.p_declare) },
    { key: 'sim', label: 'Mock range', num: true, get: p => sim(D.index.get(p.id))?.p50,
      html: p => { const s = sim(D.index.get(p.id)); return s && s.p50 ? `${s.p10}-${s.p90}` : '–'; } },
    { key: 'r1', label: 'Rd 1', num: true, get: p => sim(D.index.get(p.id))?.r1, html: p => { const s = sim(D.index.get(p.id)); return s ? fmt.pct(s.r1) : '–'; } },
    { key: 'flags', label: 'Flags', num: true, get: p => p.flags.length, html: p => p.flags.length ? `<span class="warn" title="${esc(p.flags.join('\n'))}">⚑ ${p.flags.length}</span>` : '' },
  ];
  const draw = () => {
    const s = q.value.trim().toLowerCase();
    const rows = D.prospects.filter(p =>
      (g.value === 'All' || p.group === g.value) && (lvl.value === 'All levels' || p.level === lvl.value) &&
      (!ob.checked || p.consensus_rank) && (!s || p.name.toLowerCase().includes(s) || p.school.toLowerCase().includes(s)));
    const t = table(cols, rows, { onRow: p => location.hash = `player/${p.id}`, sortKey: 'board_rank' });
    t.addEventListener('click', e => {
      const b = e.target.closest('.star');
      if (!b) return;
      const id = +b.dataset.id;
      store.onBoard(id) ? store.remove(id) : store.add(id);
      b.textContent = store.onBoard(id) ? '★' : '☆';
    });
    const box = el.querySelector('#tbl');
    box.innerHTML = '';
    box.append(t);
  };
  [q, g, lvl, ob].forEach(x => x.oninput = draw);
  const info = el.querySelector('#simInfo');
  const btn = el.querySelector('#runSims');
  const setInfo = () => info.textContent = shared.sims ? `Mock ranges from ${shared.sims.n} simulated drafts.` : 'No mock drafts run yet.';
  const listener = ev => {
    if (!el.querySelector('#tbl')) { shared.listeners.delete(listener); return; }
    if (ev.progress != null) info.textContent = `Running… ${Math.round(ev.progress * 100)}%`;
    if (ev.done) { setInfo(); draw(); btn.disabled = false; }
  };
  shared.listeners.add(listener);
  btn.onclick = () => { btn.disabled = true; runSims(D); };
  setInfo();
  draw();
  if (!shared.sims && !shared.running) { btn.disabled = true; runSims(D, { n: 100 }); }
}
