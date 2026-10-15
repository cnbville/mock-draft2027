import { esc, fmt, CLASS, hitRatesAt, outcomeBar, outcomeLegend, OUTCOME_LABELS, athleticScore, bar } from '../util.js';
import { store } from '../store.js';
import { shared } from './shared.js';

const STAT_COLS = {
  QB: [['pass_comp', 'Cmp'], ['pass_att', 'Att'], ['pass_yds', 'Yds'], ['pass_td', 'TD'], ['pass_int', 'Int'], ['sacked', 'Sk'], ['rush_yds', 'Rush yds'], ['rush_td', 'Rush TD']],
  RB: [['rush_att', 'Car'], ['rush_yds', 'Yds'], ['rush_td', 'TD'], ['targets', 'Tgt'], ['rec', 'Rec'], ['rec_yds', 'Rec yds'], ['sh_scrimmage', 'Share']],
  WR: [['targets', 'Tgt'], ['rec', 'Rec'], ['rec_yds', 'Yds'], ['rec_td', 'TD'], ['rush_yds', 'Rush yds'], ['sh_dominator', 'Dominator']],
  TE: [['targets', 'Tgt'], ['rec', 'Rec'], ['rec_yds', 'Yds'], ['rec_td', 'TD'], ['sh_dominator', 'Dominator']],
  EDGE: [['sacks', 'Sacks'], ['sh_sacks', 'Share of team sacks'], ['ff', 'FF'], ['pbu', 'PBU'], ['ints', 'Int']],
  DT: [['sacks', 'Sacks'], ['sh_sacks', 'Share of team sacks'], ['ff', 'FF'], ['pbu', 'PBU']],
  LB: [['sacks', 'Sacks'], ['pbu', 'PBU'], ['ints', 'Int'], ['ff', 'FF']],
  CB: [['pbu', 'PBU'], ['ints', 'Int'], ['ff', 'FF'], ['sacks', 'Sacks']],
  S: [['pbu', 'PBU'], ['ints', 'Int'], ['ff', 'FF'], ['sacks', 'Sacks']],
  K: [['fg_made', 'FG'], ['fg_missed', 'Missed']],
};
const TESTS = [['forty', '40-yard dash (s)'], ['vertical', 'Vertical (in)'], ['broad_jump', 'Broad jump (in)'], ['bench', 'Bench reps'], ['cone', '3-cone (s)'], ['shuttle', 'Shuttle (s)']];

