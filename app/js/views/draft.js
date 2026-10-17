// Mock Draft: the draft room. Setup (your teams and options) -> the live studio for all 7 rounds -> the recap.
//
// Routes: #mock opens the live draft if there is one, else the setup. #mock/ABBR opens the setup with that team
// chosen (a live draft stays: the room offers "Start a new draft as <team>" instead).
// The engine is draft.js and ai/* (unchanged): newDraft, advance (one pick at a time here, so the page never
// freezes), makePick, choices, explainPick, the calls (S.calls) and proposeTrade. The live draft stays in this
// module between visits. Pieces live in ui/draft-parts.js, ui/draft-trade.js and ui/draft-recap.js.

import { h, raw, icon, toast, bottomSheet, moment, openLayers, reduceMotion } from '../ui/dom.js';
import { logo, teamArt, roomColors, accentStyle, playerStyle } from '../ui/art.js';
import { face } from '../ui/face.js';
import { pill, posPill, src, ring, kpis, outcomeBar, outcomeLegend, chips, seg, teamTile, empty } from '../ui/parts.js';
import { ht, wt, pct, posName, className, classShort, POS_ORDER } from '../ui/fmt.js';
import { newDraft, advance, makePick, available, choices, explainPick, classRanks, buildPicks, declineCall, CLOCK } from '../draft.js';
import { odds, survival } from '../ai/market.js';
import { store } from '../store.js';
import { needsOf, needWord, keyStats, nextOwnPick, tradeRow, quickRead, miniRow, nick, hitBand } from '../ui/draft-parts.js';
import { openTradeSheet, openCallSheet, answerCall, callText } from '../ui/draft-trade.js';
import { recapView } from '../ui/draft-recap.js';

let S = null;          // the live draft (engine state)
let opts = null;       // the options it started with: { allDeclare, trades, seed, pace }
let run = 0;           // bump to stop the pick loop
let running = null;    // the mode the loop runs in ('auto' | 'one' | 'mine' | 'end'), or null
let M = null;          // the mounted studio
const ui = { pos: 'All', q: '', sort: 'consensus', side: '' };
const PACE = { calm: 800, fast: 100, instant: 0 };
// How long a call from the team on the clock waits for your answer before it picks instead (ms, by pace).
const CALL_WAIT = { calm: 5000, fast: 2500, instant: 2500 };
const PACES = [{ value: 'calm', label: 'Calm' }, { value: 'fast', label: 'Fast' }, { value: 'instant', label: 'Instant' }];
const layers = new Set();

const randomSeed = () => Math.floor(Math.random() * 9999) + 1;
const userTurn = () => S && S.next < S.picks.length && S.userTeams.has(S.picks[S.next].owner);
const track = handle => { if (handle) { layers.add(handle); } return handle; };
function unmount() { M?.unResize?.(); M = null; }

export function view(el, D, arg) {
  const want = arg ? String(arg).toUpperCase() : null;
  const team = want && D.teams.teams[want] ? want : null;
  const inProgress = S && S.next < S.picks.length;
  if (team && !inProgress) S = null;
  if (!S) setup(el, D, team ? [team] : null);
  else if (!inProgress) recap(el, D);
  else studio(el, D, team);
  return () => {
    run++;
    running = null;
    unmount();
    for (const l of layers) l.close('route-instant');
    layers.clear();
  };
}

