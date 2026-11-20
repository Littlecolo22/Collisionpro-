// SMS Gateway for Android (sms-gate.app, Cloud server mode) adapter + private secret storage.
// Credentials are AES-GCM encrypted in D1 table private_kv with the Worker secret SECRETS_KEY and are
// never returned to the browser.
import { nowIso } from './util.js';

export const SMSGATE_BASE = 'https://api.sms-gate.app/3rdparty/v1';
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (u8) => { let s = ''; for (const x of u8) s += String.fromCharCode(x); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

async function aesKey(env) {
  if (!env.SECRETS_KEY) return null;
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('cp-private-kv:' + env.SECRETS_KEY));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export const canStoreSecrets = (env) => !!env.SECRETS_KEY;

// ---------- private key/value store (never exposed by /api/settings) ----------
export async function kvGet(env, name) {
  const r = await env.DB.prepare('SELECT value, secret FROM private_kv WHERE name=?').bind(name).first();
  if (!r) return null;
  if (!r.secret) return r.value;
  const key = await aesKey(env); if (!key) return null;
  try {
    const [iv, ct] = r.value.split('.');
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct)));
  } catch { return null; }
}
export async function kvSet(env, name, value, secret = false) {
  if (value === null || value === undefined || value === '') { await env.DB.prepare('DELETE FROM private_kv WHERE name=?').bind(name).run(); return; }
  let v = String(value);
  if (secret) {
    const key = await aesKey(env); if (!key) throw new Error('The server encryption key is missing');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    v = b64(iv) + '.' + b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(v))));
  }
  await env.DB.prepare('INSERT INTO private_kv (name,value,secret,updated) VALUES (?,?,?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value, secret=excluded.secret, updated=excluded.updated').bind(name, v, secret ? 1 : 0, nowIso()).run();
}

// ---------- phone numbers ----------
export function digits10(p) { const d = String(p || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : d; }
export function e164(p) {
  const s = String(p || '').trim(); const d = s.replace(/\D/g, '');
  if (!d) return '';
  if (s.startsWith('+')) return '+' + d;
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return '+' + d;
}

// ---------- gateway ----------
export async function gatewayCreds(env) {
  const [u, p] = await Promise.all([kvGet(env, 'sms_user'), kvGet(env, 'sms_pass')]);
  return u && p ? { user: u, pass: p } : null;
}
async function gw(env, creds, method, path, body) {
  const r = await fetch((env.SMSGATE_URL || SMSGATE_BASE) + path, {
    method, headers: { Authorization: 'Basic ' + btoa(`${creds.user}:${creds.pass}`), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let data = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!r.ok) {
    const msg = r.status === 401 ? 'the gateway rejected the username or password' : (data && (data.message || data.error)) || ('HTTP ' + r.status);
    const e = new Error(String(msg).slice(0, 160)); e.status = r.status; throw e;
  }
  return data;
}
export const gwCall = gw;

// Pacing: each outgoing text is scheduled at least `pace` seconds after the previous one.
export async function nextSlot(env) {
  const pace = Math.max(0, Math.min(600, Number(await kvGet(env, 'sms_pace')) || 20));
  const now = Date.now();
  const last = Number(await kvGet(env, 'sms_last_slot')) || 0;
  const slot = Math.max(now, last + pace * 1000);
  await kvSet(env, 'sms_last_slot', String(slot));
  return { slot, delayed: slot - now > 1500 };
}

// Send one text. Returns { status, ext_id, error }.
export async function gatewaySend(env, to, text, { creds } = {}) {
  creds = creds || await gatewayCreds(env);
  if (!creds) return { status: 'not_configured', error: 'SMS gateway is not set up' };
  const num = e164(to);
  if (!num || num.replace(/\D/g, '').length < 10) return { status: 'failed', error: 'No valid phone number' };
  const { slot, delayed } = await nextSlot(env);
  const body = { textMessage: { text: String(text).slice(0, 1500) }, phoneNumbers: [num], withDeliveryReport: true, ttl: 86400 };
  if (delayed) body.scheduleAt = new Date(slot).toISOString().replace(/\.\d{3}Z$/, 'Z');
  try {
    const r = await gw(env, creds, 'POST', '/messages', body);
    await kvSet(env, 'sms_last_ok', nowIso());
    return { status: mapState(r?.state), ext_id: r?.id || null, error: null };
  } catch (e) {
    await kvSet(env, 'sms_last_error', `${nowIso()} ${e.message}`);
    return { status: 'failed', ext_id: null, error: e.message };
  }
}
export function mapState(s) {
  return ({ Pending: 'pending', Processed: 'processing', Sent: 'sent', Delivered: 'delivered', Failed: 'failed', Cancelled: 'failed' })[s] || (s ? String(s).toLowerCase() : 'pending');
}

// Webhook signature: hex(HMAC-SHA256(signingKey, rawBody + timestamp)), timestamp within 5 minutes.
export async function verifySignature(key, raw, ts, sig) {
  if (!key || !ts || !sig) return false;
  const t = Number(ts); if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(raw + ts)));
  const hex = [...mac].map((x) => x.toString(16).padStart(2, '0')).join('');
  const s = String(sig).trim().toLowerCase();
  if (s.length !== hex.length) return false;
  let diff = 0; for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ s.charCodeAt(i);
  return diff === 0;
}

// ---------- how texts are sent: 'device' (this phone, R&R Auto Express app), 'gateway' (SMS Gateway app), 'manual' ----------
export const SMS_METHODS = ['device', 'gateway', 'manual'];
export async function smsMethod(env) {
  const m = await kvGet(env, 'sms_method');
  if (SMS_METHODS.includes(m)) return m;
  return (await gatewayCreds(env).catch(() => null)) ? 'gateway' : 'manual';
}
// The linked texting phone. Its token is stored only as a SHA-256 hash; `hint` is the first 8 hex of that hash.
export async function deviceGet(env) {
  const v = await kvGet(env, 'sms_device');
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}
export async function deviceSet(env, d) { await kvSet(env, 'sms_device', d ? JSON.stringify(d) : null); }
export function devicePublic(d) {
  if (!d) return null;
  const { hash, ...rest } = d; // eslint-disable-line no-unused-vars
  return rest;
}
