// Home: a hero carousel of the top consensus prospects, then shelves.
//
// Hero: the top 5 on the consensus board, lit in school colours, with the giant outlined rank, the face, facts,
// "Start a mock draft" and "See profile". It moves on every 7 seconds (the active dot fills as the timer),
// pauses on hover, focus, an open sheet or when scrolled away, and stays still when motion is reduced.
// Swipe on touch screens, arrow keys on the dots, and a pause button.
//
// Shelves: Your board (when it has players), Top 10, Quarterbacks, Where the boards disagree, Pick your team
// (2027 order, each tile opens the draft room with that team chosen: #mock/ABBR), Best at each position,
// Underclassmen who may stay in school, and The model's sleepers. Every player item opens #player/ID.

import { h, raw, icon, on, reduceMotion } from '../ui/dom.js';
import { face } from '../ui/face.js';
import { schoolArt, accentStyle } from '../ui/art.js';
import { posName, className, ht, wt, firstLast, pct, int, POS_ORDER } from '../ui/fmt.js';
import { posPill, poster, ranked, split, teamTile, starBtn, pill, src } from '../ui/parts.js';
import { buildPicks } from '../draft.js';
import { store } from '../store.js';
import { shared } from './shared.js';

const SLIDES = 5;          // top N of the consensus board in the hero
const SHELF_MAX = 12;
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>';

// Board names for sentences: "CBS Sports (Mike Renner)" -> "CBS Sports"
const boardName = label => String(label ?? '').replace(/\s*\(.*\)\s*$/, '');

