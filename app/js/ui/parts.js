// Shared pieces every screen builds with. Each returns Html (works as a string) unless it says "element".
// See them all with real data at #kit.
//
//   pill(text, kind)                   kind: '' | 'good' | 'gold' | 'bad' | 'live' | 'quiet' | 'pos'
//   posPill(group)                     position pill
//   poster(p, {sub, tag, href})        2:3 poster in school colours, face cut-out, caption (link to #player/ID)
//   ranked(p, n, opts)                 poster with a giant outlined number behind it (Top 10 shelf)
//   split(p, ranks, sub)               wide card with a round face and a row of number boxes (Where the boards disagree)
//   teamTile(abbr, {sub, href, current, attrs, size})   team logo tile with nickname
//   shelf({title, note, items, id, cls})  a titled horizontal rail with hover arrows (items: array of Html)
//   playerRow(p, {num, sub, cols, star, href})  glass row: big number, round face, name, columns, star toggle
//     cols: [{label, value, wide}]  (wide columns hide on phones)
//   starBtn(id, name)                  add/remove from My Board toggle (works anywhere, no wiring needed)
//   facts(items)                       hero fact chips: strings or [label, value]
//   statTiles(items, {cols})           number tiles: [{value, label, note, src}]; auto-fit, or a fixed column count
//   kpis(items, {cols})                small number row: [{value, label}]
//   traitBars(traits, {grades})        p.traits as bars; film-only traits dashed; the user's grade as a gold mark
//   meter(label, value, text)          one thin bar (value 0..1)
//   outcomeBar(rates, {legend, size})  hit-rate outcomes as one stacked bar (+ legend with percents)
//   outcomeLegend(rates?)              the legend on its own
//   ring(progress, {size, label, inner, cls})  progress ring; setRing(el, progress) updates it
//   src(kind, text)                    figure label: kind 'published' | 'computed' | 'estimated'
//   empty({title, text, action})       empty state block
//   chips(groups, active, onPick)      element: pill filter row (groups: strings or {value, label, count})
//   seg(options, active, onPick)       element: segmented control (same input as chips)
//   install()                          global behaviours: star toggles, rail arrows, poster shine (main.js calls it)
//   table                              re-export of util.table (sortable), styled by .tablewrap

import { h, esc, Html, raw, icon, toast, $$ } from './dom.js';
import { face } from './face.js';
import { logo, teamArt, playerStyle } from './art.js';
import { posName, OUTCOMES, OUTCOME_HELP, num } from './fmt.js';
import { store } from '../store.js';
import { reduceMotion } from './dom.js';
export { table } from '../util.js';

export const pill = (text, kind = '') => h`<span class="pill ${kind}">${text}</span>`;
export const posPill = g => h`<span class="pill pos" title="${posName(g)}">${g}</span>`;

export function poster(p, { sub, tag, href } = {}) {
  return h`<a class="poster" href="${href ?? `#player/${p.id}`}" style="${raw(playerStyle(p))}" aria-label="${p.name}, ${posName(p.group)}, ${p.school}">${face(p, 'cut')}<span class="shine" aria-hidden="true"></span>${posPill(p.group)}${tag ? h`<span class="poster-tag">${tag}</span>` : ''}<span class="cap"><b>${p.name}</b><small>${sub ?? p.school}</small></span></a>`;
}

export function ranked(p, n, opts) {
  return h`<div class="ranked"><span class="onum" aria-hidden="true">${n}</span>${poster(p, opts)}</div>`;
}

export function split(p, ranks = [], sub = '') {
  return h`<a class="split" href="#player/${p.id}" style="${raw(playerStyle(p))}">${face(p, 'round')}<span><b>${p.name}</b><small>${sub || `${p.group} · ${p.school}`}</small></span>
    <span class="ranks" style="--n:${ranks.length || 1}">${ranks.map(([label, v]) => h`<span><b>${v ?? '–'}</b>${label}</span>`)}</span></a>`;
}

export function teamTile(abbr, { sub = '', href, current = false, attrs = '', size = 84, tag = 'a' } = {}) {
  const t = teamArt(abbr);
  const open = tag === 'a' ? h`<a class="teamtile" href="${href ?? `#team/${abbr}`}"` : h`<button type="button" class="teamtile"`;
  const close = tag === 'a' ? '</a>' : '</button>';
  return h`${open} ${raw(attrs)} ${current ? raw('aria-current="true"') : ''} aria-label="${t.name}${sub ? `, ${sub}` : ''}">${logo(abbr, size)}<span><b>${t.nick}</b>${sub ? h`<small>${sub}</small>` : ''}</span>${raw(close)}`;
}

export function shelf({ title, note = '', items = [], id = '', cls = '', link } = {}) {
  return h`<section class="shelf ${cls}"${id ? raw(` id="${esc(id)}"`) : ''}>
    <div class="shelf-head wrap"><h2>${title}</h2>${link ? h`<a href="${link.href}">${link.label}</a>` : note ? h`<span>${note}</span>` : ''}</div>
    <div class="rail-wrap"><div class="rail">${items}</div>
      <button class="rail-btn prev" type="button" aria-label="Scroll back" disabled>${icon('left')}</button>
      <button class="rail-btn next" type="button" aria-label="Scroll forward">${icon('right')}</button></div>
  </section>`;
}

