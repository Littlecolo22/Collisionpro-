// CollisionPro: collision repair shop management on Cloudflare Workers + D1 (+ Workers AI).
import { json, text, bad, notFound, forbidden, HttpError, securityHeaders, num, r2, nowIso, today, randomToken, parseJsonCol, hashPassword } from './util.js';
import { Router, readBody, getSessionUser, getApiKey, login, sessionCookie, makeCtx, insertRow } from './core.js';
import { capsFor, computeTotals, STAGES, rescheduleForParts } from './logic.js';
import { registerJobs, jobBundle } from './r_jobs.js';
import { registerOps, sendCustomerMessage } from './r_ops.js';
import { registerMoney } from './r_money.js';
import { registerOwner } from './r_owner.js';
import { registerMsgs } from './r_msgs.js';
import { registerScreens2 } from './r_screens2.js';
import { partsRoutes } from './partsapi.js';
import { buildEstimatePdf } from './pdf.js';
import { saveFile, loadFileBytes, fileResponse } from './files.js';
import { seedDatabase } from './seed.js';

const R = new Router();

// ---------- Auth ----------
R.post('/api/login', async (c) => {
  const ip = c.req.headers.get('CF-Connecting-IP') || 'x';
  const k = 'login:' + ip;
  const row = await c.db.prepare('SELECT value FROM settings WHERE location_id=-1 AND key=?').bind(k).first();
  const [cnt, since] = (row?.value || '0|0').split('|').map(Number);
  const fresh = Date.now() - since > 15 * 60000;
  if (!fresh && cnt >= 10) throw new HttpError(429, 'Too many sign-in attempts. Try again in 15 minutes.');
  const r = await login(c.env, c.req, c.body.email, c.body.password);
  if (!r) {
    await c.db.prepare('INSERT INTO settings (location_id,key,value) VALUES (-1,?,?) ON CONFLICT(location_id,key) DO UPDATE SET value=excluded.value').bind(k, `${fresh ? 1 : cnt + 1}|${fresh ? Date.now() : since}`).run();
    throw new HttpError(401, 'Wrong email or password');
  }
  await c.db.prepare('DELETE FROM settings WHERE location_id=-1 AND key=?').bind(k).run();
  await c.db.prepare('INSERT INTO audit_log (user_id,user_name,location_id,action,entity,ip) VALUES (?,?,?,?,?,?)').bind(r.user.id, r.user.name, r.user.location_id, 'login', 'session', ip).run();
  return json({ ok: true, token: 's_' + r.token }, 200, { 'Set-Cookie': sessionCookie(r.token) });
}, { public: true });
R.post('/api/logout', async (c) => {
  const tok = (c.req.headers.get('Cookie') || '').match(/cp_session=([^;]+)/)?.[1];
  if (tok) await c.db.prepare('DELETE FROM sessions WHERE token=?').bind(tok).run();
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}, { public: true });
R.get('/api/session', async (c) => json({ signed_in: !!c.user }), { public: true });

