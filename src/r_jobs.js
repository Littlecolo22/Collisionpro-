// Customers, vehicles, VIN, jobs, estimate lines, supplements, AI estimate, photos/files, catalog.
import { json, bad, notFound, HttpError, r2, num, nowIso, today, addDays, randomToken, parseJsonCol, vinValid } from './util.js';
import { computeTotals, detectAdas, grossProfit, decodeVin, aiVision, extractJson, damagePrompt, lineFromCatalog, BLEND_NEIGHBORS, STAGES, STAGE_KEYS } from './logic.js';
import { nextNumber, updateRow, insertRow } from './core.js';
import { model3dFrom } from './catalog.js';
import { digits10 } from './sms.js';
import { saveFile, loadFileBytes, fileResponse, deleteFile } from './files.js';

const CUST_COLS = ['name', 'phone', 'email', 'address', 'contact_pref', 'sms_opt_in', 'notes'];
const VEH_COLS = ['customer_id', 'vin', 'year', 'make', 'model', 'trim', 'body', 'engine', 'color', 'paint_code', 'odometer', 'plate', 'acv', 'adas', 'vin_data'];
const JOB_COLS = ['insurer_id', 'claim_no', 'policy_no', 'adjuster', 'adjuster_email', 'deductible', 'loss_date', 'loss_type', 'point_of_impact', 'pay_type', 'status', 'drp_status', 'source', 'priority', 'estimator_id', 'drop_off_at', 'target_date', 'promised_date', 'key_in_at', 'repair_start_at', 'completed_at', 'delivered_at', 'blueprint_status', 'pre_scan_status', 'post_scan_status', 'comeback', 'csi_score', 'notes', 'total_loss'];
const LINE_COLS = ['supplement_no', 'line_no', 'area', 'operation', 'description', 'part_type', 'part_no', 'qty', 'unit_price', 'part_cost', 'labor_type', 'labor_hours', 'teardown_hours', 'refinish_hours', 'sublet_amount', 'not_included', 'p_page_ref', 'oem_proc_ref', 'adas_flag', 'notes', 'source', 'ai_confidence', 'reviewed', 'catalog_key', 'labor_overlap', 'refinish_overlap', 'incl', 'judgment', 'markup_pct', 'discount_pct', 'betterment_pct', 'taxable', 'paint_stage'];
const OPS = ['replace', 'repair', 'r&i', 'refinish', 'blend', 'sublet', 'misc', 'o/h', 'align', 'add_labor', 'add_cost'];
const LTYPES = ['body', 'refinish', 'frame', 'structural', 'mech', 'glass'];

// ---------- customer contact details ----------
// Phones are stored in one form so Messages can match incoming texts (it compares the last 10 digits):
// US/Canada numbers as "(555) 123-4567", other countries as "+<country><number>".
export function normPhone(p) {
  const s = String(p ?? '').trim();
  if (!s) return null;
  if (/[a-z]/i.test(s.replace(/\s*(x|ext\.?)\s*\d+$/i, ''))) throw bad('Enter the phone number with digits only');
  const main = s.replace(/\s*(x|ext\.?)\s*\d+$/i, '');
  let d = main.replace(/\D/g, '');
  if (main.startsWith('+') && !main.startsWith('+1')) {
    if (d.length < 8 || d.length > 15) throw bad('Enter a valid phone number');
    return '+' + d;
  }
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length !== 10) throw bad('Enter a 10-digit phone number, like (555) 123-4567');
  if (/^[01]/.test(d)) throw bad('That phone number is not valid (area codes cannot start with 0 or 1)');
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
export function normEmail(e) {
  const s = String(e ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s.length > 120 || !/^[^\s@,;<>()]+@[^\s@,;<>()]+\.[a-z]{2,}$/.test(s) || s.includes('..')) throw bad('Enter a valid email, like name@example.com');
  return s;
}
const PREFS = { sms: 'sms', text: 'sms', call: 'call', phone: 'call', email: 'email' };
export function cleanCustomer(b, { create = false, before = null } = {}) {
  const out = {};
  const has = (k) => b && Object.prototype.hasOwnProperty.call(b, k);
  if (create || has('name')) {
    const n = String(b?.name ?? '').replace(/\s+/g, ' ').trim();
    if (!n) throw bad('Customer name is required');
    if (n.length > 120) throw bad('Name is too long');
    out.name = n;
  }
  if (has('phone')) out.phone = normPhone(b.phone);
  if (has('email')) out.email = normEmail(b.email);
  if (has('address')) { const a = String(b.address ?? '').trim(); if (a.length > 300) throw bad('Address is too long'); out.address = a || null; }
  if (has('notes')) { const t = String(b.notes ?? '').trim(); if (t.length > 2000) throw bad('Notes are too long (2000 characters max)'); out.notes = t || null; }
  if (has('contact_pref') && b.contact_pref !== null && b.contact_pref !== '') {
    const p = PREFS[String(b.contact_pref).toLowerCase()];
    if (!p) throw bad('Preferred contact must be text, call or email');
    out.contact_pref = p;
  }
  if (has('sms_opt_in')) out.sms_opt_in = [true, 1, '1', 'on', 'true', 'yes'].includes(b.sms_opt_in) ? 1 : 0;
  // The preferred way to reach them has to exist
  // Only checked when the preference is set or changed, so old records without a phone can still be edited
  const phone = has('phone') ? out.phone : before?.phone, email = has('email') ? out.email : before?.email;
  const prefSet = out.contact_pref && out.contact_pref !== before?.contact_pref;
  if (prefSet && (out.contact_pref === 'sms' || out.contact_pref === 'call') && !phone) throw bad(`Add a mobile phone number to ${out.contact_pref === 'sms' ? 'text' : 'call'} this customer, or pick email`);
  if (prefSet && out.contact_pref === 'email' && !email) throw bad('Add an email address, or pick text or call');
  return out;
}
async function customerFor(c, id) {
  const cu = await c.db.prepare('SELECT * FROM customers WHERE id=?').bind(id).first();
  if (!cu) throw notFound();
  const own = c.user?.location_id;
  if (own && cu.location_id && cu.location_id !== own) throw new HttpError(403, 'This customer belongs to another location');
  return cu;
}