// ---------------------------------------------------------------- setup
function setup(el, D, pre) {
  run++; running = null; unmount();
  const T = D.teams;
  const picks = buildPicks(T);
  const byTeam = {};
  for (const p of picks) (byTeam[p.owner] ??= []).push(p);
  const saved = (store.setting('mockTeams') ?? []).filter(t => T.teams[t]);
  const sel = new Set(pre ?? saved);
  const o = { allDeclare: opts?.allDeclare ?? false, trades: opts?.trades ?? true, pace: store.setting('mockPace') ?? opts?.pace ?? 'calm' };
  const sub = t => {
    const list = byTeam[t] ?? [];
    if (!list.length) return 'No picks';
    return list[0].round === 1 ? `Pick ${list[0].overall}` : `First pick ${list[0].overall}`;
  };
  window.scrollTo(0, 0);
  el.innerHTML = String(h`<div class="room" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="page below-top dr-setup">
      <header class="dr-shead">
        <p class="label">Mock Draft</p>
        <h1 class="screen-title wide">Run the draft.</h1>
        <p class="lede">Pick for one team or several. The AI picks for the rest the way real front offices have. It sees the public board through each team's own scouts, and weighs position value by round, needs, scheme fit, its GM's history and runs on a position. AI teams trade up and down in every round, sometimes with 2028 picks, and they call you with offers.</p>
      </header>
      <div class="dr-setgrid">
        <section class="glass panel dr-teams" aria-label="Choose your teams">
          <h2>Your teams <small data-count></small></h2>
          <p class="note">Tap a team to pick for it. Tap again to let the AI pick. In projected 2027 draft order. ${src('computed', 'Order projected from the 2026 season so far')}</p>
          <div class="dr-teamgrid">${T.order.map(t => teamTile(t, { tag: 'button', size: 60, sub: sub(t), attrs: `data-team="${t}" aria-pressed="${sel.has(t)}"` }))}</div>
          <div class="dr-row"><button type="button" class="btn small ghost" data-act="clear">Clear all</button></div>
        </section>
        <section class="glass panel dr-opts" aria-label="Options">
          <h2>Options</h2>
          <label class="check"><input type="checkbox" data-opt="allDeclare" ${raw(o.allDeclare ? 'checked' : '')}><span>Every underclassman declares<small>Otherwise each one is drawn by his chance to declare.</small></span></label>
          <label class="check"><input type="checkbox" data-opt="trades" ${raw(o.trades ? 'checked' : '')}><span>AI teams can trade<small>With each other and with you.</small></span></label>
          <div class="dr-field"><span class="label">Seed</span>
            <div class="dr-seed"><input class="input tnum" data-seed inputmode="numeric" aria-label="Seed" value="${randomSeed()}"><button type="button" class="icon-btn" data-act="dice" aria-label="New seed">${icon('dice')}</button></div>
            <small class="note">The same seed gives the same draft.</small></div>
          <div class="dr-field"><span class="label">Pace</span><div data-pace></div><small class="note">How fast AI picks come in. Sim to the end is always instant.</small></div>
          <div class="dr-start"><button type="button" class="btn primary block" data-act="start">Start the draft</button><p class="muted" data-summary aria-live="polite"></p></div>
        </section>
      </div>
    </div>`);
  const root = el.querySelector('.dr-setup');
  let pace = o.pace;
  root.querySelector('[data-pace]').appendChild(seg(PACES, pace, v => { pace = v; }, 'Pace'));
  const light = t => { const a = teamArt(t ?? T.order[0]); roomColors(el, a.c1, a.c2); };
  const summary = () => {
    const list = T.order.filter(t => sel.has(t));
    const n = list.reduce((s, t) => s + (byTeam[t]?.length ?? 0), 0);
    root.querySelector('[data-count]').textContent = list.length ? `${list.length} chosen` : '';
    root.querySelector('[data-summary]').textContent = !list.length ? 'No team chosen. You watch the AI draft all 7 rounds.'
      : list.length === 1 ? `You pick for the ${nick(list[0])}: ${n} picks, the first at No. ${byTeam[list[0]]?.[0]?.overall ?? '–'}.`
        : `You pick for ${list.length} teams: ${n} picks in all.`;
    root.querySelector('[data-act="start"]').textContent = list.length ? 'Start the draft' : 'Watch the AI draft';
  };
  light(T.order.find(t => sel.has(t)));
  summary();
  root.addEventListener('click', e => {
    const tile = e.target.closest('[data-team]');
    if (tile) {
      const t = tile.dataset.team;
      if (sel.has(t)) sel.delete(t); else sel.add(t);
      tile.setAttribute('aria-pressed', String(sel.has(t)));
      light(sel.has(t) ? t : T.order.find(x => sel.has(x)));
      summary();
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'clear') {
      sel.clear();
      root.querySelectorAll('[data-team]').forEach(b => b.setAttribute('aria-pressed', 'false'));
      light(null); summary();
    } else if (act === 'dice') root.querySelector('[data-seed]').value = randomSeed();
    else if (act === 'start') {
      const seed = Math.max(1, Math.round(+root.querySelector('[data-seed]').value) || 1);
      start(el, D, T.order.filter(t => sel.has(t)), {
        allDeclare: root.querySelector('[data-opt="allDeclare"]').checked,
        trades: root.querySelector('[data-opt="trades"]').checked, seed, pace,
      });
    }
  });
}

function start(el, D, teams, o) {
  store.setting('mockTeams', teams);
  store.setting('mockPace', o.pace);
  opts = { ...o };
  S = newDraft({ prospects: D.prospects, teams: D.teams, chart: D.value_chart, model: D.ai_model, market: D.trade_market,
    userTeams: teams, allDeclare: o.allDeclare, trades: o.trades, seed: o.seed });
  S.userTeamsAtStart = teams;
  S.seed = o.seed;
  S.paused = false;
  Object.assign(ui, { pos: 'All', q: '', sort: 'consensus', side: '' });
  studio(el, D);
}

