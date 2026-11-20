// Production board, RO tasks, time clock, sublets, parts, vendors, insurers, scheduling,
// rentals, customer messages, ADAS/scans/welds/OEM docs, EPA/OSHA logs.
import { json, bad, notFound, HttpError, r2, num, nowIso, today, addDays, daysBetween, parseJsonCol } from './util.js';
import { STAGES, STAGE_KEYS, DEFAULT_STAGE_ALERT_HOURS, stageMessage, deliverMessage, rescheduleForParts, detectAdas, computeTotals } from './logic.js';
import { nextNumber, updateRow, insertRow } from './core.js';
import { jobBundle, catalogFor } from './r_jobs.js';

const DEPT_OF_STAGE = { body: 'body', frame: 'frame', paint: 'paint', reassembly: 'body', mechanical: 'mechanical', detail: 'detail', adas: 'mechanical', teardown: 'body' };

export async function sendCustomerMessage(c, job, { channel, body, subject, auto = 0 }) {
  const cust = await c.db.prepare('SELECT * FROM customers WHERE id=?').bind(job.customer_id).first();
  if (!cust) return null;
  const ch = channel || (cust.contact_pref === 'email' ? 'email' : 'sms');
  if (ch === 'sms' && !cust.sms_opt_in) return null;
  const msg = { channel: ch, to_addr: ch === 'email' ? cust.email : ch === 'sms' ? cust.phone : 'portal', subject: subject || 'Your repair update', body };
  msg.status = await deliverMessage(c.env, msg);
  const ins = await c.db.prepare("INSERT INTO messages (job_id,customer_id,channel,to_addr,subject,body,status,auto,direction,ext_id,error,user_name,read_at) VALUES (?,?,?,?,?,?,?,?,'out',?,?,?,datetime('now'))").bind(job.id, cust.id, msg.channel, msg.to_addr, msg.subject, msg.body, msg.status, auto ? 1 : 0, msg.ext_id || null, msg.error || null, c.user?.name || null).run();
  msg.id = ins.meta?.last_row_id; msg.customer_name = cust.name; msg.phone = cust.phone;
  return msg;
}

export function portalUrl(c, job) { return `${c.url.origin}/p/${job.portal_token}`; }