export async function catalogFor(env, style) {
  const rows = await env.DB.prepare('SELECT * FROM catalog_parts ORDER BY id').all();
  return style ? rows.results.filter((r) => (r.styles || '').split(',').includes(style)) : rows.results;
}

export function bodyStyleOf(vehicle) {
  const vd = parseJsonCol(vehicle?.vin_data, {}) || {};
  if (vd.model3d?.family) return vd.model3d.family;
  if (vd.body_style) return vd.body_style;
  const b = String(vehicle?.body || '').toLowerCase();
  if (b.includes('pickup') || b.includes('truck')) return 'truck';
  if (b.includes('sport utility') || b.includes('suv') || b.includes('wagon') || b.includes('van') || b.includes('crossover')) return 'suv';
  if (b.includes('coupe') || b.includes('convertible')) return 'coupe';
  return 'sedan';
}

export async function jobBundle(ctx, id, { full = true } = {}) {
  const env = ctx.env;
  const job = await ctx.job(id);
  const q = (sql, ...a) => env.DB.prepare(sql).bind(...a);
  const [cust, veh, ins, loc, lines, supps, files, tasks, time, sublets, parts, quotes, sched, rentals, msgs, approvals, invoices, payments, adas, scans, welds, docs, events, usage, reviews, est] = (await env.DB.batch([
    q('SELECT * FROM customers WHERE id=?', job.customer_id || 0), q('SELECT * FROM vehicles WHERE id=?', job.vehicle_id || 0), q('SELECT * FROM insurers WHERE id=?', job.insurer_id || 0),
    q('SELECT * FROM locations WHERE id=?', job.location_id), q('SELECT * FROM estimate_lines WHERE job_id=? ORDER BY supplement_no, line_no, id', id), q('SELECT * FROM supplements WHERE job_id=? ORDER BY number', id),
    q('SELECT id,category,kind,name,content_type,size,caption,annotations,parent_id,supplement_id,ai_result,customer_visible,created_by,created FROM files WHERE job_id=? ORDER BY id', id),
    q('SELECT t.*, u.name AS tech_name FROM ro_tasks t LEFT JOIN users u ON u.id=t.tech_id WHERE job_id=? ORDER BY t.id', id), q('SELECT e.*, u.name AS tech_name FROM time_entries e LEFT JOIN users u ON u.id=e.tech_id WHERE job_id=? ORDER BY e.id', id),
    q('SELECT * FROM sublets WHERE job_id=? ORDER BY id', id), q('SELECT p.*, v.name AS vendor_name FROM parts p LEFT JOIN vendors v ON v.id=p.vendor_id WHERE job_id=? ORDER BY p.id', id),
    q('SELECT pq.*, v.name AS vendor_name FROM part_quotes pq JOIN parts p ON p.id=pq.part_id LEFT JOIN vendors v ON v.id=pq.vendor_id WHERE p.job_id=? ORDER BY pq.part_id, pq.price', id),
    q('SELECT * FROM schedule_events WHERE job_id=? ORDER BY start', id), q('SELECT * FROM rentals WHERE job_id=? ORDER BY id', id), q('SELECT * FROM messages WHERE job_id=? ORDER BY id DESC LIMIT 100', id),
    q('SELECT * FROM approvals WHERE job_id=? ORDER BY id', id), q('SELECT * FROM invoices WHERE job_id=? ORDER BY id', id), q('SELECT * FROM payments WHERE job_id=? ORDER BY id', id),
    q('SELECT * FROM adas_items WHERE job_id=? ORDER BY id', id), q('SELECT * FROM scans WHERE job_id=? ORDER BY id', id), q('SELECT * FROM weld_records WHERE job_id=? ORDER BY id', id),
    q('SELECT jd.*, d.title, d.type, d.url, d.summary, d.make FROM job_docs jd JOIN oem_docs d ON d.id=jd.oem_doc_id WHERE jd.job_id=? ORDER BY jd.id', id),
    q('SELECT * FROM job_events WHERE job_id=? ORDER BY id DESC LIMIT 200', id), q('SELECT pu.*, pi.name AS item_name, pi.unit FROM paint_usage pu LEFT JOIN paint_inventory pi ON pi.id=pu.inventory_id WHERE job_id=? ORDER BY pu.id', id),
    q('SELECT * FROM reviews WHERE job_id=? ORDER BY id', id), q('SELECT id,name FROM users WHERE id=?', job.estimator_id || 0),
  ])).map((r) => r.results);
  const vehicle = veh[0] || null;
  const totals = computeTotals(lines, { loc: loc[0], insurer: ins[0], job, vehicle });
  const original = computeTotals(lines, { loc: loc[0], insurer: ins[0], job, vehicle, upTo: 0 });
  const techIds = [...new Set(tasks.map((t) => t.tech_id).filter(Boolean))];
  const techs = {};
  if (techIds.length) {
    const tr = await env.DB.prepare(`SELECT id,name,pay_type,pay_rate FROM users WHERE id IN (${techIds.map(() => '?').join(',')})`).bind(...techIds).all();
    for (const t of tr.results) techs[t.id] = t;
  }
  const gp = ctx.can('accounting.read') ? grossProfit(totals, { parts, tasks, techs, time, usage, sublets }) : null;
  const paid = payments.reduce((a, p) => a + num(p.amount), 0);
  const out = {
    job, customer: cust[0] || null, vehicle, insurer: ins[0] || null, location: loc[0], estimator: est[0] || null,
    body_style: bodyStyleOf(vehicle),
    model3d: vehicle ? model3dFrom({ ...(parseJsonCol(vehicle.vin_data, {}) || {}), body: (parseJsonCol(vehicle.vin_data, {}) || {}).body || vehicle.body, model: vehicle.model, make: (parseJsonCol(vehicle.vin_data, {}) || {}).make || vehicle.make }) : null,
    lines, totals, original_total: original.total, supplements: supps, files, tasks, time, sublets, parts, quotes, schedule: sched, rentals,
    messages: msgs, approvals, invoices, payments, paid: r2(paid), balance: r2(invoices.reduce((a, i) => a + num(i.total), 0) - paid),
    adas, adas_suggested: detectAdas(lines, vehicle), scans, welds, docs, events, paint_usage: usage, reviews, gp,
    paint_cost_actual: r2(usage.reduce((a, u) => a + num(u.cost), 0)),
    stages: STAGES,
  };
  if (!ctx.can('shop.read')) {
    // Employees: the estimate only. No shop rates, invoices, payments, pay or cost data.
    Object.assign(out, { location: loc[0] ? { id: loc[0].id, name: loc[0].name } : null, insurer: ins[0] ? { id: ins[0].id, name: ins[0].name } : null, time: [], invoices: [], payments: [], paid: 0, balance: 0, paint_usage: [], paint_cost_actual: 0, gp: null, quotes: [] });
    out.parts = parts.map((p) => { const { cost, vendor_cost, ...rest } = p; return rest; });
  }
  return out;
}

