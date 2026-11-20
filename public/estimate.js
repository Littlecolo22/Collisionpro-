import { S, api, toast, $, $$, esc, money, hrs, shell, onLeave } from './app.js';
import { jobTabs, loadJob, vehLabel } from './screens.js';
import { custBlock, editCustomer } from './customer.js';

const OPS = ['replace', 'repair', 'r&i', 'refinish', 'blend', 'sublet', 'misc', 'o/h', 'align', 'add_labor', 'add_cost'];
const LT = ['body', 'refinish', 'frame', 'structural', 'mech', 'glass'];
const PT = ['', 'OEM', 'aftermarket', 'recycled', 'reconditioned'];
const STG = ['', '2stage', '3stage', '2tone'];
// [key, header, type, cls, mobileHidden]
const COLS = [
  ['line_no', '#', 'ro', 'w40'], ['operation', 'Op', OPS, 'w80'], ['description', 'Description', 'text', 'w220'],
  ['part_type', 'Type', PT, 'w80', 1], ['part_no', 'Part #', 'text', 'w110', 1], ['qty', 'Qty', 'num', 'w40', 1], ['unit_price', 'Price', 'num', 'w80'],
  ['labor_type', 'Labor', LT, 'w80', 1], ['labor_hours', 'Lab hr', 'num', 'w60'], ['labor_overlap', 'Ovl-', 'num', 'w60', 1], ['teardown_hours', 'R&I hr', 'num', 'w60', 1],
  ['refinish_hours', 'Rfn hr', 'num', 'w60'], ['refinish_overlap', 'Rfn ovl-', 'num', 'w60', 1], ['paint_stage', 'Stage', STG, 'w80', 1],
  ['incl', 'Incl', 'bool', 'w40', 1], ['not_included', 'NI', 'bool', 'w40', 1], ['judgment', 'Jdg*', 'bool', 'w40', 1], ['markup_pct', 'Mk%', 'num', 'w60', 1],
  ['discount_pct', 'Dc%', 'num', 'w60', 1], ['betterment_pct', 'Btr%', 'num', 'w60', 1], ['taxable', 'Tax', 'bool', 'w40', 1], ['sublet_amount', 'Sublet', 'num', 'w80', 1],
  ['notes', 'Notes', 'text', 'w110', 1], ['_ext', 'Ext $', 'ro', 'w80'],
];
const PHONE = '(max-width:900px),(max-height:500px)';
const isPhone = () => matchMedia(PHONE).matches;
const FLAGS = [['incl', 'Included'], ['not_included', 'Not incl.'], ['judgment', 'Judgment'], ['taxable', 'Taxable']];
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
function lineCard(l) {
  const e = ext(l), op = l.operation || '';
  const bits = [l.part_no && `<span><i>Part #</i> ${esc(l.part_no)}</span>`, `<span><i>Qty</i> ${esc(l.qty ?? 1)}</span>`, num(l.unit_price) ? `<span><i>Price</i> ${money(l.unit_price)}</span>` : '',
    num(l.labor_hours) ? `<span><i>Labor</i> ${hrs(l.labor_hours)} h${l.labor_type ? ' ' + esc(l.labor_type) : ''}</span>` : '', num(l.refinish_hours) ? `<span><i>Refinish</i> ${hrs(l.refinish_hours)} h</span>` : '',
    num(l.teardown_hours) ? `<span><i>R&amp;I</i> ${hrs(l.teardown_hours)} h</span>` : '', l.part_type ? `<span><i>Type</i> ${esc(l.part_type)}</span>` : '', num(l.sublet_amount) ? `<span><i>Sublet</i> ${money(l.sublet_amount)}</span>` : ''].filter(Boolean).join('');
  const fl = FLAGS.filter(([k]) => Number(l[k])).map(([, n]) => `<em>${n}</em>`).join('') + (l.supplement_no ? `<em>S${esc(l.supplement_no)}</em>` : '');
  return `<div class="lcard opb-${esc(op).replace('&', '')}${S.sel.has(l.id) ? ' sel' : ''}" data-id="${l.id}"><label class="lcs" aria-label="select line ${esc(l.line_no)}"><input type="checkbox" class="rs" ${S.sel.has(l.id) ? 'checked' : ''}></label>
  <div class="lcb"><div class="lc1"><span class="lno">${esc(l.line_no)}</span><span class="lop op-${esc(op)}">${esc(op || '—')}</span><span class="lext">${e === null ? '' : money(e)}</span></div>
  <div class="ld">${esc(l.description || 'No description')}</div><div class="lc2">${bits}</div>${fl ? `<div class="lfl">${fl}</div>` : ''}${l.notes ? `<div class="lnt mut">${esc(l.notes)}</div>` : ''}</div></div>`;
}
function editLine(id, lid) {
  const l = S.job.lines.find((x) => x.id === lid); if (!l) return;
  const fld = (c) => { const [k, n, t] = c; const v = l[k];
    if (Array.isArray(t)) return `<label>${n}<select data-f="${k}">${t.map((o) => `<option ${String(v ?? '') === o ? 'selected' : ''} value="${o}">${o || '—'}</option>`).join('')}</select></label>`;
    if (t === 'bool') return `<label class="ck"><input type="checkbox" data-f="${k}" ${Number(v) ? 'checked' : ''}> ${({ incl: 'Included', not_included: 'Not included', judgment: 'Judgment time', taxable: 'Taxable' })[k] || n}</label>`;
    if (t === 'num') return `<label>${n}<input data-f="${k}" inputmode="decimal" value="${v === null || v === undefined ? '' : esc(v)}"></label>`;
    return `<label class="${k === 'description' || k === 'notes' ? 'full' : ''}">${n}<input data-f="${k}" value="${esc(v ?? '')}"></label>`; };
  const NAMES = { labor_overlap: 'Labor overlap −', refinish_overlap: 'Refinish overlap −', markup_pct: 'Markup %', discount_pct: 'Discount %', betterment_pct: 'Betterment %', teardown_hours: 'R&I hr', paint_stage: 'Paint stage', part_type: 'Part type', labor_type: 'Labor type' };
  const cols = COLS.filter((c) => !['line_no', '_ext'].includes(c[0])).map((c) => [c[0], NAMES[c[0]] || c[1], c[2]]);
  const m = document.createElement('div'); m.className = 'modal'; m.id = 'lem';
  m.innerHTML = `<div class="lem"><div class="row"><h3 style="margin:0" class="grow">Line ${esc(l.line_no)}</h3><button class="sm" id="lemx">Done</button></div><div class="lemg">${cols.filter((c) => c[2] !== 'bool').map(fld).join('')}</div><div class="lemf">${cols.filter((c) => c[2] === 'bool').map(fld).join('')}</div></div>`;
  document.body.appendChild(m);
  const close = () => { m.remove(); drawRows(); };
  m.addEventListener('click', (e) => { if (e.target === m || e.target.id === 'lemx') close(); });
  m.addEventListener('change', (e) => { const el = e.target; if (el.dataset.f) saveField(id, lid, el); });
}
async function saveField(id, lid, el, tr) {
  const k = el.dataset.f; if (!k) return;
  let v = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value;
  if (COLS.find((c) => c[0] === k)?.[2] === 'num') v = v === '' ? (['markup_pct', 'discount_pct'].includes(k) ? null : 0) : Number(v);
  try { await api(`/api/lines/${lid}`, { method: 'PUT', body: { [k]: v } }); const l = S.job.lines.find((x) => x.id === lid); if (l) l[k] = v; await loadJob(id, true); $('#tot').innerHTML = totalsHtml(S.job.totals, S.job);
    if (tr) { const e2 = ext(S.job.lines.find((x) => x.id === lid) || {}); const td = tr.lastElementChild; if (td && e2 !== null) td.textContent = money(e2); } if (k === 'operation' && el.tagName === 'SELECT' && tr) el.className = 'op-' + v; } catch {}
}
const ext = (l) => { const c = S.job?.totals?.line_calc?.[l.id] || S.job?.totals?.line_calc?.find?.((x) => x.id === l.id); return c ? (c.total ?? c.amount ?? c.ext ?? null) : null; };

