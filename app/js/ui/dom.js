// DOM helpers and the layer system (sheets, bottom sheets, moments, toasts). Every screen uses these.
//
//   $(sel, root) / $$(sel, root)    querySelector / querySelectorAll as an array
//   esc(s)                           escape text for HTML
//   h`...${v}...`                    safe HTML template: values are escaped unless they are Html (from h, raw or ui/parts).
//                                    Arrays are joined. null/undefined/false print nothing. Returns an Html object that
//                                    works anywhere a string does (innerHTML, insertAdjacentHTML, `${...}`).
//   raw(s)                           mark a trusted HTML string as Html (no escaping)
//   node(html) / frag(html)          first element / a fragment built from HTML
//   on(el, type, sel, fn)            delegated listener; returns an off() function
//   icon(name)                       inline SVG icon (see ICONS below)
//   toast(msg, {action:{label, run}, ms})
//   sheet({content, label, onClose, cls})     full-screen modal sheet with a close button -> {el, card, body, set, close}
//   bottomSheet({content, label, onClose, cls}) sheet from the bottom with a grab handle -> {el, body, set, close}
//   moment({content, label, onClose, cls, dismissible}) full-screen reveal -> {el, set, close}
//   closeAll(reason)                 close every open layer (the router uses this)
//   reduceMotion                     live boolean (prefers-reduced-motion)
//   sleep(ms)                        a pause that shrinks to almost nothing when motion is reduced
//
// initialFocus: a selector inside the layer, or 'self' (the dialog itself; the sheet's default, so no focus ring
// flashes on the close button). Layers: Esc closes the top one, Tab stays inside it, the page under it is inert, and focus returns to
// where it was. onClose(reason) gets 'button' | 'esc' | 'backdrop' | 'drag' | 'code' | 'route'.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export class Html {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = s => (s instanceof Html ? s : new Html(String(s ?? '')));
const show = v => (v == null || v === false ? '' : v instanceof Html ? v.s : Array.isArray(v) ? v.map(show).join('') : esc(v));
export function h(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += show(vals[i]) + strings[i + 1];
  return new Html(out);
}

export function frag(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html);
  return t.content;
}
export const node = html => frag(html).firstElementChild;

export function on(el, type, sel, fn, opts) {
  const handler = e => {
    const t = e.target.closest?.(sel);
    if (t && el.contains(t)) fn(e, t);
  };
  el.addEventListener(type, handler, opts);
  return () => el.removeEventListener(type, handler, opts);
}

// ---------- reduced motion ----------
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export let reduceMotion = !!mq?.matches;
mq?.addEventListener?.('change', e => { reduceMotion = e.matches; });
export const sleep = ms => new Promise(r => setTimeout(r, reduceMotion ? Math.min(ms, 40) : ms));

