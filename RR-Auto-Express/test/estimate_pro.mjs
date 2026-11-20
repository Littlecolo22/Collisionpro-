// Pro estimating checks: line detail fields, rules (markup/discount/P&M/tax per category), bulk edits, reorder.
const BASE = process.argv[2] || 'http://localhost:8787';
let cookie = '';
const fails = []; let passed = 0;
async function call(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: BASE }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc && sc.includes('cp_session=')) cookie = sc.split(';')[0];
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  if (r.status >= 400) throw new Error(`${method} ${path} ${r.status} ${t.slice(0, 200)}`);
  return j;
}
async function t(name, fn) { try { const r = await fn(); passed++; console.log('ok  ', name, r === undefined ? '' : String(r).slice(0, 140)); } catch (e) { fails.push(name); console.log('FAIL', name, String(e.message || e).slice(0, 300)); } }
const near = (a, b, msg) => { if (Math.abs(a - b) > 0.011) throw new Error(`${msg}: got ${a}, expected ${b}`); };

await call('POST', '/api/login', { email: 'owner@collisionpro.app', password: 'LocalOwner123!' });
const jobs = await call('GET', '/api/jobs');
const list = Array.isArray(jobs) ? jobs : jobs.jobs;
const job = list.find((j) => j.status === 'estimate') || list.find((j) => !['closed', 'delivered'].includes(j.status)) || list[0];
const jid = job.id;
const locs = await call('GET', '/api/locations');
const loc = locs.find((l) => l.id === job.location_id) || locs[0];

await t('location rules exposed', async () => { if (!loc.rules?.pm || !loc.rules?.tax) throw new Error('no rules'); return JSON.stringify(loc.rules.markup); });

// Customer-pay test job so insurer rates/discounts do not interfere
let b0 = await call('GET', `/api/jobs/${jid}`);
await call('PUT', `/api/jobs/${jid}`, { pay_type: 'customer', insurer_id: null });

// Set known rules
const rules = { pm: { mode: 'per_rfn_hour', rate: 40, cap: 0, stage3_mult: 1.5, tone2_mult: 1.25 }, markup: { OEM: 0, aftermarket: 10, recycled: 25, reconditioned: 0, sublet: 10 }, discount: { OEM: 5, aftermarket: 0, recycled: 0, reconditioned: 0 }, tax: { parts: 0.08, paint_mat: 0.06, labor_body: 0.01, labor_refinish: 0, labor_frame: 0, labor_structural: 0, labor_mech: 0, labor_glass: 0, sublet: 0, misc: 0.08 } };
await t('save est_rules', async () => { await call('PUT', `/api/locations/${loc.id}`, { est_rules: rules }); return 'saved'; });

// Clear lines, add controlled lines
b0 = await call('GET', `/api/jobs/${jid}`);
if (b0.lines.length) await call('POST', `/api/jobs/${jid}/lines/bulk`, { ids: b0.lines.map((l) => l.id), action: 'delete' });
const ids = {};
await t('add OEM line with overlap + judgment', async () => { ids.a = (await call('POST', `/api/jobs/${jid}/lines`, { description: 'Fender', operation: 'replace', part_type: 'OEM', part_no: '12345-AB', qty: 1, unit_price: 200, labor_type: 'body', labor_hours: 2, labor_overlap: 0.5, refinish_hours: 2, refinish_overlap: 0.4, judgment: 1, paint_stage: '3stage' })).id; return ids.a; });
await t('add recycled line with betterment', async () => { ids.b = (await call('POST', `/api/jobs/${jid}/lines`, { description: 'Door shell', operation: 'replace', part_type: 'recycled', qty: 1, unit_price: 100, labor_type: 'body', labor_hours: 1, betterment_pct: 20 })).id; return ids.b; });
await t('add included line', async () => { ids.c = (await call('POST', `/api/jobs/${jid}/lines`, { description: 'R&I mirror', operation: 'r&i', labor_type: 'body', labor_hours: 0.3, incl: 1 })).id; return ids.c; });
await t('add sublet + refinish-type labor', async () => { ids.d = (await call('POST', `/api/jobs/${jid}/lines`, { description: 'Alignment', operation: 'sublet', sublet_amount: 100 })).id; ids.e = (await call('POST', `/api/jobs/${jid}/lines`, { description: 'Feather prime', operation: 'add_labor', labor_type: 'refinish', labor_hours: 0.5 })).id; return 'ok'; });
await t('reject bad labor type', async () => { try { await call('POST', `/api/jobs/${jid}/lines`, { description: 'x', labor_type: 'nope' }); } catch (e) { return 'rejected ' + e.message.slice(0, 40); } throw new Error('accepted'); });