function cell(l, [k, , t, cls]) {
  const v = l[k];
  if (k === '_ext') { const e = ext(l); return `<td class="n ${cls}">${e === null ? '' : money(e)}</td>`; }
  if (t === 'ro') return `<td class="n ${cls} stick"><input type="checkbox" class="rs" ${S.sel.has(l.id) ? 'checked' : ''} aria-label="select"> ${esc(v)}</td>`;
  if (Array.isArray(t)) return `<td class="${cls}"><select data-f="${k}" class="${k === 'operation' ? 'op-' + esc(v) : ''}">${t.map((o) => `<option ${String(v ?? '') === o ? 'selected' : ''} value="${o}">${o || '—'}</option>`).join('')}</select></td>`;
  if (t === 'bool') return `<td class="c ${cls}"><input type="checkbox" data-f="${k}" ${Number(v) ? 'checked' : ''}></td>`;
  if (t === 'num') return `<td class="${cls}"><input data-f="${k}" inputmode="decimal" value="${v === null || v === undefined ? '' : esc(v)}" style="text-align:right"></td>`;
  return `<td class="${cls}"><input data-f="${k}" value="${esc(v)}"></td>`;
}

function totalsHtml(t, b) {
  if (!t) return '';
  const lb = Object.entries(t.labor_by_type || {}).filter(([, v]) => v);
  const tx = Object.entries(t.tax_by_cat || {}).filter(([, v]) => Number(v));
  return `<div class="totals">
  <span>Parts (net)</span><span>${money(t.parts)}</span>${t.parts_markup ? `<span class="mut">&nbsp; markup</span><span>${money(t.parts_markup)}</span>` : ''}${t.parts_discount ? `<span class="mut">&nbsp; discount</span><span>-${money(t.parts_discount)}</span>` : ''}
  ${lb.map(([k, v]) => `<span>Labor ${k} (${hrs(t.hours?.[k])} h)</span><span>${money(v)}</span>`).join('')}
  <span>Teardown / R&I (${hrs(t.teardown_hours)} h)</span><span>${money(t.teardown)}</span>
  <span>Paint & materials (${hrs(t.pm_hours)} h)</span><span>${money(t.paint_materials)}</span>
  <span>Sublet</span><span>${money(t.sublet)}</span>${t.misc ? `<span>Misc</span><span>${money(t.misc)}</span>` : ''}
  ${tx.map(([k, v]) => `<span class="mut">Tax ${k.replace('_', ' ')}</span><span>${money(v)}</span>`).join('')}
  <span class="b">Total</span><span class="b">${money(t.total)}</span>
  <span>Deductible</span><span>${money(t.deductible)}</span>${t.betterment ? `<span>Betterment</span><span>${money(t.betterment)}</span>` : ''}
  <span>Customer pays</span><span>${money(t.customer_pays)}</span><span>Insurer pays</span><span>${money(t.insurer_pays)}</span>
  </div><p class="sm mut">${t.line_count} ${t.line_count === 1 ? 'line' : 'lines'} · overlap -${hrs(t.labor_overlap_hours)} lab / -${hrs(t.refinish_overlap_hours)} rfn h · ${t.judgment_lines || 0} judgment${t.total_loss_flag ? ' · <b style="color:var(--bad)">TOTAL LOSS threshold</b>' : t.total_loss_warning ? ' · near total-loss' : ''}</p>`;
}

