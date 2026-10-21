import { esc, fmt, bar } from '../util.js';
import { buildPicks, DEFAULT_MODEL } from '../draft.js';
import { teamFacts, compile, NEED_FEATURES, GROUPS } from '../ai/model.js';
import { shared } from './shared.js';
import { standingsBar, wireRefresh } from './standings.js';

// Needs as the draft AI weighs them in rounds 1-2: each roster fact times the weight fitted on real drafts
// (tools/fit_pick_model.mjs). Highest first.
function fittedNeeds(D, t) {
  const model = D.ai_model ?? DEFAULT_MODEL;
  const C = compile(model);
  const T = teamFacts(D.teams.teams[t], model);
  return GROUPS.filter(g => D.teams.teams[t].needs?.[g])
    .map(g => ({ g, s: NEED_FEATURES.reduce((a, f, n) => a + (C.w[C.idx[`need|${f}|0`]] ?? 0) * T.need[g][n], 0) +
      (g === 'QB' ? ['prod', 'old', 'exp_now', 'exp_next', 'ped'].reduce((a, f) => a + (C.w[C.idx[`qb|${f}|early`]] ?? 0) * T.need.QB[NEED_FEATURES.indexOf(f)], 0) : 0) }))
    .sort((a, b) => b.s - a.s);
}
// Kickers and punters are judged on their own: their need facts are scaled like everyone else's, but teams rarely
// spend an early pick on one, so they are listed after the rest.
const SPEC = ['K', 'P', 'LS'];
const fieldNeeds = (D, t) => fittedNeeds(D, t).filter(n => !SPEC.includes(n.g));

const SCHEME = { wcoast: 'West Coast', shanahan_wcoast: 'Shanahan West Coast', air_coryell_vertical: 'Air Coryell (vertical)',
  spread_rpo: 'spread and RPO', erhardt_perkins: 'Erhardt-Perkins', outside_zone: 'outside zone', inside_zone_duo: 'inside zone and duo',
  gap_power: 'gap and power', mixed: 'mixed run game', single_high: 'mostly single-high', two_high: 'mostly two-high',
  multiple_hybrid: 'multiple (hybrid) defense', fangio_two_high: 'Fangio two-high', '34': '3-4 front', '43': '4-3 front', hybrid: 'hybrid front' };
const word = v => SCHEME[v] ?? String(v ?? '').replace(/_/g, ' ');

function frontOffice(x) {
  const fo = x.front_office ?? {};
  if (!fo.lead) return '<p class="small muted">No front-office record.</p>';
  const pr = fo.profile ?? {};
  const tilt = Object.entries(pr.pos_tilt ?? {}).filter(([, v]) => Math.abs(v) >= 0.15).sort((a, b) => b[1] - a[1]);
  const more = tilt.filter(([, v]) => v > 0).map(([g]) => g), less = tilt.filter(([, v]) => v < 0).map(([g]) => g);
  const rate = v => (v == null ? 'about average' : v > 1.15 ? `${v.toFixed(1)}× the league rate` : v < 0.87 ? `${v.toFixed(1)}× the league rate` : 'about the league rate');
  const lines = [
    `${esc(fo.lead)} runs the draft (${fo.draft_lead === 'hc' ? 'the head coach has final say' : 'general manager'}, since ${fo.draft_lead === 'hc' ? fo.hc_start : fo.gm_start}); head coach ${esc(fo.hc)} since ${fo.hc_start}.`,
    fo.drafts_run ? `Record: ${fo.drafts_run} draft${fo.drafts_run > 1 ? 's' : ''} run before 2027, at any team.` : 'No drafts run yet, so the AI uses the league\'s habits.',
    more.length || less.length ? `Rounds 1-3 lean: ${more.length ? `more ${more.join(', ')}` : ''}${more.length && less.length ? '; ' : ''}${less.length ? `fewer ${less.join(', ')}` : ''}.` : '',
    Math.abs(pr.ath_tilt ?? 0) >= 0.05 ? `Drafts ${pr.ath_tilt > 0 ? 'better' : 'weaker'} testers than the league.` : '',
    Math.abs(pr.senior_tilt ?? 0) >= 0.03 ? `${pr.senior_tilt > 0 ? 'More' : 'Fewer'} older prospects than the league.` : '',
    `Trades up ${rate(pr.trade_up_rate)}, down ${rate(pr.trade_down_rate)}.`,
    Math.abs(pr.chart_tilt ?? 0) >= 0.03 ? `Past trades sat ${pr.chart_tilt > 0 ? 'above' : 'below'} the market chart.` : '',
    (pr.future_tilt ?? 0) <= -0.1 ? 'Spends future picks freely.' : (pr.future_tilt ?? 0) >= 0.1 ? 'Holds on to future picks.' : '',
  ].filter(Boolean);
  return `<p class="small">${lines.join(' ')}</p><p class="small muted">From every draft this person ran, against the league, shrunk toward average when there are few (computed).</p>`;
}

function picksOf(D, t) {
  return buildPicks(D.teams).filter(p => p.owner === t);
}

