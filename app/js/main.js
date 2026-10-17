// The shell: loads the data, then routes between screens.
//
// Routes (hash): #home (default), #mock, #board, #mine, #teams, #team/ABBR, #player/ID, #sims, #about, #kit (dev).
// View contract: each module in js/views exports view(el, D, arg). It renders into el (a fresh
// <section class="v-NAME">) and may return a cleanup function (or a promise of one). The router calls the
// previous screen's cleanup before rendering the next one.
// A player page opens as a full-screen sheet OVER the current screen, which keeps running underneath.
// Loading #player/ID directly shows it over Home. Esc or the close button closes it: history goes back if
// the sheet was opened by navigation, else the address is set back to the screen underneath.

import './ui/compat.js';
import { isApp, isMac, loadData, checkForUpdate } from './platform.js';
import { $, $$, h, toast, sheet, bottomSheet, closeAll, icon } from './ui/dom.js';
import { initArt } from './ui/art.js';
import { initFaces } from './ui/face.js';
import { install } from './ui/parts.js';
import { initSearch } from './ui/search.js';
import { date, dateLong } from './ui/fmt.js';

const FILES = ['prospects', 'teams', 'value_chart', 'hit_rates', 'combine_pct', 'meta', 'model_report', 'ai_model',
  'trade_market', 'art'];
const OPTIONAL = ['art'];

if (isApp) document.documentElement.classList.add('app');
if (isApp && isMac) document.documentElement.classList.add('app-mac');

const ROUTES = {
  home: { mod: 'home', title: 'Home', tab: 'home' },
  mock: { mod: 'draft', title: 'Mock Draft', tab: 'mock', foot: false },
  board: { mod: 'board', title: 'Big Board', tab: 'board' },
  mine: { mod: 'mine', title: 'My Board', tab: 'mine' },
  teams: { mod: 'teams', title: 'Teams', tab: 'teams' },
  team: { mod: 'teams', title: 'Teams', tab: 'teams' },
  sims: { mod: 'sims', title: 'Simulations', tab: 'sims', more: true },
  about: { mod: 'about', title: 'Model and data', tab: 'about', more: true },
  kit: { mod: 'kit', title: 'Component kit', tab: '' },
};

let D = null;
let base = null;       // the screen under any sheet: {name, arg, key, section, cleanup}
let player = null;     // the open player sheet: {handle, cleanup, id}
let seq = 0, pseq = 0, routed = false, depth = 0;
const mods = {};
const loadMod = m => (mods[m] ??= import(`./views/${m}.js`).catch(e => { delete mods[m]; throw e; }));
const safe = fn => { try { fn?.(); } catch (e) { console.error(e); } };