// ---------- One-time owner sign-up ----------
// Open only while the shop has no users. The first sign-up becomes the owner and closes sign-up for good
// (claimed atomically through settings key owner_claimed). Staff are added by the owner in Settings.
async function bumpLimit(db, key, max, windowMs) {
  const row = await db.prepare('SELECT value FROM settings WHERE location_id=-1 AND key=?').bind(key).first();
  const [cnt, since] = (row?.value || '0|0').split('|').map(Number);
  const fresh = Date.now() - since > windowMs;
  if (!fresh && cnt >= max) return false;
  await db.prepare('INSERT INTO settings (location_id,key,value) VALUES (-1,?,?) ON CONFLICT(location_id,key) DO UPDATE SET value=excluded.value').bind(key, `${fresh ? 1 : cnt + 1}|${fresh ? Date.now() : since}`).run();
  return true;
}
R.get('/api/signup', async (c) => {
  const claimed = await c.db.prepare("SELECT 1 FROM settings WHERE location_id=-1 AND key='owner_claimed'").first();
  const users = await c.db.prepare('SELECT COUNT(*) n FROM users').first();
  const open = !claimed && users.n === 0;
  const shop = await c.db.prepare("SELECT value FROM settings WHERE location_id=0 AND key='shop_name'").first();
  return json({ open: !!open, shop_name: shop?.value || 'R&R Auto Express' });
}, { public: true });
R.post('/api/signup', async (c) => {
  const ip = c.req.headers.get('CF-Connecting-IP') || 'x';
  if (!(await bumpLimit(c.db, 'signup:' + ip, 5, 60 * 60000)) || !(await bumpLimit(c.db, 'signup:all', 30, 60 * 60000))) throw new HttpError(429, 'Too many sign-up attempts. Try again in an hour.');
  const users = await c.db.prepare('SELECT COUNT(*) n FROM users').first();
  if (users.n > 0) throw forbidden('Sign-up is closed. Ask the shop owner to add you in Settings.');
  const b = c.body || {};
  const shop = String(b.shop_name || '').trim(), name = String(b.name || '').trim(), email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
  if (shop.length < 2 || shop.length > 80) throw bad('Enter your shop name');
  if (name.length < 2 || name.length > 80) throw bad('Enter your name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) throw bad('Enter a valid email');
  if (pw.length < 10 || pw.length > 200) throw bad('Password must be at least 10 characters');
  // Claim the owner slot atomically: only one request can insert this row
  const claim = await c.db.prepare("INSERT OR IGNORE INTO settings (location_id,key,value) VALUES (-1,'owner_claimed',?)").bind(nowIso()).run();
  if (!claim.meta || claim.meta.changes !== 1) throw forbidden('Sign-up is closed. Ask the shop owner to add you in Settings.');
  const { hash, salt } = await hashPassword(pw);
  const loc = await c.db.prepare('SELECT id FROM locations ORDER BY id LIMIT 1').first();
  await c.db.batch([
    c.db.prepare('DELETE FROM sessions'),
    c.db.prepare('DELETE FROM api_keys'),
    c.db.prepare('DELETE FROM users'),
    c.db.prepare("INSERT INTO users (name,email,role,location_id,pw_hash,pw_salt,active) VALUES (?,?,'owner',NULL,?,?,1)").bind(name, email, hash, salt),
    c.db.prepare("INSERT INTO settings (location_id,key,value) VALUES (0,'shop_name',?) ON CONFLICT(location_id,key) DO UPDATE SET value=excluded.value").bind(shop),
    ...(loc ? [c.db.prepare('UPDATE locations SET name=? WHERE id=?').bind(shop, loc.id)] : [c.db.prepare('INSERT INTO locations (name) VALUES (?)').bind(shop)]),
  ]);
  const r = await login(c.env, c.req, email, pw);
  await c.db.prepare('INSERT INTO audit_log (user_id,user_name,location_id,action,entity,ip) VALUES (?,?,?,?,?,?)').bind(r.user.id, r.user.name, null, 'signup', 'owner', ip).run();
  return json({ ok: true, token: 's_' + r.token }, 200, { 'Set-Cookie': sessionCookie(r.token) });
}, { public: true });
R.get('/api/me', async (c) => {
  const locs = (await c.db.prepare('SELECT id,name FROM locations ORDER BY id').all()).results;
  const shop = await c.db.prepare("SELECT value FROM settings WHERE location_id=0 AND key='shop_name'").first();
  return json({ user: c.user, caps: capsFor(c.user.role), locations: c.user.location_id ? locs.filter((l) => l.id === c.user.location_id) : locs, shop_name: shop?.value || 'R&R Auto Express', stages: STAGES });
});

// ---------- Dashboard ----------
R.get('/api/dashboard', async (c) => {
  c.need('shop.read');
  const lf = c.locFilter('j');
  const one = (sql, ...a) => c.db.prepare(sql).bind(...a, ...lf.args).first();
  const [open, wip, ready, est, parts, today_in, today_out, alerts] = await Promise.all([
    one(`SELECT COUNT(*) n FROM jobs j WHERE status NOT IN ('delivered','closed','lost','total_loss')${lf.sql}`),
    one(`SELECT COUNT(*) n FROM jobs j WHERE status='in_production'${lf.sql}`),
    one(`SELECT COUNT(*) n FROM jobs j WHERE stage='ready' AND status='completed'${lf.sql}`),
    one(`SELECT COUNT(*) n FROM jobs j WHERE status='estimate'${lf.sql}`),
    one(`SELECT COUNT(*) n FROM parts p JOIN jobs j ON j.id=p.job_id WHERE p.status IN ('ordered','shipped','backordered')${lf.sql}`),
    c.db.prepare(`SELECT s.*, j.number, cu.name AS customer_name, v.year, v.make, v.model FROM schedule_events s LEFT JOIN jobs j ON j.id=s.job_id LEFT JOIN customers cu ON cu.id=j.customer_id LEFT JOIN vehicles v ON v.id=j.vehicle_id WHERE substr(s.start,1,10)=? AND s.type='drop_off'${lf.sql.replace('j.location_id', 's.location_id')} ORDER BY s.start`).bind(today(), ...lf.args).all(),
    c.db.prepare(`SELECT s.*, j.number, cu.name AS customer_name, v.year, v.make, v.model FROM schedule_events s LEFT JOIN jobs j ON j.id=s.job_id LEFT JOIN customers cu ON cu.id=j.customer_id LEFT JOIN vehicles v ON v.id=j.vehicle_id WHERE substr(s.start,1,10)=? AND s.type='delivery'${lf.sql.replace('j.location_id', 's.location_id')} ORDER BY s.start`).bind(today(), ...lf.args).all(),
    c.db.prepare(`SELECT e.*, j.number FROM job_events e JOIN jobs j ON j.id=e.job_id WHERE e.type IN ('alert','auto_reschedule')${lf.sql} ORDER BY e.id DESC LIMIT 8`).bind(...lf.args).all(),
  ]);
  return json({ open: open.n, wip: wip.n, ready: ready.n, estimates: est.n, parts_on_order: parts.n, drop_offs: today_in.results, deliveries: today_out.results, alerts: alerts.results });
});

// ---------- PDFs + share links ----------
async function pdfFor(c, jobId, q) {
  const b = await jobBundle(c, jobId);
  const rows = (await c.db.prepare('SELECT key,value FROM settings WHERE location_id=0').all()).results;
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  let kind = q.kind || 'estimate', supplement = null, invoice = null;
  if (kind === 'supplement') {
    supplement = num(q.supp, 1);
    const only = b.lines.filter((l) => num(l.supplement_no) === supplement);
    b.totals_supp = computeTotals(only, { loc: b.location, insurer: b.insurer, job: { ...b.job, pay_type: 'customer' }, vehicle: b.vehicle });
  }
  if (kind === 'invoice') { if (c.need) c.need('accounting.read'); invoice = b.invoices.filter((i) => i.status !== 'void').slice(-1)[0]; if (!invoice) throw bad('No invoice yet'); b.paid = r2(b.payments.filter((p) => p.invoice_id === invoice.id).reduce((a, p) => a + num(p.amount), 0)); }
  const bytes = await buildEstimatePdf(c.env, b, { kind, supplement, settings, invoice, photos: q.photos === '0' ? 0 : 6 });
  const name = `${b.job.number}-${kind === 'supplement' ? 'S' + supplement : kind}.pdf`;
  return { bytes, name, b };
}
R.get('/api/jobs/:id/pdf', async (c) => {
  c.need('jobs.read');
  const q = Object.fromEntries(c.url.searchParams);
  const { bytes, name, b } = await pdfFor(c, c.id(), q);
  await c.audit('pdf', 'job', b.job.id, b.job.id, name);
  return new Response(bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${q.download ? 'attachment' : 'inline'}; filename="${name}"`, 'Cache-Control': 'no-store' } });
});
R.post('/api/jobs/:id/share-link', async (c) => {
  c.need('jobs.read');
  const job = await c.job(c.id());
  const kind = ['estimate', 'supplement', 'invoice'].includes(c.body.kind) ? c.body.kind : 'estimate';
  const token = randomToken(16);
  const days = Math.min(90, Math.max(1, num(c.body.days, 30)));
  await c.db.prepare('INSERT INTO share_links (token,job_id,kind,supp,expires,created_by) VALUES (?,?,?,?,datetime(\'now\', ?),?)').bind(token, job.id, kind, num(c.body.supp) || null, `+${days} days`, c.user.name).run();
  await c.audit('share_link', 'job', job.id, job.id, `${kind} (${days} days)`);
  return json({ url: `${c.url.origin}/s/${token}`, portal: `${c.url.origin}/p/${job.portal_token}`, expires_days: days });
});

// ---------- Public API (API keys) for scan tools / partners ----------
R.post('/api/v1/jobs/:number/scans', async (c) => {
  const job = await c.db.prepare('SELECT * FROM jobs WHERE number=?').bind(c.params.number).first();
  if (!job) throw notFound('RO not found');
  if (c.apiKey.location_id && c.apiKey.location_id !== job.location_id) throw forbidden();
  if (!String(c.apiKey.scopes).includes('scans')) throw forbidden('Key lacks scans scope');
  const b = c.body;
  const id = await insertRow(c.env, 'scans', { job_id: job.id, type: b.type === 'post' ? 'post' : 'pre', tool: b.tool || '', dtcs: Array.isArray(b.dtcs) ? b.dtcs.join(', ') : b.dtcs || '', result: b.result || '', performed_by: b.performed_by || c.apiKey.name, source: 'api:' + c.apiKey.name }, ['job_id', 'type', 'tool', 'dtcs', 'result', 'performed_by', 'source']);
  await c.db.prepare(`UPDATE jobs SET ${b.type === 'post' ? 'post' : 'pre'}_scan_status='done' WHERE id=?`).bind(job.id).run();
  await c.db.prepare('INSERT INTO audit_log (user_name,location_id,action,entity,entity_id,job_id,detail) VALUES (?,?,?,?,?,?,?)').bind('api:' + c.apiKey.name, job.location_id, 'api_scan', 'scan', id, job.id, JSON.stringify(b).slice(0, 1000)).run();
  return json({ id });
}, { apiKey: true });
R.get('/api/v1/jobs/:number', async (c) => {
  const job = await c.db.prepare('SELECT j.number,j.status,j.stage,j.target_date,j.claim_no,v.vin,v.year,v.make,v.model FROM jobs j LEFT JOIN vehicles v ON v.id=j.vehicle_id WHERE j.number=?').bind(c.params.number).first();
  if (!job) throw notFound('RO not found');
  return json(job);
}, { apiKey: true });

// ---------- Customer portal (public, token-based) ----------
async function portalJob(env, token) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) throw notFound();
  const job = await env.DB.prepare('SELECT * FROM jobs WHERE portal_token=?').bind(token).first();
  if (!job || job.portal_off) throw notFound('This link is no longer active. Please contact the shop.');
  return job;
}
function fakeCtx(env, url, req, job) {
  return { env, url, req, db: env.DB, user: { id: 0, name: 'customer', role: 'portal' }, can: (cap) => cap === 'shop.read', // shop.read keeps the job's own invoices/payments in the bundle; portal routes pick only customer-safe fields
 job: async () => job, event: async (jid, type, detail) => env.DB.prepare('INSERT INTO job_events (job_id,type,detail,user_name) VALUES (?,?,?,?)').bind(jid, type, detail, 'customer').run() };
}
R.get('/api/portal/:token', async (c) => {
  const job = await portalJob(c.env, c.params.token);
  const b = await jobBundle(fakeCtx(c.env, c.url, c.req, job), job.id);
  const shop = await c.db.prepare("SELECT value FROM settings WHERE location_id=0 AND key='shop_name'").first();
  const review = await c.db.prepare("SELECT value FROM settings WHERE location_id=0 AND key='review_link'").first();
  const stageIdx = STAGES.findIndex((s) => s[0] === job.stage);
  await c.db.prepare("UPDATE jobs SET portal_viewed_at=datetime('now') WHERE id=?").bind(job.id).run();
  const liveInv = b.invoices.filter((i) => i.status !== 'void');
  const custPaid = b.payments.filter((p) => p.payer !== 'insurer').reduce((a, p) => a + num(p.amount), 0);
  const custOwed = liveInv.reduce((a, i) => a + num(i.customer_portion ?? i.total), 0);
  return json({
    shop: shop?.value || b.location.name, location: { name: b.location.name, phone: b.location.phone, address: b.location.address },
    number: job.number, status: job.status, stage: job.stage, stage_label: STAGES[stageIdx]?.[1], stage_index: stageIdx, stages: STAGES.map((s) => s[1]),
    target_date: job.target_date, vehicle: b.vehicle ? { year: b.vehicle.year, make: b.vehicle.make, model: b.vehicle.model, color: b.vehicle.color } : null,
    customer_first: (b.customer?.name || '').split(' ')[0],
    estimate: { lines: b.lines.map((l) => ({ line_no: l.line_no, area: l.area, operation: l.operation, description: l.description, amount: r2(num(l.qty, 1) * num(l.unit_price)), labor_hours: l.labor_hours, teardown_hours: l.teardown_hours, refinish_hours: l.refinish_hours, supplement_no: l.supplement_no })), totals: { total: b.totals.total, customer_pays: b.totals.customer_pays, insurer_pays: b.totals.insurer_pays, deductible: b.totals.deductible, tax: b.totals.tax } },
    approvals: b.approvals.map((a) => ({ type: a.type, name: a.signer_name, signed_at: a.signed_at, amount: a.amount })),
    needs_approval: !b.approvals.some((a) => a.type === 'estimate'),
    open_supplements: b.supplements.filter((s) => s.status === 'submitted' && job.pay_type !== 'insurance').map((s) => ({ number: s.number, amount: s.amount, reason: s.reason })),
    photos: b.files.filter((f) => f.customer_visible && f.category !== 'document').map((f) => ({ id: f.id, kind: f.kind, caption: f.caption, type: f.content_type })),
    messages: b.messages.filter((m) => m.channel !== 'internal').slice(0, 30).map((m) => ({ body: m.body, created: m.created, direction: m.direction })),
    balance: b.balance, customer_balance: r2(custOwed - custPaid), customer_paid: r2(custPaid),
    invoices: liveInv.map((i) => ({ number: i.number, total: i.total, customer_portion: i.customer_portion, insurer_portion: i.insurer_portion, deductible: i.deductible, status: i.status, created: i.created })),
    payments: b.payments.filter((p) => p.payer !== 'insurer').map((p) => ({ amount: p.amount, method: p.method, received_at: p.received_at })),
    delivered: ['delivered', 'closed', 'completed'].includes(job.status), approved: ['approved', 'scheduled', 'in_production', 'delivered', 'closed', 'completed'].includes(job.status) || b.approvals.some((a) => a.type === 'estimate'),
    review_link: review?.value || '', reviewed: b.reviews.some((r) => r.rating),
  });
}, { public: true });
R.get('/api/portal/:token/file/:fid', async (c) => {
  const job = await portalJob(c.env, c.params.token);
  const f = await c.db.prepare('SELECT * FROM files WHERE id=? AND job_id=? AND customer_visible=1').bind(Number(c.params.fid), job.id).first();
  if (!f) throw notFound();
  return fileResponse(c.env, f, c.req);
}, { public: true });
R.get('/api/portal/:token/pdf', async (c) => {
  const job = await portalJob(c.env, c.params.token);
  const { bytes, name } = await pdfFor(fakeCtx(c.env, c.url, c.req, job), job.id, Object.fromEntries(c.url.searchParams));
  return new Response(bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"`, 'Cache-Control': 'no-store' } });
}, { public: true });
R.post('/api/portal/:token/approve', async (c) => {
  const job = await portalJob(c.env, c.params.token);
  const b = c.body;
  if (!b.name || String(b.name).trim().length < 2) throw bad('Type your full name');
  if (!b.signature || !String(b.signature).startsWith('data:image/png;base64,')) throw bad('Please sign in the box');
  const raw = atob(String(b.signature).split(',')[1]);
  if (raw.length > 400000) throw bad('Signature image too large');
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const fid = await saveFile(c.env, { job_id: job.id, location_id: job.location_id, category: 'photo', kind: 'signature', name: 'signature.png', content_type: 'image/png', created_by: 'customer' }, bytes.buffer);
  const bundle = await jobBundle(fakeCtx(c.env, c.url, c.req, job), job.id);
  const type = b.type === 'supplement' ? 'supplement' : 'estimate';
  const amount = type === 'supplement' ? num(bundle.supplements.find((s) => s.number === num(b.supplement))?.amount) : bundle.totals.total;
  await c.db.prepare('INSERT INTO approvals (job_id,type,supplement_id,signer_name,signature_file_id,ip,user_agent,amount) VALUES (?,?,?,?,?,?,?,?)').bind(job.id, type, type === 'supplement' ? num(b.supplement) : null, String(b.name).slice(0, 100), fid, c.req.headers.get('CF-Connecting-IP') || '', (c.req.headers.get('User-Agent') || '').slice(0, 200), amount).run();
  if (type === 'estimate' && job.status === 'estimate') await c.db.prepare("UPDATE jobs SET status='approved', approved_at=?, approved_by=? WHERE id=?").bind(nowIso(), 'customer: ' + String(b.name).slice(0, 80), job.id).run();
  if (type === 'supplement') await c.db.prepare("UPDATE supplements SET status='approved', decided_at=?, decided_by=? WHERE job_id=? AND number=?").bind(nowIso(), 'customer: ' + b.name, job.id, num(b.supplement)).run();
  await c.db.prepare('INSERT INTO job_events (job_id,type,detail,user_name) VALUES (?,?,?,?)').bind(job.id, 'approval', `Customer ${b.name} signed the ${type} online ($${r2(amount)})`, 'customer').run();
  await c.db.prepare('INSERT INTO audit_log (user_name,location_id,action,entity,job_id,detail,ip) VALUES (?,?,?,?,?,?,?)').bind('customer', job.location_id, 'approve', type, job.id, b.name, c.req.headers.get('CF-Connecting-IP') || '').run();
  return json({ ok: true });
}, { public: true });
R.post('/api/portal/:token/message', async (c) => {
  const job = await portalJob(c.env, c.params.token);
  const isMultipart = c.body instanceof FormData;
  const body = String((isMultipart ? c.body.get('body') : c.body.body) || '').trim().slice(0, 1000);
  let attachmentId = null;
  let attachmentName = '';
  if (isMultipart) {
    const file = c.body.get('file');
    if (file && typeof file !== 'string') {
      const ct = file.type || 'application/octet-stream';
      const okType = /^(image\/(jpeg|png|webp|gif|heic|heif)|video\/(mp4|webm|quicktime)|application\/pdf|text\/(plain|csv|xml)|application\/xml)$/.test(ct);
      if (!okType) throw bad('File type not allowed: ' + ct);
      attachmentName = (file.name || 'attachment').slice(0, 120);
      attachmentId = await saveFile(c.env, {
        job_id: job.id,
        location_id: job.location_id,
        category: ct.startsWith('video/') ? 'video' : ct.startsWith('image/') ? 'photo' : 'document',
        kind: 'portal_message',
        name: attachmentName,
        content_type: ct,
        customer_visible: 1,
        created_by: 'customer',
      }, await file.arrayBuffer());
    }
  }
  if (!body && !attachmentId) throw bad('Type a message or attach a file');
  const messageBody = body || 'Sent an attachment';
  const storedBody = attachmentId ? `${messageBody}\n[Attachment:${attachmentId}:${encodeURIComponent(attachmentName)}]` : messageBody;
  await c.db.prepare("INSERT INTO messages (job_id,customer_id,direction,channel,to_addr,body,status) VALUES (?,?, 'in','portal','shop',?, 'received')").bind(job.id, job.customer_id, storedBody).run();
  await c.db.prepare('INSERT INTO job_events (job_id,type,detail,user_name) VALUES (?,?,?,?)').bind(job.id, 'message', (attachmentId ? 'Customer attachment: ' + attachmentName : 'Customer message: ') + (body ? body.slice(0, 120) : ''), 'customer').run();
  return json({ ok: true });
}, { public: true });
R.post('/api/portal/:token/review', async (c) => {
  const job = await portalJob(c.env, c.params.token);
  const rating = Math.round(num(c.body.rating));
  if (rating < 1 || rating > 5) throw bad('Pick 1 to 5 stars');
  const open = await c.db.prepare('SELECT id FROM reviews WHERE job_id=? AND rating IS NULL ORDER BY id DESC').bind(job.id).first();
  if (open) await c.db.prepare('UPDATE reviews SET rating=?, comment=?, responded_at=? WHERE id=?').bind(rating, String(c.body.comment || '').slice(0, 1000), nowIso(), open.id).run();
  else await c.db.prepare('INSERT INTO reviews (job_id,rating,comment,responded_at) VALUES (?,?,?,?)').bind(job.id, rating, String(c.body.comment || '').slice(0, 1000), nowIso()).run();
  await c.db.prepare('UPDATE jobs SET csi_score=? WHERE id=?').bind(rating, job.id).run();
  await c.db.prepare('INSERT INTO job_events (job_id,type,detail,user_name) VALUES (?,?,?,?)').bind(job.id, 'review', `Customer rated ${rating}/5`, 'customer').run();
  return json({ ok: true });
}, { public: true });

