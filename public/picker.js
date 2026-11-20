import { S, api, toast, $, $$, esc, money, hrs, shell } from './app.js';
import { jobTabs, loadJob, vehLabel } from './screens.js';
import { createPicker, MARK_COLORS, STYLE_LABEL, quality3d, releaseShared3d } from './car3d.js';
import { createDiagram } from './diagram2d.js';

const GROUP_ORDER = ['Front end', 'Hood & fenders', 'Lamps', 'Doors', 'Sides & quarters', 'Rear', 'Roof & glass', 'Interior', 'Mechanical & electrical', 'Wheels & suspension', 'Structural'];
const PRICE_K = { OEM: 'price_oem', aftermarket: 'price_aftermarket', recycled: 'price_recycled', reconditioned: 'price_reconditioned' };
let P = null; // state for the open picker screen

function family(m3d) { return m3d?.family || 'sedan'; }
function rowsFor(mesh) { return P.cat.filter((r) => r.mesh === mesh); }
function asmRows(asm) { return P.cat.filter((r) => r.assembly === asm); }
function doorOK(r) { const d = P.m3d?.doors || 4; return d > 2 || !/^door_[lr]r/.test(r.assembly || r.mesh || ''); }
function lineMarks() {
  const byKey = Object.fromEntries(P.cat.map((r) => [r.key, r]));
  const marks = {}; const rank = { replace: 5, repair: 4, refinish: 3, blend: 2, 'r&i': 1 };
  for (const l of S.job.lines || []) {
    const r = byKey[l.catalog_key]; if (!r?.mesh) continue;
    if (!marks[r.mesh] || (rank[l.operation] || 0) > (rank[marks[r.mesh]] || 0)) marks[r.mesh] = l.operation;
    if (r.assembly && /^door_/.test(r.assembly) && /skin|shell/.test(r.mesh) && (!marks[r.assembly] || (rank[l.operation] || 0) > (rank[marks[r.assembly]] || 0))) marks[r.assembly] = l.operation;
  }
  return marks;
}
function teardownInfo() {
  const L = S.job.lines || []; const h = L.reduce((a, l) => a + (Number(l.teardown_hours) || 0), 0);
  return `${L.length} ${L.length === 1 ? 'line' : 'lines'} · R&I/teardown ${hrs(h)} h = ${money(S.job.totals?.teardown)} · total ${money(S.job.totals?.total)}`;
}

