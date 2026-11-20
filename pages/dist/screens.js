import { S, api, toast, view, $, $$, esc, money, shell, route, icon, signOut } from './app.js';
import { editCustomer } from './customer.js';

// ---------- job tabs ----------
export function jobTabs(id, cur) {
  const t = [['estimate', 'Estimate'], ['3d', '3D picker'], ['vehicle', 'Vehicle & photos'], ['finish', 'PDF & share']];
  return `<div class="tabs">${t.map(([k, n]) => `<button class="${k === cur ? 'on' : ''}" data-href="#/job/${id}/${k}">${n}</button>`).join('')}</div>`;
}
export async function loadJob(id, force) {
  if (force || !S.job || S.job.job.id !== Number(id)) S.job = await api(`/api/jobs/${id}`);
  return S.job;
}
export function vehLabel(v) { return v ? [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') : 'No vehicle'; }

const CLOSED = ['delivered', 'closed', 'total_loss', 'lost'];
function stageName(k) { const st = (S.me?.stages || []).find((x) => x[0] === k); return st ? st[1] : String(k || '').replace(/_/g, ' '); }
view('jobs', async () => {
  shell('Estimates', '', `<div class="page jobs"><label class="search">${icon('search')}<input id="q" type="search" placeholder="Search RO, customer, VIN, vehicle" aria-label="Search estimates" autocomplete="off"></label><div id="jl"><div class="card mut">Loading…</div></div></div>`, `<a class="btn pri dk" href="#/new">${icon('plus')}New estimate</a>`);
  const jobs = await api('/api/jobs');
  const rows = Array.isArray(jobs) ? jobs : jobs.jobs || jobs.results || [];
  const veh = (j) => [j.year, j.make, j.model].filter(Boolean).join(' ') || 'No vehicle yet';
  const heroIds = rows.filter((j) => !CLOSED.includes(j.status)).slice(0, 3).map((j) => j.id);
  const hero = (j, i) => `<article class="hero g${i % 3}" data-href="#/job/${j.id}/estimate" tabindex="0" role="link" aria-label="${esc(j.number)} ${esc(veh(j))}">
    <div class="hh"><span class="pill gl">${esc(j.number)}</span><span class="pill gl">${esc(stageName(j.stage || j.status))}</span><span class="grow"></span><span class="ib">${icon('arrow')}</span></div>
    <h2>${esc(veh(j))}</h2>
    <div class="glass"><div class="gi"><small>Vehicle</small><b>${esc([j.color, j.vin ? 'VIN …' + String(j.vin).slice(-6) : ''].filter(Boolean).join(' · ') || '—')}</b></div>
    <div class="gi"><small>Customer</small><b>${esc(j.customer_name || '—')}</b></div>
    <div class="gi tot"><small>Total</small><span class="wpill" data-tot="${j.id}">…</span></div></div></article>`;
  const row = (j) => `<a class="jrow" href="#/job/${j.id}/estimate"><span class="av">${icon('car')}</span><span class="jm"><b>${esc(veh(j))}</b><span class="mut sm">${esc(j.number)} · ${esc(j.customer_name || '—')}</span></span><span class="tag st-${esc(j.stage || j.status)}">${esc(stageName(j.stage || j.status))}</span>${icon('chev', 'chev')}</a>`;
  const draw = (q = '') => {
    const ql = q.trim().toLowerCase();
    if (!rows.length) { $('#jl').innerHTML = `<div class="card empty"><span class="eic">${icon('doc')}</span><h2>No estimates yet</h2><p class="mut">Start one with the VIN, then pick the damaged parts on the car.</p><a class="btn pri" href="#/new">${icon('plus')}New estimate</a></div>`; return; }
    if (ql) {
      const f = rows.filter((j) => [j.number, j.customer_name, j.vin, j.make, j.model, j.year, j.claim_no].join(' ').toLowerCase().includes(ql));
      $('#jl').innerHTML = `<h2 class="sec">${f.length} ${f.length === 1 ? 'match' : 'matches'}</h2><div class="jlist">${f.map(row).join('') || '<div class="card mut">No estimates match.</div>'}</div>`;
      return;
    }
    const hs = rows.filter((j) => heroIds.includes(j.id)); const rest = rows.filter((j) => !heroIds.includes(j.id));
    $('#jl').innerHTML = (hs.length ? `<h2 class="sec">In progress <span class="cnt">${hs.length}</span></h2><div class="heros">${hs.map(hero).join('')}</div>` : '')
      + (rest.length ? `<h2 class="sec">${hs.length ? 'All other estimates' : 'All estimates'} <span class="cnt">${rest.length}</span></h2><div class="jlist">${rest.map(row).join('')}</div>` : '');
    hs.forEach((j) => api(`/api/jobs/${j.id}`, { quiet: true }).then((b) => { const el = $(`[data-tot="${j.id}"]`); if (el) el.textContent = money(b.totals?.total); }).catch(() => { const el = $(`[data-tot="${j.id}"]`); if (el) el.textContent = '—'; }));
  };
  draw(); $('#q').oninput = (e) => draw(e.target.value);
  $$('#jl').forEach((x) => x.addEventListener('keydown', (e) => { const h = e.target.closest?.('.hero'); if (h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); location.hash = h.dataset.href; } }));
});

// ---------- VIN decode + scan ----------
export async function decodeVin(vin) {
  vin = String(vin || '').toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
  if (vin.length !== 17) { toast('A VIN has 17 characters (no I, O or Q)', true); return null; }
  return api(`/api/vin/${vin}`);
}
export async function scanVin() {
  if (!('BarcodeDetector' in window)) { toast('Barcode scanning is not supported in this browser. Type the VIN or use photo + AI read.', true); return null; }
  const fmts = await window.BarcodeDetector.getSupportedFormats().catch(() => []);
  const det = new window.BarcodeDetector({ formats: ['code_39', 'code_128', 'data_matrix', 'qr_code', 'pdf417'].filter((f) => fmts.includes(f)) });
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div><h3 style="margin-top:0">Scan VIN barcode</h3><video class="scan" playsinline muted></video><p class="mut sm">Point at the door-jamb or windshield VIN barcode.</p><button id="cx">Cancel</button></div>`;
  document.body.appendChild(m);
  let stream; let done = false;
  return new Promise(async (res) => {
    const end = (v) => { done = true; stream?.getTracks().forEach((t) => t.stop()); m.remove(); res(v); };
    $('#cx', m).onclick = () => end(null);
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); } catch { toast('Camera not available', true); return end(null); }
    const v = $('video', m); v.srcObject = stream; await v.play();
    const tick = async () => { if (done) return; try { const r = await det.detect(v); const hit = r.map((x) => x.rawValue.replace(/^I/, '').toUpperCase()).find((x) => /^[A-HJ-NPR-Z0-9]{17}$/.test(x)); if (hit) return end(hit); } catch {} setTimeout(tick, 250); };
    tick();
  });
}
function vinFields(d) {
  return { vin: d.vin, year: d.year, make: d.make, model: d.model, trim: d.trim, body: d.body, engine: d.engine, vin_data: d };
}
function decodedHtml(d) {
  const m = d.model3d || {};
  const bits = [['Year', d.year], ['Make', d.make], ['Model', d.model], ['Trim', d.trim], ['Body', d.body], ['Doors', d.doors], ['Cab', d.cab], ['Bed', d.bed_length_in ? d.bed_length_in + ' in' : ''], ['Engine', d.engine], ['Drive', d.drive], ['Wheelbase', d.wheelbase_in ? d.wheelbase_in + ' in' : ''], ['3D model', [m.style, m.cab, m.bed && m.bed + ' bed', m.doors && m.doors + '-door'].filter(Boolean).join(', ')]];
  return `<div class="grid2">${bits.filter((b) => b[1]).map(([k, v]) => `<div><label>${k}</label><b>${esc(v)}</b></div>`).join('')}</div>${d.error_text ? `<p class="mut sm">NHTSA: ${esc(d.error_text)}</p>` : ''}`;
}

view('new', async () => {
  shell('New estimate', '', `<div class="page"><form id="nf">
  <div class="card"><h3>Vehicle</h3><div class="row"><input name="vin" id="vin" placeholder="VIN (17)" maxlength="17" style="max-width:260px;text-transform:uppercase" autocomplete="off"><button type="button" id="dec" class="pri">Decode</button><button type="button" id="scan">Scan barcode</button></div>
  <div id="decoded" style="margin-top:8px"></div>
  <div class="grid2"><div><label>Year</label><input name="year"></div><div><label>Make</label><input name="make"></div><div><label>Model</label><input name="model"></div><div><label>Trim</label><input name="trim"></div><div><label>Color</label><input name="color" placeholder="e.g. Lunar Silver"></div><div><label>Paint code</label><input name="paint_code"></div><div><label>Odometer</label><input name="odometer" inputmode="numeric"></div><div><label>Plate</label><input name="plate"></div></div></div>
  <div class="card"><h3>Customer</h3><div class="grid2"><div><label>Name *</label><input name="cname" required></div><div><label>Phone</label><input name="phone" type="tel"></div><div><label>Email</label><input name="email" type="email"></div><div><label>Claim #</label><input name="claim_no"></div><div><label>Deductible</label><input name="deductible" inputmode="decimal"></div><div><label>Insurer</label><select name="insurer_id" id="ins"><option value="">Customer pay</option></select></div></div></div>
  <button class="pri" id="create" type="submit">Create estimate</button></form></div>`);
  let decoded = null;
  api('/api/insurers', { quiet: true }).then((l) => { $('#ins').innerHTML += (l || []).map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join(''); }).catch(() => {});
  const fill = (d) => { decoded = d; $('#decoded').innerHTML = decodedHtml(d); for (const k of ['year', 'make', 'model', 'trim']) if (d[k]) $(`[name=${k}]`).value = d[k]; };
  $('#dec').onclick = async () => { const d = await decodeVin($('#vin').value); if (d) fill(d); };
  $('#scan').onclick = async () => { const v = await scanVin(); if (v) { $('#vin').value = v; const d = await decodeVin(v); if (d) fill(d); } };
  $('#nf').onsubmit = async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const vehicle = { ...(decoded ? vinFields(decoded) : {}), vin: f.vin.toUpperCase() || null, year: f.year, make: f.make, model: f.model, trim: f.trim, color: f.color, paint_code: f.paint_code, odometer: f.odometer || null, plate: f.plate };
    const r = await api('/api/jobs', { method: 'POST', body: { customer: { name: f.cname, phone: f.phone, email: f.email }, vehicle, claim_no: f.claim_no || null, deductible: f.deductible || null, insurer_id: f.insurer_id || null } });
    location.hash = `#/job/${r.id}/3d`;
  };
});

