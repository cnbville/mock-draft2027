// Teams (#teams) and a team page (#team/ABBR).
//
// #teams: the 32 teams as lit tiles in projected 2027 draft order (logo, nickname, record, first pick and the
// 10-90% range of the team's own slot, top needs). A "Table" view keeps the old list's columns (projected wins,
// pick count, cap space, draft trades a year). Below: every pick trade the data applied.
//
// #team/ABBR: the screen is re-lit in the team's colours. Hero (logo, name, division, record, projected slot),
// then where the team picks (slot distribution chart), its 2027 picks (from-team logos when traded), the most
// likely first pick from the last simulation run, needs with starters (age, snaps, pay, contract) and notes,
// quarterback, cap (estimated), scheme, front office, draft habits, 2028 picks and the trades that moved its picks.
// "Draft as <team>" opens the draft room with the team chosen (#mock/ABBR).

import { h, raw, icon } from '../ui/dom.js';
import { logo, teamArt, teamStyle, roomColors, playerStyle } from '../ui/art.js';
import { face } from '../ui/face.js';
import { posPill, src, statTiles, seg, empty, starBtn } from '../ui/parts.js';
import { money, pct, num, int, rank, date, dateLong, posName, plural, dash } from '../ui/fmt.js';
import { buildPicks, DEFAULT_MODEL } from '../draft.js';
import { teamFacts, compile, NEED_FEATURES, GROUPS } from '../ai/model.js';
import { shared } from './shared.js';

// ---------- data helpers (same maths as the old screen) ----------

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
// Kickers and punters are judged on their own: teams rarely spend an early pick on one, so they come last.
const SPEC = ['K', 'P', 'LS'];
const fieldNeeds = (D, t) => fittedNeeds(D, t).filter(n => !SPEC.includes(n.g));

const SCHEME = { wcoast: 'West Coast', shanahan_wcoast: 'Shanahan West Coast', air_coryell_vertical: 'Air Coryell (vertical)',
  spread_rpo: 'spread and RPO', erhardt_perkins: 'Erhardt-Perkins', outside_zone: 'outside zone', inside_zone_duo: 'inside zone and duo',
  gap_power: 'gap and power', mixed: 'mixed run game', single_high: 'mostly single-high', two_high: 'mostly two-high',
  multiple_hybrid: 'multiple (hybrid) defense', fangio_two_high: 'Fangio two-high', multiple: 'multiple coverages',
  '34': '3-4 front', '43': '4-3 front', hybrid: 'hybrid front' };
const word = v => SCHEME[v] ?? String(v ?? '').replace(/_/g, ' ');
const cap1 = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

let pickCache = null;
function allPicks(D) {
  if (pickCache?.teams !== D.teams) pickCache = { teams: D.teams, list: buildPicks(D.teams) };
  return pickCache.list;
}
const picksOf = (D, t) => allPicks(D).filter(p => p.owner === t);

// Teams in projected 2027 order (each team's own slot), with its first owned pick.
function teamOrder(D) {
  const T = D.teams;
  return T.order.map((t, i) => ({ t, slot: i + 1, x: T.teams[t], first: picksOf(D, t)[0] ?? null }));
}

// "trade 1966 (2025-08-24): KC's round 6 pick, KC -> NYJ (conditional)"
const TRADE = /^trade (\d+) \((\d{4}-\d{2}-\d{2})\): (\w+)'s round (\d) pick, (\w+) -> (\w+)( \(conditional\))?$/;
function parseTrade(line) {
  const m = TRADE.exec(line);
  return m ? { id: m[1], date: m[2], orig: m[3], round: +m[4], from: m[5], to: m[6], cond: !!m[7], line } : { line };
}

// ---------- pieces ----------