// ---------------------------------------------------------------- studio
function studio(el, D, offerTeam = null) {
  run++; running = null; unmount();
  opts ??= { allDeclare: false, trades: true, seed: S.seed ?? 1, pace: 'calm' };
  window.scrollTo(0, 0);
  const groups = ['All', ...POS_ORDER.filter(g => g !== 'LS')];
  el.innerHTML = String(h`<div class="room" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="page below-top dr-studio" data-side="${ui.side}">
      ${offerTeam ? h`<div class="glass dr-resume">${logo(offerTeam, 36)}<span>Your draft is still on, at pick ${S.picks[S.next].overall} of ${S.picks.length}. Keep going, or start over.</span>
        <button type="button" class="btn small primary" data-act="newas" data-team="${offerTeam}">Start a new draft as the ${nick(offerTeam)}</button></div>` : ''}
      <aside class="glass panel dr-feedp" aria-label="Pick feed"><h2>Picks <small data-feednote></small></h2><ol class="dr-feed" data-feed></ol></aside>
      <div class="dr-stage">
        <div class="otc glass dr-otc"><div class="dr-otc-main" data-otc></div><div class="dr-ctrl"><div class="dr-btns" data-btns></div><div data-pace></div></div></div>
        <div class="dr-switch" data-switch></div>
        <div class="dr-pickarea">
          <div class="dr-pickbar"><div data-chips></div>
            <div class="dr-tools"><label class="search-field">${icon('search')}<input class="input" type="search" placeholder="Search players" data-q aria-label="Search available players" value="${ui.q}"></label><div data-sort></div></div></div>
          <div class="dr-flow"><div class="dr-cards" data-cards tabindex="0" aria-label="Available players"></div>
            <div class="dr-arrows"><button type="button" data-scroll="-1" aria-label="Previous players">${icon('left')}</button><button type="button" data-scroll="1" aria-label="More players">${icon('right')}</button></div></div>
          <div class="dr-legend">${outcomeLegend()}<span class="note">The bar: what became of players at his position taken at this pick, 2000-2021. ${src('computed', 'nflverse draft picks, seasons started and Pro Bowls')}
            The chance he is still there comes from the draft AI's own projection of the picks in between. ${src('computed', 'Draft AI')}</span></div>
        </div>
      </div>
      <aside class="glass panel dr-warp" aria-label="War room" data-war></aside>
    </div>
    <div data-banner></div>`);
  const root = el.querySelector('.dr-studio');
  M = {
    el, D, root, mine: new Set(S.userTeamsAtStart ?? []), rank: classRanks(S), feedCache: [], lastCards: '', lastWar: '',
    otc: root.querySelector('[data-otc]'), btns: root.querySelector('[data-btns]'), feed: root.querySelector('[data-feed]'),
    cards: root.querySelector('[data-cards]'), war: root.querySelector('[data-war]'), banner: el.querySelector('[data-banner]'),
    feedNote: root.querySelector('[data-feednote]'), justMade: -1, feedHover: false, resumeMode: 'auto', rates: new Map(),
  };
  // feed skeleton: a header per round, one row per pick
  const rows = [];
  let r = 0;
  S.picks.forEach((p, k) => {
    if (p.round !== r) { r = p.round; rows.push(`<li class="rh">Round ${r}</li>`); }
    rows.push(`<li data-k="${k}"></li>`);
  });
  M.feed.innerHTML = rows.join('');
  M.lis = [...M.feed.querySelectorAll('li[data-k]')];
  M.feed.addEventListener('pointerenter', () => { M && (M.feedHover = true); });
  M.feed.addEventListener('pointerleave', () => { M && (M.feedHover = false); });

  root.querySelector('[data-pace]').appendChild(seg(PACES, opts.pace, v => { opts.pace = v; store.setting('mockPace', v); }, 'Pace'));
  root.querySelector('[data-chips]').appendChild(chips(groups, ui.pos, v => { ui.pos = v; paintCards(); }, 'Position'));
  root.querySelector('[data-sort]').appendChild(seg([{ value: 'consensus', label: 'Consensus' }, { value: 'mine', label: 'My Board' }], ui.sort, v => { ui.sort = v; paintCards(); }, 'Sort'));
  root.querySelector('[data-switch]').appendChild(seg([{ value: '', label: 'Players' }, { value: 'feed', label: 'Pick feed' }, { value: 'war', label: 'War room' }], ui.side, v => { ui.side = v; root.dataset.side = v; }, 'Show'));
  const q = root.querySelector('[data-q]');
  q.addEventListener('input', () => { ui.q = q.value.trim(); paintCards(); });
  M.cards.addEventListener('scroll', () => requestAnimationFrame(flowFx), { passive: true });
  const onResize = () => flowFx();
  window.addEventListener('resize', onResize, { passive: true });
  M.unResize = () => window.removeEventListener('resize', onResize);

  root.addEventListener('click', e => onClick(e, el, D));
  el.querySelector('[data-banner]').addEventListener('click', () => openCalls(0));

  paint();
  if (S.calls.length) showBanner();
  else if (userTurn()) onUserClock();
  else if (!S.paused) go(M.resumeMode);
}

function onClick(e, el, D) {
  const b = e.target.closest('button');
  if (!b || !S) return;
  if (b.dataset.draft != null) return userPick(+b.dataset.draft, 'user');
  if (b.dataset.scroll) { M.cards.scrollBy({ left: +b.dataset.scroll * 316, behavior: reduceMotion ? 'auto' : 'smooth' }); return; }
  if (b.dataset.callYes != null || b.dataset.callNo != null) {
    const call = S.calls[+(b.dataset.callYes ?? b.dataset.callNo)];
    if (call) afterCall(answerCall(S, call, b.dataset.callYes != null));
    return;
  }
  if (b.dataset.callOpen != null) return openCalls(+b.dataset.callOpen);
  switch (b.dataset.act) {
    case 'pause': run++; running = null; S.paused = true; paint(); break;
    case 'resume': go('auto'); break;
    case 'one': go('one'); break;
    case 'mine': go('mine'); break;
    case 'end': confirmEnd(); break;
    case 'auto': { const c = choices(S, S.picks[S.next].owner, 1)[0]; if (c) userPick(c.i, 'user-auto'); break; }
    case 'trade': openTrade(); break;
    case 'calls': openCalls(0); break;
    case 'new': confirm('Start a new draft?', 'This draft ends. Your board and settings stay.', 'New draft', () => { S = null; setup(el, D); }); break;
    case 'newas': { const t = b.dataset.team; S = null; setup(el, D, [t]); break; }
    default:
  }
}

