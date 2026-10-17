// Model and data (#about): how the app works and where every number comes from.
//
// Sections: data dates; how the AI drafts and trades (a short summary of docs/ai-design.md); the draft model's
// test results (AUC, rank agreement, AUC by position as a bar chart, the model's top 100 per test year); the pick
// value chart (this app's chart against the Jimmy Johnson chart, with a hover readout); hit rates by pick (stacked
// bars plus every percentage); the public boards used with their dates and weights; the AI draft settings (TUNING);
// every data source with its date; and a note about the app.

import { h, on, reduceMotion } from '../ui/dom.js';
import { src, statTiles, outcomeBar, outcomeLegend } from '../ui/parts.js';
import { pct, num, int, date, dateLong, posName, OUTCOMES } from '../ui/fmt.js';
import { TUNING, buildPicks } from '../draft.js';

// ---------- AI settings in plain words ----------
const PLAIN = {
  candidates: 'Players each pick looks at',
  perGroup: 'Plus the best at each position',
  'noise.shared': 'Noise: the league\'s view of a player',
  'noise.team': 'Noise: each team\'s own view',
  'noise.tail': 'Noise: tail shape',
  'noise.varianceScale': 'Noise: variance scale',
  'noise.scale': 'Noise: overall size against the fitted model',
  'noise.day': 'Noise on the day, by round (against round 1)',
  'trades.window': 'How far behind a buyer can be, by round (slots)',
  'trades.dealRate': 'Chance a workable deal gets done, by round',
  'trades.maxPerRound': 'Most trades in a round (a safety cap)',
  'trades.attachment': 'Extra a team charges for loving its player',
  'trades.overconfidence': 'How much a buyer pays over its expected gain, by round',
  'trades.trust': 'Share of its own read a team trusts when it values players',
  'trades.eager': 'Discount a team with a deep tier takes to move back',
  'trades.split': 'Where the two sides settle (1 = anywhere between)',
  'trades.qbUrgency': 'Extra a QB-needy buyer pays for a QB',
  'trades.margin': 'Extra the team moving down wants over the chart',
  'trades.maxOverpay': 'Most a buyer pays over the chart gap',
  'trades.assetFuss': 'Penalty for each extra pick in a package',
  'trades.slack': 'Give on either side to close a deal in minutes',
  'trades.vetRate': 'Chance of a veteran-for-pick look, by round',
  'trades.callRate': 'Chance an interested team calls you, by round',
  'trades.callPremium': 'When you call to move up: share over its ask, by round',
  'trades.fairBuy': 'When you call to move back: sweetener a buyer pays, by round',
  'trades.fairRisk': 'Risk level at which that sweetener is paid in full',
};
function flat(obj, pre = '') {
  return Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? flat(v, `${pre}${k}.`) : [[`${pre}${k}`, v]]));
}
const fmtVal = v => (Array.isArray(v)
  ? h`<span class="ab-rounds">${v.map((x, i) => h`<span><small>R${i + 1}</small>${String(x)}</span>`)}</span>`
  : h`<b>${String(v)}</b>`);