window.CP = window.CP || {};
window.CP.estimateView = async (id) => {
  const b = await loadJob(id, true); S.sel = new Set();
  const supps = b.supplements || [];
  shell(esc(b.job.number), esc(vehLabel(b.vehicle)) + ' · ' + esc(b.customer?.name || ''), jobTabs(id, 'estimate') + `<div class="page"><div class="estlayout"><div>
  <div class="row estbar" style="margin-bottom:8px"><input id="gq" placeholder="Search lines  (/)" style="max-width:240px"><select id="gf" style="max-width:150px"><option value="">All ops</option>${OPS.map((o) => `<option>${o}</option>`).join('')}</select><select id="gs" style="max-width:150px"><option value="">All supplements</option><option value="0">Original</option>${supps.map((s) => `<option value="${s.number ?? s.supplement_no}">S${s.number ?? s.supplement_no}</option>`).join('')}</select>
  <button id="add" class="sm">+ Line (N)</button><button id="sup" class="sm">+ Supplement</button><button class="sm" data-href="#/job/${id}/3d">3D (3)</button></div>
  <div class="gridwrap" id="gw"><table class="eg" id="eg"><thead><tr>${COLS.map(([k, n, , cls, mh]) => `<th class="${cls} ${mh ? 'hide-m' : ''} ${k === 'line_no' ? 'stick' : ''}" data-k="${k}">${k === 'line_no' ? '<input type="checkbox" id="sa" aria-label="select all"> ' : ''}${n}</th>`).join('')}</tr></thead><tbody></tbody></table></div><div class="lcards" id="lc" hidden></div>
  <div class="bulk" id="bulk" hidden><b id="bc"></b><select id="bf"><option value="">Set field…</option><option>operation</option><option>labor_type</option><option>part_type</option><option>paint_stage</option><option>taxable</option><option>incl</option><option>judgment</option><option>not_included</option><option>markup_pct</option><option>discount_pct</option><option>betterment_pct</option></select><input id="bv" placeholder="value" style="width:90px"><button class="sm pri" id="bset">Set</button>
  <input id="bh" placeholder="±hrs" style="width:70px"><select id="bhk"><option>labor_hours</option><option>refinish_hours</option><option>teardown_hours</option></select><button class="sm" id="badd">Add hrs</button>
  <input id="bp" placeholder="%" style="width:60px"><button class="sm" id="bsc">Scale price %</button>
  <select id="bm"><option value="0">Original</option>${supps.map((s) => `<option value="${s.number ?? s.supplement_no}">S${s.number ?? s.supplement_no}</option>`).join('')}</select><button class="sm" id="bmv">Move</button>
  <button class="sm" id="bdup">Duplicate</button><button class="sm dan" id="bdel">Delete</button><button class="sm" id="bclr">Clear</button></div>
  </div><div><div class="card custcard"><h3>Customer</h3><div id="custw">${custBlock(b.customer)}</div></div><div class="card"><h3>Totals</h3><div id="tot"></div></div><div class="card sm mut">* = judgment time.</div></div></div></div>`);
  drawRows(); $('#tot').innerHTML = totalsHtml(b.totals, b);
  bindCustomer(b);
  bindGrid(id);
};
// Customer block: Edit opens the shared contact panel; the estimate, PDF and Messages read the saved row
function bindCustomer(b) {
  const btn = $('#custedit'); if (!btn) return;
  btn.onclick = async () => {
    const saved = await editCustomer(b.customer);
    if (!saved) return;
    b.customer = { ...b.customer, ...saved };
    if (S.job && S.job.job?.id === b.job.id) S.job.customer = b.customer;
    $('#custw').innerHTML = custBlock(b.customer);
    const sub = document.querySelector('header.top .sub'); if (sub) sub.textContent = vehLabel(b.vehicle) + ' · ' + (b.customer.name || '');
    bindCustomer(b);
  };
}