export function registerOps(R) {
  // ---------- Production board ----------
  R.get('/api/board', async (c) => {
    c.need('shop.read');
    const lf = c.locFilter('j');
    const r = await c.db.prepare(`SELECT j.id, j.number, j.stage, j.stage_since, j.status, j.target_date, j.priority, j.key_in_at, j.location_id, j.drp_status,
      c.name AS customer_name, v.year, v.make, v.model, v.color, i.name AS insurer_name,
      (SELECT COUNT(*) FROM parts p WHERE p.job_id=j.id AND p.status IN ('needed','quoted','ordered','shipped','backordered')) AS parts_open,
      (SELECT COUNT(*) FROM parts p WHERE p.job_id=j.id AND p.status='backordered') AS parts_backordered,
      (SELECT COUNT(*) FROM parts p WHERE p.job_id=j.id AND p.condition IN ('wrong part','damaged','missing')) AS parts_problem,
      (SELECT MAX(eta) FROM parts p WHERE p.job_id=j.id AND p.status IN ('ordered','shipped','backordered')) AS parts_eta,
      (SELECT COALESCE(SUM(labor_hours+teardown_hours),0) FROM estimate_lines e WHERE e.job_id=j.id) AS body_hours,
      (SELECT COALESCE(SUM(refinish_hours),0) FROM estimate_lines e WHERE e.job_id=j.id) AS paint_hours,
      (SELECT GROUP_CONCAT(DISTINCT u.name) FROM ro_tasks t JOIN users u ON u.id=t.tech_id WHERE t.job_id=j.id AND t.status<>'done') AS techs,
      (SELECT COUNT(*) FROM sublets s WHERE s.job_id=j.id AND s.status<>'done') AS sublets_open,
      (SELECT COUNT(*) FROM adas_items a WHERE a.job_id=j.id AND a.status IN ('needed','sublet')) AS adas_open,
      (SELECT id FROM files f WHERE f.job_id=j.id AND f.category='photo' AND f.kind NOT IN ('vin','odometer','signature') ORDER BY f.id LIMIT 1) AS thumb
      FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN vehicles v ON v.id=j.vehicle_id LEFT JOIN insurers i ON i.id=j.insurer_id
      WHERE j.status IN ('approved','scheduled','in_production','completed')${lf.sql} ORDER BY j.priority DESC, j.target_date`).bind(...lf.args).all();
    const loc = c.loc ? await c.location() : null;
    const limits = { ...DEFAULT_STAGE_ALERT_HOURS, ...(parseJsonCol(loc?.stage_alert_hours, {}) || {}) };
    const now = Date.now();
    for (const j of r.results) {
      const hrs = j.stage_since ? (now - new Date(j.stage_since.replace(' ', 'T') + 'Z').getTime()) / 3600000 : 0;
      j.hours_in_stage = Math.round(hrs * 10) / 10;
      j.alerts = [];
      if (hrs > (limits[j.stage] || 48)) j.alerts.push(`In ${j.stage.replace('_', ' ')} ${Math.round(hrs)}h (limit ${limits[j.stage] || 48}h)`);
      if (j.target_date && j.target_date.slice(0, 10) < today() && j.stage !== 'ready') j.alerts.push('Past target date');
      else if (j.target_date && daysBetween(today(), j.target_date.slice(0, 10)) <= 1 && STAGE_KEYS.indexOf(j.stage) < STAGE_KEYS.indexOf('reassembly')) j.alerts.push('Due within 1 day, not yet in reassembly');
      if (j.parts_backordered) j.alerts.push(`${j.parts_backordered} part(s) backordered`);
      if (j.parts_problem) j.alerts.push(`${j.parts_problem} part(s) wrong/damaged`);
      if (j.stage === 'ready' && j.adas_open) j.alerts.push('ADAS calibration not documented');
    }
    const counts = Object.fromEntries(STAGES.map(([k]) => [k, r.results.filter((j) => j.stage === k).length]));
    const bottleneck = Object.entries(counts).filter(([k]) => k !== 'ready').sort((a, b) => b[1] - a[1])[0];
    // Estimates not yet on the board (so the owner can start the repair from here)
    const est = (await c.db.prepare(`SELECT j.id, j.number, j.status, j.created, j.target_date, c.name AS customer_name, v.year, v.make, v.model, v.color
      FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN vehicles v ON v.id=j.vehicle_id
      WHERE j.status='estimate'${lf.sql} ORDER BY j.id DESC LIMIT 60`).bind(...lf.args).all()).results;
    return json({ stages: STAGES, jobs: r.results, counts, estimates: est, bottleneck: bottleneck && bottleneck[1] >= 3 ? { stage: bottleneck[0], count: bottleneck[1] } : null });
  });

  R.put('/api/jobs/:id/stage', async (c) => {
    c.need('production.write');
    const job = await c.job(c.id());
    const stage = c.body.stage;
    if (!STAGE_KEYS.includes(stage)) throw bad('Unknown stage');
    if (['delivered', 'closed', 'total_loss', 'lost'].includes(job.status)) throw bad('This job is closed. Reopen it before moving it.');
    if (stage === job.stage && !(c.body.start && ['estimate', 'approved', 'scheduled'].includes(job.status))) return json({ ok: true });
    const now = nowIso();
    const upd = { stage, stage_since: now, updated: now };
    if (['approved', 'scheduled', 'estimate'].includes(job.status)) upd.status = 'in_production';
    if (!job.key_in_at) upd.key_in_at = now;
    if (!job.repair_start_at && ['body', 'frame', 'paint', 'teardown'].includes(stage)) upd.repair_start_at = now;
    if (stage === 'ready') { upd.status = 'completed'; upd.completed_at = now; }
    else if (job.status === 'completed') upd.status = 'in_production';
    await updateRow(c.env, 'jobs', job.id, upd, ['stage', 'stage_since', 'updated', 'status', 'key_in_at', 'repair_start_at', 'completed_at']);
    const label = Object.fromEntries(STAGES)[stage];
    await c.event(job.id, 'stage', `Moved to ${label}`);
    await c.audit('stage', 'job', job.id, job.id, `${job.stage} -> ${stage}`);
    // Automated customer status update
    let sent = null;
    const auto = await c.db.prepare("SELECT value FROM settings WHERE location_id=0 AND key='auto_status_updates'").first();
    if (c.body.notify !== false && (auto?.value ?? '1') === '1') {
      const cust = await c.db.prepare('SELECT * FROM customers WHERE id=?').bind(job.customer_id).first();
      const veh = await c.db.prepare('SELECT * FROM vehicles WHERE id=?').bind(job.vehicle_id).first();
      const body = stageMessage(stage, cust, veh, portalUrl(c, job));
      if (body) sent = await sendCustomerMessage(c, job, { body, auto: 1, subject: `Repair update: ${label}` });
    }
    return json({ ok: true, message: sent });
  });

  // Hand the car back: closes the job on the production board
  R.post('/api/jobs/:id/deliver', async (c) => {
    c.need('production.write');
    const job = await c.job(c.id());
    if (!['in_production', 'completed', 'approved', 'scheduled'].includes(job.status)) throw bad('Only jobs on the production board can be delivered');
    const now = nowIso();
    await updateRow(c.env, 'jobs', job.id, { status: 'delivered', delivered_at: now, updated: now, completed_at: job.completed_at || now }, ['status', 'delivered_at', 'updated', 'completed_at']);
    await c.event(job.id, 'status', 'Delivered to customer');
    await c.audit('deliver', 'job', job.id, job.id, '');
    return json({ ok: true });
  });

  // Build the repair order from the approved estimate: tasks by department, parts, sublets, ADAS
  R.post('/api/jobs/:id/build-ro', async (c) => {
    c.need('production.write');
    const b = await jobBundle(c, c.id());
    const job = b.job;
    const L = b.lines;
    const sum = (f) => r2(L.reduce((a, l) => a + f(l), 0));
    const want = [
      ['body', 'Body repair & R&I', sum((l) => (['body', 'glass'].includes(l.labor_type) ? num(l.labor_hours) : 0) + num(l.teardown_hours))],
      ['frame', 'Frame / structural', sum((l) => (['frame', 'structural'].includes(l.labor_type) ? num(l.labor_hours) : 0))],
      ['paint', 'Refinish', sum((l) => num(l.refinish_hours))],
      ['mechanical', 'Mechanical / electrical', sum((l) => (l.labor_type === 'mech' ? num(l.labor_hours) : 0))],
      ['detail', 'Detail & clean-up', 1.0],
    ].filter((t) => t[2] > 0);
    const techs = (await c.db.prepare("SELECT id, department FROM users WHERE role='technician' AND active=1 AND (location_id IS NULL OR location_id=?) ORDER BY id").bind(job.location_id).all()).results;
    const stmts = [];
    const haveTask = new Set(b.tasks.map((t) => t.department));
    for (const [dept, desc, hrs] of want) {
      if (haveTask.has(dept)) continue;
      const tech = techs.find((t) => t.department === dept) || (dept === 'frame' ? techs.find((t) => t.department === 'body') : null);
      stmts.push(c.db.prepare('INSERT INTO ro_tasks (job_id,department,description,tech_id,flagged_hours) VALUES (?,?,?,?,?)').bind(job.id, dept, desc, tech?.id || null, hrs));
    }
    // Parts from replace lines
    const haveParts = new Set(b.parts.map((p) => p.line_id));
    for (const l of L) {
      if (l.operation !== 'replace' || !l.part_type || haveParts.has(l.id)) continue;
      stmts.push(c.db.prepare('INSERT INTO parts (job_id,line_id,part_no,description,part_type,qty,list_price,sell_price,status) VALUES (?,?,?,?,?,?,?,?,?)').bind(job.id, l.id, l.part_no || '', l.description, l.part_type, num(l.qty, 1), num(l.unit_price), num(l.unit_price), 'needed'));
    }
    // Sublets from sublet lines
    const haveSub = new Set(b.sublets.map((s) => s.type + '|' + s.notes));
    for (const l of L.filter((l) => l.operation === 'sublet')) {
      const type = /glass|windshield/i.test(l.description) ? 'glass' : /align/i.test(l.description) ? 'alignment' : /calibrat|adas/i.test(l.description) ? 'ADAS calibration' : 'other';
      if (!haveSub.has(type + '|' + l.description)) stmts.push(c.db.prepare('INSERT INTO sublets (job_id,type,price,notes,status) VALUES (?,?,?,?,?)').bind(job.id, type, num(l.sublet_amount) || num(l.unit_price), l.description, 'needed'));
    }
    // ADAS items from rules
    const haveAdas = new Set(b.adas.map((a) => a.system));
    for (const a of b.adas_suggested) if (!haveAdas.has(a.system)) stmts.push(c.db.prepare('INSERT INTO adas_items (job_id,system,reason,calibration,required,status) VALUES (?,?,?,?,?,?)').bind(job.id, a.system, a.reason, a.calibration, a.required, a.required ? 'needed' : 'not required'));
    const upd = { updated: nowIso() };
    if (job.status === 'estimate') { upd.status = 'approved'; upd.approved_at = nowIso(); upd.approved_by = c.user.name; }
    if (!job.target_date) {
      const flag = want.reduce((a, t) => a + t[2], 0);
      upd.target_date = addDays(job.drop_off_at || today(), Math.max(2, Math.ceil(flag / 6) + 1));
    }
    if (stmts.length) await c.db.batch(stmts);
    await updateRow(c.env, 'jobs', job.id, upd, ['updated', 'status', 'approved_at', 'approved_by', 'target_date']);
    await c.event(job.id, 'ro', `Repair order built: ${want.length} department task(s), parts, sublets and ADAS items`);
    await c.audit('build_ro', 'job', job.id, job.id, { tasks: want.length, stmts: stmts.length });
    return json({ ok: true, created: stmts.length });
  });

  // ---------- Tasks & time clock ----------
  R.post('/api/jobs/:id/tasks', async (c) => {
    c.need('production.write');
    const job = await c.job(c.id());
    const id = await insertRow(c.env, 'ro_tasks', { ...c.body, job_id: job.id }, ['job_id', 'department', 'description', 'tech_id', 'flagged_hours', 'status']);
    await c.audit('create', 'task', id, job.id, c.body);
    return json({ id });
  });
  R.put('/api/tasks/:id', async (c) => {
    c.need('production.write');
    const t = await c.db.prepare('SELECT * FROM ro_tasks WHERE id=?').bind(c.id()).first();
    if (!t) throw notFound();
    await c.job(t.job_id);
    const b = { ...c.body };
    if (b.status === 'done' && t.status !== 'done') b.finished_at = nowIso();
    if (b.status === 'in_progress' && !t.started_at) b.started_at = nowIso();
    await updateRow(c.env, 'ro_tasks', t.id, b, ['department', 'description', 'tech_id', 'flagged_hours', 'status', 'started_at', 'finished_at']);
    await c.audit('update', 'task', t.id, t.job_id, b);
    return json({ ok: true });
  });
  R.post('/api/tasks/:id/clock', async (c) => {
    c.need('time.write');
    const t = await c.db.prepare('SELECT * FROM ro_tasks WHERE id=?').bind(c.id()).first();
    if (!t) throw notFound();
    await c.job(t.job_id);
    const techId = c.user.role === 'technician' ? c.user.id : Number(c.body.tech_id) || t.tech_id || c.user.id;
    const open = await c.db.prepare('SELECT * FROM time_entries WHERE tech_id=? AND clock_out IS NULL').bind(techId).first();
    if (c.body.action === 'out' || (open && open.task_id === t.id && c.body.action !== 'in')) {
      if (!open) throw bad('Not clocked in');
      const mins = Math.max(0, (Date.now() - new Date(open.clock_in.replace(' ', 'T') + 'Z').getTime()) / 60000);
      await c.db.prepare('UPDATE time_entries SET clock_out=?, minutes=? WHERE id=?').bind(nowIso(), r2(mins), open.id).run();
      await c.audit('clock_out', 'time', open.id, open.job_id, `${r2(mins)} min`);
      return json({ clocked: 'out', minutes: r2(mins) });
    }
    if (open) { // switching jobs: close the open one first
      const mins = Math.max(0, (Date.now() - new Date(open.clock_in.replace(' ', 'T') + 'Z').getTime()) / 60000);
      await c.db.prepare('UPDATE time_entries SET clock_out=?, minutes=? WHERE id=?').bind(nowIso(), r2(mins), open.id).run();
    }
    const id = await insertRow(c.env, 'time_entries', { job_id: t.job_id, task_id: t.id, tech_id: techId, clock_in: nowIso() }, ['job_id', 'task_id', 'tech_id', 'clock_in']);
    if (t.status === 'pending') await c.db.prepare("UPDATE ro_tasks SET status='in_progress', started_at=? WHERE id=?").bind(nowIso(), t.id).run();
    await c.audit('clock_in', 'time', id, t.job_id, t.department);
    return json({ clocked: 'in', id });
  });
  R.get('/api/tech/me', async (c) => {
    c.need('shop.read');
    const tasks = await c.db.prepare(`SELECT t.*, j.number, j.stage, v.year, v.make, v.model, v.color FROM ro_tasks t JOIN jobs j ON j.id=t.job_id LEFT JOIN vehicles v ON v.id=j.vehicle_id
      WHERE t.tech_id=? AND t.status<>'done' AND j.status NOT IN ('delivered','closed') ORDER BY j.priority DESC, j.target_date`).bind(c.user.id).all();
    const open = await c.db.prepare('SELECT * FROM time_entries WHERE tech_id=? AND clock_out IS NULL').bind(c.user.id).first();
    const week = await c.db.prepare("SELECT COALESCE(SUM(minutes),0)/60.0 AS clocked FROM time_entries WHERE tech_id=? AND clock_in >= date('now','-7 days')").bind(c.user.id).first();
    const flagged = await c.db.prepare("SELECT COALESCE(SUM(flagged_hours),0) AS f FROM ro_tasks WHERE tech_id=? AND status='done' AND finished_at >= date('now','-7 days')").bind(c.user.id).first();
    return json({ tasks: tasks.results, open, week_clocked: r2(week.clocked), week_flagged: r2(flagged.f) });
  });
  R.post('/api/jobs/:id/time', async (c) => { // manual time entry
    c.need('time.write');
    const job = await c.job(c.id());
    const id = await insertRow(c.env, 'time_entries', { ...c.body, job_id: job.id }, ['job_id', 'task_id', 'tech_id', 'clock_in', 'clock_out', 'minutes', 'note']);
    await c.audit('create', 'time', id, job.id, c.body);
    return json({ id });
  });

  // ---------- Sublets ----------
  R.post('/api/jobs/:id/sublets', async (c) => {
    c.need('production.write');
    const job = await c.job(c.id());
    const id = await insertRow(c.env, 'sublets', { ...c.body, job_id: job.id }, ['job_id', 'type', 'vendor', 'po', 'cost', 'price', 'status', 'due', 'notes']);
    await c.event(job.id, 'sublet', `Sublet added: ${c.body.type || ''} ${c.body.vendor || ''}`);
    await c.audit('create', 'sublet', id, job.id, c.body);
    return json({ id });
  });
  R.put('/api/sublets/:id', async (c) => {
    c.need('production.write');
    const s = await c.db.prepare('SELECT * FROM sublets WHERE id=?').bind(c.id()).first();
    if (!s) throw notFound();
    await c.job(s.job_id);
    await updateRow(c.env, 'sublets', s.id, c.body, ['type', 'vendor', 'po', 'cost', 'price', 'status', 'due', 'notes']);
    if (c.body.status && c.body.status !== s.status) await c.event(s.job_id, 'sublet', `${s.type} sublet: ${c.body.status}`);
    await c.audit('update', 'sublet', s.id, s.job_id, c.body);
    return json({ ok: true });
  });

  // ---------- Parts ----------
  R.get('/api/parts', async (c) => {
    c.need('parts.read');
    const lf = c.locFilter('j');
    const st = c.q('status');
    let sql = `SELECT p.*, v.name AS vendor_name, j.number, j.id AS job_id, j.target_date, ve.year, ve.make, ve.model FROM parts p JOIN jobs j ON j.id=p.job_id LEFT JOIN vendors v ON v.id=p.vendor_id LEFT JOIN vehicles ve ON ve.id=j.vehicle_id WHERE 1=1${lf.sql}`;
    const args = [...lf.args];
    if (st === 'open') sql += " AND p.status IN ('needed','quoted','ordered','shipped','backordered')";
    else if (st === 'problems') sql += " AND (p.condition IN ('wrong part','damaged','missing') OR p.status='backordered')";
    else if (st === 'returns') sql += " AND (p.status='returned' OR (p.core_charge>0 AND p.core_returned=0))";
    else if (st) { sql += ' AND p.status=?'; args.push(st); }
    sql += ' ORDER BY p.id DESC LIMIT 500';
    return json((await c.db.prepare(sql).bind(...args).all()).results);
  });
  R.post('/api/jobs/:id/parts', async (c) => {
    c.need('parts.write');
    const job = await c.job(c.id());
    const id = await insertRow(c.env, 'parts', { ...c.body, job_id: job.id }, ['job_id', 'line_id', 'part_no', 'description', 'part_type', 'qty', 'list_price', 'cost', 'sell_price', 'vendor_id', 'status', 'eta', 'core_charge', 'notes']);
    await c.audit('create', 'part', id, job.id, c.body);
    return json({ id });
  });
  R.put('/api/parts/:id', async (c) => {
    c.need('parts.write');
    const p = await c.db.prepare('SELECT * FROM parts WHERE id=?').bind(c.id()).first();
    if (!p) throw notFound();
    await c.job(p.job_id);
    const b = { ...c.body };
    if (b.status === 'received' && p.status !== 'received') b.received_at = nowIso();
    if (b.status === 'ordered' && !p.ordered_at) b.ordered_at = nowIso();
    await updateRow(c.env, 'parts', p.id, b, ['part_no', 'description', 'part_type', 'qty', 'list_price', 'cost', 'sell_price', 'vendor_id', 'status', 'eta', 'ordered_at', 'received_at', 'condition', 'core_charge', 'core_returned', 'return_reason', 'credit_amount', 'credit_status', 'notes']);
    if (b.status && b.status !== p.status) await c.event(p.job_id, 'part', `${p.description}: ${b.status}${b.eta ? ' (ETA ' + b.eta + ')' : ''}`);
    await c.audit('update', 'part', p.id, p.job_id, b);
    let resched = null;
    if ((b.status === 'backordered' || (b.eta && b.eta !== p.eta))) resched = await rescheduleForParts(c.env, p.job_id, c.user.name);
    return json({ ok: true, rescheduled: resched });
  });
  // Receive at delivery, with condition check (wrong / damaged alerts)
  R.post('/api/parts/:id/receive', async (c) => {
    c.need('parts.write');
    const p = await c.db.prepare('SELECT * FROM parts WHERE id=?').bind(c.id()).first();
    if (!p) throw notFound();
    const job = await c.job(p.job_id);
    const cond = ['ok', 'wrong part', 'damaged', 'missing'].includes(c.body.condition) ? c.body.condition : 'ok';
    const status = cond === 'ok' ? 'received' : cond === 'missing' ? p.status : 'received';
    await c.db.prepare('UPDATE parts SET status=?, condition=?, received_at=?, notes=COALESCE(?, notes) WHERE id=?').bind(status, cond, nowIso(), c.body.notes || null, p.id).run();
    await c.event(job.id, cond === 'ok' ? 'part' : 'alert', cond === 'ok' ? `${p.description} received` : `ALERT: ${p.description} arrived ${cond}. Return / reorder needed.`);
    await c.audit('receive', 'part', p.id, job.id, cond);
    const left = await c.db.prepare("SELECT COUNT(*) AS n FROM parts WHERE job_id=? AND status IN ('needed','quoted','ordered','shipped','backordered')").bind(job.id).first();
    return json({ ok: true, alert: cond !== 'ok' ? `${p.description} arrived ${cond}` : null, all_received: left.n === 0 });
  });
  R.post('/api/parts/:id/return', async (c) => {
    c.need('parts.write');
    const p = await c.db.prepare('SELECT * FROM parts WHERE id=?').bind(c.id()).first();
    if (!p) throw notFound();
    await c.job(p.job_id);
    const credit = num(c.body.credit_amount, num(p.cost) * num(p.qty, 1));
    if (c.body.core) {
      await c.db.prepare("UPDATE parts SET core_returned=1, credit_amount=credit_amount+?, credit_status='pending' WHERE id=?").bind(num(p.core_charge), p.id).run();
      await c.event(p.job_id, 'part', `Core returned for ${p.description} (credit $${num(p.core_charge)} pending)`);
    } else {
      await c.db.prepare("UPDATE parts SET status='returned', return_reason=?, credit_amount=?, credit_status='pending' WHERE id=?").bind(c.body.reason || 'returned', credit, p.id).run();
      await c.event(p.job_id, 'part', `${p.description} returned: ${c.body.reason || ''} (credit $${credit} pending)`);
      if (c.body.reorder) {
        await c.db.prepare('INSERT INTO parts (job_id,line_id,part_no,description,part_type,qty,list_price,sell_price,vendor_id,status) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(p.job_id, p.line_id, p.part_no, p.description, p.part_type, p.qty, p.list_price, p.sell_price, p.vendor_id, 'needed').run();
      }
    }
    await c.audit('return', 'part', p.id, p.job_id, c.body);
    return json({ ok: true });
  });
  R.post('/api/parts/:id/credit', async (c) => {
    c.need('parts.write');
    await c.db.prepare("UPDATE parts SET credit_status='received' WHERE id=?").bind(c.id()).run();
    await c.audit('credit_received', 'part', c.id(), null, '');
    return json({ ok: true });
  });
  // Request quotes from all vendors (mock adapter: computes SAMPLE quotes from the editable catalog prices and vendor discounts)
  R.post('/api/jobs/:id/request-quotes', async (c) => {
    c.need('parts.write');
    const job = await c.job(c.id());
    const parts = (await c.db.prepare("SELECT p.*, e.catalog_key FROM parts p LEFT JOIN estimate_lines e ON e.id=p.line_id WHERE p.job_id=? AND p.status IN ('needed','quoted')").bind(job.id).all()).results;
    const vendors = (await c.db.prepare("SELECT * FROM vendors WHERE type IN ('OEM dealer','aftermarket','recycled','reconditioned')").all()).results;
    const cat = Object.fromEntries((await catalogFor(c.env)).map((r) => [r.key, r]));
    const stmts = [];
    for (const p of parts) {
      stmts.push(c.db.prepare("DELETE FROM part_quotes WHERE part_id=? AND source='sample'").bind(p.id));
      const row = cat[p.catalog_key];
      for (const v of vendors) {
        const typeKey = { 'OEM dealer': 'OEM', aftermarket: 'aftermarket', recycled: 'recycled', reconditioned: 'reconditioned' }[v.type];
        const list = row ? row[{ OEM: 'price_oem', aftermarket: 'price_aftermarket', recycled: 'price_recycled', reconditioned: 'price_reconditioned' }[typeKey]] : typeKey === p.part_type ? p.list_price : null;
        if (!list) continue;
        // deterministic small variation per vendor so the comparison is visible
        const wobble = 1 + (((p.id * 7 + v.id * 13) % 9) - 4) / 100;
        const price = r2(list * (1 - num(v.discount_pct) / 100) * wobble);
        const inStock = (p.id + v.id) % 5 !== 0 ? 1 : 0;
        stmts.push(c.db.prepare("INSERT INTO part_quotes (part_id,vendor_id,part_type,price,list_price,eta_days,in_stock,source) VALUES (?,?,?,?,?,?,?, 'sample')").bind(p.id, v.id, typeKey, price, list, inStock ? num(v.avg_delivery_days, 1) : num(v.avg_delivery_days, 1) + 5, inStock));
      }
      stmts.push(c.db.prepare("UPDATE parts SET status='quoted' WHERE id=? AND status='needed'").bind(p.id));
    }
    if (stmts.length) await c.db.batch(stmts);
    await c.event(job.id, 'part', `Requested quotes for ${parts.length} part(s) from ${vendors.length} vendors (sample adapter)`);
    await c.audit('request_quotes', 'job', job.id, job.id, parts.length);
    return json({ parts: parts.length, vendors: vendors.length, note: 'Quotes are SAMPLE values from the editable price list until a parts network (e.g. PartsTrader, CollisionLink, OEConnection) is connected.' });
  });
  R.post('/api/parts/:id/quotes', async (c) => {
    c.need('parts.write');
    const p = await c.db.prepare('SELECT * FROM parts WHERE id=?').bind(c.id()).first();
    if (!p) throw notFound();
    await c.job(p.job_id);
    const id = await insertRow(c.env, 'part_quotes', { ...c.body, part_id: p.id, source: 'manual' }, ['part_id', 'vendor_id', 'part_type', 'price', 'list_price', 'eta_days', 'in_stock', 'source']);
    await c.db.prepare("UPDATE parts SET status='quoted' WHERE id=? AND status='needed'").bind(p.id).run();
    return json({ id });
  });
  R.post('/api/quotes/:id/select', async (c) => {
    c.need('parts.write');
    const q = await c.db.prepare('SELECT * FROM part_quotes WHERE id=?').bind(c.id()).first();
    if (!q) throw notFound();
    const p = await c.db.prepare('SELECT * FROM parts WHERE id=?').bind(q.part_id).first();
    await c.job(p.job_id);
    await c.db.batch([
      c.db.prepare('UPDATE part_quotes SET selected=0 WHERE part_id=?').bind(p.id),
      c.db.prepare('UPDATE part_quotes SET selected=1 WHERE id=?').bind(q.id),
      c.db.prepare('UPDATE parts SET vendor_id=?, cost=?, part_type=?, list_price=COALESCE(?, list_price) WHERE id=?').bind(q.vendor_id, q.price, q.part_type, q.list_price, p.id),
    ]);
    // Price match: keep the estimate line price in step with the chosen part type list price
    if (p.line_id && q.list_price) await c.db.prepare('UPDATE estimate_lines SET part_type=?, unit_price=?, part_cost=? WHERE id=?').bind(q.part_type, q.list_price, q.price, p.line_id).run();
    if (q.list_price) await c.db.prepare('UPDATE parts SET sell_price=? WHERE id=?').bind(q.list_price, p.id).run();
    await c.audit('select_quote', 'part', p.id, p.job_id, q);
    return json({ ok: true });
  });
  // Order: one PO per vendor for parts that have a vendor chosen
  R.post('/api/jobs/:id/order', async (c) => {
    c.need('parts.write');
    const job = await c.job(c.id());
    const ids = Array.isArray(c.body.part_ids) ? c.body.part_ids.map(Number) : null;
    let parts = (await c.db.prepare("SELECT p.*, v.avg_delivery_days, v.name AS vendor_name, v.integration FROM parts p LEFT JOIN vendors v ON v.id=p.vendor_id WHERE p.job_id=? AND p.status IN ('needed','quoted') AND p.vendor_id IS NOT NULL").bind(job.id).all()).results;
    if (ids) parts = parts.filter((p) => ids.includes(p.id));
    if (!parts.length) throw bad('Choose a vendor quote for each part first');
    const byVendor = {};
    for (const p of parts) (byVendor[p.vendor_id] ||= []).push(p);
    const pos = [];
    for (const [vid, list] of Object.entries(byVendor)) {
      const number = await nextNumber(c.env, 'po', 'PO-', 5);
      const total = r2(list.reduce((a, p) => a + num(p.cost) * num(p.qty, 1), 0));
      const via = list[0].integration === 'manual' ? 'manual (call / vendor portal)' : list[0].integration;
      const poId = await insertRow(c.env, 'purchase_orders', { location_id: job.location_id, job_id: job.id, vendor_id: Number(vid), number, total, status: 'sent', sent_via: via }, ['location_id', 'job_id', 'vendor_id', 'number', 'total', 'status', 'sent_via']);
      const eta = addDays(today(), Math.max(1, Math.round(num(list[0].avg_delivery_days, 1))));
      await c.db.batch(list.map((p) => c.db.prepare("UPDATE parts SET status='ordered', po_id=?, ordered_at=?, eta=COALESCE(eta, ?) WHERE id=?").bind(poId, nowIso(), eta, p.id)));
      pos.push({ number, vendor: list[0].vendor_name, parts: list.length, total, eta, sent_via: via });
      await c.event(job.id, 'part', `${number} to ${list[0].vendor_name}: ${list.length} part(s), $${total}, ETA ${eta}`);
    }
    await c.audit('order_parts', 'job', job.id, job.id, pos);
    const resched = await rescheduleForParts(c.env, job.id, c.user.name);
    return json({ pos, rescheduled: resched });
  });

  // ---------- Vendors & insurers ----------
  const VEND = ['name', 'type', 'contact', 'email', 'phone', 'account_no', 'discount_pct', 'integration', 'avg_delivery_days', 'notes'];
  R.get('/api/vendors', async (c) => { c.need('shop.read'); return json((await c.db.prepare('SELECT * FROM vendors ORDER BY type, name').all()).results); });
  R.post('/api/vendors', async (c) => { c.need('vendors.write'); const id = await insertRow(c.env, 'vendors', c.body, VEND); await c.audit('create', 'vendor', id, null, c.body.name); return json({ id }); });
  R.put('/api/vendors/:id', async (c) => { c.need('vendors.write'); await updateRow(c.env, 'vendors', c.id(), c.body, VEND); await c.audit('update', 'vendor', c.id(), null, c.body); return json({ ok: true }); });
  const INS = ['name', 'drp', 'contact', 'email', 'phone', 'rate_body', 'rate_paint', 'rate_mech', 'rate_frame', 'paint_mat_rate', 'payment_terms_days', 'cycle_target_days', 'severity_target', 'csi_target', 'integration', 'notes', 'parts_discounts'];
  R.get('/api/insurers', async (c) => { c.need('jobs.read'); const rows = (await c.db.prepare('SELECT * FROM insurers ORDER BY drp DESC, name').all()).results; return json(c.can('shop.read') ? rows : rows.map((r) => ({ id: r.id, name: r.name }))); });
  R.post('/api/insurers', async (c) => { c.need('insurers.write'); if (c.body.parts_discounts && typeof c.body.parts_discounts === 'object') c.body.parts_discounts = JSON.stringify(c.body.parts_discounts); const id = await insertRow(c.env, 'insurers', c.body, INS); await c.audit('create', 'insurer', id, null, c.body.name); return json({ id }); });
  R.put('/api/insurers/:id', async (c) => { c.need('insurers.write'); if (c.body.parts_discounts && typeof c.body.parts_discounts === 'object') c.body.parts_discounts = JSON.stringify(c.body.parts_discounts); await updateRow(c.env, 'insurers', c.id(), c.body, INS); await c.audit('update', 'insurer', c.id(), null, c.body); return json({ ok: true }); });

  // ---------- Scheduling with capacity ----------
  R.get('/api/schedule', async (c) => {
    c.need('schedule.read');
    const from = c.q('from', today()), to = c.q('to', addDays(today(), 13));
    const lf = c.locFilter('s');
    const ev = await c.db.prepare(`SELECT s.*, j.number, c.name AS customer_name, v.year, v.make, v.model FROM schedule_events s LEFT JOIN jobs j ON j.id=s.job_id LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN vehicles v ON v.id=j.vehicle_id
      WHERE substr(s.start,1,10) BETWEEN ? AND ?${lf.sql} ORDER BY s.start`).bind(from, to, ...lf.args).all();
    const loc = await c.location(c.loc || 1);
    const lj = c.locFilter('j');
    // Cars in the shop per day (bay usage) and tech hours needed
    const jobs = (await c.db.prepare(`SELECT j.id, j.drop_off_at, j.key_in_at, j.target_date, j.delivered_at,
      (SELECT COALESCE(SUM(labor_hours+teardown_hours+refinish_hours),0) FROM estimate_lines e WHERE e.job_id=j.id) AS hrs
      FROM jobs j WHERE j.status IN ('approved','scheduled','in_production','completed')${lj.sql}`).bind(...lj.args).all()).results;
    const techs = (await c.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='technician' AND active=1 AND (location_id IS NULL OR location_id=?)").bind(c.loc || 1).first()).n;
    const days = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const dow = new Date(d + 'T12:00:00Z').getUTCDay();
      const inShop = jobs.filter((j) => { const s = (j.key_in_at || j.drop_off_at || '').slice(0, 10); const e = (j.delivered_at || j.target_date || '').slice(0, 10); return s && s <= d && (!e || e >= d); });
      const hoursNeeded = inShop.reduce((a, j) => { const s = (j.key_in_at || j.drop_off_at).slice(0, 10); const e = (j.target_date || addDays(s, 5)).slice(0, 10); const span = Math.max(1, Math.round(daysBetween(s, e)) + 1); return a + num(j.hrs) / span; }, 0);
      const evd = ev.results.filter((e) => e.start.slice(0, 10) === d);
      days.push({
        date: d, weekend: dow === 0 || dow === 6,
        drop_offs: evd.filter((e) => e.type === 'drop_off').length, deliveries: evd.filter((e) => e.type === 'delivery').length,
        bays_used: inShop.length, bays: num(loc?.bays, 6),
        booth_used: evd.filter((e) => e.type === 'booth').length, booth_slots: num(loc?.booth_slots_per_day, 6) * num(loc?.booths, 1),
        tech_hours_needed: r2(hoursNeeded), tech_hours_available: dow === 0 || dow === 6 ? 0 : r2(techs * num(loc?.tech_hours_per_day, 8)),
      });
    }
    return json({ events: ev.results, days, techs });
  });
  const EVC = ['job_id', 'type', 'title', 'start', 'end', 'resource', 'notes'];
  R.post('/api/schedule', async (c) => {
    c.need('schedule.write');
    const b = c.body;
    if (!b.start) throw bad('Start time is required');
    let loc = c.loc || 1;
    if (b.job_id) {
      const j = await c.job(Number(b.job_id)); loc = j.location_id;
      if (b.type === 'drop_off') await c.db.prepare("UPDATE jobs SET drop_off_at=?, status=CASE WHEN status IN ('approved','estimate') THEN 'scheduled' ELSE status END WHERE id=?").bind(b.start, j.id).run();
      if (b.type === 'delivery') await c.db.prepare('UPDATE jobs SET target_date=?, promised_date=? WHERE id=?').bind(b.start.slice(0, 10), b.start.slice(0, 10), j.id).run();
      await c.event(j.id, 'schedule', `${(b.type || 'event').replace('_', ' ')} scheduled ${b.start}`);
    }
    const id = await insertRow(c.env, 'schedule_events', { ...b, location_id: loc }, [...EVC, 'location_id']);
    await c.audit('create', 'schedule', id, b.job_id, b);
    return json({ id });
  });
  R.put('/api/schedule/:id', async (c) => {
    c.need('schedule.write');
    const e = await c.db.prepare('SELECT * FROM schedule_events WHERE id=?').bind(c.id()).first();
    if (!e) throw notFound();
    await updateRow(c.env, 'schedule_events', e.id, c.body, EVC);
    if (e.job_id && c.body.start && e.type === 'drop_off') await c.db.prepare('UPDATE jobs SET drop_off_at=? WHERE id=?').bind(c.body.start, e.job_id).run();
    if (e.job_id && c.body.start && e.type === 'delivery') await c.db.prepare('UPDATE jobs SET target_date=? WHERE id=?').bind(c.body.start.slice(0, 10), e.job_id).run();
    await c.audit('update', 'schedule', e.id, e.job_id, c.body);
    return json({ ok: true });
  });
  R.del('/api/schedule/:id', async (c) => {
    c.need('schedule.write');
    await c.db.prepare('DELETE FROM schedule_events WHERE id=?').bind(c.id()).run();
    await c.audit('delete', 'schedule', c.id(), null, '');
    return json({ ok: true });
  });

  // ---------- Rentals ----------
  const RC = ['provider', 'vehicle', 'reservation_no', 'start_date', 'end_date', 'daily_rate', 'covered_days', 'status', 'notes'];
  R.post('/api/jobs/:id/rentals', async (c) => {
    c.need('schedule.write');
    const job = await c.job(c.id());
    const id = await insertRow(c.env, 'rentals', { ...c.body, job_id: job.id }, [...RC, 'job_id']);
    await c.event(job.id, 'rental', `Rental reserved: ${c.body.provider || ''} ${c.body.start_date || ''} to ${c.body.end_date || ''}`);
    await c.audit('create', 'rental', id, job.id, c.body);
    return json({ id });
  });
  R.put('/api/rentals/:id', async (c) => {
    c.need('schedule.write');
    const r = await c.db.prepare('SELECT * FROM rentals WHERE id=?').bind(c.id()).first();
    if (!r) throw notFound();
    await c.job(r.job_id);
    await updateRow(c.env, 'rentals', r.id, c.body, RC);
    await c.audit('update', 'rental', r.id, r.job_id, c.body);
    return json({ ok: true });
  });

  // ---------- Customer messages ----------
  R.post('/api/jobs/:id/messages', async (c) => {
    c.need('messages.write');
    const job = await c.job(c.id());
    if (!c.body.body) throw bad('Message is empty');
    const m = await sendCustomerMessage(c, job, { channel: c.body.channel, body: String(c.body.body).slice(0, 1500), subject: c.body.subject });
    if (!m) throw bad('Customer has no contact for that channel or opted out of texts');
    await c.audit('message', 'job', job.id, job.id, `${m.channel}: ${m.status}`);
    return json(m);
  });
  R.post('/api/jobs/:id/request-approval', async (c) => {
    c.need('messages.write');
    const job = await c.job(c.id());
    const b = await jobBundle(c, job.id);
    const body = `Hi ${(b.customer?.name || '').split(' ')[0]}, your repair estimate for the ${b.vehicle?.year || ''} ${b.vehicle?.make || ''} ${b.vehicle?.model || ''} is ready ($${b.totals.total.toFixed(2)}, your part $${b.totals.customer_pays.toFixed(2)}). Review and sign here: ${portalUrl(c, job)}`;
    const m = await sendCustomerMessage(c, job, { body, subject: 'Please review your repair estimate' });
    await c.event(job.id, 'approval', 'Online approval requested');
    return json({ message: m, portal: portalUrl(c, job) });
  });
  R.post('/api/jobs/:id/request-review', async (c) => {
    c.need('messages.write');
    const job = await c.job(c.id());
    await c.db.prepare('INSERT INTO reviews (job_id) VALUES (?)').bind(job.id).run();
    const m = await sendCustomerMessage(c, job, { body: `Thanks for trusting us with your repair! Could you rate your experience? It takes 20 seconds: ${portalUrl(c, job)}#review`, subject: 'How did we do?' });
    await c.event(job.id, 'review', 'Review requested');
    return json({ message: m });
  });
  R.get('/api/messages', async (c) => {
    c.need('shop.read');
    const lf = c.locFilter('j');
    return json((await c.db.prepare(`SELECT m.*, j.number, cu.name AS customer_name FROM messages m LEFT JOIN jobs j ON j.id=m.job_id LEFT JOIN customers cu ON cu.id=m.customer_id WHERE 1=1${lf.sql} ORDER BY m.id DESC LIMIT 200`).bind(...lf.args).all()).results);
  });

  // ---------- Repair procedures & compliance ----------
  R.post('/api/jobs/:id/adas', async (c) => {
    c.need('compliance.write');
    const job = await c.job(c.id());
    const id = await insertRow(c.env, 'adas_items', { ...c.body, job_id: job.id }, ['job_id', 'system', 'reason', 'calibration', 'required', 'status', 'performed_by', 'performed_at', 'file_id', 'notes']);
    await c.audit('create', 'adas', id, job.id, c.body);
    return json({ id });
  });
  R.put('/api/adas/:id', async (c) => {
    c.need('compliance.write');
    const a = await c.db.prepare('SELECT * FROM adas_items WHERE id=?').bind(c.id()).first();
    if (!a) throw notFound();
    await c.job(a.job_id);
    const b = { ...c.body };
    if (b.status === 'done' && !a.performed_at) { b.performed_at = nowIso(); b.performed_by = b.performed_by || c.user.name; }
    await updateRow(c.env, 'adas_items', a.id, b, ['system', 'reason', 'calibration', 'required', 'status', 'performed_by', 'performed_at', 'file_id', 'notes']);
    if (b.status && b.status !== a.status) await c.event(a.job_id, 'adas', `${a.system}: ${b.status}`);
    await c.audit('update', 'adas', a.id, a.job_id, b);
    return json({ ok: true });
  });
  R.post('/api/jobs/:id/scans', async (c) => {
    c.need('compliance.write');
    const job = await c.job(c.id());
    const b = c.body;
    const id = await insertRow(c.env, 'scans', { ...b, job_id: job.id, performed_by: b.performed_by || c.user.name }, ['job_id', 'type', 'tool', 'dtcs', 'result', 'performed_by', 'file_id', 'source']);
    if (b.type === 'pre') await c.db.prepare("UPDATE jobs SET pre_scan_status='done' WHERE id=?").bind(job.id).run();
    if (b.type === 'post') await c.db.prepare("UPDATE jobs SET post_scan_status='done' WHERE id=?").bind(job.id).run();
    await c.event(job.id, 'scan', `${b.type}-repair scan recorded: ${b.result || ''}`);
    await c.audit('create', 'scan', id, job.id, b);
    return json({ id });
  });
  R.post('/api/jobs/:id/welds', async (c) => {
    c.need('compliance.write');
    const job = await c.job(c.id());
    const id = await insertRow(c.env, 'weld_records', { ...c.body, job_id: job.id, tech_name: c.body.tech_name || c.user.name }, ['job_id', 'tech_name', 'weld_type', 'location_on_vehicle', 'procedure_ref', 'equipment', 'settings', 'test_weld', 'destructive_test_pass', 'certification', 'notes']);
    await c.event(job.id, 'weld', `Weld record: ${c.body.weld_type || ''} at ${c.body.location_on_vehicle || ''}`);
    await c.audit('create', 'weld', id, job.id, c.body);
    return json({ id });
  });
  R.get('/api/oem-docs', async (c) => {
    c.need('shop.read');
    const make = c.q('make');
    const r = make ? await c.db.prepare("SELECT * FROM oem_docs WHERE make=? OR make='All' ORDER BY make DESC, type").bind(make).all() : await c.db.prepare('SELECT * FROM oem_docs ORDER BY make, type').all();
    return json(r.results);
  });
  R.post('/api/oem-docs', async (c) => {
    c.need('compliance.write');
    const id = await insertRow(c.env, 'oem_docs', { ...c.body, sample: 0 }, ['make', 'title', 'type', 'url', 'summary', 'keywords', 'sample']);
    await c.audit('create', 'oem_doc', id, null, c.body.title);
    return json({ id });
  });
  R.post('/api/jobs/:id/docs', async (c) => {
    c.need('compliance.write');
    const job = await c.job(c.id());
    const id = await insertRow(c.env, 'job_docs', { ...c.body, job_id: job.id }, ['job_id', 'oem_doc_id', 'line_id', 'note']);
    await c.audit('link_doc', 'job', job.id, job.id, c.body);
    return json({ id });
  });
  R.del('/api/job-docs/:id', async (c) => {
    c.need('compliance.write');
    await c.db.prepare('DELETE FROM job_docs WHERE id=?').bind(c.id()).run();
    return json({ ok: true });
  });
  R.get('/api/compliance', async (c) => {
    c.need('jobs.read');
    const lf = c.locFilter();
    return json((await c.db.prepare(`SELECT * FROM compliance_logs WHERE 1=1${lf.sql} ORDER BY COALESCE(next_due,'9999') , id DESC LIMIT 200`).bind(...lf.args).all()).results);
  });
  R.post('/api/compliance', async (c) => {
    c.need('compliance.write');
    const id = await insertRow(c.env, 'compliance_logs', { ...c.body, location_id: c.loc || 1, user_name: c.user.name }, ['location_id', 'type', 'item', 'performed_on', 'next_due', 'detail', 'user_name']);
    await c.audit('create', 'compliance', id, null, c.body);
    return json({ id });
  });
}
