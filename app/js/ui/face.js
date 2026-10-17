// Player faces: the user's own photo if they added one, else the real headshot, over a silhouette.
// If an image fails (offline, no headshot), the silhouette stays. Never a broken image icon.
//
//   initFaces()             load which players have an imported photo (main.js calls it before the first screen)
//   face(p, cls)            html: <span class="face {cls}" data-face="{id}"> silhouette + image
//                           cls: 'round' (circle crop), 'cut' (transparent cut-out headshot, sits on its chin)
//   hasPhoto(id)            true if the user imported a photo for this player
//   importPhoto(id, file)   resize to max 520px, save (webp, or jpeg/png where webp can't be encoded), swap everywhere
//   removePhoto(id)         delete the imported photo and go back to the headshot
//   pickPhoto(id)           open the file picker, then importPhoto
//   bindPhotoDrop(el, id, {paste, highlight})  drop (and optionally paste) an image onto el to import it;
//                           highlight gets the 'drop' class while a file hovers (default el); returns cleanup
//   hydrateFaces(root)      swap in imported photos for any [data-face] under root (runs on its own after imports)
//
// Toasts are shown by importPhoto/removePhoto, so callers only need to refresh their own buttons
// (listen for the 'md:photo' event on document: detail {id, has}).

import { esc, Html, toast, $$ } from './dom.js';
import { img as platformImg, photos } from '../platform.js';

export const SIL = '<svg viewBox="0 0 100 80" aria-hidden="true" focusable="false"><circle cx="50" cy="28" r="17" fill="currentColor"/><path d="M14 80c2-20 17-30 36-30s34 10 36 30z" fill="currentColor"/></svg>';

const custom = new Set();   // ids (as strings) with an imported photo
const ready = new Map();    // id -> object URL once loaded

export async function initFaces() {
  try {
    const ids = await Promise.race([photos.ids(), new Promise(r => setTimeout(() => r([]), 1500))]);
    ids.forEach(id => custom.add(String(id)));
    await Promise.all(ids.map(async id => { const u = await photos.get(id); if (u) ready.set(String(id), u); }));
  } catch (e) { /* no stored photos */ }
}

export const hasPhoto = id => custom.has(String(id));

const imgHtml = (src, user) =>
  `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" draggable="false"${user ? ' data-user="1"' : ''} onload="this.classList.add('in');this.parentNode.classList.add('has-img')" onerror="this.parentNode.classList.remove('has-img');this.remove()">`;

export function face(p, cls = '') {
  if (!p) return new Html(`<span class="face ${esc(cls)}">${SIL}</span>`);
  const id = String(p.id);
  const user = ready.get(id);
  const hs = p.headshot ? platformImg(p.headshot) : '';
  const src = user || hs;
  const c = `face ${cls}${user ? ' user' : ''}`.trim();
  return new Html(`<span class="${esc(c)}" data-face="${esc(id)}"${hs ? ` data-hs="${esc(hs)}"` : ''}>${SIL}${src ? imgHtml(src, !!user) : ''}</span>`);
}

// Re-draw every face of this player on screen (after an import or removal).
function refresh(id, root = document) {
  const k = String(id);
  const user = ready.get(k);
  for (const el of $$(`[data-face="${CSS.escape(k)}"]`, root)) {
    el.querySelector('img')?.remove();
    el.classList.toggle('user', !!user);
    el.classList.remove('has-img');
    const src = user || el.dataset.hs || '';
    if (src) el.insertAdjacentHTML('beforeend', imgHtml(src, !!user));
  }
}

export function hydrateFaces(root = document) {
  for (const el of $$('[data-face]', root)) {
    const k = el.dataset.face;
    if (!custom.has(k)) continue;
    const u = ready.get(k);
    if (u) { if (el.querySelector('img')?.getAttribute('src') !== u) refresh(k, el.parentNode ?? root); }
    else photos.get(k).then(url => { if (url) { ready.set(k, url); refresh(k); } });
  }
}

function encode(canvas, srcType) {
  const tryType = (type, q) => new Promise(r => canvas.toBlob(b => r(b), type, q));
  return tryType('image/webp', 0.88).then(b => {
    if (b && b.type === 'image/webp') return b;
    // Safari can't encode webp: keep transparency with png, else jpeg
    return srcType === 'image/png' || srcType === 'image/gif' ? tryType('image/png') : tryType('image/jpeg', 0.9);
  });
}

function decode(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    im.src = url;
  });
}

export async function importPhoto(id, file) {
  if (!file || !/^image\//.test(file.type)) { toast('That file is not an image.'); return false; }
  let im;
  try { im = await decode(file); } catch (e) { toast('That image could not be read.'); return false; }
  const k = Math.min(1, 520 / Math.max(im.naturalWidth || im.width, im.naturalHeight || im.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round((im.naturalWidth || im.width) * k));
  c.height = Math.max(1, Math.round((im.naturalHeight || im.height) * k));
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(im, 0, 0, c.width, c.height);
  const blob = await encode(c, file.type);
  if (!blob) { toast('That image could not be saved.'); return false; }
  try {
    await photos.set(id, blob);
  } catch (e) {
    toast('This browser would not save the photo.');
    return false;
  }
  const key = String(id);
  const old = ready.get(key);
  custom.add(key);
  const url = await photos.get(id);
  if (url) ready.set(key, url);
  if (old && old !== url) setTimeout(() => URL.revokeObjectURL(old), 2000);
  refresh(key);
  document.dispatchEvent(new CustomEvent('md:photo', { detail: { id: key, has: true } }));
  toast('Photo added. It is saved on this device only.');
  return true;
}

export async function removePhoto(id) {
  const key = String(id);
  try { await photos.remove(id); } catch (e) { /* already gone */ }
  custom.delete(key);
  ready.delete(key);
  refresh(key);
  document.dispatchEvent(new CustomEvent('md:photo', { detail: { id: key, has: false } }));
  toast('Your photo was removed.');
  return true;
}

export function pickPhoto(id) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  input.onchange = () => { const f = input.files?.[0]; input.remove(); if (f) importPhoto(id, f); };
  document.body.appendChild(input);
  input.click();
  setTimeout(() => input.isConnected && input.remove(), 60000);
}

export function bindPhotoDrop(el, id, { paste = true, highlight = el } = {}) {
  const over = e => { if ([...(e.dataTransfer?.types ?? [])].includes('Files')) { e.preventDefault(); highlight.classList.add('drop'); } };
  const leave = e => { if (!el.contains(e.relatedTarget)) highlight.classList.remove('drop'); };
  const drop = e => {
    e.preventDefault();
    highlight.classList.remove('drop');
    const f = [...(e.dataTransfer?.files ?? [])].find(x => x.type.startsWith('image/'));
    if (f) importPhoto(id, f); else toast('Drop an image file to use it as the photo.');
  };
  const onPaste = e => {
    if (e.target.closest?.('input,textarea,[contenteditable="true"]')) return;
    const f = [...(e.clipboardData?.files ?? [])].find(x => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); importPhoto(id, f); }
  };
  el.addEventListener('dragover', over);
  el.addEventListener('dragenter', over);
  el.addEventListener('dragleave', leave);
  el.addEventListener('drop', drop);
  if (paste) document.addEventListener('paste', onPaste);
  return () => {
    el.removeEventListener('dragover', over);
    el.removeEventListener('dragenter', over);
    el.removeEventListener('dragleave', leave);
    el.removeEventListener('drop', drop);
    document.removeEventListener('paste', onPaste);
  };
}
