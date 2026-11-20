// Messages screen: per-job customer threads over the SMS Gateway for Android (Cloud server mode),
// incoming-text webhook, delivery status, gateway settings (owner only).
import { json, bad, notFound, forbidden, HttpError, nowIso, randomToken, sha256Hex, safeEqual } from './util.js';
import { kvGet, kvSet, canStoreSecrets, gatewayCreds, gwCall, gatewaySend, verifySignature, mapState, digits10, e164, SMS_METHODS, smsMethod, deviceGet, deviceSet, devicePublic } from './sms.js';
import { sendCustomerMessage } from './r_ops.js';

const CLOSED = ['delivered', 'closed', 'total_loss', 'lost', 'completed'];
const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
const START_WORDS = ['START', 'UNSTOP', 'YES'];
export function ownerOnly(c) { if (!c.user || c.user.role !== 'owner') throw forbidden('Owner only'); }

async function gatewayStatus(c) {
  const [user, pass, pace, lastOk, lastErr, hook, hookId, test] = await Promise.all(
    ['sms_user', 'sms_pass', 'sms_pace', 'sms_last_ok', 'sms_last_error', 'sms_hook_key', 'sms_hook_ids', 'sms_test'].map((k) => kvGet(c.env, k)));
  const [method, dev] = await Promise.all([smsMethod(c.env), deviceGet(c.env)]);
  const configured = !!(user && pass);
  const q = await c.db.prepare("SELECT SUM(status='phone_queue') AS waiting, SUM(status='phone_sending') AS sending FROM messages WHERE direction='out' AND status IN ('phone_queue','phone_sending')").first().catch(() => null);
  const device = devicePublic(dev);
  if (device) device.online = !!(dev.last_seen && Date.now() - new Date(dev.last_seen.replace(' ', 'T') + 'Z').getTime() < 120000);
  return {
    method, can_send: method === 'gateway' ? configured : method === 'device' ? !!dev : false,
    device, phone_queue: { waiting: q?.waiting || 0, sending: q?.sending || 0 },
    configured, username: user || '', has_password: !!pass, pace: pace === null || pace === undefined || pace === '' ? 20 : Number(pace),
    last_ok: lastOk, last_error: lastErr, webhook_registered: !!hookId, signing_key_set: !!hook,
    webhook_url: `${c.url.origin}/api/sms/webhook`, test: test ? JSON.parse(test) : null, can_store: canStoreSecrets(c.env),
  };
}

// One incoming text (from the SMS Gateway webhook or the linked phone): match it to a customer's open job,
// honour STOP / START, and file it in Messages.
// onlyKnown (texts forwarded by the linked phone): keep only texts from customers, so the owner's personal texts never land in Messages.
async function receiveText(env, from, text, extId, onlyKnown = false) {
  text = String(text || '').slice(0, 2000);
  if (extId) { const dup = await env.DB.prepare("SELECT id FROM messages WHERE ext_id=? AND direction='in'").bind(extId).first(); if (dup) return { duplicate: true }; }
  const m = await matchJob(env, from);
  if (onlyKnown && !m) return { ignored: true };
  await env.DB.prepare("INSERT INTO messages (job_id,customer_id,channel,direction,from_addr,to_addr,body,status,ext_id,created) VALUES (?,?,'sms','in',?,'shop',?,'received',?,datetime('now'))").bind(m?.job_id || null, m?.customer_id || null, e164(from), text, extId).run();
  const word = text.trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (m && STOP_WORDS.includes(word)) { for (const id of m.customer_ids) await env.DB.prepare('UPDATE customers SET sms_opt_in=0 WHERE id=?').bind(id).run(); }
  if (m && START_WORDS.includes(word) && word !== 'YES') { for (const id of m.customer_ids) await env.DB.prepare('UPDATE customers SET sms_opt_in=1 WHERE id=?').bind(id).run(); }
  if (m?.job_id) await env.DB.prepare('INSERT INTO job_events (job_id,type,detail,user_name) VALUES (?,?,?,?)').bind(m.job_id, 'text_in', text.slice(0, 120), 'Customer').run();
  return { matched: !!m?.job_id };
}

const PHONE_RANK = { phone_queue: 0, phone_sending: 1, sent: 2, delivered: 3, failed: 3 };
async function deviceFromRequest(c) {
  const auth = c.req.headers.get('Authorization') || '';
  const tok = auth.startsWith('Bearer d_') ? auth.slice(7).trim() : '';
  const dev = await deviceGet(c.env);
  if (!tok || tok.length > 100 || !dev || !safeEqual(await sha256Hex(tok), dev.hash)) throw new HttpError(401, 'This phone is no longer linked for texting');
  return dev;
}