// Share link: /s/<token> serves the PDF directly
async function shareLink(env, url, req, token) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) throw notFound();
  const s = await env.DB.prepare("SELECT * FROM share_links WHERE token=? AND expires > datetime('now')").bind(token).first();
  if (!s) throw notFound('This link has expired or does not exist');
  const job = await env.DB.prepare('SELECT * FROM jobs WHERE id=?').bind(s.job_id).first();
  const { bytes, name } = await pdfFor(fakeCtx(env, url, req, job), job.id, { kind: s.kind, supp: s.supp });
  return new Response(bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"`, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

// ---------- Setup / seed ----------
R.post('/api/setup/seed', async (c) => {
  const users = await c.db.prepare('SELECT COUNT(*) n FROM users').first();
  if (users.n > 0 && !(c.user && c.user.role === 'owner')) throw forbidden('Already set up');
  if (!c.env.SETUP_TOKEN || c.req.headers.get('X-Setup-Token') !== c.env.SETUP_TOKEN) throw forbidden('Setup token required');
  const out = await seedDatabase(c.env, c.body || {});
  return json(out);
}, { public: true });

R.get('/api/health', async (c) => json({ ok: true, time: nowIso(), ai: !!c.env.AI, r2: !!c.env.FILES }), { public: true });

registerJobs(R);
registerOps(R);
registerMoney(R);
registerOwner(R);
registerMsgs(R);
registerScreens2(R);
partsRoutes(R);

// ---------- Entry ----------
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/api/')) {
        // CSRF: browsers must send same-origin for state-changing requests
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const origin = req.headers.get('Origin');
          if (origin && origin !== url.origin && !origin.startsWith('capacitor://') && origin !== 'http://localhost' && origin !== 'https://localhost') throw forbidden('Cross-site request blocked');
        }
        const m = R.match(req.method, url.pathname);
        if (!m) throw notFound('No such endpoint');
        let user = null, apiKey = null;
        if (m.route.opts.apiKey) { apiKey = await getApiKey(env, req); if (!apiKey) throw new HttpError(401, 'API key required'); }
        else { user = await getSessionUser(env, req); if (!user && !m.route.opts.public) throw new HttpError(401, 'Please sign in'); }
        const body = req.method === 'GET' ? {} : (m.route.opts.raw ? { _raw: await req.text() } : await readBody(req));
        const c = makeCtx(req, env, url, m.params, user, body);
        c.apiKey = apiKey;
        // Idempotency: the app's offline outbox and retries send X-Idempotency-Key; the same key gets the saved reply
        // instead of doing the change twice. Best effort: if the table is missing, requests still work normally.
        const idem = req.method !== 'GET' && user ? (req.headers.get('X-Idempotency-Key') || '').slice(0, 80) : '';
        if (idem) {
          try {
            const prev = await env.DB.prepare('SELECT status, body FROM idem_keys WHERE k=? AND user_id=?').bind(idem, user.id).first();
            if (prev) return securityHeaders(new Response(prev.body, { status: prev.status, headers: { 'Content-Type': 'application/json', 'X-Idempotent-Replay': '1' } }));
          } catch (e) { /* table not created yet */ }
        }
        const res = await m.route.handler(c);
        if (idem && res.status < 500 && (res.headers.get('content-type') || '').includes('json')) {
          try {
            const txt = await res.clone().text();
            if (txt.length < 200000) await env.DB.prepare('INSERT OR IGNORE INTO idem_keys (k, user_id, status, body) VALUES (?,?,?,?)').bind(idem, user.id, res.status, txt).run();
            if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM idem_keys WHERE created < datetime('now','-14 days')").run();
          } catch (e) { /* best effort */ }
        }
        return securityHeaders(res);
      }
      if (url.pathname.startsWith('/s/')) return securityHeaders(await shareLink(env, url, req, url.pathname.slice(3)));
      // Static app (SPA) + portal page
      if (url.pathname.startsWith('/p/')) return securityHeaders(await env.ASSETS.fetch(new Request(new URL('/portal', url), req)), true);
      const res = await env.ASSETS.fetch(req);
      if (res.status === 404 && !url.pathname.includes('.')) return securityHeaders(await env.ASSETS.fetch(new Request(new URL('/index.html', url), req)), true);
      return securityHeaders(res, true);
    } catch (e) {
      if (e instanceof HttpError) return securityHeaders(json({ error: e.message }, e.status));
      console.error(e && e.stack || e);
      return securityHeaders(json({ error: 'Server error: ' + String(e.message || e).slice(0, 200) }, 500));
    }
  },
  // Daily: re-check parts ETAs and move schedules; clean expired sessions
  async scheduled(event, env, ctx) {
    const jobs = (await env.DB.prepare("SELECT DISTINCT job_id FROM parts WHERE status IN ('ordered','shipped','backordered') AND eta IS NOT NULL").all()).results;
    for (const j of jobs) { try { await rescheduleForParts(env, j.job_id, 'daily check'); } catch (e) { console.error(e); } }
    await env.DB.prepare("DELETE FROM sessions WHERE expires < ?").bind(nowIso()).run();
    await env.DB.prepare("DELETE FROM share_links WHERE expires < datetime('now')").run();
  },
};