await t('totals follow rules', async () => {
  const b = await call('GET', `/api/jobs/${jid}`);
  const T = b.totals, R = T.rates;
  // parts: OEM 200 -5% = 190 ; recycled 100 +25% = 125 ; total 315
  near(T.parts, 315, 'parts');
  near(T.parts_markup, 25, 'markup'); near(T.parts_discount, 10, 'discount');
  near(T.betterment, 25, 'betterment'); // 20% of 125
  // body hours: (2-0.5) + 1 = 2.5 ; included line adds nothing
  near(T.hours.body, 2.5, 'body hours');
  // refinish: (2-0.4)=1.6 + 0.5 refinish-type labor = 2.1
  near(T.refinish_hours, 2.1, 'refinish hours');
  // P&M hours: 1.6*1.5 (3-stage) + 0.5 = 2.9 * $40 = 116
  near(T.paint_materials, 116, 'paint & materials');
  near(T.sublet, 110, 'sublet with 10% markup');
  const exp = 315 * 0.08 + 116 * 0.06 + (2.5 * R.body) * 0.01;
  near(T.tax, Math.round(exp * 100) / 100, 'tax');
  if (T.judgment_lines !== 1 || T.included_lines !== 1) throw new Error('flags ' + T.judgment_lines + ' ' + T.included_lines);
  near(T.customer_pays, T.total, 'customer pay job pays all');
  return `total ${T.total} tax ${JSON.stringify(T.tax_by_cat)}`;
});

await t('bulk set part type + markup', async () => { await call('POST', `/api/jobs/${jid}/lines/bulk`, { ids: [ids.a, ids.b], action: 'update', set: { part_type: 'aftermarket', markup_pct: 0 } }); const b = await call('GET', `/api/jobs/${jid}`); near(b.totals.parts, 300, 'parts after bulk'); return b.totals.parts; });
await t('bulk adjust hours', async () => { await call('POST', `/api/jobs/${jid}/lines/bulk`, { ids: [ids.a, ids.b], action: 'update', adjust: { labor_hours: 0.5 } }); const b = await call('GET', `/api/jobs/${jid}`); near(b.totals.hours.body, 3.5, 'body after +0.5 each'); return b.totals.hours.body; });
await t('bulk scale price -10%', async () => { await call('POST', `/api/jobs/${jid}/lines/bulk`, { ids: [ids.a], action: 'update', scale: { unit_price: -10 } }); const b = await call('GET', `/api/jobs/${jid}`); near(b.lines.find((l) => l.id === ids.a).unit_price, 180, 'price'); return 'ok'; });
await t('bulk duplicate + delete', async () => { await call('POST', `/api/jobs/${jid}/lines/bulk`, { ids: [ids.b], action: 'duplicate' }); let b = await call('GET', `/api/jobs/${jid}`); const n = b.lines.length; const dup = b.lines.filter((l) => l.description === 'Door shell').pop(); await call('POST', `/api/jobs/${jid}/lines/bulk`, { ids: [dup.id], action: 'delete' }); b = await call('GET', `/api/jobs/${jid}`); if (b.lines.length !== n - 1) throw new Error('count'); return `${n} -> ${b.lines.length}`; });
await t('reorder lines', async () => { let b = await call('GET', `/api/jobs/${jid}`); const rev = b.lines.map((l) => l.id).reverse(); await call('POST', `/api/jobs/${jid}/lines/order`, { ids: rev }); b = await call('GET', `/api/jobs/${jid}`); if (b.lines[0].id !== rev[0]) throw new Error('order'); return 'ok'; });
await t('bulk rejects other job lines', async () => { const other = list.find((j) => j.id !== jid); const ob = await call('GET', `/api/jobs/${other.id}`); if (!ob.lines.length) return 'skip'; try { await call('POST', `/api/jobs/${jid}/lines/bulk`, { ids: [ob.lines[0].id], action: 'delete' }); } catch { return 'rejected'; } throw new Error('accepted'); });
await t('pdf renders with new fields', async () => { const r = await fetch(`${BASE}/api/jobs/${jid}/pdf`, { headers: { Cookie: cookie } }); const buf = await r.arrayBuffer(); if (r.status !== 200 || buf.byteLength < 2000) throw new Error('pdf ' + r.status); return buf.byteLength + ' bytes'; });

console.log(`\n${passed} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