view('customers', async () => {
  shell('Customers', '', `<div class="page"><div class="custtop"><label class="search">${icon('search')}<input id="q" type="search" placeholder="Search name, phone or email" aria-label="Search customers" autocomplete="off"></label><button class="pri" id="newcust">${icon('plus')}New customer</button></div><div class="card list" id="cl" style="padding:0"></div></div>`);
  const list = await api('/api/customers');
  let rows = Array.isArray(list) ? list : list.results || [];
  const match = (c, q) => { if (!q) return true; const t = q.toLowerCase(), d = q.replace(/\D/g, ''); return [c.name, c.email, c.phone, c.address].some((x) => String(x || '').toLowerCase().includes(t)) || (d.length >= 3 && String(c.phone || '').replace(/\D/g, '').includes(d)); };
  const draw = () => {
    const q = $('#q').value.trim();
    $('#cl').innerHTML = rows.filter((c) => match(c, q)).map((c) => `<button type="button" class="it custrow" data-id="${c.id}" aria-label="Edit ${esc(c.name)}"><span class="av">${icon('user')}</span><span class="grow"><b>${esc(c.name)}</b><span class="mut sm cr">${esc([c.phone, c.email].filter(Boolean).join(' · ') || 'No contact details')}</span></span>${c.sms_opt_in === 0 ? '<span class="tag warn">Texts off</span>' : ''}<span class="mut sm cjobs">${c.jobs ? c.jobs + (c.jobs === 1 ? ' job' : ' jobs') : ''}</span>${icon('edit', 'mut')}</button>`).join('') || `<div class="it mut">${q ? 'No customers match' : 'No customers yet'}</div>`;
  };
  draw(); $('#q').oninput = draw;
  $('#cl').onclick = async (e) => {
    const r = e.target.closest('.custrow'); if (!r) return;
    const cu = rows.find((x) => x.id === Number(r.dataset.id));
    const saved = await editCustomer(cu);
    if (saved) { rows = rows.map((x) => (x.id === saved.id ? { ...x, ...saved } : x)); if (S.job?.customer?.id === saved.id) S.job.customer = { ...S.job.customer, ...saved }; draw(); }
  };
  $('#newcust').onclick = async () => {
    const saved = await editCustomer(null);
    if (saved) { rows = [{ ...saved, jobs: 0 }, ...rows]; $('#q').value = ''; draw(); }
  };
});

