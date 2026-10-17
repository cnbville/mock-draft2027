// Simulations (stub from the front-end foundation; the Simulations build replaces this file).
// Everything the old screen had lives in git: `git show HEAD:app/js/views/sims.js`. Shared runner: views/shared.js.
import { h } from '../ui/dom.js';
import { ring } from '../ui/parts.js';
import { shared } from './shared.js';

export function view(el) {
  el.innerHTML = String(h`<div class="page below-top">
    <div class="screen-head"><p class="label">Simulations</p><h1 class="screen-title">Many drafts at once</h1>
      <p class="lede">Run hundreds of mock drafts to see each prospect's range. A placeholder while the screen is built.</p></div>
    <div class="surface panel" style="grid-template-columns:auto 1fr;align-items:center;gap:20px;max-width:620px">
      ${ring(shared.sims ? 1 : 0, { size: 96, inner: h`${shared.sims ? shared.sims.n : 0}<small>drafts run</small>`, label: 'Simulations run' })}
      <p class="muted">${shared.sims ? `${shared.sims.n} simulated drafts are ready.` : 'No simulated drafts yet.'}</p>
    </div></div>`);
}
