// Platform layer: the same app runs in a browser (npm start) and inside the Mac app (Tauri v2).
// Everything that differs between the two lives here, so screens never check which one they are in.
//
//   isApp            true inside Tauri (window.__TAURI__ exists; tauri.conf sets withGlobalTauri: true)
//   isMac            true on macOS (either mode)
//   DATA_SCHEMA      the data shape this code understands; app/data/meta.json carries the same "schema"
//   REMOTE           where the Mac app looks for newer data
//   loadData(files, {optional})  -> {name: parsedJson}. Never mixes a cached set with the bundled set.
//   checkForUpdate(currentBuilt) -> new "built" string after a full download, or null. App only. Never throws.
//   img(url)         remote image URL -> what goes in <img src>. App: served from the on-disk cache by Rust.
//   saveFile(name, data, mime)   -> saved path / file name, or null if cancelled or it failed.
//   photos           the user's imported photos (IndexedDB 'md27', store 'photos'), both modes.

const TAURI = typeof window !== 'undefined' ? window.__TAURI__ : undefined;

export const isApp = !!TAURI;
export const isMac = typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '');
export const DATA_SCHEMA = 1;
export const REMOTE = 'https://raw.githubusercontent.com/cnbville/mock-draft2027/main/app/data/';

const invoke = (cmd, args) => TAURI.core.invoke(cmd, args);

// "2026-10-15 23:34" style stamps compare as strings once the separator is the same.
const stamp = s => String(s ?? '').replace('T', ' ').trim();
const newer = (a, b) => stamp(a) > stamp(b);

let lastFiles = null; // what loadData was asked for, so checkForUpdate downloads the same set
let lastOptional = [];

async function fetchBundled(name) {
  const r = await fetch(`data/${name}.json`);
  if (!r.ok) throw new Error(`Could not load data/${name}.json`);
  return r.json();
}

async function bundledSet(files, optional) {
  const out = {};
  await Promise.all(files.map(async f => {
    try { out[f] = await fetchBundled(f); } catch (e) { if (!optional.includes(f)) throw e; }
  }));
  return out;
}

// The cached copy (downloaded by checkForUpdate) wins only when it is complete, the right schema, and newer.
async function cachedSet(files, optional) {
  const metaText = await invoke('store_read', { path: 'data/meta.json' });
  if (!metaText) return null;
  const meta = JSON.parse(metaText);
  if (meta.schema !== DATA_SCHEMA) return null;
  let bundledMeta = null;
  try { bundledMeta = await fetchBundled('meta'); } catch (e) { /* no bundled meta: the cache wins */ }
  if (bundledMeta && !newer(meta.built, bundledMeta.built)) return null;
  const out = { meta };
  for (const f of files) {
    if (f === 'meta') continue;
    const text = await invoke('store_read', { path: `data/${f}.json` });
    if (text == null) {
      if (optional.includes(f)) continue;
      return null; // incomplete cache: use the bundled set, never a mix
    }
    out[f] = JSON.parse(text);
  }
  return out;
}

export async function loadData(files, { optional = [] } = {}) {
  lastFiles = files.slice();
  lastOptional = optional.slice();
  if (isApp) {
    try {
      const cached = await cachedSet(files, optional);
      if (cached) return cached;
    } catch (e) { /* unreadable cache: fall back to the bundled data */ }
  }
  return bundledSet(files, optional);
}

export async function checkForUpdate(currentBuilt) {
  if (!isApp) return null;
  try {
    const r = await fetch(REMOTE + 'meta.json', { cache: 'no-store' });
    if (!r.ok) return null;
    const metaText = await r.text();
    const meta = JSON.parse(metaText);
    if (meta.schema !== DATA_SCHEMA || !newer(meta.built, currentBuilt)) return null;
    const files = (lastFiles ?? []).filter(f => f !== 'meta');
    const texts = {};
    for (const f of files) {
      const res = await fetch(`${REMOTE}${f}.json?v=${encodeURIComponent(meta.built)}`, { cache: 'no-store' });
      if (!res.ok) { if (lastOptional.includes(f)) continue; return null; }
      const text = await res.text();
      JSON.parse(text); // a broken download stops here, before anything is written
      texts[f] = text;
    }
    // Mark the cache incomplete first, so a crash mid-write can never leave a mixed set that looks valid.
    await invoke('store_write', { path: 'data/meta.json', text: JSON.stringify({ schema: 0, pending: meta.built }) });
    for (const [f, text] of Object.entries(texts)) await invoke('store_write', { path: `data/${f}.json`, text });
    await invoke('store_write', { path: 'data/meta.json', text: metaText }); // last
    return meta.built;
  } catch (e) {
    return null; // offline, blocked or a write failed: keep what we have
  }
}

const IMG_HOSTS = /^https:\/\//i;
export function img(url) {
  if (!url) return '';
  if (!isApp || !IMG_HOSTS.test(url)) return url;
  const base = /Windows/i.test(navigator.userAgent) ? 'http://img.localhost/' : 'img://localhost/';
  return base + encodeURIComponent(url);
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function saveFile(name, data, mime = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  if (isApp) {
    try {
      const base64 = toBase64(await blob.arrayBuffer());
      return (await invoke('save_file', { name, base64 })) ?? null;
    } catch (e) {
      return null;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return name;
}

// ---------- the user's photos (IndexedDB) ----------
let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('No IndexedDB'));
      const req = indexedDB.open('md27', 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('photos')) req.result.createObjectStore('photos'); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

function request(mode, run) {
  return db().then(d => new Promise((resolve, reject) => {
    const tx = d.transaction('photos', mode);
    const req = run(tx.objectStore('photos'));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

const urls = new Map(); // id -> object URL, so the same photo isn't decoded twice
const key = id => String(id);

export const photos = {
  // Object URL of the user's photo for this player, or null.
  async get(id) {
    const k = key(id);
    if (urls.has(k)) return urls.get(k);
    try {
      const blob = await request('readonly', s => s.get(k));
      if (!blob) return null;
      const u = URL.createObjectURL(blob);
      urls.set(k, u);
      return u;
    } catch (e) {
      return null;
    }
  },
  async set(id, blob) {
    const k = key(id);
    await request('readwrite', s => s.put(blob, k));
    if (urls.has(k)) URL.revokeObjectURL(urls.get(k));
    urls.delete(k);
  },
  async remove(id) {
    const k = key(id);
    await request('readwrite', s => s.delete(k));
    if (urls.has(k)) URL.revokeObjectURL(urls.get(k));
    urls.delete(k);
  },
  // Extra (not in the original contract): ids that have a photo, as strings.
  async ids() {
    try { return (await request('readonly', s => s.getAllKeys())).map(String); } catch (e) { return []; }
  },
};