// ---------- vehicle + guided photos ----------
const SHOTS = [['vin', 'VIN plate'], ['odometer', 'Odometer'], ['front', 'Front'], ['front_left', 'Front left 45°'], ['left', 'Left side'], ['rear_left', 'Rear left 45°'], ['rear', 'Rear'], ['rear_right', 'Rear right 45°'], ['right', 'Right side'], ['front_right', 'Front right 45°'], ['damage_close', 'Damage close-up'], ['damage_wide', 'Damage wide'], ['interior', 'Interior'], ['plate', 'License plate']];
view('job', async (id, tab = 'estimate') => {
  const VI = { estimate: 'estimateView', '3d': 'pickerView', vehicle: 'vehicleView', finish: 'finishView' };
  const fn = window.CP?.[VI[tab]];
  if (fn) return fn(id);
});
window.CP = window.CP || {};
window.CP.vehicleView = async (id) => {
  const b = await loadJob(id, true); const v = b.vehicle || {};
  shell(esc(b.job.number), esc(vehLabel(v)), jobTabs(id, 'vehicle') + `<div class="page">
  <div class="card"><h3>Vehicle</h3><div class="row"><input id="vin" value="${esc(v.vin || '')}" maxlength="17" style="max-width:240px;text-transform:uppercase"><button id="dec" class="pri">Decode & update</button><button id="scan">Scan</button></div>
  <div id="decoded" style="margin-top:8px">${v.vin_data ? decodedHtml(typeof v.vin_data === 'string' ? JSON.parse(v.vin_data) : v.vin_data) : ''}</div>
  <div class="grid2">${['color', 'paint_code', 'odometer', 'plate'].map((k) => `<div><label>${k.replace('_', ' ')}</label><input data-k="${k}" value="${esc(v[k] || '')}"></div>`).join('')}</div><button id="sv" style="margin-top:8px">Save</button></div>
  <div class="card"><h3>Guided photos</h3><div class="photos">${SHOTS.map(([k, n]) => { const f = (b.files || []).find((x) => x.caption === k || x.kind === 'photo_' + k); return `<label class="shot ${f ? 'done' : ''}" data-k="${k}">${f ? `<img src="/api/files/${f.id}" alt="">` : '<span style="font-size:26px">📷</span>'}<span class="sm">${n}</span><input type="file" accept="image/*" capture="environment" hidden></label>`; }).join('')}</div><p class="mut sm">Photos are stored in the shop's file storage (Cloudflare R2).</p></div></div>`);
  const save = async (extra = {}) => { if (!v.id) return toast('No vehicle on this job', true); const body = { ...extra }; $$('[data-k]').forEach((i) => { if (i.tagName === 'INPUT' && i.type !== 'file') body[i.dataset.k] = i.value; }); await api(`/api/vehicles/${v.id}`, { method: 'PUT', body }); toast('Saved'); S.job = null; };
  const upd = async (vin) => { const d = await decodeVin(vin); if (!d) return; $('#decoded').innerHTML = decodedHtml(d); await save(vinFields(d)); };
  $('#dec').onclick = () => upd($('#vin').value);
  $('#scan').onclick = async () => { const x = await scanVin(); if (x) { $('#vin').value = x; upd(x); } };
  $('#sv').onclick = () => save();
  $$('.shot input').forEach((inp) => inp.onchange = async () => {
    const file = inp.files[0]; if (!file) return; const k = inp.closest('.shot').dataset.k;
    const fd = new FormData(); fd.append('file', file); fd.append('job_id', id); fd.append('kind', 'photo'); fd.append('caption', k);
    await api('/api/files', { method: 'POST', body: fd }); toast('Photo saved'); window.CP.vehicleView(id);
  });
};

