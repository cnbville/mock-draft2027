import { esc, fmt, bar } from '../util.js';
import { buildPicks } from '../draft.js';
import { shared } from './shared.js';

function picksOf(D, t) {
  return buildPicks(D.teams).filter(p => p.owner === t);
}

export function teamsView(el, D) {
  const T = D.teams;
  el.innerHTML = `
    <h1>Teams</h1>
    <p class="muted small">Projected 2027 order from the 2026 season so far (as of ${esc(T.as_of)}) plus ${T.sims.toLocaleString()} simulations of the rest of the season and the playoffs.
    Needs are estimated from 2026 snaps, pay, draft pedigree, age and contracts ending. Cap space uses an estimated 2027 cap of ${fmt.money(T.cap_2027_estimate)}.</p>
    <div class="tablewrap"><table><thead><tr><th class="num">Proj.</th><th>Team</th><th>Record</th><th class="num">Proj. wins</th><th>Pick range (10-90%)</th>
      <th class="num">Picks</th><th>Top needs</th><th class="num">Cap space (est.)</th><th class="num">Draft trades / yr</th></tr></thead><tbody>
    ${T.order.map((t, i) => {
      const x = T.teams[t];
      const needs = Object.entries(x.needs).sort((a, b) => a[1].rank - b[1].rank).slice(0, 4).map(([g]) => g).join(', ');
      return `<tr class="click" data-t="${t}"><td class="num">${i + 1}</td><td><a href="#team/${t}">${esc(x.name)}</a></td><td>${x.record}</td>
        <td class="num">${x.proj_wins}</td><td>${x.slot_p10}-${x.slot_p90}</td><td class="num">${picksOf(D, t).length}</td><td>${needs}</td>
        <td class="num">${fmt.money(x.cap_space_2027_est)}</td><td class="num">${x.habits.draft_trades_per_year}</td></tr>`;
    }).join('')}</tbody></table></div>
    <h2>Pick trades applied</h2>
    <p class="small muted">From the nflverse trade list (ends April 2026). When a team traded a pick in a round where it held two, the data doesn't say which; the tool assumes its own.</p>
    <div class="panel small">${T.trade_log.map(esc).join('<br>')}</div>`;
  el.querySelectorAll('tr[data-t]').forEach(tr => tr.onclick = e => { if (!e.target.closest('a')) location.hash = `team/${tr.dataset.t}`; });
}

export function teamView(el, D, t) {
  const x = D.teams.teams[t];
  if (!x) { el.innerHTML = '<p>Team not found.</p>'; return; }
  const picks = picksOf(D, t);
  const fp = shared.sims?.firstPick[t];
  const likely = fp ? Object.entries(fp).sort((a, b) => b[1] - a[1]).slice(0, 8) : [];
  const needs = Object.entries(x.needs).sort((a, b) => a[1].rank - b[1].rank);
  el.innerHTML = `
    <div class="row"><a href="#teams">← Teams</a></div>
    <h1>${esc(x.name)} <span class="muted small">${x.division} · ${x.record}</span></h1>
    <div class="grid g2">
      <div class="panel">
        <h2 style="margin-top:0">2027 picks</h2>
        <p>Projected first-round slot ${x.slot_mean.toFixed(1)} (10-90%: ${x.slot_p10}-${x.slot_p90}), from a team rating of ${x.rating > 0 ? '+' : ''}${x.rating} points per game.</p>
        <table><thead><tr><th>Round</th><th class="num">Pick (proj.)</th><th>From</th></tr></thead><tbody>
        ${picks.map(p => `<tr><td>${p.round}</td><td class="num">${p.overall}</td><td>${p.comp ? '<span class="tag">compensatory placeholder</span>' : p.original === t ? 'own' : p.original}</td></tr>`).join('')}
        </tbody></table>
        <h3>Draft habits (last five drafts, rounds 1-3)</h3>
        <p class="small">${x.habits.early_picks_5yr} early picks. Leans: ${Object.entries(x.habits.pos_mult).filter(([, v]) => Math.abs(v - 1) >= 0.02)
          .map(([g, v]) => `${g} ${v > 1 ? 'more' : 'less'} often`).join(', ') || 'close to the league average'}. Draft-day trades: ${x.habits.draft_trades_per_year} a year.</p>
        <h3>Cap (estimated)</h3>
        <p class="small">2027 commitments ${fmt.money(x.cap_commit_2027)} from active contracts' yearly averages; space about ${fmt.money(x.cap_space_2027_est)}.</p>
      </div>
      <div class="panel">
        <h2 style="margin-top:0">Needs</h2>
        <table><thead><tr><th>Group</th><th>Need</th><th>Starters (2026 snaps)</th></tr></thead><tbody>
        ${needs.map(([g, n]) => `<tr><td><span class="pos">${g}</span></td><td>${bar(n.need)}</td>
          <td class="small">${n.starters.map(s => `${esc(s.name)} (${s.age ?? '?'}, ${fmt.pct(s.snap_share)}${s.contract_end ? ', thru ' + s.contract_end : ''})`).join('; ') || '–'}
          ${n.notes.length ? `<div class="warn">${esc(n.notes.join('; '))}</div>` : ''}</td></tr>`).join('')}
        </tbody></table>
      </div>
    </div>
    ${likely.length ? `<div class="panel" style="margin-top:12px"><h2 style="margin-top:0">Most likely first pick (${shared.sims.n} mock drafts)</h2>
      ${likely.map(([i, c]) => { const p = D.prospects[+i]; return `<div><a href="#player/${p.id}">${esc(p.name)}</a> ${p.group}, ${esc(p.school)}: ${fmt.pct(c / shared.sims.n)}</div>`; }).join('')}</div>` : ''}`;
}