function confirm(title, text, yes, onYes) {
  const sh = track(bottomSheet({
    label: title, cls: 'dr-sheet',
    content: String(h`<div class="dr-tsheet"><h3 class="wide">${title}</h3><p class="muted">${text}</p>
      <div class="dr-row"><button type="button" class="btn primary" data-yes>${yes}</button><button type="button" class="btn glass" data-no>Cancel</button></div></div>`),
    onClose: () => layers.delete(sh),
  }));
  sh.el.addEventListener('click', e => {
    if (e.target.closest('[data-yes]')) { sh.close('yes'); onYes(); } else if (e.target.closest('[data-no]')) sh.close('no');
  });
}

function confirmEnd() {
  const mineLeft = S.userTeams.size && nextOwnPick(S, S.userTeams, S.next) != null;
  if (!mineLeft) return go('end');
  confirm('Sim to the end?', 'The AI makes the rest of your picks too, the way it would for your team.', 'Sim to the end', () => go('end'));
}

// ---------------------------------------------------------------- the pick loop
const tick = () => new Promise(r => setTimeout(r, 0));

// Wait `ms`, and keep waiting while a sheet or moment is open. False if the loop was stopped.
async function hold(ms, my) {
  const t0 = performance.now();
  for (;;) {
    const left = ms - (performance.now() - t0);
    await new Promise(r => setTimeout(r, Math.max(16, Math.min(120, left))));
    if (my !== run || !M) return false;
    if (performance.now() - t0 >= ms && !openLayers()) return true;
  }
}

async function go(mode = 'auto') {
  if (!S || !M) return;
  const my = ++run;
  if (mode === 'end') {
    // You chose to stop picking: the AI finishes for your teams too, and open calls are turned down.
    for (const c of [...S.calls]) declineCall(S, c);
    S.userTeams.clear();
    M.banner.innerHTML = '';
  }
  running = mode;
  M.resumeMode = mode === 'one' ? 'auto' : mode;
  S.paused = false;
  paintOtc(); paintCtrl();
  let n = 0, heavy = 0;
  while (my === run && M) {
    if (S.next >= S.picks.length) return finish();
    if (S.calls.length) { running = null; paint(); showBanner(); if (!userTurn()) expireCalls(my); return; }
    if (userTurn()) {
      // The market runs first at your pick: teams behind you may call to move up.
      const st = advance(S, { until: S.next + 1 });
      if (st === 'call') continue;
      running = null;
      paint();
      onUserClock();
      return;
    }
    const pace = mode === 'end' || mode === 'mine' || mode === 'one' || reduceMotion ? 'instant' : (opts.pace ?? 'calm');
    if (pace !== 'instant' && !(await hold(PACE[pace], my))) return;
    if (my !== run || !M) return;
    const before = S.next;
    const st = advance(S, { stopAtUser: mode !== 'end', until: S.next + 1 });
    if (S.next > before) { M.justMade = before; n++; }
    if (st === 'call' || st === 'user') continue;
    if (mode === 'one') { running = null; S.paused = true; paint(); return; }
    if (pace === 'instant') {
      if (n % 6 === 0 || openLayers()) { paintFeed(); paintOtc(); if (!(await hold(0, my))) return; }
    } else {
      paintFeed(); paintOtc(); paintCtrl();
      const now = performance.now();
      if (pace === 'calm' || now - heavy > 450) { heavy = now; paintCards(); paintWar(); }
    }
  }
}

function finish() {
  running = null;
  const { el, D } = M;
  recap(el, D);
  toast('The draft is done.');
}

function onUserClock() {
  if (!M) return;
  M.cards.scrollLeft = 0;
  if (ui.side) { ui.side = ''; M.root.dataset.side = ''; M.root.querySelector('[data-switch] .seg')?.set(''); }
  // Bring the player cards (and their Draft buttons) into view when it's your pick.
  requestAnimationFrame(() => {
    if (!M || openLayers()) return;
    const r = M.cards.getBoundingClientRect();
    const topbar = document.querySelector('.top')?.getBoundingClientRect().bottom ?? 70;
    const tab = document.querySelector('.tabbar');
    const bottom = innerHeight - (tab && getComputedStyle(tab).display !== 'none' ? tab.offsetHeight : 0);
    // Keep the clock card in view when the whole stage fits; the Draft buttons always come into view.
    const otcTop = M.otc.parentElement.getBoundingClientRect().top;
    const btn = M.cards.querySelector('[data-draft]')?.getBoundingClientRect();
    const must = btn ? btn.bottom - bottom + 12 : 0;
    const keep = window.matchMedia('(max-width:760px)').matches ? r.top - topbar - 8 : otcTop - topbar - 8;
    if (r.bottom > bottom) window.scrollBy({ top: Math.max(0, must, Math.min(r.bottom - bottom + 12, keep)), behavior: reduceMotion ? 'auto' : 'smooth' });
  });
  M.otc.parentElement.classList.remove('pulse');
  void M.otc.parentElement.offsetWidth;
  M.otc.parentElement.classList.add('pulse');
}

