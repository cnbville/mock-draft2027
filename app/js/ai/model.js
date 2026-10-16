// How an AI team rates a player at a pick. Pure logic, shared by the app, the backtest and the fitting script.
//
// A team's utility for player i at a pick is a weighted sum of features: talent (minus log board rank), position
// by round, the team's need facts for his group, scheme fit, the GM's own tastes, testing, level, all-star games
// and public flags, runs and scarcity. The weights are fitted on real drafts (tools/fit_pick_model.mjs, a
// conditional logit: each real pick is a choice among the players still available) and stored in
// app/data/ai_model.json. Every simulated draft adds noise in three layers: a league-wide view of each player
// (the NFL's board differs from the media's), each team's own view, and the day's call.

export const GROUPS = ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P', 'LS'];
export const NEED_FEATURES = ['pay', 'ped', 'snap', 'snap_prev', 'old', 'exp_now', 'exp_next', 'depth', 'open', 'invest', 'prod'];
const QB_FEATURES = ['prod', 'old', 'exp_now', 'exp_next', 'ped'];
export const BUCKETS = [[1, 2], [3, 4], [5, 7]];
export const bucketOf = round => (round <= 2 ? 0 : round <= 4 ? 1 : 2);
// Round 1 also gets its own talent and position terms on top of rounds 1-2 (the first round is where teams pay
// for premium positions and quarterbacks). Utility caches keep one slot per round 1, round 2, rounds 3-4, 5-7.
export const slotOf = round => (round === 1 ? 0 : round === 2 ? 1 : round <= 4 ? 2 : 3);
export const SLOT_ROUND = [1, 2, 3, 5];

// The feature list. Names are stable: ai_model.json stores weights by name.
export function featureNames() {
  const out = [];
  for (let b = 0; b < 3; b++) {
    out.push(`talent|${b}`, `offboard|${b}`, `taken|${b}`, `run|${b}`, `scarce|${b}`);
    for (const g of GROUPS) out.push(`pos|${g}|${b}`);
    for (const f of NEED_FEATURES) out.push(`need|${f}|${b}`);
  }
  for (const f of QB_FEATURES) out.push(`qb|${f}|early`, `qb|${f}|late`);
  out.push('talent|r1');
  for (const g of GROUPS) out.push(`pos|${g}|r1`);
  out.push('fit|dt_heavy34', 'fit|edge_light34', 'fit|ol_heavy_gap', 'fit|ol_ath_zone', 'fit|cb_speed_man',
    'fit|cb_height_man', 'fit|wr_speed_vertical');
  out.push('gm|pos', 'gm|ath', 'gm|p4', 'gm|senior', 'gm|size', 'gm|sb');
  out.push('ath', 'nocombine', 'senior', 'p4', 'fcs', 'sb', 'shrine', 'flag_med', 'flag_char', 'model_gap',
    'variance', 'size', 'hot_senior', 'new_gm_talent');
  return out;
}

