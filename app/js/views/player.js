// Player page. It renders inside a full-screen sheet over the current screen (the router opens the sheet).
// Top: the hero in his school's colours (giant consensus rank, photo, facts, My Board, photo import by button,
// drop or paste). Below: where he ranks, where he could go (sims) and what players taken there became, last
// season, size and athletic testing, traits with the user's grades, every college season, comparisons, and
// the user's scouting notebook (flags, reports, notes). Everything the old profile page showed is here.
import { h, icon, toast, on } from '../ui/dom.js';
import { face, hasPhoto, pickPhoto, removePhoto, bindPhotoDrop } from '../ui/face.js';
import { schoolArt, schoolLogo, roomColors, logo, teamArt } from '../ui/art.js';
import { posName, posPlural, className, ht, wt, pct, num, rank, date, ordinal, OUTCOME_HELP, OUTCOMES, athleticScore } from '../ui/fmt.js';
import { facts, statTiles, outcomeBar, empty, src, ring, meter } from '../ui/parts.js';
import { keyStats } from '../ui/draft-parts.js';
import { store, save } from '../store.js';
import { shared } from './shared.js';

// Season columns per position (every column the old profile showed). [key, short label, full name]
const STAT_COLS = {
  QB: [['pass_comp', 'Cmp', 'Completions'], ['pass_att', 'Att', 'Attempts'], ['pass_yds', 'Yds', 'Passing yards'], ['pass_td', 'TD', 'Passing touchdowns'], ['pass_int', 'Int', 'Interceptions thrown'], ['sacked', 'Sk', 'Times sacked'], ['rush_yds', 'Rush yds', 'Rushing yards'], ['rush_td', 'Rush TD', 'Rushing touchdowns']],
  RB: [['rush_att', 'Car', 'Carries'], ['rush_yds', 'Yds', 'Rushing yards'], ['rush_td', 'TD', 'Rushing touchdowns'], ['targets', 'Tgt', 'Targets'], ['rec', 'Rec', 'Catches'], ['rec_yds', 'Rec yds', 'Receiving yards'], ['sh_scrimmage', 'Share', 'Share of team scrimmage yards']],
  WR: [['targets', 'Tgt', 'Targets'], ['rec', 'Rec', 'Catches'], ['rec_yds', 'Yds', 'Receiving yards'], ['rec_td', 'TD', 'Receiving touchdowns'], ['rush_yds', 'Rush yds', 'Rushing yards'], ['sh_dominator', 'Dominator', 'Share of team receiving yards and touchdowns']],
  TE: [['targets', 'Tgt', 'Targets'], ['rec', 'Rec', 'Catches'], ['rec_yds', 'Yds', 'Receiving yards'], ['rec_td', 'TD', 'Receiving touchdowns'], ['sh_dominator', 'Dominator', 'Share of team receiving yards and touchdowns']],
  EDGE: [['sacks', 'Sacks', 'Sacks'], ['sh_sacks', 'Team sacks', 'Share of team sacks'], ['ff', 'FF', 'Forced fumbles'], ['pbu', 'PBU', 'Passes broken up'], ['ints', 'Int', 'Interceptions']],
  DT: [['sacks', 'Sacks', 'Sacks'], ['sh_sacks', 'Team sacks', 'Share of team sacks'], ['ff', 'FF', 'Forced fumbles'], ['pbu', 'PBU', 'Passes broken up']],
  LB: [['sacks', 'Sacks', 'Sacks'], ['pbu', 'PBU', 'Passes broken up'], ['ints', 'Int', 'Interceptions'], ['ff', 'FF', 'Forced fumbles']],
  CB: [['pbu', 'PBU', 'Passes broken up'], ['ints', 'Int', 'Interceptions'], ['ff', 'FF', 'Forced fumbles'], ['sacks', 'Sacks', 'Sacks']],
  S: [['pbu', 'PBU', 'Passes broken up'], ['ints', 'Int', 'Interceptions'], ['ff', 'FF', 'Forced fumbles'], ['sacks', 'Sacks', 'Sacks']],
  K: [['fg_made', 'FG', 'Field goals made'], ['fg_missed', 'Missed', 'Field goals missed']],
};
// Combine tests: [key, name, unit]
const TESTS = [['forty', '40-yard dash', 'sec'], ['vertical', 'Vertical jump', 'in'], ['broad_jump', 'Broad jump', 'in'], ['bench', 'Bench press', 'reps'], ['cone', '3-cone drill', 'sec'], ['shuttle', 'Short shuttle', 'sec']];
// The user's own flags (store.setFlag). Picked by Claude, confirm later.
const MY_FLAGS = [['film', 'Watch more film'], ['medical', 'Check the medicals'], ['character', 'Check character'], ['sleeper', 'Sleeper'], ['avoid', 'Would not draft']];
const KINDS = ['Injury', 'Character', 'Medical', 'Other'];
const safeLink = u => (/^https?:\/\//i.test(String(u ?? '').trim()) ? String(u).trim() : '');
const blank = v => v === '' || v == null;
const lowPlural = g => posPlural(g).toLowerCase();

export function view(el, D, arg) {
  const p = D.byId.get(+arg);
  if (!p) {
    el.innerHTML = String(h`<div class="pl-missing">${empty({ title: 'Player not found', text: 'This player is not in the 2027 pool.', action: '<a class="btn small" href="#board">Open the Big Board</a>' })}</div>`);
    return;
  }
  const s = schoolArt(p.school);
  roomColors(el, s.c1, s.c2);
  el.innerHTML = String(h`
    ${hero(p)}
    <div class="sh-body">
      <section aria-labelledby="plRanksH"><h3 id="plRanksH">Where he ranks</h3><div id="plRanks">${ranks(p, D)}</div></section>
      <div class="pl-two" id="plProj">${projection(p, D)}</div>
      <div class="pl-two">
        <section aria-labelledby="plLastH">${lastSeason(p)}</section>
        <section aria-labelledby="plSizeH" id="plSize">${sizeBlock(p, D)}</section>
      </div>
      <section aria-labelledby="plTraitsH">
        <div class="pl-head"><h3 id="plTraitsH">Traits and your grades</h3><span class="note">Tap a number to grade him. Tap it again to clear.</span></div>
        <p class="note pl-lede">"From stats" is his percentile among drafted ${lowPlural(p.group)} in their final college season, shown on a 1-10 scale. It is not a film grade. Film-only traits need your own grade. Your grade is what your board uses.</p>
        <div id="plTraits">${traitList(p)}</div>
      </section>
      <section aria-labelledby="plSeasonsH">${seasons(p)}</section>
      <section aria-labelledby="plCombineH" id="plCombine">${combine(p, D)}</section>
      <section aria-labelledby="plCompsH">${comps(p, D)}</section>
      <section aria-labelledby="plBookH" class="pl-book">${notebook(p)}</section>
    </div>`);

  // ----- hero: My Board and photo -----
  const star = el.querySelector('#plStar'), photoBtn = el.querySelector('#plPhotoBtn'), rmBtn = el.querySelector('#plPhotoRm');
  const note = el.querySelector('#plPhotoNote');
  const sync = () => {
    const onB = store.onBoard(p.id);
    star.querySelector('span').textContent = onB ? 'On my board' : 'Add to my board';
    star.classList.toggle('on', onB);
    const has = hasPhoto(p.id);
    photoBtn.querySelector('span').textContent = has ? 'Change photo' : 'Add photo';
    rmBtn.hidden = !has;
    el.querySelector('#plMyRank').innerHTML = String(myRankTile(p));
  };
  sync();
  const checkNote = () => { note.hidden = !!el.querySelector('#plPhoto .face')?.classList.contains('has-img'); };
  const timers = [setTimeout(checkNote, 1500), setTimeout(checkNote, 5000)];
  photoBtn.onclick = () => pickPhoto(p.id);
  rmBtn.onclick = () => removePhoto(p.id);
  const onPhoto = e => { if (e.detail?.id === String(p.id)) { sync(); timers.push(setTimeout(checkNote, 600)); } };
  const onBoard = e => { if (!e.detail || e.detail.id === p.id) sync(); };
  document.addEventListener('md:photo', onPhoto);
  document.addEventListener('md:board', onBoard);
  const unbind = bindPhotoDrop(el.querySelector('.sh-hero'), p.id, { highlight: el.querySelector('#plPhoto') });

  // ----- sims finishing while the page is open -----
  const onSims = e => { if (e.done) el.querySelector('#plProj').innerHTML = String(projection(p, D)); };
  shared.listeners.add(onSims);

  // ----- trait grades: a 1-10 scale per trait (roving focus, arrows move) -----
  const traits = el.querySelector('#plTraits');
  const setGrade = (trait, v) => {
    store.setGrade(p.id, trait, v);
    const row = traits.querySelector(`[data-trait="${CSS.escape(trait)}"]`);
    const t = p.traits.find(x => x.trait === trait);
    const fresh = traitRow(t, v);
    row.replaceWith(document.createRange().createContextualFragment(String(fresh)));
    return traits.querySelector(`[data-trait="${CSS.escape(trait)}"]`);
  };
  const offs = [
    on(traits, 'click', '[data-g]', (e, b) => {
      const trait = b.closest('[data-trait]').dataset.trait;
      const cur = store.get().grades[p.id]?.[trait];
      const v = +b.dataset.g === +cur ? '' : +b.dataset.g;
      const row = setGrade(trait, v);
      row.querySelector(`[data-g="${blank(v) ? 1 : v}"]`)?.focus();
    }),
    on(traits, 'keydown', '[data-g]', (e, b) => {
      const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      const trait = b.closest('[data-trait]').dataset.trait;
      if (step) {
        e.preventDefault();
        const v = Math.max(1, Math.min(10, +b.dataset.g + step));
        setGrade(trait, v).querySelector(`[data-g="${v}"]`)?.focus();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        setGrade(trait, '').querySelector('[data-g="1"]')?.focus();
      }
    }),
  ];

  // ----- combine entries: athletic score updates as you type -----
  const comb = el.querySelector('#plCombine');
  paintCombine(comb, p, D);
  let combT = null;
  const saveTest = i => {
    const v = i.value.trim();
    const n = parseFloat(v);
    if (v && Number.isNaN(n)) { i.setAttribute('aria-invalid', 'true'); return; }
    i.removeAttribute('aria-invalid');
    store.setCombine(p.id, i.dataset.test, v ? String(n) : '');
    paintCombine(comb, p, D);
  };
  offs.push(on(comb, 'input', '[data-test]', (e, i) => { clearTimeout(combT); combT = setTimeout(() => saveTest(i), 350); }));
  offs.push(on(comb, 'change', '[data-test]', (e, i) => { clearTimeout(combT); saveTest(i); }));
  offs.push(on(comb, 'click', '#plClearTests', () => {
    for (const [k] of TESTS) store.setCombine(p.id, k, '');
    comb.querySelectorAll('[data-test]').forEach(i => { i.value = ''; i.removeAttribute('aria-invalid'); });
    paintCombine(comb, p, D);
    toast('His combine entries were cleared.');
  }));

  // ----- notebook: flags, reports, notes -----
  const book = el.querySelector('.pl-book');
  offs.push(on(book, 'click', '[data-flag]', (e, b) => {
    const k = b.dataset.flag, onF = b.getAttribute('aria-pressed') !== 'true';
    store.setFlag(p.id, k, onF);
    b.setAttribute('aria-pressed', String(onF));
  }));
  offs.push(on(book, 'click', '[data-del]', (e, b) => {
    const i = +b.dataset.del;
    const r = store.get().reports[p.id]?.[i];
    store.removeReport(p.id, i);
    paintReports(book, p);
    toast('Report removed.', r ? { action: { label: 'Undo', run: () => { (store.get().reports[p.id] ??= []).splice(i, 0, r); save(); paintReports(book, p); } } } : {});
  }));
  const form = book.querySelector('#plRepForm');
  form.onsubmit = e => {
    e.preventDefault();
    const text = form.text.value.trim();
    if (!text) { form.text.focus(); toast('Write what was reported first.'); return; }
    store.addReport(p.id, { kind: form.kind.value, text, link: form.link.value.trim(), date: form.date.value || new Date().toISOString().slice(0, 10) });
    form.text.value = ''; form.link.value = '';
    paintReports(book, p);
    toast('Report added.');
  };
  const notes = book.querySelector('#plNote'), saved = book.querySelector('#plSaved');
  let noteT = null;
  const saveNote = () => { clearTimeout(noteT); store.setNote(p.id, notes.value); saved.textContent = notes.value.trim() ? 'Saved' : ''; };
  notes.addEventListener('input', () => { saved.textContent = 'Saving…'; clearTimeout(noteT); noteT = setTimeout(saveNote, 500); });
  notes.addEventListener('change', saveNote);

  return () => {
    if (noteT) saveNote();
    if (combT) { clearTimeout(combT); comb.querySelectorAll('[data-test]').forEach(i => { if (i === document.activeElement) saveTest(i); }); }
    timers.forEach(clearTimeout);
    document.removeEventListener('md:photo', onPhoto);
    document.removeEventListener('md:board', onBoard);
    shared.listeners.delete(onSims);
    offs.forEach(f => f());
    unbind();
  };
}

// ---------- hero ----------
function hero(p) {
  const n = p.consensus_rank ?? p.board_rank;
  const others = (p.teams ?? '').split('|').filter(t => t && t !== p.school);
  const sub = [p.level, p.roster_seasons ? `${p.roster_seasons} ${p.roster_seasons === 1 ? 'season' : 'seasons'} on a college roster` : '', others.length ? `Also played for ${others.join(', ')}` : ''].filter(Boolean).join(' · ');
  const onB = store.onBoard(p.id);
  return h`<header class="sh-hero">
    <span class="onum" aria-hidden="true">${n}</span>
    <div class="sh-photo" id="plPhoto">${face(p, 'cut')}</div>
    <div class="sh-in">
      <div class="pl-kick">${schoolLogo(p.school, 46)}<p class="label">${posName(p.group)} · ${p.school}${p.conference ? ` · ${p.conference}` : ''}</p></div>
      <h2 class="wide">${p.name}</h2>
      ${sub ? h`<p class="pl-sub">${sub}</p>` : ''}
      ${facts([className(p.class_year), `${ht(p.height)} · ${wt(p.weight)}`, p.home ? `From ${p.home}` : '',
        ['Consensus', p.consensus_rank ? rank(p.consensus_rank) : 'Not ranked'], ['Model', rank(p.model_rank)], ['Declares', pct(p.p_declare)]])}
      <div class="actions">
        <button class="btn primary pl-star${onB ? ' on' : ''}" type="button" id="plStar" data-star="${p.id}" aria-pressed="${String(onB)}" aria-label="${onB ? `Remove ${p.name} from My Board` : `Add ${p.name} to My Board`}">${icon('star')}<span></span></button>
        <button class="btn glass" type="button" id="plPhotoBtn">${icon('camera')}<span></span></button>
        <button class="btn glass" type="button" id="plPhotoRm" hidden>${icon('trash')}<span>Remove my photo</span></button>
      </div>
      <p class="pl-photo-note" id="plPhotoNote" hidden>No photo loaded. Add one, drop one on the picture, or paste one. It stays on this device.</p>
    </div>
  </header>`;
}

// ---------- where he ranks ----------
function myRankTile(p) {
  const i = store.get().board.indexOf(p.id);
  return h`<b>${i >= 0 ? i + 1 : '–'}</b><small>My board</small><small class="note">${i >= 0 ? 'Your ranking' : 'Not on your board yet'}</small>`;
}

const tile = t => h`<div><b>${t.value ?? '–'}</b><small>${t.label}</small>${t.note ? h`<small class="note">${t.note}</small>` : ''}${t.src ? src(t.src) : ''}</div>`;

function ranks(p, D) {
  const boards = D.meta?.boards?.length ? D.meta.boards : Object.keys(p.board_ranks ?? {}).map(label => ({ label }));
  const pub = boards.map(b => ({ value: p.board_ranks?.[b.label] ?? '–', label: b.label, note: p.board_ranks?.[b.label] ? (b.date ? `As of ${date(b.date)}` : '') : 'Not on this board', src: 'published' }));
  const declared = p.p_declare * p.p_drafted;
  return h`
    <div class="tiles">${[...pub, { value: p.consensus_rank ?? '–', label: 'Consensus', note: p.consensus_rank ? 'Weighted average of the public boards' : 'Not on the public boards', src: 'computed' }].map(tile)}
      <div class="pl-my" id="plMyRank">${myRankTile(p)}</div></div>
    <p class="label pl-sublabel">The draft model</p>
    ${statTiles([
      { value: p.model_rank, label: 'Model rank', note: 'From his chance to be drafted and his expected pick', src: 'computed' },
      { value: Math.round(p.exp_pick), label: 'Expected pick', note: 'If he is drafted', src: 'computed' },
      { value: pct(p.p_drafted), label: 'Drafted if he declares', src: 'computed' },
      { value: pct(p.p_declare), label: 'Declares for 2027', note: p.p_declare >= 1 ? 'Out of eligibility' : 'From his class and where the boards rank him', src: 'estimated' },
      { value: pct(declared), label: 'Drafted in 2027', note: 'Declares, then drafted', src: 'computed' },
      { value: p.board_rank, label: "Draft AI's board", note: 'Where the mock draft AI starts him: 80% consensus, 20% model', src: 'estimated' },
    ])}`;
}

// ---------- where he could go (sims) + what players taken there became ----------
function projection(p, D) {
  const sims = shared.sims;
  const sim = sims?.summary?.[D.index.get(p.id)];
  const proj = Math.max(1, Math.round(sim?.p50 ?? p.consensus_rank ?? p.board_rank));
  const used = sim?.p50 != null ? `the middle of his range in ${num(sims.n)} simulated drafts`
    : p.consensus_rank ? 'his consensus rank' : "his place on the draft AI's board";
  const rows = D.hit_rates.by_group?.[p.group] ?? D.hit_rates.bands;
  const band = rows.find(b => proj >= b.lo && proj <= b.hi) ?? rows[rows.length - 1];
  return h`
    <section aria-labelledby="plRangeH">
      <div class="pl-head"><h3 id="plRangeH">Where he could go</h3>${sim ? src('computed', `${num(sims.n)} simulated drafts`) : ''}</div>
      ${sim ? landing(p, D, sim, sims) : shared.running
        ? h`<div class="pl-card pl-wait"><b>Simulations are running.</b><p class="note">His landing range shows here when they finish.</p></div>`
        : h`<div class="pl-card pl-wait"><b>See his landing range</b><p class="note">Run the simulations to see where he goes in hundreds of mock drafts, how often in round 1, and to which teams.</p><a class="btn small" href="#sims">${icon('dice')}Run simulations</a></div>`}
    </section>
    <section aria-labelledby="plOddsH">
      <div class="pl-head"><h3 id="plOddsH">What players taken around pick ${proj} became</h3></div>
      <div class="pl-card">
        ${outcomeBar(band.rates, { size: 'tall' })}
        <dl class="pl-defs">${OUTCOMES.map(([k, l]) => h`<div><dt><i class="o-${k}"></i>${l}<b>${pct(band.rates[k] ?? 0)}</b></dt><dd>${OUTCOME_HELP[k]}</dd></div>`)}</dl>
        <p class="note">${posPlural(p.group)} drafted 2000-2021 at picks ${band.lo}-${band.hi}${band.n ? ` (${band.n} players)` : ''}. Pick used: ${proj}, ${used}. A range of outcomes, not a forecast for him.</p>
        ${src('computed', 'Seasons started and Pro Bowls from nflverse')}
      </div>
    </section>`;
}

function landing(p, D, sim, sims) {
  const picks = D.teams?.picks ?? [];
  const total = picks.length || 224;
  const ends = [];
  picks.forEach((k, i) => { if (picks[i + 1]?.round !== k.round) ends.push(i + 1); });
  if (sim.p50 == null) {
    return h`<div class="pl-card pl-wait"><b>Not drafted in any of the ${num(sims.n)} simulated drafts.</b><p class="note">This includes the chance he stays in school.</p></div>`;
  }
  const x = v => `${(Math.max(1, Math.min(total, v)) - 0.5) / total * 100}%`;
  const opts = [sims.allDeclare ? 'every underclassman declares' : 'underclassmen may stay in school', sims.trades ? 'AI trades on' : 'AI trades off'].join(', ');
  return h`<div class="pl-card">
    <div class="pl-range" role="img" aria-label="Middle 80% of his picks: ${sim.p10} to ${sim.p90}, middle pick ${sim.p50}">
      <div class="pl-track">${ends.slice(0, -1).map(e => h`<span class="rd" style="left:${(e / total) * 100}%"></span>`)}
        <span class="pl-band" style="left:${x(sim.p10)};width:calc(${x(sim.p90)} - ${x(sim.p10)})"></span>
        <span class="pl-mid" style="left:${x(sim.p50)}"><b>${sim.p50}</b></span></div>
      <div class="pl-rounds">${ends.map((e, i) => h`<span style="left:${(((i ? ends[i - 1] : 0) + e) / 2 / total) * 100}%">R${i + 1}</span>`)}</div>
    </div>
    ${statTiles([{ value: `${sim.p10}-${sim.p90}`, label: 'Middle 80% of his picks' }, { value: pct(sim.r1), label: 'Round 1' }, { value: pct(sim.drafted), label: 'Drafted', note: 'Includes the chance he stays in school' }], { cols: 3 })}
    ${sim.teams?.length ? h`<div class="pl-teams"><span class="label">Most likely teams</span>${sim.teams.map(([t, c]) => h`<a class="pl-team" href="#team/${t}">${logo(t, 30)}<span>${teamArt(t).nick}</span><b>${pct(c)}</b></a>`)}</div>` : ''}
    <p class="note">Last run: ${opts}.</p>
  </div>`;
}

// ---------- last season and size ----------
function lastSeason(p) {
  const k = keyStats(p);
  return h`<div class="pl-head"><h3 id="plLastH">${k.stats ? k.note : 'Size'}</h3>${k.stats ? src('computed', 'College play-by-play') : ''}</div>
    ${statTiles(k.items, { cols: 3 })}
    ${k.stats ? '' : h`<p class="note">Public play-by-play has no stats at this position.</p>`}`;
}

function sizeBlock(p, D) {
  const sp = p.size_pct ?? {};
  return h`<div class="pl-head"><h3 id="plSizeH">Size against his position</h3>${src('computed', 'Combine 2000-2026')}</div>
    <div class="pl-card pl-size">
      ${meter(`Height ${ht(p.height)}`, sp.height, sp.height != null ? `${ordinal(sp.height * 100)} pct` : '–')}
      ${meter(`Weight ${wt(p.weight)}`, sp.weight, sp.weight != null ? `${ordinal(sp.weight * 100)} pct` : '–')}
      <p class="note">Percentile among ${lowPlural(p.group)} invited to the combine. His size is the school listing, so treat it as rough.</p>
    </div>`;
}

// ---------- traits and the user's grades ----------
function traitList(p) {
  const g = store.get().grades[p.id] ?? {};
  return h`<div class="pl-traits">${p.traits.map(t => traitRow(t, g[t.trait]))}</div>`;
}

function traitRow(t, mine) {
  const v = blank(mine) ? null : +mine;
  const film = t.est == null;
  const how = film ? 'Film only' : `From stats: ${ordinal((t.pct ?? 0) * 100)} percentile${t.note ? ` (${t.note})` : ''}`;
  const focusAt = v ?? 1;
  return h`<div class="pl-trait${film ? ' film' : ''}${v != null ? ' graded' : ''}" data-trait="${t.trait}">
    <div class="pl-tl"><b>${t.trait}</b><small>${how}</small></div>
    <div class="pl-tbar"><span class="t" role="img" aria-label="${film ? `${t.trait}: needs film` : `${t.trait}: ${num(t.est, 1)} of 10 from stats`}${v != null ? `, your grade ${v}` : ''}">${film ? '' : h`<i style="width:${Math.max(2, t.est * 10)}%"></i>`}${v != null ? h`<em style="left:${v * 10}%"></em>` : ''}</span><b>${film ? 'Film' : num(t.est, 1)}</b></div>
    <div class="pl-grade" role="radiogroup" aria-label="Your grade for ${t.trait}, 1 to 10">
      ${Array.from({ length: 10 }, (_, i) => i + 1).map(k => h`<button type="button" role="radio" data-g="${k}" aria-checked="${String(v === k)}" tabindex="${k === focusAt ? 0 : -1}" class="${v != null && k <= v ? 'on' : ''}" aria-label="${k}">${k}</button>`)}
    </div>
  </div>`;
}

// ---------- college seasons ----------
function seasons(p) {
  const cols = STAT_COLS[p.group] ?? [];
  const share = k => k.startsWith('sh_');
  const cell = (s, k) => (share(k) ? pct(s[k]) : num(s[k], k === 'sacks' && s[k] % 1 ? 1 : 0));
  return h`<div class="pl-head"><h3 id="plSeasonsH">College seasons</h3>${src('computed', 'College play-by-play')}</div>
    ${p.seasons?.length ? h`<div class="tbl pl-tbl"><table><thead><tr><th>Season</th><th class="l">Team</th><th title="Games with a recorded stat">G</th>${cols.map(([, l, full]) => h`<th title="${full}">${l}</th>`)}<th title="Average pre-game Elo of the opponents he had stats against">Opp. Elo</th></tr></thead>
      <tbody>${p.seasons.map(s => h`<tr><td>${s.season}</td><td class="l">${s.team}</td><td>${s.games}</td>${cols.map(([k]) => h`<td>${cell(s, k)}</td>`)}<td>${num(s.opp_elo)}</td></tr>`)}</tbody></table></div>`
      : h`<div class="pl-card"><p class="note">No recorded stats. Linemen have none in this data.</p></div>`}
    <p class="note pl-after">From play-by-play: no tackles, pressures or snaps in the free data. G counts games with a recorded stat. Opp. Elo is the average pre-game strength of the opponents he had stats against (1500 is an average FBS team). 2026 is the season so far.</p>`;
}

// ---------- athletic testing: the user's combine entries ----------
function combine(p, D) {
  const mine = store.get().combine[p.id] ?? {};
  return h`<div class="pl-head"><h3 id="plCombineH">Athletic testing</h3><span class="note">Your entries. The combine is in late February and March.</span></div>
    <div class="pl-card pl-ath">
      <div class="pl-score" id="plScore"></div>
      <div class="pl-tests">${TESTS.map(([k, l, u]) => h`<label class="pl-test"><span>${l}</span>
        <span class="pl-in"><input class="input" data-test="${k}" inputmode="decimal" autocomplete="off" value="${mine[k] ?? ''}" placeholder="–" aria-label="${l} in ${u}"><i>${u}</i></span>
        <small data-pct="${k}"></small></label>`)}</div>
    </div>`;
}

function paintCombine(root, p, D) {
  const a = athleticScore(D.combine_pct, p.group, store.get().combine[p.id]);
  const score = a?.score;
  const has = Object.values(store.get().combine[p.id] ?? {}).some(v => !blank(v));
  root.querySelector('#plScore').innerHTML = String(h`
    ${ring(score != null ? score / 10 : 0, { size: 112, width: 3.2, cls: score != null ? 'good' : '', label: score != null ? `Athletic score ${num(score, 2)} of 10` : 'No tests entered', inner: score != null ? h`${num(score, 1)}<small>of 10</small>` : '–' })}
    <div><b>Athletic score</b><p class="note">${score != null ? 'Each test as a percentile at his position, averaged (RAS-style).' : 'Enter his combine or pro day numbers to see it.'}</p>
      ${score != null ? src('computed', 'From your entries and combine 2000-2026') : ''}
      ${has ? h`<button class="btn small ghost" type="button" id="plClearTests">Clear entries</button>` : ''}</div>`);
  const parts = new Map((a?.parts ?? []).map(x => [x.test, x.pct]));
  root.querySelectorAll('[data-pct]').forEach(s => { const v = parts.get(s.dataset.pct); s.textContent = v != null ? `${ordinal(v * 100)} percentile` : ''; });
}

// ---------- comparisons ----------
function comps(p, D) {
  const alias = D.art?.nfl_alias ?? {};
  return h`<div class="pl-head"><h3 id="plCompsH">Most similar past prospects</h3>${src('computed', 'Drafted 2017-2026')}</div>
    <p class="note pl-lede">The closest drafted ${lowPlural(p.group)} by size, production shares, level and team strength. Recent picks have short careers so far.</p>
    ${p.comps?.length ? h`<div class="pl-comps">${p.comps.map(c => {
      const ab = alias[c.nfl_team] ?? c.nfl_team;
      return h`<div class="pl-comp">
        <div class="pl-comp-h">${logo(ab, 42)}<span><b>${c.name}</b><small>${c.school}</small></span></div>
        <p class="pl-comp-d">${c.draft_year}, pick ${c.pick}, ${teamArt(ab).nick}</p>
        <p class="pl-comp-k">${c.seasons_started == null ? 'Starts unknown' : `${c.seasons_started} ${c.seasons_started === 1 ? 'season' : 'seasons'} as a starter`}${c.probowls ? h`<b>${c.probowls} Pro ${c.probowls === 1 ? 'Bowl' : 'Bowls'}</b>` : ''}</p>
      </div>`;
    })}</div>` : h`<div class="pl-card"><p class="note">No close comparisons in the data.</p></div>`}`;
}

// ---------- the scouting notebook ----------
function notebook(p) {
  const me = store.get();
  const flags = me.flags[p.id] ?? {};
  const today = new Date().toISOString().slice(0, 10);
  return h`<div class="pl-head"><h3 id="plBookH">Your scouting notebook</h3><span class="note">Saved on this device. Export it from My Board.</span></div>
    <div class="pl-two">
      <div class="pl-page">
        <h4>Things to know ${src('computed', 'From the data')}</h4>
        ${p.flags?.length ? h`<div class="flags">${p.flags.map(f => h`<span class="flag">${f}</span>`)}</div>` : h`<p class="note">No flags from the data.</p>`}
        <h4>Your flags</h4>
        <div class="pl-flags" role="group" aria-label="Your flags">${MY_FLAGS.map(([k, l]) => h`<button type="button" class="pl-flag f-${k}" data-flag="${k}" aria-pressed="${String(!!flags[k])}">${icon('check')}${l}</button>`)}</div>
        <h4>Injury and character reports</h4>
        <p class="note">Only what you add, from published reporting, with a link. None here means none entered, not a clean record.</p>
        <div id="plReports">${reportList(p)}</div>
        <form class="pl-repform" id="plRepForm" autocomplete="off">
          <select class="select" name="kind" aria-label="Kind of report">${KINDS.map(k => h`<option>${k}</option>`)}</select>
          <input class="input" type="date" name="date" value="${today}" aria-label="Date reported">
          <input class="input pl-wide" name="text" placeholder="What was reported" aria-label="What was reported">
          <input class="input pl-wide" name="link" type="url" placeholder="Link to the source (https://…)" aria-label="Link to the source">
          <button class="btn small" type="submit">${icon('plus')}Add report</button>
        </form>
      </div>
      <div class="pl-page">
        <h4><label for="plNote">Notes</label> <span class="pl-saved" id="plSaved" aria-live="polite"></span></h4>
        <textarea class="pl-lined" id="plNote" rows="12" placeholder="What you see on film, questions to check, how he fits your team…">${me.notes[p.id] ?? ''}</textarea>
      </div>
    </div>`;
}

function reportList(p) {
  const list = store.get().reports[p.id] ?? [];
  if (!list.length) return h`<p class="pl-none">None entered.</p>`;
  return h`<ul class="pl-reports">${list.map((r, i) => {
    const link = safeLink(r.link);
    return h`<li><span class="pill ${r.kind === 'Injury' || r.kind === 'Medical' ? 'bad' : r.kind === 'Character' ? 'gold' : ''}">${r.kind}</span>
      <span class="pl-rt"><b>${r.text}</b><small>${date(r.date)}${link ? h` · <a class="u" href="${link}" target="_blank" rel="noopener">Source</a>` : r.link ? ` · ${r.link}` : ''}</small></span>
      <button class="icon-btn clear" type="button" data-del="${i}" aria-label="Remove this report">${icon('trash')}</button></li>`;
  })}</ul>`;
}

function paintReports(book, p) { book.querySelector('#plReports').innerHTML = String(reportList(p)); }