function userPick(i, how) {
  if (!userTurn() || S.calls.length) return;
  run++; running = null;
  const k = S.next;
  makePick(S, i, how);
  M.justMade = k;
  paint();
  reveal(k);
}

function reveal(k) {
  const D = M.D;
  const pk = S.picks[k];
  const p = D.prospects[pk.player];
  const t = teamArt(pk.owner);
  const q = quickRead(S, D, k);
  const m = track(moment({
    label: 'The pick is in', cls: 'dr-moment', style: accentStyle(t.c1, t.c2), initialFocus: '[data-go]',
    content: String(h`<div class="reveal">
      <p class="kicker">The pick is in</p>
      <div class="reveal-top">${logo(pk.owner, 84)}<span class="reveal-no">${pk.overall}</span></div>
      ${face(p, 'cut')}
      <p class="reveal-sub">The ${t.name} select</p>
      <h2 class="reveal-name">${p.name}</h2>
      <p class="reveal-meta">${posName(p.group)} · ${p.school} · ${className(p.class_year)}${pk.how === 'user-auto' ? ' · the AI picked for you' : ''}</p>
      <div class="verdict"><b>${q.grade}</b><div><p class="label">Quick read</p><p>${q.lines.join(' ')}</p>
        <p class="note">${src('computed', 'From class rank, team needs and hit rates (nflverse 2000-2021)')} A quick read, not a forecast.</p></div></div>
      <div class="actions dr-row"><button type="button" class="btn primary" data-go>Continue the draft</button><a class="btn glass" href="#player/${p.id}">See profile</a></div>
    </div>`),
    onClose: reason => {
      layers.delete(m);
      if (M && S && reason !== 'route-instant' && !running && !userTurn()) go('auto');
      else if (M && userTurn()) { paint(); onUserClock(); }
    },
  }));
  m.el.addEventListener('click', e => { if (e.target.closest('[data-go]')) m.close('button'); });
}

// ---------------------------------------------------------------- calls and trades
// A team on the clock that calls you can't wait long: if you don't open the call, it picks instead.
// Calls at your own pick stay until you answer them.
async function expireCalls(my) {
  if (!(await hold(CALL_WAIT[opts?.pace ?? 'calm'] ?? 8000, my))) return;
  if (my !== run || !M || S.paused || userTurn() || !S.calls.length) return;
  for (const c of [...S.calls]) declineCall(S, c);
  M.banner.innerHTML = '';
  go(M.resumeMode ?? 'auto');
}

function showBanner() {
  if (!M) return;
  const c = S.calls[0];
  if (!c) { M.banner.innerHTML = ''; return; }
  const t = teamArt(c.team);
  M.banner.innerHTML = String(h`<button type="button" class="dr-banner" aria-label="Trade call from the ${t.name}. Open the offer.">${logo(c.team, 40)}
    <span><b>${t.name} · Trade call</b><small>${c.note} Tap to see the offer.</small></span><span class="when">${S.calls.length > 1 ? `${S.calls.length} calls` : 'now'}</span></button>`);
}

function openCalls(n) {
  const call = S?.calls[n];
  if (!call) return;
  const sh = track(openCallSheet(S, M.D, call, {
    onAnswer: (accepted, msg) => afterCall({ accepted, msg }),
    onClose: () => layers.delete(sh),
  }));
}

function afterCall(res) {
  toast(res.msg);
  if (!M) return;
  if (S.calls.length) { paint(); showBanner(); return; }
  M.banner.innerHTML = '';
  M.rank = classRanks(S);
  if (userTurn()) {
    // The market at your pick has already run; this only checks for nothing new and stops.
    paint(); onUserClock();
  } else go(M.resumeMode ?? 'auto');
}

function openTrade(partner) {
  const wasRunning = running;
  const sh = track(openTradeSheet(S, M.D, {
    partner,
    onDone: () => {
      if (!M) return;
      paint();
      if (!wasRunning && !userTurn() && !S.paused) go('auto');
    },
    onClose: () => { layers.delete(sh); if (M) paint(); },
  }));
}

// ---------------------------------------------------------------- painting
function paint() {
  if (!M || !S || S.next >= S.picks.length) return;
  paintOtc(); paintCtrl(); paintFeed(); paintCards(); paintWar();
}

