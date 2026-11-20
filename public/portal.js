// Customer portal: /p/<token>. No sign-in; the long random token is the key. Owner can turn it off or replace it.
const token = location.pathname.split('/')[2] || '';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dstr = (s) => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T') + (String(s).length <= 10 ? 'T12:00:00' : (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'))); return isNaN(d) ? s : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };
const dtstr = (s) => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z')); return isNaN(d) ? s : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
function toast(t, err) { const e = document.createElement('div'); e.className = 'toast' + (err ? ' err' : ''); e.textContent = t; document.body.appendChild(e); setTimeout(() => e.remove(), 3200); }
async function api(path, opts = {}) {
  const isForm = opts.body instanceof FormData;
  const r = await fetch(`/api/portal/${encodeURIComponent(token)}${path}`, { method: opts.method || 'GET', headers: opts.body && !isForm ? { 'Content-Type': 'application/json' } : {}, body: opts.body ? (isForm ? opts.body : JSON.stringify(opts.body)) : undefined, credentials: 'omit' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong');
  return d;
}
const OPLAB = { replace: 'Replace', repair: 'Repair', refinish: 'Refinish', blend: 'Blend', r_and_i: 'Remove & install', sublet: 'Sublet', other: '' };

async function load() {
  let d;
  try { d = await api(''); } catch (e) { $('#pm').innerHTML = `<div class="perr"><h1>Link not available</h1><p>${esc(e.message)}</p></div>`; return; }
  document.title = `${d.shop} · Your repair`;
  const veh = d.vehicle ? [d.vehicle.year, d.vehicle.make, d.vehicle.model].filter(Boolean).join(' ') : 'Your vehicle';
  const delivered = d.delivered;
  const head = delivered ? 'Picked up' : d.stage_index >= 0 && d.status !== 'estimate' && d.status !== 'approved' ? d.stage_label : d.approved ? 'Approved, waiting to start' : 'Estimate ready';
  const steps = d.stages.map((s, i) => `<li class="${delivered || i < d.stage_index ? 'done' : i === d.stage_index && d.status !== 'estimate' && d.status !== 'approved' ? 'now' : ''}"><span class="dot">${delivered || i < d.stage_index ? '✓' : ''}</span><span class="t">${esc(s)}</span></li>`).join('');
  const est = d.estimate;
  const sup = (d.open_supplements || []);
  const bal = Number(d.customer_balance) || 0;
  const loc = d.location || {};
  $('#pm').innerHTML = `
  <div class="ph"><div class="logo">${esc((d.shop || 'S').match(/\b\w/g).slice(0, 2).join('').toUpperCase())}</div><div class="grow"><b>${esc(d.shop)}</b><small>${loc.phone ? `<a href="tel:${esc(String(loc.phone).replace(/[^\d+]/g, ''))}">${esc(loc.phone)}</a>` : ''}${loc.address ? ` · ${esc(loc.address)}` : ''}</small></div></div>
  <section class="hero"><div class="sub">Hi ${esc(d.customer_first || 'there')} · ${esc(d.number)}</div><h1>${esc(veh)}</h1><div class="sub">${esc(head)}${d.target_date && !delivered ? ` · expected ${esc(dstr(d.target_date))}` : ''}</div>${bal > 0.005 ? `<span class="pill">Balance ${money(bal)}</span>` : ''}</section>
  <section class="card"><h2>Repair status</h2><ol class="steps">${steps}</ol></section>
  ${d.photos.length ? `<section class="card"><h2>Photos</h2><div class="photos">${d.photos.map((p) => `<button data-ph="${p.id}" aria-label="${esc(p.caption || 'Photo')}"><img loading="lazy" src="/api/portal/${encodeURIComponent(token)}/file/${p.id}" alt="${esc(p.caption || 'Repair photo')}"></button>`).join('')}</div></section>` : ''}
  <section class="card" id="est"><h2>Estimate</h2>
    ${est.lines.length ? `<div class="lines">${est.lines.map((l) => `<div class="ln"><span class="d">${esc(l.description || '')}<small>${esc([OPLAB[l.operation] ?? l.operation, l.supplement_no ? 'Supplement ' + l.supplement_no : ''].filter(Boolean).join(' · '))}</small></span><span class="a">${Number(l.amount) ? money(l.amount) : ''}</span></div>`).join('')}</div>` : '<p class="mut">The shop is still writing your estimate.</p>'}
    <div style="margin-top:10px">${est.totals.insurer_pays ? `<div class="tot"><span>Insurance pays</span><b>${money(est.totals.insurer_pays)}</b></div>` : ''}<div class="tot"><span>Your part</span><b>${money(est.totals.customer_pays)}</b></div><div class="tot big"><span>Estimate total</span><b>${money(est.totals.total)}</b></div></div>
    <div class="row" style="margin-top:14px"><a class="btn" href="/api/portal/${encodeURIComponent(token)}/pdf" target="_blank" rel="noopener">View estimate PDF</a></div>
    <div id="appr" style="margin-top:14px"></div>
  </section>
  ${d.invoices.length ? `<section class="card"><h2>Invoice and balance</h2>${d.invoices.map((i) => `<div class="tot"><span>${esc(i.number)} <span class="mut sm">${esc(dstr(i.created))}</span></span><b>${money(i.total)}</b></div>${Number(i.insurer_portion) ? `<div class="tot sm mut"><span>Insurance portion</span><span>${money(i.insurer_portion)}</span></div>` : ''}<div class="tot sm mut"><span>Your portion${Number(i.deductible) ? ' (incl. deductible ' + money(i.deductible) + ')' : ''}</span><span>${money(i.customer_portion ?? i.total)}</span></div>`).join('')}
    ${d.payments.length ? `<div class="tot" style="margin-top:6px"><span>You've paid</span><b class="ok">${money(d.customer_paid)}</b></div>` : ''}
    <div class="tot big"><span>Balance due</span><b class="${bal > 0.005 ? '' : 'ok'}">${bal > 0.005 ? money(bal) : 'Paid in full'}</b></div>
    <div class="row" style="margin-top:14px"><a class="btn" href="/api/portal/${encodeURIComponent(token)}/pdf?kind=invoice" target="_blank" rel="noopener">View invoice PDF</a>${loc.phone && bal > 0.005 ? `<a class="btn pri" href="tel:${esc(String(loc.phone).replace(/[^\d+]/g, ''))}">Call to pay</a>` : ''}</div></section>` : ''}
  <section class="card"><h2>Message the shop</h2><div class="msgs" id="pmsgs">${d.messages.slice().reverse().map((m) => {
    const match = String(m.body || '').match(/^(.*?)\n?\[Attachment:(\d+):([^\]]+)\]\s*$/s);
    const text = esc(match ? match[1].trim() : m.body);
    const attachment = match ? `<a class="btn" href="/api/portal/${encodeURIComponent(token)}/file/${match[2]}" target="_blank" rel="noopener">📎 ${esc(decodeURIComponent(match[3]))}</a>` : '';
    return `<div class="bb ${m.direction === 'in' ? 'in' : 'out'}">${text}${attachment ? `<div style="margin-top:8px">${attachment}</div>` : ''}<small>${esc(dtstr(m.created))}</small></div>`;
  }).join('') || '<p class="mut sm" style="margin:0">No messages yet.</p>'}</div>
    <label for="pmt">Your message</label><textarea id="pmt" rows="3" maxlength="1000"></textarea><label for="pma">Attach a file (optional)</label><input id="pma" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/webm,video/quicktime,application/pdf,text/plain,text/csv,text/xml,application/xml"><div class="row" style="margin-top:10px"><button class="pri" id="pms">Send</button></div></section>
  ${delivered && !d.reviewed ? `<section class="card" id="review"><h2>How did we do?</h2><div class="stars" id="stars">${[1, 2, 3, 4, 5].map((n) => `<button data-s="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('')}</div><label for="rvc">Comments (optional)</label><textarea id="rvc" rows="2" maxlength="1000"></textarea><div class="row" style="margin-top:10px"><button class="pri" id="rvs" disabled>Send rating</button></div></section>` : ''}
  <p class="foot">This page is private to you. Please don't share the link.</p>`;
  approvalBox(d);
  const pm = $('#pmsgs'); pm.scrollTop = pm.scrollHeight;
  document.querySelectorAll('[data-ph]').forEach((b) => b.onclick = () => { const lb = document.createElement('div'); lb.className = 'lb'; lb.innerHTML = `<img src="/api/portal/${encodeURIComponent(token)}/file/${b.dataset.ph}" alt="Repair photo">`; lb.onclick = () => lb.remove(); document.body.appendChild(lb); });
  $('#pms').onclick = async () => {
    const body = $('#pmt').value.trim();
    const file = $('#pma').files[0];
    if (!body && !file) return toast('Type a message or attach a file', true);
    const fd = new FormData();
    fd.append('body', body);
    if (file) fd.append('file', file);
    try { await api('/message', { method: 'POST', body: fd }); toast('Sent to the shop'); load(); } catch (e) { toast(e.message, true); }
  };
  const st = $('#stars'); if (st) { let rating = 0; st.querySelectorAll('button').forEach((b) => b.onclick = () => { rating = +b.dataset.s; st.querySelectorAll('button').forEach((x) => x.classList.toggle('on', +x.dataset.s <= rating)); $('#rvs').disabled = false; });
    $('#rvs').onclick = async () => { try { await api('/review', { method: 'POST', body: { rating, comment: $('#rvc').value } }); $('#review').innerHTML = `<h2>Thank you!</h2>${rating >= 4 && d.review_link ? `<p>Would you share that on Google? It really helps a small shop.</p><a class="btn pri" href="${esc(d.review_link)}" target="_blank" rel="noopener">Leave a review</a>` : '<p class="mut">Your feedback goes straight to the owner.</p>'}`; } catch (e) { toast(e.message, true); } }; }
  if (location.hash === '#review' && $('#review')) $('#review').scrollIntoView();
}

function approvalBox(d) {
  const el = $('#appr'); if (!el) return;
  const sup = (d.open_supplements || [])[0];
  const signed = d.approvals.find((a) => a.type === 'estimate');
  if (!sup && (signed || !d.needs_approval || d.approved)) {
    el.innerHTML = signed ? `<div class="ok-box">✓ Approved by ${esc(signed.name)} on ${esc(dstr(signed.signed_at))}${signed.amount ? ` (${money(signed.amount)})` : ''}</div>` : d.approved ? '<div class="ok-box">✓ Approved</div>' : '';
    return;
  }
  if (!d.estimate.lines.length && !sup) { el.innerHTML = ''; return; }
  const what = sup ? `supplement ${sup.number} (${money(sup.amount)})${sup.reason ? ': ' + esc(sup.reason) : ''}` : `this estimate (${money(d.estimate.totals.total)})`;
  el.innerHTML = `<div class="warn-box"><b>Your approval is needed</b><p class="sm" style="margin:6px 0 0">Sign below to approve ${what}. By signing you authorize ${esc(d.shop)} to do the repairs listed.</p>
    <label for="an">Your full name</label><input id="an" autocomplete="name">
    <label>Sign here</label><canvas class="sig" id="sig"></canvas>
    <div class="row" style="margin-top:10px"><button id="sclr">Clear</button><button class="pri" id="sok">Approve and sign</button></div></div>`;
  const cv = $('#sig'); const ctx = cv.getContext('2d'); let drew = false, down = false;
  const size = () => { const r = cv.getBoundingClientRect(); const k = devicePixelRatio || 1; cv.width = r.width * k; cv.height = r.height * k; ctx.setTransform(k, 0, 0, k, 0, 0); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111'; drew = false; };
  size();
  const pt = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.onpointerdown = (e) => { down = true; cv.setPointerCapture(e.pointerId); const [x, y] = pt(e); ctx.beginPath(); ctx.moveTo(x, y); };
  cv.onpointermove = (e) => { if (!down) return; const [x, y] = pt(e); ctx.lineTo(x, y); ctx.stroke(); drew = true; };
  cv.onpointerup = cv.onpointercancel = () => { down = false; };
  $('#sclr').onclick = () => { ctx.clearRect(0, 0, cv.width, cv.height); drew = false; };
  $('#sok').onclick = async (e) => {
    const name = $('#an').value.trim();
    if (name.length < 2) return toast('Type your full name', true);
    if (!drew) return toast('Please sign in the box', true);
    e.target.disabled = true;
    try { await api('/approve', { method: 'POST', body: { name, signature: cv.toDataURL('image/png'), type: sup ? 'supplement' : 'estimate', supplement: sup?.number } }); toast('Thank you, approved'); load(); }
    catch (err) { toast(err.message, true); e.target.disabled = false; }
  };
}
load();
