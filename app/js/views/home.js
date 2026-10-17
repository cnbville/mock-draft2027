// Home (stub from the front-end foundation; the Home screen build replaces this file).
// Shows the shared pieces in place: a hero lit in school colours, a Top 10 shelf, a team shelf.
import { h, icon, raw } from '../ui/dom.js';
import { face } from '../ui/face.js';
import { schoolArt, accentStyle } from '../ui/art.js';
import { posName, className, ht, wt, firstLast, boardShort } from '../ui/fmt.js';
import { posPill, ranked, poster, shelf, teamTile } from '../ui/parts.js';

export function view(el, D) {
  const byCons = D.prospects.filter(p => p.consensus_rank).sort((a, b) => a.consensus_rank - b.consensus_rank);
  const p = byCons[0];
  const s = schoolArt(p.school);
  const [first, last] = firstLast(p.name);
  const ranks = Object.entries(p.board_ranks ?? {}).map(([b, r]) => `${r} by ${boardShort(b, D.meta)}`).join(', ');
  const seen = new Set();
  const order = D.teams.picks.filter(k => k.round === 1 && !seen.has(k.owner) && seen.add(k.owner));
  el.innerHTML = String(h`
    <div class="hero" style="${raw(accentStyle(s.c1, s.c2))}">
      <div class="hero-art" aria-hidden="true"><div class="beam"></div></div>
      <div class="hero-num" aria-hidden="true">${p.consensus_rank}</div>
      <div class="hero-face">${face(p, 'cut')}</div>
      <div class="hero-copy wrap swap">
        <p class="label" style="color:rgba(255,255,255,.82)">${posName(p.group)} · ${p.school}</p>
        <h1 class="hero-name">${first}<br>${last}</h1>
        <p class="hero-meta">${posPill(p.group)}${className(p.class_year)} · ${ht(p.height)} · ${wt(p.weight)}${p.home ? ` · ${p.home}` : ''}</p>
        <p class="hero-line">Ranked ${ranks}.</p>
        <div class="actions"><a class="btn primary" href="#mock">${icon('play')}Start a mock draft</a><a class="btn glass" href="#player/${p.id}">See profile</a></div>
      </div>
    </div>
    ${shelf({ title: 'Top 10 on the consensus board', note: 'CBS Sports, NFL Draft Buzz and PFF', items: byCons.slice(0, 10).map(x => ranked(x, x.consensus_rank)) })}
    ${shelf({ title: 'Quarterbacks', note: 'By consensus rank', items: byCons.filter(x => x.group === 'QB').map(x => poster(x)) })}
    ${shelf({ title: 'Pick your team', note: 'In projected 2027 draft order', items: order.map(k => teamTile(k.owner, { sub: `Pick ${k.slot}`, href: '#mock' })) })}
  `);
}