function paintOtc() {
  if (!M || S.next >= S.picks.length) return;
  const pk = S.picks[S.next];
  const t = teamArt(pk.owner);
  roomColors(M.el, t.c1, t.c2);
  const mine = S.userTeams.has(pk.owner);
  const limit = CLOCK[pk.round - 1];
  const used = S.clock.pick === S.next ? S.clock.used : 0;
  const rec = M.D.teams.teams[pk.owner]?.record;
  const needs = needsOf(M.D, pk.owner).slice(0, 3);
  const html = String(h`<div class="otc-team">${logo(pk.owner, 76)}<div><p class="label">${mine ? 'You are on the clock' : 'On the clock'}</p><h1 class="wide">${t.name}</h1>
      <p>Pick ${pk.overall} · Round ${pk.round}${pk.owner !== pk.original ? ` · from the ${nick(pk.original)}` : ''}${pk.comp ? ' · compensatory pick (placeholder)' : ''}${rec ? ` · ${rec} this season` : ''}</p></div></div>
    <div class="dr-clock">${mine
      ? ring(used / limit, { size: 92, cls: used / limit >= 0.7 ? 'live' : '', label: `${used} of ${limit} minutes used`, inner: h`${limit - used}<small>min left</small>` })
      : ring(0.28, { size: 92, cls: running ? 'thinking' : '', label: `${limit} minute clock`, inner: h`${limit}<small>min clock</small>` })}
      <small>${mine ? 'Offers use the clock' : running ? 'Picking now' : S.paused ? 'Paused' : 'Waiting'}</small></div>
    <div class="needsrow"><span>Biggest needs</span>${needs.map(([g, v]) => pill(g, v >= 0.6 ? 'gold' : ''))}${src('computed', 'From contracts, snaps and depth')}</div>`);
  if (html !== M.lastOtc) { M.otc.innerHTML = html; M.lastOtc = html; }
}

function paintCtrl() {
  if (!M || S.next >= S.picks.length) return;
  const mine = userTurn();
  const left = S.userTeams.size && nextOwnPick(S, S.userTeams, S.next) != null;
  const btn = (act, text, cls = 'glass') => h`<button type="button" class="btn small ${cls}" data-act="${act}">${text}</button>`;
  const out = [];
  if (S.calls.length) out.push(btn('calls', S.calls.length > 1 ? 'Answer the calls' : 'Answer the call', 'primary'));
  else if (mine) out.push(btn('auto', 'Let the AI pick for me', 'primary'));
  else if (running === 'auto') out.push(btn('pause', 'Pause'));
  else if (running) out.push(btn('pause', 'Stop'));
  else out.push(btn('resume', 'Resume', 'primary'));
  if (!mine && !S.calls.length) {
    out.push(btn('one', 'Sim one pick'));
    if (left) out.push(btn('mine', 'Skip to my pick'));
  }
  out.push(btn('end', 'Sim to the end'));
  if (S.userTeams.size) out.push(btn('trade', 'Make a trade'));
  out.push(btn('new', 'New draft', 'ghost'));
  const html = String(h`${out}`);
  if (html !== M.lastBtns) { M.btns.innerHTML = html; M.lastBtns = html; }
}

function feedItem(k) {
  const D = M.D;
  const pk = S.picks[k];
  const mine = M.mine.has(pk.owner);
  const from = pk.owner !== pk.original ? ` · from ${pk.original}` : '';
  if (pk.player != null) {
    const p = D.prospects[pk.player];
    const why = pk.how === 'ai' ? explainPick(S, k) : [];
    const cr = M.rank.get(pk.player);
    const d = pk.overall - cr;
    const tag = mine ? pill(pk.how === 'user-auto' ? 'AI for you' : pk.how === 'ai' ? 'AI' : 'You', 'good')
      : Math.abs(d) >= 10 ? h`<span class="pill ${d > 0 ? 'good' : 'bad'}" title="Class rank ${cr}">${d > 0 ? '+' : ''}${d}</span>`
        : h`<span class="pill quiet" title="Class rank">#${cr}</span>`;
    return [`made${mine ? ' mine' : ''}`, String(h`<span class="n">${pk.overall}</span>${logo(pk.owner, 32)}<span class="who"><a href="#player/${p.id}">${p.name}</a>
      <small>${p.group} · ${p.school}${from}${pk.comp ? ' · comp.' : ''}</small>${why.length ? h`<small class="why">Why: ${why.join(', ')}</small>` : ''}</span>${tag}`)];
  }
  const t = teamArt(pk.owner);
  if (k === S.next) {
    return ['now', String(h`<span class="n">${pk.overall}</span>${logo(pk.owner, 32)}<span class="who"><b>${t.name}</b><small>${S.userTeams.has(pk.owner) ? 'You are on the clock' : 'On the clock'}${from}</small></span>${pill('Live', 'live')}`)];
  }
  const needs = needsOf(D, pk.owner).slice(0, 2).map(([g]) => g).join(', ');
  return [`future${mine ? ' mine' : ''}`, String(h`<span class="n">${pk.overall}</span>${logo(pk.owner, 32)}<span class="who"><b>${t.name}</b><small>${mine ? 'Your pick' : `Needs ${needs}`}${from}${pk.comp ? ' · comp. placeholder' : ''}</small></span>`)];
}

function paintFeed() {
  if (!M) return;
  let made = 0;
  for (let k = 0; k < S.picks.length; k++) {
    if (S.picks[k].player != null) made++;
    const [cls, html] = feedItem(k);
    const key = `${cls}|${html}`;
    if (M.feedCache[k] === key) continue;
    const li = M.lis[k];
    const was = M.feedCache[k];
    li.className = cls + (was && !was.startsWith('made') && cls.startsWith('made') ? ' new' : '');
    li.innerHTML = html;
    M.feedCache[k] = key;
  }
  M.feedNote.textContent = `${made} of ${S.picks.length} made`;
  const now = M.lis[S.next];
  if (now && !M.feedHover && M.feed.clientHeight) {
    const top = Math.max(0, now.offsetTop - M.feed.clientHeight / 2 + now.offsetHeight / 2);
    if (Math.abs(M.feed.scrollTop - top) > 4) M.feed.scrollTo({ top, behavior: reduceMotion || running === 'mine' || running === 'end' || opts.pace !== 'calm' ? 'auto' : 'smooth' });
  }
}