export function starBtn(id, name = 'this player') {
  const on = store.onBoard(id);
  return h`<button type="button" class="star" data-star="${id}" aria-pressed="${String(on)}" aria-label="${on ? `Remove ${name} from My Board` : `Add ${name} to My Board`}" title="${on ? 'On My Board' : 'Add to My Board'}">${icon('star')}</button>`;
}

export function playerRow(p, { num: n, sub, cols = [], star = true, href, numCls = '' } = {}) {
  return h`<div class="prow" style="${raw(playerStyle(p))}">
    <span class="num ${numCls}" aria-hidden="true">${n ?? p.board_rank}</span>${face(p, 'round')}
    <span class="who"><a class="stretch" href="${href ?? `#player/${p.id}`}">${p.name}</a><small>${sub ?? `${p.group} · ${p.school}`}</small></span>
    <span class="cols">${cols.map(c => h`<span class="col ${c.wide ? 'wide' : ''}">${c.label}<b>${c.value}</b></span>`)}${star ? starBtn(p.id, p.name) : ''}</span>
  </div>`;
}

export function facts(items) {
  return h`<div class="facts">${items.filter(x => x != null && x !== '').map(x => Array.isArray(x) ? h`<span class="fact">${x[0]} <b>${x[1]}</b></span>` : h`<span class="fact">${x}</span>`)}</div>`;
}

export const src = (kind, text) => h`<span class="src ${kind}">${text ?? kind[0].toUpperCase() + kind.slice(1)}</span>`;

export function statTiles(items, { cols } = {}) {
  return h`<div class="tiles${cols ? ' fixed' : ''}"${cols ? raw(` style="--cols:${+cols}"`) : ''}>${items.map(t => h`<div><b>${t.value ?? '–'}</b><small>${t.label}</small>${t.note ? h`<small class="note">${t.note}</small>` : ''}${t.src ? src(t.src) : ''}</div>`)}</div>`;
}

export function kpis(items, { cols } = {}) {
  return h`<div class="kpis"${cols ? raw(` style="--cols:${+cols}"`) : ''}>${items.map(k => h`<div><b>${k.value ?? '–'}</b><small>${k.label}</small></div>`)}</div>`;
}

// traits: p.traits ([{trait, source, est (1-10 or null), pct}]); grades: {trait: 1-10} from the user's store
export function traitBars(traits = [], { grades = {} } = {}) {
  return h`<div class="traits">${traits.map(t => {
    const mine = grades?.[t.trait];
    const g = mine === '' || mine == null ? null : +mine;
    const film = t.est == null;
    const srcText = film ? 'Film only' : 'From stats, not film';
    if (film) {
      return h`<div class="trait film ${g != null ? 'graded' : ''}"><span class="tl">${t.trait}<small>${srcText}</small></span><span class="t">${g != null ? h`<i style="width:${g * 10}%"></i>` : ''}</span><b>${g != null ? h`${g}<small>Your grade</small>` : 'Needs film'}</b></div>`;
    }
    return h`<div class="trait"><span class="tl">${t.trait}<small>${srcText}</small></span><span class="t" role="img" aria-label="${t.trait}: ${num(t.est, 1)} of 10${g != null ? `, your grade ${g}` : ''}"><i style="width:${Math.max(2, t.est * 10)}%"></i>${g != null ? h`<em style="left:${g * 10}%" title="Your grade ${g}"></em>` : ''}</span><b>${num(t.est, 1)}${g != null ? h`<small>You: ${g}</small>` : ''}</b></div>`;
  })}</div>`;
}

export function meter(label, value, text) {
  const v = Math.max(0, Math.min(1, +value || 0));
  return h`<div class="meter"><span>${label}</span><span class="t"><i style="width:${v * 100}%"></i></span><b>${text ?? `${Math.round(v * 100)}%`}</b></div>`;
}

export function outcomeLegend(rates) {
  return h`<ul class="olegend">${OUTCOMES.map(([k, l]) => h`<li title="${OUTCOME_HELP[k]}"><i class="o-${k}"></i>${l}${rates ? h` <b>${Math.round((rates[k] ?? 0) * 100)}%</b>` : ''}</li>`)}</ul>`;
}

export function outcomeBar(rates, { legend = false, size = '' } = {}) {
  const label = OUTCOMES.map(([k, l]) => `${l} ${Math.round((rates?.[k] ?? 0) * 100)}%`).join(', ');
  const bar = h`<div class="obar ${size}" role="img" aria-label="${label}">${OUTCOMES.map(([k, l]) => (rates?.[k] ?? 0) > 0 ? h`<i class="o-${k}" style="width:${(rates[k] * 100).toFixed(2)}%" title="${l} ${Math.round(rates[k] * 100)}%"></i>` : '')}</div>`;
  return legend ? h`<div class="outcome">${bar}${outcomeLegend(rates)}</div>` : bar;
}

const R = 15.9155; // circumference 100
export function ring(progress, { size = 56, label = '', inner = '', cls = '', width } = {}) {
  const p = Math.max(0, Math.min(1, +progress || 0));
  return h`<span class="ring ${cls}" style="--sz:${size}px${width ? `;--w:${width}` : ''}" role="img" aria-label="${label || `${Math.round(p * 100)}%`}"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="ring-track" cx="18" cy="18" r="${R}"/><circle class="ring-val" cx="18" cy="18" r="${R}" stroke-dasharray="${(p * 100).toFixed(2)} 100"/></svg><span>${inner}</span></span>`;
}
export function setRing(el, progress, label) {
  const p = Math.max(0, Math.min(1, +progress || 0));
  el?.querySelector('.ring-val')?.setAttribute('stroke-dasharray', `${(p * 100).toFixed(2)} 100`);
  if (label != null) el?.setAttribute('aria-label', label);
}

export function empty({ title = 'Nothing here yet', text = '', action = '', iconName = 'info' } = {}) {
  return h`<div class="empty">${icon(iconName)}<b>${title}</b>${text ? h`<p>${text}</p>` : ''}${action ? raw(action) : ''}</div>`;
}

function choiceRow(cls, groups, active, onPick, label) {
  const el = document.createElement('div');
  el.className = cls;
  el.setAttribute('role', 'group');
  if (label) el.setAttribute('aria-label', label);
  const items = groups.map(g => (typeof g === 'object' ? g : { value: g, label: g }));
  el.innerHTML = String(h`${items.map(g => h`<button type="button" data-v="${g.value}" aria-pressed="${String(g.value) === String(active)}">${g.label}${g.count != null ? h`<small>${g.count}</small>` : ''}</button>`)}`);
  let value = active;
  el.set = v => { value = v; el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); };
  Object.defineProperty(el, 'value', { get: () => value });
  el.addEventListener('click', e => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    const item = items.find(g => String(g.value) === b.dataset.v);
    el.set(item.value);
    onPick?.(item.value);
  });
  return el;
}
export const chips = (groups, active, onPick, label = 'Filter') => choiceRow('chips', groups, active, onPick, label);
export const seg = (options, active, onPick, label = 'Show') => choiceRow('seg', options, active, onPick, label);

// ---------- global behaviours (installed once) ----------
let installed = false;
export function install() {
  if (installed) return;
  installed = true;

  // My Board star toggles, anywhere in the app
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-star]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const id = +b.dataset.star;
    const on = !store.onBoard(id);
    if (on) store.add(id); else store.remove(id);
    for (const s of $$(`[data-star="${id}"]`)) {
      s.setAttribute('aria-pressed', String(on));
      s.title = on ? 'On My Board' : 'Add to My Board';
      const nm = s.getAttribute('aria-label')?.replace(/^(Add|Remove) /, '').replace(/ (to|from) My Board$/, '') ?? 'this player';
      s.setAttribute('aria-label', on ? `Remove ${nm} from My Board` : `Add ${nm} to My Board`);
      if (!reduceMotion) { s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop'); }
    }
    toast(on ? 'Added to My Board.' : 'Removed from My Board.');
    document.dispatchEvent(new CustomEvent('md:board', { detail: { id, on } }));
  });

  // rail arrows: scroll by most of a screen, hide at the ends
  const sync = rail => {
    const wrap = rail.parentElement;
    const prev = wrap?.querySelector(':scope > .rail-btn.prev'), next = wrap?.querySelector(':scope > .rail-btn.next');
    if (!prev || !next) return;
    prev.disabled = rail.scrollLeft < 8;
    next.disabled = rail.scrollLeft + rail.clientWidth > rail.scrollWidth - 8;
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('.rail-btn');
    if (!b) return;
    const rail = b.parentElement.querySelector('.rail');
    const dir = b.classList.contains('prev') ? -1 : 1;
    rail.scrollBy({ left: dir * rail.clientWidth * 0.8, behavior: reduceMotion ? 'auto' : 'smooth' });
  });
  document.addEventListener('scroll', e => { if (e.target.classList?.contains('rail')) sync(e.target); }, true);
  document.addEventListener('pointerover', e => { const w = e.target.closest?.('.rail-wrap'); if (w) sync(w.querySelector('.rail')); });
  window.addEventListener('resize', () => $$('.rail').forEach(sync), { passive: true });

  // poster shine and tilt (mouse only)
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.addEventListener('pointermove', e => {
      const el = e.target.closest?.('.poster');
      if (!el) return;
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--mx', `${x * 100}%`);
      el.style.setProperty('--my', `${y * 100}%`);
      if (!reduceMotion) el.style.transform = `scale(1.06) perspective(700px) rotateY(${(x - 0.5) * 10}deg) rotateX(${(0.5 - y) * 10}deg)`;
    }, { passive: true });
    document.addEventListener('pointerout', e => {
      const el = e.target.closest?.('.poster');
      if (el && !el.contains(e.relatedTarget)) el.style.transform = '';
    });
  }
}

export { Html };
