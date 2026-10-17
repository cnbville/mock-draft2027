// Draft room: the trade builder and the incoming-call sheet (bottom sheets). The AI's answers are the engine's own
// (draft.js proposeTrade / acceptCall / declineCall); the points and the scale are the market chart, a guide only.

import { h, raw, bottomSheet, toast } from './dom.js';
import { logo, teamArt } from './art.js';
import { pill, src } from './parts.js';
import { num } from './fmt.js';
import { proposeTrade, acceptCall, declineCall, CLOCK } from '../draft.js';
import { assetValue, label } from '../ai/market.js';
import { ledger, scale, nick } from './draft-parts.js';

const openPicks = (S, t) => S.picks.map((x, k) => ({ x, k })).filter(({ x }) => x.owner === t && x.player == null);

function clockLine(S, me) {
  const pk = S.picks[S.next];
  if (!pk || pk.owner !== me) return '';
  const limit = CLOCK[pk.round - 1];
  const used = S.clock.pick === S.next ? S.clock.used : 0;
  return h`<p class="note">You are on the clock: ${used} of ${limit} minutes used. Each offer takes about a minute (estimated).
    Teams that want your pick offer less as your time runs out.</p>`;
}

// Trade builder. onDone(res) runs after a deal goes through.
export function openTradeSheet(S, D, { me: me0, partner: p0, onDone, onClose } = {}) {
  const users = [...S.userTeams];
  if (!users.length) { toast('Pick a team in a new draft to trade.'); return null; }
  const others = S.teamIds.filter(t => !S.userTeams.has(t)).sort((a, b) => teamArt(a).name.localeCompare(teamArt(b).name));
  const onClock = S.picks[S.next]?.owner;
  const st = {
    me: users.includes(me0) ? me0 : (S.userTeams.has(onClock) ? onClock : users[0]),
    partner: others.includes(p0) ? p0 : others.includes(onClock) ? onClock : others[0],
    give: new Set(), get: new Set(), msg: '', kind: '', counter: null,
  };
  const asset = (key, team) => (key.startsWith('f') ? S.future[team][+key.slice(1)] : +key);
  const list = (set, team) => [...set].map(k => asset(k, team)).filter(a => a != null);

  const side = (team, name, set) => {
    const rows = openPicks(S, team).slice(0, 14).map(({ x, k }) => ({ key: String(k), text: `Pick ${x.overall}`, sub: `Round ${x.round}${x.original !== team ? `, from ${x.original}` : ''}`, a: k }))
      .concat((S.future[team] ?? []).map((f, n) => ({ key: `f${n}`, text: label(S, f), sub: 'Next year', a: f })));
    if (!rows.length) return h`<p class="note">No picks left to trade.</p>`;
    return h`<div class="dr-assets" role="group" aria-label="${name === 'give' ? 'Your picks' : 'Their picks'}">${rows.map(r => h`<button type="button" class="dr-asset" data-side="${name}" data-key="${r.key}" aria-pressed="${set.has(r.key)}">
      <span><b>${r.text}</b><small>${r.sub}</small></span><em class="tnum">${num(assetValue(S, '_market', r.a))}</em></button>`)}</div>`;
  };

  const body = () => {
    const give = list(st.give, st.me), get = list(st.get, st.partner);
    const c = st.counter;
    return h`<div class="dr-tsheet">
      <div class="dr-sheethead">${logo(st.partner, 48)}<span><small>Trade builder</small><h3 class="wide">Make an offer</h3></span></div>
      <div class="dr-pickers">
        ${users.length > 1 ? h`<label><span class="label">Your team</span><select class="select" data-me>${users.map(t => h`<option value="${t}" ${raw(t === st.me ? 'selected' : '')}>${teamArt(t).name}</option>`)}</select></label>` : ''}
        <label><span class="label">Trade with</span><select class="select" data-partner>${others.map(t => h`<option value="${t}" ${raw(t === st.partner ? 'selected' : '')}>${teamArt(t).name}</option>`)}</select></label>
      </div>
      <div class="dr-sides">
        <div><p class="label">${nick(st.me)} give</p>${side(st.me, 'give', st.give)}</div>
        <div><p class="label">${nick(st.partner)} give</p>${side(st.partner, 'get', st.get)}</div>
      </div>
      <div data-sum>${ledger(S, give, get)}${scale(S, give, get)}</div>
      ${clockLine(S, st.me)}
      ${c ? h`<div class="dr-counter" role="status"><div class="dr-sheethead">${logo(c.partner, 36)}<span><b>${teamArt(c.partner).name} counter</b><small>${c.reason}</small></span></div>
          ${ledger(S, c.give, c.get)}${scale(S, c.give, c.get)}
          <div class="dr-row"><button type="button" class="btn primary" data-act="take">Accept the counter</button><button type="button" class="btn glass" data-act="drop">No thanks</button></div></div>`
        : st.msg ? h`<p class="dr-answer ${st.kind}" role="status">${st.msg}</p>` : ''}
      <div class="dr-row"><button type="button" class="btn primary" data-act="offer" ${raw(c ? 'hidden' : '')}>Send the offer</button><button type="button" class="btn glass" data-act="close">Close</button></div>
      <p class="note">Numbers are market chart points ${src('computed', 'fitted to real draft-day trades 2011-2025')}. Each team uses its own version: some pay more to move up, some value 2028 picks less. The answer is the team's own. A team lowballed three times in a round stops taking your calls.</p>
    </div>`;
  };

  const sheet = bottomSheet({ content: body(), label: 'Trade builder', cls: 'dr-sheet dr-wide', onClose });
  const paint = () => {
    const y = sheet.el.scrollTop;
    sheet.set(String(body()));
    sheet.el.scrollTop = y;
    const focus = sheet.el.querySelector('.dr-counter, .dr-answer');
    if (focus) focus.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  const sum = () => {
    const box = sheet.el.querySelector('[data-sum]');
    if (box) box.innerHTML = String(h`${ledger(S, list(st.give, st.me), list(st.get, st.partner))}${scale(S, list(st.give, st.me), list(st.get, st.partner))}`);
  };
  const done = res => {
    sheet.close('done');
    toast(res.reason || 'Deal done.');
    onDone?.(res);
  };
  sheet.el.addEventListener('change', e => {
    if (e.target.matches('[data-partner]')) { st.partner = e.target.value; st.get.clear(); }
    else if (e.target.matches('[data-me]')) { st.me = e.target.value; st.give.clear(); }
    else return;
    st.counter = null; st.msg = '';
    paint();
  });
  sheet.el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('dr-asset')) {
      const set = b.dataset.side === 'give' ? st.give : st.get;
      const k = b.dataset.key;
      if (set.has(k)) set.delete(k); else set.add(k);
      b.setAttribute('aria-pressed', String(set.has(k)));
      sum();
      return;
    }
    const act = b.dataset.act;
    if (act === 'close') return sheet.close('button');
    if (act === 'drop') { st.counter = null; st.msg = ''; return paint(); }
    if (act === 'take') {
      const c = st.counter;
      const res = proposeTrade(S, c.user, c.give, c.get);
      if (res.ok) return done(res);
      st.counter = null; st.msg = res.reason; st.kind = 'bad';
      return paint();
    }
    if (act === 'offer') {
      const give = list(st.give, st.me), get = list(st.get, st.partner);
      st.counter = null;
      if (!give.length || !get.length) { st.msg = 'Pick at least one pick on each side.'; st.kind = 'bad'; return paint(); }
      const res = proposeTrade(S, st.me, give, get);
      if (res.ok) return done(res);
      if (res.decision === 'counter') { st.counter = { user: st.me, partner: res.partner, reason: res.reason, ...res.counter }; st.msg = ''; return paint(); }
      st.msg = res.reason; st.kind = 'bad';
      paint();
    }
  });
  return sheet;
}

