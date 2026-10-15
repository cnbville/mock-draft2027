import { esc, fmt, OUTCOME_LABELS } from '../util.js';
import { TUNING } from '../draft.js';

export function aboutView(el, D) {
  const m = D.model_report;
  const vc = D.value_chart.points;
  const W = 640, H = 220, maxV = 3000;
  const x = p => 40 + (p - 1) / 256 * (W - 60);
  const y = v => H - 24 - v / maxV * (H - 40);
  const line = key => vc.filter(p => p.pick <= 257 && p[key] != null).map((p, i) => `${i ? 'L' : 'M'}${x(p.pick).toFixed(1)},${y(p[key]).toFixed(1)}`).join('');
  el.innerHTML = `
    <h1>Model and data</h1>
    <div class="grid g2">
      <div class="panel"><h2 style="margin-top:0">Draft model (computed)</h2>
        <p>Trained on the ${m.train} drafts, tested on the ${m.test} drafts it never saw.</p>
        <ul><li>Drafted or not, ranking quality (AUC): <b>${m.auc.toFixed(3)}</b> (0.5 = coin flip, 1 = perfect).</li>
        <li>Rank agreement of predicted and real pick among drafted players: <b>${m.spearman.toFixed(3)}</b>.</li></ul>
        <table><thead><tr><th>Group</th><th class="num">Drafted in test</th><th class="num">AUC</th></tr></thead><tbody>
        ${m.by_group.map(g => `<tr><td>${g.group}</td><td class="num">${g.n}</td><td class="num">${g.auc.toFixed(3)}</td></tr>`).join('')}</tbody></table>
        <p class="small muted">The free data has no tackles, pressures, snaps or grades, so linemen are the hardest to judge from stats; the public boards carry them.</p>
      </div>
      <div class="panel"><h2 style="margin-top:0">Pick value chart</h2>
        <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Pick value chart">
          <path d="${line('value')}" fill="none" stroke="var(--accent)" stroke-width="2"/>
          <path d="${line('jimmy_johnson')}" fill="none" stroke="var(--warn)" stroke-width="2" stroke-dasharray="4 3"/>
          ${[1, 32, 64, 96, 128, 160, 192, 224, 257].map(p => `<text x="${x(p)}" y="${H - 6}" text-anchor="middle">${p}</text>`).join('')}
          ${[0, 1000, 2000, 3000].map(v => `<text x="4" y="${y(v) + 4}">${v}</text>`).join('')}
        </svg>
        <div class="legend"><span><i style="background:var(--accent)"></i>This tool: career value per pick 2000-2019 (computed)</span><span><i style="background:var(--warn)"></i>Jimmy Johnson chart (approximation)</span></div>
        <p class="small muted">Real picks late in round 1 produce far more than the old chart says, which is why the computed chart is flatter.
        The mock draft prices trades with the computed chart.</p>
      </div>
    </div>
    <div class="panel" style="margin-top:12px"><h2 style="margin-top:0">Hit rates by pick (2000-2021 drafts, computed)</h2>
      <p class="small muted">${Object.entries(D.hit_rates.definitions).map(([k, v]) => `<b>${OUTCOME_LABELS[k]}</b>: ${esc(v)}`).join('. ')}.</p>
      <table><thead><tr><th>Picks</th><th class="num">Players</th>${D.hit_rates.outcomes.map(o => `<th class="num">${OUTCOME_LABELS[o]}</th>`).join('')}</tr></thead><tbody>
      ${D.hit_rates.bands.map(b => `<tr><td>${b.lo}-${b.hi}</td><td class="num">${b.n}</td>${D.hit_rates.outcomes.map(o => `<td class="num">${fmt.pct(b.rates[o])}</td>`).join('')}</tr>`).join('')}
      </tbody></table>
    </div>
    <div class="grid g2" style="margin-top:12px">
      <div class="panel"><h2 style="margin-top:0">Public boards used</h2>
        ${D.meta.boards.map(b => `<div>${esc(b.label)}, ${esc(b.date)}, weight ${b.weight}</div>`).join('')}
        <p class="small muted">Copied from the public pages. Not found on a 2026 college roster (so left out): ${esc(D.meta.unmatched_board_players.join(', ') || 'none')}.</p>
      </div>
      <div class="panel"><h2 style="margin-top:0">AI draft settings (estimated)</h2>
        <div class="small">${Object.entries(TUNING).map(([k, v]) => `<div><b>${esc(k)}</b>: ${esc(JSON.stringify(v))}</div>`).join('')}</div>
      </div>
    </div>`;
}