function tradeRow(tr, focus) {
  if (!tr.orig) return h`<li class="tm-trade raw">${tr.line}</li>`;
  const side = focus ? (tr.to === focus ? h`<span class="pill good">Got</span>` : h`<span class="pill quiet">Sent</span>`) : '';
  return h`<li class="tm-trade">
    <span class="tm-tr-date">${date(tr.date)}<small>${tr.date.slice(0, 4)}</small></span>
    <span class="tm-tr-what"><b>${tr.orig}'s round ${tr.round} pick</b><small>Trade ${tr.id}${tr.cond ? ', conditional' : ''}</small></span>
    <span class="tm-tr-move">${logo(tr.from, 30)}${icon('right')}${logo(tr.to, 30)}</span>${side}
  </li>`;
}

function tradeNote() {
  return h`<p class="note">${src('published', 'nflverse trade list')} It ends in April 2026. When a team traded a pick in a round where it held two, the data doesn't say which; the app assumes its own.</p>`;
}

function tile({ t, slot, x, first }, D) {
  const a = teamArt(t);
  const needs = fieldNeeds(D, t).slice(0, 3).map(n => n.g);
  const firstText = first ? (first.round === 1 ? rank(first.overall) : `${rank(first.overall)}, round ${first.round}`) : dash;
  return h`<a class="tm-tile" href="#team/${t}" style="${raw(teamStyle(t))}" aria-label="${a.name}: record ${x.record}, first pick ${firstText}">
    <span class="onum tm-tile-n" aria-hidden="true">${slot}</span>
    ${logo(t, 60)}
    <span class="tm-tile-name"><b>${a.nick}</b><small>${x.record} · ${x.division}</small></span>
    <span class="tm-tile-facts">
      <span><small>First pick</small><b>${firstText}</b></span>
      <span><small>Range</small><b>${x.slot_p10}–${x.slot_p90}</b></span>
    </span>
    <span class="tm-tile-needs">${needs.length ? h`<small>Needs</small> ${needs.join(' · ')}` : ''}</span>
  </a>`;
}

function table(order, D) {
  return h`<div class="tbl tm-table"><table>
    <thead><tr><th class="l">Proj.</th><th class="l">Team</th><th class="l">Record</th><th>Proj. wins</th><th>Slot range (10-90%)</th>
      <th>First pick</th><th>Picks</th><th class="l">Top needs</th><th>Cap space (est.)</th><th>Draft trades a year</th></tr></thead>
    <tbody>${order.map(({ t, slot, x, first }) => h`<tr>
      <td class="l">${slot}</td>
      <td class="l"><a class="tm-tl" href="#team/${t}">${logo(t, 28)}<span>${x.name}</span></a></td>
      <td class="l">${x.record}</td><td>${num(x.proj_wins, 1)}</td><td>${x.slot_p10}–${x.slot_p90}</td>
      <td>${first ? first.overall : dash}</td><td>${picksOf(D, t).length}</td>
      <td class="l">${fieldNeeds(D, t).slice(0, 4).map(n => n.g).join(', ')}</td>
      <td>${money(x.cap_space_2027_est)}</td><td>${num(x.habits?.draft_trades_per_year, 1)}</td></tr>`)}</tbody>
  </table></div>`;
}

let gridMode = 'tiles';
function readMode() { try { return localStorage.getItem('md27.teams.mode') || 'tiles'; } catch { return 'tiles'; } }
function saveMode(v) { try { localStorage.setItem('md27.teams.mode', v); } catch { /* private mode */ } }

