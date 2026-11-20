// Business logic: estimate math, ADAS rules, gross profit, parts-delay rescheduling,
// customer messaging adapters, AI damage detection, VIN decode, reports.
import { r2, num, nowIso, today, addDays, daysBetween, parseJsonCol, bytesToBase64, vinValid } from './util.js';
import { styleFromBodyClass, model3dFrom } from './catalog.js';
import { gatewayCreds, gatewaySend, smsMethod, deviceGet } from './sms.js';

export const STAGES = [
  ['intake', 'Check-in'], ['teardown', 'Teardown / blueprint'], ['parts_hold', 'Waiting on parts'], ['body', 'Body'],
  ['frame', 'Frame / structural'], ['paint', 'Paint'], ['reassembly', 'Reassembly'], ['mechanical', 'Mechanical'],
  ['adas', 'ADAS calibration'], ['detail', 'Detail'], ['qc', 'Quality check'], ['ready', 'Ready for pickup'],
];
export const STAGE_KEYS = STAGES.map((s) => s[0]);
export const DEFAULT_STAGE_ALERT_HOURS = { intake: 24, teardown: 24, parts_hold: 72, body: 48, frame: 48, paint: 36, reassembly: 24, mechanical: 24, adas: 24, detail: 12, qc: 8, ready: 48 };

export const ROLES = ['owner', 'employee', 'manager', 'estimator', 'technician', 'parts', 'accounting'];
const CAPS = {
  owner: ['*'],
  // Employee: create and manage estimates only. No settings, rates, users, reports, invoices or financials.
  employee: ['jobs.read', 'jobs.write', 'estimate.write', 'files.write'],
  manager: ['shop.read', 'jobs.read', 'jobs.write', 'estimate.write', 'files.write', 'production.write', 'time.write', 'parts.write', 'schedule.write', 'messages.write', 'paint.write', 'accounting.read', 'accounting.write', 'reports.read', 'compliance.write', 'insurers.write', 'vendors.write', 'catalog.write', 'admin.users', 'audit.read'],
  estimator: ['shop.read', 'jobs.read', 'jobs.write', 'estimate.write', 'files.write', 'production.write', 'parts.read', 'schedule.write', 'messages.write', 'compliance.write', 'insurers.write', 'reports.read'],
  technician: ['shop.read', 'jobs.read', 'files.write', 'production.write', 'time.write', 'paint.write', 'compliance.write', 'parts.read'],
  parts: ['shop.read', 'jobs.read', 'parts.read', 'parts.write', 'vendors.write', 'schedule.read', 'files.write', 'paint.write'],
  accounting: ['shop.read', 'jobs.read', 'accounting.read', 'accounting.write', 'reports.read', 'parts.read', 'audit.read'],
};
export function can(user, cap) {
  if (!user) return false;
  const caps = CAPS[user.role] || [];
  if (caps.includes('*') || caps.includes(cap)) return true;
  // write implies read
  if (cap.endsWith('.read') && caps.includes(cap.replace('.read', '.write'))) return true;
  return false;
}
export const capsFor = (role) => CAPS[role] || [];

// ---------- Estimate totals ----------
export const PART_TYPES = ['OEM', 'aftermarket', 'recycled', 'reconditioned'];
export const DEFAULT_RULES = {
  pm: { mode: 'per_rfn_hour', rate: null, pct: 0, cap: 0, stage3_mult: 1.5, tone2_mult: 1.25, clear_hours_pct: 0 },
  tax: { parts: null, paint_mat: null, labor_body: null, labor_refinish: null, labor_frame: null, labor_structural: null, labor_mech: null, labor_glass: null, sublet: 0, misc: null },
  markup: { OEM: 0, aftermarket: 0, recycled: 0, reconditioned: 0, sublet: 0 },
  discount: { OEM: 0, aftermarket: 0, recycled: 0, reconditioned: 0 },
  overlap: { adjacent: 0.4, non_adjacent: 0.2 },
  rounding: 0.1,
};
// Merge a location's saved rules over the defaults; blank tax rates fall back to the location tax settings.
export function rulesFor(loc, insurer) {
  const saved = parseJson(loc?.est_rules) || {};
  const r = JSON.parse(JSON.stringify(DEFAULT_RULES));
  for (const k of Object.keys(r)) if (saved[k] && typeof saved[k] === 'object') Object.assign(r[k], saved[k]); else if (saved[k] !== undefined) r[k] = saved[k];
  const tr = num(loc?.tax_rate), tl = !!num(loc?.tax_labor);
  for (const k of Object.keys(r.tax)) if (r.tax[k] === null || r.tax[k] === '' || r.tax[k] === undefined) r.tax[k] = k.startsWith('labor_') ? (tl ? tr : 0) : k === 'sublet' ? 0 : tr;
  for (const k of Object.keys(r.tax)) r.tax[k] = num(r.tax[k]);
  const disc = parseJson(insurer?.parts_discounts);
  if (disc) for (const k of PART_TYPES) if (disc[k] !== undefined && disc[k] !== '') r.discount[k] = num(disc[k]);
  return r;
}
function parseJson(v) { if (!v) return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return null; } }

