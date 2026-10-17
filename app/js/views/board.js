// Big Board (stub from the front-end foundation; the Big Board build replaces this file).
// Everything the old board had lives in git: `git show HEAD:app/js/views/board.js`.
import { h } from '../ui/dom.js';
import { pct } from '../ui/fmt.js';
import { playerRow } from '../ui/parts.js';

export function view(el, D) {
  const rows = D.prospects.slice().sort((a, b) => a.board_rank - b.board_rank).slice(0, 30);
  el.innerHTML = String(h`<div class="page below-top">
    <div class="screen-head"><p class="label">Big Board</p><h1 class="screen-title">The 2027 class</h1>
      <p class="lede">The ${D.prospects.length} players most likely to be drafted. This is a placeholder while the full board is built.</p></div>
    <div class="rows">${rows.map(p => playerRow(p, { num: p.board_rank, cols: [
      { label: 'Consensus', value: p.consensus_rank ?? '–', wide: true },
      { label: 'Expected pick', value: Math.round(p.exp_pick), wide: true },
      { label: 'Declares', value: pct(p.p_declare) }] }))}</div>
  </div>`);
}
