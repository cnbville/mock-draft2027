// Standings: where the draft order's records come from, and your own records when the live ones are wrong or
// missing. Built with the Showtime design system (app/showtime/showtime.css), scoped to this page.
import { esc } from '../util.js';
import { store } from '../store.js';
import { EXITS, dataRecords } from '../standings.js';
import { refreshStandings, standingsLine } from './shared.js';

const SOURCE = { live: ['good', 'Live'], cache: ['gold', 'Last known'], built: ['gold', 'Built-in'], none: ['gold', 'No games'] };
const recStr = r => (r ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}` : '–');

// The source pill and refresh button, shared with the Teams page.
export function standingsBar(D, { edit = false } = {}) {
  const s = D.teams.standings ?? {};
  const [cls, label] = SOURCE[s.source] ?? ['', 'Built'];
  return `<div class="st st-bar-row">
    <span class="st-pill ${cls}">${label}</span>${s.manual?.length ? '<span class="st-pill">Your entries</span>' : ''}
    <span class="st-muted st-bar-text">${esc(standingsLine(D.teams))}</span>
    <span class="st-bar-actions"><button class="st-btn glass small" data-refresh>Refresh standings</button>
    ${edit ? '<a class="st-btn primary small" href="#standings">Edit standings</a>' : ''}</span></div>`;
}

export function wireRefresh(el, D, rerender) {
  el.querySelectorAll('[data-refresh]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    b.textContent = 'Fetching…';
    await refreshStandings(D, { live: true });
    rerender();
  });
}

export function standingsView(el, D, _arg, before = null) {
  const T = D.teams;
  const season = (T.draft_year ?? 2027) - 1;
  const fetched = dataRecords(D.games?.games, season);
  const mine = store.get().standings;
  const off = !!store.setting('standingsOff');
  const stale = new Set(T.standings?.stale ?? []);
  const confs = {};
  for (const t of Object.keys(T.teams).sort()) ((confs[T.teams[t].conference] ??= {})[T.teams[t].division] ??= []).push(t);
  const cell = (t, k) => `<input class="st-input" type="number" min="0" max="17" step="1" inputmode="numeric" data-t="${t}" data-k="${k}"
    value="${mine[t]?.[k] ?? ''}" placeholder="${fetched[t]?.[k] ?? ''}" aria-label="${esc(T.teams[t].name)} ${{ w: 'wins', l: 'losses', t: 'ties' }[k]}">`;
  const po = t => `<select class="st-input" data-t="${t}" data-k="po" aria-label="${esc(T.teams[t].name)} playoffs">
    <option value="">Auto</option>${EXITS.map(([k, , label]) => `<option value="${k}" ${mine[t]?.po === k ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
  const row = t => `<tr class="${mine[t] ? 'hi' : ''}"><td><a href="#team/${t}">${esc(T.teams[t].name)}</a></td>
    <td class="st-muted">${recStr(fetched[t])}</td><td>${cell(t, 'w')}</td><td>${cell(t, 'l')}</td><td>${cell(t, 't')}</td><td>${po(t)}</td>
    <td>${stale.has(t) ? '<span class="st-pill gold" title="The games show more games than your record, so the games are used">Out of date</span> ' : ''}${mine[t] ? `<button class="st-btn glass small" data-clear="${t}">Clear</button>` : ''}</td></tr>`;
  const conference = (c, divs) => `<div class="st-surface st-panel"><h2>${c}</h2><div class="st-table dense"><table>
    <thead><tr><th>Team</th><th>From games</th><th>W</th><th>L</th><th>T</th><th>Playoffs</th><th></th></tr></thead><tbody>
    ${Object.keys(divs).sort().map(d => `<tr class="st-divrow"><th colspan="7" class="st-label">${esc(d)}</th></tr>${divs[d].map(row).join('')}`).join('')}
    </tbody></table></div></div>`;
  const moved = t => {
    if (!before) return '';
    const d = before.indexOf(t) - T.order.indexOf(t);
    return d ? `<span class="st-pill ${d > 0 ? 'good' : ''}">${d > 0 ? '↑' : '↓'}${Math.abs(d)}</span>` : '';
  };
  el.innerHTML = `
    <section class="st st-page">
      <div class="st-head"><div class="st-label">Draft order</div><h1 class="st-wide">Standings</h1>
        <p class="st-muted">The order comes from this season's games, fetched live from nflverse each time the app opens (free, no key).
        If that fails, the app uses the last games this browser fetched, or the ones built into the app. Enter a team's record here when
        the live one is wrong or late: it replaces that team's, and the rest of its schedule is simulated as before. Leave a row blank to use the games. When the games catch up and show more games for a team than your record, the games win again.
        After the season, set how far each playoff team went.</p></div>
      ${standingsBar(D)}
      <div class="st-tabs" role="tablist" aria-label="Your entries">
        <button role="tab" aria-selected="${!off}" data-off="0">Use my entries</button>
        <button role="tab" aria-selected="${off}" data-off="1">Ignore my entries</button></div>
      <div id="st-msg"></div>
      <div class="st-confs">${Object.keys(confs).sort().map(c => conference(c, confs[c])).join('')}</div>
      <div class="st-actions"><button class="st-btn primary" data-save>Save and update the order</button>
        <button class="st-btn glass" data-clear-all ${Object.keys(mine).length ? '' : 'disabled'}>Clear all my entries</button></div>
      <div class="st-surface st-panel"><h2>Projected first round <small>${T.sims.toLocaleString()} simulations of the rest of the season (computed)</small></h2>
        <ol class="st-feed st-order">${T.order.map((t, i) => { const x = T.teams[t]; return `<li><span class="n">${i + 1}</span><span class="st-mark">${t}</span>
          <span><b>${esc(x.name)}</b><small>${x.record}${x.record_manual ? ' (yours)' : ''} · ${x.proj_wins} proj. wins · picks ${x.slot_p10}-${x.slot_p90}</small></span>${moved(t)}</li>`; }).join('')}</ol>
      </div>
    </section>`;

  const rerender = (prev = null) => standingsView(el, D, _arg, prev);
  wireRefresh(el, D, () => rerender(before));
  // Typing in an empty row starts from the fetched record, so changing one number keeps the other two.
  el.querySelectorAll('input[data-k]').forEach(inp => inp.onfocus = () => {
    const row = [...el.querySelectorAll(`input[data-t="${inp.dataset.t}"]`)];
    if (row.every(x => x.value === '')) row.forEach(x => { x.value = x.placeholder || '0'; });
  });
  el.querySelectorAll('[data-off]').forEach(b => b.onclick = async () => {
    store.setting('standingsOff', b.dataset.off === '1');
    const prev = T.order.slice();
    await refreshStandings(D, { live: false });
    rerender(prev);
  });
  el.querySelectorAll('[data-clear]').forEach(b => b.onclick = async () => {
    store.setStanding(b.dataset.clear, null);
    const prev = T.order.slice();
    await refreshStandings(D, { live: false });
    rerender(prev);
  });
  el.querySelector('[data-clear-all]').onclick = async () => {
    if (!confirm('Clear every record and playoff result you entered?')) return;
    store.clearStandings();
    const prev = T.order.slice();
    await refreshStandings(D, { live: false });
    rerender(prev);
  };
  el.querySelector('[data-save]').onclick = async () => {
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
      el.querySelector('#st-msg').innerHTML = `<div class="st-flag">Not saved. ${bad.map(esc).join('. ')}.</div>`;
      return;
    }
    for (const [t, e] of Object.entries(entries)) store.setStanding(t, e && Object.keys(e).length ? e : null);
    const prev = T.order.slice();
    await refreshStandings(D, { live: false });
    rerender(prev);
  };
}