export function profileView(el, D, arg) {
  const p = D.byId.get(+arg);
  if (!p) { el.innerHTML = '<p>Player not found.</p>'; return; }
  const idx = D.index.get(p.id);
  const sim = shared.sims?.summary[idx];
  const proj = Math.round(sim?.p50 ?? (p.consensus_rank ?? p.board_rank));
  const rates = hitRatesAt(D.hit_rates, p.group, proj);
  const me = store.get();
  const myRank = me.board.indexOf(p.id);
  const stats = STAT_COLS[p.group] ?? [];
  const isShare = k => k.startsWith('sh_');
  const ath = athleticScore(D.combine_pct, p.group, me.combine[p.id]);

  el.innerHTML = `
  <div class="row"><a href="#board">← Big board</a><span class="spacer"></span>
    <button id="star">${store.onBoard(p.id) ? '★ On my board' : '☆ Add to my board'}</button></div>
  <div class="panel head" style="margin-top:8px">
    ${p.headshot ? `<img src="${esc(p.headshot)}" alt="" onerror="this.style.display='none'">` : ''}
    <div>
      <h1 style="margin:0">${esc(p.name)} <span class="pos">${p.group}</span></h1>
      <div>${esc(p.school)} · ${esc(p.level)}${p.conference ? ' · ' + esc(p.conference) : ''} · ${CLASS[p.class_year] ?? 'class unknown'} · ${p.roster_seasons} seasons on a college roster</div>
      <div class="muted">${fmt.ht(p.height)}, ${p.weight ?? '–'} lb (school listing)${p.home ? ' · from ' + esc(p.home) : ''}${p.teams && p.teams.includes('|') ? ' · schools: ' + esc(p.teams.split('|').join(', ')) : ''}</div>
    </div>
    <span class="spacer"></span>
    <div class="kv">
      <div>Board (AI start)</div><div>#${p.board_rank}</div>
      <div>Consensus</div><div>${p.consensus_rank ? '#' + p.consensus_rank : 'not on the public boards'}</div>
      ${Object.entries(p.board_ranks).map(([b, r]) => `<div>${esc(b)}</div><div>#${r}</div>`).join('')}
      <div>Draft model</div><div>#${p.model_rank} · ${fmt.pct(p.p_drafted)} drafted if he declares, expected pick ${Math.round(p.exp_pick)}</div>
      <div>Chance he declares</div><div>${fmt.pct(p.p_declare)}</div>
      <div>My board</div><div>${myRank >= 0 ? '#' + (myRank + 1) : '–'}</div>
    </div>
  </div>

  <div class="grid g2" style="margin-top:12px">
    <div class="panel">
      <h2 style="margin-top:0">Projection</h2>
      ${sim ? `<p>In ${shared.sims.n} simulated drafts he went <b>${sim.p10}-${sim.p90}</b> (middle ${sim.p50}), in round 1 ${fmt.pct(sim.r1)} of the time, and was drafted ${fmt.pct(sim.drafted)} of the time
        (this includes the chance he stays in school).</p>
        <p>Most likely teams: ${sim.teams.map(([t, c]) => `<a href="#team/${t}">${t}</a> ${fmt.pct(c)}`).join(', ') || '–'}</p>` :
        '<p class="muted">Run the mock drafts on the big board to see his range.</p>'}
      <h3>What players taken around pick ${proj} became</h3>
      ${outcomeBar(rates)}${outcomeLegend()}
      <p class="small muted">${Object.entries(rates).map(([k, v]) => `${OUTCOME_LABELS[k]} ${fmt.pct(v)}`).join(' · ')}. ${esc(p.group)} players drafted 2000-2021 around this pick
      (seasons started and Pro Bowls, nflverse; computed). A range of outcomes, not a forecast for him.</p>
    </div>
    <div class="panel">
      <h2 style="margin-top:0">Size and athletic testing</h2>
      <p>Height ${p.size_pct.height != null ? fmt.pct(p.size_pct.height) : '–'} percentile, weight ${p.size_pct.weight != null ? fmt.pct(p.size_pct.weight) : '–'} percentile
      among ${esc(p.group)} combine invitees 2000-2026 (school listing, so treat it as rough).</p>
      <p>Athletic score: <b id="ras">${ath?.score != null ? ath.score.toFixed(2) + ' / 10' : 'no tests entered'}</b>
      <span class="small muted">(RAS-style: each test as a percentile at his position, averaged. Combine is in late February and March.)</span></p>
      <div class="grid g3">${TESTS.map(([k, l]) => `<label class="small">${l}<br><input data-test="${k}" size="6" value="${esc(me.combine[p.id]?.[k] ?? '')}"></label>`).join('')}</div>
    </div>
  </div>

  <div class="panel" style="margin-top:12px">
    <h2 style="margin-top:0">Traits</h2>
    <p class="small muted">"From stats" estimates are his percentile among drafted ${esc(p.group)}s in their final college season, on a 1-10 scale. They are not film grades.
    Film-only traits need your own grade. Your grade is what your board uses.</p>
    <table><thead><tr><th>Trait</th><th>Source</th><th class="num">Estimate</th><th></th><th>Your grade (1-10)</th></tr></thead><tbody>
    ${p.traits.map(t => `<tr><td>${esc(t.trait)}</td><td class="muted small">${esc(t.source)}${t.note ? ' (' + esc(t.note) + ')' : ''}</td>
      <td class="num">${t.est != null ? t.est.toFixed(1) : '–'}</td><td>${t.est != null ? bar(t.est / 10) : ''}</td>
      <td><input data-grade="${esc(t.trait)}" size="4" value="${esc(me.grades[p.id]?.[t.trait] ?? '')}"></td></tr>`).join('')}
    </tbody></table>
  </div>

  <div class="panel" style="margin-top:12px">
    <h2 style="margin-top:0">College stats</h2>
    <p class="small muted">From play-by-play: no tackles, pressures or snaps in the free data. Games counts games with a recorded stat.
    Opp. Elo is the average pre-game strength of the opponents he had stats against (1500 = average FBS team). 2026 is the season so far.</p>
    <div class="tablewrap" style="max-height:none"><table><thead><tr><th>Season</th><th>Team</th><th class="num">G</th>${stats.map(([, l]) => `<th class="num">${l}</th>`).join('')}<th class="num">Opp. Elo</th></tr></thead><tbody>
    ${p.seasons.map(s => `<tr><td>${s.season}</td><td>${esc(s.team)}</td><td class="num">${s.games}</td>${stats.map(([k]) => `<td class="num">${isShare(k) ? fmt.pct(s[k]) : fmt.num(s[k], k === 'sacks' ? 1 : 0)}</td>`).join('')}<td class="num">${fmt.num(s.opp_elo)}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">No recorded stats (linemen have none in this data).</td></tr>'}
    </tbody></table></div>
  </div>

  <div class="grid g2" style="margin-top:12px">
    <div class="panel">
      <h2 style="margin-top:0">Comparisons</h2>
      <p class="small muted">The closest drafted ${esc(p.group)}s from 2017-2026 by size, production shares, level and team strength. Recent picks have short careers so far.</p>
      <table><thead><tr><th>Player</th><th>School</th><th class="num">Drafted</th><th>Team</th><th class="num">Seasons started</th><th class="num">Pro Bowls</th></tr></thead><tbody>
      ${p.comps.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.school)}</td><td class="num">${c.draft_year} #${c.pick}</td><td>${esc(c.nfl_team)}</td><td class="num">${c.seasons_started ?? '–'}</td><td class="num">${c.probowls ?? '–'}</td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="panel">
      <h2 style="margin-top:0">Risk flags</h2>
      ${p.flags.map(f => `<div class="flag">${esc(f)}</div>`).join('') || '<p class="muted">No flags from the data.</p>'}
      <h3>Injury and character reports</h3>
      <p class="small muted">Only what you add, from published reporting, with a link. "None" here means none entered, not a clean record.</p>
      <div id="reports">${(me.reports[p.id] ?? []).map((r, i) => `<div class="flag">${esc(r.date)} · ${esc(r.kind)}: ${esc(r.text)} ${r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">source</a>` : ''} <button data-del="${i}">✕</button></div>`).join('') || '<p class="muted">None entered.</p>'}</div>
      <div class="row small">
        <select id="rkind"><option>Injury</option><option>Character</option><option>Medical</option><option>Other</option></select>
        <input id="rtext" placeholder="What was reported" size="24"><input id="rlink" placeholder="Link" size="16"><input id="rdate" type="date">
        <button id="radd">Add</button>
      </div>
      <h3>Notes</h3>
      <textarea id="note" rows="4" style="width:100%">${esc(me.notes[p.id] ?? '')}</textarea>
    </div>
  </div>`;

  el.querySelector('#star').onclick = e => {
    store.onBoard(p.id) ? store.remove(p.id) : store.add(p.id);
    e.target.textContent = store.onBoard(p.id) ? '★ On my board' : '☆ Add to my board';
  };
  el.querySelectorAll('[data-grade]').forEach(i => i.onchange = () => {
    const v = i.value === '' ? '' : Math.max(1, Math.min(10, parseFloat(i.value)));
    i.value = v;
    store.setGrade(p.id, i.dataset.grade, v);
  });
  el.querySelectorAll('[data-test]').forEach(i => i.onchange = () => {
    store.setCombine(p.id, i.dataset.test, i.value);
    const a = athleticScore(D.combine_pct, p.group, store.get().combine[p.id]);
    el.querySelector('#ras').textContent = a?.score != null ? a.score.toFixed(2) + ' / 10' : 'no tests entered';
  });
  el.querySelector('#note').onchange = e => store.setNote(p.id, e.target.value);
  el.querySelector('#radd').onclick = () => {
    const text = el.querySelector('#rtext').value.trim();
    if (!text) return;
    store.addReport(p.id, { kind: el.querySelector('#rkind').value, text, link: el.querySelector('#rlink').value.trim(),
      date: el.querySelector('#rdate').value || new Date().toISOString().slice(0, 10) });
    profileView(el, D, arg);
  };
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { store.removeReport(p.id, +b.dataset.del); profileView(el, D, arg); });
}
