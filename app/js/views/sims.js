import { esc, fmt, table } from '../util.js';
import { shared, runSims } from './shared.js';

export function simsView(el, D) {
  el.innerHTML = `
    <h1>Simulations</h1>
    <p class="muted small">Run many full mock drafts with the AI picking for every team, to see each player's landing range and each team's most likely first pick.
    Each run draws who declares, each team's board noise, reaches and trades.</p>
    <div class="row panel">
      <label>Drafts <select id="n"><option>100</option><option selected>200</option><option>500</option><option>1000</option></select></label>
      <label><input type="checkbox" id="all"> Every underclassman declares</label>
      <label><input type="checkbox" id="tr" checked> Trades</label>
      <button class="primary" id="go">Run</button>
      <span id="st" class="muted small"></span>
    </div>
    <div id="out" style="margin-top:12px"></div>`;
  const st = el.querySelector('#st');
  const draw = () => {
    const s = shared.sims;
    const out = el.querySelector('#out');
    if (!s) { out.innerHTML = '<p class="muted">No runs yet.</p>'; return; }
    st.textContent = `${s.n} drafts${s.allDeclare ? ', every underclassman declares' : ''}${s.trades ? '' : ', no trades'}. Round 1 trades per draft: ${s.round1TradesPerDraft.toFixed(1)}.`;
    const rows = s.summary.filter(x => x.drafted > 0.02).map(x => ({ ...x, p: D.prospects[x.i] }));
    const cols = [
      { key: 'mean', label: 'Avg pick', num: true, get: r => r.mean, html: r => fmt.num(r.mean, 1) },
      { key: 'name', label: 'Player', get: r => r.p.name, html: r => `<a href="#player/${r.p.id}">${esc(r.p.name)}</a>` },
      { key: 'pos', label: 'Pos', get: r => r.p.group },
      { key: 'school', label: 'School', get: r => r.p.school },
      { key: 'board', label: 'Board', num: true, get: r => r.p.board_rank },
      { key: 'range', label: 'Range (10-90%)', get: r => r.p10, html: r => `${r.p10}-${r.p90}` },
      { key: 'r1', label: 'Round 1', num: true, get: r => r.r1, html: r => fmt.pct(r.r1) },
      { key: 'dr', label: 'Drafted', num: true, get: r => r.drafted, html: r => fmt.pct(r.drafted) },
      { key: 'teams', label: 'Likely teams', get: r => r.teams[0]?.[1], html: r => r.teams.map(([t, c]) => `${t} ${fmt.pct(c)}`).join(', ') },
    ];
    out.innerHTML = '<h2>Players</h2>';
    out.append(table(cols, rows, { sortKey: 'mean', onRow: r => location.hash = `player/${r.p.id}` }));
    const h = document.createElement('div');
    h.innerHTML = `<h2>Each team's most likely first pick</h2><div class="grid g3">${D.teams.order.map(t => {
      const m = s.firstPick[t] ?? {};
      const top = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 3);
      return `<div class="panel small"><b><a href="#team/${t}">${esc(D.teams.teams[t].name)}</a></b><br>${top.map(([i, c]) => `${esc(D.prospects[+i].name)} ${D.prospects[+i].group} ${fmt.pct(c / s.n)}`).join('<br>')}</div>`;
    }).join('')}</div>`;
    out.append(h);
  };
  const listener = ev => {
    if (!el.querySelector('#out')) { shared.listeners.delete(listener); return; }
    if (ev.progress != null) st.textContent = `Running… ${Math.round(ev.progress * 100)}%`;
    if (ev.done) { el.querySelector('#go').disabled = false; draw(); }
  };
  shared.listeners.add(listener);
  el.querySelector('#go').onclick = () => {
    el.querySelector('#go').disabled = true;
    runSims(D, { n: +el.querySelector('#n').value, allDeclare: el.querySelector('#all').checked, trades: el.querySelector('#tr').checked });
  };
  draw();
}
