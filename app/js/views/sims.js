// Simulations (#sims): run many full mock drafts with the AI picking for every team.
//
// The runner is views/shared.js (runSims), run inside a web worker by ui/sims-run.js so the page stays responsive
// (one draft takes about half a second). The last run stays in shared.sims for every screen (player pages, the Big
// Board, team pages).
// Options: number of drafts (100-1000), every underclassman declares, AI trades on or off.
// While it runs: a progress ring. Results: headline tiles (drafts, round 1 trades per draft), each player's landing
// range (10th to 90th percentile with the middle pick) as a range bar with his chance of round 1, chance of being
// drafted and most likely teams; search, position filter and sort; then each team's most likely first pick.

import { h, raw, icon, on } from '../ui/dom.js';
import { face } from '../ui/face.js';
import { logo, teamArt, teamStyle, playerStyle, roomColors } from '../ui/art.js';
import { ring, setRing, seg, chips, statTiles, src, starBtn, empty } from '../ui/parts.js';
import { pct, num, int, rank, plural, POS_ORDER, posName, dash } from '../ui/fmt.js';
import { buildPicks } from '../draft.js';
import { shared } from './shared.js';
import { runSimsInBackground } from '../ui/sims-run.js';

const NS = [100, 200, 500, 1000];
let lastProgress = 0, hooked = false;               // progress of a run that started on another visit

// Real round 1 trades per draft weekend, from the trade data (nflverse trades, computed).
function realR1(D) {
  const per = D.trade_market?.per_draft ?? [];
  if (!per.length) return '';
  const v = per.map(d => d.r1), y = per.map(d => d.year);
  return `Real drafts ${Math.min(...y)}-${Math.max(...y)}: ${Math.min(...v)} to ${Math.max(...v)}.`;
}
const opts = { n: 200, allDeclare: false, trades: true };        // remembered while the app is open
const view_ = { q: '', pos: 'All', sort: 'mean' };

const SORTS = [
  { value: 'mean', label: 'Average pick', fn: (a, b) => a.mean - b.mean },
  { value: 'r1', label: 'Round 1', fn: (a, b) => b.r1 - a.r1 || a.mean - b.mean },
  { value: 'drafted', label: 'Drafted', fn: (a, b) => b.drafted - a.drafted || a.mean - b.mean },
  { value: 'board', label: 'Board rank', fn: (a, b) => (a.p.board_rank ?? 9999) - (b.p.board_rank ?? 9999) },
  { value: 'spread', label: 'Widest range', fn: (a, b) => (b.p90 - b.p10) - (a.p90 - a.p10) || a.mean - b.mean },
];

// Landing range scale: square root, so round 1 gets room and day 3 still fits.
const LAST = 257;
const X = pick => Math.sqrt(Math.max(0, Math.min(LAST, pick) - 1) / (LAST - 1)) * 100;

function roundStarts(D) {
  const starts = [];
  for (const p of buildPicks(D.teams)) if (!starts[p.round]) starts[p.round] = p.overall;
  return starts.map((o, r) => o && { r, o }).filter(Boolean);
}

function axis(D) {
  return h`<div class="sm-axis" aria-hidden="true"><span></span><span></span><span class="sm-axis-lbl">Player</span>
    <span class="sm-scale">${roundStarts(D).map(({ r, o }) => h`<i style="left:${X(o).toFixed(2)}%"><small>${r === 1 ? 'Round 1' : `R${r}`}</small></i>`)}</span>
    <span class="sm-axis-rest">Round 1 · Drafted · Likely teams</span></div>`;
}