function grid(el, D) {
  const T = D.teams;
  const order = teamOrder(D);
  gridMode = readMode();
  el.innerHTML = String(h`<div class="page below-top">
    <div class="screen-head"><p class="label">Teams</p><h1 class="screen-title">All 32 teams</h1>
      <p class="lede">In projected 2027 draft order. The order comes from the 2026 season so far (as of ${dateLong(T.as_of)}) and ${int(T.sims)} simulations of the rest of the season and the playoffs.</p>
      <p class="note">${src('computed', 'Projected order and slot ranges')} ${src('computed', 'Needs: fitted on past drafts')} ${src('estimated', `Cap space, with a ${money(T.cap_2027_estimate)} cap`)}</p></div>
    <div class="tm-bar-row"><span class="tm-mode"></span></div>
    <div class="tm-body"></div>
    <section class="tm-sec tm-alltrades">
      <details class="surface"><summary><span><b>Pick trades applied</b><small>${plural(T.trade_log.length, 'pick')} moved before the 2027 draft</small></span>${icon('down')}</summary>
        <div class="tm-det">${tradeNote()}<ul class="tm-trades">${T.trade_log.map(l => tradeRow(parseTrade(l)))}</ul></div></details>
    </section>
  </div>`);
  const body = el.querySelector('.tm-body');
  const draw = () => {
    body.innerHTML = String(gridMode === 'table' ? table(order, D) : h`<div class="tm-grid">${order.map(o => tile(o, D))}</div>`);
  };
  el.querySelector('.tm-mode').replaceWith(seg([{ value: 'tiles', label: 'Tiles' }, { value: 'table', label: 'Table' }], gridMode, v => { gridMode = v; saveMode(v); draw(); }, 'Show teams as'));
  draw();
}

// slot distribution: one bar per first-round slot
function slotChart(x, sims) {
  const dist = x.slot_dist ?? [];
  const total = sims || dist.reduce((a, b) => a + b, 0) || 1;
  const max = Math.max(...dist, 1);
  const best = dist.indexOf(Math.max(...dist)) + 1;
  const label = `Chance of each first-round slot. Most likely slot ${best} (${pct(dist[best - 1] / total)}). 10-90% range ${x.slot_p10} to ${x.slot_p90}.`;
  return h`<figure class="tm-dist">
    <div class="tm-dist-bars" role="img" aria-label="${label}">
      ${dist.map((c, i) => {
        const s = i + 1, inRange = s >= x.slot_p10 && s <= x.slot_p90;
        return h`<span class="${inRange ? 'in' : ''}" title="Slot ${s}: ${pct(c / total, 1)}"><i style="height:${c ? Math.max(2, c / max * 100).toFixed(1) : 0}%"></i></span>`;
      })}
      <em class="tm-dist-mean" style="left:${((x.slot_mean - 0.5) / dist.length * 100).toFixed(2)}%" aria-hidden="true"><small>Avg ${num(x.slot_mean, 1)}</small></em>
    </div>
    <div class="tm-dist-axis" aria-hidden="true">${[1, 8, 16, 24, 32].map(s => h`<span style="left:${((s - 0.5) / dist.length * 100).toFixed(2)}%">${s}</span>`)}</div>
    <figcaption class="note"><i class="tm-key in"></i>10-90% range <i class="tm-key"></i>other slots. ${src('computed', `${int(sims)} simulations of the season`)}</figcaption>
  </figure>`;
}

function picksBlock(D, t, picks) {
  const byRound = {};
  for (const p of picks) (byRound[p.round] ??= []).push(p);
  return h`<div class="tm-picks">${[1, 2, 3, 4, 5, 6, 7].map(r => h`<div class="tm-round">
      <span class="label">Round ${r}</span>
      <div class="tm-round-picks">${(byRound[r] ?? []).length ? byRound[r].map(p => {
        const from = p.original !== t;
        return h`<span class="tm-pk ${from ? 'from' : ''} ${p.comp ? 'comp' : ''}" title="${p.comp ? 'Compensatory placeholder (estimated)' : from ? `From the ${teamArt(p.original).name}` : 'Own pick'}">
          <b>${p.overall}</b><small>${p.comp ? 'Comp.' : from ? h`${logo(p.original, 18)}${p.original}` : 'Own'}</small></span>`;
      }) : h`<span class="tm-pk none"><small>Traded</small></span>`}</div></div>`)}</div>`;
}

function futurePicks(x, t) {
  const f = x.future_picks ?? [];
  if (!f.length) return h`<p class="muted">None.</p>`;
  return h`<div class="tm-future">${f.map(p => h`<span class="tm-pk ${p.original !== t ? 'from' : ''}" title="${p.original !== t ? `From the ${teamArt(p.original).name}` : 'Own pick'}">
    <b>R${p.round}</b><small>${p.original !== t ? h`${logo(p.original, 18)}${p.original}` : 'Own'}</small></span>`)}</div>`;
}