window.CP = window.CP || {};
window.CP.pickerView = async (id) => {
  const b = await loadJob(id, true);
  const m3d = b.model3d || { style: 'sedan', family: 'sedan', doors: 4 };
  const cat = await api(`/api/catalog?style=${family(m3d)}`);
  P = { id, m3d, cat: (Array.isArray(cat) ? cat : []), sel: null, prov: S.settings.vin_parts_provider || 'sample', ad: { vehicle: null } };
  P.cat = P.cat.filter(doorOK);
  const v = b.vehicle || {}; const vd = (() => { try { return typeof v.vin_data === 'string' ? JSON.parse(v.vin_data) : v.vin_data || {}; } catch { return {}; } })();
  const styleTxt = [STYLE_LABEL[m3d.style], m3d.cab && m3d.cab + ' cab', m3d.bed && m3d.bed + ' bed', m3d.doors && m3d.doors + '-door', m3d.dims_source && 'real size'].filter(Boolean).join(' · ');
  shell(esc(b.job.number), esc(vehLabel(v)), jobTabs(id, '3d') + `<div class="page"><div class="v3wrap"><div class="v3" id="v3">
   <div class="bar"><span class="seg"><button id="m2">2D<span class="lbl"> diagram</span></button><button id="m3">3D</button></span><button id="vm" title="Mirror left/right" hidden>⇄ L/R</button><span class="seg" id="vei"><button id="vx" class="on">Exterior</button><button id="vi">Interior</button></span><button id="vxr" title="See the inner structure">X-ray</button><button id="vex" title="Take the bumper apart">Explode</button><button id="vr" title="Reset view">⟲</button><span class="grow"></span><button id="vl" title="Parts list">☰<span class="lbl"> Parts list</span></button><div class="crumbs" id="crumbs" hidden><button id="vb" title="Back">←</button><span id="crumbl"></span></div></div>
   <div class="d2" id="d2" hidden></div><div class="bulk2 hide" id="bulk2"></div><div class="info" id="vinfo"><b>${esc([v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') || 'Vehicle')}</b><br><span class="mut" id="vstyle">${esc(styleTxt)} · closest built-in model</span><br><span id="td">${teardownInfo()}</span></div>
   <div class="legend">${[['replace', 'Replace'], ['repair', 'Repair'], ['refinish', 'Refinish'], ['blend', 'Blend'], ['r&i', 'R&I']].map(([k, n]) => `<span><i style="background:#${MARK_COLORS[k].toString(16).padStart(6, '0')}"></i>${n}</span>`).join('')}<span><i style="background:#2bd47a"></i>Selected</span></div></div>
   <div class="side card" id="side" style="padding:10px"><div class="row" style="margin-bottom:6px"><button class="sm on" id="tsam">Parts</button><button class="sm" id="tad">Parts catalog</button><span class="grow"></span></div>
   <div id="psam"><input id="pq" placeholder="Search parts"><div class="plist" id="pl"></div></div><div id="pad" hidden></div></div></div></div>
   <div class="sheet hide" id="sheet"></div>`);
  if (S.picker) { try { S.picker.destroy(); } catch (e) { console.warn(e); } S.picker = null; } // never keep two 3D views alive
  // The 3D car is only built when the user switches to 3D (see ensure3d). Until then this stand-in keeps its state.
  P.opts3d = {
    hasPart: (id) => P.cat.some((r) => r.mesh === id),
    onPick: pick3d,
    onMode: (m, x) => { $('#vx').classList.toggle('on', m === 'exterior'); $('#vi').classList.toggle('on', m === 'interior'); if (m === 'drill' || m === 'exploded') $('#vstyle').textContent = (m === 'exploded' ? 'Exploded: ' : 'Inside: ') + (x?.title || ''); else $('#vstyle').textContent = styleTxt + (P.exact ? ' · exact model' : ' · closest built-in model'); },
    onNav: (n) => { drawCrumbs(n); schedSync(); },
    onLost: () => fall2d('The 3D view was paused because the phone needed its graphics memory. Showing the 2D diagram; tap 3D to try again.', true),
    onSlow: () => fall2d('3D is running too slowly on this phone, so the 2D diagram is showing. You can set Parts view to "2D only" in My account.'),
  };
  const pk = stub3d();
  S.picker = pk; P.pk = pk; P.base = history.state?.cp3d || 0; P.hidx = P.base; P.styleTxt = styleTxt;
  P.vinfo = { color: v.color, make: v.make, model: v.model, year: v.year };
  pk.build(m3d, P.vinfo);
  pk.setMarks(lineMarks());
  const hasPart = (id) => /^door_[lr][fr]$/.test(id) ? P.cat.some((r) => r.mesh === id + '_skin' || r.mesh === id + '_shell' || r.assembly === id) : P.cat.some((r) => r.mesh === id);
  const short = (id) => { const r = P.cat.find((x) => x.mesh === id); return r ? r.name.split(',')[0].replace(/^(Front|Rear) bumper /, '') : ''; };
  P.multi = new Set();
  const dg = createDiagram($('#d2'), { has: hasPart, names: short, onTap: tap2d, onLong: long2d });
  P.dg = dg;
  $('#d2').hidden = false; dg.build(m3d, { color: v.color }); dg.setMarks(lineMarks());
  const pref = localStorage.getItem('cp_view');
  $('#m3').hidden = quality3d() === '2d'; // "2D only" chosen for this phone
  setView(quality3d() === '2d' ? '2d' : pref || (matchMedia('(max-width: 820px),(max-height:500px)').matches ? '2d' : '3d'));
  $('#m2').onclick = () => setView('2d');
  $('#m3').onclick = () => setView('3d');
  $('#vm').onclick = mirrorSel;
  // exact glTF hook: shop upload first, then the licensed library URL.
  // Keep this async lookup scoped to the picker instance that started it: users
  // can navigate to another repair order before the network request completes.
  const pickerSession = P;
  (async () => {
    if (!v.make) return;
    const r = await api(`/api/models3d?year=${encodeURIComponent(v.year || '')}&make=${encodeURIComponent(v.make)}&model=${encodeURIComponent(v.model || '')}`, { quiet: true }).catch(() => null);
    if (P !== pickerSession || !pickerSession.pk) return;
    let url = r?.url;
    // Bundled sample models from the companion model archive. Use only for matching vehicle names.
    if (!url) {
      const mk = String(v.make || '').toLowerCase(), md = String(v.model || '').toLowerCase();
      if (mk.includes('toyota') && md.includes('camry')) url = '/models3d/camry.glb';
      else if (mk.includes('ford') && (md.includes('f-150') || md.includes('f150'))) url = '/models3d/f150.glb';
    }
    const lib = S.settings.model_library_url;
    if (!url && lib) url = `${lib.replace(/\/$/, '')}/${[v.year, v.make, v.model].join('_').toLowerCase().replace(/[^a-z0-9_]+/g, '-')}.glb`;
    if (url && await pickerSession.pk.loadExact(url)) {
      if (P !== pickerSession) return;
      P.exact = true;
      $('#vstyle').textContent = styleTxt + ' · exact model';
      P.pk.setMarks(lineMarks());
    }
  })();
  $('#vx').onclick = () => { closeSheet(); P.pk.setMode('exterior'); };
  $('#vi').onclick = () => { closeSheet(); if (P.pk.xray) P.pk.setXray(false); P.pk.setMode('interior'); };
  $('#vb').onclick = () => goDepth(P.pk.depth - 1);
  $('#vxr').onclick = () => { closeSheet(); P.pk.setXray(!P.pk.xray); drawCrumbs(); };
  $('#vex').onclick = () => { closeSheet(); toggleExplode(); };
  drawCrumbs();
  $('#vr').onclick = () => (P.view === '2d' ? dg.resetView() : P.pk.resetView());
  const LAND = '(max-height:500px) and (orientation:landscape)';
  $('#vl').onclick = () => { if (matchMedia(LAND).matches) { const sd = $('#side'); sd.classList.toggle('open'); $('#vl').classList.toggle('on', sd.classList.contains('open')); } else $('#side').scrollIntoView({ behavior: 'smooth' }); };
  if (!$('#sidex')) $('#side .row').insertAdjacentHTML('beforeend', '<button class="sm" id="sidex" aria-label="Close parts list">✕</button>');
  $('#sidex').onclick = () => { $('#side').classList.remove('open'); $('#vl').classList.remove('on'); };
  drawList(); $('#pq').oninput = drawList;
  {
    $('#tad').onclick = () => { $('#tad').classList.add('on'); $('#tsam').classList.remove('on'); $('#psam').hidden = true; $('#pad').hidden = false; autodocPanel(); };
    $('#tsam').onclick = () => { $('#tsam').classList.add('on'); $('#tad').classList.remove('on'); $('#psam').hidden = false; $('#pad').hidden = true; };
  }
};

