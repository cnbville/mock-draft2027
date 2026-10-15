// Your board, notes, grades and combine entries. Saved in this browser, and exportable to a file.
const KEY = 'mockdraft2027.v1';

const empty = () => ({ board: [], tiers: {}, notes: {}, grades: {}, combine: {}, reports: {}, flags: {}, settings: {} });

let data = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...empty(), ...JSON.parse(raw) };
  } catch (e) { /* private window or blocked storage: start empty */ }
  return empty();
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage blocked */ }
}

export const store = {
  get: () => data,
  onBoard: id => data.board.includes(id),
  add(id) { if (!data.board.includes(id)) data.board.push(id); save(); },
  remove(id) { data.board = data.board.filter(x => x !== id); delete data.tiers[id]; save(); },
  move(id, to) {
    const b = data.board.filter(x => x !== id);
    b.splice(Math.max(0, Math.min(b.length, to)), 0, id);
    data.board = b; save();
  },
  setTier(id, tier) { if (tier) data.tiers[id] = tier; else delete data.tiers[id]; save(); },
  setNote(id, text) { data.notes[id] = text; save(); },
  setGrade(id, trait, v) { (data.grades[id] ??= {})[trait] = v; if (v === '' || v == null) delete data.grades[id][trait]; save(); },
  setCombine(id, test, v) { (data.combine[id] ??= {})[test] = v; if (v === '' || v == null) delete data.combine[id][test]; save(); },
  addReport(id, r) { (data.reports[id] ??= []).push(r); save(); },
  removeReport(id, i) { data.reports[id]?.splice(i, 1); save(); },
  setFlag(id, flag, on) { (data.flags[id] ??= {})[flag] = on; save(); },
  setting(k, v) { if (v === undefined) return data.settings[k]; data.settings[k] = v; save(); },
  exportJSON: () => JSON.stringify({ app: 'mock-draft2027', saved: new Date().toISOString(), ...data }, null, 1),
  importJSON(text) {
    const d = JSON.parse(text);
    if (d.app !== 'mock-draft2027') throw new Error('This file is not a Mock Draft 2027 board.');
    data = { ...empty(), ...d };
    delete data.app; delete data.saved;
    save();
  },
  reset() { data = empty(); save(); },
};