async function renumber(env, jobId) {
  const rows = (await env.DB.prepare('SELECT id FROM estimate_lines WHERE job_id=? ORDER BY supplement_no, line_no, id').bind(jobId).all()).results;
  if (rows.length) await env.DB.batch(rows.map((r, i) => env.DB.prepare('UPDATE estimate_lines SET line_no=? WHERE id=?').bind(i + 1, r.id)));
}

async function currentSupplement(env, job) {
  // New lines go on the open (draft) supplement if one exists, else on the original estimate
  const s = await env.DB.prepare("SELECT number FROM supplements WHERE job_id=? AND status='draft' ORDER BY number DESC LIMIT 1").bind(job.id).first();
  return s ? s.number : 0;
}

function cleanLine(b) {
  const l = { ...b };
  if (l.operation && !OPS.includes(l.operation)) throw bad('Unknown operation ' + l.operation);
  if (l.labor_type && !LTYPES.includes(l.labor_type)) throw bad('Unknown labor type ' + l.labor_type);
  for (const k of ['qty', 'unit_price', 'part_cost', 'labor_hours', 'teardown_hours', 'refinish_hours', 'sublet_amount', 'labor_overlap', 'refinish_overlap', 'betterment_pct']) if (l[k] !== undefined && l[k] !== null && l[k] !== '') { l[k] = Number(l[k]); if (isNaN(l[k]) || l[k] < 0 || l[k] > 1e6) throw bad('Invalid ' + k); }
  for (const k of ['markup_pct', 'discount_pct']) if (l[k] !== undefined) { if (l[k] === '' || l[k] === null) l[k] = null; else { l[k] = Number(l[k]); if (isNaN(l[k]) || l[k] < -100 || l[k] > 500) throw bad('Invalid ' + k); } }
  if (l.betterment_pct > 100) throw bad('Betterment cannot be over 100%');
  for (const k of ['incl', 'judgment', 'taxable', 'not_included', 'reviewed']) if (l[k] !== undefined) l[k] = l[k] === true || l[k] === 1 || l[k] === '1' || l[k] === 'on' ? 1 : 0;
  if (l.paint_stage !== undefined && !['', '2stage', '3stage', '2tone', null].includes(l.paint_stage)) throw bad('Unknown paint stage');
  if (l.description !== undefined) l.description = String(l.description || '').slice(0, 200);
  return l;
}