// ---------- settings ----------
view('settings', async () => {
  if (!(S.me?.caps || []).includes('*')) { shell('Settings', '', '<div class="page"><div class="card"><p>Only the shop owner can open Settings.</p></div></div>'); return; }
  const locs = await api('/api/locations'); const loc = (Array.isArray(locs) ? locs : [])[0] || {};
  const rules = (() => { try { return JSON.parse(loc.est_rules || '{}'); } catch { return {}; } })();
  const R = (p, k, d = '') => esc(rules[p]?.[k] ?? d);
  const st = S.settings; const ps = await api('/api/parts/status', { quiet: true }).catch(() => ({}));
  const ins = await api('/api/insurers', { quiet: true }).catch(() => []);
  const taxK = ['parts', 'paint_mat', 'labor_body', 'labor_refinish', 'labor_frame', 'labor_structural', 'labor_mech', 'labor_glass', 'sublet', 'misc'];
  const PT = ['OEM', 'aftermarket', 'recycled', 'reconditioned'];
  shell('Settings', esc(loc.name || ''), `<div class="page">
  <div class="card"><h3>Shop name</h3><p class="sm mut">Shown in the app header, on the sign-in screen, on estimate PDFs and on customer links.</p><div class="row"><input id="shn" class="grow" maxlength="80" value="${esc(st.shop_name || S.me?.shop_name || '')}"><button class="pri" id="shs">Save</button></div></div>
  <div class="card" id="emp"><h3>Employees</h3><p class="sm mut">Employees sign in with their own email and password. They can create and manage estimates only. They can't see Settings, rates, reports, invoices or other money screens.</p><div id="el">Loading…</div>
  <div class="grid2" style="margin-top:10px"><div><label>Name</label><input id="en" maxlength="80"></div><div><label>Email</label><input id="ee" type="email"></div><div><label>Temporary password (10+ characters)</label><input id="ep" type="text" autocomplete="off" minlength="10"></div><div style="align-self:end"><button class="pri" id="ea">Add employee</button></div></div></div>
  <div class="card" id="smsset"><h3>Texting</h3><p class="mut">Loading…</p></div>
  <div class="card" id="devpref"></div>
  <div class="card"><h3>Labor rates ($/hr)</h3><div class="grid2">${[['rate_body', 'Body'], ['rate_paint', 'Refinish'], ['rate_frame', 'Frame'], ['rate_structural', 'Structural'], ['rate_mech', 'Mechanical'], ['rate_glass', 'Glass'], ['paint_mat_rate', 'Paint & materials /rfn hr'], ['tax_rate', 'Default tax rate (0.0825 = 8.25%)']].map(([k, n]) => `<div><label>${n}</label><input data-loc="${k}" value="${esc(loc[k] ?? '')}" inputmode="decimal"></div>`).join('')}</div></div>
  <div class="card"><h3>Paint & materials formula</h3><div class="grid2"><div><label>Mode</label><select data-r="pm.mode">${['per_rfn_hour', 'pct_refinish'].map((m) => `<option ${rules.pm?.mode === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div><div><label>Rate override $/hr</label><input data-r="pm.rate" value="${R('pm', 'rate')}"></div><div><label>% of refinish labor</label><input data-r="pm.pct" value="${R('pm', 'pct', 0)}"></div><div><label>Cap $ (0 = none)</label><input data-r="pm.cap" value="${R('pm', 'cap', 0)}"></div><div><label>3-stage multiplier</label><input data-r="pm.stage3_mult" value="${R('pm', 'stage3_mult', 1.5)}"></div><div><label>2-tone multiplier</label><input data-r="pm.tone2_mult" value="${R('pm', 'tone2_mult', 1.25)}"></div></div></div>
  <div class="card"><h3>Tax per category (blank = default rate)</h3><div class="grid2">${taxK.map((k) => `<div><label>${k.replace('_', ' ')}</label><input data-r="tax.${k}" value="${R('tax', k)}"></div>`).join('')}</div></div>
  <div class="card"><h3>Markup / discount % by part type</h3><div class="grid2">${PT.map((k) => `<div><label>${k} markup</label><input data-r="markup.${k}" value="${R('markup', k, 0)}"></div><div><label>${k} discount</label><input data-r="discount.${k}" value="${R('discount', k, 0)}"></div>`).join('')}<div><label>Sublet markup</label><input data-r="markup.sublet" value="${R('markup', 'sublet', 0)}"></div></div><button class="pri" id="svr" style="margin-top:10px">Save rates & rules</button></div>
  <div class="card"><h3>Insurer parts discounts %</h3>${(ins || []).map((i) => { const d = (() => { try { return JSON.parse(i.parts_discounts || '{}'); } catch { return {}; } })(); return `<div class="row" style="margin-bottom:6px"><b style="min-width:140px">${esc(i.name)}</b>${PT.map((k) => `<input style="width:90px" placeholder="${k}" title="${k}" data-ins="${i.id}" data-pt="${k}" value="${esc(d[k] ?? '')}">`).join('')}</div>`; }).join('') || '<p class="mut">No insurers yet.</p>'}<button id="svi">Save insurer discounts</button></div>
  <div class="card"><h3>Parts catalog source</h3><p class="sm mut">PartsTech gives US aftermarket parts with live supplier pricing and stock. Autodoc (RapidAPI) gives article numbers, brands, OEM cross-references and images, but it is mainly a European catalog, so US coverage and OEM pricing may be limited.</p>
  <div class="row"><select id="prov" style="max-width:320px">${[['partstech_autodoc', 'PartsTech first for US vehicles, Autodoc backup'], ['autodoc', 'Autodoc only'], ['sample', 'No catalog (enter parts by hand)'], ['partstech_mock', 'PartsTech mock responses (testing)'], ['autodoc_mock', 'Autodoc mock responses (testing)']].map(([k, n]) => `<option value="${k}" ${((st.vin_parts_provider && st.vin_parts_provider !== 'none') ? st.vin_parts_provider : 'sample') === k ? 'selected' : ''}>${n}</option>`).join('')}</select><button id="svp">Save</button><button id="tp">Test connection</button></div>
  <p class="sm">Autodoc key: ${ps.key_set ? '<span class="tag live">stored as server secret</span>' : '<span class="tag">not stored</span>'} · PartsTech: ${ps.partstech_ready ? '<span class="tag live">connected</span>' : ps.partstech_user_set ? '<span class="tag">waiting for partner keys from PartsTech. Your user ID and API key are saved.</span>' : '<span class="tag">no user ID and API key saved yet</span>'} <span class="mut">(keys never reach this browser)</span></p></div>
  <div class="card"><h3>3D models</h3><p class="sm mut">Upload an exact .glb model for a year/make/model (from a licensed library). Mesh names that match part names (e.g. hood, fender_l, door_lf) become tappable. Without one, the closest built-in body style is used.</p>
  <div class="row"><input id="mk" placeholder="year|make|model  e.g. 2020|Honda|Accord  (* = any year)" class="grow"><input id="mf" type="file" accept=".glb" style="max-width:220px"><button id="mu">Upload</button></div>
  <label>Model library URL (optional, licensed CDN, .glb files named year_make_model.glb)</label><input id="mlib" value="${esc(st.model_library_url || '')}"></div>
  <div class="card"><h3>Integrations</h3>${(st.integrations || []).map((i) => `<div class="row sm intg" style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${esc(i.name)}</b><span class="grow mut">${esc(i.status)}</span></div>`).join('')}</div></div>`);
  const loadEmp = async () => {
    const us = await api('/api/users', { quiet: true }).catch(() => []);
    const emps = (us || []).filter((u) => u.role !== 'owner' && !String(u.email || '').startsWith('removed-'));
    $('#el').innerHTML = emps.length ? emps.map((u) => `<div class="row sm emprow" style="padding:6px 0;border-bottom:1px solid var(--line)"><b class="grow">${esc(u.name)} <span class="mut">${esc(u.email)}</span></b><span class="tag ${u.active ? 'live' : ''}">${u.active ? 'active' : 'disabled'}</span><button class="sm" data-tog="${u.id}" data-act="${u.active ? 0 : 1}">${u.active ? 'Disable' : 'Enable'}</button><button class="sm" data-pw="${u.id}">Reset password</button><button class="sm danger" data-rm="${u.id}">Remove</button></div>`).join('') : '<p class="sm mut">No employees yet.</p>';
    $$('[data-tog]').forEach((b) => b.onclick = async () => { await api(`/api/users/${b.dataset.tog}`, { method: 'PUT', body: { active: Number(b.dataset.act) } }); toast(b.dataset.act === '1' ? 'Employee enabled' : 'Employee disabled'); loadEmp(); });
    $$('[data-pw]').forEach((b) => b.onclick = () => {
      const row = b.closest('.row'); if (row.nextElementSibling?.classList.contains('pwr')) { row.nextElementSibling.remove(); return; }
      row.insertAdjacentHTML('afterend', `<div class="row pwr sm" style="padding:6px 0"><input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" class="grow" placeholder="New password (10+ characters)"><button class="pri sm">Save password</button></div>`);
      const box = row.nextElementSibling, inp = box.querySelector('input'); inp.focus();
      box.querySelector('button').onclick = async () => {
        const pw = inp.value.trim(); if (pw.length < 10) return toast('Password must be at least 10 characters', true);
        await api(`/api/users/${b.dataset.pw}`, { method: 'PUT', body: { password: pw, active: 1 } }); box.remove(); toast('Password changed. Give it to the employee; they can sign in with it now.'); loadEmp();
      };
    });
    $$('[data-rm]').forEach((b) => b.onclick = async () => { if (!confirm('Remove this employee? They will be signed out and can no longer sign in. Their estimates stay.')) return; await api(`/api/users/${b.dataset.rm}`, { method: 'DELETE' }); toast('Employee removed'); loadEmp(); });
  };
  loadEmp();
  import('./ops2.js').then((m) => m.smsSettings($('#smsset')));
  import('./prefs.js').then((m) => m.devicePrefs($('#devpref')));
  $('#shs').onclick = async () => { const v = $('#shn').value.trim(); if (v.length < 2) return toast('Enter the shop name', true); await api('/api/settings', { method: 'PUT', body: { shop_name: v } }); S.settings.shop_name = v; if (S.me) S.me.shop_name = v; document.title = v; toast('Shop name saved'); location.hash = '#/settings'; route(); };
  $('#ea').onclick = async () => {
    const body = { name: $('#en').value.trim(), email: $('#ee').value.trim(), password: $('#ep').value, role: 'employee', active: 1 };
    if (body.password.length < 10) return toast('Password must be at least 10 characters', true);
    await api('/api/users', { method: 'POST', body }); $('#en').value = $('#ee').value = $('#ep').value = ''; toast('Employee added. Give them the email and temporary password.'); loadEmp();
  };
  $('#svr').onclick = async () => {
    const body = {}; $$('[data-loc]').forEach((i) => { body[i.dataset.loc] = i.value === '' ? null : Number(i.value); });
    const r = JSON.parse(JSON.stringify(rules));
    $$('[data-r]').forEach((i) => { const [p, k] = i.dataset.r.split('.'); r[p] = r[p] || {}; const v = i.value.trim(); r[p][k] = p === 'pm' && k === 'mode' ? v : v === '' ? null : Number(v); });
    body.est_rules = r; await api(`/api/locations/${loc.id}`, { method: 'PUT', body }); S.job = null; toast('Rates and rules saved');
  };
  $('#svi').onclick = async () => { const by = {}; $$('[data-ins]').forEach((i) => { (by[i.dataset.ins] = by[i.dataset.ins] || {})[i.dataset.pt] = i.value === '' ? '' : Number(i.value); }); for (const [id, d] of Object.entries(by)) await api(`/api/insurers/${id}`, { method: 'PUT', body: { parts_discounts: JSON.stringify(d) } }); toast('Insurer discounts saved'); };
  $('#svp').onclick = async () => { await api('/api/settings', { method: 'PUT', body: { vin_parts_provider: $('#prov').value, model_library_url: $('#mlib').value } }); S.settings.vin_parts_provider = $('#prov').value; S.settings.model_library_url = $('#mlib').value; toast('Saved'); };
  $('#tp').onclick = async () => { const r = await api('/api/parts/test', { method: 'POST' }); toast([r.partstech && 'PartsTech: ' + r.partstech, r.autodoc && 'Autodoc: ' + r.autodoc].filter(Boolean).join(' · ') || r.message || (r.ok ? 'OK' : 'Failed'), !r.ok); };
  $('#mu').onclick = async () => { const f = $('#mf').files[0]; const k = $('#mk').value.trim(); if (!f || k.split('|').length !== 3) return toast('Pick a .glb and enter year|make|model', true); const fd = new FormData(); fd.append('file', f); fd.append('kind', 'model3d'); fd.append('caption', k); await api('/api/files', { method: 'POST', body: fd }); toast('Model uploaded'); };
});