export function ratesFor(loc, insurer) {
  const pick = (k) => (insurer && insurer[k] ? num(insurer[k]) : num(loc?.[k]));
  return {
    body: pick('rate_body'), paint: pick('rate_paint'), refinish: pick('rate_paint'), mech: pick('rate_mech'), frame: pick('rate_frame'),
    structural: num(loc?.rate_structural) || pick('rate_frame'), glass: num(loc?.rate_glass) || pick('rate_body'),
    paint_mat: pick('paint_mat_rate'), tax_rate: num(loc?.tax_rate), tax_labor: !!num(loc?.tax_labor),
    total_loss_pct: num(loc?.total_loss_pct, 0.75) || 0.75,
  };
}

const LABOR_ONLY_OPS = ['o/h', 'align', 'add_labor', 'r&i'];
// Price one line under the rules. Returns money and net hours; used by totals, the grid and the PDF.
export function calcLine(l, rates, rules) {
  const q = num(l.qty, 1);
  const out = { id: l.id, gross: 0, markup: 0, discount: 0, net: 0, betterment: 0, labor_h: 0, refinish_h: 0, teardown_h: 0, labor_amt: 0, refinish_amt: 0, teardown_amt: 0, sublet: 0, misc: 0, pm_h: 0, bucket: 'parts', lt: 'body', total: 0 };
  if (num(l.incl)) return out;
  let lt = ['body', 'refinish', 'frame', 'structural', 'mech', 'glass'].includes(l.labor_type) ? l.labor_type : 'body';
  out.lt = lt;
  const lab = Math.max(0, num(l.labor_hours) - num(l.labor_overlap));
  const rfn = Math.max(0, num(l.refinish_hours) - num(l.refinish_overlap)) + (lt === 'refinish' ? lab : 0);
  out.labor_h = lt === 'refinish' ? 0 : r2(lab);
  out.refinish_h = r2(rfn);
  out.teardown_h = r2(num(l.teardown_hours));
  const stage = l.paint_stage === '3stage' ? num(rules.pm.stage3_mult, 1.5) : l.paint_stage === '2tone' ? num(rules.pm.tone2_mult, 1.25) : 1;
  out.pm_h = rfn * stage;
  out.labor_amt = out.labor_h * (rates[lt] ?? rates.body);
  out.refinish_amt = rfn * rates.paint;
  out.teardown_amt = out.teardown_h * rates.body;
  const pt = PART_TYPES.includes(l.part_type) ? l.part_type : null;
  if (l.operation === 'sublet') {
    const base = num(l.sublet_amount) || q * num(l.unit_price);
    out.gross = base;
    out.markup = base * num(rules.markup.sublet) / 100;
    out.sublet = base + out.markup; out.bucket = 'sublet';
  } else if (l.operation === 'add_cost' || (l.operation === 'misc' && !pt)) {
    out.gross = q * num(l.unit_price); out.misc = out.gross; out.bucket = 'misc';
  } else if (!LABOR_ONLY_OPS.includes(l.operation) || num(l.unit_price)) {
    out.gross = q * num(l.unit_price);
    const mk = l.markup_pct !== null && l.markup_pct !== undefined && l.markup_pct !== '' ? num(l.markup_pct) : pt ? num(rules.markup[pt]) : 0;
    const dc = l.discount_pct !== null && l.discount_pct !== undefined && l.discount_pct !== '' ? num(l.discount_pct) : pt ? num(rules.discount[pt]) : 0;
    out.markup = out.gross * mk / 100;
    out.discount = (out.gross + out.markup) * dc / 100;
    out.net = out.gross + out.markup - out.discount;
    out.betterment = out.net * num(l.betterment_pct) / 100;
  }
  out.total = out.net + out.sublet + out.misc + out.labor_amt + out.refinish_amt + out.teardown_amt;
  for (const k of Object.keys(out)) if (typeof out[k] === 'number' && k !== 'id') out[k] = r2(out[k]);
  return out;
}

