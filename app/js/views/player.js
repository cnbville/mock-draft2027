// Player page (stub from the front-end foundation; the player page build replaces this file).
// It renders inside a full-screen sheet over the current screen (the router does that).
// Everything the old profile had lives in git: `git show HEAD:app/js/views/profile.js`.
import { h, icon } from '../ui/dom.js';
import { face, hasPhoto, pickPhoto, removePhoto, bindPhotoDrop } from '../ui/face.js';
import { schoolArt, roomColors } from '../ui/art.js';
import { posName, className, ht, wt, pct, rank, boardShort, hitRatesAt } from '../ui/fmt.js';
import { facts, statTiles, traitBars, outcomeBar, empty } from '../ui/parts.js';
import { store } from '../store.js';

export function view(el, D, arg) {
  const p = D.byId.get(+arg);
  if (!p) { el.innerHTML = String(empty({ title: 'Player not found', text: 'This player is not in the 2027 pool.' })); return; }
  const s = schoolArt(p.school);
  roomColors(el, s.c1, s.c2);
  const proj = Math.max(1, Math.round(p.consensus_rank ?? p.exp_pick ?? p.board_rank));
  const rates = hitRatesAt(D.hit_rates, p.group, proj);
  const boards = Object.entries(p.board_ranks ?? {}).map(([b, r]) => ({ value: r, label: b, src: 'published' }));
  el.innerHTML = String(h`
    <div class="sh-hero">
      <span class="onum" aria-hidden="true">${p.consensus_rank ?? p.board_rank}</span>
      <div class="sh-photo" id="shPhoto">${face(p, 'cut')}</div>
      <div class="sh-in">
        <p class="label" style="color:rgba(255,255,255,.85)">${posName(p.group)} · ${p.school}${p.conference ? ` · ${p.conference}` : ''}</p>
        <h2 class="wide">${p.name}</h2>
        ${facts([className(p.class_year), `${ht(p.height)} · ${wt(p.weight)}`, p.home, ['Consensus', rank(p.consensus_rank)], ['Model', rank(p.model_rank)], ['Declares', pct(p.p_declare)]])}
        <div class="actions" style="margin-top:6px">
          <button class="btn primary" type="button" id="addBoard"></button>
          <button class="btn glass" type="button" id="addPhoto">${icon('camera')}<span></span></button>
          <button class="btn glass" type="button" id="rmPhoto">Remove my photo</button>
        </div>
      </div>
    </div>
    <div class="sh-body">
      <div><h3>The boards</h3>${statTiles([...boards.map(b => ({ ...b, label: boardShort(b.label, D.meta) })), { value: Math.round(p.exp_pick), label: "Draft model's expected pick", src: 'computed' }])}</div>
      <div class="grid2">
        <div><h3>Traits</h3>${traitBars(p.traits, { grades: store.get().grades[p.id] })}</div>
        <div><h3>What players taken around pick ${proj} became</h3>${outcomeBar(rates, { legend: true, size: 'tall' })}
          <p class="note" style="margin-top:10px">${p.group} players drafted 2000-2021 near this pick (computed from nflverse). A range of outcomes, not a forecast for him.</p></div>
      </div>
      <p class="note">This page is a placeholder while the full player page is built.</p>
    </div>`);

  const addBtn = el.querySelector('#addBoard'), photoBtn = el.querySelector('#addPhoto'), rmBtn = el.querySelector('#rmPhoto');
  const sync = () => {
    const on = store.onBoard(p.id);
    addBtn.innerHTML = String(h`${icon(on ? 'check' : 'plus')}${on ? 'On my board' : 'Add to my board'}`);
    const has = hasPhoto(p.id);
    photoBtn.querySelector('span').textContent = has ? 'Change photo' : 'Add photo';
    rmBtn.hidden = !has;
  };
  sync();
  addBtn.onclick = () => { if (store.onBoard(p.id)) store.remove(p.id); else store.add(p.id); sync(); };
  photoBtn.onclick = () => pickPhoto(p.id);
  rmBtn.onclick = () => removePhoto(p.id);
  const onPhoto = e => { if (e.detail.id === String(p.id)) sync(); };
  document.addEventListener('md:photo', onPhoto);
  const unbind = bindPhotoDrop(el.querySelector('.sh-hero'), p.id, { highlight: el.querySelector('#shPhoto') });
  return () => { document.removeEventListener('md:photo', onPhoto); unbind(); };
}