// ---------- pick value chart ----------
function valueChart(D) {
  const pts = D.value_chart.points.filter(p => p.pick <= 257);
  const W = 720, H = 300, L = 52, R = 14, T = 16, B = 34, maxV = 3000;
  const x = p => L + (p - 1) / 256 * (W - L - R);
  const y = v => T + (1 - v / maxV) * (H - T - B);
  const line = key => pts.filter(p => p[key] != null).map((p, i) => `${i ? 'L' : 'M'}${x(p.pick).toFixed(1)},${y(p[key]).toFixed(1)}`).join('');
  const area = `${line('value')}L${x(pts[pts.length - 1].pick).toFixed(1)},${y(0)}L${x(1)},${y(0)}Z`;
  const starts = [];
  for (const k of buildPicks(D.teams)) if (!starts[k.round]) starts[k.round] = k.overall;
  const at = p => pts.find(q => q.pick === p);
  const p33 = at(33), p1 = at(1);
  return h`<figure class="ab-chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pick value chart. Pick 1 is worth ${int(p1?.value)} points on both charts. Pick 33 is worth ${int(p33?.value)} on this app's chart and ${int(p33?.jimmy_johnson)} on the Jimmy Johnson chart.">
      <defs><linearGradient id="abFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      ${[0, 1000, 2000, 3000].map(v => h`<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="yl" x="${L - 8}" y="${y(v) + 4}">${int(v)}</text>`)}
      ${starts.map((o, r) => o ? h`<line class="rd" x1="${x(o)}" x2="${x(o)}" y1="${T}" y2="${y(0)}"/><text class="xl" x="${x(o) + 4}" y="${H - 12}">R${r}</text>` : '')}
      <path class="area" d="${area}" fill="url(#abFill)"/>
      <path class="jj" d="${line('jimmy_johnson')}"/>
      <path class="me" d="${line('value')}"/>
      <g class="hover" visibility="hidden"><line class="hl" y1="${T}" y2="${y(0)}"/><circle class="hm" r="5"/><circle class="hj" r="4"/></g>
      <rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>
    </svg>
    <figcaption>
      <ul class="ab-legend"><li><i class="me"></i>This app: career value per pick, 2000-2019 drafts ${src('computed')}</li><li><i class="jj"></i>Jimmy Johnson chart ${src('estimated', 'Approximation')}</li></ul>
      <p class="ab-readout note" aria-hidden="true">Point at the chart to read a pick.</p>
    </figcaption>
  </figure>`;
}
function bindChart(el, D) {
  const svg = el.querySelector('.ab-chart svg');
  if (!svg) return () => {};
  const pts = D.value_chart.points.filter(p => p.pick <= 257);
  const W = 720, H = 300, L = 52, R = 14, T = 16, B = 34, maxV = 3000;
  const x = p => L + (p - 1) / 256 * (W - L - R);
  const y = v => T + (1 - v / maxV) * (H - T - B);
  const g = svg.querySelector('.hover'), out = el.querySelector('.ab-readout');
  const move = e => {
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * W;
    const pick = Math.max(1, Math.min(257, Math.round((px - L) / (W - L - R) * 256 + 1)));
    const p = pts.find(q => q.pick === pick);
    if (!p) return;
    g.setAttribute('visibility', 'visible');
    g.querySelector('.hl').setAttribute('x1', x(pick)); g.querySelector('.hl').setAttribute('x2', x(pick));
    g.querySelector('.hm').setAttribute('cx', x(pick)); g.querySelector('.hm').setAttribute('cy', y(p.value));
    const j = g.querySelector('.hj');
    if (p.jimmy_johnson != null) { j.setAttribute('cx', x(pick)); j.setAttribute('cy', y(p.jimmy_johnson)); j.setAttribute('visibility', 'visible'); } else j.setAttribute('visibility', 'hidden');
    out.innerHTML = String(h`Pick <b>${pick}</b>: this app <b>${int(p.value)}</b>${p.jimmy_johnson != null ? h` · Jimmy Johnson <b>${int(p.jimmy_johnson)}</b>` : ''}${p.av != null ? h` · average career AV <b>${num(p.av, 1)}</b>` : ''}`);
  };
  const leave = () => { g.setAttribute('visibility', 'hidden'); out.textContent = 'Point at the chart to read a pick.'; };
  const hit = svg.querySelector('.hit');
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', leave);
  return () => { hit.removeEventListener('pointermove', move); hit.removeEventListener('pointerdown', move); hit.removeEventListener('pointerleave', leave); };
}

