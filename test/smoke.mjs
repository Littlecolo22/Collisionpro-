// API smoke test: node test/smoke.mjs [base] [email] [password]
const BASE = process.argv[2] || 'http://localhost:8787';
const EMAIL = process.argv[3] || 'owner@collisionpro.app';
const PW = process.argv[4] || 'LocalOwner123!';
let cookie = '';
const fails = [];
let passed = 0;
async function call(method, path, body, raw = false) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: BASE }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc && sc.includes('cp_session=')) cookie = sc.split(';')[0];
  if (raw) return r;
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}
async function t(name, fn) {
  try { const r = await fn(); passed++; console.log('ok  ', name, r === undefined ? '' : String(r).slice(0, 110)); }
  catch (e) { fails.push(name); console.log('FAIL', name, String(e.message || e).slice(0, 300)); }
}
const ok = (r, msg = '') => { if (r.status >= 400) throw new Error(`${r.status} ${JSON.stringify(r.body).slice(0, 250)} ${msg}`); return r.body; };

await t('unauth blocked', async () => { const r = await call('GET', '/api/jobs'); if (r.status !== 401) throw new Error('got ' + r.status); });
await t('bad login', async () => { const r = await call('POST', '/api/login', { email: EMAIL, password: 'nope' }); if (r.status !== 401) throw new Error('got ' + r.status); });
await t('login', async () => ok(await call('POST', '/api/login', { email: EMAIL, password: PW })).ok);
await t('me', async () => ok(await call('GET', '/api/me')).user.role);
await t('dashboard', async () => JSON.stringify(ok(await call('GET', '/api/dashboard'))).slice(0, 100));
let jobs;
await t('jobs list', async () => { jobs = ok(await call('GET', '/api/jobs')); return (jobs.length ?? jobs.jobs?.length) + ' jobs'; });
const list = Array.isArray(jobs) ? jobs : jobs?.jobs || [];
const jid = list.find((j) => j.status === 'estimate')?.id || list[0]?.id;
const prod = list.find((j) => j.stage === 'parts_hold')?.id || list[1]?.id;
const done = list.find((j) => j.status === 'completed')?.id;
await t('job bundle', async () => { const b = ok(await call('GET', `/api/jobs/${jid}`)); return `${b.job.number} lines=${b.lines.length} total=${b.totals.total}`; });
await t('board', async () => { const b = ok(await call('GET', '/api/board')); return `${b.jobs.length} on board, alerts=${b.jobs.reduce((a, j) => a + j.alerts.length, 0)}`; });
await t('vin decode', async () => JSON.stringify(ok(await call('GET', '/api/vin/1HGCV1F34MA000008'))).slice(0, 100));
await t('catalog', async () => ok(await call('GET', '/api/catalog')).length + ' parts');
await t('add line', async () => ok(await call('POST', `/api/jobs/${jid}/lines`, { area: 'Front', operation: 'repair', description: 'Test repair line', labor_hours: 1.5, refinish_hours: 1 })).id);
await t('add catalog line', async () => JSON.stringify(ok(await call('POST', `/api/jobs/${jid}/lines/catalog`, { items: [{ key: 'fender_r', operation: 'replace', part_type: 'aftermarket', include_teardown: true }] }))));
await t('total loss check', async () => JSON.stringify(ok(await call('GET', `/api/jobs/${jid}`)).totals.total_loss || {}).slice(0, 100));
await t('pdf estimate', async () => { const r = await call('GET', `/api/jobs/${jid}/pdf`, null, true); const b = Buffer.from(await r.arrayBuffer()); if (r.status !== 200 || b.slice(0, 4).toString() !== '%PDF') throw new Error(r.status + ' ' + b.slice(0, 200)); return b.length + ' bytes'; });
await t('pdf supplement', async () => { const r = await call('GET', `/api/jobs/${prod}/pdf?kind=supplement&supp=1`, null, true); const b = Buffer.from(await r.arrayBuffer()); if (r.status !== 200 || b.slice(0, 4).toString() !== '%PDF') throw new Error(r.status + ' ' + b.slice(0, 200)); return b.length + ' bytes'; });
await t('share link', async () => { const s = ok(await call('POST', `/api/jobs/${jid}/share-link`, { kind: 'estimate', days: 7 })); const r = await fetch(s.url.replace(/^https?:\/\/[^/]+/, BASE)); const b = Buffer.from(await r.arrayBuffer()); if (b.slice(0, 4).toString() !== '%PDF') throw new Error('not pdf ' + r.status); return s.url; });
await t('build RO', async () => JSON.stringify(ok(await call('POST', `/api/jobs/${jid}/build-ro`, {}))));
await t('stage move', async () => JSON.stringify(ok(await call('PUT', `/api/jobs/${jid}/stage`, { stage: 'teardown' }))).slice(0, 110));
await t('request quotes', async () => JSON.stringify(ok(await call('POST', `/api/jobs/${jid}/request-quotes`, {}))).slice(0, 100));
await t('select quote + order', async () => {
  const b = ok(await call('GET', `/api/jobs/${jid}`));
  let n = 0;
  for (const p of b.parts) { const q = b.quotes.find((x) => x.part_id === p.id); if (q) { ok(await call('POST', `/api/quotes/${q.id}/select`, {})); n++; } }
  if (!n) return 'no quotes on bundle';
  return JSON.stringify(ok(await call('POST', `/api/jobs/${jid}/order`, {}))).slice(0, 100);
});
await t('parts list', async () => ok(await call('GET', '/api/parts?status=open')).length + ' open');
await t('backorder reschedule', async () => { const p = ok(await call('GET', '/api/parts?status=open'))[0]; return JSON.stringify(ok(await call('PUT', `/api/parts/${p.id}`, { status: 'backordered', eta: '2099-01-10' }))).slice(0, 100); });
await t('receive damaged', async () => { const p = ok(await call('GET', '/api/parts?status=open'))[0]; return JSON.stringify(ok(await call('POST', `/api/parts/${p.id}/receive`, { condition: 'damaged' }))); });
await t('tasks clock in/out', async () => { const b = ok(await call('GET', `/api/jobs/${jid}`)); const tk = b.tasks[0]; ok(await call('POST', `/api/tasks/${tk.id}/clock`, { action: 'in' })); return JSON.stringify(ok(await call('POST', `/api/tasks/${tk.id}/clock`, { action: 'out' }))); });
await t('schedule', async () => { const s = ok(await call('GET', '/api/schedule')); return `${s.events.length} events, day0 bays ${s.days[0].bays_used}/${s.days[0].bays}`; });
await t('schedule add', async () => ok(await call('POST', '/api/schedule', { job_id: jid, type: 'drop_off', start: '2026-11-20 09:00', title: 'Drop-off' })).id);
await t('message', async () => JSON.stringify(ok(await call('POST', `/api/jobs/${jid}/messages`, { body: 'Test update', channel: 'sms' }))).slice(0, 100));
await t('request approval', async () => ok(await call('POST', `/api/jobs/${jid}/request-approval`, {})).portal);
await t('adas + scan + weld', async () => { ok(await call('POST', `/api/jobs/${jid}/scans`, { type: 'pre', tool: 'test', result: 'No codes' })); ok(await call('POST', `/api/jobs/${jid}/welds`, { weld_type: 'MIG', location_on_vehicle: 'rail' })); return 'ok'; });
await t('invoice + payments', async () => { const r = await call('POST', `/api/jobs/${done}/invoice`, {}); if (r.status === 400 && /already/.test(r.body.error)) return 'duplicate correctly refused'; return JSON.stringify(ok(r)); });
await t('payment', async () => ok(await call('POST', `/api/jobs/${done}/payments`, { amount: 100, payer: 'customer', method: 'card' })).id);
await t('pdf invoice', async () => { const r = await call('GET', `/api/jobs/${done}/pdf?kind=invoice`, null, true); const b = Buffer.from(await r.arrayBuffer()); if (b.slice(0, 4).toString() !== '%PDF') throw new Error(r.status + ' ' + b.slice(0, 300)); return b.length + ' bytes'; });
await t('A/R', async () => { const a = ok(await call('GET', '/api/ar')); return JSON.stringify(a.buckets); });
await t('payroll', async () => ok(await call('GET', '/api/payroll')).rows.length + ' rows');
await t('paint inventory', async () => ok(await call('GET', '/api/paint/inventory')).length + ' items');
await t('paint usage', async () => { const it = ok(await call('GET', '/api/paint/inventory'))[0]; return JSON.stringify(ok(await call('POST', `/api/jobs/${prod}/paint-usage`, { inventory_id: it.id, qty: 0.5 }))); });
await t('paint reconcile', async () => ok(await call('GET', '/api/paint/reconcile')).length + ' jobs');
await t('paint reorder', async () => ok(await call('POST', '/api/paint/reorder', {})).items + ' low');
await t('formulas', async () => ok(await call('GET', '/api/paint/formulas?make=Toyota')).length);
await t('reports', async () => JSON.stringify(ok(await call('GET', '/api/reports?days=90')).kpis).slice(0, 110));
await t('reports csv', async () => { const r = await call('GET', '/api/reports/export', null, true); return (await r.text()).split('\n').length + ' lines'; });
await t('export csv/ems/bms', async () => { const o = []; for (const f of ['csv', 'ems', 'bms']) { const r = await call('GET', `/api/jobs/${jid}/export?format=${f}`, null, true); if (r.status !== 200) throw new Error(f + ' ' + r.status); o.push(f + ':' + (await r.text()).length); } return o.join(' '); });
await t('import bms', async () => { const r = await call('GET', `/api/jobs/${jid}/export?format=bms`, null, true); const x = await r.text(); return JSON.stringify(ok(await call('POST', `/api/jobs/${prod}/import`, { text: x }))); });
await t('accounting iif', async () => { const r = await call('GET', '/api/accounting/export?format=iif', null, true); return (await r.text()).split('\n').length + ' lines'; });
await t('settings + integrations', async () => ok(await call('GET', '/api/settings')).integrations.length + ' integrations');
await t('users', async () => ok(await call('GET', '/api/users')).length);
await t('audit', async () => ok(await call('GET', '/api/audit')).length + ' entries');
await t('vendors/insurers', async () => ok(await call('GET', '/api/vendors')).length + '/' + ok(await call('GET', '/api/insurers')).length);
await t('oem docs', async () => ok(await call('GET', '/api/oem-docs?make=Toyota')).length);
await t('compliance', async () => ok(await call('GET', '/api/compliance')).length);
await t('api key + v1 scan', async () => { const k = ok(await call('POST', '/api/api-keys', { name: 'Scan tool test' })); const b = ok(await call('GET', `/api/jobs/${jid}`)); const r = await fetch(BASE + `/api/v1/jobs/${b.job.number}/scans`, { method: 'POST', headers: { Authorization: 'Bearer ' + k.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'post', tool: 'asTech', result: 'clear' }) }); if (r.status !== 200) throw new Error(r.status + ' ' + await r.text()); return 'ok'; });
await t('portal', async () => { const b = ok(await call('GET', `/api/jobs/${jid}`)); const p = ok(await call('GET', `/api/portal/${b.job.portal_token}`)); return `${p.number} ${p.stage_label} total ${p.estimate.totals.total}`; });
await t('portal sign', async () => { const b = ok(await call('GET', `/api/jobs/${jid}`)); const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='; return JSON.stringify(ok(await call('POST', `/api/portal/${b.job.portal_token}/approve`, { name: 'Test Customer', signature: png }))); });
await t('pdf after signature', async () => { const r = await call('GET', `/api/jobs/${jid}/pdf`, null, true); const b = Buffer.from(await r.arrayBuffer()); if (b.slice(0, 4).toString() !== '%PDF') throw new Error(r.status + ' ' + b.slice(0, 300)); return b.length; });
await t('csrf blocked', async () => { const r = await fetch(BASE + '/api/jobs', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' }); if (r.status !== 403) throw new Error('got ' + r.status); });
await t('backup', async () => { const r = await call('GET', '/api/backup', null, true); const j = await r.json(); return Object.keys(j.tables).length + ' tables'; });
console.log(`\n${passed} passed, ${fails.length} failed${fails.length ? ': ' + fails.join(', ') : ''}`);