function visibleLines() {
  const b = S.job; let L = [...(b.lines || [])];
  const q = ($('#gq')?.value || '').toLowerCase(), f = $('#gf')?.value, sp = $('#gs')?.value;
  if (q) L = L.filter((l) => [l.description, l.part_no, l.notes, l.operation, l.labor_type].join(' ').toLowerCase().includes(q));
  if (f) L = L.filter((l) => l.operation === f);
  if (sp !== '' && sp !== undefined) L = L.filter((l) => String(l.supplement_no || 0) === sp);
  if (S.sort) { const [k, d] = S.sort; L.sort((a, c) => { const x = a[k] ?? '', y = c[k] ?? ''; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * d; }); }
  return L;
}
function drawRows() {
  const L = visibleLines();
  const mob = isPhone();
  $('#gw').hidden = mob; $('#lc').hidden = !mob;
  if (mob) {
    const all = L.length && L.every((l) => S.sel.has(l.id));
    $('#lc').innerHTML = (L.length ? `<label class="lcsa"><input type="checkbox" id="sa2" ${all ? 'checked' : ''}> Select all <span class="mut">· ${L.length} ${L.length === 1 ? 'line' : 'lines'} · tap a line to edit</span></label>` : '') + (L.map(lineCard).join('') || `<p class="mut" style="padding:14px">No lines. Add parts from the 3D picker or tap + Line.</p>`);
    $('#eg tbody').innerHTML = '';
  } else {
    $('#lc').innerHTML = '';
    $('#eg tbody').innerHTML = L.map((l) => `<tr data-id="${l.id}" class="${S.sel.has(l.id) ? 'sel' : ''}">${COLS.map((c) => cell(l, c)).join('')}</tr>`).join('') || `<tr><td colspan="${COLS.length}" style="padding:14px" class="mut">No lines. Add parts from the 3D picker or press N.</td></tr>`;
  }
  updBulk();
}
function updBulk() { const n = S.sel.size; $('#bulk').hidden = !n; $('#bc').textContent = `${n} selected`; $$('#eg tbody tr, #lc .lcard').forEach((tr) => tr.classList.toggle('sel', S.sel.has(Number(tr.dataset.id)))); }