// ---------- page ----------
export function view(el, D) {
  const m = D.model_report, meta = D.meta, T = D.teams, hr = D.hit_rates, tm = D.trade_market, ai = D.ai_model;
  const groups = [...m.by_group].sort((a, b) => b.auc - a.auc);
  const settings = flat(TUNING);
  const boards = meta.boards ?? [];
  const sources = [
    ['Prospects and college stats', 'cfbfastR-data college stats and rosters; 2026 college rosters', `Built ${meta.built}`, 'published'],
    ...boards.map(b => [`Big board: ${b.label}`, `Copied by hand from the public page (weight ${b.weight})`, b.date, 'published']),
    ['Teams, standings, snaps, contracts and trades', T.source, `As of ${T.as_of}`, 'computed'],
    ['Pick value chart', D.value_chart.source, '', 'computed'],
    ['Hit rates by pick', hr.source, '', 'computed'],
    D.combine_pct?.source && ['Combine percentiles', D.combine_pct.source, '', 'computed'],
    ai?.source && ['Draft AI pick model', ai.source, '', 'computed'],
    tm?.source && ['Trade market', tm.source, '', 'computed'],
    D.art?.source && ['Team colours and logos', D.art.source, '', 'published'],
  ].filter(Boolean);
  const fitTrades = tm?.market_chart?.fit_trades, future = tm?.market_chart?.future_factor;
  const p10 = tm?.market_chart?.p10_ratio, p90 = tm?.market_chart?.p90_ratio;
  const trainYears = ai?.fit?.train_years?.join(', '), testYears = ai?.fit?.test_years?.join(', ');

  el.innerHTML = String(h`<div class="page narrow below-top">
    <div class="screen-head"><p class="label">Model and data</p><h1 class="screen-title">How it works</h1>
      <p class="lede">Where every number in the app comes from, and how the draft AI makes its picks and trades.</p></div>

    ${statTiles([
      { value: date(meta.built?.slice(0, 10)), label: `Data built ${dateLong(meta.built?.slice(0, 10))}` },
      { value: date(T.as_of), label: 'NFL standings as of' },
      { value: int(meta.pool_size), label: 'Prospects in the pool' },
      { value: boards.length, label: 'Public big boards' },
    ], { cols: 4 })}

    <nav class="ab-toc" aria-label="On this page">${[['ab-ai', 'How the AI drafts'], ['ab-model', 'Draft model'], ['ab-value', 'Pick values'], ['ab-hits', 'Hit rates'], ['ab-boards', 'Boards'], ['ab-settings', 'AI settings'], ['ab-sources', 'Sources'], ['ab-app', 'About the app']]
      .map(([id, l]) => h`<a href="#about" data-to="${id}">${l}</a>`)}</nav>

    <section class="ab-sec" id="ab-ai">
      <h2>How the AI drafts and trades</h2>
      <div class="grid2">
        <div class="surface panel ab-prose"><h3>Picking</h3><ul>
          <li>The team on the clock scores every player. The score mixes talent (the public boards), position, the team's needs (pay, snaps, age, expiring deals, depth, recent picks, QB play), scheme fit and the general manager's own draft history.</li>
          <li>The weights come from real drafts${trainYears ? ` (${trainYears})` : ''} and were tested on drafts the model never saw${testYears ? ` (${testYears})` : ''}. ${src('computed')}</li>
          <li>Every simulated draft adds noise: the league's view of a player, each team's own view, and the call on the day. So no two drafts are the same.</li>
          <li>Public medical and character flags carry no weight. There are too few flagged players a year to fit, and the boards already price most of them in. ${src('estimated')}</li>
        </ul></div>
        <div class="surface panel ab-prose"><h3>Trading</h3><ul>
          <li>Teams value picks on a chart fitted to ${fitTrades ? int(fitTrades) : 'hundreds of'} real draft-day trades${p10 && p90 ? ` (8 in 10 real prices land within ${pct(p10)} to ${pct(p90)} of it)` : ''}. Each general manager slants it a little. ${src('computed')}</li>
          ${future ? h`<li>A 2028 pick counts about ${pct(future)} of a 2027 pick in the same slot.</li>` : ''}
          <li>A team moves up when the player it wants will probably be gone by its own pick. It pays at most what it expects to gain. The seller asks the chart gap, more if it loves its player, less if its tier is deep.</li>
          <li>Your offers get the same judgement, plus a counteroffer and a plain reason. Lowball a team three times in a round and it stops taking your calls. Each offer costs about a minute of your clock, and teams call you too.</li>
        </ul></div>
      </div>
      <div class="surface panel ab-prose ab-short"><h3>Where it falls short</h3><ul>
        <li>It rarely puts the exact player with the exact team. Real teams act on visits and medicals the AI can't see.</li>
        <li>Big reaches and falls still happen a bit more often than in real drafts.</li>
        <li>The 2022 draft has no usable public board, and 2021's covers only the top 130.</li>
      </ul></div>
    </section>

    <section class="ab-sec" id="ab-model">
      <h2>The draft model <small>${src('computed')}</small></h2>
      <p class="lede">It judges every prospect from his college stats, size, level and age. Trained on the ${m.train} drafts, tested on the ${m.test} drafts it never saw.</p>
      ${statTiles([
        { value: num(m.auc, 3), label: 'Drafted or not: ranking quality (AUC)', note: '0.5 is a coin flip, 1 is perfect.', src: 'computed' },
        { value: num(m.spearman, 3), label: 'Rank agreement of predicted and real pick', note: 'Among drafted players (Spearman).', src: 'computed' },
      ], { cols: 2 })}
      <div class="grid2">
        <div class="surface panel"><h3>Ranking quality by position <small>AUC, test drafts</small></h3>
          <div class="ab-bars" role="list">${groups.map(g => h`<div class="ab-bar" role="listitem" aria-label="${posName(g.group)}: AUC ${num(g.auc, 3)}, ${g.n} drafted in test">
            <span class="pill pos">${g.group}</span><span class="t"><i style="width:${Math.max(0, (g.auc - 0.5) / 0.5 * 100).toFixed(1)}%"></i></span><b>${num(g.auc, 3)}</b><small>${g.n} drafted</small></div>`)}</div>
          <p class="note">The bar starts at 0.5 (a coin flip). The free data has no tackles, pressures, snaps or grades, so linemen are the hardest to judge from stats; the public boards carry them.</p>
        </div>
        <div class="surface panel"><h3>The model's top 100 each test year</h3>
          <div class="ab-top">${(m.top100 ?? []).map(t => h`<div><span class="label">${t.year}</span>
            <p><b>${t.drafted}</b> of 100 were drafted</p><span class="t"><i style="width:${t.drafted}%"></i></span>
            <p><b>${t.top100}</b> went in the first 100 picks</p><span class="t"><i class="b" style="width:${t.top100}%"></i></span></div>`)}</div>
          <p class="note">The model is a second opinion. It is most useful below the public boards' top 150, where it fills out a 257-pick draft.</p>
        </div>
      </div>
    </section>

    <section class="ab-sec" id="ab-value">
      <h2>Pick value chart</h2>
      <div class="surface panel">
        ${valueChart(D)}
        <p class="note">Real picks late in round 1 produce far more than the old chart says, so this app's chart is flatter. The mock draft prices trades with it. ${src('computed', D.value_chart.source)}</p>
      </div>
    </section>

    <section class="ab-sec" id="ab-hits">
      <h2>Hit rates by pick <small>${src('computed', '2000-2021 drafts')}</small></h2>
      <p class="lede">What players taken in each range of picks became.</p>
      <dl class="ab-defs">${OUTCOMES.map(([k, l]) => h`<div><dt><i class="o-${k}"></i>${l}</dt><dd>${hr.definitions?.[k] ?? ''}</dd></div>`)}</dl>
      <div class="surface ab-hits">
        <div class="ab-hrow ab-hhead" aria-hidden="true"><span>Picks</span><span>Players</span><span>Outcome</span>${hr.outcomes.map(o => h`<span class="pc">${(OUTCOMES.find(x => x[0] === o) ?? [o, o])[1]}</span>`)}</div>
        ${hr.bands.map(b => h`<div class="ab-hrow"><span><b>${b.lo}–${b.hi}</b></span><span>${int(b.n)}</span>${outcomeBar(b.rates)}${hr.outcomes.map(o => h`<span class="pc">${pct(b.rates[o])}</span>`)}</div>`)}
      </div>
      ${outcomeLegend()}
      <p class="note">${src('computed', hr.source)}</p>
    </section>

    <section class="ab-sec" id="ab-boards">
      <h2>Public boards used</h2>
      <div class="ab-boards">${boards.map(b => h`<div class="surface ab-board"><b>${b.label}</b><span>${/^\d{4}-\d{2}-\d{2}$/.test(b.date) ? `As of ${dateLong(b.date)}` : b.date}</span><span>Weight ${b.weight} in the consensus</span>${src('published')}</div>`)}</div>
      <p class="note">Copied from the public pages. Not found on a 2026 college roster, so left out: ${meta.unmatched_board_players?.length ? meta.unmatched_board_players.join(', ') : 'none'}.</p>
    </section>

    <section class="ab-sec" id="ab-settings">
      <h2>AI draft settings <small>${src('estimated')}</small></h2>
      <p class="lede">The draft AI's tuning numbers. Most were tuned so simulated drafts match real ones (trade counts, prices, reaches and falls).</p>
      <div class="surface ab-settings">${settings.map(([k, v]) => h`<div class="ab-set"><span>${PLAIN[k] ?? k}<code>${k}</code></span>${fmtVal(v)}</div>`)}</div>
    </section>

    <section class="ab-sec" id="ab-sources">
      <h2>Sources and dates</h2>
      <div class="surface ab-sources">${sources.map(([what, from, when, kind]) => h`<div class="ab-src"><b>${what}</b><span>${from}</span><span class="ab-when">${when ? (/^\d{4}-\d{2}-\d{2}$/.test(when) ? dateLong(when) : when) : ''}</span>${src(kind)}</div>`)}</div>
      <p class="note">Every figure in the app is marked: ${src('published')} from a named source, ${src('computed')} by this app from that data, or ${src('estimated')} where it has to guess.</p>
    </section>

    <section class="ab-sec" id="ab-app">
      <h2>About this app</h2>
      <div class="surface panel ab-prose"><ul>
        <li>The Mac app downloads the newest data from GitHub each time it opens. Offline, it keeps working with the last copy.</li>
        <li>Player photos and college logos load from ESPN and are saved in the app after the first load. NFL logos come with the app. You can add your own photo of any player on his page.</li>
        <li>Your board, notes and grades stay on this computer.</li>
        <li>Not affiliated with the NFL, ESPN, any team or any of the big boards.</li>
      </ul></div>
    </section>
  </div>`);

  const off = on(el, 'click', '.ab-toc a', (e, a) => {
    e.preventDefault();
    const t = el.querySelector(`#${a.dataset.to}`);
    t?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });
  const unbind = bindChart(el, D);
  return () => { off?.(); unbind(); };
}
