// Team and school art: names, colours and logos. Reads D.art (app/data/art.json) and falls back gracefully:
// an unknown team or school gets a neutral palette and a monogram, never a broken image.
//
//   initArt(D)                 call once after the data loads (main.js does this)
//   teamArt(abbr)              -> {abbr, name, nick, c1, c2, logo}   (logo is an <img src> or null)
//   logo(abbr, size)           team logo html (image over a monogram in team colours)
//   schoolArt(school)          -> {name, c1, c2, logo}               (logo is an <img src> or null)
//   schoolLogo(school, size)   school logo html (image on a light tile, or a monogram)
//   accentStyle(c1, c2)        'style' attribute text that lights a component (--accent, --accent-2), dark colours lifted
//   roomColors(el, c1, c2)     re-light a screen: sets --t1/--t2 and --accent/--accent-2 on el (colours fade over 1s)
//   lightPair(c1, c2)          the pair reordered/lifted so a near-black primary never makes a dark room
//   teamStyle(abbr) / schoolStyle(school)  accentStyle for a team or school
//   monogram(name)             'OSU'-style letters for a name
//
// Colours come from art.json (team and school colours; source in art.json "source").

import { esc, Html } from './dom.js';
import { img as platformImg } from '../platform.js';

export const NEUTRAL = ['#3a4050', '#8a93a6'];
let D = null;

export function initArt(data) { D = data; }

const hexRgb = hex => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16));
};
// WCAG relative luminance, 0 (black) to 1 (white)
export function luminance(hex) {
  const rgb = hexRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const mix = (hex, other, t) => {
  const a = hexRgb(hex), b = hexRgb(other);
  if (!a || !b) return hex;
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

// A near-black primary would leave the room dark: use the second colour as the light instead.
// A primary that is still very dark (navy, deep green) is lifted a little so the light reads.
export function lightPair(c1, c2) {
  let a = hexRgb(c1) ? c1 : NEUTRAL[0], b = hexRgb(c2) ? c2 : NEUTRAL[1];
  if (luminance(a) < 0.012 && luminance(b) > luminance(a) + 0.02) [a, b] = [b, a];
  if (luminance(a) < 0.02) a = mix(a, '#ffffff', 0.12);
  if (luminance(b) < 0.006) b = mix(a, '#000000', 0.45);
  return [a, b];
}

export function accentStyle(c1, c2) {
  const [a, b] = lightPair(c1, c2);
  return `--accent:${a};--accent-2:${b}`;
}

export function roomColors(el, c1, c2) {
  if (!el) return;
  const [a, b] = lightPair(c1, c2);
  el.style.setProperty('--t1', a);
  el.style.setProperty('--t2', b);
  el.style.setProperty('--accent', a);
  el.style.setProperty('--accent-2', b);
}

export function monogram(name) {
  const words = String(name ?? '').replace(/[^A-Za-z0-9& ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].length <= 4 && words[0] === words[0].toUpperCase() ? words[0] : words[0].slice(0, 2);
  const skip = new Set(['of', 'the', 'and', '&', 'at']);
  return words.filter(w => !skip.has(w.toLowerCase())).slice(0, 3).map(w => w[0].toUpperCase()).join('');
}

const lastWord = s => String(s ?? '').trim().split(/\s+/).pop();

export function teamArt(abbr) {
  const a = D?.art?.nfl?.[abbr];
  const t = D?.teams?.teams?.[abbr];
  const name = a?.name ?? t?.name ?? abbr ?? '';
  return {
    abbr,
    name,
    nick: a?.nick ?? lastWord(name),
    c1: a?.c1 ?? NEUTRAL[0],
    c2: a?.c2 ?? NEUTRAL[1],
    // without art.json we don't know the logo files exist, so show the monogram (no 404s)
    logo: a?.logo ? platformImg(a.logo) : null,
  };
}

export const teamStyle = abbr => { const t = teamArt(abbr); return accentStyle(t.c1, t.c2); };

const imgTag = (src, cls = '') =>
  `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" draggable="false"${cls ? ` class="${cls}"` : ''} onload="this.parentNode.classList.add('img-ok')" onerror="this.remove()">`;

export function logo(abbr, size = 44) {
  const t = teamArt(abbr);
  const [a, b] = lightPair(t.c1, t.c2);
  return new Html(`<span class="logo team" style="--s:${+size}px;--lc1:${a};--lc2:${b}" role="img" aria-label="${esc(t.name)}"><span class="mono" aria-hidden="true">${esc(abbr ?? '?')}</span>${t.logo ? imgTag(t.logo) : ''}</span>`);
}

export function schoolArt(school) {
  const s = D?.art?.schools?.[school];
  return {
    name: school ?? '',
    c1: s?.c1 ?? NEUTRAL[0],
    c2: s?.c2 ?? NEUTRAL[1],
    logo: s?.logo ? platformImg(s.logo) : null,
  };
}

export const schoolStyle = school => { const s = schoolArt(school); return accentStyle(s.c1, s.c2); };

export function schoolLogo(school, size = 44) {
  const s = schoolArt(school);
  const [a, b] = lightPair(s.c1, s.c2);
  return new Html(`<span class="logo school" style="--s:${+size}px;--lc1:${a};--lc2:${b}" role="img" aria-label="${esc(school ?? '')}"><span class="mono" aria-hidden="true">${esc(monogram(school))}</span>${s.logo ? imgTag(s.logo) : ''}</span>`);
}

// A player's colours are his school's.
export const playerStyle = p => schoolStyle(p?.school);
