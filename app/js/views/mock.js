import { esc, fmt, hitRatesAt, outcomeBar } from '../util.js';
import { newDraft, advance, makePick, available, choices, proposeTrade, udfaRush, classGrades, classRanks } from '../draft.js';
import { store } from '../store.js';

let S = null;       // the live draft
let opts = null;

export function mockView(el, D) {
  if (!S) return setup(el, D);
  live(el, D);
}

function setup(el, D) {
  const T = D.teams;
  const saved = store.setting('mockTeams') ?? [];
  el.innerHTML = `
    <h1>Mock draft</h1>
    <p class="muted small">Pick for one or more teams; the AI picks for the rest using its own board (the shared board with its own noise), position value, needs,
    each team's draft habits and a chance of reaching. AI teams trade up when a player they love is about to go. Order: projected from the 2026 season so far.</p>
    <div class="panel">
      <h3 style="margin-top:0">Your teams</h3>
      <div class="grid g3">${T.order.map((t, i) => `<label><input type="checkbox" value="${t}" ${saved.includes(t) ? 'checked' : ''}> ${i + 1}. ${esc(T.teams[t].name)}</label>`).join('')}</div>
      <h3>Options</h3>
      <label><input type="checkbox" id="allDeclare"> Every underclassman declares (otherwise each is drawn by his chance to declare)</label><br>
      <label><input type="checkbox" id="trades" checked> AI teams can trade</label><br>
      <label>Seed <input id="seed" size="6" value="${Math.floor(Math.random() * 9999)}"></label> <span class="small muted">The same seed gives the same draft.</span>
      <div class="row" style="margin-top:10px"><button class="primary" id="go">Start the draft</button></div>
    </div>`;
  el.querySelector('#go').onclick = () => {
    const teams = [...el.querySelectorAll('.grid input:checked')].map(i => i.value);
    store.setting('mockTeams', teams);
    opts = { allDeclare: el.querySelector('#allDeclare').checked, trades: el.querySelector('#trades').checked, seed: +el.querySelector('#seed').value || 1 };
    S = newDraft({ prospects: D.prospects, teams: D.teams, chart: D.value_chart, userTeams: teams, ...opts });
    S.userTeamsAtStart = teams;
    S.status = advance(S);
    live(el, D);
  };
}

function live(el, D) {
  const done = S.next >= S.picks.length;
  if (done) return recap(el, D);
  const pick = S.picks[S.next];
  const onClock = S.userTeams.has(pick.owner);
  const mine = store.get().board;
  const myRank = new Map(mine.map((id, i) => [id, i + 1]));
  const avail = available(S).slice(0, 120);
  const sugg = onClock ? choices(S, pick.owner, 5) : [];
  const userPicks = S.picks.filter(p => S.userTeams.has(p.owner) && p.player != null);
  const posFilter = el.dataset.pos ?? 'All';
  el.innerHTML = `
    <div class="row panel">
      <span class="clock">Pick ${pick.overall} · round ${pick.round} · ${esc(D.teams.teams[pick.owner].name)} on the clock</span>
      ${pick.original !== pick.owner ? `<span class="tag">from ${pick.original}</span>` : ''}${pick.comp ? '<span class="tag">compensatory placeholder</span>' : ''}
      <span class="spacer"></span>
      <button id="one" ${onClock ? 'disabled' : ''}>Sim one pick</button>
      <button id="toMine" ${onClock ? 'disabled' : ''}>Sim to my next pick</button>
      <button id="end">Sim to the end</button>
      <button id="restart">New draft</button>
    </div>
    <div class="grid mockgrid" style="margin-top:12px">
      <div class="panel ticker"><h3 style="margin-top:0">Picks</h3>${ticker(D)}</div>
      <div class="panel">
        ${onClock ? `<h3 style="margin-top:0">You're on the clock</h3>
          <p class="small">AI suggestions for ${pick.owner}: ${sugg.map(c => `<a href="#player/${D.prospects[c.i].id}">${esc(D.prospects[c.i].name)}</a> (${D.prospects[c.i].group})`).join(', ')}</p>
          <button id="auto">Let the AI pick for me</button>` : '<h3 style="margin-top:0">Best available</h3>'}
        <div class="row small" style="margin:6px 0">Position: ${['All', 'QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P'].map(g => `<button data-pos="${g}" ${g === posFilter ? 'class="primary"' : ''}>${g}</button>`).join('')}</div>
        <div class="tablewrap" style="max-height:60vh"><table><thead><tr><th class="num">Board</th><th class="num">Mine</th><th>Player</th><th>Pos</th><th>School</th><th>If taken here</th><th></th></tr></thead><tbody>
        ${avail.filter(i => posFilter === 'All' || D.prospects[i].group === posFilter).slice(0, 60).map(i => {
          const p = D.prospects[i];
          return `<tr><td class="num">${p.board_rank}</td><td class="num">${myRank.get(p.id) ?? ''}</td><td><a href="#player/${p.id}">${esc(p.name)}</a></td>
          <td><span class="pos">${p.group}</span></td><td>${esc(p.school)}</td><td>${outcomeBar(hitRatesAt(D.hit_rates, p.group, pick.overall))}</td>
          <td>${onClock ? `<button data-draft="${i}" class="primary">Draft</button>` : ''}</td></tr>`;
        }).join('')}</tbody></table></div>
      </div>
      <div class="panel">
        <h3 style="margin-top:0">Your picks</h3>
        ${userPicks.map(p => `<div>${p.overall}. ${p.owner} · <a href="#player/${D.prospects[p.player].id}">${esc(D.prospects[p.player].name)}</a> ${D.prospects[p.player].group}</div>`).join('') || '<p class="muted small">None yet.</p>'}
        <h3>Trade</h3>${tradePanel(D)}
        <h3>Trades so far</h3>
        <div class="small">${S.tradeLog.map(t => `<div>${t.buyer} gets ${t.got.join(', ')} from ${t.seller} for ${t.gave.join(', ')}${t.note ? ' · ' + esc(t.note) : ''}</div>`).join('') || '<span class="muted">None yet.</span>'}</div>
      </div>
    </div>`;

  const rerender = () => live(el, D);
  el.querySelectorAll('[data-pos]').forEach(b => b.onclick = () => { el.dataset.pos = b.dataset.pos; rerender(); });
  el.querySelectorAll('[data-draft]').forEach(b => b.onclick = () => { makePick(S, +b.dataset.draft, 'user'); S.status = advance(S); rerender(); });
  el.querySelector('#auto')?.addEventListener('click', () => { makePick(S, sugg[0].i, 'user-auto'); S.status = advance(S); rerender(); });
  el.querySelector('#one').onclick = () => { advance(S, { stopAtUser: true, until: S.next + 1 }); rerender(); };
  el.querySelector('#toMine').onclick = () => { advance(S); rerender(); };
  el.querySelector('#end').onclick = () => {
    // You chose to stop picking: the AI finishes for your teams too.
    S.userTeams.clear();
    advance(S, { stopAtUser: false });
    rerender();
  };
  el.querySelector('#restart').onclick = () => { S = null; setup(el, D); };
  wireTrade(el, D, rerender);
}