async function refresh(id) { await loadJob(id, true); drawRows(); $('#tot').innerHTML = totalsHtml(S.job.totals, S.job); }
async function bulk(id, body) { if (!S.sel.size) return; await api(`/api/jobs/${id}/lines/bulk`, { method: 'POST', body: { ids: [...S.sel], ...body } }); if (body.action === 'delete') S.sel.clear(); toast('Done'); await refresh(id); }

function bindGrid(id) {
  const tb = $('#eg tbody');
  tb.addEventListener('change', async (e) => {
    const el = e.target; const tr = el.closest('tr'); if (!tr) return; const lid = Number(tr.dataset.id);
    if (el.classList.contains('rs')) { el.checked ? S.sel.add(lid) : S.sel.delete(lid); return updBulk(); }
    saveField(id, lid, el, tr);
  });
  const lc = $('#lc');
  lc.addEventListener('change', (e) => { const el = e.target;
    if (el.id === 'sa2') { S.sel = el.checked ? new Set(visibleLines().map((l) => l.id)) : new Set(); return drawRows(); }
    const c = el.closest('.lcard'); if (!c || !el.classList.contains('rs')) return; const lid = Number(c.dataset.id); el.checked ? S.sel.add(lid) : S.sel.delete(lid); updBulk(); });
  lc.addEventListener('click', (e) => { if (e.target.closest('.lcs,.lcsa')) return; const c = e.target.closest('.lcard'); if (c) editLine(id, Number(c.dataset.id)); });
  if (!window.__cpEstMq) { window.__cpEstMq = matchMedia(PHONE); window.__cpEstMq.addEventListener('change', () => { if ($('#lc') && $('#gw')) drawRows(); }); }
  $('#sa').onchange = (e) => { S.sel = e.target.checked ? new Set(visibleLines().map((l) => l.id)) : new Set(); drawRows(); };
  $$('#eg th[data-k]').forEach((th) => th.addEventListener('click', (e) => { if (e.target.id === 'sa') return; const k = th.dataset.k; if (k === '_ext') return; S.sort = S.sort && S.sort[0] === k ? (S.sort[1] === 1 ? [k, -1] : null) : [k, 1]; drawRows(); }));
  for (const s of ['#gq', '#gf', '#gs']) $(s).addEventListener('input', drawRows);
  $('#add').onclick = () => addLine(id);
  $('#sup').onclick = async () => { const reason = prompt('Supplement reason (e.g. hidden damage found at teardown)'); if (reason === null) return; await api(`/api/jobs/${id}/supplements`, { method: 'POST', body: { reason } }); toast('Supplement opened: new lines go on it'); window.CP.estimateView(id); };
  $('#bset').onclick = () => { const f = $('#bf').value; if (!f) return toast('Pick a field', true); let v = $('#bv').value; if (['taxable', 'incl', 'judgment', 'not_included'].includes(f)) v = /^(1|y|yes|true|on)$/i.test(v) ? 1 : 0; else if (/_pct$/.test(f)) v = v === '' ? null : Number(v); bulk(id, { action: 'update', set: { [f]: v } }); };
  $('#badd').onclick = () => bulk(id, { action: 'update', adjust: { [$('#bhk').value]: Number($('#bh').value) || 0 } });
  $('#bsc').onclick = () => bulk(id, { action: 'update', scale: { unit_price: Number($('#bp').value) || 0 } });
  $('#bmv').onclick = () => bulk(id, { action: 'move', supplement_no: Number($('#bm').value) });
  $('#bdup').onclick = () => bulk(id, { action: 'duplicate' });
  $('#bdel').onclick = () => confirm(`Delete ${S.sel.size} line(s)?`) && bulk(id, { action: 'delete' });
  $('#bclr').onclick = () => { S.sel.clear(); drawRows(); };
  // keyboard
  const onKey = (e) => {
    if (!document.body.contains(tb)) return document.removeEventListener('keydown', onKey);
    const inField = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName) && !document.activeElement.classList.contains('rs');
    if (e.key === '/' && !inField) { e.preventDefault(); $('#gq').focus(); return; }
    if (e.key === 'Escape') { S.sel.clear(); drawRows(); document.activeElement?.blur(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); return bulk(id, { action: 'duplicate' }); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !inField) { e.preventDefault(); S.sel = new Set(visibleLines().map((l) => l.id)); return drawRows(); }
    if (inField && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') && document.activeElement.closest('#eg')) {
      if (document.activeElement.tagName === 'SELECT' && e.key !== 'Enter') return;
      const td = document.activeElement.closest('td'); const tr = td.parentElement; const idx = [...tr.children].indexOf(td);
      const nx = (e.key === 'ArrowUp' ? tr.previousElementSibling : tr.nextElementSibling)?.children[idx]?.querySelector('input,select');
      if (nx) { e.preventDefault(); document.activeElement.dispatchEvent(new Event('change', { bubbles: true })); nx.focus(); nx.select?.(); }
      return;
    }
    if (inField) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); addLine(id); }
    else if (e.key === 'Delete' && S.sel.size) { confirm(`Delete ${S.sel.size} line(s)?`) && bulk(id, { action: 'delete' }); }
    else if (e.key === '3') location.hash = `#/job/${id}/3d`;
    else if (e.key === 'p' || e.key === 'P') location.hash = `#/job/${id}/finish`;
  };
  document.addEventListener('keydown', onKey); onLeave(() => document.removeEventListener('keydown', onKey));
  // touch: long-press selects, swipe left offers duplicate/delete
  let t0 = null, lp = null;
  tb.addEventListener('touchstart', (e) => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, tr }; lp = setTimeout(() => { const lid = Number(tr.dataset.id); S.sel.has(lid) ? S.sel.delete(lid) : S.sel.add(lid); updBulk(); navigator.vibrate?.(20); t0 = null; }, 550); }, { passive: true });
  tb.addEventListener('touchmove', (e) => { if (!t0) return; const dx = e.touches[0].clientX - t0.x, dy = e.touches[0].clientY - t0.y; if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearTimeout(lp); if (dx < -70 && Math.abs(dy) < 30) { swipeMenu(id, t0.tr); t0 = null; } }, { passive: true });
  tb.addEventListener('touchend', () => { clearTimeout(lp); t0 = null; });
}
function swipeMenu(id, tr) {
  const lid = Number(tr.dataset.id); const l = S.job.lines.find((x) => x.id === lid);
  const m = document.createElement('div'); m.className = 'sheet';
  m.innerHTML = `<div class="grab"></div><b>${esc(l?.description || 'Line')}</b><div class="ops" style="margin-top:10px"><button data-a="duplicate">Duplicate</button><button data-a="delete" class="dan">Delete</button><button data-a="x">Cancel</button></div>`;
  document.body.appendChild(m);
  m.onclick = async (e) => { const a = e.target.dataset.a; if (!a) return; m.remove(); if (a === 'x') return; await api(`/api/jobs/${id}/lines/bulk`, { method: 'POST', body: { ids: [lid], action: a } }); await refresh(id); };
}
async function addLine(id) {
  await api(`/api/jobs/${id}/lines`, { method: 'POST', body: { operation: 'repair', description: 'New line', labor_type: 'body', labor_hours: 0 } });
  await refresh(id);
  const last = [...$$('#eg tbody tr')].pop(); last?.querySelector('[data-f=description]')?.focus(); last?.querySelector('[data-f=description]')?.select();
}

