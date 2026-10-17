// Mock Draft studio (stub from the front-end foundation; the draft room build replaces this file).
// The old room lives on disk in views/mock.js and in git: `git show HEAD:app/js/views/mock.js`.
import { h } from '../ui/dom.js';
import { logo, teamArt, roomColors } from '../ui/art.js';
import { ring } from '../ui/parts.js';

export function view(el, D) {
  const first = D.teams.picks[0];
  const t = teamArt(first.owner);
  roomColors(el, t.c1, t.c2);
  el.innerHTML = String(h`<div class="room" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="page below-top">
      <div class="glass panel" style="max-width:760px;margin:40px auto;padding:26px;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:18px">
        ${logo(first.owner, 76)}
        <div><p class="label">On the clock</p><h1 class="wide" style="font-size:clamp(26px,3.8vw,44px);line-height:.95">${t.name}</h1>
          <p class="muted" style="margin-top:6px">Pick 1. The live draft room is being built on this foundation.</p></div>
        ${ring(0.7, { size: 84, inner: '7:00', label: 'Clock' })}
      </div>
    </div>`);
}
