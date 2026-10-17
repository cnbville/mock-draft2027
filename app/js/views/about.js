// Model and data (stub from the front-end foundation; the Model and data build replaces this file).
// Everything the old screen had lives in git: `git show HEAD:app/js/views/about.js`.
import { h } from '../ui/dom.js';
import { dateLong } from '../ui/fmt.js';

export function view(el, D) {
  el.innerHTML = String(h`<div class="page narrow below-top">
    <div class="screen-head"><p class="label">Model and data</p><h1 class="screen-title">How it works</h1>
      <p class="lede">Data built ${dateLong(D.meta.built)}. Standings as of ${dateLong(D.teams.as_of)}. A placeholder while this page is built.</p></div>
  </div>`);
}