async function refreshPending(c, rows) {
  // Ask the gateway for the state of recent outgoing texts that have no final status yet
  const pend = rows.filter((m) => m.ext_id && m.direction === 'out' && ['pending', 'processing', 'sent'].includes(m.status)).slice(-6);
  if (!pend.length) return;
  const creds = await gatewayCreds(c.env); if (!creds) return;
  for (const m of pend) {
    try {
      const r = await gwCall(c.env, creds, 'GET', '/messages/' + encodeURIComponent(m.ext_id));
      const st = mapState(r?.state);
      const err = r?.recipients?.find((x) => x.error)?.error || null;
      if (st !== m.status || err) { await c.db.prepare('UPDATE messages SET status=?, error=COALESCE(?,error), status_at=? WHERE id=?').bind(st, err, nowIso(), m.id).run(); m.status = st; if (err) m.error = err; }
    } catch { /* keep the old status */ }
  }
}

async function registerWebhooks(env, creds, origin) {
  // Replace any webhooks this app registered before, then register incoming + delivery events.
  const old = JSON.parse((await kvGet(env, 'sms_hook_ids')) || '[]');
  for (const id of old) { try { await gwCall(env, creds, 'DELETE', '/webhooks/' + encodeURIComponent(id)); } catch { /* gone */ } }
  const secret = (await kvGet(env, 'sms_hook_secret')) || randomToken(16);
  await kvSet(env, 'sms_hook_secret', secret, true);
  const url = `${origin}/api/sms/webhook?k=${secret}`;
  const ids = [];
  for (const event of ['sms:received', 'sms:sent', 'sms:delivered', 'sms:failed']) {
    const id = 'cp-' + event.replace(':', '-');
    try { await gwCall(env, creds, 'DELETE', '/webhooks/' + id); } catch { /* none yet */ }
    const r = await gwCall(env, creds, 'POST', '/webhooks', { id, url, event });
    ids.push(r?.id || id);
  }
  await kvSet(env, 'sms_hook_ids', JSON.stringify(ids));
  return ids;
}

async function matchJob(env, phone) {
  const d = digits10(phone); if (d.length < 10) return null;
  const custs = await env.DB.prepare("SELECT id, phone FROM customers WHERE phone IS NOT NULL AND phone<>'' ORDER BY id DESC LIMIT 5000").all();
  const ids = custs.results.filter((x) => digits10(x.phone) === d).map((x) => x.id);
  if (!ids.length) return null;
  const ph = ids.map(() => '?').join(',');
  const jobs = (await env.DB.prepare(`SELECT id, customer_id, status, updated FROM jobs WHERE customer_id IN (${ph}) ORDER BY id DESC LIMIT 50`).bind(...ids).all()).results;
  const open = jobs.find((j) => !CLOSED.includes(j.status));
  const j = open || jobs[0];
  return { customer_id: j ? j.customer_id : ids[0], job_id: j ? j.id : null, customer_ids: ids };
}

