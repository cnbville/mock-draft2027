// My Board (stub from the front-end foundation; the My Board build replaces this file).
// Everything the old screen had lives in git: `git show HEAD:app/js/views/mine.js`.
import { h } from '../ui/dom.js';
import { playerRow, empty } from '../ui/parts.js';
import { store } from '../store.js';

export function view(el, D) {
  const draw = () => {
    const ids = store.get().board.filter(id => D.byId.has(id));
    el.innerHTML = String(h`<div class="page below-top">
      <div class="screen-head"><p class="label">My Board</p><h1 class="screen-title">Your ranking</h1>
        <p class="lede">Star players on the Big Board or a player page to add them here. This is a placeholder while the full screen is built.</p></div>
      ${ids.length ? h`<div class="rows">${ids.map((id, i) => playerRow(D.byId.get(id), { num: i + 1 }))}</div>`
        : empty({ title: 'Your board is empty', text: 'Add players with the star on the Big Board.', iconName: 'starNav', action: '<a class="btn small" href="#board">Open the Big Board</a>' })}
    </div>`);
  };
  draw();
  document.addEventListener('md:board', draw);
  return () => document.removeEventListener('md:board', draw);
}