export function registerJobs(R) {
  // ---------- Customers & vehicles ----------
  R.get('/api/customers', async (c) => {
    c.need('jobs.read');
    const raw = String(c.q('q', '') || '').trim();
    const q = `%${raw}%`;
    const dg = raw.replace(/\D/g, '');
    const lf = c.locFilter('c');
    // Phone search ignores formatting: "5551234567" finds "(555) 123-4567"
    const phoneDigits = "replace(replace(replace(replace(replace(replace(coalesce(phone,''),'(',''),')',''),' ',''),'-',''),'+',''),'.','')";
    const r = await c.db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM jobs j WHERE j.customer_id=c.id) AS jobs FROM customers c WHERE (name LIKE ? OR phone LIKE ? OR email LIKE ?${dg.length >= 3 ? ` OR ${phoneDigits} LIKE ?` : ''})${lf.sql} ORDER BY c.id DESC LIMIT 100`).bind(q, q, q, ...(dg.length >= 3 ? [`%${dg}%`] : []), ...lf.args).all();
    return json(r.results);
  });
  R.get('/api/customers/:id', async (c) => {
    c.need('jobs.read');
    const cu = await customerFor(c, c.id());
    const v = await c.db.prepare('SELECT * FROM vehicles WHERE customer_id=? ORDER BY id DESC').bind(cu.id).all();
    const j = await c.db.prepare('SELECT id,number,status,stage,created FROM jobs WHERE customer_id=? ORDER BY id DESC').bind(cu.id).all();
    return json({ ...cu, vehicles: v.results, jobs: j.results });
  });
  R.post('/api/customers', async (c) => {
    c.need('jobs.write');
    const d = cleanCustomer(c.body, { create: true });
    const id = await insertRow(c.env, 'customers', { ...d, location_id: c.loc || c.user?.location_id || 1 }, [...CUST_COLS, 'location_id']);
    await c.audit('create', 'customer', id, null, { name: d.name, phone: d.phone || null, email: d.email || null });
    return json({ id, customer: await c.db.prepare('SELECT * FROM customers WHERE id=?').bind(id).first() });
  });
  // Owners and employees (jobs.write) may edit contact details, only for customers of their own shop/location.
  R.put('/api/customers/:id', async (c) => {
    c.need('jobs.write');
    const before = await customerFor(c, c.id());
    const d = cleanCustomer(c.body, { before });
    const changed = {};
    for (const k of Object.keys(d)) if (String(d[k] ?? '') !== String(before[k] ?? '')) changed[k] = [before[k] ?? null, d[k] ?? null];
    if (Object.keys(changed).length) {
      await updateRow(c.env, 'customers', before.id, d, CUST_COLS);
      // Jobs, the estimate PDF and Messages threads read the customer row live, so they update by themselves.
      // Two places keep their own copy: an unpaid invoice billed to the customer by name, and incoming texts
      // that arrived from a number no customer had yet.
      if (changed.name) {
        const r = await c.db.prepare("UPDATE invoices SET bill_to=? WHERE bill_to=? AND status IN ('open','partial') AND job_id IN (SELECT id FROM jobs WHERE customer_id=?)").bind(d.name, before.name, before.id).run();
        if (r.meta?.changes) changed.invoices_renamed = r.meta.changes;
      }
      if (changed.phone && d.phone) {
        const want = digits10(d.phone);
        const un = (await c.db.prepare("SELECT id, from_addr FROM messages WHERE job_id IS NULL AND direction='in' ORDER BY id DESC LIMIT 500").all()).results.filter((m) => digits10(m.from_addr) === want);
        if (un.length) {
          const j = await c.db.prepare("SELECT id FROM jobs WHERE customer_id=? ORDER BY (status IN ('closed','delivered')), id DESC LIMIT 1").bind(before.id).first();
          for (const m of un) await c.db.prepare('UPDATE messages SET customer_id=?, job_id=? WHERE id=?').bind(before.id, j?.id || null, m.id).run();
          changed.texts_linked = un.length;
        }
      }
      // Notes can be long/private: log that they changed, not their text
      if (changed.notes) changed.notes = '(changed)';
      await c.audit('update', 'customer', before.id, null, { name: d.name ?? before.name, changed });
    }
    const after = await c.db.prepare('SELECT * FROM customers WHERE id=?').bind(before.id).first();
    return json({ ok: true, changed: Object.keys(changed), customer: after });
  });
  R.post('/api/vehicles', async (c) => {
    c.need('jobs.write');
    const b = { ...c.body };
    if (b.vin) b.vin = String(b.vin).toUpperCase().trim();
    if (Array.isArray(b.adas)) b.adas = JSON.stringify(b.adas);
    if (b.vin_data && typeof b.vin_data === 'object') b.vin_data = JSON.stringify(b.vin_data);
    const id = await insertRow(c.env, 'vehicles', b, VEH_COLS);
    await c.audit('create', 'vehicle', id, null, `${b.year || ''} ${b.make || ''} ${b.model || ''} ${b.vin || ''}`);
    return json({ id });
  });
  R.put('/api/vehicles/:id', async (c) => {
    c.need('jobs.write');
    const b = { ...c.body };
    if (b.vin) b.vin = String(b.vin).toUpperCase().trim();
    if (Array.isArray(b.adas)) b.adas = JSON.stringify(b.adas);
    if (b.vin_data && typeof b.vin_data === 'object') b.vin_data = JSON.stringify(b.vin_data);
    await updateRow(c.env, 'vehicles', c.id(), b, VEH_COLS);
    await c.audit('update', 'vehicle', c.id(), null, b);
    return json({ ok: true });
  });
  R.get('/api/vin/:vin', async (c) => {
    c.need('jobs.read');
    const d = await decodeVin(c.params.vin);
    // Hook for a paid VIN-specific OEM parts catalog (PartsTech, JD Power VIN Parts, etc.)
    const prov = await c.db.prepare("SELECT value FROM settings WHERE location_id=0 AND key='vin_parts_provider'").first();
    // Generic parts-catalog hook: 'sample' (built-in), 'autodoc' (RapidAPI, live), 'autodoc_mock'. Add more providers in src/partsapi.js (e.g. PartsTech).
    const pv = String(prov?.value || 'sample').replace(/^"|"$/g, '');
    d.parts_catalog = pv !== 'sample' ? { provider: pv, status: pv.endsWith('_mock') ? 'mock' : 'live where keys are stored, samples as fallback' } : { provider: 'sample', status: 'sample parts list' };
    return json(d);
  });

  // ---------- Jobs ----------
  R.get('/api/jobs', async (c) => {
    c.need('jobs.read');
    const lf = c.locFilter('j');
    const st = c.q('status');
    const q = c.q('q');
    let sql = `SELECT j.*, c.name AS customer_name, c.phone AS customer_phone, v.year, v.make, v.model, v.vin, v.color, i.name AS insurer_name
      FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN vehicles v ON v.id=j.vehicle_id LEFT JOIN insurers i ON i.id=j.insurer_id WHERE 1=1${lf.sql}`;
    const args = [...lf.args];
    if (st === 'open') sql += " AND j.status NOT IN ('delivered','closed','total_loss','lost')";
    else if (st) { sql += ' AND j.status=?'; args.push(st); }
    if (q) { sql += ' AND (c.name LIKE ? OR v.vin LIKE ? OR j.number LIKE ? OR j.claim_no LIKE ? OR v.make LIKE ? OR v.model LIKE ?)'; args.push(...Array(6).fill(`%${q}%`)); }
    sql += ' ORDER BY j.id DESC LIMIT 300';
    const r = await c.db.prepare(sql).bind(...args).all();
    // Attach estimate totals (quick)
    const ids = r.results.map((j) => j.id);
    if (ids.length) {
      const tot = await c.db.prepare(`SELECT job_id, SUM(qty*unit_price) AS parts, SUM(labor_hours+teardown_hours) AS lh, SUM(refinish_hours) AS rh FROM estimate_lines WHERE job_id IN (${ids.map(() => '?').join(',')}) GROUP BY job_id`).bind(...ids).all();
      const m = Object.fromEntries(tot.results.map((t) => [t.job_id, t]));
      for (const j of r.results) { const t = m[j.id]; j.est_parts = r2(t?.parts); j.est_labor_hours = r2(t?.lh); j.est_refinish_hours = r2(t?.rh); }
    }
    return json(r.results);
  });

  R.post('/api/jobs', async (c) => {
    c.need('jobs.write');
    const b = c.body;
    const locId = c.loc || b.location_id || 1;
    let customerId = b.customer_id;
    if (!customerId && b.customer) {
      const cd = cleanCustomer(b.customer, { create: true });
      customerId = await insertRow(c.env, 'customers', { ...cd, location_id: locId }, [...CUST_COLS, 'location_id']);
    }
    let vehicleId = b.vehicle_id;
    if (!vehicleId && b.vehicle) {
      const v = { ...b.vehicle, customer_id: customerId };
      if (v.vin) v.vin = String(v.vin).toUpperCase();
      if (Array.isArray(v.adas)) v.adas = JSON.stringify(v.adas);
      if (v.vin_data && typeof v.vin_data === 'object') v.vin_data = JSON.stringify(v.vin_data);
      vehicleId = await insertRow(c.env, 'vehicles', v, VEH_COLS);
    }
    const number = await nextNumber(c.env, 'job', 'RO-', 5);
    const id = await insertRow(c.env, 'jobs', {
      ...b, location_id: locId, number, customer_id: customerId, vehicle_id: vehicleId, estimator_id: b.estimator_id || c.user.id,
      status: 'estimate', stage: 'intake', stage_since: nowIso(), portal_token: randomToken(12), drp_status: b.insurer_id ? (b.drp_status || 'assignment') : null,
    }, [...JOB_COLS, 'location_id', 'number', 'customer_id', 'vehicle_id', 'stage', 'stage_since', 'portal_token']);
    await c.event(id, 'created', `Estimate ${number} opened`);
    await c.audit('create', 'job', id, id, number);
    return json({ id, number });
  });

  R.get('/api/jobs/:id', async (c) => { c.need('jobs.read'); return json(await jobBundle(c, c.id())); });

  R.put('/api/jobs/:id', async (c) => {
    c.need('jobs.write');
    const job = await c.job(c.id());
    const b = { ...c.body, updated: nowIso() };
    await updateRow(c.env, 'jobs', job.id, b, [...JOB_COLS, 'updated']);
    if (b.status && b.status !== job.status) await c.event(job.id, 'status', `${job.status} -> ${b.status}`);
    if (b.drp_status && b.drp_status !== job.drp_status) await c.event(job.id, 'drp', `DRP: ${b.drp_status.replace(/_/g, ' ')}`);
    await c.audit('update', 'job', job.id, job.id, c.body);
    return json({ ok: true });
  });

  // ---------- Estimate lines ----------
  R.post('/api/jobs/:id/lines', async (c) => {
    c.need('estimate.write');
    const job = await c.job(c.id());
    const l = cleanLine(c.body);
    if (!l.description) throw bad('Description is required');
    if (l.supplement_no === undefined) l.supplement_no = await currentSupplement(c.env, job);
    l.line_no = 9999;
    const id = await insertRow(c.env, 'estimate_lines', { ...l, job_id: job.id }, [...LINE_COLS, 'job_id']);
    await renumber(c.env, job.id);
    await c.audit('add_line', 'estimate_line', id, job.id, `${l.operation} ${l.description}`);
    return json({ id });
  });
  // Add many lines from the catalog / 3D model: [{key, operation, part_type, include_teardown}]
  R.post('/api/jobs/:id/lines/catalog', async (c) => {
    c.need('estimate.write');
    const job = await c.job(c.id());
    const items = Array.isArray(c.body.items) ? c.body.items.slice(0, 100) : [];
    if (!items.length) throw bad('No parts selected');
    const cat = Object.fromEntries((await catalogFor(c.env)).map((r) => [r.key, r]));
    const supp = await currentSupplement(c.env, job);
    const stmts = [];
    const added = [];
    for (const it of items) {
      const row = cat[it.key];
      if (!row) throw bad('Unknown part ' + it.key);
      const op = it.operation || 'replace';
      if (!OPS.includes(op)) throw bad('Unknown operation');
      if (op !== 'misc' && !(row.ops || '').split(',').includes(op)) throw bad(`${row.name}: ${op} is not available`);
      const l = lineFromCatalog(row, op, { partType: it.part_type || 'OEM', source: it.source === '3d' ? '3d' : 'catalog', supplement_no: supp, includeTeardown: it.include_teardown !== false });
      for (const k of ['labor_hours', 'teardown_hours', 'refinish_hours', 'unit_price', 'qty']) if (it[k] !== undefined && it[k] !== null && it[k] !== '') l[k] = Number(it[k]);
      l.line_no = 9999;
      const cols = [...LINE_COLS.filter((k) => l[k] !== undefined), 'job_id'];
      const vals = { ...l, job_id: job.id };
      stmts.push(c.db.prepare(`INSERT INTO estimate_lines (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...cols.map((k) => vals[k] ?? null)));
      added.push(`${op} ${row.name}`);
    }
    await c.db.batch(stmts);
    await renumber(c.env, job.id);
    await c.audit('add_lines', 'estimate_line', null, job.id, added.join('; '));
    return json({ added: added.length });
  });
  R.put('/api/lines/:id', async (c) => {
    c.need('estimate.write');
    const l = await c.db.prepare('SELECT * FROM estimate_lines WHERE id=?').bind(c.id()).first();
    if (!l) throw notFound();
    await c.job(l.job_id);
    const b = cleanLine(c.body);
    if (b.reviewed === undefined && l.source === 'ai') b.reviewed = 1; // editing an AI line counts as reviewing it
    await updateRow(c.env, 'estimate_lines', l.id, b, LINE_COLS);
    await c.audit('update_line', 'estimate_line', l.id, l.job_id, b);
    return json({ ok: true });
  });
  R.del('/api/lines/:id', async (c) => {
    c.need('estimate.write');
    const l = await c.db.prepare('SELECT * FROM estimate_lines WHERE id=?').bind(c.id()).first();
    if (!l) throw notFound();
    await c.job(l.job_id);
    await c.db.prepare('DELETE FROM estimate_lines WHERE id=?').bind(l.id).run();
    await renumber(c.env, l.job_id);
    await c.audit('delete_line', 'estimate_line', l.id, l.job_id, `${l.operation} ${l.description}`);
    return json({ ok: true });
  });
  // Bulk edit: {ids:[...], action:'update'|'delete'|'duplicate'|'move', set:{...}, adjust:{field: delta}, supplement_no}
  R.post('/api/jobs/:id/lines/bulk', async (c) => {
    c.need('estimate.write');
    const job = await c.job(c.id());
    const ids = (Array.isArray(c.body.ids) ? c.body.ids : []).map(Number).filter(Boolean).slice(0, 500);
    if (!ids.length) throw bad('No lines selected');
    const rows = (await c.db.prepare(`SELECT * FROM estimate_lines WHERE job_id=? AND id IN (${ids.map(() => '?').join(',')})`).bind(job.id, ...ids).all()).results;
    if (rows.length !== ids.length) throw bad('Some lines are not on this job');
    const action = c.body.action || 'update';
    const stmts = [];
    if (action === 'delete') {
      stmts.push(c.db.prepare(`DELETE FROM estimate_lines WHERE job_id=? AND id IN (${ids.map(() => '?').join(',')})`).bind(job.id, ...ids));
    } else if (action === 'duplicate') {
      for (const r of rows) {
        const cols = LINE_COLS.filter((k) => k !== 'line_no');
        stmts.push(c.db.prepare(`INSERT INTO estimate_lines (${cols.join(',')},job_id,line_no) VALUES (${cols.map(() => '?').join(',')},?,9999)`).bind(...cols.map((k) => r[k] ?? null), job.id));
      }
    } else if (action === 'update' || action === 'move') {
      const set = cleanLine(action === 'move' ? { supplement_no: num(c.body.supplement_no) } : c.body.set || {});
      const keys = Object.keys(set).filter((k) => LINE_COLS.includes(k) && !['line_no', 'source', 'catalog_key', 'ai_confidence'].includes(k));
      const adj = c.body.adjust || {};
      const adjKeys = Object.keys(adj).filter((k) => ['labor_hours', 'refinish_hours', 'teardown_hours', 'unit_price', 'labor_overlap', 'refinish_overlap'].includes(k));
      const pct = c.body.scale || {};
      const pctKeys = Object.keys(pct).filter((k) => ['labor_hours', 'refinish_hours', 'unit_price'].includes(k));
      if (!keys.length && !adjKeys.length && !pctKeys.length) throw bad('Nothing to change');
      for (const r of rows) {
        const upd = {};
        for (const k of keys) upd[k] = set[k];
        for (const k of adjKeys) upd[k] = Math.max(0, r2(num(r[k]) + num(adj[k])));
        for (const k of pctKeys) upd[k] = Math.max(0, r2(num(upd[k] ?? r[k]) * (1 + num(pct[k]) / 100)));
        const ks = Object.keys(upd);
        stmts.push(c.db.prepare(`UPDATE estimate_lines SET ${ks.map((k) => k + '=?').join(',')} WHERE id=?`).bind(...ks.map((k) => upd[k]), r.id));
      }
    } else throw bad('Unknown action');
    await c.db.batch(stmts);
    await renumber(c.env, job.id);
    await c.audit('bulk_' + action, 'estimate_line', null, job.id, { ids, set: c.body.set, adjust: c.body.adjust, scale: c.body.scale, supplement_no: c.body.supplement_no });
    return json({ changed: rows.length });
  });
  // Reorder: {ids:[...in new order]}
  R.post('/api/jobs/:id/lines/order', async (c) => {
    c.need('estimate.write');
    const job = await c.job(c.id());
    const ids = (c.body.ids || []).map(Number);
    await c.db.batch(ids.map((id, i) => c.db.prepare('UPDATE estimate_lines SET line_no=? WHERE id=? AND job_id=?').bind(i + 1, id, job.id)));
    return json({ ok: true });
  });
  R.post('/api/jobs/:id/lines/review-all', async (c) => {
    c.need('estimate.write');
    const job = await c.job(c.id());
    const r = await c.db.prepare('UPDATE estimate_lines SET reviewed=1 WHERE job_id=? AND reviewed=0').bind(job.id).run();
    await c.audit('review_ai_lines', 'job', job.id, job.id, `${r.meta.changes} AI lines marked reviewed`);
    return json({ reviewed: r.meta.changes });
  });

  // ---------- Supplements ----------
  R.post('/api/jobs/:id/supplements', async (c) => {
    c.need('estimate.write');
    const job = await c.job(c.id());
    const open = await c.db.prepare("SELECT number FROM supplements WHERE job_id=? AND status='draft'").bind(job.id).first();
    if (open) throw bad(`Supplement S${open.number} is still open. Submit it first.`);
    const m = await c.db.prepare('SELECT COALESCE(MAX(number),0)+1 AS n FROM supplements WHERE job_id=?').bind(job.id).first();
    const id = await insertRow(c.env, 'supplements', { job_id: job.id, number: m.n, reason: c.body.reason || 'Hidden damage found at teardown', status: 'draft' }, ['job_id', 'number', 'reason', 'status']);
    await c.db.prepare("UPDATE jobs SET blueprint_status='teardown' WHERE id=? AND blueprint_status='not started'").bind(job.id).run();
    await c.event(job.id, 'supplement', `Supplement S${m.n} opened: ${c.body.reason || ''}`);
    await c.audit('create', 'supplement', id, job.id, c.body.reason);
    return json({ id, number: m.n });
  });
  R.put('/api/supplements/:id', async (c) => {
    c.need('estimate.write');
    const s = await c.db.prepare('SELECT * FROM supplements WHERE id=?').bind(c.id()).first();
    if (!s) throw notFound();
    const job = await c.job(s.job_id);
    const b = c.body;
    const upd = { reason: b.reason };
    if (b.status && b.status !== s.status) {
      if (!['submitted', 'approved', 'rejected', 'draft'].includes(b.status)) throw bad('Bad status');
      upd.status = b.status;
      const bundle = await jobBundle(c, job.id, { full: false });
      upd.amount = bundle.totals.by_supplement[s.number] || 0;
      if (b.status === 'submitted') {
        upd.submitted_at = nowIso();
        await c.db.prepare("UPDATE jobs SET drp_status='supplement_submitted', blueprint_status='supplement sent' WHERE id=?").bind(job.id).run();
        // Electronic supplement request: photos attached to this supplement go along. Delivery adapter is email/placeholder.
        const photos = bundle.files.filter((f) => f.supplement_id === s.id || f.kind === 'teardown').length;
        await c.event(job.id, 'supplement', `S${s.number} submitted to ${bundle.insurer?.name || 'customer'} ($${upd.amount}, ${photos} photo(s) attached)`);
      } else if (b.status === 'approved' || b.status === 'rejected') {
        upd.decided_at = nowIso(); upd.decided_by = b.decided_by || bundle.insurer?.adjuster || c.user.name;
        if (b.status === 'approved') await c.db.prepare("UPDATE jobs SET drp_status='supplement_approved' WHERE id=?").bind(job.id).run();
        await c.event(job.id, 'supplement', `S${s.number} ${b.status}`);
      }
    }
    await updateRow(c.env, 'supplements', s.id, upd, ['reason', 'status', 'amount', 'submitted_at', 'decided_at', 'decided_by']);
    await c.audit('update', 'supplement', s.id, job.id, upd);
    return json({ ok: true });
  });

  // ---------- AI damage detection -> draft estimate ----------
  R.post('/api/jobs/:id/ai-estimate', async (c) => {
    c.need('estimate.write');
    const bundle = await jobBundle(c, c.id());
    const job = bundle.job;
    const style = bundle.body_style;
    const cat = await catalogFor(c.env, style);
    const labelMap = {};
    for (const r of cat) if (r.ai_label) labelMap[r.ai_label.toLowerCase()] = r;
    const labels = Object.keys(labelMap);
    let photos = bundle.files.filter((f) => f.category === 'photo' && !['vin', 'odometer', 'interior', 'signature', 'progress', 'delivery'].includes(f.kind));
    if (Array.isArray(c.body.file_ids) && c.body.file_ids.length) photos = bundle.files.filter((f) => c.body.file_ids.includes(f.id));
    photos = photos.slice(-6);
    if (!photos.length) throw bad('Add at least one damage photo first');
    const found = new Map();
    const perPhoto = [];
    for (const f of photos) {
      const fileRow = await c.db.prepare('SELECT * FROM files WHERE id=?').bind(f.id).first();
      const bytes = await loadFileBytes(c.env, fileRow);
      let parsed = null, model = null, raw = '';
      try {
        const out = await aiVision(c.env, bytes, damagePrompt(labels), 800);
        model = out.model; raw = out.text; parsed = extractJson(out.text);
      } catch (e) { perPhoto.push({ file_id: f.id, error: String(e.message || e).slice(0, 300) }); continue; }
      const dmg = (parsed?.damages || []).filter((d) => d && d.part);
      await c.db.prepare('UPDATE files SET ai_result=? WHERE id=?').bind(JSON.stringify({ model, view: parsed?.view, damages: dmg, raw: parsed ? undefined : String(raw).slice(0, 600), at: nowIso() }), f.id).run();
      perPhoto.push({ file_id: f.id, model, view: parsed?.view, damages: dmg });
      for (const d of dmg) {
        const key = String(d.part).toLowerCase().trim();
        const row = labelMap[key] || Object.entries(labelMap).find(([k]) => key.includes(k) || k.includes(key))?.[1];
        if (!row) continue;
        const prev = found.get(row.key);
        const conf = Math.max(0, Math.min(1, Number(d.confidence) || 0.5));
        const sevRank = { light: 1, moderate: 2, heavy: 3 };
        if (!prev || sevRank[d.severity] > sevRank[prev.severity] || conf > prev.confidence) found.set(row.key, { row, severity: d.severity || 'moderate', damage: d.damage || '', operation: d.operation, confidence: conf, photo: f.id });
      }
    }
    if (!found.size && perPhoto.every((p) => p.error)) throw new HttpError(502, 'AI damage detection is unavailable right now: ' + perPhoto[0].error);
    // Turn detections into draft lines (always marked unreviewed)
    const existing = new Set(bundle.lines.map((l) => l.catalog_key).filter(Boolean));
    const supp = await currentSupplement(c.env, job);
    const stmts = [];
    const drafted = [];
    for (const d of found.values()) {
      if (existing.has(d.row.key)) continue;
      const ops = (d.row.ops || '').split(',');
      let op = d.operation === 'replace' || d.severity === 'heavy' || /crush|broken|crack|missing/i.test(d.damage) ? 'replace' : d.operation === 'refinish' || /scratch/i.test(d.damage) ? 'refinish' : 'repair';
      if (!ops.includes(op)) op = ops.includes('replace') ? 'replace' : ops[0];
      const l = lineFromCatalog(d.row, op, { severity: d.severity, source: 'ai', confidence: Math.round(d.confidence * 100) / 100, supplement_no: supp });
      l.notes = `AI draft from photo #${d.photo}: ${d.severity} ${d.damage}. Sample times. Review before sending.`;
      drafted.push(l);
      for (const nb of BLEND_NEIGHBORS[d.row.key] || []) {
        const nrow = cat.find((r) => r.key === nb);
        if (nrow && !found.has(nb) && !existing.has(nb) && op !== 'refinish' && d.row.paintable && !drafted.some((x) => x.catalog_key === nb)) {
          const bl = lineFromCatalog(nrow, 'blend', { source: 'ai', confidence: 0.5, supplement_no: supp });
          bl.notes = 'AI suggestion: blend adjacent panel for color match';
          drafted.push(bl);
        }
      }
    }
    for (const l of drafted) {
      l.line_no = 9999;
      const cols = [...LINE_COLS.filter((k) => l[k] !== undefined), 'job_id'];
      const vals = { ...l, job_id: job.id };
      stmts.push(c.db.prepare(`INSERT INTO estimate_lines (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...cols.map((k) => vals[k] ?? null)));
    }
    if (stmts.length) await c.db.batch(stmts);
    await renumber(c.env, job.id);
    await c.event(job.id, 'ai', `AI reviewed ${photos.length} photo(s) and drafted ${drafted.length} line(s) for review`);
    await c.audit('ai_estimate', 'job', job.id, job.id, { photos: photos.length, lines: drafted.length });
    return json({ photos: perPhoto, drafted: drafted.length, lines: drafted.map((l) => `${l.operation} ${l.description}`) });
  });

  // Read VIN / odometer from a photo
  R.post('/api/files/:id/ai-read', async (c) => {
    c.need('files.write');
    const f = await c.db.prepare('SELECT * FROM files WHERE id=?').bind(c.id()).first();
    if (!f) throw notFound();
    if (f.job_id) await c.job(f.job_id);
    const what = c.body.what === 'odometer' ? 'odometer' : 'vin';
    const prompt = what === 'vin'
      ? 'Read the 17-character vehicle identification number (VIN) in this photo. VINs never contain the letters I, O or Q. Respond with JSON only: {"vin": "...", "confidence": 0.0}. If none is readable use an empty string.'
      : 'Read the odometer mileage shown on this instrument cluster photo (total miles, not trip). Respond with JSON only: {"odometer": 12345, "confidence": 0.0}. If unreadable use null.';
    const bytes = await loadFileBytes(c.env, f);
    const out = await aiVision(c.env, bytes, prompt, 120);
    const p = extractJson(out.text) || {};
    if (what === 'vin') {
      let vin = String(p.vin || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[IOQ]/g, (x) => ({ I: '1', O: '0', Q: '0' }[x]));
      if (vin.length !== 17) { const m = String(out.text).toUpperCase().match(/[A-HJ-NPR-Z0-9]{17}/); vin = m ? m[0] : ''; }
      return json({ vin, check_digit_ok: vinValid(vin), model: out.model });
    }
    const n = p.odometer !== null && p.odometer !== undefined ? Number(String(p.odometer).replace(/[^0-9]/g, '')) : null;
    return json({ odometer: n || null, model: out.model });
  });

  // ---------- Files (photos, video, documents) ----------
  R.post('/api/files', async (c) => {
    c.need('files.write');
    const fd = c.body;
    if (!(fd instanceof FormData)) throw bad('Use multipart form upload');
    const file = fd.get('file');
    if (!file || typeof file === 'string') throw bad('No file');
    const jobId = Number(fd.get('job_id')) || null;
    let locId = c.loc;
    if (jobId) { const j = await c.job(jobId); locId = j.location_id; }
    let ct = file.type || 'application/octet-stream';
    if (/\.glb$/i.test(file.name || '') && fd.get('kind') === 'model3d') ct = 'model/gltf-binary';
    const okType = ct === 'model/gltf-binary' && fd.get('kind') === 'model3d' ? (c.need('catalog.write'), true) : /^(image\/(jpeg|png|webp|gif|heic|heif)|video\/(mp4|webm|quicktime)|application\/pdf|text\/(plain|csv|xml)|application\/xml)$/.test(ct);
    if (!okType) throw bad('File type not allowed: ' + ct);
    const category = fd.get('category') || (ct.startsWith('video/') ? 'video' : ct.startsWith('image/') ? 'photo' : 'document');
    const id = await saveFile(c.env, { job_id: jobId, location_id: locId, category, kind: fd.get('kind') || 'other', name: (file.name || 'upload').slice(0, 120), content_type: ct, caption: fd.get('caption'), supplement_id: Number(fd.get('supplement_id')) || null, parent_id: Number(fd.get('parent_id')) || null, customer_visible: fd.get('customer_visible') === '1', created_by: c.user.name }, await file.arrayBuffer());
    if (jobId) await c.event(jobId, 'file', `${category} added (${fd.get('kind') || 'other'})`);
    await c.audit('upload', 'file', id, jobId, `${category}/${fd.get('kind') || ''} ${file.name || ''}`);
    return json({ id });
  });
  R.get('/api/files/:id', async (c) => {
    const f = await c.db.prepare('SELECT * FROM files WHERE id=?').bind(c.id()).first();
    if (!f) throw notFound();
    if (f.job_id) await c.job(f.job_id);
    return fileResponse(c.env, f, c.req);
  });
  R.put('/api/files/:id', async (c) => {
    c.need('files.write');
    const f = await c.db.prepare('SELECT * FROM files WHERE id=?').bind(c.id()).first();
    if (!f) throw notFound();
    if (f.job_id) await c.job(f.job_id);
    const b = { ...c.body };
    if (b.annotations && typeof b.annotations !== 'string') b.annotations = JSON.stringify(b.annotations).slice(0, 200000);
    if (b.customer_visible !== undefined) b.customer_visible = b.customer_visible ? 1 : 0;
    await updateRow(c.env, 'files', f.id, b, ['caption', 'annotations', 'kind', 'customer_visible', 'supplement_id']);
    await c.audit('update', 'file', f.id, f.job_id, Object.keys(b).join(','));
    return json({ ok: true });
  });
  R.del('/api/files/:id', async (c) => {
    c.need('estimate.write');
    const f = await c.db.prepare('SELECT * FROM files WHERE id=?').bind(c.id()).first();
    if (!f) throw notFound();
    if (f.job_id) await c.job(f.job_id);
    await deleteFile(c.env, f);
    await c.audit('delete', 'file', f.id, f.job_id, f.name);
    return json({ ok: true });
  });

  // Exact 3D models uploaded by the shop, keyed "year|make|model" in the caption ("*" matches any year)
  R.get('/api/models3d', async (c) => {
    c.need('jobs.read');
    const rows = (await c.db.prepare("SELECT id,caption,name,created FROM files WHERE kind='model3d' ORDER BY id DESC LIMIT 200").all()).results;
    const y = c.q('year', ''), mk = c.q('make', '').toLowerCase(), md = c.q('model', '').toLowerCase();
    if (!mk) return json(rows);
    const hit = rows.find((r) => { const [ry, rmk, rmd] = String(r.caption || '').toLowerCase().split('|'); return rmk === mk && rmd === md && (ry === '*' || ry === String(y)); });
    return json(hit ? { id: hit.id, url: `/api/files/${hit.id}`, key: hit.caption } : { id: null });
  });

  // ---------- Catalog (sample parts + labor guide, editable) ----------
  R.get('/api/catalog', async (c) => { c.need('jobs.read'); return json(await catalogFor(c.env, c.q('style'))); });
  R.put('/api/catalog/:id', async (c) => {
    c.need('catalog.write');
    const b = { ...c.body };
    await updateRow(c.env, 'catalog_parts', c.id(), b, ['name', 'replace_hours', 'repair_hours', 'teardown_hours', 'refinish_hours', 'price_oem', 'price_aftermarket', 'price_recycled', 'price_reconditioned', 'adas', 'notes', 'sample']);
    await c.audit('update', 'catalog_part', c.id(), null, b);
    return json({ ok: true });
  });
}