function needsBlock(D, t, x) {
  const fit = fieldNeeds(D, t);
  const lo = Math.min(...fit.map(n => n.s)), hi = Math.max(...fit.map(n => n.s));
  const rel = v => Math.max(0, Math.min(1, hi > lo ? (v - lo) / (hi - lo) : 0.5));
  const list = [...fit, ...fittedNeeds(D, t).filter(n => SPEC.includes(n.g))];
  return h`<ol class="tm-needs">${list.map((n, i) => {
    const d = x.needs[n.g];
    const v = rel(n.s);
    const spec = SPEC.includes(n.g);
    return h`<li class="tm-need ${spec ? 'spec' : ''}">
      <span class="tm-need-g">${posPill(n.g)}<small>${posName(n.g)}</small></span>
      <span class="tm-need-bar" role="img" aria-label="${posName(n.g)} need: ${Math.round(v * 100)} of 100 against this team's other groups"><i style="width:${Math.max(3, v * 100).toFixed(1)}%"></i></span>
      <div class="tm-need-who">${d.starters.length ? d.starters.map(s => h`<div class="tm-starter">
          <b>${s.name}</b><span>${s.age != null ? `${num(s.age, 0)} in 2027` : 'age unknown'} · ${pct(s.snap_share)} of snaps${s.apy ? ` · ${money(s.apy * 1e6)} a year` : ''}${s.contract_end ? ` · signed through ${s.contract_end}` : ''}</span></div>`)
        : h`<div class="tm-starter none">No regular starter in 2026.</div>`}
        ${d.notes?.length ? h`<p class="tm-warn">${d.notes.join('. ')}.</p>` : ''}</div>
    </li>`;
  })}</ol>`;
}

function qbBlock(x) {
  const q = x.qb ?? {};
  if (!q.starter) return h`<p class="muted">No clear starter.</p>`;
  return h`<p class="tm-qb-name"><b>${q.starter}</b>${q.draft_pick ? h`<small>Drafted ${q.draft_pick === 1 ? 'first overall' : `with pick ${q.draft_pick}`}</small>` : h`<small>Draft pick not on record</small>`}</p>
    ${statTiles([
      { value: q.age != null ? num(q.age, 0) : dash, label: 'Age in 2027', src: 'published' },
      { value: q.contract_end ?? dash, label: 'Signed through', src: 'published' },
      { value: q.epa_play != null ? `${q.epa_play > 0 ? '+' : ''}${num(q.epa_play, 2)}` : dash, label: 'EPA per play, 2026', src: 'computed' },
      { value: q.apy_cap_pct != null ? pct(q.apy_cap_pct, 1) : dash, label: 'Pay as a share of the cap', src: 'published' },
    ], { cols: 2 })}`;
}

