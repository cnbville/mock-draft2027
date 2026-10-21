// Live standings glue: runs js/standings.js against the loaded data and your entries, and words what happened.
// Games come live from nflverse; if that fails, the last games this browser fetched, or the ones built into
// teams.json. The result lands in D.teams (order, records, slot ranges, picks). D.teams is replaced by a copy each
// time, so anything that caches by D.teams (the Teams screen's pick list) starts again.
import { chooseGames, applyStandings } from './standings.js';
import { store } from './store.js';
import { dateLong } from './ui/fmt.js';
import { shared } from './views/shared.js';

// Your entries, unless you switched them off on the Standings screen.
export const myStandings = () => (store.setting('standingsOff') ? {} : store.get().standings);

// live: true fetches now; a promise is a fetch already started; false reuses the games in hand and only re-applies
// your entries.
export async function refreshStandings(D, { live = true } = {}) {
  if (live || !D.games) D.games = await chooseGames(D.teams, { live });
  applyStandings(D, D.games, myStandings());
  D.teams = { ...D.teams };
  shared.sims = null; // simulations run on the old order are stale
  document.dispatchEvent(new CustomEvent('md:standings'));
}

const SOURCE = { live: ['good', 'Live'], cache: ['gold', 'Last known'], built: ['gold', 'Built in'], none: ['gold', 'No games'] };
export const standingsSource = T => SOURCE[T.standings?.source] ?? ['', 'Built'];

export function standingsLine(T) {
  const s = T.standings ?? {};
  const when = s.fetchedAt ? new Date(s.fetchedAt).toLocaleString() : '';
  const asOf = dateLong(T.as_of);
  const failed = s.error ? `Live standings failed (${s.error}). ` : '';
  const src = {
    live: `Live from nflverse, games through ${asOf}.`,
    cache: `${failed}Using the games this computer last fetched (${when}), through ${asOf}.`,
    built: `${failed}Using the games built into the app, through ${asOf}.`,
    none: `${failed}No game data, so the built order stands (as of ${asOf}).`,
  }[s.source] ?? `Standings as of ${asOf}.`;
  const n = s.manual?.length ?? 0;
  return src + (n ? ` Your entries apply to ${n} team${n > 1 ? 's' : ''}.` : '');
}
