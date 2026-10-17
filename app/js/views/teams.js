// Teams and team pages (stub from the front-end foundation; the Teams build replaces this file).
// Everything the old screen had lives in git: `git show HEAD:app/js/views/teams.js`.
import { h } from '../ui/dom.js';
import { logo, teamArt, roomColors } from '../ui/art.js';
import { teamTile, statTiles, empty } from '../ui/parts.js';
import { money } from '../ui/fmt.js';

export function view(el, D, arg) {
  if (arg) {
    const x = D.teams.teams[arg];
    if (!x) { el.innerHTML = String(h`<div class="page below-top">${empty({ title: 'Team not found' })}</div>`); return; }
    const t = teamArt(arg);
    roomColors(el, t.c1, t.c2);
    el.innerHTML = String(h`<div class="room" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="page below-top"><div class="screen-head" style="grid-template-columns:auto 1fr;align-items:center;column-gap:22px">
        ${logo(arg, 96)}<div><p class="label">${x.division}</p><h1 class="screen-title">${t.name}</h1></div></div>
        <div class="glass panel">${statTiles([{ value: x.record, label: 'Record this season' }, { value: x.proj_wins, label: 'Projected wins', src: 'computed' },
          { value: `${x.slot_p10}-${x.slot_p90}`, label: 'Likely first pick (10-90%)', src: 'computed' }, { value: money(x.cap_space_2027_est), label: '2027 cap space', src: 'estimated' }])}
          <p class="note">A placeholder while the full team page is built.</p></div></div>`);
    return;
  }
  const seen = new Set();
  const order = D.teams.picks.filter(k => k.round === 1 && !seen.has(k.owner) && seen.add(k.owner)).map(k => k.owner);
  for (const a of D.teams.order ?? []) if (!seen.has(a)) { seen.add(a); order.push(a); }
  el.innerHTML = String(h`<div class="page below-top">
    <div class="screen-head"><p class="label">Teams</p><h1 class="screen-title">All 32 teams</h1>
      <p class="lede">In projected 2027 draft order. Pick a team to see its picks, needs and habits.</p></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:26px 10px;justify-items:center">${order.map(a => teamTile(a, { sub: D.teams.teams[a]?.record ?? '' }))}</div>
  </div>`);
}
