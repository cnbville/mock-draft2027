// Draft room recap: your class card (with Save image, drawn on a canvas), all 32 class grades, steals and reaches,
// every pick by round, trades and the undrafted free agent rush. Grades and ranks are the engine's (draft.js).

import { h, toast } from './dom.js';
import { logo, teamArt, lightPair, roomColors } from './art.js';
import { face } from './face.js';
import { pill, src, seg } from './parts.js';
import { ordinal, date } from './fmt.js';
import { img as platformImg, saveFile, photos } from '../platform.js';
import { classGrades, classRanks, udfaRush } from '../draft.js';
import { tradeRow, miniRow, nick } from './draft-parts.js';

const ROUND_NAMES = ['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Round 5', 'Round 6', 'Round 7'];

export function recapView(el, D, S, { onAgain, onNew }) {
  const grades = classGrades(S);
  const udfa = S.udfa ?? (S.udfa = udfaRush(S));
  const rank = classRanks(S);
  const order = Object.keys(grades).sort((a, b) => grades[b].score - grades[a].score);
  const place = new Map(order.map((t, i) => [t, i + 1]));
  const mine = (S.userTeamsAtStart ?? []).filter(t => grades[t]);
  let focus = mine[0] ?? null;
  const made = S.picks.filter(p => p.player != null).map(p => ({ p, pr: D.prospects[p.player], cr: rank.get(p.player), d: p.overall - rank.get(p.player) }));
  const steals = made.slice().sort((a, b) => b.d - a.d).slice(0, 10);
  const reaches = made.slice().sort((a, b) => a.d - b.d).slice(0, 10);
  const asOf = date(D.meta?.built?.slice(0, 10));
  const light = t => { const a = teamArt(t); roomColors(el, a.c1, a.c2); };
  if (focus) light(focus); else light(S.picks[0].owner);

  const story = t => {
    const g = grades[t];
    const picks = g.picks;
    const shown = picks.slice(0, picks.length > 6 ? 5 : 6);
    return h`<div class="dr-story" style="--sc1:${lightPair(teamArt(t).c1, teamArt(t).c2)[0]}">
      <span class="wm" aria-hidden="true">2027</span>
      <div class="hd">${logo(t, 48)}<div><p class="label">My 2027 mock draft</p><b class="wide">${teamArt(t).name}</b></div></div>
      <div class="g wide">${g.grade}</div>
      <p class="gs">Class grade · ${ordinal(place.get(t))} of 32 · a quick read</p>
      <ul>${shown.map(p => { const pr = D.prospects[p.player]; return h`<li><span class="n">${p.overall}</span>${face(pr, 'round')}<span><b>${pr.name}</b><small>${pr.group} · ${pr.school}</small></span></li>`; })}
        ${picks.length > shown.length ? h`<li class="more">And ${picks.length - shown.length} more</li>` : ''}
        ${!picks.length ? h`<li class="more">No picks made. Every pick was traded away.</li>` : ''}</ul>
      <div class="ft"><span>Mock Draft 2027</span><span>Data from ${asOf}</span></div>
    </div>`;
  };

  const yours = t => {
    const g = grades[t];
    const best = g.picks.map(p => ({ p, d: p.overall - rank.get(p.player) })).sort((a, b) => b.d - a.d)[0];
    return h`<div class="dr-yours">
      <p class="label">Your class</p>
      <h2 class="wide">${g.grade}<small> ${ordinal(place.get(t))} of 32</small></h2>
      <p class="muted">${g.picks.length} pick${g.picks.length === 1 ? '' : 's'}.${best && best.d > 0 ? ` Best value: ${D.prospects[best.p.player].name} at pick ${best.p.overall}, ${best.d} spots after his class rank.` : ''}</p>
      <p class="note">The grade weighs the value of the players taken (by class rank) against the value of the picks spent, ranked against the other 31 classes. ${src('computed', 'Value chart from career AV per pick, 2000-2019')} A quick read, not a forecast.</p>
      <div class="dr-row"><button type="button" class="btn primary" data-act="save">Save image</button><button type="button" class="btn glass" data-act="again">Run it back</button><button type="button" class="btn glass" data-act="new">New draft</button></div>
      <p class="note">Run it back starts a new draft with the same teams and options and a new seed.</p>
    </div>`;
  };

  const roundRows = r => S.picks.filter(p => p.round === r).map(p => {
    const pr = p.player != null ? D.prospects[p.player] : null;
    const isMine = mine.includes(p.owner);
    return h`<li class="${isMine ? 'mine' : ''}"><span class="n">${p.overall}</span>${logo(p.owner, 30)}
      ${pr ? h`<a class="who" href="#player/${pr.id}"><b>${pr.name}</b><small>${pr.group} · ${pr.school} · ${nick(p.owner)}${p.owner !== p.original ? ` (from ${p.original})` : ''}</small></a>` : h`<span class="who"><b>${nick(p.owner)}</b><small>No pick</small></span>`}
      ${pr ? h`<span class="cr" title="Class rank">#${rank.get(p.player)}</span>` : ''}</li>`;
  });

  el.innerHTML = String(h`<div class="room" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="page below-top dr-recap">
      <header class="dr-rhead"><div><p class="label">Draft recap · seed ${S.seed ?? ''}</p><h1 class="screen-title wide">${mine.length ? 'Your 2027 class' : 'The 2027 draft'}</h1></div>
        ${mine.length ? '' : h`<div class="dr-row"><button type="button" class="btn primary" data-act="again">Run it back</button><button type="button" class="btn glass" data-act="new">New draft</button></div>`}</header>
      ${mine.length ? h`<section class="dr-hero">
        <div class="dr-storywrap">${mine.length > 1 ? h`<div data-teamseg></div>` : ''}<div data-story>${story(focus)}</div></div>
        <div data-yours>${yours(focus)}</div>
      </section>` : ''}
      <section class="dr-sec"><div class="dr-sechead"><h2>Class grades</h2><span class="note">All 32 teams, best first. ${src('computed')}</span></div>
        <div class="dr-grades">${order.map((t, i) => h`<a class="dr-grade glass ${mine.includes(t) ? 'mine' : ''}" href="#team/${t}">
          <span class="rk">${i + 1}</span>${logo(t, 40)}<span class="who"><b>${nick(t)}</b><small>${grades[t].picks.length} picks · ${grades[t].picks.slice(0, 3).map(p => D.prospects[p.player].name).join(', ') || 'No picks'}</small></span><b class="gl wide">${grades[t].grade}</b></a>`)}</div></section>
      <section class="dr-sec dr-two">
        <div class="glass panel"><h2>Biggest steals <small>Went later than his class rank</small></h2>
          ${steals.map(x => miniRow(x.pr, { n: x.p.overall, sub: `${nick(x.p.owner)} · class rank #${x.cr}`, tag: pill(`+${x.d}`, 'good') }))}</div>
        <div class="glass panel"><h2>Biggest reaches <small>Went earlier than his class rank</small></h2>
          ${reaches.map(x => miniRow(x.pr, { n: x.p.overall, sub: `${nick(x.p.owner)} · class rank #${x.cr}`, tag: pill(`${x.d}`, 'bad') }))}</div>
        <p class="note dr-full">Class rank: his place on the shared board among the players who entered this draft. ${src('computed')}</p>
      </section>
      <section class="dr-sec"><div class="dr-sechead"><h2>Every pick</h2><div data-roundseg></div></div>
        <ol class="dr-allpicks glass" data-round></ol></section>
      <section class="dr-sec dr-two">
        <div class="glass panel"><h2>Trades <small>${S.tradeLog.length}</small></h2>
          <div class="dr-trades">${S.tradeLog.length ? S.tradeLog.map(t => tradeRow(t)) : h`<p class="note">No trades.</p>`}</div></div>
        <div class="glass panel"><h2>Undrafted free agent rush <small>${udfa.length} signed</small></h2>
          <p class="note">Right after the draft, each team signs a few of the best players left, by its board and needs.</p>
          <div class="dr-udfa">${udfa.map(u => miniRow(D.prospects[u.i], { sub: `${nick(u.team)} · ${D.prospects[u.i].group}, ${D.prospects[u.i].school} · board #${D.prospects[u.i].board_rank}`, tag: logo(u.team, 26) }))}</div></div>
      </section>
    </div>`);

  // Round picker for the full list.
  const list = el.querySelector('[data-round]');
  const showRound = r => { list.innerHTML = String(h`${roundRows(r)}`); };
  const rs = seg(ROUND_NAMES.map((n, i) => ({ value: i + 1, label: `R${i + 1}` })), 1, r => showRound(+r), 'Round');
  el.querySelector('[data-roundseg]').appendChild(rs);
  showRound(1);

  // Several of your teams: switch the card.
  const tsBox = el.querySelector('[data-teamseg]');
  if (tsBox) {
    tsBox.appendChild(seg(mine.map(t => ({ value: t, label: nick(t) })), focus, t => {
      focus = t;
      light(t);
      el.querySelector('[data-story]').innerHTML = String(story(t));
      el.querySelector('[data-yours]').innerHTML = String(yours(t));
    }, 'Your teams'));
  }

  el.querySelector('.dr-recap').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'again') onAgain();
    else if (b.dataset.act === 'new') onNew();
    else if (b.dataset.act === 'save') {
      b.disabled = true;
      try {
        const saved = await saveCard(D, focus, grades[focus], place.get(focus), asOf);
        if (saved) toast('Saved your class card.');
      } catch (err) {
        console.warn(err);
        toast('Could not make the image.');
      } finally { b.disabled = false; }
    }
  });
}

// ---------- the class card as a PNG (1080 x 1920), drawn by hand ----------
function loadImg(src, ms = 5000) {
  return new Promise(res => {
    if (!src) return res(null);
    const im = new Image();
    im.crossOrigin = 'anonymous';
    let done = false;
    const fin = v => { if (!done) { done = true; res(v); } };
    im.onload = () => fin(im);
    im.onerror = () => fin(null);
    setTimeout(() => fin(null), ms);
    im.src = src;
  });
}

function rgba(hex, a) {
  let x = String(hex).replace('#', '');
  if (x.length === 3) x = x.split('').map(c => c + c).join('');
  const n = parseInt(x.slice(0, 6), 16);
  return Number.isFinite(n) ? `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})` : `rgba(255,255,255,${a * 0.3})`;
}

function rrect(ctx, x, y, w, h2, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h2, r);
  ctx.arcTo(x + w, y + h2, x, y + h2, r);
  ctx.arcTo(x, y + h2, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fit(ctx, text, max) {
  let t = String(text);
  if (ctx.measureText(t).width <= max) return t;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

async function drawCard(D, team, g, place, asOf, withImages) {
  const W = 1080, H = 1920;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const ta = teamArt(team);
  const [c1, c2] = lightPair(ta.c1, ta.c2);
  const F = 'Archivo, system-ui, -apple-system, sans-serif';
  try { await Promise.all([document.fonts?.load(`800 64px Archivo`), document.fonts?.load(`600 30px Archivo`)]); } catch (e) { /* system font */ }
  const setStretch = s => { if ('fontStretch' in ctx) ctx.fontStretch = s; };

  const bg = ctx.createLinearGradient(0, 0, W * 0.35, H);
  bg.addColorStop(0, c1);
  bg.addColorStop(0.55, '#0b0c10');
  bg.addColorStop(1, '#000');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.9, H * 0.25, 10, W * 0.9, H * 0.25, W * 0.8);
  glow.addColorStop(0, rgba(c2, 0.55));
  glow.addColorStop(1, rgba(c2, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // watermark
  ctx.save();
  ctx.translate(W - 40, 560);
  ctx.rotate(-Math.PI / 2);
  setStretch('expanded');
  ctx.font = `900 360px ${F}`;
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  ctx.textAlign = 'right';
  ctx.fillText('2027', 0, 0);
  ctx.restore();

  const pad = 80;
  // logo
  const lg = withImages && ta.logo ? await loadImg(ta.logo) : null;
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  rrect(ctx, pad, 110, 150, 150, 38);
  ctx.fill();
  if (lg) ctx.drawImage(lg, pad + 14, 124, 122, 122);
  else {
    ctx.fillStyle = '#fff';
    ctx.font = `800 52px ${F}`;
    ctx.textAlign = 'center';
    ctx.fillText(team, pad + 75, 204);
    ctx.textAlign = 'left';
  }
  setStretch('normal');
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.font = `700 30px ${F}`;
  ctx.fillText('MY 2027 MOCK DRAFT', pad + 182, 170);
  ctx.fillStyle = '#fff';
  setStretch('expanded');
  ctx.font = `800 58px ${F}`;
  ctx.fillText(fit(ctx, ta.name, W - pad * 2 - 182), pad + 182, 236);

  // grade
  ctx.font = `900 330px ${F}`;
  ctx.fillText(g.grade, pad - 8, 590);
  setStretch('normal');
  ctx.font = `600 34px ${F}`;
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.fillText(`Class grade · ${ordinal(place)} of 32 · a quick read`, pad, 662);

  // picks
  const picks = g.picks;
  const top = 720, bottom = H - 170;
  const cols = picks.length > 10 ? 2 : 1;
  const per = Math.max(1, Math.ceil(picks.length / cols));
  const colW = (W - pad * 2 - (cols - 1) * 20) / cols;
  const rowH = Math.min(124, Math.floor((bottom - top) / per));
  const gap = Math.min(16, Math.round(rowH * 0.12));
  const faces = withImages ? await Promise.all(picks.map(async p => {
    const pr = D.prospects[p.player];
    let url = null;
    try { url = await photos.get(pr.id); } catch (e) { url = null; }
    return loadImg(url || (pr.headshot ? platformImg(pr.headshot) : null));
  })) : picks.map(() => null);
  picks.forEach((p, i) => {
    const pr = D.prospects[p.player];
    const x0 = pad + Math.floor(i / per) * (colW + 20);
    const y = top + (i % per) * rowH;
    const hh = rowH - gap;
    ctx.fillStyle = 'rgba(0,0,0,.32)';
    rrect(ctx, x0, y, colW, hh, Math.min(28, hh / 3));
    ctx.fill();
    const fs = hh * 0.42;
    setStretch('condensed');
    ctx.font = `800 ${fs}px ${F}`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'right';
    ctx.fillText(String(p.overall), x0 + 20 + fs * 1.6, y + hh / 2 + fs * 0.36);
    ctx.textAlign = 'left';
    setStretch('normal');
    const fx = x0 + 40 + fs * 1.7, r = hh * 0.36, cy = y + hh / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(fx + r, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.fill();
    ctx.clip();
    const im = faces[i];
    if (im) {
      const s = Math.max((2 * r) / im.width, (2 * r) / im.height);
      const w = im.width * s, hgt = im.height * s;
      ctx.drawImage(im, fx + r - w / 2, cy - r - (hgt - 2 * r) * 0.1, w, hgt);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      ctx.beginPath(); ctx.arc(fx + r, cy - r * 0.2, r * 0.36, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(fx + r, cy + r * 0.85, r * 0.7, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    const tx = fx + 2 * r + 20, tw = x0 + colW - 18 - tx;
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(hh * 0.3)}px ${F}`;
    ctx.fillText(fit(ctx, pr.name, tw), tx, cy - hh * 0.04);
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.font = `500 ${Math.round(hh * 0.21)}px ${F}`;
    ctx.fillText(fit(ctx, cols > 1 ? `${pr.group} · ${pr.school}` : `${pr.group} · ${pr.school} · Round ${p.round}`, tw), tx, cy + hh * 0.28);
  });
  if (!picks.length) {
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.font = `600 36px ${F}`;
    ctx.fillText('No picks made. Every pick was traded away.', pad, top + 60);
  }

  // footer
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.fillRect(pad, H - 130, W - pad * 2, 2);
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  setStretch('expanded');
  ctx.font = `800 32px ${F}`;
  ctx.fillText('MOCK DRAFT 2027', pad, H - 76);
  setStretch('normal');
  ctx.textAlign = 'right';
  ctx.font = `500 28px ${F}`;
  ctx.fillText(`Data from ${asOf}`, W - pad, H - 76);
  return cv;
}

async function saveCard(D, team, g, place, asOf) {
  const toBlob = cv => new Promise((res, rej) => { try { cv.toBlob(b => (b ? res(b) : rej(new Error('No image'))), 'image/png'); } catch (e) { rej(e); } });
  let blob;
  try { blob = await toBlob(await drawCard(D, team, g, place, asOf, true)); }
  catch (e) { blob = await toBlob(await drawCard(D, team, g, place, asOf, false)); } // a tainted image: draw without photos
  return saveFile(`mock-draft-2027-${team}.png`, blob, 'image/png');
}

