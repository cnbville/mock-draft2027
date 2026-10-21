// Standings (#standings): where the draft order's records come from, and your own records when the live ones are
// wrong or late. Teams links here. The order is re-projected from the games (js/standings.js) every time the app
// opens; a record you enter replaces that team's, a playoff result you set decides how far it went.
// Blank rows use the games.

import { h, raw, icon, toast } from '../ui/dom.js';
import { logo } from '../ui/art.js';
import { src, seg } from '../ui/parts.js';
import { int } from '../ui/fmt.js';
import { store } from '../store.js';
import { EXITS, dataRecords } from '../standings.js';
import { refreshStandings, standingsLine, standingsSource } from '../live.js';

const recStr = r => (r ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}` : '–');
const KEYS = { w: 'wins', l: 'losses', t: 'ties' };

// The source line with Refresh (and, on Teams, Edit standings). Used by both screens.
export function standingsBar(D, { edit = false } = {}) {
  const T = D.teams, [kind, label] = standingsSource(T);
  return h`<div class="st-bar surface">
    <span class="pill ${kind}">${label}</span>${T.standings?.manual?.length ? h`<span class="pill quiet">Your entries</span>` : ''}
    <span class="st-bar-text">${standingsLine(T)}</span>
    <span class="st-bar-actions"><button type="button" class="btn small glass" data-refresh>${icon('refresh')}Refresh standings</button>
    ${edit ? h`<a class="btn small primary" href="#standings">Edit standings</a>` : ''}</span></div>`;
}

export function wireRefresh(el, D, again) {
  el.querySelectorAll('[data-refresh]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    b.lastChild.textContent = 'Fetching…';
    await refreshStandings(D, { live: true });
    again();
  }));
}

export function view(el, D) {
  const season = (D.teams.draft_year ?? 2027) - 1;
  const draw = (before = null) => {
    const T = D.teams;
    const fetched = dataRecords(D.games?.games, season);
    const mine = store.get().standings;
    const off = !!store.setting('standingsOff');
    const stale = new Set(T.standings?.stale ?? []);
    const confs = {};
    for (const t of Object.keys(T.teams).sort()) ((confs[T.teams[t].conference] ??= {})[T.teams[t].division] ??= []).push(t);

    const cell = (t, k) => h`<input class="input st-num" type="number" min="0" max="17" step="1" inputmode="numeric" data-t="${t}" data-k="${k}"
      value="${mine[t]?.[k] ?? ''}" placeholder="${fetched[t]?.[k] ?? ''}" aria-label="${T.teams[t].name} ${KEYS[k]}">`;
    const po = t => h`<select class="select st-po" data-t="${t}" data-k="po" aria-label="${T.teams[t].name} playoffs">
      <option value="">Auto</option>${EXITS.map(([k, , label]) => h`<option value="${k}" ${mine[t]?.po === k ? 'selected' : ''}>${label}</option>`)}</select>`;
    const row = t => h`<tr class="${mine[t] ? 'mine' : ''}">
      <td class="l"><a class="st-team" href="#team/${t}">${logo(t, 26)}<span>${T.teams[t].name}</span></a></td>
      <td class="muted">${recStr(fetched[t])}</td><td>${cell(t, 'w')}</td><td>${cell(t, 'l')}</td><td>${cell(t, 't')}</td><td class="l">${po(t)}</td>
      <td class="l">${stale.has(t) ? h`<span class="pill gold" title="The games show more games than your record, so the games are used">Out of date</span> ` : ''}${mine[t] ? h`<button type="button" class="btn small ghost" data-clear="${t}">Clear</button>` : ''}</td></tr>`;
    const conference = (c, divs) => h`<section class="surface st-conf"><h2 class="wide">${c}</h2><div class="tbl"><table>
      <thead><tr><th class="l">Team</th><th>From games</th><th>W</th><th>L</th><th>T</th><th class="l">Playoffs</th><th></th></tr></thead><tbody>
      ${Object.keys(divs).sort().map(d => h`<tr class="st-div"><th colspan="7" class="l label">${d}</th></tr>${divs[d].map(row)}`)}
      </tbody></table></div></section>`;
    const moved = t => {
      const d = before ? before.indexOf(t) - T.order.indexOf(t) : 0;
      return d ? h`<span class="pill ${d > 0 ? 'good' : 'quiet'}">${d > 0 ? '↑' : '↓'}${Math.abs(d)}</span>` : '';
    };

    el.innerHTML = String(h`<div class="page below-top">
      <div class="screen-head"><p class="label">Draft order</p><h1 class="screen-title">Standings</h1>
        <p class="lede">The order comes from this season's games, fetched live from nflverse each time the app opens (free, no key). If that fails, the app uses the games this computer last fetched, or the ones built into it.</p>
        <p class="lede">Enter a team's record when the live one is wrong or late. It replaces that team's, and the rest of its schedule is simulated as before. Leave a row blank to use the games. When the games catch up and show more games for a team than your record, the games win again. After the season, set how far each playoff team went.</p>
        <p class="note">${src('published', 'Games: nflverse')} ${src('computed', 'Order: simulated from point margins')}</p></div>
      ${standingsBar(D)}
      <div class="st-mode"><span class="st-mode-seg"></span></div>
      <div id="st-msg" role="status"></div>
      <div class="st-confs">${Object.keys(confs).sort().map(c => conference(c, confs[c]))}</div>
      <div class="actions st-actions"><button type="button" class="btn primary" data-save>Save and update the order</button>
        <button type="button" class="btn ghost" data-clear-all ${Object.keys(mine).length ? '' : 'disabled'}>Clear all my entries</button></div>
      <section class="surface st-order"><h2 class="wide">Projected first round</h2>
        <p class="note">${src('computed', `${int(T.sims)} simulations of the rest of the season and the playoffs`)}</p>
        <ol>${T.order.map((t, i) => h`<li><span class="cond tnum st-n">${i + 1}</span>${logo(t, 30)}
          <span class="st-name"><b>${T.teams[t].name}</b><small>${T.teams[t].record}${T.teams[t].record_manual ? ' (yours)' : ''} · ${T.teams[t].proj_wins} proj. wins · picks ${T.teams[t].slot_p10}–${T.teams[t].slot_p90}</small></span>${moved(t)}</li>`)}</ol>
      </section></div>`);

    const redo = async () => { const prev = T.order.slice(); await refreshStandings(D, { live: false }); draw(prev); };
    wireRefresh(el, D, () => draw(before));
    el.querySelector('.st-mode-seg').replaceWith(seg([{ value: 'on', label: 'Use my entries' }, { value: 'off', label: 'Ignore my entries' }], off ? 'off' : 'on', async v => {
      store.setting('standingsOff', v === 'off');
      await redo();
    }, 'Your entries'));
    // Typing in an empty row starts from the games' record, so changing one number keeps the other two.
    el.querySelectorAll('input[data-k]').forEach(inp => inp.addEventListener('focus', () => {
      const row = [...el.querySelectorAll(`input[data-t="${inp.dataset.t}"]`)];
      if (row.every(x => x.value === '')) row.forEach(x => { x.value = x.placeholder || '0'; });
    }));
    el.querySelectorAll('[data-clear]').forEach(b => b.addEventListener('click', async () => { store.setStanding(b.dataset.clear, null); await redo(); }));
    el.querySelector('[data-clear-all]').addEventListener('click', async () => {
      store.clearStandings();
      await redo();
      toast('Cleared your entries.');
    });
    el.querySelector('[data-save]').addEventListener('click', async () => {
      const bad = [], entries = {};
      for (const t of Object.keys(T.teams)) {
        const v = k => el.querySelector(`[data-t="${t}"][data-k="${k}"]`).value.trim();
        const [w, l, ti, p] = [v('w'), v('l'), v('t'), v('po')];
        const nums = [w, l, ti];
        if (nums.every(x => x === '') && !p) { entries[t] = null; continue; }
        if (nums.some(x => x !== '') && nums.some(x => x === '')) { bad.push(`${T.teams[t].name}: fill in W, L and T, or leave all three blank`); continue; }
        const n = nums.map(x => (x === '' ? null : Number(x)));
        if (n[0] != null && (n.some(x => !Number.isInteger(x) || x < 0) || n[0] + n[1] + n[2] > 17)) {
          bad.push(`${T.teams[t].name}: whole numbers that add up to 17 games or fewer`); continue;
        }
        const same = n[0] != null && fetched[t] && n[0] === fetched[t].w && n[1] === fetched[t].l && n[2] === fetched[t].t;
        // A record equal to the games' own adds nothing, so only a playoff result (if any) is kept.
        entries[t] = same && !p ? null : { ...(n[0] != null && !same ? { w: n[0], l: n[1], t: n[2] } : {}), ...(p ? { po: p } : {}) };
      }
      if (bad.length) {
        el.querySelector('#st-msg').innerHTML = String(h`<div class="flag">Not saved. ${bad.join('. ')}.</div>`);
        return;
      }
      for (const [t, e] of Object.entries(entries)) store.setStanding(t, e && Object.keys(e).length ? e : null);
      await redo();
      toast('Saved. The order is updated.');
    });
  };
  draw();
}