export function computeTotals(lines, { loc, insurer, job, vehicle, upTo = null }) {
  const rates = ratesFor(loc, insurer);
  const rules = rulesFor(loc, insurer);
  const use = lines.filter((l) => upTo === null || num(l.supplement_no) <= upTo);
  const hours = { body: 0, frame: 0, mech: 0, structural: 0, glass: 0 };
  let parts = 0, partsGross = 0, markup = 0, discount = 0, betterment = 0, refinish = 0, teardown = 0, sublet = 0, misc = 0, partsCost = 0, unreviewed = 0, pmHours = 0;
  let laborOverlap = 0, rfnOverlap = 0, judgment = 0, judgmentHours = 0, notIncl = 0, incl = 0;
  const taxBase = { parts: 0, paint_mat: 0, labor_body: 0, labor_refinish: 0, labor_frame: 0, labor_structural: 0, labor_mech: 0, labor_glass: 0, sublet: 0, misc: 0 };
  const bySupp = {};
  const lineCalc = {};
  for (const l of use) {
    const c = calcLine(l, rates, rules);
    lineCalc[l.id] = c;
    const tx = num(l.taxable, 1) ? 1 : 0;
    if (c.lt !== 'refinish') hours[c.lt] += c.labor_h;
    teardown += c.teardown_h; refinish += c.refinish_h; pmHours += c.pm_h;
    parts += c.net; partsGross += c.gross * (c.bucket === 'parts' ? 1 : 0); markup += c.bucket === 'parts' ? c.markup : 0; discount += c.discount; betterment += c.betterment;
    sublet += c.sublet; misc += c.misc;
    if (tx) { taxBase.parts += c.net; taxBase.sublet += c.sublet; taxBase.misc += c.misc; }
    taxBase['labor_' + (c.lt === 'refinish' ? 'body' : c.lt)] += c.labor_amt + c.teardown_amt;
    taxBase.labor_refinish += c.refinish_amt;
    laborOverlap += num(l.labor_overlap); rfnOverlap += num(l.refinish_overlap);
    if (num(l.judgment)) { judgment++; judgmentHours += c.labor_h + c.refinish_h; }
    if (num(l.not_included)) notIncl++;
    if (num(l.incl)) incl++;
    const q = num(l.qty, 1);
    if (c.bucket === 'parts' && c.gross) partsCost += q * (l.part_cost !== null && l.part_cost !== undefined && l.part_cost !== '' ? num(l.part_cost) : num(l.unit_price) * 0.72);
    if (!num(l.reviewed, 1)) unreviewed++;
    const s = num(l.supplement_no);
    bySupp[s] = r2((bySupp[s] || 0) + c.total + c.pm_h * rates.paint_mat);
  }
  const laborAmt = { body: hours.body * rates.body, frame: hours.frame * rates.frame, mech: hours.mech * rates.mech, structural: hours.structural * rates.structural, glass: hours.glass * rates.glass };
  const teardownAmt = teardown * rates.body;
  const refinishAmt = refinish * rates.paint;
  // Paint & materials formula
  const pmRate = rules.pm.rate !== null && rules.pm.rate !== undefined && rules.pm.rate !== '' ? num(rules.pm.rate) : rates.paint_mat;
  let paintMat = rules.pm.mode === 'pct_rfn_labor' ? refinishAmt * num(rules.pm.pct) / 100 : pmHours * pmRate;
  if (num(rules.pm.cap) > 0) paintMat = Math.min(paintMat, num(rules.pm.cap));
  taxBase.paint_mat = paintMat;
  const labor = Object.values(laborAmt).reduce((a, b) => a + b, 0) + teardownAmt + refinishAmt;
  const taxByCat = {};
  let tax = 0;
  for (const [k, base] of Object.entries(taxBase)) { const t = base * num(rules.tax[k]); if (t) taxByCat[k] = r2(t); tax += t; }
  const total = parts + labor + paintMat + sublet + misc + tax;
  const ins = job?.pay_type === 'insurance';
  const deductible = ins ? num(job?.deductible) : 0;
  const customer = ins ? Math.min(total, deductible + betterment) : total;
  const acv = num(vehicle?.acv);
  const ratio = acv > 0 ? total / acv : null;
  return {
    rates, rules,
    hours: Object.fromEntries(Object.entries(hours).map(([k, v]) => [k, r2(v)])),
    teardown_hours: r2(teardown), refinish_hours: r2(refinish), pm_hours: r2(pmHours),
    labor_overlap_hours: r2(laborOverlap), refinish_overlap_hours: r2(rfnOverlap),
    judgment_lines: judgment, judgment_hours: r2(judgmentHours), not_included_lines: notIncl, included_lines: incl,
    labor_by_type: Object.fromEntries(Object.entries(laborAmt).map(([k, v]) => [k, r2(v)])),
    teardown: r2(teardownAmt), refinish: r2(refinishAmt), labor: r2(labor),
    parts: r2(parts), parts_list: r2(partsGross), parts_markup: r2(markup), parts_discount: r2(discount), betterment: r2(betterment),
    parts_cost_est: r2(partsCost), paint_materials: r2(paintMat), sublet: r2(sublet), misc: r2(misc),
    tax: r2(tax), tax_by_cat: taxByCat, total: r2(total), deductible: r2(deductible), customer_pays: r2(customer), insurer_pays: r2(total - customer),
    acv: acv || null, loss_ratio: ratio === null ? null : Math.round(ratio * 1000) / 1000,
    total_loss_threshold: rates.total_loss_pct,
    total_loss_flag: ratio !== null && ratio >= rates.total_loss_pct,
    total_loss_warning: ratio !== null && ratio >= rates.total_loss_pct * 0.85 && ratio < rates.total_loss_pct,
    by_supplement: bySupp, unreviewed_lines: unreviewed, line_count: use.length, line_calc: lineCalc,
  };
}