function ratesAt(group, pick) {
  const key = `${group}|${pick}`;
  if (!M.rates.has(key)) M.rates.set(key, hitBand(M.D, group, pick).rates);
  return M.rates.get(key);
}

function paintCards() {
  if (!M || S.next >= S.picks.length) return;
  const D = M.D;
  const pk = S.picks[S.next];
  const clockMine = userTurn() && !running && !S.calls.length;
  const myRank = new Map(store.get().board.map((id, i) => [id, i + 1]));
  let list = available(S);
  if (ui.pos !== 'All') list = list.filter(i => D.prospects[i].group === ui.pos);
  if (ui.q) {
    const q = ui.q.toLowerCase();
    list = list.filter(i => `${D.prospects[i].name} ${D.prospects[i].school}`.toLowerCase().includes(q));
  }
  const cons = (a, b) => D.prospects[a].board_rank - D.prospects[b].board_rank;
  list.sort(ui.sort === 'mine' ? (a, b) => (myRank.get(D.prospects[a].id) ?? 1e9) - (myRank.get(D.prospects[b].id) ?? 1e9) || cons(a, b) : cons);
  list = list.slice(0, 30);
  // The chance he lasts to your next pick, from the engine's own projection of the picks in between.
  const from = userTurn() ? S.next + 1 : S.next;
  const j = S.userTeams.size ? nextOwnPick(S, S.userTeams, from) : null;
  let o = null;
  try { o = odds(S); } catch (e) { o = null; }
  const stayAt = o && j != null && j <= o.to ? j : null;
  // At your own pick the projection has you taking the AI's top choice, so his "still there" number would mean nothing.
  const ownBest = userTurn() && o ? o.order[0] : null;
  const needTeam = userTurn() ? pk.owner : j != null ? S.picks[j].owner : null;
  const needTop = needTeam ? new Set(needsOf(D, needTeam).slice(0, 3).map(([g]) => g)) : new Set();
  const html = list.length ? list.map(i => {
    const p = D.prospects[i];
    const ks = keyStats(p);
    const mr = myRank.get(p.id);
    let line = '';
    if (o && i === ownBest) {
      line = h`<div class="odds"><span>The draft AI's top choice for you here</span></div>`;
    } else if (o) {
      if (stayAt != null) {
        const v = survival(S, i, from, stayAt);
        line = h`<div class="odds"><span>${pct(v)} chance he is still there at pick ${S.picks[stayAt].overall}</span><span class="b"><i style="width:${(v * 100).toFixed(1)}%"></i></span></div>`;
      } else if (!userTurn()) {
        const v = 1 - survival(S, i, S.next, S.next + 1);
        line = h`<div class="odds"><span>${v < 0.01 ? 'Under 1%' : pct(v)} chance the ${nick(pk.owner)} take him here</span><span class="b"><i style="width:${(v * 100).toFixed(1)}%"></i></span></div>`;
      }
    }
    return h`<article class="dr-card" style="${raw(playerStyle(p))}" aria-label="${p.name}, ${posName(p.group)}, ${p.school}">
      <div class="card-top"><span class="rk" aria-hidden="true">${p.board_rank}</span>${face(p, 'cut')}
        <span class="tags">${posPill(p.group)}${needTop.has(p.group) ? pill(`${nick(needTeam)} need`, 'good') : ''}${mr ? pill(`My Board ${mr}`, 'gold') : ''}</span></div>
      <div class="card-body">
        <div><h3 class="wide"><a href="#player/${p.id}">${p.name}</a></h3><p class="sub">${p.school} · ${classShort(p.class_year)} · ${ht(p.height)}, ${wt(p.weight)}</p>
          <p class="note">Consensus No. ${p.board_rank}${mr ? ` · your No. ${mr}` : ''}</p></div>
        ${kpis(ks.items, { cols: 3 })}<p class="note">${ks.note} ${ks.stats ? src('computed', 'cfbfastR play data') : ''}</p>
        <div class="odds"><span>If taken at pick ${pk.overall}</span>${outcomeBar(ratesAt(p.group, pk.overall))}</div>
        ${line}
        <div class="card-actions"><button type="button" class="btn primary" data-draft="${i}" ${raw(clockMine ? '' : 'disabled')}>${clockMine ? `Draft ${p.name.split(' ')[0]}` : 'Waiting'}</button><a class="btn glass" href="#player/${p.id}">Profile</a></div>
      </div></article>`;
  }).join('') : String(empty({ title: 'Nobody left here', text: 'No available player matches this filter.' }));
  if (html === M.lastCards) return;
  const keep = M.cards.scrollLeft;
  M.cards.innerHTML = html;
  M.lastCards = html;
  M.cards.scrollLeft = keep;
  flowFx();
}

