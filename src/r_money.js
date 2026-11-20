// Invoicing, payments, A/R, paint & materials, reports, admin, integrations (import/export).
import { json, text, bad, notFound, forbidden, HttpError, r2, num, nowIso, today, addDays, daysBetween, parseJsonCol, toCsv, parseCsv, xmlEsc, hashPassword, randomToken, sha256Hex, safeEqual } from './util.js';
import { computeTotals, rulesFor, grossProfit, avg, ROLES, STAGES, capsFor, lineFromCatalog } from './logic.js';
import { nextNumber, updateRow, insertRow } from './core.js';
import { jobBundle, catalogFor } from './r_jobs.js';
import { sendCustomerMessage, portalUrl } from './r_ops.js';
import { invoiceStatus } from './r_owner.js';

export function registerMoney(R) {
  // ---------- Invoices & payments ----------
  R.post('/api/jobs/:id/invoice', async (c) => {
    c.need('accounting.write');
    const b = await jobBundle(c, c.id());
    const job = b.job, t = b.totals;
    if (b.invoices.some((i) => i.status !== 'void')) throw bad('This job already has an invoice. Void it to re-invoice.');
    if (!['approved', 'scheduled', 'in_production', 'completed', 'delivered', 'closed'].includes(job.status)) throw bad('Approve the estimate first');
    if (!(num(t.total) > 0)) throw bad('This estimate has no lines to bill');
    const terms = num(b.insurer?.payment_terms_days, 30);
    const number = await nextNumber(c.env, 'inv', 'INV-', 5);
    const id = await insertRow(c.env, 'invoices', {
      job_id: job.id, location_id: job.location_id, number, bill_to: job.pay_type === 'insurance' && b.insurer ? b.insurer.name : b.customer?.name,
      parts: t.parts, labor: t.labor, paint: t.paint_materials, sublet: t.sublet, other: t.misc, tax: t.tax, total: t.total,
      deductible: t.deductible, customer_portion: t.customer_pays, insurer_portion: t.insurer_pays, status: 'open', due_date: addDays(today(), job.pay_type === 'insurance' ? terms : 0), sent_at: nowIso(),
    }, ['job_id', 'location_id', 'number', 'bill_to', 'parts', 'labor', 'paint', 'sublet', 'other', 'tax', 'total', 'deductible', 'customer_portion', 'insurer_portion', 'status', 'due_date', 'sent_at']);
    if (job.insurer_id) await c.db.prepare("UPDATE jobs SET drp_status='invoiced' WHERE id=?").bind(job.id).run();
    // Deposits taken before invoicing (or on a voided invoice) count toward this one
    await c.db.prepare("UPDATE payments SET invoice_id=? WHERE job_id=? AND (invoice_id IS NULL OR invoice_id IN (SELECT id FROM invoices WHERE status='void'))").bind(id, job.id).run();
    await invoiceStatus(c, id);
    await c.event(job.id, 'invoice', `${number} created: $${t.total} (customer $${t.customer_pays}, insurer $${t.insurer_pays})`);
    await c.audit('create', 'invoice', id, job.id, { number, total: t.total });
    return json({ id, number });
  });
  R.put('/api/invoices/:id', async (c) => {
    c.need('accounting.write');
    const inv = await c.db.prepare('SELECT * FROM invoices WHERE id=?').bind(c.id()).first();
    if (!inv) throw notFound();
    await c.job(inv.job_id);
    if (c.body.status !== undefined && !['void'].includes(c.body.status)) throw bad('Invoices can only be voided here; payments set paid/partial');
    if (c.body.due_date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(c.body.due_date)) throw bad('Due date must be a date');
    await updateRow(c.env, 'invoices', inv.id, c.body, ['status', 'due_date']);
    if (c.body.status === 'void') await c.event(inv.job_id, 'invoice', `${inv.number} voided`);
    await c.audit('update', 'invoice', inv.id, inv.job_id, c.body);
    return json({ ok: true });
  });
  R.post('/api/jobs/:id/payments', async (c) => {
    c.need('accounting.write');
    const job = await c.job(c.id());
    const amt = num(c.body.amount);
    if (!(amt > 0) && c.body.kind !== 'refund') throw bad('Amount must be more than 0');
    const inv = await c.db.prepare("SELECT * FROM invoices WHERE job_id=? AND status<>'void' ORDER BY id DESC LIMIT 1").bind(job.id).first();
    const when = /^\d{4}-\d{2}-\d{2}$/.test(String(c.body.received_at || '')) ? c.body.received_at + ' 12:00:00' : nowIso();
    const id = await insertRow(c.env, 'payments', { job_id: job.id, invoice_id: inv?.id || null, payer: c.body.payer === 'insurer' ? 'insurer' : 'customer', kind: String(c.body.kind || 'customer pay').slice(0, 30), method: String(c.body.method || 'card').slice(0, 20), amount: c.body.kind === 'refund' ? -Math.abs(amt) : amt, reference: String(c.body.reference || '').slice(0, 80), received_at: when, user_name: c.user.name }, ['job_id', 'invoice_id', 'payer', 'kind', 'method', 'amount', 'reference', 'received_at', 'user_name']);
    if (inv) {
      const st = await invoiceStatus(c, inv.id);
      if (st === 'paid' && job.insurer_id) await c.db.prepare("UPDATE jobs SET drp_status='paid' WHERE id=?").bind(job.id).run();
    }
    await c.event(job.id, 'payment', `${c.body.kind || 'payment'} $${amt} from ${c.body.payer || 'customer'} by ${c.body.method || 'card'}${c.body.reference ? ' ref ' + c.body.reference : ''}`);
    await c.audit('create', 'payment', id, job.id, c.body);
    return json({ id });
  });
  R.get('/api/ar', async (c) => {
    c.need('accounting.read');
    const lf = c.locFilter('i');
    const rows = (await c.db.prepare(`SELECT i.*, j.number AS ro, j.insurer_id, ins.name AS insurer_name, cu.name AS customer_name,
      (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.invoice_id=i.id) AS paid,
      (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.invoice_id=i.id AND p.payer='insurer') AS paid_ins,
      (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.invoice_id=i.id AND p.payer='customer') AS paid_cust
      FROM invoices i JOIN jobs j ON j.id=i.job_id LEFT JOIN insurers ins ON ins.id=j.insurer_id LEFT JOIN customers cu ON cu.id=j.customer_id WHERE i.status<>'void'${lf.sql} ORDER BY i.id DESC`).bind(...lf.args).all()).results;
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0 };
    const byInsurer = {};
    for (const r of rows) {
      r.balance = r2(r.total - r.paid);
      r.ins_balance = r2(num(r.insurer_portion) - r.paid_ins);
      r.cust_balance = r2(num(r.customer_portion) - r.paid_cust);
      const age = daysBetween(r.created.slice(0, 10), today());
      r.age_days = Math.round(age);
      if (r.balance > 0.005) {
        const k = age <= 30 ? 'current' : age <= 60 ? 'd30' : age <= 90 ? 'd60' : 'd90';
        buckets[k] = r2(buckets[k] + r.balance);
        if (r.insurer_name && r.ins_balance > 0.005) byInsurer[r.insurer_name] = r2((byInsurer[r.insurer_name] || 0) + r.ins_balance);
      }
    }
    return json({ invoices: rows, buckets, by_insurer: byInsurer, total: r2(rows.reduce((a, r) => a + Math.max(0, r.balance), 0)) });
  });
  R.get('/api/payroll', async (c) => {
    c.need('accounting.read');
    const from = c.q('from', addDays(today(), -14)), to = c.q('to', today());
    const users = (await c.db.prepare('SELECT id,name,role,department,pay_type,pay_rate,commission_pct,location_id FROM users WHERE active=1').all()).results;
    const out = [];
    for (const u of users) {
      const flagged = (await c.db.prepare("SELECT COALESCE(SUM(flagged_hours),0) AS f FROM ro_tasks WHERE tech_id=? AND status='done' AND substr(finished_at,1,10) BETWEEN ? AND ?").bind(u.id, from, to).first()).f;
      const clocked = (await c.db.prepare('SELECT COALESCE(SUM(minutes),0)/60.0 AS h FROM time_entries WHERE tech_id=? AND substr(clock_in,1,10) BETWEEN ? AND ?').bind(u.id, from, to).first()).h;
      let gross = 0, basis = '';
      if (u.role === 'technician') { gross = u.pay_type === 'hourly' ? clocked * num(u.pay_rate) : flagged * num(u.pay_rate); basis = u.pay_type === 'hourly' ? `${r2(clocked)} clocked h x $${u.pay_rate}` : `${r2(flagged)} flagged h x $${u.pay_rate}`; }
      let commission = 0;
      if (num(u.commission_pct) > 0) {
        const s = (await c.db.prepare("SELECT COALESCE(SUM(i.total - i.tax),0) AS s FROM invoices i JOIN jobs j ON j.id=i.job_id WHERE j.estimator_id=? AND i.status<>'void' AND substr(i.created,1,10) BETWEEN ? AND ?").bind(u.id, from, to).first()).s;
        commission = s * num(u.commission_pct) / 100;
        basis += (basis ? ' + ' : '') + `${u.commission_pct}% of $${r2(s)} sales`;
      }
      if (gross || commission || u.role === 'technician') out.push({ ...u, flagged: r2(flagged), clocked: r2(clocked), efficiency: clocked ? Math.round((flagged / clocked) * 100) : null, gross: r2(gross), commission: r2(commission), total: r2(gross + commission), basis });
    }
    return json({ from, to, rows: out, note: 'Gross pay only. Withholding and filing need a payroll provider (Gusto, ADP, QuickBooks Payroll).' });
  });

  // ---------- Paint & materials ----------
  R.get('/api/paint/formulas', async (c) => {
    c.need('shop.read');
    const make = c.q('make', ''), code = c.q('code', '');
    const r = await c.db.prepare('SELECT * FROM paint_formulas WHERE (?=\'\' OR make LIKE ?) AND (?=\'\' OR color_code LIKE ? OR color_name LIKE ?) ORDER BY make, color_code LIMIT 50').bind(make, `%${make}%`, code, `%${code}%`, `%${code}%`).all();
    return json(r.results);
  });
  R.get('/api/paint/inventory', async (c) => {
    c.need('shop.read');
    const lf = c.locFilter();
    const rows = (await c.db.prepare(`SELECT * FROM paint_inventory WHERE 1=1${lf.sql} ORDER BY category, name`).bind(...lf.args).all()).results;
    for (const r of rows) r.low = r.on_hand <= r.reorder_point;
    return json(rows);
  });
  const PI = ['sku', 'name', 'brand', 'category', 'unit', 'on_hand', 'reorder_point', 'reorder_qty', 'unit_cost', 'supplier'];
  R.post('/api/paint/inventory', async (c) => { c.need('paint.write'); const id = await insertRow(c.env, 'paint_inventory', { ...c.body, location_id: c.loc || 1, sample: 0 }, [...PI, 'location_id', 'sample']); await c.audit('create', 'paint_item', id, null, c.body.name); return json({ id }); });
  R.put('/api/paint/inventory/:id', async (c) => { c.need('paint.write'); await updateRow(c.env, 'paint_inventory', c.id(), c.body, PI); await c.audit('update', 'paint_item', c.id(), null, c.body); return json({ ok: true }); });
  R.post('/api/jobs/:id/paint-usage', async (c) => {
    c.need('paint.write');
    const job = await c.job(c.id());
    const it = await c.db.prepare('SELECT * FROM paint_inventory WHERE id=?').bind(Number(c.body.inventory_id)).first();
    if (!it) throw bad('Pick an inventory item');
    const qty = num(c.body.qty);
    if (!(qty > 0)) throw bad('Quantity must be more than 0');
    const cost = r2(qty * num(it.unit_cost));
    await c.db.batch([
      c.db.prepare('INSERT INTO paint_usage (job_id,inventory_id,qty,cost,user_name) VALUES (?,?,?,?,?)').bind(job.id, it.id, qty, cost, c.user.name),
      c.db.prepare('UPDATE paint_inventory SET on_hand=MAX(0,on_hand-?) WHERE id=?').bind(qty, it.id),
    ]);
    await c.audit('paint_usage', 'job', job.id, job.id, `${qty} ${it.unit} ${it.name} $${cost}`);
    return json({ cost, low: it.on_hand - qty <= it.reorder_point });
  });
  R.get('/api/paint/reconcile', async (c) => {
    c.need('shop.read');
    const lf = c.locFilter('j');
    const jobs = (await c.db.prepare(`SELECT j.id, j.number, j.status, v.year, v.make, v.model,
      (SELECT COALESCE(SUM(refinish_hours),0) FROM estimate_lines e WHERE e.job_id=j.id) AS rh,
      (SELECT COALESCE(SUM(cost),0) FROM paint_usage u WHERE u.job_id=j.id) AS actual,
      COALESCE(i.paint_mat_rate, l.paint_mat_rate) AS rate
      FROM jobs j LEFT JOIN vehicles v ON v.id=j.vehicle_id LEFT JOIN insurers i ON i.id=j.insurer_id LEFT JOIN locations l ON l.id=j.location_id
      WHERE j.status NOT IN ('estimate','lost')${lf.sql} ORDER BY j.id DESC LIMIT 100`).bind(...lf.args).all()).results;
    for (const j of jobs) { j.estimated = r2(j.rh * j.rate); j.actual = r2(j.actual); j.variance = r2(j.estimated - j.actual); j.margin_pct = j.estimated ? Math.round((j.variance / j.estimated) * 1000) / 10 : null; }
    return json(jobs.filter((j) => j.rh > 0));
  });
  R.post('/api/paint/reorder', async (c) => {
    c.need('paint.write');
    const lf = c.locFilter();
    const low = (await c.db.prepare(`SELECT * FROM paint_inventory WHERE on_hand<=reorder_point${lf.sql}`).bind(...lf.args).all()).results;
    if (!low.length) return json({ items: 0, csv: '' });
    const csv = toCsv(low.map((i) => ({ supplier: i.supplier, brand: i.brand, sku: i.sku, name: i.name, order_qty: i.reorder_qty, unit: i.unit, unit_cost: i.unit_cost })), ['supplier', 'brand', 'sku', 'name', 'order_qty', 'unit', 'unit_cost']);
    await c.audit('paint_reorder', 'paint', null, null, `${low.length} items`);
    return json({ items: low.length, csv, note: 'Send this order to your paint jobber. Direct ordering needs your PPG LINQ / Sherwin-Williams Collision Core / Axalta / BASF account.' });
  });

  // ---------- Reports ----------
  R.get('/api/reports', async (c) => {
    c.need('reports.read');
    const days = Math.min(730, Math.max(7, num(c.q('days'), 90)));
    const since = addDays(today(), -days);
    const lf = c.locFilter('j');
    const jobs = (await c.db.prepare(`SELECT j.*, i.name AS insurer_name FROM jobs j LEFT JOIN insurers i ON i.id=j.insurer_id WHERE substr(j.created,1,10) >= ?${lf.sql}`).bind(since, ...lf.args).all()).results;
    const ids = jobs.map((j) => j.id);
    const lines = ids.length ? (await c.db.prepare(`SELECT * FROM estimate_lines WHERE job_id IN (SELECT id FROM jobs j WHERE substr(j.created,1,10) >= ?${lf.sql})`).bind(since, ...lf.args).all()).results : [];
    const locs = Object.fromEntries((await c.db.prepare('SELECT * FROM locations').all()).results.map((l) => [l.id, l]));
    const ins = Object.fromEntries((await c.db.prepare('SELECT * FROM insurers').all()).results.map((i) => [i.id, i]));
    const byJob = {};
    for (const l of lines) (byJob[l.job_id] ||= []).push(l);
    const parts = ids.length ? (await c.db.prepare(`SELECT p.* FROM parts p WHERE job_id IN (SELECT id FROM jobs j WHERE substr(j.created,1,10) >= ?${lf.sql})`).bind(since, ...lf.args).all()).results : [];
    const time = ids.length ? (await c.db.prepare(`SELECT e.*, t.department FROM time_entries e LEFT JOIN ro_tasks t ON t.id=e.task_id WHERE e.job_id IN (SELECT id FROM jobs j WHERE substr(j.created,1,10) >= ?${lf.sql})`).bind(since, ...lf.args).all()).results : [];
    const tasks = ids.length ? (await c.db.prepare(`SELECT t.*, u.name AS tech_name FROM ro_tasks t LEFT JOIN users u ON u.id=t.tech_id WHERE t.job_id IN (SELECT id FROM jobs j WHERE substr(j.created,1,10) >= ?${lf.sql})`).bind(since, ...lf.args).all()).results : [];
    const tot = {};
    for (const j of jobs) tot[j.id] = computeTotals(byJob[j.id] || [], { loc: locs[j.location_id], insurer: ins[j.insurer_id], job: j, vehicle: null });
    const won = jobs.filter((j) => !['estimate', 'lost'].includes(j.status));
    const decided = jobs.filter((j) => j.status !== 'estimate');
    const delivered = jobs.filter((j) => j.delivered_at && j.key_in_at);
    const keyToKey = delivered.map((j) => daysBetween(j.key_in_at, j.delivered_at));
    const touchHrs = time.reduce((a, e) => a + num(e.minutes), 0) / 60;
    const flagged = tasks.filter((t) => t.status === 'done').reduce((a, t) => a + num(t.flagged_hours), 0);
    const clockedDone = time.filter((e) => tasks.find((t) => t.id === e.task_id && t.status === 'done')).reduce((a, e) => a + num(e.minutes), 0) / 60;
    const sellParts = parts.reduce((a, p) => a + num(p.sell_price) * num(p.qty, 1), 0);
    const costParts = parts.filter((p) => num(p.cost) > 0).reduce((a, p) => a + num(p.cost) * num(p.qty, 1), 0);
    const sellWithCost = parts.filter((p) => num(p.cost) > 0).reduce((a, p) => a + num(p.sell_price) * num(p.qty, 1), 0);
    const severity = avg(won.map((j) => tot[j.id].total).filter((x) => x > 0));
    // Capture rate: insurer assignments that turned into repairs
    const assigned = jobs.filter((j) => j.source === 'DRP assignment' || j.drp_status);
    const captured = assigned.filter((j) => !['estimate', 'lost', 'total_loss'].includes(j.status));
    // Insurer-by-insurer
    const byIns = {};
    for (const j of jobs) {
      const k = j.insurer_name || 'Customer pay';
      const o = (byIns[k] ||= { name: k, jobs: 0, won: 0, sales: 0, gp: 0, cycle: [], severity: [], csi: [], supplements: 0, total_loss: 0, drp: !!ins[j.insurer_id]?.drp });
      o.jobs++;
      const t = tot[j.id];
      if (!['estimate', 'lost'].includes(j.status)) { o.won++; o.sales += t.total; o.severity.push(t.total); o.gp += t.total - t.tax - t.parts_cost_est - t.labor * 0.38 - t.paint_materials * 0.6; }
      if (j.key_in_at && j.delivered_at) o.cycle.push(daysBetween(j.key_in_at, j.delivered_at));
      if (j.csi_score) o.csi.push(j.csi_score);
      if (j.total_loss) o.total_loss++;
      o.supplements += (byJob[j.id] || []).some((l) => l.supplement_no > 0) ? 1 : 0;
    }
    const insurers = Object.values(byIns).map((o) => {
      const iRow = Object.values(ins).find((i) => i.name === o.name);
      return { name: o.name, drp: o.drp, jobs: o.jobs, closing_ratio: o.jobs ? Math.round((o.won / o.jobs) * 100) : 0, sales: r2(o.sales), est_gp: r2(o.gp), gp_pct: o.sales ? Math.round((o.gp / o.sales) * 100) : 0,
        cycle_days: avg(o.cycle) === null ? null : Math.round(avg(o.cycle) * 10) / 10, severity: avg(o.severity) === null ? null : r2(avg(o.severity)), csi: avg(o.csi) === null ? null : Math.round(avg(o.csi) * 10) / 10,
        supplement_rate: o.jobs ? Math.round((o.supplements / o.jobs) * 100) : 0, total_losses: o.total_loss,
        targets: iRow ? { cycle: iRow.cycle_target_days, severity: iRow.severity_target, csi: iRow.csi_target } : null };
    }).sort((a, b) => b.sales - a.sales);
    // Technicians
    const techMap = {};
    for (const t of tasks) {
      if (!t.tech_id) continue;
      const o = (techMap[t.tech_id] ||= { name: t.tech_name, flagged: 0, clocked: 0, tasks: 0, comebacks: 0, jobs: new Set() });
      if (t.status === 'done') { o.flagged += num(t.flagged_hours); o.tasks++; }
      o.jobs.add(t.job_id);
    }
    for (const e of time) if (techMap[e.tech_id]) techMap[e.tech_id].clocked += num(e.minutes) / 60;
    for (const j of jobs.filter((j) => j.comeback)) for (const t of tasks.filter((t) => t.job_id === j.id)) if (techMap[t.tech_id]) techMap[t.tech_id].comebacks++;
    const technicians = Object.values(techMap).map((o) => ({ name: o.name, flagged: r2(o.flagged), clocked: r2(o.clocked), efficiency: o.clocked ? Math.round((o.flagged / o.clocked) * 100) : null, tasks: o.tasks, jobs: o.jobs.size, comebacks: o.comebacks }));
    // Weekly trend
    const weeks = {};
    for (const j of won) { const w = weekStart(j.approved_at || j.created); (weeks[w] ||= { week: w, jobs: 0, sales: 0 }); weeks[w].jobs++; weeks[w].sales = r2(weeks[w].sales + tot[j.id].total); }
    const stageCounts = Object.fromEntries(STAGES.map(([k]) => [k, jobs.filter((j) => j.stage === k && ['approved', 'scheduled', 'in_production', 'completed'].includes(j.status)).length]));
    return json({
      days, since,
      kpis: {
        estimates: jobs.length, repairs: won.length, closing_ratio: decided.length ? Math.round((won.length / decided.length) * 100) : null,
        capture_rate: assigned.length ? Math.round((captured.length / assigned.length) * 100) : null,
        cycle_time_key_to_key: avg(keyToKey) === null ? null : Math.round(avg(keyToKey) * 10) / 10,
        severity: severity === null ? null : r2(severity), sales: r2(won.reduce((a, j) => a + tot[j.id].total, 0)),
        parts_margin_pct: sellWithCost ? Math.round(((sellWithCost - costParts) / sellWithCost) * 1000) / 10 : null,
        labor_efficiency_pct: clockedDone ? Math.round((flagged / clockedDone) * 100) : null,
        touch_time_hours_per_day: delivered.length ? r2(touchHrs / Math.max(1, delivered.reduce((a, j) => a + Math.max(1, daysBetween(j.key_in_at, j.delivered_at)), 0))) : null,
        comebacks: jobs.filter((j) => j.comeback).length, total_losses: jobs.filter((j) => j.total_loss).length,
        csi: avg(jobs.map((j) => j.csi_score).filter(Boolean)),
      },
      insurers, technicians, weekly: Object.values(weeks).sort((a, b) => a.week.localeCompare(b.week)), stage_counts: stageCounts,
      parts_sales: r2(sellParts), notes: 'Insurer gross profit uses estimated costs (parts cost from orders or 72% of list, labor at 38%, materials at 60%) until real costs are posted.',
    });
  });
  R.get('/api/reports/export', async (c) => {
    c.need('reports.read');
    const lf = c.locFilter('j');
    const rows = (await c.db.prepare(`SELECT j.number, j.status, j.stage, j.created, j.key_in_at, j.delivered_at, c.name AS customer, v.year, v.make, v.model, v.vin, i.name AS insurer, j.claim_no,
      (SELECT COALESCE(SUM(qty*unit_price),0) FROM estimate_lines e WHERE e.job_id=j.id) AS parts_list,
      (SELECT COALESCE(SUM(labor_hours+teardown_hours),0) FROM estimate_lines e WHERE e.job_id=j.id) AS labor_hours,
      (SELECT COALESCE(SUM(refinish_hours),0) FROM estimate_lines e WHERE e.job_id=j.id) AS refinish_hours
      FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN vehicles v ON v.id=j.vehicle_id LEFT JOIN insurers i ON i.id=j.insurer_id WHERE 1=1${lf.sql} ORDER BY j.id`).bind(...lf.args).all()).results;
    return text(toCsv(rows, Object.keys(rows[0] || { number: 1 })), 'text/csv', { 'Content-Disposition': 'attachment; filename="jobs.csv"' });
  });
  // ---------- Admin: users, locations, settings, audit, API keys ----------
  const UC = ['email', 'name', 'role', 'location_id', 'department', 'pay_type', 'pay_rate', 'commission_pct', 'active'];
  R.get('/api/users', async (c) => {
    c.need('shop.read');
    const r = await c.db.prepare('SELECT id,email,name,role,location_id,department,pay_type,pay_rate,commission_pct,active FROM users ORDER BY role, name').all();
    const rows = c.can('admin.users') ? r.results : r.results.map((u) => ({ id: u.id, name: u.name, role: u.role, department: u.department, location_id: u.location_id, active: u.active }));
    return json(rows);
  });
  R.post('/api/users', async (c) => {
    c.need('admin.users');
    const b = { ...c.body, email: String(c.body.email || '').trim().toLowerCase() };
    if (!ROLES.includes(b.role)) throw bad('Unknown role');
    if (b.role === 'owner') throw forbidden('There is one owner account. Add staff as employees.');
    if (!b.name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(b.email)) throw bad('Enter a name and a valid email');
    if (await c.db.prepare('SELECT 1 FROM users WHERE email=?').bind(b.email).first()) throw bad('That email already has an account');
    if (!b.password || String(b.password).length < 10) throw bad('Password must be at least 10 characters');
    const { hash, salt } = await hashPassword(b.password);
    const id = await insertRow(c.env, 'users', { ...b, pw_hash: hash, pw_salt: salt }, [...UC, 'pw_hash', 'pw_salt']);
    await c.audit('create', 'user', id, null, `${b.email} (${b.role})`);
    return json({ id });
  });
  R.del('/api/users/:id', async (c) => {
    c.need('admin.users');
    const id = c.id();
    const t = await c.db.prepare('SELECT id,email,role FROM users WHERE id=?').bind(id).first();
    if (!t) throw notFound();
    if (t.role === 'owner' || id === c.user.id) throw forbidden('The owner account cannot be removed');
    await c.db.batch([c.db.prepare('DELETE FROM sessions WHERE user_id=?').bind(id), c.db.prepare('UPDATE users SET active=0, email=?, pw_hash=NULL, pw_salt=NULL WHERE id=?').bind(`removed-${id}-${t.email}`, id)]);
    await c.audit('remove', 'user', id, null, t.email);
    return json({ ok: true });
  });
  R.put('/api/users/:id', async (c) => {
    const id = c.id();
    const self = id === c.user.id;
    if (!self) c.need('admin.users');
    const target = await c.db.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
    if (!target) throw notFound();
    if (target.role === 'owner' && c.user.role !== 'owner') throw forbidden();
    const b = { ...c.body };
    if (self && !c.can('admin.users')) for (const k of ['role', 'location_id', 'pay_rate', 'pay_type', 'commission_pct', 'active']) delete b[k];
    if (b.role && !ROLES.includes(b.role)) throw bad('Unknown role');
    if (target.role === 'owner' && (('role' in b && b.role !== 'owner') || ('active' in b && !Number(b.active) && b.active !== true))) throw forbidden('The owner account cannot be demoted or disabled');
    if (b.role === 'owner' && target.role !== 'owner') throw forbidden('There is one owner account');
    if ('active' in b && !Number(b.active) && b.active !== true) await c.db.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
    if ('email' in b) {
      b.email = String(b.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(b.email)) throw bad('Enter a valid email');
      if (await c.db.prepare('SELECT 1 FROM users WHERE email=? AND id<>?').bind(b.email, id).first()) throw bad('That email already has an account');
    }
    if ('password' in b) {
      const pw = String(b.password || '').trim();
      if (pw.length < 10 || pw.length > 200) throw bad('Password must be at least 10 characters');
      if (self) {
        // Changing your own password needs the current one
        const { hash: cur } = await hashPassword(String(b.current_password || ''), target.pw_salt || 'x'.repeat(32));
        const { hash: curT } = await hashPassword(String(b.current_password || '').trim(), target.pw_salt || 'x'.repeat(32));
        if (!target.pw_hash || !(safeEqual(cur, target.pw_hash) || safeEqual(curT, target.pw_hash))) throw forbidden('Your current password is not right');
      }
      const { hash, salt } = await hashPassword(pw);
      b.pw_hash = hash; b.pw_salt = salt;
      // Sign out the account's other sessions; keep the session of whoever is making the change
      await c.db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').bind(id, c.sessionToken || '').run();
      // A password reset re-enables nothing by itself, but it must not leave a sign-in lockout behind
      await c.db.prepare("DELETE FROM settings WHERE location_id=-1 AND key LIKE 'login:%'").run();
    }
    delete b.current_password;
    const changed = await updateRow(c.env, 'users', id, b, [...UC, 'pw_hash', 'pw_salt']);
    if (b.pw_hash) {
      const chk = await c.db.prepare('SELECT pw_hash FROM users WHERE id=?').bind(id).first();
      if (!changed || !chk || chk.pw_hash !== b.pw_hash) throw new HttpError(500, 'The new password was not saved. Try again.');
    }
    delete b.password; delete b.pw_hash; delete b.pw_salt;
    await c.audit('update', 'user', id, null, b);
    return json({ ok: true });
  });
  const LC = ['name', 'address', 'phone', 'email', 'tax_rate', 'tax_labor', 'rate_body', 'rate_paint', 'rate_mech', 'rate_frame', 'rate_structural', 'rate_glass', 'paint_mat_rate', 'total_loss_pct', 'bays', 'booths', 'booth_slots_per_day', 'tech_hours_per_day', 'stage_alert_hours', 'est_rules'];
  R.get('/api/locations', async (c) => { c.need('shop.read'); return json((await c.db.prepare('SELECT * FROM locations ORDER BY id').all()).results.map((l) => ({ ...l, rules: rulesFor(l) }))); });
  R.post('/api/locations', async (c) => { if (c.user.role !== 'owner') throw forbidden(); const id = await insertRow(c.env, 'locations', c.body, LC); await c.audit('create', 'location', id, null, c.body.name); return json({ id }); });
  R.put('/api/locations/:id', async (c) => {
    c.need('admin.users');
    if (c.user.location_id && c.user.location_id !== c.id()) throw forbidden();
    const b = { ...c.body };
    if (b.stage_alert_hours && typeof b.stage_alert_hours === 'object') b.stage_alert_hours = JSON.stringify(b.stage_alert_hours);
    if (b.est_rules && typeof b.est_rules === 'object') b.est_rules = JSON.stringify(b.est_rules);
    await updateRow(c.env, 'locations', c.id(), b, LC);
    await c.audit('update', 'location', c.id(), null, b);
    return json({ ok: true });
  });
  R.get('/api/settings', async (c) => {
    c.need('jobs.read');
    const rows = (await c.db.prepare('SELECT key,value FROM settings WHERE location_id=0').all()).results;
    const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    if (!c.can('shop.read')) return json({ shop_name: s.shop_name, vin_parts_provider: s.vin_parts_provider, model_library_url: s.model_library_url });
    const env = c.env;
    const kvn = new Set(((await c.db.prepare("SELECT name, value FROM private_kv WHERE name IN ('sms_user','sms_pass','sms_device','sms_method')").all().catch(() => null))?.results || []).map((r) => r.name === 'sms_method' ? 'm_' + r.value : r.name));
    const smsMethodNow = kvn.has('m_device') ? 'device' : kvn.has('m_manual') ? 'manual' : kvn.has('m_gateway') || (kvn.has('sms_user') && kvn.has('sms_pass')) ? 'gateway' : 'manual';
    const smsOn = smsMethodNow === 'device' ? kvn.has('sms_device') : smsMethodNow === 'gateway' ? kvn.has('sms_user') && kvn.has('sms_pass') : false;
    s.integrations = [
      { key: 'ai', name: 'AI damage detection + VIN / odometer reading', status: env.AI ? 'connected (Cloudflare Workers AI)' : 'not bound', real: !!env.AI },
      { key: 'vin', name: 'VIN decode (NHTSA vPIC)', status: 'connected (free public API)', real: true },
      { key: 'vin_parts', name: 'Parts catalog (PartsTech, Autodoc)', status: ({ partstech_autodoc: `PartsTech first for US VINs${env.PARTSTECH_PARTNER_ID ? '' : (env.PARTSTECH_USER_ID ? ' (waiting for partner keys from PartsTech; your user ID and API key are saved)' : ' (no PartsTech keys saved)')}, Autodoc backup${env.RAPIDAPI_KEY ? '' : ' (no key)'}`, autodoc: env.RAPIDAPI_KEY ? 'Autodoc live' : 'Autodoc selected, no key stored', autodoc_mock: 'Autodoc mock responses', partstech_mock: 'PartsTech mock responses' })[s.vin_parts_provider] || 'no catalog: parts are entered by hand', real: (s.vin_parts_provider === 'autodoc' && !!env.RAPIDAPI_KEY) || (s.vin_parts_provider === 'partstech_autodoc' && !!(env.PARTSTECH_PARTNER_ID || env.RAPIDAPI_KEY)), needs: 'PartsTech: partner ID and key (requested from PartsTech). Autodoc: free Basic plan subscription on RapidAPI (mainly European aftermarket)' },
      { key: 'estimating_db', name: 'Estimating database & P-pages (CCC ONE / Mitchell / Audatex)', status: 'placeholder: sample labor guide; EMS / BMS / CSV import + export work', real: false, needs: 'Licensed CCC ONE, Mitchell Cloud Estimating or Audatex Qapter seat and their partner API agreement' },
      { key: 'drp', name: 'Insurer DRP networks (assignments, approvals, e-payments)', status: 'placeholder: workflow tracked in-app; BMS export for submission', real: false, needs: 'Insurer DRP agreement and a network connection (CCC Secure Share, Mitchell Connect, Audatex/Solera)' },
      { key: 'parts_network', name: 'Parts ordering network', status: 'placeholder: sample quotes from editable price list; POs tracked in-app', real: false, needs: 'PartsTrader, CollisionLink (OEC) or vendor API accounts' },
      { key: 'paint', name: 'Paint supplier systems', status: 'placeholder: sample formulas; reorder CSV', real: false, needs: 'PPG LINQ / MoonWalk, Sherwin-Williams Collision Core, Axalta, or BASF account + API access' },
      { key: 'accounting', name: 'QuickBooks / Xero', status: 'export files work (IIF / CSV); live sync is a placeholder', real: false, needs: 'QuickBooks Online or Xero developer app + OAuth connection' },
      { key: 'sms', name: 'Text messages', status: smsMethodNow === 'device' ? (smsOn ? 'connected: sent from your phone (R&R Auto Express app)' : 'this phone selected, but no phone is linked yet: open Settings > Texting in the app') : smsMethodNow === 'gateway' ? (smsOn ? 'connected (SMS Gateway app)' : 'not set up: add the gateway username and password under Texting') : 'manual: texts open in your messaging app', real: smsOn, needs: 'Settings > Texting: this phone (R&R Auto Express Android app), the SMS Gateway app, or your messaging app' },
      { key: 'email', name: 'Email (Resend)', status: env.RESEND_API_KEY ? 'connected' : 'placeholder: emails are queued in the outbox', real: !!env.RESEND_API_KEY, needs: 'Resend (or similar) API key and a verified sending domain' },
      { key: 'payments', name: 'Card payments', status: 'placeholder: payments are recorded manually', real: false, needs: 'Stripe or Square account (card reader / payment links)' },
      { key: 'scan_tools', name: 'Scan tools (asTech, Opus IVS, Autel)', status: 'API endpoint ready: POST /api/v1/jobs/{RO}/scans with an API key; PDF upload works', real: false, needs: 'Vendor partner integration or a middleware that posts reports' },
      { key: 'storage', name: 'Photo / file storage', status: env.FILES ? 'Cloudflare R2' : 'Cloudflare D1 (chunked); move to R2 when enabled', real: true },
    ];
    return json(s);
  });
  R.put('/api/settings', async (c) => {
    c.need('admin.users');
    const allowed = ['shop_name', 'auto_status_updates', 'review_link', 'vin_parts_provider', 'accounting_target', 'disclaimer', 'estimate_footer', 'model_library_url', 'grid_density'];
    const stmts = [];
    for (const [k, v] of Object.entries(c.body || {})) if (allowed.includes(k)) stmts.push(c.db.prepare('INSERT INTO settings (location_id,key,value) VALUES (0,?,?) ON CONFLICT(location_id,key) DO UPDATE SET value=excluded.value').bind(k, String(v ?? '')));
    if (typeof c.body?.shop_name === 'string') {
      const nm = c.body.shop_name.trim().slice(0, 80);
      if (nm.length < 2) throw bad('Enter the shop name');
      stmts.push(c.db.prepare('UPDATE locations SET name=? WHERE id=(SELECT MIN(id) FROM locations)').bind(nm));
    }
    if (stmts.length) await c.db.batch(stmts);
    await c.audit('update', 'settings', null, null, c.body);
    return json({ ok: true });
  });
  R.get('/api/audit', async (c) => {
    c.need('audit.read');
    const lf = c.locFilter();
    const job = c.q('job');
    const r = job ? await c.db.prepare('SELECT * FROM audit_log WHERE job_id=? ORDER BY id DESC LIMIT 300').bind(Number(job)).all()
      : await c.db.prepare(`SELECT * FROM audit_log WHERE 1=1${lf.sql} ORDER BY id DESC LIMIT 300`).bind(...lf.args).all();
    return json(r.results);
  });
  R.get('/api/api-keys', async (c) => { c.need('admin.users'); return json((await c.db.prepare('SELECT id,name,prefix,scopes,location_id,active,last_used,created FROM api_keys ORDER BY id DESC').all()).results); });
  R.post('/api/api-keys', async (c) => {
    if (c.user.role !== 'owner') throw forbidden('Only an owner can create API keys');
    const key = 'ck_' + randomToken(24);
    const id = await insertRow(c.env, 'api_keys', { name: c.body.name || 'Integration', prefix: key.slice(0, 10), key_hash: await sha256Hex(key), scopes: c.body.scopes || 'scans,parts,crm', location_id: c.loc }, ['name', 'prefix', 'key_hash', 'scopes', 'location_id']);
    await c.audit('create', 'api_key', id, null, c.body.name);
    return json({ id, key, note: 'Copy this key now. It is shown only once.' });
  });
  R.del('/api/api-keys/:id', async (c) => { c.need('admin.users'); await c.db.prepare('UPDATE api_keys SET active=0 WHERE id=?').bind(c.id()).run(); await c.audit('revoke', 'api_key', c.id(), null, ''); return json({ ok: true }); });

  // Backup: JSON export of all business tables
  R.get('/api/backup', async (c) => {
    if (c.user.role !== 'owner') throw forbidden('Only an owner can download a full backup');
    const tables = ['locations', 'customers', 'vehicles', 'insurers', 'jobs', 'job_events', 'estimate_lines', 'supplements', 'ro_tasks', 'time_entries', 'sublets', 'vendors', 'parts', 'part_quotes', 'purchase_orders', 'schedule_events', 'rentals', 'messages', 'approvals', 'reviews', 'paint_formulas', 'paint_inventory', 'paint_usage', 'invoices', 'payments', 'adas_items', 'scans', 'weld_records', 'oem_docs', 'job_docs', 'compliance_logs', 'catalog_parts', 'settings', 'audit_log'];
    const out = { exported_at: nowIso(), app: 'CollisionPro', tables: {} };
    for (const t of tables) out.tables[t] = (await c.db.prepare(`SELECT * FROM ${t}`).all()).results;
    out.users = (await c.db.prepare('SELECT id,email,name,role,location_id,department,active FROM users').all()).results;
    out.files = (await c.db.prepare('SELECT id,job_id,category,kind,name,content_type,size,created FROM files').all()).results;
    await c.audit('backup', 'system', null, null, 'full JSON export');
    return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="collisionpro-backup-${today()}.json"` } });
  });

  // ---------- Integrations: estimate import/export (CSV, CIECA EMS-style, BMS-style XML), accounting export ----------
  R.get('/api/jobs/:id/export', async (c) => {
    c.need('jobs.read');
    const b = await jobBundle(c, c.id());
    const fmt = c.q('format', 'csv');
    const fn = `${b.job.number}`;
    if (fmt === 'csv') {
      const rows = b.lines.map((l) => ({ ...l, line_total: r2(num(l.qty, 1) * num(l.unit_price)) }));
      return text(toCsv(rows, ['line_no', 'supplement_no', 'area', 'operation', 'description', 'part_type', 'part_no', 'qty', 'unit_price', 'labor_type', 'labor_hours', 'teardown_hours', 'refinish_hours', 'sublet_amount', 'not_included', 'p_page_ref', 'oem_proc_ref', 'notes', 'line_total']), 'text/csv', { 'Content-Disposition': `attachment; filename="${fn}-estimate.csv"` });
    }
    if (fmt === 'ems') {
      // Pipe-delimited lines modeled on the CIECA EMS line file (LIN) fields; a real EMS export also needs the dBase envelope files.
      const head = ['#CollisionPro EMS-style export (not certified CIECA EMS)', `AD1|${b.customer?.name || ''}|${b.customer?.phone || ''}|${b.customer?.email || ''}`, `VEH|${b.vehicle?.vin || ''}|${b.vehicle?.year || ''}|${b.vehicle?.make || ''}|${b.vehicle?.model || ''}|${b.vehicle?.color || ''}|${b.vehicle?.odometer || ''}`, `CLM|${b.insurer?.name || ''}|${b.job.claim_no || ''}|${b.job.deductible || 0}`, 'LIN|LINE_NO|SUPP|LINE_IND|LINE_DESC|PART_TYPE|PART_NUM|PART_QTY|ACT_PRICE|MOD_LB_HRS|LBR_TYPE|TEAR_HRS|REFIN_HRS|NOT_INCL'];
      const ind = { replace: 'REPL', repair: 'RPR', 'r&i': 'R&I', refinish: 'RFN', blend: 'BLND', sublet: 'SUBL', misc: 'MISC' };
      const body = b.lines.map((l) => ['LIN', l.line_no, l.supplement_no, ind[l.operation] || l.operation, l.description, l.part_type || '', l.part_no || '', l.qty, l.unit_price, l.labor_hours, l.labor_type, l.teardown_hours, l.refinish_hours, l.not_included ? 'Y' : 'N'].join('|'));
      return text([...head, ...body].join('\n'), 'text/plain', { 'Content-Disposition': `attachment; filename="${fn}.ems.txt"` });
    }
    if (fmt === 'bms') {
      const t = b.totals;
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- BMS-style estimate (modeled on CIECA BMS VehicleDamageEstimateAddRq; not certified) -->
<VehicleDamageEstimateAddRq>
  <RqUID>${xmlEsc(b.job.number)}-${Date.now()}</RqUID>
  <DocumentInfo><BMSVer>5.2.0</BMSVer><DocumentType>E</DocumentType><DocumentID>${xmlEsc(b.job.number)}</DocumentID><CreateDateTime>${nowIso()}</CreateDateTime></DocumentInfo>
  <ClaimInfo><ClaimNum>${xmlEsc(b.job.claim_no)}</ClaimNum><PolicyInfo><PolicyNum>${xmlEsc(b.job.policy_no)}</PolicyNum><Deductible>${num(b.job.deductible)}</Deductible></PolicyInfo><InsuranceCompany>${xmlEsc(b.insurer?.name)}</InsuranceCompany></ClaimInfo>
  <Owner><Name>${xmlEsc(b.customer?.name)}</Name><Phone>${xmlEsc(b.customer?.phone)}</Phone><Email>${xmlEsc(b.customer?.email)}</Email></Owner>
  <VehicleInfo><VINInfo><VIN>${xmlEsc(b.vehicle?.vin)}</VIN></VINInfo><ModelYear>${xmlEsc(b.vehicle?.year)}</ModelYear><MakeDesc>${xmlEsc(b.vehicle?.make)}</MakeDesc><ModelName>${xmlEsc(b.vehicle?.model)}</ModelName><Odometer>${xmlEsc(b.vehicle?.odometer)}</Odometer><ExteriorColor>${xmlEsc(b.vehicle?.color)}</ExteriorColor><PaintCode>${xmlEsc(b.vehicle?.paint_code)}</PaintCode></VehicleInfo>
  <DamageLineInfo>
${b.lines.map((l) => `    <DamageLine><LineNum>${l.line_no}</LineNum><SupplementNum>${l.supplement_no}</SupplementNum><LineDesc>${xmlEsc(l.description)}</LineDesc><Operation>${xmlEsc(l.operation)}</Operation><PartInfo><PartType>${xmlEsc(l.part_type)}</PartType><PartNum>${xmlEsc(l.part_no)}</PartNum><Quantity>${l.qty}</Quantity><PartPrice>${l.unit_price}</PartPrice></PartInfo><LaborInfo><LaborType>${xmlEsc(l.labor_type)}</LaborType><LaborHours>${l.labor_hours}</LaborHours><TeardownHours>${l.teardown_hours}</TeardownHours><RefinishHours>${l.refinish_hours}</RefinishHours><NotIncluded>${l.not_included ? 'Y' : 'N'}</NotIncluded></LaborInfo></DamageLine>`).join('\n')}
  </DamageLineInfo>
  <RepairTotalsInfo><PartsTotal>${t.parts}</PartsTotal><LaborTotal>${t.labor}</LaborTotal><TeardownTotal>${t.teardown}</TeardownTotal><PaintMaterials>${t.paint_materials}</PaintMaterials><SubletTotal>${t.sublet}</SubletTotal><Tax>${t.tax}</Tax><GrossTotal>${t.total}</GrossTotal></RepairTotalsInfo>
</VehicleDamageEstimateAddRq>`;
      return text(xml, 'application/xml', { 'Content-Disposition': `attachment; filename="${fn}.bms.xml"` });
    }
    throw bad('Unknown format');
  });
  R.post('/api/jobs/:id/import', async (c) => {
    c.need('estimate.write');
    const job = await c.job(c.id());
    const raw = typeof c.body === 'string' ? c.body : c.body.text || '';
    if (!raw.trim()) throw bad('Paste or upload a CSV, EMS-style or BMS-style file');
    let rows = [];
    if (raw.includes('<DamageLine')) {
      const get = (s, t) => (s.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1] || '';
      rows = [...raw.matchAll(/<DamageLine>([\s\S]*?)<\/DamageLine>/g)].map((m) => ({ description: get(m[1], 'LineDesc'), operation: get(m[1], 'Operation'), part_type: get(m[1], 'PartType'), part_no: get(m[1], 'PartNum'), qty: get(m[1], 'Quantity'), unit_price: get(m[1], 'PartPrice'), labor_type: get(m[1], 'LaborType'), labor_hours: get(m[1], 'LaborHours'), teardown_hours: get(m[1], 'TeardownHours'), refinish_hours: get(m[1], 'RefinishHours'), not_included: get(m[1], 'NotIncluded') === 'Y' ? 1 : 0 }));
    } else if (/^LIN\|/m.test(raw)) {
      const map = { REPL: 'replace', RPR: 'repair', 'R&I': 'r&i', RFN: 'refinish', BLND: 'blend', SUBL: 'sublet', MISC: 'misc' };
      rows = raw.split(/\r?\n/).filter((l) => l.startsWith('LIN|') && !l.startsWith('LIN|LINE_NO')).map((l) => { const f = l.split('|'); return { operation: map[f[3]] || 'misc', description: f[4], part_type: f[5], part_no: f[6], qty: f[7], unit_price: f[8], labor_hours: f[9], labor_type: f[10], teardown_hours: f[11], refinish_hours: f[12], not_included: f[13] === 'Y' ? 1 : 0 }; });
    } else rows = parseCsv(raw);
    const ops = ['replace', 'repair', 'r&i', 'refinish', 'blend', 'sublet', 'misc'];
    const stmts = [];
    for (const r of rows) {
      if (!r.description) continue;
      const op = ops.includes(String(r.operation || '').toLowerCase()) ? String(r.operation).toLowerCase() : 'misc';
      stmts.push(c.db.prepare('INSERT INTO estimate_lines (job_id,supplement_no,line_no,area,operation,description,part_type,part_no,qty,unit_price,labor_type,labor_hours,teardown_hours,refinish_hours,sublet_amount,not_included,p_page_ref,notes,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(job.id, num(r.supplement_no), 9999, r.area || '', op, String(r.description).slice(0, 200), r.part_type || '', r.part_no || '', num(r.qty, 1), num(r.unit_price), ['body', 'frame', 'mech', 'structural', 'glass'].includes(r.labor_type) ? r.labor_type : 'body', num(r.labor_hours), num(r.teardown_hours), num(r.refinish_hours), num(r.sublet_amount), num(r.not_included) ? 1 : 0, r.p_page_ref || '', r.notes || 'Imported', 'import'));
    }
    if (!stmts.length) throw bad('No estimate lines found in that file');
    for (let i = 0; i < stmts.length; i += 50) await c.db.batch(stmts.slice(i, i + 50));
    const all = (await c.db.prepare('SELECT id FROM estimate_lines WHERE job_id=? ORDER BY supplement_no, line_no, id').bind(job.id).all()).results;
    await c.db.batch(all.map((r, i) => c.db.prepare('UPDATE estimate_lines SET line_no=? WHERE id=?').bind(i + 1, r.id)));
    await c.audit('import', 'job', job.id, job.id, `${stmts.length} lines`);
    return json({ imported: stmts.length });
  });
  R.get('/api/accounting/export', async (c) => {
    c.need('accounting.read');
    const fmt = c.q('format', 'csv');
    const lf = c.locFilter('i');
    const inv = (await c.db.prepare(`SELECT i.*, j.number AS ro, cu.name AS customer_name, ins.name AS insurer_name FROM invoices i JOIN jobs j ON j.id=i.job_id LEFT JOIN customers cu ON cu.id=j.customer_id LEFT JOIN insurers ins ON ins.id=j.insurer_id WHERE i.status<>'void'${lf.sql} ORDER BY i.id`).bind(...lf.args).all()).results;
    const pays = (await c.db.prepare(`SELECT p.*, i.number AS invoice_no FROM payments p JOIN invoices i ON i.id=p.invoice_id WHERE 1=1${lf.sql} ORDER BY p.id`).bind(...lf.args).all()).results;
    await c.db.prepare("UPDATE invoices SET exported_at=? WHERE exported_at IS NULL").bind(nowIso()).run();
    await c.audit('accounting_export', 'invoices', null, null, `${fmt}: ${inv.length} invoices, ${pays.length} payments`);
    if (fmt === 'iif') {
      // QuickBooks Desktop IIF
      const L = ['!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO', '!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO', '!ENDTRNS'];
      for (const i of inv) {
        const d = i.created.slice(5, 7) + '/' + i.created.slice(8, 10) + '/' + i.created.slice(0, 4);
        const name = (i.bill_to || i.customer_name || '').replace(/\t/g, ' ');
        L.push(`TRNS\tINVOICE\t${d}\tAccounts Receivable\t${name}\t${i.total}\t${i.number}\tRO ${i.ro}`);
        for (const [acct, amt] of [['Parts Sales', i.parts], ['Labor Sales', i.labor], ['Paint & Materials Sales', i.paint], ['Sublet Sales', i.sublet], ['Other Sales', i.other], ['Sales Tax Payable', i.tax]]) if (num(amt)) L.push(`SPL\tINVOICE\t${d}\t${acct}\t${name}\t${-num(amt)}\t${i.number}\t`);
        L.push('ENDTRNS');
      }
      return text(L.join('\r\n'), 'text/plain', { 'Content-Disposition': 'attachment; filename="collisionpro-quickbooks.iif"' });
    }
    // Xero / QuickBooks Online invoice CSV
    const rows = [];
    for (const i of inv) for (const [item, amt] of [['Parts', i.parts], ['Labor', i.labor], ['Paint & materials', i.paint], ['Sublet', i.sublet], ['Other', i.other]]) if (num(amt)) rows.push({ ContactName: i.bill_to || i.customer_name, InvoiceNumber: i.number, Reference: i.ro, InvoiceDate: i.created.slice(0, 10), DueDate: i.due_date, Description: item, Quantity: 1, UnitAmount: amt, TaxAmount: item === 'Parts' ? i.tax : 0, AccountCode: { Parts: '4000', Labor: '4100', 'Paint & materials': '4200', Sublet: '4300', Other: '4900' }[item] });
    return text(toCsv(rows, ['ContactName', 'InvoiceNumber', 'Reference', 'InvoiceDate', 'DueDate', 'Description', 'Quantity', 'UnitAmount', 'TaxAmount', 'AccountCode']), 'text/csv', { 'Content-Disposition': 'attachment; filename="collisionpro-invoices.csv"' });
  });
}

function weekStart(s) {
  const d = new Date((s || today()).slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