function listJoin(parts) {
  if (parts.length < 2) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// "No. 1 on all three public boards." / "Ranked 2 by CBS Sports, 18 by NFL Draft Buzz and 5 by PFF."
function boardLine(p, D) {
  const boards = D.meta.boards ?? [];
  const ranks = boards.map(b => [boardName(b.label), p.board_ranks?.[b.label]]).filter(([, v]) => v != null);
  if (!ranks.length) return `Not on the public boards yet. No. ${p.board_rank} on our board.`;
  if (ranks.length === boards.length && ranks.every(([, v]) => v === ranks[0][1])) {
    return `No. ${ranks[0][1]} on all ${boards.length === 3 ? 'three' : boards.length} public boards.`;
  }
  const missing = boards.length - ranks.length;
  return `Ranked ${listJoin(ranks.map(([b, v]) => `${v} by ${b}`))}.${missing ? ` Not on the other ${missing === 1 ? 'board' : 'boards'} yet.` : ''}`;
}

// The shelf markup from ui/parts.js shelf(), with room for a source note and a link at once.
function shelfX({ title, note = '', link, items, id = '', cls = '' }) {
  return h`<section class="shelf ${cls}"${id ? raw(` id="${id}"`) : ''} aria-label="${title}">
    <div class="shelf-head wrap"><h2>${title}</h2><span class="hm-note">${note}${link ? h`<a href="${link.href}">${link.label}${icon('right')}</a>` : ''}</span></div>
    <div class="rail-wrap"><div class="rail">${items}</div>
      <button class="rail-btn prev" type="button" aria-label="Scroll back" disabled tabindex="-1">${icon('left')}</button>
      <button class="rail-btn next" type="button" aria-label="Scroll forward" tabindex="-1">${icon('right')}</button></div>
  </section>`;
}

export function view(el, D) {
  const P = D.prospects;
  const byCons = P.filter(p => p.consensus_rank).sort((a, b) => a.consensus_rank - b.consensus_rank);
  const byBoard = P.slice().sort((a, b) => a.board_rank - b.board_rank);
  const boards = D.meta.boards ?? [];
  const boardNames = listJoin(boards.map(b => boardName(b.label)));
  const feat = byCons.slice(0, SLIDES);

  // ---------- shelves ----------
  const topTen = byCons.slice(0, 10);

  const qbs = byBoard.filter(p => p.group === 'QB').slice(0, SHELF_MAX)
    .map(p => poster(p, { tag: p.consensus_rank ? pill(`No. ${p.consensus_rank}`) : null }));

  const splits = byCons.filter(p => boards.every(b => p.board_ranks?.[b.label] != null))
    .map(p => { const v = boards.map(b => p.board_ranks[b.label]); return [p, Math.max(...v) - Math.min(...v)]; })
    .sort((a, b) => b[1] - a[1] || a[0].consensus_rank - b[0].consensus_rank).slice(0, 10)
    .map(([p, gap]) => split(p, boards.map(b => [b.short, p.board_ranks[b.label]]), `${p.group} · ${p.school} · ${gap} spots apart`));

  // Teams in 2027 draft order: each team at its first pick (the engine's pick list, trades applied).
  const firstPick = new Map();
  for (const k of buildPicks(D.teams)) if (!firstPick.has(k.owner)) firstPick.set(k.owner, k);
  const teams = [...firstPick.values()].sort((a, b) => a.overall - b.overall)
    .map(k => teamTile(k.owner, { sub: k.round === 1 ? `Pick ${k.overall}` : `Pick ${k.overall}, round ${k.round}`, href: `#mock/${k.owner}` }));

  const bestAt = POS_ORDER.filter(g => !['K', 'P', 'LS'].includes(g))
    .map(g => byBoard.find(p => p.group === g)).filter(Boolean)
    .map(p => poster(p, { sub: posName(p.group), tag: pill(`No. ${p.board_rank}`) }));

  const shown = new Set(topTen.map(p => p.id));
  const under = byCons.filter(p => p.p_declare < 1 && !shown.has(p.id)).slice(0, SHELF_MAX)
    .map(p => poster(p, { sub: `${className(p.class_year)} · ${pct(p.p_declare)} to declare`, tag: pill(`No. ${p.consensus_rank}`) }));

  // The model's sleepers: players the draft model ranks far above the boards, or rates highly while no board lists them.
  const sleepers = byBoard.filter(p => p.model_rank && (p.consensus_rank ? p.consensus_rank - p.model_rank >= 50 : p.model_rank <= 60))
    .sort((a, b) => a.model_rank - b.model_rank).slice(0, SHELF_MAX)
    .map(p => split(p, [['Consensus', p.consensus_rank ?? '–'], ['Model', p.model_rank], ['Exp. pick', Math.round(p.exp_pick)]],
      `${p.group} · ${p.school} · ${p.consensus_rank ? `${p.consensus_rank - p.model_rank} spots higher` : 'not on the boards'}`));

  const mineShelf = () => {
    const list = store.get().board.map(id => D.byId.get(id)).filter(Boolean);
    if (!list.length) return '';
    return shelfX({
      title: 'Your board', id: 'hm-mine',
      note: `${list.length === 1 ? '1 player' : `${list.length} players`}, in your order. `,
      link: { href: '#mine', label: 'Open My Board' },
      items: list.slice(0, 20).map((p, i) => poster(p, { tag: pill(`Your No. ${i + 1}`), sub: p.consensus_rank ? `${p.school} · consensus No. ${p.consensus_rank}` : p.school })),
    });
  };

  el.innerHTML = String(h`
    <section class="hero hm-hero auto" aria-roledescription="carousel" aria-label="Top prospects on the consensus board">
      <div class="hero-art" aria-hidden="true"><div class="beam"></div></div>
      <div class="hero-num" aria-hidden="true"></div>
      <div class="hero-face" aria-hidden="true"></div>
      <div class="hero-copy wrap" role="group" aria-roledescription="slide" aria-live="off"></div>
      <div class="hm-ctl">
        <button type="button" class="hm-play" aria-label="Pause the slideshow">${raw(ICON_PAUSE)}</button>
        <div class="dots" role="group" aria-label="Choose a prospect">${feat.map((p, i) => h`<button type="button" class="dot" data-i="${i}" aria-label="Show ${p.name}, No. ${p.consensus_rank}"><i></i></button>`)}</div>
      </div>
    </section>
    <div class="hm-shelves">
      <div id="hm-mine-slot">${mineShelf()}</div>
      ${shelfX({ title: 'Top 10 on the consensus board', note: src('computed', `Consensus of ${boardNames}`), link: { href: '#board', label: 'Big Board' }, items: topTen.map(p => ranked(p, p.consensus_rank)), cls: 'hm-top10' })}
      ${shelfX({ title: 'Quarterbacks', note: 'In Big Board order', items: qbs })}
      ${shelfX({ title: 'Where the boards disagree', note: src('published', 'Biggest gap between the three public boards'), items: splits })}
      ${shelfX({ title: 'Pick your team', note: src('computed', `In projected 2027 draft order, from ${int(D.teams.sims ?? 2000)} simulations`), items: teams, cls: 'hm-teams' })}
      ${shelfX({ title: 'Best at each position', note: 'No. 1 at each spot on the Big Board', items: bestAt })}
      ${shelfX({ title: 'Underclassmen who may stay in school', note: src('estimated', 'Chance to declare is an estimate from class and rank'), items: under })}
      ${shelfX({ title: "The model's sleepers", note: src('computed', 'Draft model, from college stats only. A second opinion.'), items: sleepers })}
    </div>`);

  // ---------- hero carousel ----------
  const hero = el.querySelector('.hm-hero');
  const numEl = hero.querySelector('.hero-num');
  const faceEl = hero.querySelector('.hero-face');
  const copy = hero.querySelector('.hero-copy');
  const dots = [...hero.querySelectorAll('.dot')];
  const play = hero.querySelector('.hm-play');
  let cur = -1;
  let auto = !reduceMotion;

  function slideHtml(p, i) {
    const [first, last] = firstLast(p.name);
    const sims = shared.sims?.summary?.[D.index.get(p.id)];
    const simLine = sims ? ` Goes in round 1 in ${pct(sims.r1)} of ${int(shared.sims.n)} simulated drafts.` : '';
    return h`
      <p class="label hm-eyebrow">${posName(p.group)} · ${p.school}</p>
      <h1 class="hero-name">${first}${last ? h`<br>${last}` : ''}</h1>
      <p class="hero-meta">${posPill(p.group)}<span>${[className(p.class_year), ht(p.height), wt(p.weight), p.home].filter(Boolean).join(' · ')}</span></p>
      <p class="hero-line">${boardLine(p, D)}${p.p_declare < 1 ? ' As an underclassman he can still choose to stay in school.' : ''}${simLine}</p>
      <div class="actions">
        <a class="btn primary" href="#mock">${icon('play')}Start a mock draft</a>
        <a class="btn glass" href="#player/${p.id}">See profile</a>
        ${starBtn(p.id, p.name)}
      </div>
      <p class="sr">${i + 1} of ${feat.length}</p>`;
  }

  function show(i, { animate = true } = {}) {
    i = (i + feat.length) % feat.length;
    if (i === cur) return;
    cur = i;
    const p = feat[i];
    const s = schoolArt(p.school);
    hero.setAttribute('style', accentStyle(s.c1, s.c2));
    numEl.textContent = p.consensus_rank;
    faceEl.innerHTML = String(face(p, 'cut'));
    copy.innerHTML = String(slideHtml(p, i));
    copy.setAttribute('aria-label', `${i + 1} of ${feat.length}: ${p.name}`);
    for (const el of [copy, numEl, faceEl]) {
      el.classList.remove('swap', 'hm-in');
      if (animate && !reduceMotion) { void el.offsetWidth; el.classList.add(el === copy ? 'swap' : 'hm-in'); }
    }
    dots.forEach((d, j) => {
      d.setAttribute('aria-current', String(j === i));
      // a fresh fill restarts the timer animation
      if (j === i) d.replaceChildren(document.createElement('i'));
    });
  }

  function setAuto(on) {
    auto = on && !reduceMotion;
    hero.classList.toggle('auto', auto);
    play.innerHTML = auto ? ICON_PAUSE : String(icon('play'));
    play.setAttribute('aria-label', auto ? 'Pause the slideshow' : 'Play the slideshow');
    copy.setAttribute('aria-live', auto ? 'off' : 'polite');
    if (auto) { const d = dots[cur]; d?.replaceChildren(document.createElement('i')); }
  }

  // The active dot's fill is the timer: when its animation ends, move on (paused by CSS on hover, focus, sheets).
  const offEnd = on(hero, 'animationend', '.dot > i', e => {
    if (e.animationName !== 'hm-fill' || !auto || reduceMotion) return;
    show(cur + 1);
  });
  const offDot = on(hero, 'click', '.dot', (e, d) => show(+d.dataset.i));
  const offKey = on(hero, 'keydown', '.dot', (e, d) => {
    const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!k) return;
    e.preventDefault();
    show(+d.dataset.i + k);
    dots[cur].focus();
  });
  play.addEventListener('click', () => setAuto(!auto));

  // swipe on touch screens
  let tx = null, ty = null;
  hero.addEventListener('touchstart', e => { const t = e.touches[0]; tx = t.clientX; ty = t.clientY; }, { passive: true });
  hero.addEventListener('touchend', e => {
    if (tx == null) return;
    const t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty;
    tx = ty = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) show(cur + (dx < 0 ? 1 : -1));
  }, { passive: true });

  // pause while the hero is scrolled out of view
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(([en]) => hero.classList.toggle('offscreen', !en.isIntersecting), { threshold: 0.25 }) : null;
  io?.observe(hero);

  show(0, { animate: false });
  setAuto(auto);

  // ---------- live "Your board" shelf ----------
  const slot = el.querySelector('#hm-mine-slot');
  const onBoard = () => { slot.innerHTML = String(mineShelf()); };
  document.addEventListener('md:board', onBoard);

  return () => {
    io?.disconnect();
    offEnd(); offDot(); offKey();
    document.removeEventListener('md:board', onBoard);
  };
}