view('help', async () => {
  shell('Help', '', `<div class="page"><div class="card"><h3>Keyboard (desktop grid)</h3><p class="sm"><span class="kbd">/</span> search · <span class="kbd">N</span> new line · <span class="kbd">↑ ↓</span> move row · <span class="kbd">Enter</span> next row same column · <span class="kbd">Space</span> select row (when not editing) · <span class="kbd">Ctrl+A</span> select all · <span class="kbd">Ctrl+D</span> duplicate selected · <span class="kbd">Del</span> delete selected · <span class="kbd">Esc</span> clear selection · <span class="kbd">3</span> 3D picker · <span class="kbd">P</span> PDF</p></div>
  <div class="card"><h3>Phone</h3><p class="sm">Swipe a grid row left for Duplicate / Delete. Long-press a row to select it and open the bulk-edit bar. In 3D: one finger rotates, two fingers zoom and pan, tap a part to price it, Go into to see its sub-parts.</p></div>
  <div class="card"><h3>Data</h3><p class="sm">The 3D car's parts start with no hours or prices: enter your own, or set standard hours per part in Settings. Parts from a connected catalog are marked with their source, e.g. <span class="tag live">Autodoc</span>.</p></div></div>`);
});

view('account', async () => {
  const me = S.me?.user || {};
  shell('My account', '', `<div class="page"><div class="card acct" style="max-width:560px"><span class="av lg">${icon('user')}</span><div class="grow"><b class="an">${esc(me.name || '')}</b><div class="mut sm">${esc(me.email || '')}</div><span class="tag" style="margin-top:6px">${esc(me.role === 'owner' ? 'Owner' : me.role === 'employee' ? 'Employee' : me.role || '')}</span></div></div>
  <div class="card" style="max-width:560px"><h3>Change your password</h3>
  <form id="cpf"><label>Current password</label><input name="cur" type="password" autocomplete="current-password" required>
  <label>New password (10+ characters)</label><input name="pw" type="password" autocomplete="new-password" minlength="10" required>
  <label>Confirm new password</label><input name="pw2" type="password" autocomplete="new-password" minlength="10" required>
  <div style="margin-top:16px"><button class="pri">Change password</button></div></form></div>
  <div class="card" id="devpref" style="max-width:560px"></div>
  <div class="card" style="max-width:560px"><h3>Sign out</h3><p class="mut sm">Sign out of R&amp;R Auto Express on this device.</p><button id="so" class="sec wide">${icon('out')}Sign out</button></div></div>`);
  $('#so').onclick = () => signOut();
  import('./prefs.js').then((m) => m.devicePrefs($('#devpref')));
  $('#cpf').onsubmit = async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    if (f.pw.trim().length < 10) return toast('Password must be at least 10 characters', true);
    if (f.pw !== f.pw2) return toast('The new passwords do not match', true);
    await api(`/api/users/${me.id}`, { method: 'PUT', body: { password: f.pw, current_password: f.cur } });
    e.target.reset(); toast('Password changed. Use the new one next time you sign in.');
  };
});