function schemeBlock(x) {
  const sc = x.scheme ?? {};
  const rows = [
    sc.off_family && ['Offense', `${cap1(word(sc.off_family))}, ${word(sc.run_scheme)}`],
    sc.off_playcaller && ['Offense calls', sc.off_playcaller],
    sc.def_family && ['Defense', `${cap1(word(sc.def_family))}, ${word(sc.front)}, ${word(sc.coverage)}`],
    sc.def_playcaller && ['Defense calls', sc.def_playcaller],
  ].filter(Boolean);
  const shares = [
    sc.man_share != null && ['Man coverage', sc.man_share],
    sc.two_high_share != null && ['Two-high shells', sc.two_high_share],
    sc.blitz_rate != null && ['Blitz rate', sc.blitz_rate],
    sc.p11 != null && ['11 personnel', sc.p11],
    sc.p12 != null && ['12 personnel', sc.p12],
  ].filter(Boolean);
  if (!rows.length && !shares.length) return h`<p class="muted">Not charted.</p>`;
  return h`<dl class="tm-dl">${rows.map(([k, v]) => h`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
    ${shares.length ? h`<div class="tm-shares">${shares.map(([k, v]) => h`<div class="meter"><span>${k}</span><span class="t"><i style="width:${(v * 100).toFixed(1)}%"></i></span><b>${pct(v)}</b></div>`)}</div>` : ''}
    <p class="note">${src('published', 'Labels: coaching staffs (researched)')} ${src('computed', 'Shares: play charting')} The AI uses them for fit: heavy tackles for a 3-4, athletic linemen for zone, fast and tall corners for man, fast receivers for a vertical offense.</p>`;
}

function frontOffice(x) {
  const fo = x.front_office ?? {};
  if (!fo.lead) return h`<p class="muted">No front-office record.</p>`;
  const pr = fo.profile ?? {};
  const tilt = Object.entries(pr.pos_tilt ?? {}).filter(([, v]) => Math.abs(v) >= 0.15).sort((a, b) => b[1] - a[1]);
  const more = tilt.filter(([, v]) => v > 0).map(([g]) => g), less = tilt.filter(([, v]) => v < 0).map(([g]) => g);
  const rate = v => (v == null ? 'about average' : v > 1.15 || v < 0.87 ? `${v.toFixed(1)}× the league rate` : 'about the league rate');
  const lines = [
    fo.drafts_run ? `${fo.drafts_run} draft${fo.drafts_run > 1 ? 's' : ''} run before 2027, at any team.` : 'No drafts run yet, so the AI uses the league\'s habits.',
    more.length || less.length ? `Rounds 1-3 lean: ${more.length ? `more ${more.join(', ')}` : ''}${more.length && less.length ? '; ' : ''}${less.length ? `fewer ${less.join(', ')}` : ''}.` : '',
    Math.abs(pr.ath_tilt ?? 0) >= 0.05 ? `Drafts ${pr.ath_tilt > 0 ? 'better' : 'weaker'} testers than the league.` : '',
    Math.abs(pr.senior_tilt ?? 0) >= 0.03 ? `${pr.senior_tilt > 0 ? 'More' : 'Fewer'} older prospects than the league.` : '',
    `Trades up ${rate(pr.trade_up_rate)}, down ${rate(pr.trade_down_rate)}.`,
    Math.abs(pr.chart_tilt ?? 0) >= 0.03 ? `Past trades sat ${pr.chart_tilt > 0 ? 'above' : 'below'} the market chart.` : '',
    (pr.future_tilt ?? 0) <= -0.1 ? 'Spends future picks freely.' : (pr.future_tilt ?? 0) >= 0.1 ? 'Holds on to future picks.' : '',
  ].filter(Boolean);
  const hcLead = fo.draft_lead === 'hc';
  return h`<dl class="tm-dl">
      <div><dt>Runs the draft</dt><dd>${fo.lead}<small>${hcLead ? 'Head coach has the final say' : 'General manager'}, since ${hcLead ? fo.hc_start : fo.gm_start}${(hcLead ? fo.new_hc : fo.new_gm) ? ' (new)' : ''}</small></dd></div>
      ${fo.gm && fo.gm !== fo.lead ? h`<div><dt>General manager</dt><dd>${fo.gm}<small>Since ${fo.gm_start}</small></dd></div>` : ''}
      <div><dt>Head coach</dt><dd>${fo.hc}<small>Since ${fo.hc_start}${fo.new_hc ? ' (new)' : ''}</small></dd></div>
    </dl>
    <ul class="tm-lines">${lines.map(l => h`<li>${l}</li>`)}</ul>
    <p class="note">${src('computed', 'From every draft this person ran')} Against the league, pulled toward average when there are few.</p>`;
}

function habitsBlock(x) {
  const hb = x.habits ?? {};
  const leans = Object.entries(hb.pos_mult ?? {}).filter(([, v]) => Math.abs(v - 1) >= 0.02).sort((a, b) => b[1] - a[1]);
  return h`${statTiles([
      { value: hb.early_picks_5yr ?? dash, label: 'Picks in rounds 1-3, last five drafts', src: 'published' },
      { value: num(hb.draft_trades_per_year, 1), label: 'Draft-day trades a year', src: 'computed' },
    ], { cols: 2 })}
    ${leans.length ? h`<div class="tm-leans">${leans.map(([g, v]) => h`<span class="tm-lean ${v > 1 ? 'up' : 'down'}" title="${posName(g)}: ${num(v, 2)}× the league rate">${g}<b>${v > 1 ? 'more' : 'less'}</b></span>`)}</div>`
      : h`<p class="muted">Close to the league average at every position.</p>`}
    <p class="note">${src('computed', 'Rounds 1-3, last five drafts')} Leans compare each position's share with the league.</p>`;
}