// ---------- finish: PDF, share, print, customer link ----------
window.CP.finishView = async (id) => {
  const b = await loadJob(id, true);
  const pdfUrl = `/api/jobs/${id}/pdf`;
  shell(esc(b.job.number), esc(vehLabel(b.vehicle)), jobTabs(id, 'finish') + `<div class="page"><div class="card"><h3>Estimate PDF</h3><p>Total <b>${money(b.totals?.total)}</b> · ${b.totals?.line_count || 0} ${(b.totals?.line_count || 0) === 1 ? 'line' : 'lines'}</p>
  <div class="row"><button class="pri" id="gen">Generate PDF</button><a id="dl" class="sm" hidden>Download</a><button id="sh" disabled>Share…</button><button id="pr" disabled>Print</button></div>
  <div class="row" style="margin-top:8px"><button id="wa" class="sm">WhatsApp</button><button id="em" class="sm">Email</button><button id="tx" class="sm">Text</button><span class="mut sm">Drive: use Share… on your phone and pick Drive.</span></div>
  <iframe id="pv" style="width:100%;height:60vh;border:1px solid var(--line);border-radius:8px;margin-top:10px;background:#fff" hidden title="PDF preview"></iframe></div>
  <div class="card"><h3>Customer link</h3><div class="row"><button id="ln">Create shareable link</button><input id="lnv" readonly class="grow" placeholder="—"><button id="cp" class="sm">Copy</button></div><p class="sm mut">The link opens a read-only copy of this estimate. It expires.</p></div></div>`);
  let blob = null, file = null, link = '', b64 = '';
  const N = window.CPNative; // Android app bridge: WebView can't preview, download or share blobs itself
  const name = `${b.job.number}-estimate.pdf`;
  const msg = () => `Estimate ${b.job.number} for your ${vehLabel(b.vehicle)}: ${money(b.totals?.total)}${link ? '\n' + link : ''}`;
  $('#gen').onclick = async () => {
    blob = await api(pdfUrl); file = new File([blob], name, { type: 'application/pdf' });
    const u = URL.createObjectURL(blob); const a = $('#dl'); a.href = u; a.download = name; a.hidden = false; a.textContent = `Download ${name}`;
    if (N) {
      b64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.readAsDataURL(blob); });
      a.removeAttribute('download'); a.href = '#'; a.textContent = `Open ${name}`; a.onclick = (e) => { e.preventDefault(); N.openPdf(b64, name); };
    } else { $('#pv').src = u; $('#pv').hidden = false; }
    $('#sh').disabled = false; $('#pr').disabled = false; toast('PDF ready');
  };
  const ensureLink = async () => { if (!link) { const r = await api(`/api/jobs/${id}/share-link`, { method: 'POST', body: {} }); link = r.url; $('#lnv').value = link; } return link; };
  $('#sh').onclick = async () => {
    if (N && b64) { N.sharePdf(b64, name, msg()); return; }
    if (navigator.canShare && file && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name, text: msg() }); } catch {} }
    else if (navigator.share) { await ensureLink(); try { await navigator.share({ title: name, text: msg(), url: link }); } catch {} }
    else toast('Sharing files is not supported here; use Download or the buttons below', true);
  };
  $('#pr').onclick = () => { if (N && b64) { N.printPdf(b64, name); return; } try { $('#pv').contentWindow.print(); } catch { window.open($('#dl').href); } };
  $('#wa').onclick = async () => { await ensureLink(); window.open('https://wa.me/?text=' + encodeURIComponent(msg()), '_blank'); };
  $('#em').onclick = async () => { await ensureLink(); location.href = `mailto:${encodeURIComponent(b.customer?.email || '')}?subject=${encodeURIComponent('Estimate ' + b.job.number)}&body=${encodeURIComponent(msg())}`; };
  $('#tx').onclick = async () => { await ensureLink(); location.href = `sms:${encodeURIComponent(b.customer?.phone || '')}?&body=${encodeURIComponent(msg())}`; };
  $('#ln').onclick = ensureLink;
  $('#cp').onclick = async () => { await ensureLink(); await navigator.clipboard?.writeText(link).catch(() => {}); toast('Link copied'); };
};