function row(r) {
  const p = r.p;
  const a = X(r.p10), b = X(r.p90), m = X(r.p50);
  const label = `${p.name} lands between pick ${r.p10} and ${r.p90} in 8 of 10 drafts, middle pick ${r.p50}, average ${num(r.mean, 1)}.`;
  return h`<div class="prow sm-row" style="${raw(playerStyle(p))}">
    <span class="num small-num" title="Average pick ${num(r.mean, 1)}" aria-hidden="true">${Math.round(r.mean)}</span>${face(p, 'round')}
    <span class="who"><a class="stretch" href="#player/${p.id}">${p.name}</a><small>${p.group} · ${p.school} · Board ${rank(p.board_rank)}</small></span>
    <span class="sm-rng" role="img" aria-label="${label}">
      <span class="sm-trk"><i style="left:${a.toFixed(2)}%;width:${Math.max(0.8, b - a).toFixed(2)}%"></i><em style="left:${m.toFixed(2)}%"></em></span>
      <small><b>${r.p10}–${r.p90}</b> · middle ${r.p50} · avg ${num(r.mean, 1)}</small></span>
    <span class="cols">
      <span class="col">Round 1<b>${pct(r.r1)}</b></span>
      <span class="col wide">Drafted<b>${pct(r.drafted)}</b></span>
      <span class="sm-teams wide">${r.teams.map(([t, c]) => h`<a class="sm-team above" href="#team/${t}" title="${teamArt(t).name}: ${pct(c)}">${logo(t, 26)}<b>${pct(c)}</b></a>`)}</span>
      ${starBtn(p.id, p.name)}</span>
  </div>`;
}

function teamCard(D, s, t, first) {
  const fp = s.firstPick[t] ?? {};
  const top = Object.entries(fp).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const best = top.length ? top[0][1] : 1;
  const a = teamArt(t);
  return h`<article class="sm-tc" style="${raw(teamStyle(t))}">
    <a class="sm-tc-head" href="#team/${t}">${logo(t, 40)}<span><b>${a.nick}</b><small>First pick ${first ? `${rank(first.overall)}${first.round > 1 ? `, round ${first.round}` : ''}` : dash}</small></span>${icon('right')}</a>
    <ol class="sm-tc-list">${top.length ? top.map(([i, c]) => {
      const p = D.prospects[+i];
      return h`<li style="${raw(playerStyle(p))}"><a href="#player/${p.id}">${face(p, 'round')}<span><b>${p.name}</b><small>${p.group} · ${p.school}</small></span>
        <span class="sm-tc-p"><b>${pct(c / s.n)}</b><span class="t"><i style="width:${(c / best * 100).toFixed(1)}%"></i></span></span></a></li>`;
    }) : h`<li class="muted">No first pick in these runs.</li>`}</ol>
  </article>`;
}

