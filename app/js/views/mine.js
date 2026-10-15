import { esc, download, CLASS } from '../util.js';
import { store } from '../store.js';

export function mineView(el, D) {
  const me = store.get();
  const list = me.board.map(id => D.byId.get(id)).filter(Boolean);
  const diffs = list.map((p, i) => ({ p, mine: i + 1, cons: p.consensus_rank ?? p.board_rank }))
    .map(x => ({ ...x, d: x.cons - x.mine })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 8);
  el.innerHTML = `
    <h1>My board</h1>
    <p class="muted small">Drag players to reorder, or type a new rank. Add a tier break above a player to group your tiers.
    Add players with the ☆ on the big board or a player page. Saved in this browser; export it to keep a copy or move it to another computer.</p>
    <div class="row panel">
      <button id="fill">Start from the consensus top 100</button>
      <button id="exp">Export my board</button>
      <label class="small">Import <input type="file" id="imp" accept=".json"></label>
      <span class="spacer"></span>
      <button id="clear">Clear my board</button>
    </div>
    <div id="msg" class="small" style="margin-top:6px"></div>
    ${list.length ? `<div class="grid g2" style="margin-top:12px;grid-template-columns:2fr 1fr">
      <div class="tablewrap"><table><thead><tr><th class="num">Mine</th><th>Player</th><th>Pos</th><th>School</th><th>Class</th>
        <th class="num">Consensus</th><th class="num">Model</th><th class="num">Diff</th><th>Grade avg</th><th>Tier</th><th></th></tr></thead>
      <tbody id="rows">${list.map((p, i) => row(p, i, me)).join('')}</tbody></table></div>
      <div class="panel"><h2 style="margin-top:0">Where you disagree most</h2>
        ${diffs.map(x => `<div><a href="#player/${x.p.id}">${esc(x.p.name)}</a>: you #${x.mine}, consensus #${x.cons}
          <span class="${x.d > 0 ? 'good' : 'bad'}">${x.d > 0 ? 'you are higher by ' + x.d : 'you are lower by ' + -x.d}</span></div>`).join('')}
        <h2>By position</h2>
        ${byPos(list)}
      </div></div>` : '<p class="panel" style="margin-top:12px">Your board is empty.</p>'}`;

  el.querySelector('#fill').onclick = () => {
    D.prospects.filter(p => p.consensus_rank).sort((a, b) => a.consensus_rank - b.consensus_rank).slice(0, 100).forEach(p => store.add(p.id));
    mineView(el, D);
  };
  el.querySelector('#exp').onclick = () => {
    const text = store.exportJSON();
    download(`my-board-${new Date().toISOString().slice(0, 10)}.json`, text);
    // Where downloads are blocked (a hosted preview), show the text to copy instead.
    el.querySelector('#msg').innerHTML = `If no file was saved, copy this into a .json file:<br><textarea id="expText" rows="5" style="width:100%">${esc(text)}</textarea>`;
  };
  el.querySelector('#imp').onchange = async e => {
    try { store.importJSON(await e.target.files[0].text()); mineView(el, D); } catch (err) { el.querySelector('#msg').textContent = `Import failed: ${err.message}`; }
  };
  el.querySelector('#clear').onclick = e => {
    // Two clicks: the first asks, the second clears.
    if (e.target.dataset.armed) { store.reset(); mineView(el, D); return; }
    e.target.dataset.armed = '1';
    e.target.textContent = 'Click again to clear your board, notes and grades';
  };

  const tbody = el.querySelector('#rows');
  if (!tbody) return;
  let dragId = null;
  tbody.querySelectorAll('tr[data-id]').forEach(tr => {
    tr.draggable = true;
    tr.ondragstart = () => { dragId = +tr.dataset.id; };
    tr.ondragover = e => { e.preventDefault(); tr.classList.add('dragover'); };
    tr.ondragleave = () => tr.classList.remove('dragover');
    tr.ondrop = e => {
      e.preventDefault();
      const to = store.get().board.indexOf(+tr.dataset.id);
      store.move(dragId, to);
      mineView(el, D);
    };
  });
  tbody.querySelectorAll('input[data-rank]').forEach(i => i.onchange = () => { store.move(+i.dataset.rank, (+i.value || 1) - 1); mineView(el, D); });
  tbody.querySelectorAll('input[data-tier]').forEach(i => i.onchange = () => { store.setTier(+i.dataset.tier, i.value.trim()); mineView(el, D); });
  tbody.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { store.remove(+b.dataset.rm); mineView(el, D); });
}

function row(p, i, me) {
  const g = Object.values(me.grades[p.id] ?? {}).filter(v => v !== '');
  const avg = g.length ? (g.reduce((a, b) => a + +b, 0) / g.length).toFixed(1) : '–';
  const cons = p.consensus_rank ?? p.board_rank;
  const d = cons - (i + 1);
  const tier = me.tiers[p.id];
  return `${tier ? `<tr class="tier"><td colspan="11">${esc(tier)}</td></tr>` : ''}
  <tr data-id="${p.id}" class="drag"><td class="num"><input data-rank="${p.id}" value="${i + 1}" size="3"></td>
  <td><a href="#player/${p.id}">${esc(p.name)}</a></td><td><span class="pos">${p.group}</span></td><td>${esc(p.school)}</td><td>${CLASS[p.class_year] ?? '–'}</td>
  <td class="num">${p.consensus_rank ?? '–'}</td><td class="num">${p.model_rank}</td>
  <td class="num ${d > 0 ? 'good' : d < 0 ? 'bad' : ''}">${d > 0 ? '+' + d : d}</td><td>${avg}</td>
  <td><input data-tier="${p.id}" value="${esc(tier ?? '')}" placeholder="tier break" size="9"></td>
  <td><button data-rm="${p.id}" title="Remove">✕</button></td></tr>`;
}

function byPos(list) {
  const m = {};
  list.forEach((p, i) => (m[p.group] ??= []).push(`${i + 1}. ${esc(p.name)}`));
  return Object.entries(m).map(([g, xs]) => `<div><b>${g}</b>: ${xs.slice(0, 5).join(', ')}${xs.length > 5 ? ` and ${xs.length - 5} more` : ''}</div>`).join('');
}
