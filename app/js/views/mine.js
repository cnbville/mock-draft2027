// My Board: the user's own ranking. Drag to reorder (mouse, pen or touch, by the handle), arrow keys on the
// handle, a typed rank, or the row menu. Tier breaks sit above a player and move with him (as before).
// Side panel: where you disagree most with the consensus, and your board by position.
// Toolbar: add the consensus top 100, export (platform.saveFile), import, and clear (with a confirmation and undo).
import { h, icon, toast, bottomSheet, on, $ } from '../ui/dom.js';
import { face } from '../ui/face.js';
import { schoolArt, roomColors, playerStyle } from '../ui/art.js';
import { classShort, posName, POS_ORDER, num, plural } from '../ui/fmt.js';
import { posPill, kpis, src } from '../ui/parts.js';
import { saveFile } from '../platform.js';
import { store } from '../store.js';

const EMPTY_LIGHT = ['#2a3f8f', '#d4a72c']; // the room's colours with nothing on the board (picked by Claude)
const blank = v => v === '' || v == null;

function gradeAvg(id) {
  const g = Object.values(store.get().grades[id] ?? {}).filter(v => !blank(v)).map(Number);
  return g.length ? g.reduce((a, b) => a + b, 0) / g.length : null;
}

export function view(el, D) {
  let drag = null;           // the drag in progress
  let pendingFocus = null;   // [id, selector] to focus after a redraw

  const list = () => store.get().board.map(id => D.byId.get(id)).filter(Boolean);
  const live = msg => { const r = $('#mineLive', el); if (r) r.textContent = msg; };

  const draw = () => {
    if (drag) return;
    const me = store.get();
    const ps = list();
    const top = ps[0];
    if (top) { const s = schoolArt(top.school); roomColors(el, s.c1, s.c2); } else roomColors(el, ...EMPTY_LIGHT);
    el.innerHTML = String(h`<div class="room" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="page below-top">
        <header class="screen-head">
          <p class="label">My Board</p>
          <h1 class="screen-title">Your ranking</h1>
          <p class="lede">${ps.length ? 'Drag players into your order, or type a rank. Add tier breaks and notes from a row’s menu. Saved on this device. Export it to keep a copy or move it to another computer.'
            : 'Rank the 2027 class your way. Your order, tiers, grades and notes stay on this device.'}</p>
        </header>
        ${ps.length ? toolbar(ps, me) : ''}
        ${ps.length ? h`<div class="mine-grid">
          <section class="mine-main" aria-label="Your ranking">
            <ol class="mine-list" id="mineList">${ps.map((p, i) => item(p, i, me))}</ol>
          </section>
          <aside class="mine-side">${disagree(ps)}${byPos(ps)}</aside>
        </div>` : emptyState()}
        <p class="sr" id="mineLive" aria-live="polite"></p>
        <input type="file" id="mineFile" accept=".json,application/json" hidden>
      </div>`);
    if (pendingFocus) {
      const [id, sel] = pendingFocus;
      pendingFocus = null;
      el.querySelector(`.mine-item[data-id="${id}"] ${sel}`)?.focus({ preventScroll: false });
    }
  };

  // ---------- actions ----------
  const idOf = t => +t.closest('[data-id]')?.dataset.id;
  const nameOf = id => D.byId.get(id)?.name ?? 'This player';
  const moveTo = (id, to, focusSel) => {
    const n = store.get().board.length;
    to = Math.max(0, Math.min(n - 1, to));
    store.move(id, to);
    if (focusSel) pendingFocus = [id, focusSel];
    draw();
    live(`${nameOf(id)} is now number ${to + 1}.`);
  };
  const snapshot = () => store.exportJSON();
  const restore = (text, msg) => { try { store.importJSON(text); draw(); toast(msg); } catch (e) { toast('That could not be undone.'); } };

  const fillTop = () => {
    const before = store.get().board.length;
    D.prospects.filter(p => p.consensus_rank).sort((a, b) => a.consensus_rank - b.consensus_rank).slice(0, 100).forEach(p => store.add(p.id));
    const added = store.get().board.length - before;
    draw();
    toast(added ? `Added ${plural(added, 'player')} from the consensus top 100.` : 'The consensus top 100 is already on your board.');
  };

  const exportBoard = async () => {
    const text = store.exportJSON();
    const name = `my-board-${new Date().toISOString().slice(0, 10)}.json`;
    let res = null;
    try { res = await saveFile(name, text, 'application/json'); } catch (e) { res = null; }
    toast(typeof res === 'string' ? `Saved to ${res}.` : 'Your board was saved as a file.', { action: { label: 'Show as text', run: () => showText(text) } });
  };

  const showText = text => {
    const bs = bottomSheet({
      label: 'Your board as text',
      content: String(h`<div class="mine-sheet"><h3>Your board as text</h3><p class="note">If no file was saved, copy this into a .json file. Import it on My Board to bring it back.</p>
        <textarea class="input mine-json" readonly rows="8">${text}</textarea>
        <div class="actions"><button class="btn small primary" type="button" data-copy>${icon('check')}Copy</button><button class="btn small ghost" type="button" data-close>Done</button></div></div>`),
    });
    const ta = bs.body.querySelector('textarea');
    bs.body.querySelector('[data-copy]').onclick = async () => {
      try { await navigator.clipboard.writeText(text); toast('Copied.'); } catch (e) { ta.select(); toast('Select the text and copy it.'); }
    };
    bs.body.querySelector('[data-close]').onclick = () => bs.close();
  };

  const importFile = async file => {
    if (!file) return;
    const before = snapshot();
    try {
      store.importJSON(await file.text());
      draw();
      toast(`Imported ${plural(store.get().board.length, 'player')}.`, { action: { label: 'Undo', run: () => restore(before, 'Your earlier board is back.') } });
    } catch (e) {
      toast(`Import failed: ${e instanceof SyntaxError ? 'that file is not readable JSON.' : e.message}`);
    }
  };

  const confirmReset = () => {
    const me = store.get();
    const graded = Object.keys(me.grades).filter(id => Object.keys(me.grades[id] ?? {}).length).length;
    const noted = Object.values(me.notes).filter(t => String(t ?? '').trim()).length;
    const bs = bottomSheet({
      label: 'Clear my board',
      initialFocus: '[data-keep]',
      content: String(h`<div class="mine-sheet"><h3>Clear everything?</h3>
        <p>This clears your ranking (${plural(me.board.length, 'player')}), tiers, notes (${num(noted)}), trait grades (${plural(graded, 'player')}), combine entries, reports and flags on this device.</p>
        <p class="note">Export first if you want a copy. You can undo right after.</p>
        <div class="actions"><button class="btn small danger" type="button" data-clear>${icon('trash')}Clear everything</button><button class="btn small" type="button" data-keep>Keep my board</button></div></div>`),
    });
    bs.body.querySelector('[data-keep]').onclick = () => bs.close();
    bs.body.querySelector('[data-clear]').onclick = () => {
      const before = snapshot();
      store.reset();
      bs.close();
      draw();
      toast('Your board was cleared.', { action: { label: 'Undo', run: () => restore(before, 'Your board is back.') }, ms: 8000 });
    };
  };

  const editNote = id => {
    const p = D.byId.get(id);
    const bs = bottomSheet({
      label: `Note on ${p.name}`,
      initialFocus: 'textarea',
      content: String(h`<div class="mine-sheet"><h3>Note on ${p.name}</h3>
        <textarea class="input mine-note-in" rows="6" placeholder="What you see on film, questions to check…" aria-label="Note on ${p.name}">${store.get().notes[id] ?? ''}</textarea>
        <div class="actions"><button class="btn small primary" type="button" data-save>Save note</button><a class="btn small ghost" href="#player/${id}" data-close>Open his notebook</a></div></div>`),
      onClose: () => { pendingFocus = [id, '.mine-more']; draw(); },
    });
    const ta = bs.body.querySelector('textarea');
    ta.addEventListener('input', () => store.setNote(id, ta.value));
    bs.body.querySelector('[data-save]').onclick = () => { store.setNote(id, ta.value); bs.close(); toast('Note saved.'); };
    bs.body.querySelector('[data-close]').onclick = () => bs.close();
  };

  const startTier = id => {
    const n = Object.keys(store.get().tiers).length + 1;
    store.setTier(id, `Tier ${n}`);
    pendingFocus = [id, '.mine-tier input'];
    draw();
    const inp = el.querySelector(`.mine-item[data-id="${id}"] .mine-tier input`);
    inp?.select();
  };

  const menu = id => {
    const p = D.byId.get(id);
    const i = store.get().board.indexOf(id);
    const tier = store.get().tiers[id];
    const bs = bottomSheet({
      label: `${p.name}: options`,
      content: String(h`<div class="mine-sheet"><h3>${i + 1}. ${p.name}</h3>
        <div class="menu">
          <button type="button" data-m="top" ${i === 0 ? 'disabled' : ''}>${icon('up')}Move to the top</button>
          <button type="button" data-m="up" ${i === 0 ? 'disabled' : ''}>${icon('up')}Move up one</button>
          <button type="button" data-m="down">${icon('down')}Move down one</button>
          <button type="button" data-m="bottom">${icon('down')}Move to the bottom</button>
          <button type="button" data-m="tier">${icon('list')}${tier ? 'Remove the tier break above him' : 'Start a tier with him'}</button>
          <button type="button" data-m="note">${icon('info')}${store.get().notes[id]?.trim() ? 'Edit the note' : 'Write a note'}</button>
          <a href="#player/${id}" data-m="open">${icon('right')}Open his player page</a>
          <button type="button" data-m="remove">${icon('trash')}Remove from my board</button>
        </div></div>`),
      onClose: reason => { if (reason !== 'code') { pendingFocus = [id, '.mine-more']; draw(); } },
    });
    bs.body.addEventListener('click', e => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      const m = b.dataset.m;
      if (m === 'open') { bs.close('code'); return; }
      e.preventDefault();
      bs.close('code');
      const n = store.get().board.length;
      if (m === 'top') moveTo(id, 0, '.mine-more');
      else if (m === 'up') moveTo(id, i - 1, '.mine-more');
      else if (m === 'down') moveTo(id, i + 1, '.mine-more');
      else if (m === 'bottom') moveTo(id, n - 1, '.mine-more');
      else if (m === 'tier') { if (tier) { store.setTier(id, ''); pendingFocus = [id, '.mine-more']; draw(); toast('Tier break removed.'); } else startTier(id); }
      else if (m === 'note') editNote(id);
      else if (m === 'remove') removeOne(id);
    });
  };

  const removeOne = id => {
    const me = store.get();
    const i = me.board.indexOf(id), tier = me.tiers[id];
    store.remove(id);
    draw();
    document.dispatchEvent(new CustomEvent('md:board', { detail: { id, on: false, from: 'mine' } }));
    toast(`${nameOf(id)} was removed.`, { action: { label: 'Undo', run: () => { store.add(id); store.move(id, i); if (tier) store.setTier(id, tier); draw(); document.dispatchEvent(new CustomEvent('md:board', { detail: { id, on: true, from: 'mine' } })); } } });
  };

  // ---------- events (delegated on the section, which lives as long as the view) ----------
  const offs = [
    on(el, 'click', '#mineFill, [data-fill]', fillTop),
    on(el, 'click', '#mineExport', exportBoard),
    on(el, 'click', '#mineImport, [data-import]', () => { const f = $('#mineFile', el); f.value = ''; f.click(); }),
    on(el, 'change', '#mineFile', (e, f) => importFile(f.files?.[0])),
    on(el, 'click', '#mineReset', confirmReset),
    on(el, 'click', '.mine-up', (e, b) => { const id = idOf(b); moveTo(id, store.get().board.indexOf(id) - 1, '.mine-up'); }),
    on(el, 'click', '.mine-down', (e, b) => { const id = idOf(b); moveTo(id, store.get().board.indexOf(id) + 1, '.mine-down'); }),
    on(el, 'click', '.mine-more', (e, b) => menu(idOf(b))),
    on(el, 'click', '.mine-tier-x', (e, b) => { const id = idOf(b); const t = store.get().tiers[id]; store.setTier(id, ''); draw(); toast('Tier break removed.', { action: { label: 'Undo', run: () => { store.setTier(id, t); draw(); } } }); }),
    on(el, 'change', '.mine-tier input', (e, i) => { const id = idOf(i); const v = i.value.trim(); store.setTier(id, v || 'Tier'); if (!v) i.value = 'Tier'; }),
    on(el, 'keydown', '.mine-tier input, .mine-rank', (e, i) => { if (e.key === 'Enter') { e.preventDefault(); i.blur(); } if (e.key === 'Escape' && i.classList.contains('mine-rank')) { i.value = store.get().board.indexOf(idOf(i)) + 1; i.blur(); } }),
    on(el, 'focusin', '.mine-rank', (e, i) => i.select()),
    on(el, 'change', '.mine-rank', (e, i) => {
      const id = idOf(i), n = parseInt(i.value, 10);
      if (Number.isNaN(n)) { i.value = store.get().board.indexOf(id) + 1; return; }
      moveTo(id, n - 1);
      el.querySelector(`.mine-item[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
    }),
    // keyboard on the handle: arrows move one place, Page Up/Down five, Home/End to the ends
    on(el, 'keydown', '.mine-handle', (e, b) => {
      const id = idOf(b), i = store.get().board.indexOf(id), n = store.get().board.length;
      const to = { ArrowUp: i - 1, ArrowDown: i + 1, PageUp: i - 5, PageDown: i + 5, Home: 0, End: n - 1 }[e.key];
      if (to == null) return;
      e.preventDefault();
      if (Math.max(0, Math.min(n - 1, to)) !== i) moveTo(id, to, '.mine-handle');
    }),
    on(el, 'pointerdown', '.mine-handle', (e, b) => startDrag(e, b)),
  ];

  // ---------- drag to reorder (pointer events: mouse, pen and touch) ----------
  function startDrag(e, handle) {
    if (e.button > 0 || drag) return;
    const listEl = el.querySelector('#mineList');
    const item = handle.closest('.mine-item');
    const items = [...listEl.children];
    const from = items.indexOf(item);
    if (from < 0) return;
    e.preventDefault();
    const rects = items.map(n => n.getBoundingClientRect());
    const gap = parseFloat(getComputedStyle(listEl).rowGap) || 0;
    drag = { item, items, rects, from, to: from, y0: e.clientY, sy0: scrollY, y: e.clientY, shift: rects[from].height + gap, raf: 0, moved: false, id: +item.dataset.id };
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* already released */ }
    item.classList.add('dragging');
    listEl.classList.add('sorting');
    const move = ev => { drag.y = ev.clientY; layout(); };
    const end = ev => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      cancelAnimationFrame(drag.raf);
      const d = drag;
      drag = null;
      if (ev.type === 'pointerup' && d.to !== d.from) { pendingFocus = [d.id, '.mine-handle']; store.move(d.id, d.to); draw(); live(`${nameOf(d.id)} is now number ${d.to + 1}.`); }
      else { d.items.forEach(n => { n.style.transform = ''; }); d.item.classList.remove('dragging'); listEl.classList.remove('sorting'); }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    const tick = () => {
      if (!drag) return;
      const edge = 90, y = drag.y;
      const v = y < edge ? -(edge - y) / 4 : y > innerHeight - edge ? (y - (innerHeight - edge)) / 4 : 0;
      if (v) { scrollBy(0, v); layout(); }
      drag.raf = requestAnimationFrame(tick);
    };
    drag.raf = requestAnimationFrame(tick);
  }

  function layout() {
    const d = drag;
    if (!d) return;
    const dy = d.y - d.y0 + (scrollY - d.sy0);
    const r = d.rects[d.from];
    const center = r.top + r.height / 2 + dy;
    let to = d.from;
    d.items.forEach((n, i) => {
      if (i === d.from) return;
      const mid = d.rects[i].top + d.rects[i].height / 2;
      let t = 0;
      if (i < d.from && center < mid) { t = d.shift; to = Math.min(to, i); }
      else if (i > d.from && center > mid) { t = -d.shift; to = Math.max(to, i); }
      n.style.transform = t ? `translateY(${t}px)` : '';
    });
    d.to = to;
    d.item.style.transform = `translateY(${dy}px)`;
  }

  const onBoard = e => { if (e.detail?.from !== 'mine') draw(); };
  document.addEventListener('md:board', onBoard);
  draw();
  return () => {
    offs.forEach(f => f());
    document.removeEventListener('md:board', onBoard);
    if (drag) cancelAnimationFrame(drag.raf);
    drag = null;
  };
}

// ---------- pieces ----------
function toolbar(ps, me) {
  const tiers = ps.filter(p => me.tiers[p.id]).length;
  const graded = ps.filter(p => gradeAvg(p.id) != null).length;
  const noted = ps.filter(p => String(me.notes[p.id] ?? '').trim()).length;
  return h`<div class="mine-bar">
    ${kpis([{ value: ps.length, label: ps.length === 1 ? 'Player' : 'Players' }, { value: tiers, label: tiers === 1 ? 'Tier break' : 'Tier breaks' }, { value: graded, label: 'Graded' }, { value: noted, label: 'With notes' }], { cols: 4 })}
    <div class="actions">
      <button class="btn small glass" type="button" id="mineFill">${icon('plus')}Add the consensus top 100</button>
      <button class="btn small glass" type="button" id="mineExport">${icon('download')}Export</button>
      <button class="btn small glass" type="button" id="mineImport">${icon('upload')}Import</button>
      <button class="btn small ghost" type="button" id="mineReset">${icon('trash')}Clear</button>
    </div>
  </div>`;
}

function item(p, i, me) {
  const tier = me.tiers[p.id];
  const cons = p.consensus_rank ?? p.board_rank;
  const d = cons - (i + 1);
  const avg = gradeAvg(p.id);
  const note = String(me.notes[p.id] ?? '').trim();
  const dTxt = d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '0';
  const dHelp = d > 0 ? `You rank him ${d} higher than the ${p.consensus_rank ? 'consensus' : "draft AI's board"}` : d < 0 ? `You rank him ${-d} lower than the ${p.consensus_rank ? 'consensus' : "draft AI's board"}` : 'Same as the consensus';
  return h`<li class="mine-item" data-id="${p.id}">
    ${tier ? h`<div class="mine-tier"><span class="mine-tier-line" aria-hidden="true"></span><input class="mine-tier-in" value="${tier}" aria-label="Name of the tier that starts with ${p.name}" maxlength="40"><button class="icon-btn clear mine-tier-x" type="button" aria-label="Remove the tier break above ${p.name}">${icon('close')}</button></div>` : ''}
    <div class="mine-row" style="${playerStyle(p)}">
      <button class="mine-handle" type="button" aria-label="Move ${p.name}, now number ${i + 1}. Drag, or use the arrow keys." title="Drag to move">${icon('drag')}</button>
      <input class="mine-rank" type="text" inputmode="numeric" value="${i + 1}" aria-label="Rank of ${p.name}. Type a new rank." autocomplete="off">
      ${face(p, 'round')}
      <span class="who"><a class="stretch" href="#player/${p.id}">${p.name}</a><small>${p.group} · ${p.school} · ${classShort(p.class_year)}</small>${note ? h`<small class="mine-note">${note}</small>` : ''}</span>
      <span class="mine-cols">
        <span class="col mw"><b>${p.consensus_rank ?? '–'}</b>Consensus</span>
        <span class="col mw"><b>${p.model_rank}</b>Model</span>
        <span class="col diff"><b class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}" title="${dHelp}">${dTxt}</b>Diff</span>
        <span class="col mw"><b>${avg != null ? num(avg, 1) : '–'}</b>Grade</span>
      </span>
      <span class="mine-acts">
        <button class="icon-btn clear mine-up" type="button" aria-label="Move ${p.name} up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
        <button class="icon-btn clear mine-down" type="button" aria-label="Move ${p.name} down">${icon('down')}</button>
        <button class="icon-btn clear mine-more" type="button" aria-label="More for ${p.name}" aria-haspopup="dialog">${icon('more')}</button>
      </span>
    </div>
  </li>`;
}

function disagree(ps) {
  const rows = ps.map((p, i) => ({ p, mine: i + 1, cons: p.consensus_rank ?? p.board_rank }))
    .map(x => ({ ...x, d: x.cons - x.mine })).filter(x => x.d !== 0)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 8);
  return h`<section class="mine-panel glass" aria-labelledby="mineDisH">
    <h2 id="mineDisH">Where you disagree most</h2>
    ${rows.length ? h`<ul class="mine-dis">${rows.map(x => h`<li style="${playerStyle(x.p)}">
      ${face(x.p, 'round')}
      <span class="who"><a class="stretch" href="#player/${x.p.id}">${x.p.name}</a><small>You ${x.mine} · ${x.p.consensus_rank ? 'Consensus' : 'AI board'} ${x.cons}</small></span>
      <span class="pill ${x.d > 0 ? 'good' : 'bad'}">${x.d > 0 ? `${x.d} higher` : `${-x.d} lower`}</span></li>`)}</ul>`
      : h`<p class="note">Your order matches the consensus so far. Move players to see where you differ.</p>`}
    ${src('computed', 'Your rank against the consensus of the public boards')}
  </section>`;
}

function byPos(ps) {
  const m = new Map();
  ps.forEach((p, i) => { if (!m.has(p.group)) m.set(p.group, []); m.get(p.group).push([i + 1, p]); });
  const groups = [...m.keys()].sort((a, b) => POS_ORDER.indexOf(a) - POS_ORDER.indexOf(b));
  return h`<section class="mine-panel glass" aria-labelledby="minePosH">
    <h2 id="minePosH">By position</h2>
    <ul class="mine-pos">${groups.map(g => {
      const xs = m.get(g);
      return h`<li><div class="mine-pos-h">${posPill(g)}<b>${posName(g)}</b><small>${xs.length}</small></div>
        <p>${xs.slice(0, 5).map(([n, p], k) => h`${k ? ', ' : ''}<a href="#player/${p.id}"><span class="tnum">${n}.</span> ${p.name}</a>`)}${xs.length > 5 ? ` and ${xs.length - 5} more` : ''}</p></li>`;
    })}</ul>
  </section>`;
}

function emptyState() {
  return h`<section class="mine-empty glass" aria-labelledby="mineEmptyH">
    <span class="onum" aria-hidden="true">1</span>
    <div class="mine-empty-in">
      <h2 id="mineEmptyH" class="wide">Build your own board</h2>
      <p>Start from the consensus and reorder it, or pick players one by one. See where you differ from the experts.</p>
      <div class="actions">
        <button class="btn primary" type="button" data-fill>${icon('plus')}Start from the consensus top 100</button>
        <a class="btn glass" href="#board">${icon('list')}Pick players on the Big Board</a>
        <button class="btn ghost" type="button" data-import>${icon('upload')}Import a board</button>
      </div>
      <ol class="mine-steps">
        <li><b>1</b><span>Add players with the star on the Big Board or a player page.</span></li>
        <li><b>2</b><span>Drag them into your order, or type a rank.</span></li>
        <li><b>3</b><span>Add tier breaks and notes. Export to keep a copy.</span></li>
      </ol>
    </div>
  </section>`;
}