export function view(el, D) {
  if (!hooked) {
    hooked = true;
    shared.listeners.add(ev => { if (ev.progress != null) lastProgress = ev.progress; if (ev.done) lastProgress = 0; });
  }
  roomColors(el, '#34405e', '#5d6b8f');
  el.innerHTML = String(h`<div class="room" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="page below-top">
    <div class="screen-head"><p class="label">Simulations</p><h1 class="screen-title">Hundreds of drafts at once</h1>
      <p class="lede">Run many full mock drafts with the AI picking for every team. You see each player's landing range and each team's most likely first pick. Every run draws who declares, each team's board noise, reaches and trades.</p></div>

    <section class="glass sm-run" aria-label="Run simulations">
      <div class="sm-ring"></div>
      <div class="sm-ctl">
        <div class="sm-field"><span class="label" id="smN">Drafts</span><span class="sm-n"></span></div>
        <div class="sm-checks">
          <label class="check"><input type="checkbox" id="smAll" ${raw(opts.allDeclare ? 'checked' : '')}>Every underclassman declares</label>
          <label class="check"><input type="checkbox" id="smTr" ${raw(opts.trades ? 'checked' : '')}>AI trades</label>
        </div>
        <div class="sm-go"><button type="button" class="btn primary" id="smGo">${icon('dice')}<span>Run drafts</span></button>
          <p class="sm-status note" role="status" aria-live="polite"></p></div>
      </div>
    </section>
    <div class="sm-out"></div>
  </div>`);

  const ringBox = el.querySelector('.sm-ring');
  const status = el.querySelector('.sm-status');
  const go = el.querySelector('#smGo');
  const out = el.querySelector('.sm-out');
  el.querySelector('.sm-n').replaceWith(seg(NS.map(n => ({ value: n, label: int(n) })), opts.n, v => { opts.n = +v; }, 'Number of drafts'));
  el.querySelector('#smAll').onchange = e => { opts.allDeclare = e.target.checked; };
  el.querySelector('#smTr').onchange = e => { opts.trades = e.target.checked; };

  const setStatus = () => {
    const s = shared.sims;
    if (shared.running) return;
    ringBox.innerHTML = String(ring(s ? 1 : 0, { size: 132, cls: s ? 'good' : '', label: s ? `${s.n} drafts run` : 'No drafts run yet', inner: h`${s ? int(s.n) : 0}<small>drafts run</small>` }));
    go.disabled = false;
    go.querySelector('span').textContent = s ? 'Run again' : 'Run drafts';
    status.textContent = s ? `Last run: ${int(s.n)} drafts${s.allDeclare ? ', every underclassman declares' : ''}${s.trades ? ', with trades' : ', no trades'}.` : 'It runs in the background, so you can keep browsing.';
  };
  const showRunning = progress => {
    go.disabled = true;
    go.querySelector('span').textContent = 'Running…';
    if (!ringBox.querySelector('.ring.live')) ringBox.innerHTML = String(ring(0, { size: 132, cls: 'live', label: 'Running', inner: h`<span class="sm-pc">0%</span><small>running</small>` }));
    const r = ringBox.querySelector('.ring');
    setRing(r, progress, `Running, ${Math.round(progress * 100)}% done`);
    r.querySelector('.sm-pc').textContent = `${Math.round(progress * 100)}%`;
    status.textContent = 'You can keep browsing. Results show here and on every player page when it finishes.';
  };

  // ---------- results ----------
  let rows = [], shown = 0, io = null;
  const PAGE = 50;
  const drawResults = () => {
    io?.disconnect();
    const s = shared.sims;
    if (!s && shared.running) {
      out.innerHTML = String(h`<div class="sm-empty">${empty({ title: 'Your drafts are running', text: 'Each player\'s landing range and each team\'s most likely first pick show here when the run finishes.', iconName: 'clock' })}</div>`);
      return;
    }
    if (!s) {
      out.innerHTML = String(h`<div class="sm-empty">${empty({ title: 'No drafts run yet', text: 'Pick how many drafts to run and press Run drafts. You get each player\'s landing range, his chance of going in round 1 and his likely teams, plus each team\'s most likely first pick.', iconName: 'dice' })}</div>`);
      return;
    }
    const all = s.summary.filter(x => x.drafted > 0.02 && x.mean != null).map(x => ({ ...x, p: D.prospects[x.i] }));
    const counts = {};
    for (const r of all) counts[r.p.group] = (counts[r.p.group] ?? 0) + 1;
    const groups = [{ value: 'All', label: 'All', count: all.length }, ...POS_ORDER.filter(g => counts[g]).map(g => ({ value: g, label: g, count: counts[g] }))];
    if (view_.pos !== 'All' && !counts[view_.pos]) view_.pos = 'All';
    const r1Players = all.filter(r => r.r1 > 0).length;
    const firsts = new Map();
    for (const k of buildPicks(D.teams)) if (!firsts.has(k.owner)) firsts.set(k.owner, k);
    const teamList = [...firsts.values()].sort((a, b) => a.overall - b.overall);

    out.innerHTML = String(h`
      <section class="sm-sec">
        ${statTiles([
          { value: int(s.n), label: 'Drafts run', note: `${s.allDeclare ? 'Every underclassman declares' : 'Underclassmen declare by chance'}. ${s.trades ? 'AI trades on' : 'No trades'}.` },
          { value: num(s.round1TradesPerDraft, 1), label: 'Round 1 trades per draft', note: realR1(D), src: 'computed' },
          { value: int(r1Players), label: 'Players taken in round 1 at least once', src: 'computed' },
          { value: int(all.length), label: 'Players drafted in more than 2% of runs', src: 'computed' },
        ])}
      </section>
      <section class="sm-sec">
        <div class="sm-head"><h2>Where each player lands</h2><span class="note">${src('computed', `From ${int(s.n)} simulated drafts`)} The bar runs from the 10th to the 90th percentile pick; the dot is the middle pick.</span></div>
        <div class="sm-tools">
          <label class="search-field sm-search">${icon('search')}<input class="input" type="search" placeholder="Search players or schools" aria-label="Search players or schools" value="${view_.q}"></label>
          <span class="sm-sort"></span>
        </div>
        <span class="sm-chips"></span>
        <p class="sm-count note" aria-live="polite"></p>
        ${axis(D)}
        <div class="rows sm-rows"></div>
        <div class="sm-more"></div>
      </section>
      <section class="sm-sec">
        <div class="sm-head"><h2>Each team's most likely first pick</h2><span class="note">${src('computed', `Share of ${int(s.n)} drafts`)} In 2027 pick order. A team that trades its first pick has a smaller sample.</span></div>
        <div class="sm-tgrid">${teamList.map(k => teamCard(D, s, k.owner, k))}</div>
      </section>`);

    out.querySelector('.sm-chips').replaceWith(chips(groups, view_.pos, v => { view_.pos = v; list(); }, 'Position'));
    out.querySelector('.sm-sort').replaceWith(seg(SORTS.map(x => ({ value: x.value, label: x.label })), view_.sort, v => { view_.sort = v; list(); }, 'Sort by'));
    const input = out.querySelector('.sm-search input');
    let t = 0;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { view_.q = input.value; list(); }, 120); });

    const box = out.querySelector('.sm-rows'), more = out.querySelector('.sm-more'), count = out.querySelector('.sm-count');
    const addPage = () => {
      const next = rows.slice(shown, shown + PAGE);
      box.insertAdjacentHTML('beforeend', String(h`${next.map(row)}`));
      shown += next.length;
      more.innerHTML = shown < rows.length ? String(h`<button type="button" class="btn glass small">Show more (${int(rows.length - shown)} left)</button>`) : '';
    };
    const list = () => {
      const q = view_.q.trim().toLowerCase();
      const sort = SORTS.find(x => x.value === view_.sort) ?? SORTS[0];
      rows = all.filter(r => (view_.pos === 'All' || r.p.group === view_.pos) &&
        (!q || r.p.name.toLowerCase().includes(q) || String(r.p.school).toLowerCase().includes(q))).sort(sort.fn);
      shown = 0;
      box.innerHTML = '';
      count.textContent = `${plural(rows.length, 'player')}${view_.pos !== 'All' ? ` at ${posName(view_.pos).toLowerCase()}` : ''}${q ? ` matching "${view_.q.trim()}"` : ''}.`;
      if (!rows.length) { box.innerHTML = String(empty({ title: 'No players match', text: 'Try another position or search.' })); more.innerHTML = ''; return; }
      addPage();
    };
    more.addEventListener('click', e => { if (e.target.closest('button')) addPage(); });
    io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting) && shown < rows.length) addPage(); }, { rootMargin: '600px' });
    io.observe(more);
    list();
  };

  go.onclick = () => {
    if (shared.running) return;
    showRunning(0);
    if (!shared.sims) queueMicrotask(drawResults);
    runSimsInBackground(D, { n: opts.n, allDeclare: opts.allDeclare, trades: opts.trades });
  };
  const listener = ev => {
    if (!el.isConnected) return;
    if (ev.progress != null && !ev.done) showRunning(ev.progress);
    if (ev.done) { setStatus(); drawResults(); }
  };
  shared.listeners.add(listener);
  const offEnter = on(el, 'keydown', '.sm-search input', e => { if (e.key === 'Enter') e.target.blur(); });

  if (shared.running) showRunning(lastProgress); else setStatus();
  drawResults();
  return () => { shared.listeners.delete(listener); io?.disconnect(); offEnter?.(); };
}