// ---------- ADAS rules ----------
const ADAS_RULES = [
  [/windshield/i, 'Forward camera', 'Forward camera calibration (static or dynamic per OEM)', ['Lane Departure', 'Lane Keep', 'Forward Collision', 'Crash Imminent', 'Lane Centering']],
  [/front bumper|grille|front radar|emblem.*front|radiator support/i, 'Front radar', 'Front radar aim / calibration per OEM', ['Adaptive Cruise', 'Forward Collision', 'Crash Imminent', 'Pedestrian']],
  [/rear bumper|blind-spot|quarter panel|rear body/i, 'Blind-spot / rear radar', 'Blind-spot and rear cross-traffic radar check', ['Blind Spot', 'Rear Cross']],
  [/mirror/i, 'Side cameras', 'Surround-view / blind-spot indicator check', ['Blind Spot']],
  [/backup camera|trunk lid|liftgate|tailgate/i, 'Backup camera', 'Backup camera aim / guideline check', ['Backup Camera', 'Rear Visibility']],
  [/park sensor/i, 'Park assist', 'Park assist sensor function check', ['Park Assist']],
  [/alignment|control arm|tie rod|strut|suspension|steering/i, 'Steering angle sensor', 'Steering angle sensor reset after alignment', []],
  [/headlamp/i, 'Headlamps', 'Headlamp aim (adaptive headlamps if equipped)', ['Adaptive Driving Beam', 'Adaptive Headlights']],
  [/airbag|seat belt|pretensioner|srs/i, 'SRS', 'SRS scan, clear codes, verify readiness', []],
];
export function detectAdas(lines, vehicle) {
  const feats = parseJsonCol(vehicle?.adas, []) || [];
  const out = new Map();
  for (const l of lines) {
    const txt = `${l.description || ''} ${l.area || ''} ${l.adas_flag || ''}`;
    for (const [re, system, calib, need] of ADAS_RULES) {
      if (!re.test(txt)) continue;
      const has = !need.length || !feats.length || feats.some((f) => need.some((n) => f.toLowerCase().includes(n.toLowerCase())));
      if (!out.has(system)) out.set(system, { system, calibration: calib, reason: `${l.operation || ''} ${l.description || ''}`.trim(), required: has ? 1 : 0, verify: !feats.length });
    }
  }
  return [...out.values()];
}