function capBlock(D, x) {
  return h`${statTiles([
      { value: money(x.cap_space_2027_est), label: '2027 cap space', src: 'estimated' },
      { value: money(x.cap_commit_2027), label: '2027 commitments', src: 'computed' },
    ], { cols: 2 })}
    <p class="note">Commitments add up active contracts' yearly averages (OverTheCap). Space uses an estimated 2027 cap of ${money(D.teams.cap_2027_estimate)}.</p>`;
}

function likelyBlock(D, t) {
  const s = shared.sims;
  if (!s) {
    return shared.running
      ? h`<div class="tm-wait surface"><b>Simulations are running.</b><p class="note">This team's most likely first picks show here when they finish.</p></div>`
      : h`<div class="tm-wait surface"><b>Who do they take first?</b><p class="note">Run the simulations to see who this team takes with its first pick most often.</p><a class="btn small" href="#sims">${icon('dice')}Run simulations</a></div>`;
  }
  const fp = s.firstPick[t] ?? {};
  const top = Object.entries(fp).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!top.length) return h`<p class="muted">No first pick in these runs.</p>`;
  const best = top[0][1] / s.n;
  return h`<div class="rows tm-likely">${top.map(([i, c], k) => {
    const p = D.prospects[+i];
    const v = c / s.n;
    return h`<div class="prow" style="${raw(playerStyle(p))}">
      <span class="num small-num" aria-hidden="true">${k + 1}</span>${face(p, 'round')}
      <span class="who"><a class="stretch" href="#player/${p.id}">${p.name}</a><small>${p.group} · ${p.school} · Board ${rank(p.board_rank)}</small></span>
      <span class="cols"><span class="tm-chance"><span class="t"><i style="width:${(v / best * 100).toFixed(1)}%"></i></span><b>${pct(v)}</b></span>${starBtn(p.id, p.name)}</span>
    </div>`;
  })}</div>`;
}

