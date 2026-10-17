// Run the simulations in a web worker (ui/sims-worker.js) and publish the result exactly as views/shared.js
// runSims does: shared.running while it runs, shared.sims when done, and {progress} / {done} events to
// shared.listeners, so player pages, the Big Board and team pages see the run too.
// Falls back to the main-thread runSims when module workers are not available (older WebKit).
import { shared, runSims } from '../views/shared.js';

const notify = ev => shared.listeners.forEach(f => f(ev));

export function runSimsInBackground(D, opts) {
  if (shared.running) return shared.running;
  let worker;
  try {
    worker = new Worker(new URL('./sims-worker.js', import.meta.url), { type: 'module' });
  } catch {
    return runSims(D, opts);
  }
  shared.running = new Promise(resolve => {
    let over = false;
    const fallback = () => {
      if (over) return;
      over = true;
      worker.terminate();
      shared.running = null;
      runSims(D, opts).then(resolve);
    };
    worker.onmessage = e => {
      const m = e.data;
      if (m.progress != null) notify({ progress: m.progress });
      if (m.error) { console.warn('Simulation worker failed, running on the page instead:', m.error); fallback(); }
      if (m.done && !over) {
        over = true;
        worker.terminate();
        shared.sims = m.sims;
        shared.running = null;
        notify({ progress: 1 });
        notify({ done: true });
        resolve(m.sims);
      }
    };
    // a worker that can't load (no module workers) or breaks: start again on the page
    worker.onerror = e => { e.preventDefault?.(); fallback(); };
    worker.postMessage({ D: { prospects: D.prospects, teams: D.teams, value_chart: D.value_chart, ai_model: D.ai_model, trade_market: D.trade_market }, opts });
  });
  return shared.running;
}
