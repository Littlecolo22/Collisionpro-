// Customer contact details: one edit panel used by the Customers screen and the estimate's customer block.
import { api, toast, $, esc, icon } from './app.js';

const PREF = [['sms', 'Text'], ['call', 'Call'], ['email', 'Email']];
export const prefName = (p) => (PREF.find((x) => x[0] === p) || [, ''])[1];

// Same rules as the server (src/r_jobs.js normPhone/normEmail), so mistakes show before saving.
export function normPhone(p) {
  const s = String(p ?? '').trim();
  if (!s) return { v: null };
  const main = s.replace(/\s*(x|ext\.?)\s*\d+$/i, '');
  if (/[a-z]/i.test(main)) return { err: 'Use digits only' };
  let d = main.replace(/\D/g, '');
  if (main.startsWith('+') && !main.startsWith('+1')) return d.length >= 8 && d.length <= 15 ? { v: '+' + d } : { err: 'Enter a valid phone number' };
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length !== 10) return { err: 'Enter a 10-digit number, like (555) 123-4567' };
  if (/^[01]/.test(d)) return { err: 'Area codes can\'t start with 0 or 1' };
  return { v: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` };
}
export function normEmail(e) {
  const s = String(e ?? '').trim().toLowerCase();
  if (!s) return { v: null };
  return s.length <= 120 && /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[a-z]{2,}$/.test(s) && !s.includes('..') ? { v: s } : { err: 'Enter a valid email, like name@example.com' };
}
export const telHref = (p) => { const d = String(p || '').replace(/[^\d+]/g, ''); return d ? 'tel:' + d : ''; };

// Small block with the customer's contact details (estimate screen)
export function custBlock(cu, { edit = true } = {}) {
  if (!cu) return `<div class="custblk"><span class="av">${icon('user')}</span><span class="grow mut">No customer on this estimate</span></div>`;
  const bits = [cu.phone ? `<a href="${esc(telHref(cu.phone))}">${esc(cu.phone)}</a>` : '<span class="mut">No phone</span>', cu.email ? `<a href="mailto:${esc(cu.email)}">${esc(cu.email)}</a>` : '<span class="mut">No email</span>'];
  const tags = [cu.contact_pref ? `<span class="tag">Prefers ${esc(prefName(cu.contact_pref).toLowerCase() || cu.contact_pref)}</span>` : '', cu.sms_opt_in === 0 || cu.sms_opt_in === '0' ? '<span class="tag warn">Texts off</span>' : ''].join('');
  return `<div class="custblk" id="custblk"><span class="av">${icon('user')}</span><div class="cbm"><b class="cbn">${esc(cu.name || '—')}</b><div class="cbc sm">${bits.join('<span class="dot">·</span>')}</div>${cu.address ? `<div class="sm mut cba">${esc(cu.address)}</div>` : ''}${tags ? `<div class="cbt">${tags}</div>` : ''}</div>${edit ? `<button class="sm" id="custedit" aria-label="Edit customer contact info">${icon('edit')}Edit</button>` : ''}</div>`;
}

// Opens the edit panel. cu = customer row (or null for a new customer). Resolves with the saved row, or null if cancelled.
export function editCustomer(cu, { title } = {}) {
  const isNew = !cu || !cu.id;
  const c = cu || { contact_pref: 'sms', sms_opt_in: 1 };
  const optIn = !(c.sms_opt_in === 0 || c.sms_opt_in === '0');
  return new Promise((resolve) => {
    const m = document.createElement('div');
    m.className = 'cedm'; m.id = 'cedm';
    m.innerHTML = `<form class="ced" id="ced" novalidate role="dialog" aria-modal="true" aria-labelledby="cedt">
    <div class="cedh"><span class="grab" aria-hidden="true"></span><h3 id="cedt">${esc(title || (isNew ? 'New customer' : 'Edit contact info'))}</h3><button type="button" class="ib" id="cedx" aria-label="Close">${icon('x')}</button></div>
    <div class="cedb">
      <div class="fld"><label for="ce_name">Name *</label><input id="ce_name" name="name" maxlength="120" autocomplete="name" value="${esc(c.name || '')}" required><small class="ferr" data-for="name"></small></div>
      <div class="ced2">
        <div class="fld"><label for="ce_phone">Mobile phone</label><input id="ce_phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(555) 123-4567" value="${esc(c.phone || '')}"><small class="ferr" data-for="phone"></small></div>
        <div class="fld"><label for="ce_email">Email</label><input id="ce_email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="name@example.com" value="${esc(c.email || '')}"><small class="ferr" data-for="email"></small></div>
      </div>
      <div class="fld"><label for="ce_addr">Address</label><textarea id="ce_addr" name="address" rows="2" maxlength="300" autocomplete="street-address" placeholder="Street, city, state, ZIP">${esc(c.address || '')}</textarea></div>
      <div class="fld"><label id="ce_pl">Preferred contact</label><div class="cseg" role="radiogroup" aria-labelledby="ce_pl">${PREF.map(([k, n]) => `<label class="${(c.contact_pref || 'sms') === k ? 'on' : ''}"><input type="radio" name="contact_pref" value="${k}" ${(c.contact_pref || 'sms') === k ? 'checked' : ''}>${n}</label>`).join('')}</div><small class="ferr" data-for="contact_pref"></small></div>
      <label class="ctog"><input type="checkbox" name="sms_opt_in" id="ce_opt" ${optIn ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="grow"><b>Text messages</b><span class="sm mut">OK to text repair updates to this number. Turns off by itself if they reply STOP.</span></span></label>
      <div class="fld"><label for="ce_notes">Notes</label><textarea id="ce_notes" name="notes" rows="3" maxlength="2000" placeholder="Best time to call, who else can pick up the car…">${esc(c.notes || '')}</textarea></div>
      <div class="cerr" id="cerr" role="alert" hidden></div>
    </div>
    <div class="cedf"><span class="csaved" id="csaved" role="status" hidden>${icon('check')}Saved</span><span class="grow"></span><button type="button" id="cedc">Cancel</button><button type="submit" class="pri" id="ceds">${isNew ? 'Add customer' : 'Save'}</button></div>
  </form>`;
    document.body.appendChild(m);
    const f = $('#ced', m);
    const start = JSON.stringify(vals());
    let busy = false, done = false;
    function vals() { const fd = new FormData(f); return { name: fd.get('name'), phone: fd.get('phone'), email: fd.get('email'), address: fd.get('address'), contact_pref: fd.get('contact_pref') || 'sms', sms_opt_in: fd.get('sms_opt_in') ? 1 : 0, notes: fd.get('notes') }; }
    const ferr = (k, msg) => { const e = $(`.ferr[data-for="${k}"]`, m); if (e) e.textContent = msg || ''; const inp = f.elements[k]; if (inp && inp.classList) inp.classList.toggle('bad', !!msg); };
    const end = (v) => { if (done) return; done = true; document.removeEventListener('keydown', key); m.remove(); resolve(v); };
    const cancel = () => { if (busy) return; if (JSON.stringify(vals()) !== start && !confirm('Discard your changes?')) return; end(null); };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); cancel(); } };
    document.addEventListener('keydown', key);
    $('#cedx', m).onclick = cancel; $('#cedc', m).onclick = cancel;
    m.addEventListener('mousedown', (e) => { if (e.target === m) cancel(); });
    $$r(m, '.cseg input').forEach((r) => r.addEventListener('change', () => { $$r(m, '.cseg label').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked)); ferr('contact_pref'); }));
    // Errors clear while typing; on leaving a field it is tidied up, and a mistake shows a moment later so the
    // layout doesn't jump under the finger that is tapping the next control.
    for (const [k, fn] of [['phone', normPhone], ['email', normEmail]]) {
      const el = f.elements[k];
      el.addEventListener('input', () => ferr(k));
      el.addEventListener('blur', () => { const r = fn(el.value); if (r.err) setTimeout(() => { if (!done && document.activeElement !== el && fn(el.value).err) ferr(k, r.err); }, 350); else el.value = r.v || ''; });
    }
    f.elements.name.addEventListener('input', () => ferr('name'));
    f.onsubmit = async (e) => {
      e.preventDefault(); if (busy) return;
      const v = vals(); const err = $('#cerr', m); err.hidden = true;
      const p = normPhone(v.phone), em = normEmail(v.email);
      ferr('name', String(v.name || '').trim() ? '' : 'Enter the customer\'s name'); ferr('phone', p.err); ferr('email', em.err);
      let bad = !String(v.name || '').trim() || p.err || em.err;
      if (!bad && (v.contact_pref === 'sms' || v.contact_pref === 'call') && !p.v && v.contact_pref !== (c.contact_pref || 'sms')) { ferr('contact_pref', `Add a mobile number to ${v.contact_pref === 'sms' ? 'text' : 'call'} them, or pick email`); bad = true; }
      if (!bad && v.contact_pref === 'email' && !em.v && v.contact_pref !== c.contact_pref) { ferr('contact_pref', 'Add an email address, or pick text or call'); bad = true; }
      if (isNew && !bad && v.contact_pref === 'sms' && !p.v) { ferr('contact_pref', em.v ? 'No mobile number yet: pick email, or add a number' : 'Add a mobile number, or pick email'); bad = true; }
      if (bad) { const first = $('.bad', m) || $('.ferr:not(:empty)', m); first?.focus?.(); first?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); return; }
      if (p.v !== undefined) f.elements.phone.value = p.v || ''; if (em.v !== undefined) f.elements.email.value = em.v || '';
      const body = { ...v, name: String(v.name).replace(/\s+/g, ' ').trim(), phone: p.v, email: em.v };
      busy = true; const sb = $('#ceds', m); sb.disabled = true; sb.textContent = 'Saving…';
      try {
        const r = isNew ? await api('/api/customers', { method: 'POST', body, quiet: true }) : await api(`/api/customers/${c.id}`, { method: 'PUT', body, quiet: true });
        const saved = r.customer || { ...c, ...body, id: r.id };
        $('#csaved', m).hidden = false; sb.textContent = isNew ? 'Added' : 'Saved'; toast(isNew ? 'Customer added' : 'Contact info saved');
        setTimeout(() => { busy = false; end(saved); }, 900);
      } catch (x) {
        busy = false; sb.disabled = false; sb.textContent = isNew ? 'Add customer' : 'Save';
        const msg = x.message || 'Could not save';
        if (/phone/i.test(msg)) ferr('phone', msg); else if (/email/i.test(msg) && !/pick/i.test(msg)) ferr('email', msg); else if (/pick/i.test(msg)) ferr('contact_pref', msg); else if (/name/i.test(msg)) ferr('name', msg);
        err.textContent = msg; err.hidden = false;
      }
    };
    setTimeout(() => { if (isNew) f.elements.name.focus(); }, 50);
  });
}
const $$r = (root, sel) => [...root.querySelectorAll(sel)];
