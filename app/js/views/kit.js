// Component kit (#kit): every shared piece from js/ui with real data, for the screen builders. Dev only:
// nothing links here. Each section names the function or class that makes it.
import { h, raw, icon, toast, sheet, bottomSheet, moment } from '../ui/dom.js';
import { face, pickPhoto } from '../ui/face.js';
import { logo, schoolLogo, teamArt, schoolArt, accentStyle, roomColors } from '../ui/art.js';
import * as fmt from '../ui/fmt.js';
import {
  pill, posPill, poster, ranked, split, teamTile, shelf, playerRow, starBtn, facts, statTiles, kpis, traitBars, meter,
  outcomeBar, outcomeLegend, ring, setRing, src, empty, chips, seg, table,
} from '../ui/parts.js';

const sec = (title, code, body) => h`<section class="kit-sec"><h2>${title} <code>${code}</code></h2>${body}</section>`;

export function view(el, D) {
  const byCons = D.prospects.filter(p => p.consensus_rank).sort((a, b) => a.consensus_rank - b.consensus_rank);
  const top = byCons.slice(0, 10);
  const wr = byCons.find(p => p.group === 'WR' && p.traits.some(t => t.est == null));
  const qb = byCons.find(p => p.group === 'QB');
  const seen = new Set();
  const order = D.teams.picks.filter(k => k.round === 1 && !seen.has(k.owner) && seen.add(k.owner));
  const schools = [...new Set(byCons.map(p => p.school))].slice(0, 11);
  const splits = byCons.filter(p => Object.keys(p.board_ranks).length === 3)
    .map(p => { const v = Object.values(p.board_ranks); return [p, Math.max(...v) - Math.min(...v)]; })
    .sort((a, b) => b[1] - a[1]).slice(0, 4);
  const kc = teamArt('KC');
  const tokens = ['--ground', '--raised', '--lift', '--fill-1', '--fill-2', '--glass', '--fg', '--fg2', '--fg3', '--live', '--good', '--gold', '--bad',
    '--o-bust', '--o-backup', '--o-starter', '--o-good_starter', '--o-pro_bowl'];

  el.innerHTML = String(h`<div class="page below-top">
    <div class="screen-head"><p class="label">Dev only</p><h1 class="screen-title">Component kit</h1>
      <p class="lede">The shared pieces in <code>js/ui</code> and <code>css/showtime.css</code>, drawn with real data. Screens build from these.</p></div>

    ${sec('Colour', 'css/showtime.css :root', h`<div class="kit-swatches">${tokens.map(t => h`<div style="background:var(${t});color:${t.startsWith('--fg') || t === '--gold' || t === '--good' ? '#08090c' : '#fff'}">${t}</div>`)}</div>`)}

    ${sec('Type', '.screen-title .wide .cond .label .lede .note .src', h`<div class="kit-box">
      <p class="label">Label · 11px uppercase</p>
      <p class="screen-title">Screen title</p>
      <p class="wide" style="font-size:28px">Wide 125% for names and titles</p>
      <p class="cond tnum" style="font-size:64px;line-height:1">2,846 · 0.94 · 8.1</p>
      <p class="lede">Lede text: plain short sentences, secondary colour, 64 characters wide at most.</p>
      <p>Body text at 15px. <a class="u" href="#about">An inline link.</a></p>
      <p class="note">Note text for sources and small print.</p>
      <div class="kit-row">${src('published', 'Published: CBS Sports')} ${src('computed', 'Computed from nflverse')} ${src('estimated', 'Estimated')}</div>
    </div>`)}

    ${sec('Buttons', '.btn .primary .glass .ghost .small .danger .icon-btn · starBtn(id)', h`<div class="kit-row">
      <button class="btn primary">${icon('play')}Start a mock draft</button>
      <button class="btn glass">See profile</button>
      <button class="btn ghost">Ghost</button>
      <button class="btn">Default</button>
      <button class="btn small">${icon('download')}Small</button>
      <button class="btn small danger">${icon('trash')}Reset</button>
      <button class="btn primary" disabled>Disabled</button>
      <button class="icon-btn" aria-label="Close">${icon('close')}</button>
      <button class="icon-btn" aria-label="Search">${icon('search')}</button>
      ${starBtn(top[0].id, top[0].name)}
    </div>`)}

    ${sec('Pills, facts, flags', 'pill(text, kind) · posPill(g) · facts(items) · .flag', h`<div class="kit-box">
      <div class="kit-row">${fmt.POS_ORDER.map(g => posPill(g))}</div>
      <div class="kit-row">${pill('Default')} ${pill('A−', 'good')} ${pill('Reach', 'gold')} ${pill('Bust risk', 'bad')} ${pill('Live', 'live')} ${pill('Quiet', 'quiet')}</div>
      <div style="padding:18px;border-radius:20px;${raw(accentStyle(schoolArt(top[0].school).c1, schoolArt(top[0].school).c2))};background:linear-gradient(160deg,var(--accent),#000)">
        ${facts([fmt.className(top[0].class_year), fmt.size(top[0]), top[0].home, ['Consensus', fmt.rank(top[0].consensus_rank)], ['Declares', fmt.pct(top[0].p_declare)]])}</div>
      <div class="flags">${(byCons.find(p => p.flags.length > 1)?.flags ?? []).map(f => h`<span class="flag">${f}</span>`)}</div>
    </div>`)}

    ${sec('Chips and segmented', 'chips(groups, active, onPick) · seg(...)  (elements)', h`<div class="kit-box"><div id="kChips"></div><div id="kSeg"></div><p class="note" id="kPicked">Picked: All</p></div>`)}

    ${sec('Inputs', '.input .select .search-field .check', h`<div class="kit-row">
      <label class="search-field" style="width:260px">${icon('search')}<input class="input" placeholder="Search name or school"></label>
      <select class="select"><option>Consensus rank</option><option>Model rank</option><option>Expected pick</option></select>
      <input class="input" style="width:90px" placeholder="4.45" aria-label="40-yard dash">
      <label class="check"><input type="checkbox" checked> On a public board</label>
    </div>`)}

    ${sec('Team logos', 'logo(abbr, size) · teamTile(abbr, {sub, href})', h`<div class="kit-logos">${order.map(k => teamTile(k.owner, { sub: `Pick ${k.slot}` }))}</div>
      <div class="kit-row">${logo('KC', 32)} ${logo('KC', 44)} ${logo('KC', 76)} ${logo('XXX', 44)} <span class="note">Sizes 32, 44, 76, and an unknown team (monogram)</span></div>`)}

    ${sec('School logos', 'schoolLogo(school, size) · schoolArt(school)', h`<div class="kit-row">${schools.map(s => schoolLogo(s, 56))} ${schoolLogo('Unknown State', 56)}</div>
      <p class="note">ESPN logos load in the Mac app and on a normal connection. Missing ones show a monogram in the school's colours (neutral grey when unknown).</p>`)}

    ${sec('Faces', "face(p, 'round' | 'cut') · pickPhoto(id) · importPhoto · removePhoto", h`<div class="kit-row">
      <span style="width:72px;height:72px;display:block">${face(top[0], 'round')}</span>
      <span style="width:72px;height:72px;display:block;border-radius:50%;background:linear-gradient(160deg,#3a4050,#15171d)">${face({ id: 'none' }, 'round')}</span>
      <span style="width:72px;height:72px;display:block">${face({ id: 'bad', headshot: 'data:image/png;base64,AAAA' }, 'round')}</span>
      <span class="kit-cut" style="${raw(accentStyle(schoolArt(top[1].school).c1, schoolArt(top[1].school).c2))};background:linear-gradient(160deg,var(--accent),#000)">${face(top[1], 'cut')}</span>
      <button class="btn small" id="kPhoto">${icon('camera')}Add a photo for ${top[1].name}</button>
    </div><p class="note">Left to right: headshot, no photo (silhouette), a failing image (silhouette, no broken icon), a cut-out on school colours.</p>`)}
  </div>

  ${shelf({ title: 'Top 10 shelf', note: 'ranked(p, n) inside shelf({title, note, items})', items: top.map(p => ranked(p, p.consensus_rank)) })}
  ${shelf({ title: 'Poster shelf', note: 'poster(p, {sub, tag})', items: byCons.filter(p => p.group === 'QB').slice(0, 8).map((p, i) => poster(p, { tag: i === 0 ? pill('QB1', 'gold') : '' })) })}
  ${shelf({ title: 'Where the boards disagree', note: 'split(p, ranks, sub)', items: splits.map(([p, gap]) => split(p, Object.entries(p.board_ranks).map(([b, r]) => [fmt.boardShort(b, D.meta), r]), `${p.group} · ${p.school} · ${gap} spots apart`)) })}

  <div class="page">
    ${sec('Rows', 'playerRow(p, {num, sub, cols, star})', h`<div class="rows">${byCons.slice(0, 5).map(p => playerRow(p, { num: p.consensus_rank, cols: [
      { label: 'Model', value: fmt.rank(p.model_rank), wide: true }, { label: 'Expected pick', value: Math.round(p.exp_pick), wide: true },
      { label: 'Declares', value: fmt.pct(p.p_declare) }] }))}</div>`)}

    ${sec('Tiles and numbers', 'statTiles(items, {cols}) · kpis(items)', h`<div class="grid2">
      ${statTiles([...Object.entries(top[0].board_ranks).map(([b, r]) => ({ value: r, label: b, src: 'published' })), { value: Math.round(top[0].exp_pick), label: "Draft model's expected pick", src: 'computed' }])}
      <div class="kit-box">${kpis([{ value: '1,181', label: 'Rec yards' }, { value: 12, label: 'TD' }, { value: '31%', label: 'Dominator' }])}</div></div>`)}

    ${sec('Trait bars', 'traitBars(p.traits, {grades})', h`<div class="grid2" style="${raw(accentStyle(schoolArt(wr.school).c1, schoolArt(wr.school).c2))}">
      <div class="kit-box"><p class="label">${wr.name}, stats and film-only traits</p>${traitBars(wr.traits)}</div>
      <div class="kit-box"><p class="label">With the user's grades (example)</p>${traitBars(wr.traits, { grades: { [wr.traits[0].trait]: 8, [wr.traits.find(t => t.est == null).trait]: 7 } })}</div></div>`)}

    ${sec('Hit-rate outcomes', 'outcomeBar(rates, {legend, size}) · outcomeLegend(rates)', h`<div class="kit-box">${[5, 20, 60, 150].map(n => h`<div style="display:grid;gap:8px"><p class="small"><b>${qb.group} taken around pick ${n}</b> <span class="faint">hitRatesAt(D.hit_rates, '${qb.group}', ${n})</span></p>${outcomeBar(fmt.hitRatesAt(D.hit_rates, qb.group, n), { legend: n === 5 })}</div>`)}
      ${outcomeBar(fmt.hitRatesAt(D.hit_rates, 'EDGE', 30), { size: 'thin' })}<p class="note">Thin size, for cards. Published careers from nflverse (seasons started, Pro Bowls), computed into rates.</p></div>`)}

    ${sec('Rings and meters', 'ring(progress, {size, inner, cls}) · setRing(el, p) · meter(label, v, text)', h`<div class="grid2"><div class="kit-row">
      ${ring(0.25, { size: 56 })} ${ring(0.62, { size: 84, inner: '4:21', label: 'Clock' })} ${ring(0.9, { size: 84, cls: 'live', inner: '0:42' })} ${ring(1, { size: 96, cls: 'good', inner: h`200<small>drafts</small>` })}
      <span id="kRing">${ring(0, { size: 84, inner: '0%' })}</span></div>
      <div class="kit-box">${meter('DT', 0.86, 'High')}${meter('EDGE', 0.6, 'High')}${meter('RB', 0.42, 'Medium')}${meter('CB', 0.2, 'Low')}</div></div>`)}

    ${sec('Tables', 'table(cols, rows, opts) (sortable, .tablewrap) · .tbl for static tables', h`<div id="kTable"></div>
      <div class="tbl"><table><thead><tr><th>Season</th><th class="l">Team</th><th>Games</th><th>Targets</th><th>Catches</th><th>Yards</th><th>TD</th></tr></thead>
        <tbody>${top[0].seasons.map(s => h`<tr><td>${s.season}</td><td class="l">${s.team}</td><td>${s.games}</td><td>${fmt.num(s.targets)}</td><td>${fmt.num(s.rec)}</td><td>${fmt.num(s.rec_yds)}</td><td>${fmt.num(s.rec_td)}</td></tr>`)}</tbody></table></div>`)}

    ${sec('Glass over a room', '.room.inline + .glass.panel · roomColors(el, c1, c2)', h`<div class="kit-room" id="kRoom"><div class="room inline" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="glass panel"><h2>On the clock <small>Pick 30</small></h2><div style="display:flex;gap:14px;align-items:center">${logo('KC', 64)}<div><p class="label">On the clock</p><p class="wide" style="font-size:28px;line-height:1">${kc.name}</p></div></div>
        ${meter('WR', 0.7, 'High')}${meter('OT', 0.5, 'Medium')}</div>
      <div class="glass panel"><h2>Re-light <small>roomColors</small></h2><div class="kit-row" id="kRelight">${['KC', 'MIA', 'GB', 'LV', 'SEA'].map(a => h`<button class="btn small glass" data-team="${a}">${logo(a, 22)}${a}</button>`)}</div>
        <p class="note">Colours fade over a second. A near-black primary (Raiders) lights with its second colour.</p></div></div>`)}

    ${sec('Layers', 'sheet() · bottomSheet() · moment() · toast()', h`<div class="kit-row">
      <a class="btn" href="#player/${top[0].id}">Player sheet (route)</a>
      <button class="btn" id="kSheet">Custom sheet</button>
      <button class="btn" id="kBottom">Bottom sheet</button>
      <button class="btn" id="kMoment">Pick reveal</button>
      <button class="btn" id="kToast">Toast</button>
    </div>`)}

    ${sec('Empty state', 'empty({title, text, action, iconName})', h`<div class="surface">${empty({ title: 'Your board is empty', text: 'Add players with the star on the Big Board.', iconName: 'starNav', action: '<a class="btn small" href="#board">Open the Big Board</a>' })}</div>`)}
  </div>`);

  // interactive bits
  const out = el.querySelector('#kPicked');
  const groups = ['All', ...fmt.POS_ORDER.slice(0, 11)].map(g => ({ value: g, label: g, count: g === 'All' ? D.prospects.length : D.prospects.filter(p => p.group === g).length }));
  el.querySelector('#kChips').append(chips(groups, 'All', v => { out.textContent = `Picked: ${v}`; }, 'Position'));
  el.querySelector('#kSeg').append(seg(['Consensus', 'Model', 'Expected pick'], 'Consensus', v => { out.textContent = `Sorted by: ${v}`; }, 'Sort'));
  el.querySelector('#kPhoto').onclick = () => pickPhoto(top[1].id);
  el.querySelector('#kTable').append(table([
    { key: 'r', label: 'Rank', num: true, get: p => p.consensus_rank },
    { key: 'n', label: 'Player', get: p => p.name },
    { key: 'g', label: 'Pos', get: p => p.group },
    { key: 's', label: 'School', get: p => p.school },
    { key: 'e', label: 'Exp. pick', num: true, get: p => p.exp_pick, html: p => fmt.num(p.exp_pick, 1) },
    { key: 'd', label: 'Declares', num: true, get: p => p.p_declare, html: p => fmt.pct(p.p_declare) },
  ], byCons.slice(0, 8), { sortKey: 'r', onRow: p => { location.hash = `player/${p.id}`; } }));
  const room = el.querySelector('#kRoom');
  roomColors(room, kc.c1, kc.c2);
  el.querySelector('#kRelight').addEventListener('click', e => {
    const b = e.target.closest('[data-team]');
    if (!b) return;
    const t = teamArt(b.dataset.team);
    roomColors(room, t.c1, t.c2);
  });
  let k = 0;
  const ringTimer = setInterval(() => {
    k = (k + 0.05) % 1.05;
    const r = el.querySelector('#kRing .ring');
    setRing(r, k);
    r.querySelector('span').textContent = `${Math.round(Math.min(1, k) * 100)}%`;
  }, 400);

  el.querySelector('#kSheet').onclick = () => {
    const s = sheet({ label: 'Example sheet', content: h`<div class="sh-hero" style="${raw(accentStyle(kc.c1, kc.c2))}"><span class="onum" aria-hidden="true">30</span>
      <div class="sh-in"><p class="label">sheet({content, label, onClose})</p><h2 class="wide">${kc.name}</h2>${facts(['AFC West', ['Pick', 30]])}</div></div>
      <div class="sh-body"><p>Esc, the close button or a click outside closes it. Focus stays inside while it is open.</p></div>` });
    void s;
  };
  el.querySelector('#kBottom').onclick = () => {
    const b = bottomSheet({ label: 'Trade call', content: h`<div style="display:flex;gap:12px;align-items:center">${logo('MIA', 48)}<div><p class="label">Trade call</p><h3 class="wide">Dolphins want to move up</h3></div></div>
      <p class="muted">bottomSheet({content, label}). Drag the handle down, press Esc, or tap outside to close.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn primary block" id="kAcc">Accept</button><button class="btn block">Decline</button></div>` });
    b.el.querySelector('#kAcc').onclick = () => { b.close('button'); toast('Trade done.'); };
  };
  el.querySelector('#kMoment').onclick = () => {
    const p = top[2];
    const t = teamArt('TEN');
    const m = moment({ label: 'The pick is in', style: accentStyle(t.c1, t.c2), content: h`<div class="reveal">
      <p class="kicker">The pick is in</p>
      <div class="reveal-top">${logo('TEN', 84)}<span class="reveal-no">01</span></div>
      ${face(p, 'cut')}
      <p class="reveal-sub">The ${t.name} select</p>
      <h2 class="reveal-name">${p.name}</h2>
      <p class="reveal-meta">${fmt.posName(p.group)} · ${p.school} · ${fmt.className(p.class_year)}</p>
      <div class="verdict"><b>A−</b><p>Example verdict text. The real one uses class rank against the pick, need and hit rates, labelled a quick read.</p></div>
      <div class="actions"><button class="btn primary" id="kCont">Continue the draft</button></div></div>` });
    m.el.querySelector('#kCont').onclick = () => m.close('button');
  };
  el.querySelector('#kToast').onclick = () => toast('Added to My Board.', { action: { label: 'Undo', run: () => toast('Undone.') } });
  void outcomeLegend;
  return () => clearInterval(ringTimer);
}