// ---------- Gross profit ----------
export function grossProfit(totals, { parts = [], tasks = [], techs = {}, time = [], usage = [], sublets = [] }) {
  const partSell = parts.length ? parts.reduce((a, p) => a + num(p.sell_price) * num(p.qty, 1), 0) : totals.parts;
  const partCost = parts.length ? parts.reduce((a, p) => a + num(p.cost) * num(p.qty, 1) - (p.credit_status === 'received' ? num(p.credit_amount) : 0), 0) : totals.parts_cost_est;
  let laborCost = 0;
  for (const t of tasks) {
    const tech = techs[t.tech_id];
    if (!tech) continue;
    if (tech.pay_type === 'hourly') {
      const mins = time.filter((e) => e.task_id === t.id).reduce((a, e) => a + num(e.minutes), 0);
      laborCost += (mins / 60) * num(tech.pay_rate);
    } else laborCost += num(t.flagged_hours) * num(tech.pay_rate);
  }
  const paintCost = usage.reduce((a, u) => a + num(u.cost), 0);
  const subPrice = sublets.length ? sublets.reduce((a, s) => a + num(s.price), 0) : totals.sublet;
  const subCost = sublets.reduce((a, s) => a + num(s.cost), 0);
  const cat = {
    parts: { sales: r2(partSell), cost: r2(partCost) },
    labor: { sales: r2(totals.labor), cost: r2(laborCost) },
    paint: { sales: r2(totals.paint_materials), cost: r2(paintCost) },
    sublet: { sales: r2(subPrice), cost: r2(subCost) },
  };
  let sales = 0, cost = 0;
  for (const c of Object.values(cat)) { c.gp = r2(c.sales - c.cost); c.pct = c.sales ? Math.round((c.gp / c.sales) * 1000) / 10 : 0; sales += c.sales; cost += c.cost; }
  return { ...cat, total: { sales: r2(sales), cost: r2(cost), gp: r2(sales - cost), pct: sales ? Math.round(((sales - cost) / sales) * 1000) / 10 : 0 } };
}

// ---------- Messaging (adapters become real when provider secrets are set) ----------
const STAGE_MSG = {
  intake: 'we have checked in your {veh}. We will send updates as repairs move along.',
  teardown: 'our team is disassembling your {veh} to find any hidden damage.',
  parts_hold: 'we are waiting on parts for your {veh}. We will let you know when they arrive.',
  body: 'body repairs on your {veh} are under way.',
  paint: 'your {veh} is in the paint department.',
  reassembly: 'your {veh} is being reassembled.',
  adas: 'safety-system calibration for your {veh} is in progress.',
  qc: 'your {veh} is in final quality check.',
  ready: 'your {veh} is ready for pickup!',
};
export function stageMessage(stage, cust, veh, portalUrl) {
  const t = STAGE_MSG[stage];
  if (!t) return null;
  const first = (cust?.name || '').split(' ')[0] || 'there';
  const v = veh ? `${veh.year || ''} ${veh.make || ''} ${veh.model || ''}`.trim() : 'vehicle';
  return `Hi ${first}, ${t.replace('{veh}', v)} Track it here: ${portalUrl}`;
}

export async function deliverMessage(env, msg) {
  // Returns a status string. Without provider credentials the message is kept in the outbox as queued.
  try {
    if (msg.channel === 'sms' && msg.to_addr) {
      // Owner's choice under Settings > Texting: this phone (R&R Auto Express app), SMS Gateway app, or manual
      const method = await smsMethod(env).catch(() => 'gateway');
      if (method === 'device') return (await deviceGet(env).catch(() => null)) ? 'phone_queue' : 'queued (no texting phone linked)';
      if (method === 'manual') return 'queued (send it from your messaging app)';
      const creds = await gatewayCreds(env).catch(() => null);
      if (creds) { const r = await gatewaySend(env, msg.to_addr, msg.body, { creds }); msg.ext_id = r.ext_id; msg.error = r.error; return r.status === 'failed' ? 'failed (' + (r.error || 'gateway') + ')' : r.status; }
    }
    if (msg.channel === 'sms' && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM && msg.to_addr) {
      const body = new URLSearchParams({ To: msg.to_addr, From: env.TWILIO_FROM, Body: msg.body });
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST', body, headers: { Authorization: 'Basic ' + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`), 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      return r.ok ? 'sent' : 'failed (Twilio ' + r.status + ')';
    }
    if (msg.channel === 'email' && env.RESEND_API_KEY && env.EMAIL_FROM && msg.to_addr) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: [msg.to_addr], subject: msg.subject || 'Repair update', text: msg.body }),
      });
      return r.ok ? 'sent' : 'failed (email ' + r.status + ')';
    }
  } catch (e) { return 'failed (' + String(e.message || e).slice(0, 60) + ')'; }
  if (msg.channel === 'portal') return 'posted';
  return 'queued (no ' + (msg.channel === 'email' ? 'email' : 'SMS') + ' provider connected)';
}

