// Shared markup for the Motive-style restyle: hero vehicle images, stat rows, greeting.
import { esc } from './app.js';

const TRUCK = /\b(f-?1[5-9]0|f-?[2-4]50|silverado|sierra|ram|1500|2500|tundra|tacoma|titan|frontier|colorado|canyon|ranger|ridgeline|gladiator|maverick|santa cruz|cybertruck|lightning)\b/i;

// Which built-in render to show. style = model3d style from VIN data when we have it, else guessed from the model name.
export function heroKind(v = {}, style) {
  const st = style || v?.model3d?.style || '';
  if (st === 'pickup') return 'f150';
  if (st === 'sedan' || st === 'coupe' || st === 'hatchback') return 'camry';
  if (st) return '';
  const s = [v.make, v.model, v.body].filter(Boolean).join(' ');
  if (TRUCK.test(s) || /pickup|truck/i.test(v.body || '')) return 'f150';
  return v.make || v.model ? 'camry' : '';
}
export const VIEWS = [['front34', 'Front ¾'], ['side', 'Side'], ['rear34', 'Rear ¾'], ['front', 'Front'], ['rear', 'Rear'], ['front34r', 'Right ¾']];
export const carImg = (k, view = 'front34', thumb = false) => `/img/cars/${k}-${view}${thumb ? '-t' : ''}.webp`;

// Plain car outline for vehicles we have no render for (SUVs, vans...)
export const carGlyph = `<svg class="cglyph" viewBox="0 0 240 100" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 70h10m40 0h104m40 0h18v-14c0-6-4-10-10-11l-30-5-26-20c-4-3-9-5-14-5H86c-6 0-11 2-15 6L52 40l-26 4c-7 1-12 7-12 14z"/><circle cx="44" cy="72" r="14"/><circle cx="190" cy="72" r="14"/><path d="M78 40l14-16h44l26 16z"/></svg>`;

export function heroImage(k, view = 'front34', { eager = false, alt = '' } = {}) {
  if (!k) return `<div class="vhimg none">${carGlyph}</div>`;
  return `<div class="vhimg"><img src="${carImg(k, view)}" alt="${esc(alt)}" width="1040" height="650" decoding="async" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'}></div>`;
}

// Row of 2-4 big numbers with units and thin dividers. items: [[value, unit, label], ...]
export function statRow(items, cls = '') {
  return `<div class="stats ${cls}">${items.map(([v, u, l]) => `<div class="stat"><div class="sv">${v}${u ? `<span class="su">${esc(u)}</span>` : ''}</div><div class="sl">${esc(l)}</div></div>`).join('')}</div>`;
}

// "$4,812" -> big number with small cents
export function bigMoney(n) {
  const v = Number(n) || 0; const s = v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  const [w, c] = s.split('.');
  return `${esc(w)}<span class="cents">.${esc(c)}</span>`;
}

export function greeting(d = new Date()) { const h = d.getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
