// Web worker for the Simulations screen: runs the shared simulation runner (views/shared.js runSims, the same
// slices, seeds and merge) off the main thread, so the page stays responsive during a long run.
// Messages in: {D: {prospects, teams, value_chart, ai_model, trade_market}, opts: {n, allDeclare, trades}}.
// Messages out: {progress} while it runs, then {done: true, sims}; {error} if it fails.
import './compat.js';
import { shared, runSims } from '../views/shared.js';

self.onmessage = async e => {
  const { D, opts } = e.data;
  const listener = ev => { if (ev.progress != null && !ev.done) self.postMessage({ progress: ev.progress }); };
  shared.listeners.add(listener);
  try {
    const sims = await runSims(D, opts);
    self.postMessage({ done: true, sims });
  } catch (err) {
    self.postMessage({ error: String(err?.message ?? err) });
  } finally {
    shared.listeners.delete(listener);
  }
};