// ---------- icons (24px grid, stroke = currentColor) ----------
const S = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
export const ICONS = {
  close: S('<path d="M6 6l12 12M18 6L6 18"/>', ' stroke-width="2.6"'),
  search: S('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', ' stroke-width="2.4"'),
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
  plus: S('<path d="M12 5v14M5 12h14"/>', ' stroke-width="2.4"'),
  check: S('<path d="M5 12.5l4.5 4.5L19 7.5"/>', ' stroke-width="2.6"'),
  star: S('<path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>', ' stroke-width="1.8"'),
  camera: S('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  trash: S('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  left: S('<path d="M15 5l-7 7 7 7"/>', ' stroke-width="2.6"'),
  right: S('<path d="M9 5l7 7-7 7"/>', ' stroke-width="2.6"'),
  down: S('<path d="M6 9l6 6 6-6"/>', ' stroke-width="2.4"'),
  up: S('<path d="M6 15l6-6 6 6"/>', ' stroke-width="2.4"'),
  home: S('<path d="M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z"/>'),
  clock: S('<circle cx="12" cy="13" r="7"/><path d="M12 13V9.5M10 3h4"/>'),
  list: S('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
  starNav: S('<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>'),
  shield: S('<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/>'),
  more: S('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>', ' stroke-width="2.6"'),
  dice: S('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9h.01M15 15h.01M15 9h.01M9 15h.01"/>', ' stroke-width="2.4"'),
  info: S('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  refresh: S('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
  download: S('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  upload: S('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>'),
  drag: S('<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>', ' stroke-width="3"'),
  trade: S('<path d="M7 7h12l-3-3M17 17H5l3 3"/>'),
  phone: S('<path d="M6 3h3l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v3a3 3 0 0 1-3 3A15 15 0 0 1 3 6a3 3 0 0 1 3-3z"/>'),
};
export const icon = name => new Html(ICONS[name] ?? '');

// ---------- toasts ----------
function toastHost() {
  let host = document.getElementById('toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    host.className = 'toasts';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  return host;
}

export function toast(msg, { action, ms = 3200 } = {}) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = msg;
  t.appendChild(text);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.onclick = () => { action.run?.(); dismiss(); };
    t.appendChild(b);
  }
  const host = toastHost();
  host.appendChild(t);
  while (host.children.length > 3) host.firstElementChild.remove();
  let gone = false;
  function dismiss() {
    if (gone) return;
    gone = true;
    if (reduceMotion) { t.remove(); return; }
    t.classList.add('out');
    setTimeout(() => t.remove(), 260);
  }
  setTimeout(dismiss, action ? Math.max(ms, 6000) : ms);
  return dismiss;
}

// ---------- layers ----------
const stack = [];
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

function layerHost() {
  let host = document.getElementById('layer');
  if (!host) {
    host = document.createElement('div');
    host.id = 'layer';
    document.body.appendChild(host);
  }
  return host;
}

// What becomes inert under the first layer: everything in <body> except the layer host and the toasts.
function background() {
  return [...document.body.children].filter(el => el.id !== 'layer' && el.id !== 'toasts' && el.tagName !== 'SCRIPT');
}

function setContent(box, content) {
  box.replaceChildren();
  if (content == null) return;
  if (content instanceof Node) box.appendChild(content);
  else box.appendChild(frag(String(content)));
}

function focusFirst(root, preferred) {
  if (preferred === 'self') { root.setAttribute('tabindex', '-1'); root.focus({ preventScroll: true }); return; }
  const target = (preferred && root.querySelector(preferred)) || root.querySelector('[autofocus]') || root.querySelector(FOCUSABLE) || root;
  if (target === root && !root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
  target.focus?.({ preventScroll: true });
}

// Open a layer: parts = the elements to add to #layer (first one is the dialog root for focus handling).
function openLayer(parts, dialog, { onClose, initialFocus, outMs = 220 } = {}) {
  const host = layerHost();
  const prevFocus = document.activeElement;
  const inerted = [];
  const under = stack.length ? [stack[stack.length - 1].dialog] : background();
  for (const el of under) if (!el.inert) { el.inert = true; inerted.push(el); }
  parts.forEach(p => host.appendChild(p));
  document.documentElement.classList.add('locked');
  const layer = { dialog, parts, closed: false };
  layer.close = (reason = 'code') => {
    if (layer.closed) return;
    layer.closed = true;
    const i = stack.indexOf(layer);
    if (i >= 0) stack.splice(i, 1);
    inerted.forEach(el => { el.inert = false; });
    if (!stack.length) document.documentElement.classList.remove('locked');
    const finish = () => parts.forEach(p => p.remove());
    if (reduceMotion || reason === 'route-instant') finish();
    else { parts.forEach(p => p.classList.add('out')); setTimeout(finish, outMs); }
    if (prevFocus && prevFocus.isConnected && !prevFocus.closest('[inert]')) prevFocus.focus?.({ preventScroll: true });
    onClose?.(reason);
  };
  stack.push(layer);
  requestAnimationFrame(() => focusFirst(dialog, initialFocus));
  return layer;
}

export function closeAll(reason = 'route') {
  while (stack.length) stack[stack.length - 1].close(reason);
}
export const openLayers = () => stack.length;

document.addEventListener('keydown', e => {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') {
    if (top.dialog.dataset.dismissible === 'false') return;
    e.preventDefault();
    e.stopPropagation();
    top.close('esc');
    return;
  }
  if (e.key !== 'Tab') return;
  const items = [...top.dialog.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length > 0 || el === document.activeElement);
  if (!items.length) { e.preventDefault(); return; }
  const first = items[0], last = items[items.length - 1];
  if (!top.dialog.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}, true);

// Full-screen modal sheet (the player page). The card is 1080px wide on desktop and full width on phones.
export function sheet({ content, label = 'Details', onClose, cls = '', initialFocus = 'self' } = {}) {
  const el = document.createElement('div');
  el.className = 'sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', label);
  el.innerHTML = `<div class="sheet-card ${esc(cls)}"><button class="close" type="button" aria-label="Close">${ICONS.close}</button><div class="sheet-body"></div></div>`;
  const card = el.firstElementChild, body = card.lastElementChild;
  setContent(body, content);
  const layer = openLayer([el], el, { onClose, initialFocus });
  card.querySelector('.close').onclick = () => layer.close('button');
  el.addEventListener('mousedown', e => { if (e.target === el) el._down = true; });
  el.addEventListener('click', e => { if (e.target === el && el._down) layer.close('backdrop'); el._down = false; });
  return {
    el, card, body,
    set(c, newLabel) { setContent(body, c); el.scrollTop = 0; if (newLabel) el.setAttribute('aria-label', newLabel); },
    close: (reason = 'code') => layer.close(reason),
  };
}

// Bottom sheet (trade builder, menus). Drag the handle down to dismiss on touch screens.
export function bottomSheet({ content, label = 'Options', onClose, cls = '', initialFocus } = {}) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const el = document.createElement('div');
  el.className = `bsheet ${cls}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', label);
  el.innerHTML = '<span class="grab" aria-hidden="true"></span><div class="bsheet-body"></div>';
  const body = el.lastElementChild;
  setContent(body, content);
  el.addEventListener('animationend', e => { if (e.target === el) el.classList.add('settled'); });
  const layer = openLayer([scrim, el], el, { onClose, initialFocus });
  scrim.onclick = () => layer.close('backdrop');
  // drag to dismiss
  const grab = el.firstElementChild;
  let y0 = null, dy = 0;
  grab.addEventListener('pointerdown', e => { y0 = e.clientY; dy = 0; grab.setPointerCapture(e.pointerId); el.classList.add('dragging'); });
  grab.addEventListener('pointermove', e => {
    if (y0 == null) return;
    dy = Math.max(0, e.clientY - y0);
    el.style.transform = `translate(-50%, ${dy}px)`;
  });
  const end = () => {
    if (y0 == null) return;
    y0 = null;
    el.classList.remove('dragging');
    if (dy > 110) { el.style.setProperty('--dy', `${dy}px`); layer.close('drag'); }
    else el.style.transform = '';
  };
  grab.addEventListener('pointerup', end);
  grab.addEventListener('pointercancel', end);
  return { el, body, set: c => setContent(body, c), close: (reason = 'code') => layer.close(reason) };
}

// Full-screen reveal (the pick is in). Set --accent on the returned el (or pass style) to light it.
export function moment({ content, label = 'Announcement', onClose, cls = '', dismissible = true, initialFocus, style = '' } = {}) {
  const el = document.createElement('div');
  el.className = `moment ${cls}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', label);
  el.dataset.dismissible = String(dismissible);
  if (style) el.setAttribute('style', style);
  const inner = document.createElement('div');
  inner.className = 'moment-in';
  el.appendChild(inner);
  setContent(inner, content);
  const layer = openLayer([el], el, { onClose, initialFocus, outMs: 260 });
  return { el, set: c => setContent(inner, c), close: (reason = 'code') => layer.close(reason) };
}