function teamPage(el, D, t) {
  const x = D.teams.teams[t];
  const a = teamArt(t);
  roomColors(el, a.c1, a.c2);
  const picks = picksOf(D, t);
  const first = picks[0];
  const trades = D.teams.trade_log.map(parseTrade).filter(tr => tr.orig ? [tr.orig, tr.from, tr.to].includes(t) : new RegExp(`\\b${t}\\b`).test(tr.line));
  const slot = D.teams.order.indexOf(t) + 1;
  const r1 = picks.filter(p => p.round === 1);
  const firstText = first ? `${rank(first.overall)}${first.round > 1 ? `, round ${first.round}` : ''}` : dash;

  const render = () => {
    el.innerHTML = String(h`<div class="room" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="page below-top">
      <header class="tm-hero">
        <span class="onum tm-hero-num" aria-hidden="true">${slot}</span>
        <div class="tm-hero-logo">${logo(t, 240)}</div>
        <div class="tm-hero-copy">
          <a class="tm-back" href="#teams">${icon('left')}All teams</a>
          <p class="label">${x.division} · Projected slot ${slot} of 32</p>
          <h1 class="wide tm-hero-name">${a.name}</h1>
          <div class="facts">
            <span class="fact">Record <b>${x.record}</b></span>
            <span class="fact">Projected wins <b>${num(x.proj_wins, 1)}</b></span>
            <span class="fact">Team rating <b>${x.rating > 0 ? '+' : ''}${num(x.rating, 1)}</b> points a game</span>
            <span class="fact">First pick <b>${firstText}</b></span>
            <span class="fact">${plural(picks.length, 'pick')} in 2027</span>
          </div>
          <div class="actions">
            <a class="btn primary" href="#mock/${t}">${icon('play')}Draft as the ${a.nick}</a>
            <a class="btn glass" href="#sims">${icon('dice')}Simulations</a>
          </div>
        </div>
      </header>

      <div class="tm-cols">
        <section class="glass panel tm-where">
          <h2>Where they pick <small>Round 1 slot</small></h2>
          ${statTiles([
            { value: num(x.slot_mean, 1), label: 'Average slot', src: 'computed' },
            { value: `${x.slot_p10}–${x.slot_p90}`, label: 'Likely range (10-90%)', src: 'computed' },
            { value: x.record, label: `Record as of ${date(D.teams.as_of)}`, src: 'published' },
          ], { cols: 3 })}
          ${slotChart(x, D.teams.sims)}
          ${r1.length === 0 ? h`<p class="tm-warn">They traded their own round 1 pick. Their first pick is ${firstText}.</p>` : ''}
        </section>
        <section class="glass panel tm-picks-panel">
          <h2>2027 picks <small>${plural(picks.length, 'pick')}</small></h2>
          ${picksBlock(D, t, picks)}
          <p class="note">${src('computed', 'Pick numbers follow the projected order')} ${src('estimated', 'Compensatory picks are placeholders')} Real compensatory picks come out in March.</p>
        </section>
      </div>

      <section class="tm-sec">
        <div class="tm-head"><h2>Most likely first pick</h2>${shared.sims ? h`<span class="note">${src('computed', `${int(shared.sims.n)} simulated drafts`)}</span>` : ''}</div>
        ${likelyBlock(D, t)}
      </section>

      <div class="tm-cols wide-left">
        <section class="glass panel tm-needs-panel">
          <h2>Needs <small>Highest first</small></h2>
          <p class="note">Ordered by how much each roster fact moved real teams' picks in rounds 1-2 (fitted on past drafts). The bar compares this team's groups with each other. Kicker and punter come last: teams rarely spend an early pick on one. ${src('computed', 'Need')} ${src('published', 'Starters: 2026 snaps, OverTheCap pay')}</p>
          ${needsBlock(D, t, x)}
        </section>
        <div class="stack">
          <section class="glass panel"><h2>Quarterback</h2>${qbBlock(x)}</section>
          <section class="glass panel"><h2>Cap <small>Estimated</small></h2>${capBlock(D, x)}</section>
          <section class="glass panel"><h2>Front office</h2>${frontOffice(x)}</section>
          <section class="glass panel"><h2>Draft habits</h2>${habitsBlock(x)}</section>
          <section class="glass panel"><h2>Scheme</h2>${schemeBlock(x)}</section>
          <section class="glass panel"><h2>2028 picks</h2>${futurePicks(x, t)}<p class="note">${src('published', 'nflverse trade list')}</p></section>
        </div>
      </div>

      <section class="tm-sec">
        <div class="tm-head"><h2>Pick trades applied</h2><span class="note">${trades.length ? plural(trades.length, 'pick') : 'None'} moved for this team</span></div>
        ${trades.length ? h`<ul class="tm-trades surface">${trades.map(tr => tradeRow(tr, t))}</ul>` : h`<p class="muted">No pick trades on record for this team.</p>`}
        ${tradeNote()}
      </section>
    </div>`);
  };
  render();

  // re-render the "most likely first pick" block when a simulation run finishes
  const listener = ev => {
    if (!ev.done || !el.isConnected) return;
    const keep = window.scrollY;
    render();
    window.scrollTo(0, keep);
  };
  shared.listeners.add(listener);
  return () => shared.listeners.delete(listener);
}

export function view(el, D, arg) {
  if (arg) {
    const t = String(arg).toUpperCase();
    if (!D.teams.teams[t]) {
      el.innerHTML = String(h`<div class="page below-top">${empty({ title: 'Team not found', text: 'That team is not in the data.', action: '<a class="btn" href="#teams">All teams</a>' })}</div>`);
      return;
    }
    return teamPage(el, D, t);
  }
  grid(el, D);
}