export function registerMsgs(R) {
  // ---------- threads ----------
  R.get('/api/messages/threads', async (c) => {
    ownerOnly(c);
    const lf = c.locFilter ? c.locFilter('j') : { sql: '', binds: [] };
    const rows = (await c.db.prepare(`SELECT j.id AS job_id, j.number, j.stage, j.status, c.id AS customer_id, c.name AS customer_name, c.phone, c.sms_opt_in,
        v.year, v.make, v.model,
        m.body AS last_body, m.created AS last_at, m.direction AS last_dir, m.status AS last_status,
        (SELECT COUNT(*) FROM messages u WHERE u.job_id=j.id AND u.direction='in' AND u.read_at IS NULL) AS unread
      FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN vehicles v ON v.id=j.vehicle_id
      LEFT JOIN messages m ON m.id=(SELECT MAX(id) FROM messages x WHERE x.job_id=j.id)
      WHERE 1=1 ${lf.sql || ''}
      ORDER BY (m.created IS NULL), m.created DESC, j.id DESC LIMIT 300`).bind(...(lf.args || [])).all()).results;
    const unmatched = (await c.db.prepare("SELECT id, from_addr, body, created FROM messages WHERE job_id IS NULL AND direction='in' ORDER BY id DESC LIMIT 30").all()).results;
    return json({ threads: rows, unmatched, gateway: await gatewayStatus(c) });
  });

  R.get('/api/messages/job/:id', async (c) => {
    ownerOnly(c);
    const id = c.id();
    const job = await c.db.prepare(`SELECT j.id, j.number, j.stage, j.status, j.customer_id, c.name AS customer_name, c.phone, c.email, c.sms_opt_in, v.year, v.make, v.model
      FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN vehicles v ON v.id=j.vehicle_id WHERE j.id=?`).bind(id).first();
    if (!job) throw notFound('Job not found');
    const rows = (await c.db.prepare('SELECT id, direction, channel, to_addr, from_addr, body, status, error, auto, user_name, created, status_at, ext_id FROM messages WHERE job_id=? ORDER BY id ASC LIMIT 500').bind(id).all()).results;
    await refreshPending(c, rows);
    await c.db.prepare("UPDATE messages SET read_at=datetime('now') WHERE job_id=? AND direction='in' AND read_at IS NULL").bind(id).run();
    rows.forEach((m) => { delete m.ext_id; });
    return json({ job, messages: rows, gateway: await gatewayStatus(c) });
  });

  R.post('/api/messages/job/:id', async (c) => {
    ownerOnly(c);
    const id = c.id();
    const body = String(c.body.body || '').trim();
    if (!body) throw bad('Type a message first');
    if (body.length > 1500) throw bad('That message is too long (1500 characters max)');
    const job = await c.db.prepare('SELECT * FROM jobs WHERE id=?').bind(id).first();
    if (!job) throw notFound('Job not found');
    const cust = await c.db.prepare('SELECT * FROM customers WHERE id=?').bind(job.customer_id).first();
    if (!cust || !cust.phone) throw bad('This customer has no phone number');
    if (!cust.sms_opt_in) throw bad('This customer replied STOP, so texts are turned off for them');
    if (c.body.via === 'phone') {
      const ins = await c.db.prepare("INSERT INTO messages (job_id,customer_id,channel,direction,to_addr,body,status,user_name,read_at) VALUES (?,?,'sms','out',?,?,'sent_from_phone',?,datetime('now'))").bind(id, cust.id, cust.phone, body, c.user.name || null).run();
      return json({ ok: true, id: ins.meta?.last_row_id, status: 'sent_from_phone', phone: e164(cust.phone) });
    }
    const msg = await sendCustomerMessage(c, job, { channel: 'sms', body });
    if (!msg) throw bad('Could not send this text');
    return json({ ok: true, id: msg.id, status: msg.status, error: msg.error || null, phone: e164(cust.phone) });
  });

  // Attach an unmatched incoming text to a job
  R.post('/api/messages/:id/attach', async (c) => {
    ownerOnly(c);
    const id = c.id(); const jobId = Number(c.body.job_id);
    const job = await c.db.prepare('SELECT id, customer_id FROM jobs WHERE id=?').bind(jobId).first();
    if (!job) throw notFound('Job not found');
    await c.db.prepare("UPDATE messages SET job_id=?, customer_id=? WHERE id=? AND direction='in'").bind(job.id, job.customer_id, id).run();
    return json({ ok: true });
  });
  // A text that could not go out automatically was sent by hand from the owner's messaging app
  R.post('/api/messages/:id/sent-from-phone', async (c) => {
    ownerOnly(c);
    await c.db.prepare("UPDATE messages SET status='sent_from_phone', error=NULL, status_at=? WHERE id=? AND direction='out' AND channel='sms' AND (status LIKE 'queued%' OR status LIKE 'failed%' OR status IN ('failed','not_configured','phone_queue'))").bind(nowIso(), c.id()).run();
    return json({ ok: true });
  });
  R.del('/api/messages/:id', async (c) => {
    ownerOnly(c);
    await c.db.prepare("DELETE FROM messages WHERE id=? AND job_id IS NULL AND direction='in'").bind(c.id()).run();
    return json({ ok: true });
  });

  // ---------- gateway settings (owner only; password never leaves the server) ----------
  R.get('/api/sms/settings', async (c) => { ownerOnly(c); return json(await gatewayStatus(c)); });

  R.put('/api/sms/settings', async (c) => {
    ownerOnly(c);
    const b = c.body || {};
    if (!canStoreSecrets(c.env)) throw new HttpError(500, 'The server encryption key is missing');
    if ('pace' in b) { const p = Math.round(Number(b.pace)); if (!(p >= 0 && p <= 600)) throw bad('Seconds between texts must be 0 to 600'); await kvSet(c.env, 'sms_pace', String(p)); }
    if ('signing_key' in b) await kvSet(c.env, 'sms_hook_key', String(b.signing_key || '').trim(), true);
    if ('method' in b) { if (!SMS_METHODS.includes(b.method)) throw bad('Pick how texts are sent'); await kvSet(c.env, 'sms_method', b.method); }
    if (b.forget_device) await deviceSet(c.env, null);
    if (b.clear) {
      const creds = await gatewayCreds(c.env);
      if (creds) { for (const id of JSON.parse((await kvGet(c.env, 'sms_hook_ids')) || '[]')) { try { await gwCall(c.env, creds, 'DELETE', '/webhooks/' + encodeURIComponent(id)); } catch { /* ignore */ } } }
      for (const k of ['sms_user', 'sms_pass', 'sms_hook_ids', 'sms_last_error', 'sms_last_ok', 'sms_test']) await kvSet(c.env, k, null);
      return json(await gatewayStatus(c));
    }
    let changed = false;
    if (typeof b.username === 'string' && b.username.trim()) { await kvSet(c.env, 'sms_user', b.username.trim(), false); changed = true; }
    if (typeof b.password === 'string' && b.password) { await kvSet(c.env, 'sms_pass', b.password, true); changed = true; }
    const st = await gatewayStatus(c);
    if (changed && st.configured) {
      try { await registerWebhooks(c.env, await gatewayCreds(c.env), c.url.origin); await kvSet(c.env, 'sms_last_error', null); }
      catch (e) { await kvSet(c.env, 'sms_last_error', `${nowIso()} Saved, but could not set up incoming texts: ${e.message}`); }
    }
    return json(await gatewayStatus(c));
  });

  R.post('/api/sms/test', async (c) => {
    ownerOnly(c);
    const to = String(c.body.to || '').trim();
    if (digits10(to).length < 10) throw bad('Enter the phone number to send the test to');
    const shopName = (await c.db.prepare("SELECT value FROM settings WHERE key='shop_name'").first())?.value || 'R&R Auto Express';
    const method = await smsMethod(c.env);
    if (method === 'manual') throw bad('"Open my messaging app" sends from your own messaging app, so there is nothing to test here');
    if (method === 'device') {
      if (!(await deviceGet(c.env))) throw bad('Link this phone first: tap "Use this phone for texting"');
      const body = `Test text from ${shopName}. Your shop's texting is working.`;
      const ins = await c.db.prepare("INSERT INTO messages (job_id,customer_id,channel,direction,to_addr,body,status,auto,user_name,read_at) VALUES (NULL,NULL,'sms','out',?,?,'phone_queue',1,?,datetime('now'))").bind(e164(to), body, c.user.name || null).run();
      await kvSet(c.env, 'sms_test', JSON.stringify({ at: nowIso(), to: e164(to), status: 'phone_queue', error: null, msg_id: ins.meta?.last_row_id, via: 'device' }));
      return json(await gatewayStatus(c));
    }
    const creds = await gatewayCreds(c.env);
    if (!creds) throw bad('Save the gateway username and password first');
    const shop = (await c.db.prepare("SELECT value FROM settings WHERE key='shop_name'").first())?.value || 'R&R Auto Express';
    const r = await gatewaySend(c.env, to, `Test text from ${shop}. Your shop's texting is working.`, { creds });
    const test = { at: nowIso(), to: e164(to), status: r.status, error: r.error, ext_id: r.ext_id };
    await kvSet(c.env, 'sms_test', JSON.stringify(test));
    if (r.status === 'failed') throw bad('Test text failed: ' + (r.error || 'unknown error'));
    // Make sure incoming texts are wired up too
    if (!(await kvGet(c.env, 'sms_hook_ids'))) { try { await registerWebhooks(c.env, creds, c.url.origin); } catch (e) { await kvSet(c.env, 'sms_last_error', `${nowIso()} Could not set up incoming texts: ${e.message}`); } }
    return json(await gatewayStatus(c));
  });

  R.post('/api/sms/test/refresh', async (c) => {
    ownerOnly(c);
    const t = JSON.parse((await kvGet(c.env, 'sms_test')) || 'null');
    if (t && t.msg_id) {
      const m = await c.db.prepare('SELECT status, error FROM messages WHERE id=?').bind(t.msg_id).first();
      if (m) { t.status = m.status; t.error = m.error || null; t.checked = nowIso(); await kvSet(c.env, 'sms_test', JSON.stringify(t)); }
      return json(await gatewayStatus(c));
    }
    const creds = await gatewayCreds(c.env);
    if (t && t.ext_id && creds) {
      try { const r = await gwCall(c.env, creds, 'GET', '/messages/' + encodeURIComponent(t.ext_id)); t.status = mapState(r?.state); t.error = r?.recipients?.find((x) => x.error)?.error || null; t.checked = nowIso(); await kvSet(c.env, 'sms_test', JSON.stringify(t)); }
      catch (e) { t.error = e.message; }
    }
    return json(await gatewayStatus(c));
  });

  // ---------- this phone as the texter (R&R Auto Express Android app) ----------
  // Link: the owner, signed in inside the app, gets a long random device token. The server keeps only its hash.
  // Linking again (or from another phone) replaces the old token, so the old phone stops being used.
  R.post('/api/sms/device/link', async (c) => {
    ownerOnly(c);
    const b = c.body || {};
    const cut = (v, n) => String(v || '').slice(0, n);
    const token = 'd_' + randomToken(32);
    const hash = await sha256Hex(token);
    await deviceSet(c.env, {
      hash, hint: hash.slice(0, 8), name: cut(b.name, 60) || 'Android phone', model: cut(b.model, 60), android: cut(b.android, 20), app_version: cut(b.app_version, 20),
      linked: nowIso(), linked_by: c.user.name || null, last_seen: null, perm: b.perm && typeof b.perm === 'object' ? { send: !!b.perm.send, receive: !!b.perm.receive, notif: !!b.perm.notif } : null, bg: !!b.bg,
    });
    if (b.use !== false) await kvSet(c.env, 'sms_method', 'device');
    // Texts that were stuck waiting for a phone go out from the newly linked phone
    await c.db.prepare("UPDATE messages SET status='phone_queue', status_at=? WHERE direction='out' AND channel='sms' AND status='phone_sending'").bind(nowIso()).run();
    return json({ ...(await gatewayStatus(c)), token, hint: hash.slice(0, 8), sync_url: `${c.url.origin}/api/sms/device/sync` });
  });

  // Sync: the linked phone reports its permissions, delivery results and incoming texts, and picks up the next
  // queued outgoing text(s). Authenticated with the device token (Authorization: Bearer d_...).
  R.post('/api/sms/device/sync', async (c) => {
    const dev = await deviceFromRequest(c);
    const b = c.body && typeof c.body === 'object' ? c.body : {};
    const method = await smsMethod(c.env);
    dev.last_seen = nowIso();
    if (b.perm && typeof b.perm === 'object') dev.perm = { send: !!b.perm.send, receive: !!b.perm.receive, notif: !!b.perm.notif };
    if ('bg' in b) dev.bg = !!b.bg;
    if ('battery_ok' in b) dev.battery_ok = !!b.battery_ok;
    if (b.app_version) dev.app_version = String(b.app_version).slice(0, 20);
    const test = JSON.parse((await kvGet(c.env, 'sms_test')) || 'null');
    let testChanged = false;
    for (const s of (Array.isArray(b.statuses) ? b.statuses.slice(0, 50) : [])) {
      const id = Number(s && s.id); const st = s && ['sent', 'delivered', 'failed'].includes(s.status) ? s.status : null;
      if (!id || !st) continue;
      const err = st === 'failed' ? String(s.error || 'The phone could not send this text').slice(0, 200) : null;
      const cur = await c.db.prepare("SELECT id, status FROM messages WHERE id=? AND direction='out' AND channel='sms'").bind(id).first();
      if (!cur || !(cur.status in PHONE_RANK) || cur.status === 'failed' || cur.status === 'delivered') continue;
      if (PHONE_RANK[st] < PHONE_RANK[cur.status]) continue;
      await c.db.prepare('UPDATE messages SET status=?, error=?, status_at=? WHERE id=?').bind(st, err, nowIso(), id).run();
      if (st === 'failed') dev.last_error = `${nowIso()} ${err}`; else { dev.last_ok = nowIso(); dev.last_error = null; }
      if (test && test.msg_id === id) { test.status = st; test.error = err; testChanged = true; }
    }
    if (testChanged) await kvSet(c.env, 'sms_test', JSON.stringify(test));
    let received = 0;
    if (method === 'device') {
      for (const t of (Array.isArray(b.incoming) ? b.incoming.slice(0, 30) : [])) {
        if (!t || digits10(t.from).length < 10 || !String(t.body || '').trim()) continue;
        const r = await receiveText(c.env, t.from, t.body, t.ref ? 'dev-' + String(t.ref).slice(0, 80) : null, true);
        if (!r.ignored && !r.duplicate) received++;
      }
    }
    const outbox = [];
    let more = false;
    if (method === 'device' && b.want !== 0 && !(dev.perm && dev.perm.send === false)) {
      await c.db.prepare("UPDATE messages SET status='failed', error='The texting phone did not pick this up within 24 hours', status_at=? WHERE direction='out' AND status='phone_queue' AND created < datetime('now','-1 day')").bind(nowIso()).run();
      const want = Math.max(1, Math.min(5, Number(b.want) || 1));
      const stale = new Date(Date.now() - 180000).toISOString().replace('T', ' ').slice(0, 19);
      const rows = (await c.db.prepare(`SELECT m.id, m.to_addr, m.body, m.status, c.sms_opt_in FROM messages m LEFT JOIN customers c ON c.id=m.customer_id
        WHERE m.direction='out' AND m.channel='sms' AND (m.status='phone_queue' OR (m.status='phone_sending' AND m.status_at < ?)) ORDER BY m.id LIMIT ?`).bind(stale, want + 1).all()).results;
      more = rows.length > want;
      for (const m of rows.slice(0, want)) {
        if (m.sms_opt_in === 0) { await c.db.prepare("UPDATE messages SET status='failed', error='The customer replied STOP', status_at=? WHERE id=?").bind(nowIso(), m.id).run(); continue; }
        const r = await c.db.prepare("UPDATE messages SET status='phone_sending', status_at=? WHERE id=? AND status=?").bind(nowIso(), m.id, m.status).run();
        if ((r.meta?.changes ?? 1) > 0) outbox.push({ id: m.id, to: e164(m.to_addr), body: m.body });
      }
    }
    await deviceSet(c.env, dev);
    const pv = await kvGet(c.env, 'sms_pace'); const pace = pv === null || pv === undefined || pv === '' ? 20 : Math.max(1, Number(pv) || 1);
    return json({ ok: true, method, pace, outbox, more, received, forward_incoming: method === 'device' });
  }, { public: true });

  // ---------- incoming webhook (public; verified) ----------
  R.post('/api/sms/webhook', async (c) => {
    const raw = c.body._raw || '';
    const secret = await kvGet(c.env, 'sms_hook_secret');
    const k = c.q('k') || '';
    if (!secret || k.length !== secret.length) throw forbidden('Bad webhook');
    let diff = 0; for (let i = 0; i < k.length; i++) diff |= k.charCodeAt(i) ^ secret.charCodeAt(i);
    if (diff) throw forbidden('Bad webhook');
    const signKey = await kvGet(c.env, 'sms_hook_key');
    if (signKey) {
      const ok = await verifySignature(signKey, raw, c.req.headers.get('X-Timestamp'), c.req.headers.get('X-Signature'));
      if (!ok) throw new HttpError(401, 'Bad signature');
    }
    let ev; try { ev = JSON.parse(raw); } catch { throw bad('Invalid JSON'); }
    const p = ev.payload || {};
    const event = ev.event || '';
    if (event === 'sms:received') {
      const r = await receiveText(c.env, p.phoneNumber || p.sender || '', p.message || p.text || '', p.messageId || ev.id || null);
      return json({ ok: true, ...r });
    }
    if (['sms:sent', 'sms:delivered', 'sms:failed'].includes(event)) {
      const extId = p.messageId; if (!extId) return json({ ok: true });
      const st = event === 'sms:failed' ? 'failed' : event.slice(4);
      const rank = { pending: 0, processing: 1, sent: 2, delivered: 3, failed: 3 };
      const cur = await c.db.prepare("SELECT id, status FROM messages WHERE ext_id=? AND direction='out'").bind(extId).first();
      if (cur && (rank[st] ?? 0) >= (rank[cur.status] ?? 0)) await c.db.prepare('UPDATE messages SET status=?, error=?, status_at=? WHERE id=?').bind(st, event === 'sms:failed' ? String(p.reason || 'Failed').slice(0, 200) : null, nowIso(), cur.id).run();
      const t = JSON.parse((await kvGet(c.env, 'sms_test')) || 'null');
      if (t && t.ext_id === extId) { t.status = st; if (event === 'sms:failed') t.error = p.reason || 'Failed'; await kvSet(c.env, 'sms_test', JSON.stringify(t)); }
      return json({ ok: true });
    }
    return json({ ok: true, ignored: event });
  }, { public: true, raw: true });
}