// ---------- Parts delay -> automatic rescheduling ----------
export async function rescheduleForParts(env, jobId, actor = 'system') {
  const job = await env.DB.prepare('SELECT * FROM jobs WHERE id=?').bind(jobId).first();
  if (!job || ['delivered', 'closed', 'total_loss', 'lost', 'completed'].includes(job.status)) return null;
  const r = await env.DB.prepare("SELECT MAX(eta) AS eta FROM parts WHERE job_id=? AND status IN ('ordered','shipped','backordered') AND eta IS NOT NULL AND eta<>''").bind(jobId).first();
  if (!r?.eta) return null;
  const eta = r.eta.slice(0, 10);
  const changes = [];
  const stmts = [];
  let delta = 0;
  if (!job.key_in_at && job.drop_off_at && job.drop_off_at.slice(0, 10) < eta) {
    // Car is not in the shop yet: move drop-off to the day parts arrive (parts-first scheduling).
    delta = Math.ceil(daysBetween(job.drop_off_at.slice(0, 10), eta));
    changes.push(`drop-off ${job.drop_off_at.slice(0, 10)} -> ${eta}`);
    stmts.push(env.DB.prepare("UPDATE schedule_events SET start=date(start, '+' || ? || ' days') || substr(start, 11), end=CASE WHEN end IS NULL THEN NULL ELSE date(end, '+' || ? || ' days') || substr(end, 11) END, auto_moved=1 WHERE job_id=? AND type IN ('drop_off','delivery','booth')").bind(delta, delta, jobId));
  } else if (job.target_date) {
    // Car is in the shop: target must be at least 2 working days after the last part arrives.
    const need = addDays(eta, 2);
    if (need > job.target_date.slice(0, 10)) {
      delta = Math.ceil(daysBetween(job.target_date.slice(0, 10), need));
      stmts.push(env.DB.prepare("UPDATE schedule_events SET start=date(start, '+' || ? || ' days') || substr(start, 11), end=CASE WHEN end IS NULL THEN NULL ELSE date(end, '+' || ? || ' days') || substr(end, 11) END, auto_moved=1 WHERE job_id=? AND type IN ('delivery','booth') AND start>=?").bind(delta, delta, jobId, today()));
    }
  }
  if (delta <= 0) return null;
  const newTarget = job.target_date ? addDays(job.target_date, delta) : null;
  const newDrop = !job.key_in_at && job.drop_off_at ? addDays(job.drop_off_at, delta) + (job.drop_off_at.slice(10) || '') : job.drop_off_at;
  if (newTarget) changes.push(`target ${job.target_date.slice(0, 10)} -> ${newTarget}`);
  stmts.push(env.DB.prepare('UPDATE jobs SET target_date=?, promised_date=COALESCE(?, promised_date), drop_off_at=?, updated=? WHERE id=?').bind(newTarget, newTarget, newDrop, nowIso(), jobId));
  stmts.push(env.DB.prepare("UPDATE rentals SET end_date=date(end_date, '+' || ? || ' days') WHERE job_id=? AND status<>'returned' AND end_date IS NOT NULL").bind(delta, jobId));
  stmts.push(env.DB.prepare('INSERT INTO job_events (job_id,type,detail,user_name) VALUES (?,?,?,?)').bind(jobId, 'auto_reschedule', `Parts ETA ${eta}: moved ${delta} day(s): ${changes.join('; ')}; rental extended`, actor));
  await env.DB.batch(stmts);
  // Tell the customer
  const cust = await env.DB.prepare('SELECT * FROM customers WHERE id=?').bind(job.customer_id).first();
  if (cust) {
    const body = `Hi ${(cust.name || '').split(' ')[0]}, a part for your repair is delayed until ${eta}. Your new estimated completion date is ${newTarget || addDays(eta, 2)}. We're sorry for the wait.`;
    const msg = { job_id: jobId, customer_id: cust.id, channel: cust.contact_pref === 'email' ? 'email' : 'sms', to_addr: cust.contact_pref === 'email' ? cust.email : cust.phone, subject: 'Repair schedule update', body, auto: 1 };
    msg.status = await deliverMessage(env, msg);
    await env.DB.prepare("INSERT INTO messages (job_id,customer_id,channel,to_addr,subject,body,status,auto,direction,ext_id,error,read_at) VALUES (?,?,?,?,?,?,?,1,'out',?,?,datetime('now'))").bind(msg.job_id, msg.customer_id, msg.channel, msg.to_addr, msg.subject, msg.body, msg.status, msg.ext_id || null, msg.error || null).run();
  }
  return { delta, eta, newTarget, changes };
}