function drawList() {
  const q = ($('#pq')?.value || '').toLowerCase();
  const marks = lineMarks();
  const groups = {};
  for (const r of P.cat) { if (q && !(r.name + ' ' + r.key + ' ' + r.grp).toLowerCase().includes(q)) continue; (groups[r.grp] = groups[r.grp] || []).push(r); }
  const order = [...GROUP_ORDER, ...Object.keys(groups).filter((g) => !GROUP_ORDER.includes(g))];
  $('#pl').innerHTML = order.filter((g) => groups[g]).map((g) => `<div class="grp">${esc(g)} <span class="mut">(${groups[g].length})</span></div>` + groups[g].map((r) => {
    const mk = marks[r.mesh]; const col = mk ? '#' + (MARK_COLORS[mk] || MARK_COLORS.other).toString(16).padStart(6, '0') : '';
    return `<div class="p ${P.sel === r.mesh ? 'hl' : ''}" data-mesh="${esc(r.mesh || '')}" data-key="${esc(r.key)}"><span class="dot" style="${col ? 'background:' + col : ''}"></span><span class="nm">${esc(r.name)}</span><span class="pr">${r.price_oem ? money(r.price_oem) : ''}</span><button class="sm" data-add="${esc(r.key)}">+</button></div>`;
  }).join('')).join('') || '<p class="mut">No parts match.</p>';
  $$('#pl .p').forEach((el) => el.onclick = (e) => {
    const key = el.dataset.key, mesh = el.dataset.mesh; const r = P.cat.find((x) => x.key === key);
    if (e.target.dataset.add) { openPart(mesh, r.assembly, key); return; }
    if (P.view === '2d') { P.sel = mesh; openPart(mesh, r.assembly, key); if (P.dg.has(mesh)) $('#v3').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
    showOnModel(mesh, r.assembly); P.sel = mesh; openPart(mesh, r.assembly, key);
  });
}
function goInto(asm, from) {
  const rows = asmRows(asm).filter((r) => r.mesh);
  if (!rows.length) return;
  const title = asm.replace('door_lf', 'Front door, left').replace('door_rf', 'Front door, right').replace('door_lr', 'Rear door, left').replace('door_rr', 'Rear door, right').replace('front_bumper', 'Front bumper').replace('rear_bumper', 'Rear bumper').replace('decklid', 'Trunk / liftgate').replace('hood', 'Hood');
  P.back = from || 'exterior';
  P.pk.drillInto(asm, rows.map((r) => ({ key: r.key, mesh: r.mesh, name: r.name, short: r.name.split(',')[0] })), title);
}
function sheetInset() { if (!P?.pk) return; const sh = $('#sheet'), cv = $('#v3'); if (!sh || !cv || sh.classList.contains('hide') || P.view !== '3d') { P.pk.setInset(0); return; } const a = cv.getBoundingClientRect(), b = sh.getBoundingClientRect(); if (b.left > a.left + a.width * 0.3) P.pk.setInset(0, Math.max(0, a.right - b.left)); else P.pk.setInset(Math.max(0, a.bottom - b.top)); }
function closeSheet() { $('#sheet')?.classList.add('hide'); P?.pk?.setInset(0); P && (P.sel = null); P?.pk?.select(null); P?.dg?.select(null); $$('#pl .p.hl').forEach((x) => x.classList.remove('hl')); }

function openPart(mesh, assembly, onlyKey) {
  P.sel = mesh; P.dg?.select(mesh); if (P.view === '3d') P.pk.select(mesh);
  $$('#pl .p').forEach((x) => x.classList.toggle('hl', x.dataset.mesh === mesh));
  const hl = $(`#pl .p[data-mesh="${CSS.escape(mesh || '')}"]`); if (hl) { const pl = $('#pl'); const t = hl.offsetTop - pl.offsetTop; if (t < pl.scrollTop || t > pl.scrollTop + pl.clientHeight - hl.offsetHeight) pl.scrollTop = Math.max(0, t - pl.clientHeight / 2); }
  let rows = onlyKey ? P.cat.filter((r) => r.key === onlyKey) : rowsFor(mesh);
  const asm = assembly || P.cat.find((r) => r.mesh === mesh)?.assembly || (/^door_[lr][fr]$/.test(mesh) ? mesh : null);
  const canDrill = asm && asmRows(asm).filter((r) => r.mesh).length > 1 && (P.view === '2d' || P.pk.kind === 'car');
  const canIso = P.view === '3d' && P.pk.kind !== 'isolate' && P.pk.canIsolate(mesh);
  if (!rows.length && /^door_[lr][fr]$/.test(mesh)) rows = P.cat.filter((r) => r.mesh === mesh + '_skin' || r.mesh === mesh + '_shell');
  const sh = $('#sheet');
  const nice = rows[0]?.name || mesh.replace(/_/g, ' ');
  sh.innerHTML = `<div class="grab"></div><div class="row"><b class="grow" style="font-size:15px">${esc(nice)}</b>${canIso ? '<button id="giso" title="Show only this part">View alone</button>' : ''}${canDrill ? `<button id="gi" class="pri">${asm === 'front_bumper' || asm === 'rear_bumper' ? 'Explode ›' : 'Go into ›'}</button>` : ''}<button id="sx">✕</button></div>
  ${rows.length ? detailsBlock(rows[0], mesh) : ''}
  ${rows.length ? `<details class="more"><summary>Custom hours, price and part type${rows.length > 1 ? ` (${rows.length} parts here)` : ''}</summary>${rows.map((r) => partForm(r)).join('')}</details>` : `<p class="mut">No catalog part for this area yet. <button class="sm" id="cust">Add a custom line</button></p>`}
  <p class="sm mut" style="margin-top:8px">Enter your hours and price, or pick the part from your parts catalog. Set standard hours for each part in Settings.</p>`;
  sh.classList.add('pk'); sh.classList.remove('hide'); sh.scrollTop = 0; requestAnimationFrame(sheetInset);
  $('#sx').onclick = closeSheet;
  if (canDrill) $('#gi').onclick = async () => { closeSheet(); if (P.view === '2d') setView('3d'); if (!(await ensure3d())) return; if (asm === 'front_bumper' || asm === 'rear_bumper') toggleExplode(asm); else goInto(asm, P.pk.mode); };
  $('#giso')?.addEventListener('click', () => isolatePart(mesh));
  bindDetails(sh);
  $('#cust')?.addEventListener('click', async () => { await api(`/api/jobs/${P.id}/lines`, { method: 'POST', body: { operation: 'repair', description: mesh.replace(/_/g, ' '), labor_type: 'body' } }); await afterAdd(); });
  $$('.pf', sh).forEach(bindForm);
}
function partForm(r) {
  const ops = (r.ops || 'replace').split(',');
  const def = ops.includes('replace') ? 'replace' : ops[0];
  return `<div class="pf card" data-key="${esc(r.key)}" style="margin:10px 0 0;padding:10px">
   ${(r.name !== undefined) ? `<div class="sm mut" style="margin-bottom:6px">${esc(r.name)} · ${esc(r.grp)}${r.adas ? ' · <b style="color:var(--warn)">ADAS: ' + esc(r.adas) + '</b>' : ''}</div>` : ''}
   <div class="ops">${ops.map((o) => `<button type="button" class="${o.replace('&', '')} ${o === def ? 'on' : ''}" data-op="${o}">${o === 'r&i' ? 'R&I' : o[0].toUpperCase() + o.slice(1)}</button>`).join('')}</div>
   <div class="grid2" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr))"><div><label>Part type</label><select data-x="part_type">${Object.keys(PRICE_K).filter((k) => r[PRICE_K[k]] || k === 'OEM').map((k) => `<option>${k}</option>`).join('')}</select></div>
   <div><label>Labor h</label><input data-x="labor_hours" inputmode="decimal"></div><div><label>R&I / teardown h</label><input data-x="teardown_hours" inputmode="decimal" value="${r.teardown_hours ?? ''}"></div>
   <div><label>Refinish h</label><input data-x="refinish_hours" inputmode="decimal"></div><div><label>Price $</label><input data-x="unit_price" inputmode="decimal"></div><div><label>Qty</label><input data-x="qty" value="1" inputmode="numeric"></div></div>
   <div class="row" style="margin-top:8px"><label style="margin:0"><input type="checkbox" data-x="include_teardown" checked style="width:auto;min-height:0"> include R&I labor</label><span class="grow"></span><button class="pri" data-go>Add to estimate</button></div></div>`;
}
function bindForm(f) {
  const r = P.cat.find((x) => x.key === f.dataset.key);
  const val = (k) => $(`[data-x=${k}]`, f);
  const fill = () => {
    const op = $('.ops .on', f)?.dataset.op || 'replace'; const pt = val('part_type').value;
    val('labor_hours').value = op === 'replace' ? r.replace_hours ?? '' : op === 'repair' ? r.repair_hours ?? '' : op === 'r&i' ? r.teardown_hours ?? '' : 0;
    val('refinish_hours').value = ['replace', 'repair', 'refinish'].includes(op) && r.paintable ? r.refinish_hours ?? 0 : op === 'blend' ? Math.round((r.refinish_hours || 0) * 0.5 * 10) / 10 : 0;
    val('unit_price').value = op === 'replace' ? r[PRICE_K[pt]] ?? r.price_oem ?? 0 : 0;
    val('teardown_hours').value = op === 'r&i' ? 0 : r.teardown_hours ?? 0;
  };
  $$('.ops button', f).forEach((bt) => bt.onclick = () => { $$('.ops button', f).forEach((x) => x.classList.remove('on')); bt.classList.add('on'); fill(); });
  val('part_type').onchange = fill; fill();
  $('[data-go]', f).onclick = async () => {
    const op = $('.ops .on', f).dataset.op;
    const it = { key: r.key, operation: op, part_type: val('part_type').value, source: '3d', include_teardown: val('include_teardown').checked };
    for (const k of ['labor_hours', 'teardown_hours', 'refinish_hours', 'unit_price', 'qty']) it[k] = val(k).value;
    if (!it.include_teardown) it.teardown_hours = 0;
    await api(`/api/jobs/${P.id}/lines/catalog`, { method: 'POST', body: { items: [it] } });
    toast(`Added: ${op} ${r.name}`);
    await afterAdd();
  };
}
async function afterAdd(keep) { await loadJob(P.id, true); P.pk.setMarks(lineMarks()); P.dg?.setMarks(lineMarks()); $('#td').innerHTML = teardownInfo(); drawList(); if (keep) keep(); else closeSheet(); }

// ---------- 3D navigation: X-ray, explode, isolate, breadcrumb, Back (history state) ----------
const OPN = { replace: 'Replace', repair: 'Repair', refinish: 'Refinish', blend: 'Blend', 'r&i': 'R&I' };
function shortName(mesh) { const r = P.cat.find((x) => x.mesh === mesh); return r ? r.name.split(',')[0].replace(/^(Front|Rear) bumper (cover|reinforcement)$/, '$1 bumper $2') : mesh.replace(/_/g, ' '); }
function rearish(r, mesh) { return r ? (r.assembly === 'rear_bumper' || r.grp === 'Rear' || /^(rbumper|tail|decklid|quarter|rear_|tow_hook_cover_r|park_sensor_r|bsm|trunk)/.test(r.mesh || '')) : /^(rbumper|tail|decklid|quarter|rear_)/.test(mesh || ''); }
function pick3d(p) {
  if (!p) { closeSheet(); return; }
  if (P.multi.size) return;
  // tap the selected part again to see it on its own
  if (P.sel === p.mesh && P.pk.kind !== 'isolate' && P.pk.canIsolate(p.mesh)) { isolatePart(p.mesh); return; }
  openPart(p.mesh, p.assembly);
}
async function isolatePart(mesh) {
  if (P.view !== '3d') setView('3d');
  if (!(await ensure3d())) return;
  if (!P.pk.isolate(mesh, shortName(mesh))) { toast('No 3D shape for this part'); return; }
  openPart(mesh, P.cat.find((r) => r.mesh === mesh)?.assembly);
}
function showOnModel(mesh, asm) {
  const pk = P.pk; const r = P.cat.find((x) => x.mesh === mesh); asm = asm || r?.assembly;
  if (pk.kind === 'isolate') { if (pk.canIsolate(mesh)) { pk.isolate(mesh, shortName(mesh)); return; } pk.back(); }
  const exAsm = pk.kind === 'exploded' ? (pk.crumbs[pk.crumbs.length - 1] === 'Front bumper' ? 'front_bumper' : 'rear_bumper') : null;
  if (exAsm && asm === exAsm) { pk.select(mesh); return; }
  const where = pk.where(mesh);
  if (where === 'exterior' || where === 'interior') { if (pk.kind !== 'car' || pk.mode !== where) pk.setMode(where); }
  else if (where === 'xray' || (!where && r?.grp === 'Structural')) { if (pk.kind !== 'car') pk.setMode('exterior'); if (!pk.xray) pk.setXray(true); }
  else if (asm === 'front_bumper' || asm === 'rear_bumper') { if (!(pk.kind === 'exploded' && pk.crumbs[pk.crumbs.length - 1] === (asm === 'front_bumper' ? 'Front bumper' : 'Rear bumper'))) { if (pk.mode === 'interior') pk.setMode('exterior'); pk.explode(asm); } }
  else if (!where && asm && /^door_|^hood$|decklid/.test(asm)) goInto(asm, 'exterior');
  pk.select(mesh);
}
function toggleExplode(which) {
  const pk = P.pk;
  if (!which && pk.kind === 'exploded') { goDepth(0); return; }
  const r = P.sel && P.cat.find((x) => x.mesh === P.sel);
  const asm = which || (rearish(r, P.sel) ? 'rear_bumper' : 'front_bumper');
  if (pk.xray) pk.setXray(false);
  if (pk.mode === 'interior') pk.setMode('exterior');
  pk.explode(asm);
}
function goDepth(d) {
  const n = P.pk.depth - d; if (n <= 0) return;
  closeSheet();
  if (P.hidx - P.base === P.pk.depth) history.go(-n); else { while (P.pk.depth > d) P.pk.back(); }
}
function drawCrumbs() {
  if (!P?.pk || !$('#crumbs')) return;
  const pk = P.pk; const cr = pk.crumbs; const d = pk.depth; const is3 = P.view === '3d';
  $('#vxr')?.classList.toggle('on', !!pk.xray);
  $('#vex')?.classList.toggle('on', pk.kind === 'exploded');
  const show = is3 && (d > 0 || pk.xray);
  $('#crumbs').hidden = !show;
  if (!show) return;
  $('#vb').hidden = d === 0;
  const parts = cr.map((c, i) => i < cr.length - 1 ? `<button class="cb" data-d="${i}">${esc(c)}</button>` : `<b>${esc(c)}</b>`);
  if (pk.xray && pk.kind === 'car') parts.push('<span class="mut">X-ray</span>');
  let extra = '';
  if (pk.kind === 'exploded') { const front = cr[cr.length - 1] === 'Front bumper'; extra = `<button class="cb sw" id="vsw">${front ? 'Rear bumper' : 'Front bumper'} \u21c4</button>`; }
  $('#crumbl').innerHTML = parts.join('<span class="sep">\u203a</span>') + extra;
  $$('#crumbl [data-d]').forEach((b) => b.onclick = () => goDepth(Number(b.dataset.d)));
  $('#vsw')?.addEventListener('click', () => { closeSheet(); toggleExplode(cr[cr.length - 1] === 'Front bumper' ? 'rear_bumper' : 'front_bumper'); });
}
// Each level deeper is one browser history entry, so the phone's back gesture steps back one level.
function schedSync() { if (P.hq) return; P.hq = setTimeout(syncHist, 0); }
function syncHist() {
  if (!P) return; P.hq = 0;
  if (!P.pk || S.picker !== P.pk || !location.hash.includes('/3d')) return;
  const want = P.base + P.pk.depth;
  if (want > P.hidx) { for (let i = P.hidx + 1; i <= want; i++) history.pushState({ cp3d: i }, '', location.href); P.hidx = want; }
  else if (want < P.hidx) { const n = want - P.hidx; P.hidx = want; history.go(n); }
}
window.addEventListener('popstate', (e) => {
  if (!P?.pk || S.picker !== P.pk || !location.hash.includes('/3d')) return;
  const t = e.state?.cp3d || 0;
  const want = Math.max(0, t - P.base);
  P.hidx = t;
  if (P.pk.depth > want) { $('#sheet')?.classList.add('hide'); P.pk.setInset(0); while (P.pk.depth > want) P.pk.back(); P.sel = null; }
});

// ---------- Part details ----------
function materialOf(r) {
  const t = `${r.mesh} ${r.key} ${r.name}`.toLowerCase(); const v = S.job?.vehicle || {};
  const alum = /f-?150|f-?250|f-?350|expedition|navigator/i.test(v.model || '') && Number(v.year) >= 2015;
  if (/structural|frame/.test(r.labor_type) || r.grp === 'Structural') return /pillar|beam/.test(t) ? 'Ultra-high-strength steel' : 'High-strength steel';
  if (/absorber/.test(t)) return 'Energy-absorbing foam';
  if (/windshield/.test(t)) return 'Laminated glass';
  if (/glass|window|backlite/.test(t)) return 'Tempered glass';
  if (/lamp|light/.test(t)) return 'Polycarbonate lens, plastic housing';
  if (/radar|sensor|camera|module|calibration|scan/.test(t)) return 'Electronic component';
  if (/tire/.test(t)) return 'Rubber';
  if (/wheel/.test(t)) return 'Aluminum alloy';
  if (/cover|valance|bezel|grille|emblem|molding|carrier|tow_hook|cap|liner|insulator|trim/.test(t)) return 'Plastic';
  if (/reinf|bracket|hinge|latch|strut/.test(t)) return 'Steel';
  if (/hood|fender|door|roof|quarter|decklid|liftgate|tailgate|bedside|rocker|panel|skin|shell|pillar/.test(t)) return alum ? 'Aluminum' : 'Sheet steel';
  return '';
}
const STRUCT_LINKS = { fender: ['apron_{s}', 'frame_rail_{s}f'], fbumper_cover: ['fbumper_reinf', 'radiator_support'], fbumper_reinf: ['radiator_support', 'frame_rail_lf', 'frame_rail_rf'], grille: ['radiator_support'], door_f: ['door_beam_{s}f', 'pillar_a_inner_{s}', 'pillar_b_inner_{s}'], door_r: ['door_beam_{s}r', 'pillar_b_inner_{s}'], quarter: ['rear_rail_{s}'], decklid: ['trunk_floor', 'rear_body_panel'], rbumper_cover: ['rbumper_reinf', 'rear_body_panel'], apron: ['fender_{s}', 'frame_rail_{s}f'], frame_rail: ['apron_{s}', 'radiator_support'], rear_rail: ['quarter_{s}', 'trunk_floor'], radiator_support: ['fbumper_reinf', 'apron_l', 'apron_r'], door_beam: ['door_{s}{f}_skin', 'door_{s}{f}_shell'], pillar_a_inner: ['door_{s}f_skin', 'windshield'], pillar_b_inner: ['door_{s}f_skin', 'door_{s}r_skin'], rear_body_panel: ['rbumper_cover', 'trunk_floor'], trunk_floor: ['rear_body_panel', 'rear_rail_l', 'rear_rail_r'] };
function relatedOf(mesh, r) {
  const out = []; const add = (m) => { if (m && m !== mesh && !out.includes(m) && P.cat.some((x) => x.mesh === m)) out.push(m); };
  add(mirrorId(mesh));
  const side = (mesh.match(/_([lr])(?:[fr])?(?:_|$)/) || [])[1] || 'l'; const fr = (mesh.match(/_[lr]([fr])(?:_|$)/) || [])[1] || 'f';
  const base = /^door_[lr]f/.test(mesh) ? 'door_f' : /^door_[lr]r/.test(mesh) ? 'door_r' : mesh.replace(/_([lr][fr]?)(_.*)?$/, '');
  for (const pat of STRUCT_LINKS[base] || []) add(pat.replaceAll('{s}', side).replaceAll('{f}', fr));
  const asm = r?.assembly; if (asm) for (const x of P.cat) if (x.assembly === asm && x.mesh) add(x.mesh);
  return out.slice(0, 10);
}
function detailsBlock(r, mesh) {
  const ops = (r.ops || 'replace').split(',');
  const hrsOf = { replace: r.replace_hours, repair: r.repair_hours, 'r&i': r.teardown_hours, refinish: r.paintable ? r.refinish_hours : null, blend: r.paintable ? Math.round((r.refinish_hours || 0) * 5) / 10 : null };
  const cols = ['replace', 'repair', 'r&i', 'refinish', 'blend'].filter((o) => ops.includes(o) || (o === 'refinish' && r.paintable));
  const structural = r.grp === 'Structural' || /structural|frame/.test(r.labor_type || '');
  const mat = materialOf(r); const rel = relatedOf(mesh, r);
  return `<div class="pdet" data-key="${esc(r.key)}" data-mesh="${esc(mesh)}">
   <div class="chips">${structural ? '<span class="tag warn">Structural</span>' : '<span class="tag">Not structural</span>'}${mat ? `<span class="tag">${esc(mat)}</span>` : ''}<span class="tag">${esc(r.labor_type || 'body')} labor</span>${r.adas ? `<span class="tag warn">ADAS: ${esc(r.adas)}</span>` : ''}</div>
   ${cols.length ? `<div class="hgrid">${cols.map((o) => `<div><span>${OPN[o]}</span><b>${hrsOf[o] === null || hrsOf[o] === undefined ? '\u2013' : hrs(hrsOf[o]) + ' h'}</b></div>`).join('')}</div>` : ''}
   <div class="qops">${['replace', 'repair', 'refinish', 'blend', 'r&i'].map((o) => `<button type="button" class="${o.replace('&', '')}" data-q="${o}" ${ops.includes(o) ? '' : 'disabled title="Not offered for this part"'}>${OPN[o]}</button>`).join('')}</div>
   ${rel.length ? `<div class="rel"><span class="sm mut">Related:</span> ${rel.map((m) => `<button type="button" class="chip" data-rel="${esc(m)}">${esc(P.cat.find((x) => x.mesh === m)?.name || m)}</button>`).join('')}</div>` : ''}
   ${structural ? '<div class="sm mut">Structural part: follow the OEM repair procedure and measure before and after.</div>' : ''}</div>`;
}
function bindDetails(sh) {
  const d = $('.pdet', sh); if (!d) return;
  const r = P.cat.find((x) => x.key === d.dataset.key);
  $$('[data-q]', d).forEach((bt) => bt.onclick = async () => {
    const op = bt.dataset.q; bt.disabled = true;
    try { await api(`/api/jobs/${P.id}/lines/catalog`, { method: 'POST', body: { items: [{ key: r.key, operation: op, part_type: 'OEM', source: '3d', include_teardown: true }] } }); toast(`Added: ${OPN[op]} ${r.name}`); const m = d.dataset.mesh, a = r.assembly; await afterAdd(() => openPart(m, a)); }
    finally { bt.disabled = false; }
  });
  $$('[data-rel]', d).forEach((bt) => bt.onclick = () => { const m = bt.dataset.rel; const rr = P.cat.find((x) => x.mesh === m); if (P.view === '3d') showOnModel(m, rr?.assembly); openPart(m, rr?.assembly); });
}

// ---------- 2D / 3D view switch, multi-select, mirror ----------
function setView(mode) {
  P.view = mode === '2d' ? '2d' : '3d'; localStorage.setItem('cp_view', P.view);
  const is2 = P.view === '2d';
  $('#v3').classList.toggle('is2d', is2); $('#d2').hidden = !is2;
  $('#m2').classList.toggle('on', is2); $('#m3').classList.toggle('on', !is2);
  $('#vm').hidden = !is2; for (const k of ['#vei', '#vxr', '#vex']) $(k).hidden = is2;
  if (is2) { if (P.pk.depth || P.pk.kind !== 'car') P.pk.setMode('exterior'); P.dg.select(P.sel); P.dg.setMulti(P.multi); requestAnimationFrame(() => P.dg.refit()); }
  else if (P.pk.stub) { const me = P; ensure3d().then((pk) => { if (!pk || P !== me || P.view !== '3d') return; if (P.sel) showOnModel(P.sel); pk.select(P.sel); pk.resize?.(); drawCrumbs(); }); }
  else { if (P.sel) showOnModel(P.sel); P.pk.select(P.sel); P.pk.resize?.(); }
  drawBulk(); drawCrumbs();
}
// Stand-in for the 3D picker while only the 2D diagram is in use: same calls, no WebGL, no cost.
function stub3d() {
  const st = { marks: {}, sel: null, built: null, exact: null };
  return { stub: true, st, kind: 'car', depth: 0, xray: false, mode: 'exterior', crumbs: ['Car'], spec: null,
    build(m, i) { st.built = [m, i]; }, setMarks(m) { st.marks = m || {}; }, select(n) { st.sel = n; },
    setMode() {}, setInset() {}, setXray() {}, back() {}, isolate() {}, explode() {}, drillInto() {}, resize() {}, resetView() {}, home() {},
    canIsolate() { return false; }, where() { return null; }, has() { return false; },
    async loadExact(url) { st.exact = url; return false; }, destroy() {} };
}
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
// Builds the 3D car the first time the user switches to 3D. The tab stays usable: a "Loading 3D…" card shows at once,
// the work is split so the screen can paint in between, and shaders compile in the background where the phone allows.
async function ensure3d() {
  if (!P.pk.stub) return P.pk;
  if (P.loading3d) return P.loading3d;
  const me = P, box = $('#v3'), stand = P.pk;
  const ov = document.createElement('div'); ov.className = 'v3load'; ov.setAttribute('role', 'status');
  ov.innerHTML = '<span class="spin" aria-hidden="true"></span><b>Loading 3D…</b><button type="button" class="sm">Use 2D</button>';
  ov.querySelector('button').onclick = () => setView('2d');
  box.appendChild(ov);
  P.loading3d = (async () => {
    await frame(); // let the card paint first
    const gone = () => P !== me || !box.isConnected;
    if (gone()) return null;
    let pk = null;
    try {
      pk = createPicker(box, P.opts3d);
      box.appendChild(ov); // keep the card above the new canvas
      await frame(); if (gone()) { pk.destroy(); return null; }
      await pk.buildAsync(...stand.st.built); if (gone()) { pk.destroy(); return null; }
      pk.setMarks(stand.st.marks); if (stand.st.sel) pk.select(stand.st.sel);
      await frame(); if (gone()) { pk.destroy(); return null; }
      await pk.precompile();
      if (gone()) { pk.destroy(); return null; }
    } catch (e) {
      console.warn('3D failed', e); try { pk?.destroy(); } catch { /* */ }
      ov.remove(); fall2d('3D could not start on this phone, so the 2D diagram is showing.'); return null;
    }
    S.picker = pk; P.pk = pk; ov.remove();
    if (stand.st.exact) pk.loadExact(stand.st.exact).then((ok) => { if (ok && P === me) { P.exact = true; $('#vstyle').textContent = P.styleTxt + ' · exact model'; pk.setMarks(lineMarks()); } });
    return pk;
  })();
  try { return await P.loading3d; } finally { if (P === me) P.loading3d = null; ov.remove(); }
}
// Back to the 2D diagram when 3D fails, is lost or is too slow. `lost` also frees the GPU so a retry starts clean.
function fall2d(msg, lost) {
  if (!P) return;
  if (lost || !P.pk.stub) {
    const old = P.pk; const stand = stub3d(); stand.build(...(P.pk.stub ? P.pk.st.built : [P.m3d, P.vinfo]));
    stand.setMarks(lineMarks()); stand.select(P.sel);
    try { old.destroy(); } catch { /* */ }
    if (lost) releaseShared3d();
    P.pk = stand; S.picker = stand;
  }
  setView('2d'); toast(msg);
}
function tap2d(id) {
  if (P.multi.size) { if (id) { P.multi.has(id) ? P.multi.delete(id) : P.multi.add(id); P.dg.setMulti(P.multi); drawBulk(); } return; }
  if (!id) { closeSheet(); return; }
  openPart(id, P.cat.find((r) => r.mesh === id)?.assembly);
}
function long2d(id) {
  if (P.sel && !P.multi.size && P.sel !== id) P.multi.add(P.sel);
  P.multi.has(id) ? P.multi.delete(id) : P.multi.add(id);
  $('#sheet').classList.add('hide'); P.pk?.setInset(0); P.sel = null; P.dg.select(null);
  P.dg.setMulti(P.multi); drawBulk();
}
function mirrorId(id) { return id.split('_').map((t) => /^[lr][fr]?$/.test(t) ? (t[0] === 'l' ? 'r' : 'l') + t.slice(1) : t).join('_'); }
function mirrorSel() {
  if (P.multi.size) { for (const id of [...P.multi]) { const m = mirrorId(id); if (P.dg.has(m)) P.multi.add(m); } P.dg.setMulti(P.multi); drawBulk(); return; }
  if (!P.sel) return toast('Select a left or right part first');
  const m = mirrorId(P.sel); if (m === P.sel || !P.dg.has(m)) return toast('This part has no left/right twin');
  openPart(m, P.cat.find((r) => r.mesh === m)?.assembly);
}
function primaryRow(id, op) {
  const ok = (r) => (r.ops || 'replace').split(',').includes(op);
  let rows = rowsFor(id); if (!rows.length && /^door_[lr][fr]$/.test(id)) rows = P.cat.filter((r) => r.mesh === id + '_shell' || r.mesh === id + '_skin');
  const pick = rows.find((r) => r.key === id && ok(r)) || rows.find((r) => /_shell$/.test(r.mesh) && ok(r)) || rows.find((r) => r.name && !/calibration|chmsl|molding|emblem/i.test(r.name) && ok(r)) || rows.find(ok);
  return pick || null;
}
function drawBulk() {
  const b = $('#bulk2'); if (!b) return;
  if (!P.multi.size) { b.classList.add('hide'); b.innerHTML = ''; P.dg?.refit(); return; }
  b.classList.remove('hide');
  b.innerHTML = `<b>${P.multi.size} selected</b><div class="ops">${[['replace', 'Replace'], ['repair', 'Repair'], ['refinish', 'Refinish'], ['blend', 'Blend'], ['r&i', 'R&I']].map(([o, n]) => `<button class="${o.replace('&', '')}" data-bop="${o}">${n}</button>`).join('')}</div>${P.view === '2d' ? '<button data-bm>⇄ L/R</button>' : ''}<button data-bx>Clear</button>`;
  $('[data-bx]', b).onclick = () => { P.multi.clear(); P.dg.setMulti(P.multi); drawBulk(); };
  $('[data-bm]', b)?.addEventListener('click', mirrorSel);
  $$('[data-bop]', b).forEach((bt) => bt.onclick = async () => {
    const op = bt.dataset.bop; const items = []; const skipped = [];
    for (const id of P.multi) { const r = primaryRow(id, op); if (r) items.push({ key: r.key, operation: op, source: '3d', include_teardown: true }); else skipped.push(id.replace(/_/g, ' ')); }
    if (items.length) await api(`/api/jobs/${P.id}/lines/catalog`, { method: 'POST', body: { items } });
    if (!items.length) { toast(`${op === 'r&i' ? 'R&I' : op[0].toUpperCase() + op.slice(1)} isn't offered for ${skipped.join(', ')}`, true); return; }
    toast(`Added ${items.length} ${items.length === 1 ? 'line' : 'lines'} (${op === 'r&i' ? 'R&I' : op})` + (skipped.length ? ` · skipped ${skipped.length}: ${op} not offered for ${skipped.slice(0, 3).join(', ')}` : ''), !!skipped.length && !items.length);
    P.multi.clear(); P.dg.setMulti(P.multi); drawBulk(); await afterAdd();
  });
  P.dg?.refit();
}

// ---------- Catalog panel: PartsTech / Autodoc via the server (no sample fallback) ----------
const SRC_LABEL = { partstech: 'PartsTech', autodoc: 'Autodoc' };
const NO_CATALOG = '<div class="empty" style="padding:14px 4px"><b>No parts catalog connected</b><p class="sm mut" style="margin:6px 0">Connect PartsTech or Autodoc in Settings to search real parts and prices for this VIN.</p><a class="btn sm" href="#/settings">Open Settings</a></div>';
async function autodocPanel() {
  const el = $('#pad'); const v = S.job.vehicle || {};
  if (!['autodoc', 'autodoc_mock', 'partstech_autodoc', 'partstech_mock'].includes(P.prov)) { el.innerHTML = NO_CATALOG; return; }
  if (!v.vin) { el.innerHTML = '<p class="mut">Add a VIN to look up catalog parts.</p>'; return; }
  const order = P.prov === 'partstech_autodoc' ? (/^[1-5]/.test(v.vin) ? 'PartsTech, then Autodoc' : 'Autodoc, then PartsTech') : P.prov.includes('partstech') ? 'PartsTech' : 'Autodoc';
  el.innerHTML = `<div class="sm mut">Sources: ${order}${P.prov.endsWith('_mock') ? ' <span class="tag">mock</span>' : ''}. Autodoc is mainly European aftermarket; US coverage may be limited.</div>
   <div class="row" style="margin-top:6px"><input id="adq" placeholder="Part, e.g. front bumper cover, headlight" class="grow"><button id="ads" class="sm pri">Search</button></div><div id="adv" class="sm" style="margin:6px 0"></div><div id="ada"></div>`;
  const sel = P.sel && P.cat.find((r) => r.mesh === P.sel);
  $('#adq').value = sel ? sel.name.split(',')[0] : '';
  const search = async () => {
    const q = $('#adq').value.trim(); if (!q) return;
    $('#ada').innerHTML = '<p class="mut sm">Searching\u2026</p>'; $('#adv').innerHTML = '';
    const r = await api(`/api/parts/search?vin=${v.vin}&q=${encodeURIComponent(q)}`, { quiet: true }).catch((e) => ({ ok: false, tried: [{ source: 'server', message: e.message }], articles: [] }));
    const notes = (r.tried || []).map((t) => `${SRC_LABEL[t.source.replace('_mock', '')] || t.source}: ${esc(t.message)}`).join('<br>');
    if (!r.ok) { $('#adv').innerHTML = `<span style="color:var(--warn)">${notes || 'No catalog source is on.'}</span><br><span class="mut">Nothing came back from the catalog. Check the connection in Settings, or enter the part by hand.</span>`; $('#ada').innerHTML = ''; return; }
    $('#adv').innerHTML = `<span class="tag live">${SRC_LABEL[r.source]}${r.mock ? ' mock' : ''}</span> ${r.articles.length} parts${r.vehicle ? ' \u00b7 ' + esc(r.vehicle) : ''}${r.category ? ' \u00b7 ' + esc(r.category) : ''}${r.store ? ' \u00b7 ' + esc(r.store) : ''}${r.cached ? ' (cached)' : ''}${notes ? '<br><span class="mut">' + notes + '</span>' : ''}`;
    $('#ada').innerHTML = r.articles.map((a, i) => `<div class="art">${a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy" data-hideerr="1">` : '<div style="width:64px"></div>'}<div class="grow"><b>${esc(a.brand || '')}</b> ${esc(a.name)}<div class="sm">#${esc(a.article_no || '')}${a.price !== null && a.price !== undefined ? ' \u00b7 ' + money(a.price) + (a.list_price ? ' (list ' + money(a.list_price) + ')' : '') : ' \u00b7 no price returned'}${a.available !== undefined ? ' \u00b7 ' + (a.available ? a.available + ' in stock' : 'not in stock') : ''}</div>${a.supplier ? `<div class="sm mut">${esc(a.supplier)}</div>` : ''}${a.oems?.length ? `<div class="sm mut">OEM: ${a.oems.map((o) => esc((o.brand ? o.brand + ' ' : '') + o.no)).join(', ')}</div>` : ''}</div><button class="sm pri" data-ai="${i}">Add</button></div>`).join('');
    $$('#ada [data-ai]').forEach((bt) => bt.onclick = async () => {
      const a = r.articles[Number(bt.dataset.ai)]; const s2 = P.sel && P.cat.find((x) => x.mesh === P.sel);
      const src = SRC_LABEL[a.source] || 'Catalog';
      await api(`/api/jobs/${P.id}/lines`, { method: 'POST', body: { operation: 'replace', description: `${a.brand ? a.brand + ' ' : ''}${a.name}`.slice(0, 200), part_type: /\bOE\b|OEM/i.test(a.brand || '') ? 'OEM' : 'aftermarket', part_no: a.article_no || '', qty: 1, unit_price: a.price || 0, labor_type: s2?.labor_type || 'body', labor_hours: s2?.replace_hours || 0, teardown_hours: s2?.teardown_hours || 0, catalog_key: s2?.key || null, notes: `${src} ${a.article_id || ''}${a.supplier ? ' \u00b7 ' + a.supplier : ''}${a.oems?.length ? ' \u00b7 OEM ' + a.oems.slice(0, 3).map((o) => o.no).join(', ') : ''}${a.price ? '' : ' \u00b7 price needed'}`.slice(0, 500) } });
      toast(`Added from ${src}`); await afterAdd();
    });
  };
  $('#ads').onclick = search; $('#adq').onkeydown = (e) => e.key === 'Enter' && search();
  if ($('#adq').value) search();
}