// Cards near the middle of the rail sit a little larger (the mockup's carousel).
function flowFx() {
  const box = M?.cards;
  if (!box || !box.clientWidth || reduceMotion) return;
  const r0 = box.getBoundingClientRect();
  const mid = r0.left + box.clientWidth / 2;
  for (const c of box.children) {
    const r = c.getBoundingClientRect();
    const d = Math.min(1, Math.abs(r.left + r.width / 2 - mid) / (r.width * 1.4));
    c.style.setProperty('--k', (1 - d * 0.08).toFixed(3));
    c.style.setProperty('--o', (1 - d * 0.4).toFixed(3));
  }
}

function paintWar() {
  if (!M || S.next >= S.picks.length) return;
  const D = M.D;
  const pk = S.picks[S.next];
  const nx = S.userTeams.size ? nextOwnPick(S, S.userTeams, S.next) : null;
  const focus = userTurn() ? pk.owner : nx != null ? S.picks[nx].owner : [...M.mine][0] ?? pk.owner;
  const needs = needsOf(D, focus).slice(0, 5);
  let who = [];
  try {
    if (pk.target != null && !S.taken.has(pk.target)) who = [{ i: pk.target, p: 1 }];
    else who = choices(S, pk.owner, 8).map(c => ({ i: c.i, p: 1 - survival(S, c.i, S.next, S.next + 1) })).sort((a, b) => b.p - a.p).slice(0, 4);
  } catch (e) { who = []; }
  const minePicks = S.picks.filter(p => M.mine.has(p.owner));
  const made = minePicks.filter(p => p.player != null);
  const open = minePicks.filter(p => p.player == null).map(p => p.overall);
  const trades = S.tradeLog.slice().reverse();
  const html = String(h`<h2>War room <small>${M.mine.size ? nick(focus) : 'Watching'}</small></h2>
    <section><p class="label">Team needs</p>
      <div class="dr-needm">${needs.map(([g, v]) => h`<div><b>${g}</b><span class="t"><i style="width:${Math.round(v * 100)}%"></i></span><small>${needWord(v)}</small></div>`)}</div>
      <p class="note">${src('computed', 'From contracts, snaps, age and depth')}</p></section>
    <section><p class="label">Trade calls</p>
      ${S.calls.length ? S.calls.map((c, n) => { const ct = callText(S, c); return h`<div class="dr-offer"><div class="dr-sheethead">${logo(c.team, 36)}<span><b>${c.note}</b><small>You give ${ct.give}. You get ${ct.get}.</small></span></div>
        <div class="dr-row"><button type="button" class="btn small primary" data-call-yes="${n}">Accept</button><button type="button" class="btn small glass" data-call-no="${n}">No thanks</button><button type="button" class="btn small ghost" data-call-open="${n}">Details</button></div></div>`; })
        : h`<p class="note">${S.callLog?.length ? `No calls right now. ${S.callLog.length} so far.` : 'No calls yet.'}</p>`}</section>
    <section><p class="label">${userTurn() ? 'The AI would take' : 'Who goes here'}</p>
      <div class="dr-poll">${who.map(w => { const p = D.prospects[w.i]; return h`<div><span class="row"><a href="#player/${p.id}">${p.name} <span class="muted">${p.group}</span></a><b class="tnum">${w.p < 0.01 ? '<1%' : pct(w.p)}</b></span><span class="b"><i style="width:${(w.p * 100).toFixed(1)}%"></i></span></div>`; })}</div>
      <p class="note">${userTurn() ? `How the draft AI would lean for the ${nick(pk.owner)}.` : `The draft AI's odds for the ${nick(pk.owner)}: its board, needs and the day's noise.`} ${src('computed')}</p></section>
    ${M.mine.size ? h`<section><p class="label">Your picks</p>
      ${made.length ? made.map(p => miniRow(D.prospects[p.player], { n: p.overall, sub: `${D.prospects[p.player].group} · ${nick(p.owner)}` })) : h`<p class="note">None yet.</p>`}
      ${open.length ? h`<p class="note">Still to come: ${open.slice(0, 12).join(', ')}${open.length > 12 ? ` and ${open.length - 12} more` : ''}.</p>` : ''}</section>` : ''}
    <section><p class="label">Trades so far</p>
      ${trades.length ? trades.slice(0, 6).map(t => tradeRow(t)) : h`<p class="note">None yet.</p>`}
      ${trades.length > 6 ? h`<p class="note">And ${trades.length - 6} more. All of them are in the recap.</p>` : ''}</section>
    ${S.userTeams.size ? h`<button type="button" class="btn glass block" data-act="trade">Make a trade</button>` : ''}`);
  if (html !== M.lastWar) { M.war.innerHTML = html; M.lastWar = html; }
}

// ---------------------------------------------------------------- recap
function recap(el, D) {
  run++; running = null;
  unmount();
  window.scrollTo(0, 0);
  recapView(el, D, S, {
    onAgain: () => start(el, D, S.userTeamsAtStart ?? [], { ...opts, seed: randomSeed() }),
    onNew: () => { S = null; setup(el, D); },
  });
}

export function _resetForTests() { S = null; opts = null; }
