import { $, $$ } from './util.js';
import { boardView } from './views/board.js';
import { profileView } from './views/profile.js';
import { mineView } from './views/mine.js';
import { teamsView, teamView } from './views/teams.js';
import { mockView } from './views/mock.js';
import { simsView } from './views/sims.js';
import { aboutView } from './views/about.js';

const FILES = ['prospects', 'teams', 'value_chart', 'hit_rates', 'combine_pct', 'meta', 'model_report', 'ai_model',
  'trade_market'];

async function load() {
  const out = {};
  await Promise.all(FILES.map(async f => {
    const r = await fetch(`data/${f}.json`);
    if (!r.ok) throw new Error(`Could not load data/${f}.json`);
    out[f] = await r.json();
  }));
  out.byId = new Map(out.prospects.map(p => [p.id, p]));
  out.index = new Map(out.prospects.map((p, i) => [p.id, i]));
  return out;
}

const routes = {
  board: boardView, player: profileView, mine: mineView, teams: teamsView, team: teamView,
  mock: mockView, sims: simsView, about: aboutView,
};

let D;

function route() {
  const [name, arg] = (location.hash.slice(1) || 'board').split('/');
  const view = routes[name] ?? boardView;
  $$('#nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === `#${name}` ||
    (name === 'player' && a.getAttribute('href') === '#board') || (name === 'team' && a.getAttribute('href') === '#teams')));
  const el = $('#view');
  el.innerHTML = '';
  view(el, D, arg ? decodeURIComponent(arg) : undefined);
  window.scrollTo(0, 0);
}

load().then(d => {
  D = d;
  $('#foot').textContent = `Data built ${d.meta.built}. Standings as of ${d.teams.as_of}. ` +
    'Sources: cfbfastR-data (college stats and rosters), nflverse (drafts, combine, rosters, snaps, contracts, games, trades), ' +
    'public big boards (PFF, CBS Sports, NFL Draft Buzz). Not affiliated with any of them.';
  window.addEventListener('hashchange', route);
  route();
}).catch(e => {
  $('#view').innerHTML = `<div class="panel"><b>Could not load the data.</b><p>${e.message}</p>
  <p class="muted">Open the app through a local server (run <code>npm start</code> in the repo), not by double-clicking the file.</p></div>`;
});