export function teamsView(el, D) {
  const T = D.teams;
  el.innerHTML = `
    <h1>Teams</h1>
    <p class="muted small">Projected 2027 order from the 2026 season so far (as of ${esc(T.as_of)}) plus ${T.sims.toLocaleString()} simulations of the rest of the season and the playoffs.
    Needs: how much each roster fact (2026 snaps, pay, draft pedigree, age, contracts ending, depth, recent picks, QB play) moved real teams' early picks,
    fitted on past drafts (computed). Cap space uses an estimated 2027 cap of ${fmt.money(T.cap_2027_estimate)}.</p>
    ${standingsBar(D, { edit: true })}
    <div class="tablewrap"><table><thead><tr><th class="num">Proj.</th><th>Team</th><th>Record</th><th class="num">Proj. wins</th><th>Pick range (10-90%)</th>
      <th class="num">Picks</th><th>Top needs</th><th class="num">Cap space (est.)</th><th class="num">Draft trades / yr</th></tr></thead><tbody>
    ${T.order.map((t, i) => {
      const x = T.teams[t];
      const needs = fieldNeeds(D, t).slice(0, 4).map(n => n.g).join(', ');
      return `<tr class="click" data-t="${t}"><td class="num">${i + 1}</td><td><a href="#team/${t}">${esc(x.name)}</a></td><td>${x.record}${x.record_manual ? ' <span class="tag">yours</span>' : ''}</td>
        <td class="num">${x.proj_wins}</td><td>${x.slot_p10}-${x.slot_p90}</td><td class="num">${picksOf(D, t).length}</td><td>${needs}</td>
        <td class="num">${fmt.money(x.cap_space_2027_est)}</td><td class="num">${x.habits.draft_trades_per_year}</td></tr>`;
    }).join('')}</tbody></table></div>
    <h2>Pick trades applied</h2>
    <p class="small muted">From the nflverse trade list (ends April 2026). When a team traded a pick in a round where it held two, the data doesn't say which; the tool assumes its own.</p>
    <div class="panel small">${T.trade_log.map(esc).join('<br>')}</div>`;
  el.querySelectorAll('tr[data-t]').forEach(tr => tr.onclick = e => { if (!e.target.closest('a')) location.hash = `team/${tr.dataset.t}`; });
  wireRefresh(el, D, () => teamsView(el, D));
}

export function teamView(el, D, t) {
  const x = D.teams.teams[t];
  if (!x) { el.innerHTML = '<p>Team not found.</p>'; return; }
  const picks = picksOf(D, t);
  const fp = shared.sims?.firstPick[t];
  const likely = fp ? Object.entries(fp).sort((a, b) => b[1] - a[1]).slice(0, 8) : [];
  const fit = fieldNeeds(D, t);
  const lo = Math.min(...fit.map(n => n.s)), hi = Math.max(...fit.map(n => n.s));
  const rel = v => Math.max(0, Math.min(1, hi > lo ? (v - lo) / (hi - lo) : 0.5));
  const needs = [...fit, ...fittedNeeds(D, t).filter(n => SPEC.includes(n.g))].map(n => [n.g, x.needs[n.g], rel(n.s)]);
  const sc = x.scheme ?? {}, qb = x.qb ?? {};
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
        <h3>Front office</h3>${frontOffice(x)}
        <h3>Scheme</h3>
        <p class="small">${[sc.off_family && `Offense: ${word(sc.off_family)}, ${word(sc.run_scheme)}.`, sc.off_playcaller && `Calls: ${esc(sc.off_playcaller)}.`,
          sc.def_family && `Defense: ${word(sc.def_family)}, ${word(sc.front)}, ${word(sc.coverage)}.`, sc.def_playcaller && `Calls: ${esc(sc.def_playcaller)}.`,
          sc.man_share != null && `Man coverage on ${fmt.pct(sc.man_share)} of charted passes.`].filter(Boolean).join(' ') || 'Not charted.'}</p>
        <p class="small muted">Labels from coaching staffs (researched); shares from play charting (computed). The AI uses them for fit: heavy tackles for a 3-4,
        athletic linemen for zone, fast and tall corners for man, fast receivers for a vertical offense.</p>
        <h3>Quarterback</h3>
        <p class="small">${qb.starter ? `${esc(qb.starter)}, ${qb.age ?? '?'} in 2027${qb.contract_end ? `, signed through ${qb.contract_end}` : ''}${qb.epa_play != null ? `, ${qb.epa_play > 0 ? '+' : ''}${qb.epa_play.toFixed(2)} EPA per play` : ''}.` : 'No clear starter.'}</p>
        <h3>2028 picks</h3>
        <p class="small">${(x.future_picks ?? []).map(f => `round ${f.round}${f.original !== t ? ` (from ${f.original})` : ''}`).join(', ') || 'None.'}</p>
        <h3>Cap (estimated)</h3>
        <p class="small">2027 commitments ${fmt.money(x.cap_commit_2027)} from active contracts' yearly averages; space about ${fmt.money(x.cap_space_2027_est)}.</p>
      </div>
      <div class="panel">
        <h2 style="margin-top:0">Needs</h2>
        <p class="small muted">Ordered by the fitted need for rounds 1-2; the bar is relative to this team's other groups. Kicker and punter come last:
        teams rarely spend an early pick on one.</p>
        <table><thead><tr><th>Group</th><th>Need</th><th>Starters (2026 snaps)</th></tr></thead><tbody>
        ${needs.map(([g, n, v]) => `<tr><td><span class="pos">${g}</span></td><td>${bar(v)}</td>
          <td class="small">${n.starters.map(s => `${esc(s.name)} (${s.age ?? '?'}, ${fmt.pct(s.snap_share)}${s.contract_end ? ', thru ' + s.contract_end : ''})`).join('; ') || '–'}
          ${n.notes.length ? `<div class="warn">${esc(n.notes.join('; '))}</div>` : ''}</td></tr>`).join('')}
        </tbody></table>
      </div>
    </div>
    ${likely.length ? `<div class="panel" style="margin-top:12px"><h2 style="margin-top:0">Most likely first pick (${shared.sims.n} mock drafts)</h2>
      ${likely.map(([i, c]) => { const p = D.prospects[+i]; return `<div><a href="#player/${p.id}">${esc(p.name)}</a> ${p.group}, ${esc(p.school)}: ${fmt.pct(c / shared.sims.n)}</div>`; }).join('')}</div>` : ''}`;
}