// ---------- VIN decode (free NHTSA vPIC API) ----------
const ADAS_FIELDS = {
  AdaptiveCruiseControl: 'Adaptive Cruise Control', ForwardCollisionWarning: 'Forward Collision Warning', CIB: 'Crash Imminent Braking',
  DynamicBrakeSupport: 'Dynamic Brake Support', PedestrianAutomaticEmergencyBraking: 'Pedestrian Automatic Emergency Braking',
  LaneDepartureWarning: 'Lane Departure Warning', LaneKeepSystem: 'Lane Keep Assist', LaneCenteringAssistance: 'Lane Centering Assist',
  BlindSpotMon: 'Blind Spot Monitoring', BlindSpotIntervention: 'Blind Spot Intervention', RearCrossTrafficAlert: 'Rear Cross Traffic Alert',
  RearAutomaticEmergencyBraking: 'Rear Automatic Emergency Braking', ParkAssist: 'Park Assist', RearVisibilitySystem: 'Backup Camera / Rear Visibility',
  AdaptiveDrivingBeam: 'Adaptive Driving Beam', AdaptiveHeadlights: 'Adaptive Headlights',
};
export async function decodeVin(vin) {
  vin = String(vin || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[IOQ]/g, (c) => ({ I: '1', O: '0', Q: '0' }[c]));
  if (vin.length !== 17) return { ok: false, vin, error: 'A VIN has 17 characters' };
  const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`, { cf: { cacheTtl: 86400 } });
  if (!r.ok) return { ok: false, vin, error: 'NHTSA vPIC lookup failed (' + r.status + ')' };
  const d = (await r.json()).Results?.[0] || {};
  const adas = Object.entries(ADAS_FIELDS).filter(([k]) => d[k] && /standard|optional/i.test(d[k])).map(([k, label]) => `${label} (${d[k]})`);
  const engine = [d.DisplacementL ? Number(d.DisplacementL).toFixed(1) + 'L' : '', d.EngineCylinders ? d.EngineCylinders + '-cyl' : '', d.FuelTypePrimary || '', d.ElectrificationLevel || ''].filter(Boolean).join(' ');
  const out = {
    ok: !!(d.Make && d.ModelYear), vin, check_digit_ok: vinValid(vin),
    year: d.ModelYear ? Number(d.ModelYear) : null, make: titleCase(d.Make), model: d.Model || '', trim: [d.Trim, d.Series].filter(Boolean).join(' '),
    body: d.BodyClass || '', doors: d.Doors ? Number(d.Doors) : null, engine, drive: d.DriveType || '', transmission: d.TransmissionStyle || '',
    plant: [d.PlantCity, d.PlantCountry].filter(Boolean).join(', '), manufacturer: d.Manufacturer || '', vehicle_type: d.VehicleType || '',
    adas, error_text: d.ErrorCode && d.ErrorCode !== '0' ? d.ErrorText : '',
    cab: d.BodyCabType || '', bed_length_in: d.BedLengthIN ? Number(d.BedLengthIN) : null, bed_type: d.BedType || '',
    wheelbase_in: d.WheelBaseShort ? Number(d.WheelBaseShort) : null, gvwr: d.GVWR || '', series: d.Series || '', trim_only: d.Trim || '',
  };
  out.body_style = styleFromBodyClass(out.body, out.doors);
  out.model3d = model3dFrom(out);
  return out;
}
function titleCase(s) { return String(s || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bBmw\b/, 'BMW').replace(/\bGmc\b/, 'GMC'); }

// ---------- AI (Cloudflare Workers AI vision models) ----------
const VISION_MODELS = ['@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/meta/llama-3.2-11b-vision-instruct', '@cf/llava-hf/llava-1.5-7b-hf'];
export async function aiVision(env, bytes, prompt, maxTokens = 700) {
  if (!env.AI) throw new Error('Workers AI is not bound to this deployment');
  const errors = [];
  for (const model of VISION_MODELS) {
    try {
      let res;
      if (model.includes('llama-4')) {
        const url = 'data:image/jpeg;base64,' + bytesToBase64(bytes);
        res = await env.AI.run(model, { messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url } }] }], max_tokens: maxTokens, temperature: 0.1 });
      } else if (model.includes('llama-3.2')) {
        const input = { messages: [{ role: 'user', content: prompt }], image: [...bytes], max_tokens: maxTokens, temperature: 0.1 };
        try { res = await env.AI.run(model, input); } catch (e) {
          if (/agree|license/i.test(String(e.message))) { await env.AI.run(model, { prompt: 'agree' }); res = await env.AI.run(model, input); } else throw e;
        }
      } else {
        res = await env.AI.run(model, { image: [...bytes], prompt, max_tokens: maxTokens });
      }
      let txt = res?.response ?? res?.description ?? res?.result?.response ?? res;
      if (typeof txt !== 'string') txt = JSON.stringify(txt);
      return { model, text: txt };
    } catch (e) { errors.push(model.split('/').pop() + ': ' + String(e.message || e).slice(0, 120)); }
  }
  throw new Error('All vision models failed: ' + errors.join(' | '));
}

export function extractJson(txt) {
  if (!txt) return null;
  if (typeof txt === 'object') return txt;
  const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(txt.slice(s, e + 1)); } catch { return null; }
}

export function damagePrompt(labels) {
  return `You are assisting a collision repair estimator. Look at this photo of a vehicle.
List every exterior part that shows visible collision damage. Use ONLY these part names: ${labels.join(', ')}.
"left" and "right" mean the vehicle's own left (driver side in the USA) and right.
For each damaged part give: damage (dent, scratch, crack, crush, broken, misaligned, missing),
severity (light, moderate, heavy), operation (repair, replace, refinish) and confidence from 0 to 1.
If no vehicle or no damage is visible, return an empty list. Respond with JSON only, no prose:
{"vehicle_visible": true, "view": "front|rear|left side|right side|front-left|front-right|rear-left|rear-right|close-up", "damages": [{"part": "...", "damage": "...", "severity": "...", "operation": "...", "confidence": 0.0}]}`;
}

// Adjacent panels to suggest blend refinish for color match
export const BLEND_NEIGHBORS = {
  hood: ['fender_l', 'fender_r'], fender_l: ['door_lf_shell', 'hood'], fender_r: ['door_rf_shell', 'hood'],
  door_lf_shell: ['fender_l', 'door_lr_shell'], door_rf_shell: ['fender_r', 'door_rr_shell'],
  door_lr_shell: ['door_lf_shell', 'quarter_l'], door_rr_shell: ['door_rf_shell', 'quarter_r'],
  quarter_l: ['door_lr_shell', 'decklid'], quarter_r: ['door_rr_shell', 'decklid'], decklid: ['quarter_l', 'quarter_r'],
  bedside_l: ['door_lr_shell'], bedside_r: ['door_rr_shell'],
};

// Build estimate lines from catalog rows + operation (shared by AI draft, 3D picker and catalog list)
export function lineFromCatalog(c, op, { partType = 'OEM', severity = 'moderate', source = 'catalog', confidence = null, supplement_no = 0, includeTeardown = true } = {}) {
  const price = { OEM: c.price_oem, aftermarket: c.price_aftermarket, recycled: c.price_recycled, reconditioned: c.price_reconditioned };
  let pt = partType;
  if (op === 'replace' && (price[pt] === null || price[pt] === undefined)) pt = ['OEM', 'aftermarket', 'recycled', 'reconditioned'].find((k) => price[k] !== null && price[k] !== undefined) || '';
  const sevMul = { light: 0.5, moderate: 1, heavy: 1.8 }[severity] || 1;
  const l = {
    area: c.grp, operation: op, description: c.name, catalog_key: c.key, labor_type: c.labor_type || 'body',
    part_type: op === 'replace' ? pt : '', qty: 1, unit_price: op === 'replace' ? num(price[pt]) : 0,
    labor_hours: 0, teardown_hours: includeTeardown && op !== 'misc' ? num(c.teardown_hours) : 0, refinish_hours: 0,
    adas_flag: c.adas || '', source, ai_confidence: confidence, reviewed: source === 'ai' ? 0 : 1, supplement_no,
    notes: 'Sample labor time / price: verify with licensed database',
  };
  if (op === 'replace') { l.labor_hours = num(c.replace_hours); l.refinish_hours = c.paintable ? num(c.refinish_hours) : 0; }
  else if (op === 'repair') { l.labor_hours = r2(num(c.repair_hours) * sevMul); l.refinish_hours = c.paintable ? num(c.refinish_hours) : 0; }
  else if (op === 'refinish') { l.refinish_hours = num(c.refinish_hours); l.teardown_hours = 0; }
  else if (op === 'blend') { l.refinish_hours = r2(num(c.refinish_hours) * 0.5); l.teardown_hours = 0; l.description = c.name + ' (blend)'; }
  else if (op === 'r&i') { l.labor_hours = 0; }
  else if (op === 'misc') { l.labor_hours = num(c.replace_hours); }
  return l;
}

// ---------- Reports ----------
export function avg(a) { const v = a.filter((x) => x !== null && x !== undefined && !isNaN(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; }
