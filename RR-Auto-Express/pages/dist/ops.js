// Owner screens that replaced the "coming soon" cards: production board, invoices, messages,
// customer portal, schedule, parts, reports, insurers, paint, compliance.
import { S, api, toast, view, $, $$, esc, money, shell, icon } from './app.js';

// ---------- shared helpers ----------
export const vLabel = (j) => [j.year, j.make, j.model].filter(Boolean).join(' ') || 'Vehicle';
export const dstr = (d) => { if (!d) return ''; const x = new Date(String(d).length <= 10 ? d + 'T12:00:00' : String(d).replace(' ', 'T') + (String(d).includes('Z') || String(d).includes('+') ? '' : 'Z')); return isNaN(x) ? String(d) : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
export const dtstr = (d) => { if (!d) return ''; const x = new Date(String(d).replace(' ', 'T') + (/[Z+]/.test(String(d).slice(10)) ? '' : 'Z')); return isNaN(x) ? String(d) : x.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function dlg(title, body, { wide = false } = {}) {
  const m = document.createElement('div'); m.className = 'modal odlg';
  m.innerHTML = `<div class="${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="dh"><h2>${esc(title)}</h2><button class="ib x" aria-label="Close">${icon('x')}</button></div><div class="db">${body}</div></div>`;
  document.body.appendChild(m);
  const close = () => { m.remove(); document.removeEventListener('keydown', key); window.removeEventListener('hashchange', close); };
  const key = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key); window.addEventListener('hashchange', close);
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('.x')) close(); });
  m.close = close; m.q = (s) => m.querySelector(s); m.qa = (s) => [...m.querySelectorAll(s)];
  return m;
}
export const formVals = (root) => { const o = {}; root.querySelectorAll('[name]').forEach((i) => { o[i.name] = i.type === 'checkbox' ? (i.checked ? 1 : 0) : i.value; }); return o; };
const ownerOnly = () => { const caps = S.me?.caps || []; return caps.includes('*') || caps.includes('shop.read'); };
function guard(title) { if (ownerOnly()) return true; shell(title, '', '<div class="page"><div class="card empty"><h2>Owner only</h2><p class="mut">Ask the shop owner for access.</p><a class="btn pri" href="#/jobs">Go to estimates</a></div></div>'); return false; }
export { guard };