const clip = (x, a, b) => Math.max(a, Math.min(b, x));
// Inverse of the standard normal CDF (Acklam), for turning test percentiles into z-scores.
export function probit(p) {
  p = clip(p, 0.001, 0.999);
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const q = p < 0.02425 ? Math.sqrt(-2 * Math.log(p)) : p > 0.97575 ? Math.sqrt(-2 * Math.log(1 - p)) : null;
  if (q != null) {
    const x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    return p < 0.5 ? x : -x;
  }
  const r = p - 0.5, s = r * r;
  return (((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
}

// Per-player facts that don't depend on the team. `rank` is the public board rank, or for a player off the
// board the board rank his model value is worth.
// The live app keeps these facts in an "ai" block (its own fields are for the page); past drafts have them flat.
export function playerFacts(q, opts = {}) {
  const p = q.ai ? { ...q, ...q.ai } : q;
  const onBoard = p.consensus_rank != null;
  const rank = onBoard ? p.consensus_rank : Math.max(1, p.model_rank ?? 400);
  const t = p.tests ?? {};
  const speed = t.forty != null ? probit(t.forty) : 0;
  const athletic = p.athletic != null ? probit(p.athletic) : 0;
  const hz = p.height_z ?? 0, wz = p.weight_z ?? 0;
  const sev = type => (p.flags ?? []).filter(f => f.type === type).reduce((m, f) => Math.max(m, f.severity), 0);
  const modelGap = onBoard && p.model_rank != null ? clip(Math.log(p.consensus_rank / p.model_rank), -2.5, 2.5) : 0;
  return {
    group: p.group, rank, talent: -Math.log(rank), offboard: onBoard ? 0 : 1,
    speed, athletic, hz, wz, size: (hz + wz) / 2,
    nocombine: opts.combineDone && p.combine_invite === false ? 1 : 0,
    senior: p.senior ? 1 : 0, p4: p.p4 ? 1 : 0, fcs: p.fcs ? 1 : 0,
    sb: p.senior_bowl ? 1 : 0, shrine: p.shrine ? 1 : 0,
    flagMed: sev('medical'), flagChar: Math.max(sev('character'), sev('off_field')),
    // Board disagreement on the scale of Arif Hasan's variance column (mean about 90, sd about 15).
    modelGap, variance: p.variance != null ? clip((p.variance - 90) / 15, -2, 3) : 0,
  };
}

// Per-team facts: standardised need facts per group, QB situation, scheme, the GM's tastes and situation.
export function teamFacts(team, model) {
  const nm = model.needs ?? {};
  const need = {};
  for (const g of GROUPS) {
    const x = team.needs?.[g];
    need[g] = NEED_FEATURES.map(f => {
      if (!x || x[f] == null) return 0;
      const mu = nm.mean?.[g]?.[f] ?? 0, sd = nm.sd?.[f] ?? 1;
      return clip((x[f] - mu) / (sd || 1), -4, 4);
    });
  }
  const sc = team.scheme ?? {};
  const fo = team.front_office ?? {};
  const pr = fo.profile ?? {};
  const st = team.standing ?? {};
  const hot = fo.new_hc ? 0 : clip(((0.45 - (st.win_pct ?? 0.5)) + (0.45 - (st.win_pct_prev ?? 0.5))) * 2, 0, 1);
  return {
    abbr: team.abbr, need,
    front34: sc.front === '34' ? 1 : 0,
    gap: sc.run_scheme === 'gap_power' ? 1 : 0,
    zone: sc.run_scheme === 'outside_zone' || sc.run_scheme === 'inside_zone_duo' || sc.off_family === 'shanahan_wcoast' ? 1 : 0,
    manZ: sc.man_share != null ? clip((sc.man_share - 0.4) / 0.1, -3, 3) : 0,
    vertical: sc.off_family === 'air_coryell_vertical' ? 1 : 0,
    gmPos: pr.pos_tilt ?? {}, gmAth: pr.ath_tilt ?? 0, gmP4: pr.p4_tilt ?? 0, gmSenior: pr.senior_tilt ?? 0,
    gmSize: pr.size_tilt ?? {}, gmSb: pr.sb_tilt ?? 0, newGm: fo.new_gm ? 1 : 0, hot,
  };
}

// Index of each feature name, and the weight vector in that order.
export function compile(model) {
  const names = featureNames();
  const idx = Object.fromEntries(names.map((n, i) => [n, i]));
  const w = new Float64Array(names.length);
  for (const [n, v] of Object.entries(model.weights ?? {})) if (n in idx) w[idx[n]] = v;
  return { names, idx, w };
}

// Sparse feature vector for team T and player facts P at a pick. `dyn` holds the pick's situation:
// round, how many players of this group the team already took, the run (players of this group in the last 8
// picks) and his rank within his group among the players still available.
export function features(C, T, P, dyn, out = []) {
  out.length = 0;
  const b = bucketOf(dyn.round);
  const I = C.idx;
  const g = P.group;
  const push = (name, v) => { if (v) out.push(I[name], v); };
  push(`talent|${b}`, P.talent);
  push(`offboard|${b}`, P.offboard);
  push(`taken|${b}`, dyn.taken);
  push(`run|${b}`, dyn.run);
  push(`scarce|${b}`, Math.log(dyn.groupRank));
  out.push(I[`pos|${g}|${b}`], 1);
  if (dyn.round === 1) { push('talent|r1', P.talent); out.push(I[`pos|${g}|r1`], 1); }
  const nd = T.need[g];
  if (nd) for (let f = 0; f < NEED_FEATURES.length; f++) if (nd[f]) out.push(I[`need|${NEED_FEATURES[f]}|${b}`], nd[f]);
  if (g === 'QB' && nd) {
    const tag = b === 0 ? 'early' : 'late';
    for (const f of QB_FEATURES) push(`qb|${f}|${tag}`, nd[NEED_FEATURES.indexOf(f)]);
  }
  if (g === 'DT') push('fit|dt_heavy34', T.front34 * P.wz);
  if (g === 'EDGE') push('fit|edge_light34', -T.front34 * P.wz);
  if (g === 'OT' || g === 'IOL') { push('fit|ol_heavy_gap', T.gap * P.wz); push('fit|ol_ath_zone', T.zone * P.athletic); }
  if (g === 'CB') { push('fit|cb_speed_man', T.manZ * P.speed); push('fit|cb_height_man', T.manZ * P.hz); }
  if (g === 'WR') push('fit|wr_speed_vertical', T.vertical * P.speed);
  push('gm|pos', T.gmPos[g] ?? 0);
  push('gm|ath', T.gmAth * P.athletic);
  push('gm|p4', T.gmP4 * P.p4);
  push('gm|senior', T.gmSenior * P.senior);
  push('gm|size', (T.gmSize[g] ?? 0) * P.size);
  push('gm|sb', T.gmSb * P.sb);
  push('ath', P.athletic);
  push('nocombine', P.nocombine);
  push('senior', P.senior);
  push('p4', P.p4);
  push('fcs', P.fcs);
  push('sb', P.sb);
  push('shrine', P.shrine);
  push('flag_med', P.flagMed);
  push('flag_char', P.flagChar);
  push('model_gap', P.modelGap);
  push('variance', P.variance);
  push('size', P.size);
  push('hot_senior', T.hot * P.senior);
  push('new_gm_talent', T.newGm * P.talent);
  return out;
}

export function dot(w, f) {
  let s = 0;
  for (let k = 0; k < f.length; k += 2) s += w[f[k]] * f[k + 1];
  return s;
}
