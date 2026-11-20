// Router, sessions, role checks, location scoping and audit trail.
import { json, HttpError, forbidden, parseCookies, safeEqual, hashPassword, randomToken, sha256Hex, nowIso, num } from './util.js';
import { can, capsFor } from './logic.js';

export class Router {
  constructor() { this.routes = []; }
  add(method, path, handler, opts = {}) {
    const keys = [];
    const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    this.routes.push({ method, re, keys, handler, opts });
  }
  get(p, h, o) { this.add('GET', p, h, o); }
  post(p, h, o) { this.add('POST', p, h, o); }
  put(p, h, o) { this.add('PUT', p, h, o); }
  del(p, h, o) { this.add('DELETE', p, h, o); }
  match(method, path) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = path.match(r.re);
      if (m) return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
    }
    return null;
  }
}

export async function readBody(req) {
  const ct = req.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) { const t = await req.text(); if (!t.trim()) return {}; try { return JSON.parse(t); } catch { throw new HttpError(400, 'Invalid JSON'); } }
  if (ct.includes('multipart/form-data')) return await req.formData();
  if (ct.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(await req.text()));
  const t = await req.text();
  return t;
}

export async function getSessionUser(env, req) {
  const auth = req.headers.get('Authorization') || '';
  let token = auth.startsWith('Bearer s_') ? auth.slice(9) : parseCookies(req).cp_session;
  // <img>/<video> tags in the Android app cannot send headers: allow ?t= on file GETs only
  if (!token && req.method === 'GET') { const u = new URL(req.url); const t = u.searchParams.get('t'); if (t && t.startsWith('s_') && /^\/api\/files\/\d+$/.test(u.pathname)) token = t.slice(2); }
  if (!token) return null;
  const row = await env.DB.prepare('SELECT u.*, s.expires FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND u.active=1').bind(token).first();
  if (!row || row.expires < nowIso()) return null;
  delete row.pw_hash; delete row.pw_salt;
  return row;
}

export async function getApiKey(env, req) {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ck_')) return null;
  const key = auth.slice(7);
  const h = await sha256Hex(key);
  const row = await env.DB.prepare('SELECT * FROM api_keys WHERE key_hash=? AND active=1').bind(h).first();
  if (row) await env.DB.prepare('UPDATE api_keys SET last_used=? WHERE id=?').bind(nowIso(), row.id).run();
  return row;
}

export async function login(env, req, email, password) {
  const u = await env.DB.prepare('SELECT * FROM users WHERE lower(trim(email))=? AND active=1').bind(String(email || '').trim().toLowerCase()).first();
  // Constant-ish work even when the user doesn't exist
  const pw = String(password || '');
  let ok = false;
  for (const cand of pw === pw.trim() ? [pw] : [pw, pw.trim()]) { // phones often add a trailing space
    const { hash } = await hashPassword(cand, u?.pw_salt || 'x'.repeat(32));
    if (u && u.pw_hash && safeEqual(hash, u.pw_hash)) { ok = true; break; }
  }
  if (!u || !ok) return null;
  const token = randomToken(32);
  const exp = new Date(Date.now() + 14 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token,user_id,expires) VALUES (?,?,?)').bind(token, u.id, exp),
    env.DB.prepare("DELETE FROM sessions WHERE expires < ?").bind(nowIso()),
  ]);
  return { token, user: u };
}

export function sessionCookie(token, maxAge = 14 * 86400) {
  return `cp_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

// Build a request context with helpers the route handlers use
export function makeCtx(req, env, url, params, user, body) {
  const ctx = {
    req, env, url, params, user, body: body || {},
    sessionToken: (() => { const a = req.headers.get('Authorization') || ''; return a.startsWith('Bearer s_') ? a.slice(9) : parseCookies(req).cp_session || ''; })(),
    q: (k, d = null) => url.searchParams.get(k) ?? d,
    id: (k = 'id') => { const v = Number(params[k]); if (!Number.isInteger(v) || v <= 0) throw new HttpError(400, 'Bad id'); return v; },
    need(cap) { if (!can(user, cap)) throw forbidden(); },
    can: (cap) => can(user, cap),
    db: env.DB,
  };
  // Active location: user's own, or the one picked in the header (owners/multi-location users)
  const hdr = Number(req.headers.get('X-Location') || url.searchParams.get('loc') || 0);
  ctx.loc = user?.location_id ? user.location_id : hdr || null;
  ctx.allLocations = !user?.location_id;
  ctx.audit = async (action, entity, entityId, jobId, detail) => {
    await env.DB.prepare('INSERT INTO audit_log (user_id,user_name,location_id,action,entity,entity_id,job_id,detail,ip) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(user?.id || null, user?.name || 'system', ctx.loc, action, entity, entityId || null, jobId || null, typeof detail === 'string' ? detail.slice(0, 2000) : JSON.stringify(detail ?? null).slice(0, 2000), req.headers.get('CF-Connecting-IP') || '')
      .run();
  };
  ctx.event = async (jobId, type, detail) => {
    await env.DB.prepare('INSERT INTO job_events (job_id,type,detail,user_name) VALUES (?,?,?,?)').bind(jobId, type, detail, user?.name || 'system').run();
  };
  // Load a job and make sure the user may see its location
  ctx.job = async (jobId) => {
    const j = await env.DB.prepare('SELECT * FROM jobs WHERE id=?').bind(jobId).first();
    if (!j) throw new HttpError(404, 'Job not found');
    if (user?.location_id && j.location_id !== user.location_id) throw forbidden('This job belongs to another location');
    return j;
  };
  ctx.location = async (id) => env.DB.prepare('SELECT * FROM locations WHERE id=?').bind(id || ctx.loc).first();
  ctx.locFilter = (alias = '') => {
    const col = (alias ? alias + '.' : '') + 'location_id';
    return ctx.loc ? { sql: ` AND ${col}=?`, args: [ctx.loc] } : { sql: '', args: [] };
  };
  return ctx;
}

export async function nextNumber(env, name, prefix, pad = 5) {
  const r = await env.DB.prepare('INSERT INTO counters (name,value) VALUES (?,1) ON CONFLICT(name) DO UPDATE SET value=value+1 RETURNING value').bind(name).first();
  return prefix + String(r.value).padStart(pad, '0');
}

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k] === '' ? null : obj[k];
  return out;
}

// UPDATE helper: only whitelisted columns
export async function updateRow(env, table, id, data, allowed) {
  const d = pick(data, allowed);
  const keys = Object.keys(d);
  if (!keys.length) return 0;
  const sql = `UPDATE ${table} SET ${keys.map((k) => k + '=?').join(',')} WHERE id=?`;
  const r = await env.DB.prepare(sql).bind(...keys.map((k) => d[k]), id).run();
  return r.meta?.changes || 0;
}
export async function insertRow(env, table, data, allowed) {
  const d = pick(data, allowed);
  const keys = Object.keys(d);
  const r = await env.DB.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')}) RETURNING id`).bind(...keys.map((k) => d[k])).first();
  return r.id;
}

export { capsFor, num };