// ---------- 1. Production board ----------
const STAGE_COL = { intake: '#8b8fa3', teardown: '#a78bfa', parts_hold: '#f5a524', body: '#5b95ff', frame: '#22b8cf', paint: '#f472b6', reassembly: '#34d399', mechanical: '#94a3b8', adas: '#38bdf8', detail: '#c084fc', qc: '#facc15', ready: '#2bd47a' };
view('production', async (focus) => {
  if (!guard('Production board')) return;
  const b = await api('/api/board');
  const stages = b.stages; const jobs = b.jobs;
  const lab = Object.fromEntries(stages);
  const nEst = (b.estimates || []).length;
  shell('Production board', `${jobs.length} ${jobs.length === 1 ? 'car' : 'cars'} in the shop${b.bottleneck ? ` · most waiting in ${esc(lab[b.bottleneck.stage])}` : ''}`,
    `<div class="page pb"><div class="pbbar"><div class="pbchips" id="chips">${stages.map(([k, n]) => `<button class="chip" data-go="${k}"><i style="background:${STAGE_COL[k]}"></i>${esc(n)}<b>${b.counts?.[k] || 0}</b></button>`).join('')}</div></div>
    ${jobs.length ? '' : `<div class="card empty"><span class="eic">${icon('board')}</span><h2>No cars in the shop</h2><p class="mut">${nEst ? 'Start the repair on an estimate and it shows up here by stage.' : 'When an estimate is approved, start the repair and it shows up here by stage.'}</p></div>`}
    <div class="kb" id="kb">${stages.map(([k, n]) => { const js = jobs.filter((j) => j.stage === k); return `<section class="kcol" data-stage="${k}" id="col-${k}"><header><i style="background:${STAGE_COL[k]}"></i><h3>${esc(n)}</h3><span class="cnt">${js.length}</span></header><div class="kcards">${js.map(card).join('') || '<div class="kempty">Drop a car here</div>'}</div></section>`; }).join('')}</div></div>`,
    `<div class="row">${nEst ? `<button class="pri" id="start">${icon('plus')}Start a repair</button>` : ''}</div>`);
  function card(j) {
    const late = j.target_date && j.target_date.slice(0, 10) < todayStr() && j.stage !== 'ready';
    const h = j.hours_in_stage || 0; const t = h >= 48 ? `${Math.round(h / 24)}d` : `${Math.round(h)}h`;
    return `<article class="kc ${j.alerts?.length ? 'al' : ''}" draggable="true" data-id="${j.id}" tabindex="0" style="--sc:${STAGE_COL[j.stage]}">
      <div class="k1"><b>${esc(vLabel(j))}</b><span class="num">${esc(j.number)}</span></div>
      <div class="k2">${esc(j.customer_name || 'No customer')}${j.color ? ` · ${esc(j.color)}` : ''}</div>
      <div class="k3"><span class="tag" title="Time in this stage">${icon('clock')}${t}</span>${j.target_date ? `<span class="tag ${late ? 'bad' : ''}">Due ${esc(dstr(j.target_date))}</span>` : ''}${j.parts_open ? `<span class="tag ${j.parts_backordered ? 'warn' : ''}">${j.parts_open} part${j.parts_open > 1 ? 's' : ''} open</span>` : ''}${j.insurer_name ? `<span class="tag">${esc(j.insurer_name)}</span>` : ''}</div>
      ${j.alerts?.length ? `<div class="k4">${esc(j.alerts[0])}</div>` : ''}</article>`;
  }
  const move = async (id, stage, notify = true) => {
    const j = jobs.find((x) => x.id == id); if (!j || j.stage === stage) return;
    const r = await api(`/api/jobs/${id}/stage`, { method: 'PUT', body: { stage, notify } });
    const ms = String(r.message?.status || '');
    if (r.message && (ms.startsWith('failed') || ms.startsWith('queued') || ms === 'not_configured')) {
      toast(`Moved to ${lab[stage]}`);
      const { offerPhone } = await import('./ops2.js');
      if (location.hash === '#/production') await VIEW_RELOAD(); else location.hash = '#/production';
      setTimeout(() => offerPhone(r.message.phone || r.message.to_addr, r.message.body, ms.startsWith('failed') ? (r.message.error || ms.replace(/^failed \(|\)$/g, '')) : '', null, true, r.message.id), 50);
      return;
    }
    toast(`Moved to ${lab[stage]}${['pending', 'processing', 'sent', 'delivered'].includes(ms) ? ' · customer texted' : ms === 'phone_queue' ? ' · text going out from your phone' : ''}`);
    if (ms === 'phone_queue') import('./ops2.js').then((x) => x.nativeKick());
    location.hash === '#/production' ? VIEW_RELOAD() : (location.hash = '#/production');
  };
  const VIEW_RELOAD = () => import('./app.js').then((m) => m.route());
  $$('.chip', $('#chips')).forEach((c) => c.onclick = () => { const col = $('#col-' + c.dataset.go); const kb = $('#kb'); kb.scrollTo({ left: col.offsetLeft - kb.offsetLeft, behavior: 'smooth' }); });
  // drag and drop (mouse / desktop)
  let dragId = null;
  $$('.kc').forEach((el) => {
    el.addEventListener('dragstart', (e) => { dragId = el.dataset.id; el.classList.add('drag'); e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; });
    el.addEventListener('dragend', () => { el.classList.remove('drag'); $$('.kcol').forEach((c) => c.classList.remove('over')); });
    el.onclick = () => openJob(el.dataset.id);
    el.onkeydown = (e) => { if (e.key === 'Enter') openJob(el.dataset.id); };
  });
  $$('.kcol').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
    col.addEventListener('drop', (e) => { e.preventDefault(); col.classList.remove('over'); const id = e.dataTransfer.getData('text/plain') || dragId; if (id) move(id, col.dataset.stage); });
  });
  function openJob(id) {
    const j = jobs.find((x) => x.id == id);
    const i = stages.findIndex(([k]) => k === j.stage);
    const m = dlg(`${vLabel(j)} · ${j.number}`, `<p class="mut" style="margin:0 0 10px">${esc(j.customer_name || '')}${j.insurer_name ? ' · ' + esc(j.insurer_name) : ''} · now in <b style="color:var(--tx)">${esc(lab[j.stage])}</b></p>
      ${j.alerts?.length ? `<div class="note warn">${j.alerts.map(esc).join('<br>')}</div>` : ''}
      <div class="row" style="margin-bottom:12px">${i > 0 ? `<button class="sm" data-mv="${stages[i - 1][0]}">← ${esc(stages[i - 1][1])}</button>` : ''}${i < stages.length - 1 ? `<button class="sm pri" data-mv="${stages[i + 1][0]}">${esc(stages[i + 1][1])} →</button>` : ''}</div>
      <label>Move to any stage</label><div class="stgrid">${stages.map(([k, n]) => `<button class="sm ${k === j.stage ? 'on' : ''}" data-mv="${k}"><i style="background:${STAGE_COL[k]}"></i>${esc(n)}</button>`).join('')}</div>
      <label class="chk"><input type="checkbox" id="ntf" checked> Text the customer a status update</label>
      <div class="row" style="margin-top:14px"><a class="btn sm" href="#/job/${j.id}">Open estimate</a>${j.stage === 'ready' ? '<button class="sm pri" id="dlv">Delivered to customer</button>' : ''}</div>`);
    m.qa('[data-mv]').forEach((bt) => bt.onclick = () => { m.close(); move(j.id, bt.dataset.mv, m.q('#ntf').checked); });
    const d = m.q('#dlv'); if (d) d.onclick = async () => { await api(`/api/jobs/${j.id}/deliver`, { method: 'POST' }); m.close(); toast('Delivered. The job is closed.'); VIEW_RELOAD(); };
  }
  const st = $('#start'); if (st) st.onclick = () => {
    const m = dlg('Start a repair', `<p class="mut" style="margin-top:0">Pick an estimate to put on the board at Check-in.</p><div class="list olist">${b.estimates.map((e) => `<div class="it" data-id="${e.id}"><span class="av">${icon('doc')}</span><span class="grow"><b>${esc(vLabel(e))}</b><span class="mut sm" style="display:block">${esc(e.number)} · ${esc(e.customer_name || 'No customer')}</span></span><span class="tag">${esc(e.status)}</span></div>`).join('')}</div>`);
    m.qa('.it').forEach((it) => it.onclick = async () => { await api(`/api/jobs/${it.dataset.id}/stage`, { method: 'PUT', body: { stage: 'intake', start: 1, notify: false } }); m.close(); toast('Added to the board'); VIEW_RELOAD(); });
  };
  if (focus) { const col = $('#col-' + focus); if (col) $('#kb').scrollLeft = col.offsetLeft - $('#kb').offsetLeft; }
});