// An AI team calling you. onAnswer(accepted, message) runs after you answer.
export function openCallSheet(S, D, call, { onAnswer, onClose } = {}) {
  const t = teamArt(call.team);
  const sheet = bottomSheet({
    label: `Trade call from the ${t.name}`, cls: 'dr-sheet', onClose,
    content: String(h`<div class="dr-tsheet">
      <div class="dr-sheethead">${logo(call.team, 52)}<span><small>Trade call ${pill(call.kind === 'buy' ? 'They move up' : 'They move back', 'quiet')}</small><h3 class="wide">${t.name}</h3></span></div>
      <p>${call.note}</p>
      ${ledger(S, call.userGives, call.userGets)}${scale(S, call.userGives, call.userGets)}
      <p class="note">Calls come from what each team expects at its own pick. Turning one down costs nothing.</p>
      <div class="dr-row"><button type="button" class="btn primary" data-act="yes">Accept</button><button type="button" class="btn glass" data-act="no">No thanks</button></div>
    </div>`),
  });
  sheet.el.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const ok = act === 'yes' ? answerCall(S, call, true) : answerCall(S, call, false);
    sheet.close('answer');
    onAnswer?.(ok.accepted, ok.msg);
  });
  return sheet;
}

// Accept or decline a call the way the old room did: accepting clears the other calls.
export function answerCall(S, call, yes) {
  if (!yes) { declineCall(S, call); return { accepted: false, msg: `You said no to the ${nick(call.team)}.` }; }
  const ok = acceptCall(S, call);
  S.calls = [];
  return { accepted: ok, msg: ok ? `Deal done with the ${nick(call.team)}.` : 'That offer is off the table: a pick in it has moved.' };
}

export const callText = (S, c) => ({
  give: c.userGives.map(x => label(S, x)).join(', '),
  get: c.userGets.map(x => label(S, x)).join(', '),
});