function parse(hash = location.hash) {
  let s = hash.replace(/^#\/?/, '');
  try { s = decodeURIComponent(s); } catch (e) { /* keep as typed */ }
  const [name, ...rest] = s.split('/');
  const arg = rest.join('/') || undefined;
  if (name === 'player' && arg) return { name, arg, key: `player/${arg}` };
  if (!ROUTES[name] || (name === 'team' && !arg)) return { name: 'home', key: 'home' };
  return { name, arg, key: arg ? `${name}/${arg}` : name };
}

function showError(section, e) {
  console.error(e);
  section.innerHTML = String(h`<div class="oops surface"><h1>This screen could not load.</h1><p class="muted">Something went wrong while drawing it. The rest of the app still works.</p><p><code>${e?.message ?? e}</code></p><p><a class="btn small" href="#home">Go to Home</a></p></div>`);
}

function runView(mod, section, arg, owner) {
  try {
    const ret = mod.view(section, D, arg);
    if (typeof ret === 'function') owner.cleanup = ret;
    else if (ret && typeof ret.then === 'function') {
      ret.then(fn => {
        if (typeof fn !== 'function') return;
        if (owner.section === section) owner.cleanup = fn; else safe(fn);
      }).catch(e => showError(section, e));
    }
  } catch (e) { showError(section, e); }
}

// ---------- chrome state ----------
function setChrome(r) {
  const cfg = ROUTES[r?.name] ?? ROUTES.home;
  for (const a of $$('[data-tab]')) {
    const on = a.dataset.tab === cfg.tab || (a.dataset.tab === 'more' && cfg.more && window.matchMedia('(max-width:760px)').matches);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  const foot = $('#foot');
  const showFoot = cfg.foot !== false && D;
  foot.hidden = !showFoot;
  document.body.classList.toggle('nofoot', !showFoot);
  document.body.dataset.route = r?.name ?? 'home';
  const t = r?.name === 'team' && D?.teams?.teams?.[r.arg] ? D.teams.teams[r.arg].name : cfg.title;
  document.title = r?.name === 'home' ? 'Mock Draft 2027' : `${t} · Mock Draft 2027`;
}

async function renderBase(r, { first = false } = {}) {
  const my = ++seq;
  const cfg = ROUTES[r.name];
  let mod;
  try { mod = await loadMod(cfg.mod); } catch (e) { mod = { view: el => showError(el, e) }; }
  if (my !== seq) return;
  if (base) safe(base.cleanup);
  closeAll('route');
  const view = $('#view');
  const section = document.createElement('section');
  section.className = `v-${cfg.mod}`;
  section.dataset.route = r.name;
  view.replaceChildren(section);
  base = { ...r, section, cleanup: null };
  setChrome(r);
  window.scrollTo(0, 0);
  runView(mod, section, r.arg, base);
  onScroll();
  if (!first) view.focus({ preventScroll: true });
}

async function openPlayer(id) {
  const my = ++pseq;
  let mod;
  try { mod = await loadMod('player'); } catch (e) { mod = { view: el => showError(el, e) }; }
  if (my !== pseq) return;
  const p = D.byId.get(+id);
  const label = p ? p.name : 'Player';
  const section = document.createElement('section');
  section.className = 'v-player';
  if (player) {
    safe(player.cleanup);
    player.cleanup = null;
    player.handle.set(section, label);
  } else {
    const ref = { cleanup: null };
    ref.handle = sheet({ content: section, label, cls: 'player-sheet', onClose: reason => sheetClosed(ref, reason) });
    player = ref;
  }
  player.id = id;
  player.section = section;
  document.title = `${label} · Mock Draft 2027`;
  runView(mod, section, id, player);
}

function sheetClosed(ref, reason) {
  safe(ref.cleanup);
  if (player === ref) player = null;
  if (base) setChrome(base);
  if (reason === 'route') return; // the address already moved on
  if (depth > 0) history.go(-depth);
  else history.replaceState(null, '', `#${base?.key ?? 'home'}`);
  depth = 0;
}

async function route() {
  const r = parse();
  if (r.name === 'player') {
    // depth = how many player pages sit on top of the screen underneath (0 = opened by a direct link)
    let d = history.state?.md;
    if (d == null) {
      d = !routed ? 0 : player ? depth + 1 : 1;
      history.replaceState({ ...(history.state ?? {}), md: d }, '');
    }
    depth = d;
    routed = true;
    if (!base) await renderBase(parse('#home'), { first: true });
    openPlayer(r.arg);
    return;
  }
  const first = !routed;
  routed = true;
  if (player) player.handle.close('route');
  depth = 0;
  if (base && base.key === r.key) { setChrome(base); return; }
  renderBase(r, { first });
}

// ---------- top bar ----------
const top = $('#top');
function onScroll() { top.classList.toggle('solid', window.scrollY > 8); }

// ---------- data pill, footer, More ----------
function dataStatus() {
  const built = D.meta.built;
  return { short: `Data from ${date(built)}`, long: `Data built ${dateLong(built)} at ${String(built).slice(11, 16) || '–'}.` };
}

function setPill(ready) {
  const pill = $('#datapill');
  const st = dataStatus();
  pill.hidden = false;
  pill.classList.toggle('ready', !!ready);
  pill.querySelector('span').textContent = ready ? 'New data ready, reload' : st.short;
  pill.title = ready ? `Newer data (${ready}) was downloaded. Reload to use it.` : `${st.long} Open Model and data.`;
  pill.setAttribute('aria-label', ready ? 'New data ready. Reload to use it.' : `${st.short}. Open Model and data.`);
  pill.onclick = ready ? e => { e.preventDefault(); location.reload(); } : null;
}

function renderFoot() {
  const boards = (D.meta.boards ?? []).map(b => `${b.label} (${b.date})`).join(', ');
  const asOf = D.teams.as_of;
  $('#foot').innerHTML = String(h`
    <div class="foot-row"><a class="brand wide" href="#home">Mock Draft <span>2027</span></a>
      <nav aria-label="More"><a href="#about">Model and data</a><a href="#sims">Simulations</a><a href="#mine">My Board</a></nav></div>
    <p>${dataStatus().long} Standings as of ${dateLong(asOf)}. The draft order is the season so far plus ${(D.teams.sims ?? 2000).toLocaleString('en-US')} simulations of the rest (computed).</p>
    <p>Sources: cfbfastR-data (college stats and rosters), nflverse (drafts, combine, rosters, snaps, contracts, games, trades) and the public big boards: ${boards}. ${D.art?.source ? `Logos and colours: ${D.art.source}.` : ''} Player photos load from ESPN. Not affiliated with the NFL, any team, or any of these sources.</p>`);
}

let updated = null;
function openMore() {
  const st = dataStatus();
  const menu = h`<h3 class="wide">More</h3>
    <ul class="menu">
      <li><a href="#sims">${icon('dice')}<span>Simulations<small>Run hundreds of mock drafts at once</small></span></a></li>
      <li><a href="#about">${icon('info')}<span>Model and data<small>How it works, sources and tests</small></span></a></li>
      ${updated ? h`<li><button type="button" id="moreReload">${icon('refresh')}<span>New data ready<small>Reload to use the data from ${date(updated)}</small></span></button></li>` : ''}
    </ul>
    <p class="note">${st.long} Standings as of ${dateLong(D.teams.as_of)}.</p>`;
  const bs = bottomSheet({ content: menu, label: 'More' });
  bs.el.addEventListener('click', e => {
    if (e.target.closest('#moreReload')) { location.reload(); return; }
    if (e.target.closest('a')) bs.close('code');
  });
}

// ---------- boot ----------
async function boot() {
  try {
    D = await loadData(FILES, { optional: OPTIONAL });
  } catch (e) {
    $('#view').innerHTML = String(h`<div class="oops surface"><h1>Could not load the data.</h1><p class="muted">${e.message}</p>
      <p class="muted">Open the app through a local server (run <code>npm start</code> in the repo), not by double-clicking the file.</p></div>`);
    return;
  }
  D.byId = new Map(D.prospects.map(p => [p.id, p]));
  D.index = new Map(D.prospects.map((p, i) => [p.id, i]));
  window.__md27 = D; // handy in the console while building screens
  initArt(D);
  await initFaces();
  install();
  initSearch(D);
  setPill(false);
  renderFoot();
  $('#moreBtn').addEventListener('click', openMore);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('hashchange', route);
  await route();
  // warm up the other screens while the user looks at this one
  const idle = window.requestIdleCallback ?? (fn => setTimeout(fn, 600));
  idle(() => ['home', 'board', 'player', 'draft', 'mine', 'teams', 'sims', 'about'].forEach(m => loadMod(m).catch(() => {})));
  if (isApp) {
    checkForUpdate(D.meta.built).then(b => {
      if (!b) return;
      updated = b;
      setPill(b);
      toast('New data downloaded.', { action: { label: 'Reload', run: () => location.reload() } });
    });
  }
}

boot();