// ---------- PDF helper (browser preview or Android app bridge) ----------
export async function openPdf(url, name) {
  const blob = await api(url); const N = window.CPNative;
  if (N) { const b64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.readAsDataURL(blob); }); N.openPdf(b64, name); return; }
  const u = URL.createObjectURL(blob); const w = window.open(u, '_blank');
  if (!w) { const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
}
const STAT = { open: ['Open', 'acc'], partial: ['Partly paid', 'warn'], paid: ['Paid', 'ok'], void: ['Void', ''] };
const kpis = (arr) => `<div class="kpis">${arr.map(([l, v, c]) => `<div class="kpi ${c || ''}"><span>${esc(l)}</span><b>${v}</b></div>`).join('')}</div>`;
export { kpis };

// ---------- 2. Invoices ----------
view('invoices', async (filter) => {
  if (!guard('Invoices')) return;
  const d = await api('/api/invoices');
  const f = filter || 'open';
  const list = d.invoices.filter((i) => f === 'all' ? true : f === 'paid' ? i.status === 'paid' : f === 'void' ? i.status === 'void' : ['open', 'partial'].includes(i.status));
  const ready = d.ready.filter((j) => j.status !== 'estimate'), waiting = d.ready.filter((j) => j.status === 'estimate' && j.line_count > 0);
  const vcard = (i) => { const [sl, sc] = STAT[i.status] || [i.status, '']; return `<article class="ocard" data-inv="${i.id}" tabindex="0">
    <div class="o1"><b>${esc(vLabel(i))}</b><span class="num">${esc(i.number)}</span></div>
    <div class="o2">${esc(i.customer_name || i.bill_to || '')}${i.insurer_name ? ' \u00b7 ' + esc(i.insurer_name) : ''} \u00b7 ${esc(i.ro)}</div>
    <div class="o3"><span class="tag ${sc}">${sl}</span>${i.overdue ? '<span class="tag bad">Overdue</span>' : ''}<span class="sp"></span><span class="amt"><small>Total</small>${money(i.total)}</span><span class="amt ${i.balance > 0.005 && i.status !== 'void' ? 'due' : ''}"><small>Balance</small>${money(i.status === 'void' ? 0 : i.balance)}</span></div></article>`; };
  shell('Invoices', `${d.invoices.filter((i) => i.status !== 'void').length} invoices`,
    `<div class="page">${kpis([['Billed', money(d.totals.billed)], ['Collected', money(d.totals.paid), 'g'], ['Balance due', money(d.totals.balance), d.totals.balance > 0 ? 'w' : ''], ['Overdue', d.totals.overdue, d.totals.overdue ? 'r' : '']])}
    ${ready.length || waiting.length ? `<div class="card"><h3>Ready to invoice</h3><div class="list olist">${ready.map((j) => `<div class="it"><span class="grow"><b>${esc(vLabel(j))}</b><span class="mut sm" style="display:block">${esc(j.number)} \u00b7 ${esc(j.customer_name || 'No customer')}</span></span><button class="sm pri" data-mk="${j.id}">Create invoice</button></div>`).join('')}
      ${waiting.map((j) => `<div class="it"><span class="grow"><b>${esc(vLabel(j))}</b><span class="mut sm" style="display:block">${esc(j.number)} \u00b7 ${esc(j.customer_name || 'No customer')} \u00b7 estimate not approved</span></span><button class="sm" data-ap="${j.id}">Approve &amp; invoice</button></div>`).join('')}</div></div>` : ''}
    <div class="seg" role="tablist">${[['open', 'Open'], ['paid', 'Paid'], ['all', 'All'], ['void', 'Void']].map(([k, n]) => `<button role="tab" class="${k === f ? 'on' : ''}" data-f="${k}">${n}</button>`).join('')}</div>
    <div class="ogrid">${list.map(vcard).join('') || `<div class="card empty"><span class="eic">${icon('receipt')}</span><h2>${d.invoices.length ? 'Nothing here' : 'No invoices yet'}</h2><p class="mut">${d.invoices.length ? 'Try another filter.' : 'Approve an estimate, then create its invoice here.'}</p></div>`}</div></div>`);
  $$('.seg button').forEach((b) => b.onclick = () => { location.hash = '#/invoices/' + b.dataset.f; });
  $$('[data-mk]').forEach((b) => b.onclick = async () => { b.disabled = true; try { const r = await api(`/api/jobs/${b.dataset.mk}/invoice`, { method: 'POST', body: {} }); toast(`Invoice ${r.number} created`); await import('./app.js').then((m) => m.route()); openInvoice(r.id); } catch { b.disabled = false; } });
  $$('[data-ap]').forEach((b) => b.onclick = async () => {
    if (!confirm('Mark this estimate as approved by the customer and create the invoice?')) return;
    b.disabled = true; try { await api(`/api/jobs/${b.dataset.ap}/approve`, { method: 'POST' }); const r = await api(`/api/jobs/${b.dataset.ap}/invoice`, { method: 'POST', body: {} }); toast(`Invoice ${r.number} created`); await import('./app.js').then((m) => m.route()); openInvoice(r.id); } catch { b.disabled = false; }
  });
  $$('.ocard[data-inv]').forEach((c) => { c.onclick = () => openInvoice(c.dataset.inv); c.onkeydown = (e) => { if (e.key === 'Enter') openInvoice(c.dataset.inv); }; });
});
export async function openInvoice(id) {
  const { invoice: i, payments } = await api('/api/invoices/' + id);
  const ins = i.pay_type === 'insurance';
  const [sl, sc] = STAT[i.status] || [i.status, ''];
  const row = (l, v, cls = '') => `<div class="ir ${cls}"><span>${l}</span><b>${v}</b></div>`;
  const m = dlg(`${i.number} \u00b7 ${vLabel(i)}`, `<div class="ihead"><span class="tag ${sc}">${sl}</span>${i.overdue ? '<span class="tag bad">Overdue</span>' : ''}<span class="mut sm">${esc(i.customer_name || i.bill_to || '')} \u00b7 ${esc(i.ro)} \u00b7 due ${esc(dstr(i.due_date))}</span></div>
    <div class="icols"><div class="ibox"><h4>Charges</h4>${row('Parts', money(i.parts))}${row('Labor', money(i.labor))}${row('Paint &amp; materials', money(i.paint))}${i.sublet ? row('Sublet', money(i.sublet)) : ''}${i.other ? row('Other', money(i.other)) : ''}${row('Tax', money(i.tax))}${row('Total', money(i.total), 'tot')}</div>
    <div class="ibox"><h4>Who pays</h4>${ins ? `${row('Customer (deductible' + (num(i.customer_portion) > num(i.deductible) + 0.005 ? ' + extras' : '') + ')', money(i.customer_portion))}${row('Insurance' + (i.insurer_name ? ' \u00b7 ' + esc(i.insurer_name) : ''), money(i.insurer_portion))}` : row('Customer', money(i.total))}
      ${row('Paid', money(i.paid), 'g')}${ins ? row('Customer still owes', money(Math.max(0, i.customer_balance))) + row('Insurance still owes', money(Math.max(0, i.insurer_balance))) : ''}${row('Balance due', money(i.status === 'void' ? 0 : i.balance), 'tot ' + (i.balance > 0.005 ? 'w' : ''))}</div></div>
    ${ins && i.status !== 'void' ? `<div class="ibox"><h4>Deductible</h4><div class="row"><input id="ded" type="number" inputmode="decimal" min="0" step="0.01" value="${num(i.deductible)}" aria-label="Deductible" style="max-width:160px"><button class="sm" id="dedsave">Save deductible</button></div><p class="hint">Moves that amount from the insurance share to the customer share.</p></div>` : ''}
    <div class="ibox"><h4>Payments</h4>${payments.length ? `<div class="list olist">${payments.map((p) => `<div class="it"><span class="grow"><b>${money(p.amount)}</b><span class="mut sm" style="display:block">${esc(dstr(p.received_at))} \u00b7 ${p.payer === 'insurer' ? 'Insurance' : 'Customer'} \u00b7 ${esc(p.kind || '')} \u00b7 ${esc(p.method || '')}${p.reference ? ' \u00b7 #' + esc(p.reference) : ''}</span></span>${i.status !== 'void' ? `<button class="ib" data-delp="${p.id}" aria-label="Remove payment">${icon('trash')}</button>` : ''}</div>`).join('')}</div>` : '<p class="mut sm" style="margin:0">No payments yet.</p>'}
    ${i.status !== 'void' && i.balance > 0.005 ? `<form id="pay" class="fgrid" style="margin-top:12px"><div><label>Amount</label><input name="amount" type="number" inputmode="decimal" step="0.01" min="0.01" required value="${(ins && i.customer_balance > 0.005 ? i.customer_balance : i.balance).toFixed(2)}"></div>
      <div><label>From</label><select name="payer"><option value="customer">Customer</option>${ins ? '<option value="insurer">Insurance</option>' : ''}</select></div>
      <div><label>For</label><select name="kind">${ins ? '<option value="deductible">Deductible</option><option value="insurance">Insurance payment</option>' : ''}<option value="customer pay">Customer pay</option><option value="deposit">Deposit</option><option value="supplement">Supplement</option></select></div>
      <div><label>Method</label><select name="method"><option value="card">Card</option><option value="cash">Cash</option><option value="check">Check</option><option value="ach">Bank transfer</option><option value="other">Other</option></select></div>
      <div><label>Date</label><input name="received_at" type="date" value="${todayStr()}"></div><div><label>Reference / check #</label><input name="reference" maxlength="80"></div>
      <div class="full factions" style="margin-top:4px"><button class="pri" type="submit">${icon('plus')}Record payment</button></div></form>` : ''}</div>
    <div class="factions"><button id="ipdf">${icon('dl')}Invoice PDF</button><a class="btn" href="#/job/${i.job_id}">Open estimate</a><span class="sp"></span>${i.status !== 'void' ? '<button class="danger" id="ivoid">Void</button>' : ''}</div>`, { wide: true });
  const reopen = async () => { m.close(); await import('./app.js').then((x) => x.route()); openInvoice(id); };
  m.q('#ipdf').onclick = () => openPdf(`/api/jobs/${i.job_id}/pdf?kind=invoice`, `${i.number}.pdf`);
  const ds = m.q('#dedsave'); if (ds) ds.onclick = async () => { await api(`/api/invoices/${id}/deductible`, { method: 'PUT', body: { deductible: m.q('#ded').value } }); toast('Deductible saved'); reopen(); };
  const pf = m.q('#pay');
  if (pf) {
    const pay = pf.querySelector('[name=payer]'), kind = pf.querySelector('[name=kind]'), amt = pf.querySelector('[name=amount]');
    pay.onchange = () => { if (pay.value === 'insurer') { kind.value = 'insurance'; amt.value = Math.max(0, i.insurer_balance).toFixed(2); } else { kind.value = ins ? 'deductible' : 'customer pay'; amt.value = Math.max(0, ins ? i.customer_balance : i.balance).toFixed(2); } };
    pf.onsubmit = async (e) => { e.preventDefault(); const v = formVals(pf); if (!(num(v.amount) > 0)) return toast('Enter an amount', true); await api(`/api/jobs/${i.job_id}/payments`, { method: 'POST', body: v }); toast('Payment recorded'); reopen(); };
  }
  m.qa('[data-delp]').forEach((b) => b.onclick = async () => { if (!confirm('Remove this payment?')) return; await api('/api/payments/' + b.dataset.delp, { method: 'DELETE' }); toast('Payment removed'); reopen(); });
  const v = m.q('#ivoid'); if (v) v.onclick = async () => { if (!confirm(`Void ${i.number}? You can then create a new invoice for this job.`)) return; await api('/api/invoices/' + id, { method: 'PUT', body: { status: 'void' } }); toast('Invoice voided'); m.close(); import('./app.js').then((x) => x.route()); };
}
const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
