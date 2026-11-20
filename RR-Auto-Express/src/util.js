// Shared helpers: responses, crypto, dates, money.

export const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
};

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const bad = (m) => new HttpError(400, m);
export const forbidden = (m = 'Not allowed for your role') => new HttpError(403, m);
export const notFound = (m = 'Not found') => new HttpError(404, m);

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC_HEADERS, ...extra },
  });
}

export function text(body, type = 'text/plain', extra = {}) {
  return new Response(body, { headers: { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store', ...SEC_HEADERS, ...extra } });
}

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const num = (n, d = 0) => (n === null || n === undefined || n === '' || isNaN(Number(n)) ? d : Number(n));

export function nowIso() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
export function today() { return new Date().toISOString().slice(0, 10); }
export function addDays(dateStr, days) {
  const d = new Date((dateStr || today()).slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a, b) {
  if (!a || !b) return null;
  const ms = new Date(b.replace(' ', 'T') + (b.length <= 10 ? 'T12:00:00Z' : 'Z')).getTime() - new Date(a.replace(' ', 'T') + (a.length <= 10 ? 'T12:00:00Z' : 'Z')).getTime();
  return ms / 86400000;
}

export function randomToken(bytes = 24) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const enc = new TextEncoder();
export async function hashPassword(password, saltHex) {
  const salt = saltHex || randomToken(16);
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256);
  return { hash: [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join(''), salt };
}
export async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function parseCookies(req) {
  const out = {};
  (req.headers.get('Cookie') || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

export function parseJsonCol(v, d = null) {
  if (v === null || v === undefined || v === '') return d;
  try { return JSON.parse(v); } catch { return d; }
}

export function bytesToBase64(bytes) {
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  return btoa(s);
}

export function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCsv(rows, cols) {
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(','))].join('\n');
}
export function parseCsv(textIn) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < textIn.length; i++) {
    const c = textIn[i];
    if (q) {
      if (c === '"' && textIn[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && textIn[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export function xmlEsc(s) {
  return String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

// VIN check digit (ISO 3779 / 49 CFR 565)
export function vinValid(vin) {
  vin = String(vin || '').toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false;
  const tr = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
  const w = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 17; i++) { const ch = vin[i]; sum += (/[0-9]/.test(ch) ? Number(ch) : tr[ch]) * w[i]; }
  const cd = sum % 11 === 10 ? 'X' : String(sum % 11);
  return vin[8] === cd;
}

// Add security headers; HTML pages also get a Content-Security-Policy
export function securityHeaders(res, html = false) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(SEC_HEADERS)) if (!h.has(k)) h.set(k, v);
  h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  const ct = h.get('Content-Type') || '';
  if (html && ct.includes('text/html')) {
    h.set('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self' https:; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    h.set('Cache-Control', 'no-cache');
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
