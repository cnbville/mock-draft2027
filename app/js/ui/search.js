// The top bar search: players and teams, with a dropdown of results.
// Keys: "/" or Cmd/Ctrl+K focuses it, arrows move, Enter opens, Esc clears and closes.
// On narrow windows it is a round button that opens into a field.

import { $, h, icon } from './dom.js';
import { face } from './face.js';
import { logo, teamArt } from './art.js';
import { rank } from './fmt.js';

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// 0 best ... 5 worst, null = no match
function scoreText(text, q, toks) {
  if (!text) return null;
  if (text === q) return 0;
  if (text.startsWith(q)) return 0.5;
  const words = text.split(' ');
  if (toks.every(t => words.some(w => w.startsWith(t)))) return 1;
  if (text.includes(q)) return 2;
  return null;
}

export function initSearch(D) {
  const box = $('#search'), input = $('#q'), res = $('#qres'), btn = $('#searchBtn'), cancel = $('#searchCancel');
  if (!box || !input || !res) return;

  const players = D.prospects.map(p => ({ p, n: norm(p.name), s: norm(p.school), t: norm(p.teams?.split('|').join(' ')),
    all: norm(`${p.name} ${p.group} ${p.teams?.split('|').join(' ') ?? p.school}`) }));
  const firstPick = {};
  for (const pk of D.teams.picks ?? []) if (pk.round === 1 && firstPick[pk.owner] == null) firstPick[pk.owner] = pk.slot;
  const teams = Object.values(D.teams.teams ?? {}).map(t => {
    const a = teamArt(t.abbr);
    return { t, a, n: norm(a.name), k: norm(a.nick), ab: t.abbr.toLowerCase() };
  });

  let items = [], active = -1;

  function find(raw) {
    const q = norm(raw);
    if (!q) return { players: [], teams: [] };
    const toks = q.split(' ');
    const ps = [];
    for (const x of players) {
      let sc = scoreText(x.n, q, toks);
      if (sc == null) { const s = scoreText(x.s, q, toks) ?? scoreText(x.t, q, toks); if (s != null) sc = 3 + s / 2; }
      // "qb texas", "smith ohio": every word matches the start of a word in name, position or school
      if (sc == null && toks.length > 1) { const w = x.all.split(' '); if (toks.every(t => w.some(v => v.startsWith(t)))) sc = 2.5; }
      if (sc != null) ps.push([sc, x.p.board_rank ?? 9999, x.p]);
    }
    ps.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const ts = [];
    for (const x of teams) {
      let sc = x.ab === q ? 0 : scoreText(x.k, q, toks) ?? scoreText(x.n, q, toks);
      if (sc != null) ts.push([sc, x]);
    }
    ts.sort((a, b) => a[0] - b[0]);
    return { players: ps.slice(0, 6), teams: ts.slice(0, 4), bestP: ps[0]?.[0] ?? 9, bestT: ts[0]?.[0] ?? 9 };
  }

  function render() {
    const q = input.value;
    const f = find(q);
    items = [];
    const teamHtml = f.teams.length ? h`<p class="qgroup">Teams</p>${f.teams.map(([, x]) => {
      const i = items.push({ href: `#team/${x.t.abbr}` }) - 1;
      const slot = firstPick[x.t.abbr];
      return h`<a class="qopt" role="option" id="qo-${i}" href="#team/${x.t.abbr}" aria-selected="false">${logo(x.t.abbr, 36)}<span><b>${x.a.name}</b><small>${x.t.division ?? ''}${x.t.record ? ` · ${x.t.record}` : ''}</small></span><em>${slot ? `Pick ${slot}` : ''}</em></a>`;
    })}` : '';
    const playerHtml = f.players.length ? h`<p class="qgroup">Players</p>${f.players.map(([, , p]) => {
      const i = items.push({ href: `#player/${p.id}` }) - 1;
      return h`<a class="qopt" role="option" id="qo-${i}" href="#player/${p.id}" aria-selected="false">${face(p, 'round')}<span><b>${p.name}</b><small>${p.group} · ${p.school}</small></span><em>${p.consensus_rank ? rank(p.consensus_rank) : `Board ${p.board_rank}`}</em></a>`;
    })}` : '';
    // the stronger kind of match goes first
    const first = f.bestT < f.bestP ? [teamHtml, playerHtml] : [playerHtml, teamHtml];
    if (!first[0] && !first[1]) {
      res.innerHTML = String(h`<p class="qnone">No players or teams match “${q.trim()}”.</p>`);
    } else {
      res.innerHTML = String(h`${first[0]}${first[1]}`);
      // ids follow the visual order for keyboard moves
      [...res.querySelectorAll('.qopt')].forEach((a, i) => { a.id = `qo-${i}`; items[i] = { href: a.getAttribute('href') }; });
    }
    active = -1;
    show(!!q.trim());
  }

  function show(on) {
    res.hidden = !on;
    input.setAttribute('aria-expanded', String(on));
    if (!on) input.removeAttribute('aria-activedescendant');
  }

  function move(d) {
    const opts = [...res.querySelectorAll('.qopt')];
    if (!opts.length) return;
    active = (active + d + opts.length) % opts.length;
    opts.forEach((o, i) => o.setAttribute('aria-selected', String(i === active)));
    input.setAttribute('aria-activedescendant', opts[active].id);
    opts[active].scrollIntoView({ block: 'nearest' });
  }

  function done() {
    input.value = '';
    show(false);
    box.classList.remove('open');
    input.blur();
  }

  function go(href) {
    if (!href) return;
    done();
    if (location.hash === href) return;
    location.hash = href;
  }

  function open() {
    box.classList.add('open');
    input.focus(); // at once, so the first key typed lands in the field
  }

  input.addEventListener('input', render);
  input.addEventListener('focus', () => { box.classList.add('open'); if (input.value.trim()) show(true); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (res.hidden && input.value.trim()) show(true); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const opts = [...res.querySelectorAll('.qopt')];
      go((opts[active] ?? opts[0])?.getAttribute('href'));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (input.value) { input.value = ''; show(false); } else done();
    }
  });
  res.addEventListener('mousedown', e => { if (e.target.closest('.qopt')) e.preventDefault(); }); // keep focus while clicking
  res.addEventListener('click', e => {
    const a = e.target.closest('.qopt');
    if (!a) return;
    e.preventDefault();
    go(a.getAttribute('href'));
  });
  box.addEventListener('focusout', e => {
    if (box.contains(e.relatedTarget)) return;
    show(false);
    if (!input.value) box.classList.remove('open');
  });
  btn?.addEventListener('click', () => { if (box.classList.contains('open') && document.activeElement === input) return; open(); });
  cancel?.addEventListener('click', done);
  document.addEventListener('keydown', e => {
    if (document.documentElement.classList.contains('locked')) return; // a sheet is open
    const typing = e.target.closest?.('input,textarea,select,[contenteditable="true"]');
    if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      open();
    }
  });
  input.placeholder = 'Search players and teams';
  btn?.setAttribute('aria-label', 'Search players and teams');
  if (btn && !btn.innerHTML.trim()) btn.innerHTML = String(icon('search'));
}