function ticker(D) {
  let out = '', round = 0;
  const from = Math.max(0, S.next - 40);
  for (let k = from; k < Math.min(S.picks.length, S.next + 6); k++) {
    const p = S.picks[k];
    if (p.round !== round) { round = p.round; out += `<div class="muted small" style="margin-top:6px"><b>Round ${round}</b></div>`; }
    const pr = p.player != null ? D.prospects[p.player] : null;
    out += `<div class="small ${S.userTeams.has(p.owner) ? 'mine' : ''}">${p.overall}. <b>${p.owner}</b> ${pr ? `<a href="#player/${pr.id}">${esc(pr.name)}</a> ${pr.group}
      <span class="muted">(#${pr.board_rank})</span>` : k === S.next ? '<i>on the clock</i>' : ''}</div>`;
  }
  return out;
}

function tradePanel(D) {
  const user = [...S.userTeams];
  if (!user.length) return '<p class="muted small">Pick a team to trade.</p>';
  const others = Object.keys(D.teams.teams).filter(t => !S.userTeams.has(t));
  const partner = S.tradePartner && !S.userTeams.has(S.tradePartner) ? S.tradePartner : S.picks[S.next].owner;
  const p = S.userTeams.has(partner) ? others[0] : partner;
  const open = t => S.picks.map((x, k) => ({ x, k })).filter(({ x }) => x.owner === t && x.player == null);
  const me = user[0];
  return `<div class="small">
    <label>Your team <select id="tme">${user.map(t => `<option ${t === me ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label>Partner <select id="tp">${others.map(t => `<option ${t === p ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:6px">
      <div><b>You give</b>${open(me).slice(0, 14).map(({ x, k }) => `<div><label><input type="checkbox" data-give="${k}"> ${x.overall} (rd ${x.round}, ${Math.round(S.value(x.overall))})</label></div>`).join('')}</div>
      <div><b>You get</b>${open(p).slice(0, 14).map(({ x, k }) => `<div><label><input type="checkbox" data-get="${k}"> ${x.overall} (rd ${x.round}, ${Math.round(S.value(x.overall))})</label></div>`).join('')}</div>
    </div>
    <button id="offer">Offer trade</button> <span id="tradeMsg" class="good">${esc(S.tradeMsg ?? '')}</span>
    <div class="muted">Numbers are chart points (computed from real career value per pick).</div></div>`;
}

function wireTrade(el, D, rerender) {
  const tp = el.querySelector('#tp');
  if (!tp) return;
  tp.onchange = () => { S.tradePartner = tp.value; rerender(); };
  el.querySelector('#offer').onclick = () => {
    const give = [...el.querySelectorAll('[data-give]:checked')].map(i => +i.dataset.give);
    const get = [...el.querySelectorAll('[data-get]:checked')].map(i => +i.dataset.get);
    S.tradeMsg = '';
    if (!give.length || !get.length) { el.querySelector('#tradeMsg').textContent = 'Pick at least one pick on each side.'; return; }
    const res = proposeTrade(S, el.querySelector('#tme').value, give, get);
    if (res.ok) { S.status = S.userTeams.has(S.picks[S.next].owner) ? 'user' : advance(S); S.tradeMsg = res.reason; rerender(); }
    else el.querySelector('#tradeMsg').textContent = res.reason;
  };
}

function recap(el, D) {
  const grades = classGrades(S);
  const udfa = S.udfa ?? (S.udfa = udfaRush(S));
  const rank = classRanks(S);
  const made = S.picks.filter(p => p.player != null).map(p => ({ p, pr: D.prospects[p.player], cr: rank.get(p.player), d: p.overall - rank.get(p.player) }));
  const steals = made.slice().sort((a, b) => b.d - a.d).slice(0, 10);
  const reaches = made.slice().sort((a, b) => a.d - b.d).slice(0, 10);
  const order = Object.keys(grades).sort((a, b) => grades[b].score - grades[a].score);
  el.innerHTML = `
    <div class="row"><h1 style="margin:0">Draft recap</h1><span class="spacer"></span><button id="restart">New draft</button></div>
    <div class="grid g2" style="margin-top:12px">
      <div class="panel"><h2 style="margin-top:0">Class grades</h2>
        <p class="small muted">Value of the players taken (by class rank) against the value of the picks spent, ranked against the other 31 classes. A quick read, not a forecast.</p>
        <table><thead><tr><th>Team</th><th>Grade</th><th class="num">Picks</th><th>Top picks</th></tr></thead><tbody>
        ${order.map(t => `<tr class="${S.userTeamsAtStart?.includes(t) ? 'mine' : ''}"><td><a href="#team/${t}">${t}</a></td><td><b>${grades[t].grade}</b></td><td class="num">${grades[t].picks.length}</td>
          <td class="small">${grades[t].picks.slice(0, 3).map(p => `${p.overall}. ${esc(D.prospects[p.player].name)}`).join(', ')}</td></tr>`).join('')}</tbody></table>
      </div>
      <div class="panel"><h2 style="margin-top:0">Steals and reaches</h2>
        <p class="small muted">Class rank: his place on the shared board among the players who entered this draft.</p><h3>Biggest steals (went later than his class rank)</h3>${steals.map(x => `<div class="small">${x.p.overall}. ${x.p.owner} <a href="#player/${x.pr.id}">${esc(x.pr.name)}</a> (class rank #${x.cr}) <span class="good">+${x.d}</span></div>`).join('')}
        <h3>Biggest reaches</h3>${reaches.map(x => `<div class="small">${x.p.overall}. ${x.p.owner} <a href="#player/${x.pr.id}">${esc(x.pr.name)}</a> (class rank #${x.cr}) <span class="bad">${x.d}</span></div>`).join('')}
        <h3>Trades</h3>${S.tradeLog.map(t => `<div class="small">${t.buyer} gets ${t.got.join(', ')} from ${t.seller} for ${t.gave.join(', ')}</div>`).join('') || '<p class="muted">None.</p>'}
      </div>
    </div>
    <div class="grid g2" style="margin-top:12px">
      <div class="panel"><h2 style="margin-top:0">Every pick</h2><div class="ticker">${S.picks.map(p => { const pr = D.prospects[p.player]; return `<div class="small">${p.overall}. <b>${p.owner}</b> ${pr ? `<a href="#player/${pr.id}">${esc(pr.name)}</a> ${pr.group}, ${esc(pr.school)}` : ''}</div>`; }).join('')}</div></div>
      <div class="panel"><h2 style="margin-top:0">Undrafted free agent rush</h2>
        <p class="small muted">Right after the draft, each team signs a few of the best players left, by its board and needs.</p>
        <div class="ticker">${udfa.map(u => `<div class="small"><b>${u.team}</b> <a href="#player/${D.prospects[u.i].id}">${esc(D.prospects[u.i].name)}</a> ${D.prospects[u.i].group}, ${esc(D.prospects[u.i].school)} (board #${D.prospects[u.i].board_rank})</div>`).join('')}</div>
      </div>
    </div>`;
  el.querySelector('#restart').onclick = () => { S = null; setup(el, D); };
}

export function _resetForTests() { S = null; opts = null; }
