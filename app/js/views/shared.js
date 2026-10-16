// State shared between views: the latest simulation run.
import { simulate } from '../draft.js';

export const shared = { sims: null, running: null, listeners: new Set() };

export function runSims(D, { n = 200, allDeclare = false, trades = true } = {}) {
  if (shared.running) return shared.running;
  shared.running = new Promise(resolve => {
    // Run in small slices so the page stays responsive.
    const chunk = 20;
    const parts = [];
    let done = 0;
    const step = () => {
      const k = Math.min(chunk, n - done);
      parts.push(simulate({ prospects: D.prospects, teams: D.teams, chart: D.value_chart, model: D.ai_model, market: D.trade_market, n: k, seed: 7 + done * 104729, allDeclare, trades }));
      done += k;
      shared.listeners.forEach(f => f({ progress: done / n }));
      if (done < n) setTimeout(step, 0);
      else {
        shared.sims = merge(parts, D.prospects.length, { n, allDeclare, trades });
        shared.running = null;
        shared.listeners.forEach(f => f({ done: true }));
        resolve(shared.sims);
      }
    };
    setTimeout(step, 0);
  });
  return shared.running;
}

function merge(parts, len, opts) {
  // Re-derive ranges from the per-part summaries (weighted by draws).
  const n = parts.reduce((s, p) => s + p.n, 0);
  const summary = [];
  for (let i = 0; i < len; i++) {
    let drafted = 0, mean = 0, r1 = 0;
    const teams = {};
    const qs = { p10: [], p50: [], p90: [] };
    for (const p of parts) {
      const s = p.summary[i];
      drafted += s.drafted * p.n;
      r1 += s.r1 * p.n;
      if (s.mean != null) { mean += s.mean * s.drafted * p.n; qs.p10.push(s.p10); qs.p50.push(s.p50); qs.p90.push(s.p90); }
      for (const [t, c] of s.teams) teams[t] = (teams[t] ?? 0) + c * p.n;
    }
    const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
    summary.push({ i, drafted: drafted / n, mean: drafted ? mean / drafted : null, p10: avg(qs.p10), p50: avg(qs.p50),
      p90: avg(qs.p90), r1: r1 / n,
      teams: Object.entries(teams).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, c]) => [t, c / n]) });
  }
  const firstPick = {};
  for (const p of parts) for (const [t, m] of Object.entries(p.firstPick)) {
    const f = (firstPick[t] ??= {});
    for (const [i, c] of Object.entries(m)) f[i] = (f[i] ?? 0) + c;
  }
  const trades = parts.reduce((s, p) => s + p.round1TradesPerDraft * p.n, 0) / n;
  return { n, summary, firstPick, round1TradesPerDraft: trades, ...opts };
}
