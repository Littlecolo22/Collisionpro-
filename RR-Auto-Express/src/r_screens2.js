// Owner-only routes for screens built Nov 15: customer portal admin (+ later screens).
import { json, bad, notFound, nowIso, randomToken } from './util.js';
import { ownerOnly } from './r_msgs.js';
import { sendCustomerMessage, portalUrl } from './r_ops.js';
import { insertRow, updateRow } from './core.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => Number(v) || 0;
const dateOk = (s) => !s || /^\d{4}-\d{2}-\d{2}/.test(String(s));
const CLOSED_SQL = "('delivered','closed','completed','total_loss','lost','void')";
async function own(c, table, id) { const r = await c.db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first(); if (!r) throw notFound('Not found'); return r; }

export function registerScreens2(R) {
  // ---------- Customer portal admin ----------
  R.get('/api/portal-admin', async (c) => {
    ownerOnly(c);
    const rows = (await c.db.prepare(`SELECT j.id, j.number, j.status, j.stage, j.portal_token, j.portal_viewed_at, j.portal_off, j.updated,
        c.name AS customer_name, c.phone, c.email, v.year, v.make, v.model,
        (SELECT COUNT(*) FROM approvals a WHERE a.job_id=j.id AND a.type='estimate') AS signed,
        (SELECT COUNT(*) FROM files f WHERE f.job_id=j.id AND f.customer_visible=1 AND f.category<>'document') AS shared_photos,
        (SELECT COALESCE(SUM(COALESCE(customer_portion,total)),0) FROM invoices i WHERE i.job_id=j.id AND i.status<>'void') -
        (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.job_id=j.id AND p.payer<>'insurer') AS cust_balance
      FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN vehicles v ON v.id=j.vehicle_id
      ORDER BY j.id DESC LIMIT 300`).all()).results;
    rows.forEach((r) => { r.url = r.portal_token ? `${c.url.origin}/p/${r.portal_token}` : null; delete r.portal_token; });
    return json({ jobs: rows });
  });

  R.get('/api/portal-admin/:id', async (c) => {
    ownerOnly(c);
    const j = await c.db.prepare(`SELECT j.id, j.number, j.status, j.stage, j.portal_token, j.portal_viewed_at, j.portal_off, c.name AS customer_name, c.phone, c.email, c.sms_opt_in, v.year, v.make, v.model
      FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN vehicles v ON v.id=j.vehicle_id WHERE j.id=?`).bind(c.id()).first();
    if (!j) throw notFound('Job not found');
    if (!j.portal_token) { j.portal_token = randomToken(12); await c.db.prepare('UPDATE jobs SET portal_token=? WHERE id=?').bind(j.portal_token, j.id).run(); }
    const photos = (await c.db.prepare("SELECT id, kind, caption, content_type, customer_visible, created FROM files WHERE job_id=? AND category<>'document' AND kind<>'signature' AND content_type LIKE 'image/%' ORDER BY id DESC LIMIT 200").bind(j.id).all()).results;
    j.url = `${c.url.origin}/p/${j.portal_token}`; delete j.portal_token;
    return json({ job: j, photos });
  });

  R.post('/api/portal-admin/:id/rotate', async (c) => {
    ownerOnly(c);
    const job = await c.db.prepare('SELECT id FROM jobs WHERE id=?').bind(c.id()).first();
    if (!job) throw notFound('Job not found');
    const t = randomToken(12);
    await c.db.prepare('UPDATE jobs SET portal_token=?, portal_off=0, portal_viewed_at=NULL WHERE id=?').bind(t, job.id).run();
    await c.db.prepare('INSERT INTO job_events (job_id,type,detail,user_name) VALUES (?,?,?,?)').bind(job.id, 'portal', 'New customer link made; the old link stopped working', c.user.name || 'owner').run();
    return json({ ok: true, url: `${c.url.origin}/p/${t}` });
  });

  R.put('/api/portal-admin/:id', async (c) => {
    ownerOnly(c);
    const off = c.body.off ? 1 : 0;
    const r = await c.db.prepare('UPDATE jobs SET portal_off=? WHERE id=?').bind(off, c.id()).run();
    if (!r.meta?.changes) throw notFound('Job not found');
    return json({ ok: true, off });
  });

  R.post('/api/portal-admin/:id/send', async (c) => {
    ownerOnly(c);
    const job = await c.db.prepare('SELECT * FROM jobs WHERE id=?').bind(c.id()).first();
    if (!job) throw notFound('Job not found');
    if (job.portal_off) throw bad('Turn the link on first');
    const cust = await c.db.prepare('SELECT name, phone FROM customers WHERE id=?').bind(job.customer_id).first();
    if (!cust?.phone) throw bad('This customer has no phone number');
    const shop = (await c.db.prepare("SELECT value FROM settings WHERE key='shop_name'").first())?.value || 'our shop';
    const body = String(c.body.body || '').trim() || `Hi ${(cust.name || '').split(' ')[0] || 'there'}, here's your repair page from ${shop}. You can check the status, see photos, approve the estimate and see your balance: ${portalUrl(c, job)}`;
    const m = await sendCustomerMessage(c, job, { channel: 'sms', body: body.slice(0, 1500), subject: 'Your repair page' });
    return json({ message: m, phone: cust.phone, body });
  });

  // ---------- Schedule: drop-offs, pickups, target dates ----------
  R.get('/api/sched', async (c) => {
    ownerOnly(c);
    const from = c.q('from') || new Date().toISOString().slice(0, 10);
    const to = c.q('to') || new Date(Date.now() + 13 * 864e5).toISOString().slice(0, 10);
    if (!dateOk(from) || !dateOk(to)) throw bad('Bad date');
    const jobs = (await c.db.prepare(`SELECT j.id, j.number, j.status, j.stage, j.drop_off_at, j.target_date, j.promised_date, j.delivered_at, c.name AS customer_name, c.phone, v.year, v.make, v.model
      FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN vehicles v ON v.id=j.vehicle_id
      WHERE (substr(j.drop_off_at,1,10) BETWEEN ?1 AND ?2) OR (substr(j.target_date,1,10) BETWEEN ?1 AND ?2) OR (substr(j.promised_date,1,10) BETWEEN ?1 AND ?2) OR (substr(j.delivered_at,1,10) BETWEEN ?1 AND ?2)
         OR (j.status NOT IN ${CLOSED_SQL} AND COALESCE(j.target_date,j.promised_date) IS NOT NULL AND substr(COALESCE(j.target_date,j.promised_date),1,10) < ?1)
      ORDER BY j.id DESC LIMIT 500`).bind(from, to).all()).results;
    const events = (await c.db.prepare(`SELECT s.*, j.number, c.name AS customer_name, v.year, v.make, v.model FROM schedule_events s LEFT JOIN jobs j ON j.id=s.job_id LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN vehicles v ON v.id=j.vehicle_id
      WHERE substr(s.start,1,10) BETWEEN ? AND ? ORDER BY s.start`).bind(from, to).all()).results;
    const unscheduled = (await c.db.prepare(`SELECT j.id, j.number, j.status, c.name AS customer_name, v.year, v.make, v.model FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN vehicles v ON v.id=j.vehicle_id
      WHERE j.status NOT IN ${CLOSED_SQL} AND j.drop_off_at IS NULL AND j.target_date IS NULL AND j.promised_date IS NULL ORDER BY j.id DESC LIMIT 100`).all()).results;
    return json({ from, to, jobs, events, unscheduled });
  });
  R.put('/api/sched/job/:id', async (c) => {
    ownerOnly(c);
    const job = await own(c, 'jobs', c.id());
    const set = {}; for (const k of ['drop_off_at', 'target_date', 'promised_date']) if (k in c.body) { const v = c.body[k] || null; if (v && !dateOk(v)) throw bad('Bad date'); set[k] = v; }
    if (!Object.keys(set).length) throw bad('Nothing to change');
    await c.db.prepare(`UPDATE jobs SET ${Object.keys(set).map((k) => k + '=?').join(',')}, updated=datetime('now') WHERE id=?`).bind(...Object.values(set), job.id).run();
    await c.db.prepare('INSERT INTO job_events (job_id,type,detail,user_name) VALUES (?,?,?,?)').bind(job.id, 'schedule', Object.entries(set).map(([k, v]) => `${k.replace(/_at$|_date$/, '').replace('_', ' ')}: ${v || 'cleared'}`).join(', '), c.user.name || 'owner').run();
    return json({ ok: true });
  });
  const EVT = ['job_id', 'type', 'title', 'start', 'end', 'notes'];
  R.post('/api/sched/events', async (c) => {
    ownerOnly(c);
    if (!dateOk(c.body.start) || !c.body.start) throw bad('Pick a date and time');
    if (!c.body.title && !c.body.job_id) throw bad('Add a title or pick a job');
    const id = await insertRow(c.env, 'schedule_events', { ...c.body, location_id: c.loc || 1 }, [...EVT, 'location_id']);
    return json({ id });
  });
  R.put('/api/sched/events/:id', async (c) => { ownerOnly(c); await own(c, 'schedule_events', c.id()); await updateRow(c.env, 'schedule_events', c.id(), c.body, EVT); return json({ ok: true }); });
  R.del('/api/sched/events/:id', async (c) => { ownerOnly(c); await c.db.prepare('DELETE FROM schedule_events WHERE id=?').bind(c.id()).run(); return json({ ok: true }); });

  // ---------- Parts: ordered / received / returned per job, vendors, costs ----------
  const PART = ['job_id', 'part_no', 'description', 'part_type', 'qty', 'list_price', 'cost', 'sell_price', 'vendor_id', 'status', 'eta', 'ordered_at', 'received_at', 'condition', 'core_charge', 'core_returned', 'return_reason', 'credit_amount', 'credit_status', 'notes'];
  const PST = ['needed', 'ordered', 'backordered', 'received', 'installed', 'returned'];
  R.get('/api/parts2', async (c) => {
    ownerOnly(c);
    const rows = (await c.db.prepare(`SELECT p.*, v.name AS vendor_name, j.number, j.status AS job_status, c.name AS customer_name, vh.year, vh.make, vh.model
      FROM parts p LEFT JOIN vendors v ON v.id=p.vendor_id LEFT JOIN jobs j ON j.id=p.job_id LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN vehicles vh ON vh.id=j.vehicle_id
      ORDER BY (p.status IN ('installed','returned')), p.job_id DESC, p.id LIMIT 2000`).all()).results;
    const vendors = (await c.db.prepare('SELECT * FROM vendors ORDER BY name').all()).results;
    const jobs = (await c.db.prepare(`SELECT j.id, j.number, c.name AS customer_name, v.year, v.make, v.model FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN vehicles v ON v.id=j.vehicle_id WHERE j.status NOT IN ${CLOSED_SQL} ORDER BY j.id DESC LIMIT 300`).all()).results;
    return json({ parts: rows, vendors, jobs });
  });
  const partFix = (b, prev = {}) => {
    const o = { ...b };
    if ('status' in o && !PST.includes(o.status)) throw bad('Unknown part status');
    for (const k of ['qty', 'list_price', 'cost', 'sell_price', 'core_charge', 'credit_amount']) if (k in o) { o[k] = num(o[k]); if (o[k] < 0) throw bad('Amounts can\'t be negative'); }
    for (const k of ['eta', 'ordered_at', 'received_at']) if (o[k] && !dateOk(o[k])) throw bad('Bad date');
    const today = new Date().toISOString().slice(0, 10);
    if (o.status === 'ordered' && !prev.ordered_at && !o.ordered_at) o.ordered_at = today;
    if (o.status === 'received' && !prev.received_at && !o.received_at) o.received_at = today;
    if ('vendor_id' in o) o.vendor_id = o.vendor_id ? Number(o.vendor_id) : null;
    return o;
  };
  R.post('/api/parts2', async (c) => {
    ownerOnly(c);
    const b = partFix(c.body);
    if (!b.job_id) throw bad('Pick a job'); await own(c, 'jobs', b.job_id);
    if (!String(b.description || '').trim()) throw bad('Enter the part name');
    const id = await insertRow(c.env, 'parts', { status: 'needed', qty: 1, ...b }, PART);
    return json({ id });
  });
  R.put('/api/parts2/:id', async (c) => { ownerOnly(c); const prev = await own(c, 'parts', c.id()); await updateRow(c.env, 'parts', prev.id, partFix(c.body, prev), PART); return json({ ok: true }); });
  R.del('/api/parts2/:id', async (c) => { ownerOnly(c); await c.db.prepare('DELETE FROM parts WHERE id=?').bind(c.id()).run(); return json({ ok: true }); });
  const VEND = ['name', 'type', 'contact', 'email', 'phone', 'account_no', 'discount_pct', 'notes'];
  R.post('/api/vendors2', async (c) => { ownerOnly(c); if (!String(c.body.name || '').trim()) throw bad('Enter the vendor name'); return json({ id: await insertRow(c.env, 'vendors', c.body, VEND) }); });
  R.put('/api/vendors2/:id', async (c) => { ownerOnly(c); await own(c, 'vendors', c.id()); await updateRow(c.env, 'vendors', c.id(), c.body, VEND); return json({ ok: true }); });
  R.del('/api/vendors2/:id', async (c) => { ownerOnly(c); const n = (await c.db.prepare('SELECT COUNT(*) n FROM parts WHERE vendor_id=?').bind(c.id()).first()).n; if (n) throw bad(`This vendor is on ${n} part${n === 1 ? '' : 's'}; change those first`); await c.db.prepare('DELETE FROM vendors WHERE id=?').bind(c.id()).run(); return json({ ok: true }); });
}
