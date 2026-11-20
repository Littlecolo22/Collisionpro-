// Owner screens, part 2: messages (+ SMS gateway settings), customer portal, schedule, parts,
// reports, insurers, paint, compliance.
import { S, api, toast, view, $, $$, esc, money, shell, icon, onLeave } from './app.js';
import { vLabel, dstr, dtstr, todayStr, dlg, formVals, guard, kpis } from './ops.js';

const reload = () => import('./app.js').then((m) => m.route());
const e164 = (p) => { const s = String(p || '').trim(); const d = s.replace(/\D/g, ''); if (!d) return ''; if (s.startsWith('+')) return '+' + d; if (d.length === 10) return '+1' + d; return '+' + d; };
const fmtPhone = (p) => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p || ''); };
export function smsLink(phone, body) { return `sms:${encodeURIComponent(e164(phone))}?&body=${encodeURIComponent(body || '')}`; }

// ---------- 3. Messages ----------
const MST = { phone_queue: ['Waiting for your phone', 'warn'], phone_sending: ['Sending from your phone', ''], pending: ['Sending', ''], processing: ['Sending', ''], sent: ['Sent', 'acc'], delivered: ['Delivered', 'ok'], failed: ['Not sent', 'bad'], sent_from_phone: ['Sent from your phone', ''], received: ['', ''], posted: ['Posted to portal', ''], not_configured: ['Not sent', 'warn'] };
const mstat = (s) => MST[s] || (String(s || '').startsWith('queued') ? [String(s).includes('(') ? 'Not sent (' + String(s).replace(/^queued \(|\)$/g, '') + ')' : 'Not sent', 'warn'] : String(s || '').startsWith('failed') ? ['Not sent', 'bad'] : [s || '', '']);
const QUICK = [
  ['Estimate ready', (f, v) => `Hi ${f}, your estimate for the ${v} is ready. Call or text us with any questions.`],
  ['Car is ready', (f, v) => `Hi ${f}, good news: your ${v} is ready for pickup.`],
  ['Parts update', (f, v) => `Hi ${f}, quick update on your ${v}: we're waiting on parts. We'll text you as soon as they arrive.`],
  ['Need approval', (f, v) => `Hi ${f}, we found additional damage on your ${v} and need your OK before we continue. Please call us.`],
];

view('messages', async (jobId) => {
  if (!guard('Messages')) return;
  const d = await api('/api/messages/threads');
  const g = d.gateway;
  const unread = d.threads.reduce((a, t) => a + (t.unread || 0), 0);
  const withMsgs = d.threads.filter((t) => t.last_at);
  const tl = (t) => `<button class="mt ${String(t.job_id) === String(jobId) ? 'on' : ''}" data-j="${t.job_id}" data-s="${esc(`${t.customer_name || ''} ${t.number} ${vLabel(t)} ${t.phone || ''}`.toLowerCase())}">
      <span class="av">${esc(((t.customer_name || '?').match(/\b\w/g) || ['?']).slice(0, 2).join('').toUpperCase())}</span>
      <span class="grow"><span class="m1"><b>${esc(t.customer_name || 'No customer')}</b><small>${t.last_at ? esc(dstr(t.last_at)) : ''}</small></span>
      <span class="m2">${esc(vLabel(t))} · ${esc(t.number)}</span>
      <span class="m3 ${t.unread ? 'un' : ''}">${t.last_at ? `${t.last_dir === 'in' ? '' : 'You: '}${esc(String(t.last_body || '').slice(0, 90))}` : '<i>No messages yet</i>'}</span></span>
      ${t.unread ? `<span class="ubadge">${t.unread}</span>` : ''}</button>`;
  const qn = (g.phone_queue?.waiting || 0) + (g.phone_queue?.sending || 0);
  const banner = g.method === 'device'
    ? (!g.device ? `<div class="note warn">Texts are set to go out from your phone, but no phone is linked yet. Open <a href="#/settings">Settings</a> › Texting in the R&R Auto Express app on your phone.</div>`
      : qn && !g.device.online ? `<div class="note warn">${qn} text${qn === 1 ? ' is' : 's are'} waiting for ${esc(g.device.name || 'your phone')}. Open the R&R Auto Express app on it, or turn on "Send texts when the app is closed" in <a href="#/settings">Settings</a>.</div>` : '')
    : g.method === 'manual' ? `<div class="note">Texts open in your messaging app with the message filled in. Change this in <a href="#/settings">Settings</a> › Texting.</div>`
    : g.configured ? (g.last_error ? `<div class="note warn">${esc(g.last_error.replace(/^\S+ \S+ /, ''))} · <a href="#/settings">Settings</a></div>` : '')
    : `<div class="note warn">Texting isn't set up yet. Pick how to send texts in <a href="#/settings">Settings</a> › Texting. Until then, "Send from my phone" opens your phone's texting app.</div>`;
  shell('Messages', `${withMsgs.length} conversation${withMsgs.length === 1 ? '' : 's'}${unread ? ` · <b class="acc">${unread} unread</b>` : ''}`,
    `<div class="page msgs ${jobId ? 'has-th' : ''}">
      <div class="mlist">${banner}<label class="search">${icon('search')}<input id="mq" type="search" placeholder="Search name, RO, vehicle, phone" aria-label="Search conversations" autocomplete="off"></label>
      ${d.unmatched.length ? `<div class="card um"><h3>Texts from unknown numbers</h3>${d.unmatched.map((u) => `<div class="it"><span class="grow"><b>${esc(fmtPhone(u.from_addr))}</b> <small class="mut">${esc(dtstr(u.created))}</small><span class="mut sm" style="display:block">${esc(u.body)}</span></span><button class="sm" data-att="${u.id}">Add to job</button><button class="ib" data-umdel="${u.id}" aria-label="Delete">${icon('trash')}</button></div>`).join('')}</div>` : ''}
      <div class="mts" id="mts">${d.threads.length ? d.threads.map(tl).join('') : `<div class="card empty"><span class="eic">${icon('chat')}</span><h2>No jobs yet</h2><p class="mut">Each estimate gets its own text conversation with the customer.</p></div>`}</div></div>
      <div class="mthread" id="mth">${jobId ? '<div class="mut" style="padding:20px">Loading…</div>' : `<div class="mpick"><span class="eic">${icon('chat')}</span><p class="mut">Pick a conversation</p></div>`}</div>
    </div>`);
  $('#mq').oninput = (e) => { const q = e.target.value.trim().toLowerCase(); $$('.mt').forEach((b) => { b.style.display = !q || b.dataset.s.includes(q) ? '' : 'none'; }); };
  $$('.mt').forEach((b) => b.onclick = () => { location.hash = '#/messages/' + b.dataset.j; });
  $$('[data-umdel]').forEach((b) => b.onclick = async () => { if (!confirm('Delete this text?')) return; await api('/api/messages/' + b.dataset.umdel, { method: 'DELETE' }); reload(); });
  $$('[data-att]').forEach((b) => b.onclick = () => {
    const m = dlg('Add text to a job', `<label class="search">${icon('search')}<input id="aq" type="search" placeholder="Search" autocomplete="off"></label><div class="list olist" style="max-height:50vh;overflow:auto">${d.threads.map((t) => `<div class="it" data-j="${t.job_id}" data-s="${esc(`${t.customer_name || ''} ${t.number} ${vLabel(t)}`.toLowerCase())}"><span class="grow"><b>${esc(t.customer_name || 'No customer')}</b><span class="mut sm" style="display:block">${esc(vLabel(t))} · ${esc(t.number)}</span></span></div>`).join('')}</div>`);
    m.q('#aq').oninput = (e) => { const q = e.target.value.toLowerCase(); m.qa('.it').forEach((x) => { x.style.display = x.dataset.s.includes(q) ? '' : 'none'; }); };
    m.qa('.it').forEach((x) => x.onclick = async () => { await api(`/api/messages/${b.dataset.att}/attach`, { method: 'POST', body: { job_id: Number(x.dataset.j) } }); m.close(); location.hash = '#/messages/' + x.dataset.j; });
  });
  if (jobId) await openThread(jobId);
});

async function openThread(jobId) {
  const r = await api('/api/messages/job/' + jobId);
  const j = r.job; const g = r.gateway; const first = (j.customer_name || '').split(' ')[0] || 'there'; const v = vLabel(j);
  const canText = !!j.phone && !!j.sms_opt_in;
  const bubble = (m) => {
    const [sl, sc] = mstat(m.status);
    return `<div class="bb ${m.direction === 'in' ? 'in' : 'out'}"><div class="bt">${esc(m.body)}</div><div class="bm">${esc(dtstr(m.created))}${m.auto ? ' · automatic' : ''}${m.channel === 'portal' ? ' · portal' : m.channel === 'email' ? ' · email' : ''}${m.direction === 'out' && sl ? ` · <span class="st ${sc}">${esc(sl)}</span>` : ''}${m.error && m.direction === 'out' ? `<span class="er">${esc(m.error)}</span>` : ''}</div></div>`;
  };
  const el = $('#mth'); if (!el) return;
  el.innerHTML = `<div class="mh"><a class="ib back" href="#/messages" aria-label="Back to conversations">${icon('arrow')}</a><div class="grow"><b>${esc(j.customer_name || 'No customer')}</b><span class="mut sm">${esc(v)} · ${esc(j.number)}${j.phone ? ' · ' + esc(fmtPhone(j.phone)) : ''}</span></div><a class="btn sm" href="#/job/${j.id}">Estimate</a></div>
    <div class="mbody" id="mbody">${r.messages.length ? r.messages.map(bubble).join('') : '<p class="mut" style="text-align:center;margin:30px 0">No messages yet. Say hi below.</p>'}</div>
    ${!j.phone ? '<div class="note warn">This customer has no phone number. Add one on the estimate to text them.</div>' : !j.sms_opt_in ? '<div class="note warn">This customer replied STOP, so texts are off. If they text START, texts turn back on.</div>' : ''}
    <div class="mcomp"><div class="qr">${QUICK.map(([n], i) => `<button class="chip" data-q="${i}" ${canText ? '' : 'disabled'}>${esc(n)}</button>`).join('')}</div>
    <div class="mrow"><textarea id="mtx" rows="2" maxlength="1500" placeholder="Text ${esc(first)}…" aria-label="Message" ${canText ? '' : 'disabled'}></textarea>
    <div class="mbtns">${g.can_send ? `<button class="pri" id="msend" ${canText ? '' : 'disabled'}>${icon('send')}Send</button>` : ''}<button class="${g.can_send ? 'sm' : 'pri'}" id="mphone" ${canText ? '' : 'disabled'}>${g.can_send ? (g.method === 'device' ? 'Messaging app' : 'From my phone') : `${icon('send')}Send from my phone`}</button></div></div></div>`;
  const mn = $('#main'); if (mn) mn.scrollTop = mn.scrollHeight;
  $$('[data-q]').forEach((b) => b.onclick = () => { const t = $('#mtx'); t.value = QUICK[b.dataset.q][1](first, v); t.focus(); });
  const viaPhone = async (body) => {
    await api('/api/messages/job/' + j.id, { method: 'POST', body: { body, via: 'phone' } });
    location.href = smsLink(j.phone, body);
    setTimeout(() => openThread(j.id), 600);
  };
  const s = $('#msend'); if (s) s.onclick = async () => {
    const body = $('#mtx').value.trim(); if (!body) return toast('Type a message first', true);
    s.disabled = true;
    try {
      const x = await api('/api/messages/job/' + j.id, { method: 'POST', body: { body } });
      if (x.status === 'failed' || String(x.status).startsWith('failed') || String(x.status).startsWith('queued')) {
        offerPhone(j.phone, body, x.error || (String(x.status).startsWith('failed') ? String(x.status).replace(/^failed \(|\)$/g, '') : ''), () => openThread(j.id), true, x.id);
      } else if (x.status === 'phone_queue') { toast('Text queued on your phone'); nativeKick(); setTimeout(() => { if (location.hash === '#/messages/' + j.id) openThread(j.id); }, 6000); }
      else toast('Text sent');
      openThread(j.id);
    } finally { s.disabled = false; }
  };
  $('#mphone').onclick = () => { const body = $('#mtx').value.trim(); if (!body) return toast('Type a message first', true); viaPhone(body); };
}

// Shown when the gateway could not send: one tap opens the phone's texting app with the message filled in.
export function offerPhone(phone, body, why, after, alreadyLogged = false, msgId = null) {
  const m = dlg('Text not sent', `<p style="margin-top:0">${why ? `It didn't go out: <b>${esc(why)}</b>.` : 'Texts aren\'t set to go out on their own.'}</p><p class="mut">Send it from your own phone instead? Your texting app opens with the message filled in.</p>
    <div class="bb out" style="margin:10px 0"><div class="bt">${esc(body)}</div></div><div class="row"><button class="pri" id="op">${icon('send')}Send from my phone</button><button id="oc">Not now</button></div>`);
  m.q('#oc').onclick = () => m.close();
  m.q('#op').onclick = () => { m.close(); if (msgId) api(`/api/messages/${msgId}/sent-from-phone`, { method: 'POST', quiet: true }).catch(() => null); location.href = smsLink(phone, body); if (after) setTimeout(after, 600); };
  return m;
}

// ---------- Native texting bridge (R&R Auto Express Android app, window.RRAndroid) ----------
export const RRA = () => (window.RRAndroid && typeof window.RRAndroid.smsStatus === 'function' ? window.RRAndroid : null);
export function nativeSms() { const a = RRA(); if (!a) return null; try { return JSON.parse(a.smsStatus()); } catch { return null; } }
export function nativeKick() { try { const a = RRA(); if (a) a.syncNow(); } catch { /* old app */ } }
const ago = (iso) => { if (!iso) return 'never'; const s = Math.max(0, (Date.now() - new Date(String(iso).replace(' ', 'T') + 'Z').getTime()) / 1000); return s < 90 ? 'just now' : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : dtstr(iso); };
const METHODS = [
  ['device', 'This phone (R&R Auto Express app)', 'Texts go out from this phone\'s own number, straight from this app. Replies come back into Messages.'],
  ['gateway', 'SMS Gateway app', 'Texts go out through the free SMS Gateway for Android app in Cloud server mode.'],
  ['manual', 'Open my messaging app', 'Nothing is sent on its own. Each text opens your messaging app with the message filled in, and you tap Send.'],
];

// ---------- Settings card: Texting (owner only; the gateway password never comes back from the server) ----------
export async function smsSettings(el) {
  if (!el) return;
  const g = await api('/api/sms/settings', { quiet: true }).catch(() => null);
  if (!g) { el.remove(); return; }
  const n = nativeSms();
  const inApp = !!n;
  const dev = g.device;
  const thisPhone = !!(n && dev && n.linked && n.hint === dev.hint);
  const sel = g.method;
  const t = g.test;
  const busy = t && ['phone_queue', 'phone_sending', 'pending', 'processing'].includes(t.status);
  const tl = t ? (() => { const [sl, sc] = mstat(t.status); return `<span class="tag ${sc}">${esc(sl || t.status)}</span> to ${esc(fmtPhone(t.to))} · ${esc(dtstr(t.at))}${t.error ? ` <span class="tag bad">${esc(t.error)}</span>` : ''}`; })() : '<span class="mut">No test sent yet</span>';
  const opts = METHODS.filter(([k]) => k !== 'device' || inApp);
  const yes = (ok, a, b) => `<span class="tag ${ok ? 'ok' : 'warn'}">${ok ? a : b}</span>`;
  const queued = (g.phone_queue?.waiting || 0) + (g.phone_queue?.sending || 0);

  // Option (a) pane: only inside the Android app
  let devPane = '';
  if (inApp) {
    const needAllow = !n.send || !n.receive;
    const restricted = needAllow && n.blocked;
    devPane = `<div class="smpane" id="smp-device" ${sel === 'device' ? '' : 'hidden'}>
      ${!n.telephony ? '<div class="note bad">This device can\'t send texts (no phone service). Pick another option.</div>' : ''}
      <div class="smperm">
        <div class="it"><span class="grow"><b>Send texts</b><span class="mut sm">Android permission: SMS</span></span>${yes(n.send, 'Allowed', 'Not allowed')}</div>
        <div class="it"><span class="grow"><b>Get replies</b><span class="mut sm">Customer replies land in Messages</span></span>${yes(n.receive, 'Allowed', 'Not allowed')}</div>
        ${n.notifNeeded ? `<div class="it"><span class="grow"><b>Notifications</b><span class="mut sm">For the small "Texting on" notice</span></span>${yes(n.notif, 'Allowed', 'Off')}</div>` : ''}
        <div class="it"><span class="grow"><b>Shop texting phone</b><span class="mut sm">${thisPhone ? 'This phone sends the shop\'s texts' : dev ? `Linked now: ${esc(dev.name || 'another phone')}` : 'No phone linked yet'}</span></span>${yes(thisPhone, 'This phone', dev ? 'Other phone' : 'Not linked')}</div>
      </div>
      ${needAllow ? `<div class="row smbtns"><button class="pri" id="smallow">Allow texting</button><button class="sm" id="smappset">Open app settings</button></div>` : ''}
      ${restricted ? `<div class="note warn smhelp"><b>Android blocked the request.</b> Because this app wasn't installed from the Play Store, Android may treat SMS as a restricted setting. To turn it on:
        <ol><li>Tap <b>Open app settings</b> above (or long-press the app icon › App info).</li><li>Tap the <b>⋮</b> menu at the top right › <b>Allow restricted settings</b>, and confirm with your PIN or fingerprint.</li><li>Tap <b>Permissions</b> › <b>SMS</b> › <b>Allow</b>.</li><li>Come back here. This card updates on its own.</li></ol>
        If you don't see "Allow restricted settings", go straight to Permissions › SMS › Allow.</div>` : ''}
      ${!thisPhone && n.send ? `<div class="row smbtns"><button class="pri" id="smlink">Use this phone for texting</button></div>` : ''}
      ${thisPhone ? `<label class="smchk"><input type="checkbox" id="smbg" ${n.bg ? 'checked' : ''}> <span><b>Send texts when the app is closed</b><span class="mut sm">Keeps a small "Texting on" notification so Android doesn't stop it. Off: texts only go out while the app is open.</span></span></label>
        ${n.bg && !n.batteryOk ? `<div class="note warn">Android may pause texting to save battery. <button class="sm" id="smbatt">Let it run in background</button></div>` : ''}
        <p class="sm mut" style="margin:8px 0 0">${queued ? `<b>${queued} text${queued === 1 ? '' : 's'}</b> waiting to go out. ` : 'Nothing waiting to go out. '}Last check-in: ${esc(ago(dev.last_seen))}.${dev.last_error ? ` <span class="tag bad">${esc(String(dev.last_error).replace(/^\S+ \S+ /, ''))}</span>` : ''}</p>
        <div class="row smbtns"><button class="sm" id="smunlink">Stop using this phone</button></div>` : ''}
      <p class="sm mut" style="margin:10px 0 0">Texts use your phone plan, at this phone's number. This app isn't on the Play Store, so Google's rule that only a default texting app may use SMS doesn't apply.</p>
    </div>`;
  }
  const devElsewhere = !inApp && sel === 'device';
  el.innerHTML = `<h3>Texting</h3>
    <p class="sm mut" style="margin-top:0">How to send texts to customers</p>
    ${devElsewhere ? `<div class="note ${dev ? (dev.online ? 'ok' : '') : 'warn'}">Texts go out from <b>${esc(dev?.name || 'your phone')}</b> with the R&R Auto Express app${dev ? ` (last check-in ${esc(ago(dev.last_seen))})` : ', but no phone is linked yet'}.${queued ? ` ${queued} waiting.` : ''} To change it, open Settings › Texting in the app on that phone.</div>` : ''}
    <div class="smopts" role="radiogroup" aria-label="How to send texts">${opts.map(([k, l, d]) => `<label class="smopt ${sel === k ? 'on' : ''}"><input type="radio" name="smm" value="${k}" ${sel === k ? 'checked' : ''}><span><b>${esc(l)}</b><span class="mut sm">${esc(d)}</span></span></label>`).join('')}</div>
    ${devPane}
    <div class="smpane" id="smp-gateway" ${sel === 'gateway' ? '' : 'hidden'}>
    <p class="sm mut">In the SMS Gateway app, turn on <b>Cloud server</b> and copy the username and password it shows. The password is stored encrypted on the server and never shown again. That app needs its own SMS permission on the phone.</p>
    <div class="gst"><span class="tag ${g.configured ? 'ok' : 'warn'}">${g.configured ? 'Connected' : 'Not set up'}</span>${g.configured ? `<span class="tag ${g.webhook_registered ? 'ok' : 'warn'}">${g.webhook_registered ? 'Incoming texts on' : 'Incoming texts off'}</span><span class="tag ${g.signing_key_set ? 'ok' : ''}">${g.signing_key_set ? 'Signature check on' : 'No signing key'}</span>` : ''}</div>
    ${g.last_error ? `<div class="note warn">${esc(g.last_error.replace(/^\S+ \S+ /, ''))}</div>` : ''}
    <div class="grid2"><div><label for="gu">Gateway username</label><input id="gu" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(g.username)}"></div>
    <div><label for="gp">Gateway password</label><input id="gp" type="password" autocomplete="new-password" placeholder="${g.has_password ? 'Saved (type to replace)' : ''}"></div>
    <div><label for="gk">Webhook signing key (optional)</label><input id="gk" type="password" autocomplete="off" placeholder="${g.signing_key_set ? 'Saved (type to replace)' : 'App: Settings › Webhooks › Signing key'}"></div></div>
    <div class="row" style="margin-top:10px"><button class="pri" id="gsave">Save</button>${g.configured ? '<button id="gclr" class="sm">Disconnect</button>' : ''}</div>
    </div>
    <div class="smpane" id="smp-manual" ${sel === 'manual' ? '' : 'hidden'}><p class="sm mut">When a text is ready, tap <b>Send from my phone</b>. Your messaging app opens with the customer's number and message filled in. Replies go to your messaging app, not to Messages here.</p></div>
    ${sel !== 'manual' ? `<div class="smpace"><label for="gpace">Seconds between texts</label><div class="row"><input id="gpace" inputmode="numeric" value="${esc(g.pace)}" style="max-width:110px"><button class="sm" id="gpsave">Save</button><span class="sm mut grow">Spacing texts out keeps your carrier from flagging them as spam.</span></div></div>` : ''}
    <div class="gtest"><label for="gto">Send test text to</label><div class="row"><input id="gto" type="tel" inputmode="tel" class="grow" placeholder="Your cell number" value="${esc(t?.to ? fmtPhone(t.to) : '')}"><button id="gtest" ${(sel === 'gateway' && !g.configured) || (sel === 'device' && !dev) ? 'disabled' : ''}>Send test text</button></div>
    ${sel !== 'manual' ? `<div class="sm" id="gts" style="margin-top:8px">Test status: ${tl} ${t?.ext_id || t?.msg_id ? '<button class="sm ghost" id="gref">Check again</button>' : ''}</div>` : ''}</div>`;
  const again = () => smsSettings(el);
  const q = (x) => el.querySelector(x);
  const putMethod = async (m) => { await api('/api/sms/settings', { method: 'PUT', body: { method: m } }); };
  const link = async () => {
    const info = n || {};
    const r = await api('/api/sms/device/link', { method: 'POST', body: { name: info.name, model: info.model, android: info.android, app_version: info.appVersion, perm: { send: info.send, receive: info.receive, notif: info.notif }, bg: info.bg, use: true } });
    RRA().link(r.token, r.hint, location.origin);
    toast('This phone now sends the shop\'s texts');
  };
  el.querySelectorAll('input[name=smm]').forEach((r) => r.onchange = async () => {
    const m = r.value;
    el.querySelectorAll('.smopt').forEach((o) => o.classList.toggle('on', o.querySelector('input').checked));
    try {
      if (m === 'device') {
        const s2 = nativeSms() || {};
        if (s2.send && !thisPhone) await link(); else await putMethod('device');
        if (!s2.send || !s2.receive) RRA().requestSmsPermission();
      } else { await putMethod(m); toast(m === 'gateway' ? 'Texts now go through the SMS Gateway app' : 'Texts now open in your messaging app'); }
    } catch { /* toast shown */ }
    again();
  });
  const on = (id, fn) => { const b = q(id); if (b) b.onclick = fn; };
  on('#smallow', () => RRA().requestSmsPermission());
  on('#smappset', () => RRA().openAppSettings());
  on('#smbatt', () => RRA().openBatterySettings());
  on('#smlink', async () => { try { await link(); } catch { /* toast shown */ } again(); });
  on('#smunlink', async () => { if (!confirm('Stop sending texts from this phone? Texts will wait until you link a phone or pick another option.')) return; await api('/api/sms/settings', { method: 'PUT', body: { forget_device: 1 } }); RRA().unlink(); toast('This phone no longer sends texts'); again(); });
  const bg = q('#smbg'); if (bg) bg.onchange = () => { RRA().setBackground(bg.checked); setTimeout(again, 400); };
  on('#gsave', async () => {
    const body = { username: q('#gu').value.trim() };
    const p = q('#gp').value; if (p) body.password = p;
    const k = q('#gk').value.trim(); if (k) body.signing_key = k;
    if (!body.username) return toast('Enter the gateway username', true);
    if (!p && !g.has_password) return toast('Enter the gateway password', true);
    const r = await api('/api/sms/settings', { method: 'PUT', body });
    toast(r.last_error ? 'Saved, with a problem (see Settings)' : 'Texting settings saved'); again();
  });
  on('#gpsave', async () => { await api('/api/sms/settings', { method: 'PUT', body: { pace: q('#gpace').value } }); toast('Saved'); });
  on('#gclr', async () => { if (!confirm('Disconnect the SMS gateway? Texts will stop going out through it.')) return; await api('/api/sms/settings', { method: 'PUT', body: { clear: 1 } }); toast('Disconnected'); again(); });
  on('#gtest', async (e) => {
    const to = q('#gto').value.trim(); if (to.replace(/\D/g, '').length < 10) return toast('Enter your cell number', true);
    if (sel === 'manual') { location.href = smsLink(to, `Test text from ${S.settings?.shop_name || 'R&R Auto Express'}.`); return; }
    e.target.disabled = true;
    try { await api('/api/sms/test', { method: 'POST', body: { to } }); toast(sel === 'device' ? 'Test text handed to this phone' : 'Test text sent to the gateway'); nativeKick(); } catch { /* toast shown */ }
    again();
  });
  on('#gref', async () => { await api('/api/sms/test/refresh', { method: 'POST' }); again(); });
  // Live updates: permission prompt results, coming back from Android settings, and the test text's progress
  if (el._rrn) window.removeEventListener('rrnative', el._rrn);
  el._rrn = async (ev) => {
    if (!document.body.contains(el)) { window.removeEventListener('rrnative', el._rrn); return; }
    const ty = ev.detail?.type;
    if (ty === 'perm' && ev.detail.send) {
      // Just allowed: if "This phone" is the chosen way and this phone isn't the linked one yet, link it now
      const g2 = await api('/api/sms/settings', { quiet: true }).catch(() => null);
      const n2 = nativeSms();
      if (g2 && n2 && g2.method === 'device' && !(n2.linked && g2.device && g2.device.hint === n2.hint)) { try { await link(); } catch { /* toast shown */ } }
    }
    if (ty === 'perm' || ty === 'resume' || ty === 'linkchange') again();
  };
  window.addEventListener('rrnative', el._rrn);
  { const h = el._rrn; onLeave(() => { window.removeEventListener('rrnative', h); clearTimeout(el._rrt); }); }
  clearTimeout(el._rrt);
  if (busy && sel === 'device' && (Date.now() - new Date(String(t.at).replace(' ', 'T') + 'Z').getTime()) < 180000) el._rrt = setTimeout(async () => { if (!document.body.contains(el)) return; await api('/api/sms/test/refresh', { method: 'POST', quiet: true }).catch(() => null); again(); }, 3000);
}

// ---------- 4. Customer portal (owner) ----------
const STG = { intake: 'Check-in', teardown: 'Teardown', parts_hold: 'Waiting on parts', body: 'Body', frame: 'Frame', paint: 'Paint', reassembly: 'Reassembly', mechanical: 'Mechanical', adas: 'ADAS', detail: 'Detail', qc: 'Quality check', ready: 'Ready' };
const jstat = (j) => ['delivered', 'closed', 'completed'].includes(j.status) ? 'Picked up' : j.status === 'estimate' ? 'Estimate' : j.status === 'approved' ? 'Approved' : STG[j.stage] || j.status;
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('Link copied'); } catch { prompt('Copy this link', t); } }

view('portal', async (jobId) => {
  if (!guard('Customer portal')) return;
  if (jobId) return portalJob(jobId);
  const d = await api('/api/portal-admin');
  const viewed = d.jobs.filter((j) => j.portal_viewed_at).length;
  shell('Customer portal', `${d.jobs.length} job${d.jobs.length === 1 ? '' : 's'} · ${viewed} viewed by the customer`,
    `<div class="page"><p class="mut sm" style="margin:0 0 12px">Each job has a private page for the customer: repair status, the photos you share, estimate approval with a signature, invoice and balance, and messages. No sign-in needed; only someone with the link can open it.</p>
    <label class="search">${icon('search')}<input id="pq" type="search" placeholder="Search name, RO, vehicle" aria-label="Search jobs" autocomplete="off"></label>
    <div class="olist" id="pl" style="margin-top:12px">${d.jobs.length ? d.jobs.map((j) => `<button class="ocard pcard" data-j="${j.id}" data-s="${esc(`${j.customer_name || ''} ${j.number} ${vLabel(j)}`.toLowerCase())}">
      <span class="grow"><b>${esc(j.customer_name || 'No customer')}</b><span class="mut sm">${esc(vLabel(j))} · ${esc(j.number)}</span>
      <span class="tags"><span class="tag">${esc(jstat(j))}</span>${j.portal_off ? '<span class="tag bad">Link off</span>' : j.portal_viewed_at ? `<span class="tag ok">Viewed ${esc(dstr(j.portal_viewed_at))}</span>` : '<span class="tag">Not opened yet</span>'}${j.signed ? '<span class="tag ok">Signed</span>' : ''}${j.shared_photos ? `<span class="tag">${j.shared_photos} photo${j.shared_photos === 1 ? '' : 's'}</span>` : ''}${Number(j.cust_balance) > 0.005 ? `<span class="tag warn">Owes ${money(j.cust_balance)}</span>` : ''}</span></span>
      <span class="chev">${icon('arrow')}</span></button>`).join('') : `<div class="card empty"><span class="eic">${icon('globe')}</span><h2>No jobs yet</h2><p class="mut">Customer pages appear here once you write an estimate.</p></div>`}</div></div>`);
  $('#pq').oninput = (e) => { const q = e.target.value.trim().toLowerCase(); $$('.pcard').forEach((b) => { b.style.display = !q || b.dataset.s.includes(q) ? '' : 'none'; }); };
  $$('.pcard').forEach((b) => b.onclick = () => { location.hash = '#/portal/' + b.dataset.j; });
});

async function portalJob(id) {
  const d = await api('/api/portal-admin/' + id);
  const j = d.job;
  const canText = j.phone && j.sms_opt_in;
  shell('Customer portal', `${esc(j.customer_name || 'No customer')} · ${esc(vLabel(j))} · ${esc(j.number)}`,
    `<div class="page"><a class="btn sm ghost" href="#/portal" style="margin-bottom:12px">${icon('arrow', 'flip')}All jobs</a>
    <div class="card"><h3>Customer link</h3>
      ${j.portal_off ? '<div class="note warn">This link is turned off. The customer sees "Link not available".</div>' : ''}
      <div class="plink"><input readonly value="${esc(j.url)}" aria-label="Customer link" id="plu"></div>
      <div class="row wrap" style="margin-top:10px"><button class="pri" id="ptext" ${canText && !j.portal_off ? '' : 'disabled'}>${icon('send')}Text link to customer</button><button id="pcopy">Copy link</button><a class="btn" href="${esc(j.url)}" target="_blank" rel="noopener">Open as customer</a></div>
      <p class="sm mut" style="margin:12px 0 0">${j.portal_viewed_at ? `Last opened by the customer ${esc(dtstr(j.portal_viewed_at))}.` : 'The customer hasn\'t opened it yet.'}${!j.phone ? ' This customer has no phone number.' : !j.sms_opt_in ? ' This customer replied STOP to texts.' : ''}</p>
      <div class="row wrap" style="margin-top:12px"><button class="sm" id="poff">${j.portal_off ? 'Turn link on' : 'Turn link off'}</button><button class="sm" id="prot">Make a new link</button></div>
    </div>
    <div class="card"><h3>Photos the customer can see</h3>${d.photos.length ? `<p class="sm mut" style="margin-top:0">Tap a photo to share or hide it.</p><div class="pgrid">${d.photos.map((p) => `<button class="pph ${p.customer_visible ? 'on' : ''}" data-f="${p.id}" data-v="${p.customer_visible ? 1 : 0}" aria-pressed="${p.customer_visible ? 'true' : 'false'}"><img loading="lazy" src="/api/files/${p.id}" alt="${esc(p.caption || p.kind || 'Photo')}"><span class="pv">${p.customer_visible ? 'Shared' : 'Hidden'}</span></button>`).join('')}</div>` : '<p class="mut sm" style="margin:0">No photos on this job yet. Add them on the estimate\'s Photos tab.</p>'}</div>
    </div>`);
  $('#pcopy').onclick = () => copyText(j.url);
  $('#plu').onclick = (e) => e.target.select();
  $('#ptext').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const r = await api(`/api/portal-admin/${j.id}/send`, { method: 'POST' });
      const ms = String(r.message?.status || '');
      if (ms.startsWith('failed') || ms.startsWith('queued') || ms === 'not_configured') offerPhone(r.phone, r.body, ms.startsWith('failed') ? (r.message.error || '') : '', null, true, r.message.id);
      else if (ms === 'phone_queue') { toast('Link queued on your phone'); nativeKick(); }
      else toast('Link texted to the customer');
    } finally { e.target.disabled = false; }
  };
  $('#poff').onclick = async () => { await api('/api/portal-admin/' + j.id, { method: 'PUT', body: { off: !j.portal_off } }); toast(j.portal_off ? 'Link turned on' : 'Link turned off'); portalJob(j.id); };
  $('#prot').onclick = async () => { if (!confirm('Make a new link? The old link stops working right away.')) return; await api(`/api/portal-admin/${j.id}/rotate`, { method: 'POST' }); toast('New link made'); portalJob(j.id); };
  $$('.pph').forEach((b) => b.onclick = async () => { const v = b.dataset.v === '1' ? 0 : 1; await api('/api/files/' + b.dataset.f, { method: 'PUT', body: { customer_visible: v } }); b.dataset.v = v; b.classList.toggle('on', !!v); b.setAttribute('aria-pressed', v ? 'true' : 'false'); b.querySelector('.pv').textContent = v ? 'Shared' : 'Hidden'; });
}

// ---------- 5. Schedule ----------
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const dayName = (s) => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const tm = (s) => { if (!s || String(s).length < 16) return ''; const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const EVK = { dropoff: ['Drop-off', 'acc'], pickup: ['Pickup', 'ok'], target: ['Target date', 'warn'], promised: ['Promised', 'warn'], appt: ['Appointment', ''], estimate: ['Estimate appt', ''], sublet: ['Sublet', ''], other: ['Other', ''] };

view('schedule', async (start) => {
  if (!guard('Schedule')) return;
  const today = localToday();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(start || '') ? start : today;
  const to = addDays(from, 13);
  const d = await api(`/api/sched?from=${from}&to=${to}`);
  const items = [];
  const CLOSED = ['delivered', 'closed', 'completed'];
  for (const j of d.jobs) {
    if (j.drop_off_at) items.push({ day: j.drop_off_at.slice(0, 10), kind: 'dropoff', job: j, time: tm(j.drop_off_at) });
    if (j.delivered_at) items.push({ day: j.delivered_at.slice(0, 10), kind: 'pickup', job: j, time: tm(j.delivered_at), done: true });
    const tgt = j.target_date || j.promised_date;
    if (tgt && !j.delivered_at) items.push({ day: tgt.slice(0, 10), kind: j.target_date ? 'target' : 'promised', job: j, late: !CLOSED.includes(j.status) && tgt.slice(0, 10) < today });
  }
  for (const e of d.events) items.push({ day: e.start.slice(0, 10), kind: e.type in EVK ? e.type : 'other', ev: e, time: tm(e.start), job: e.job_id ? { id: e.job_id, number: e.number, customer_name: e.customer_name, year: e.year, make: e.make, model: e.model } : null });
  const late = items.filter((x) => x.late);
  const days = Array.from({ length: 14 }, (_, i) => addDays(from, i));
  const item = (x) => { const [kl, kc] = EVK[x.kind]; const j = x.job; return `<button class="sit" ${x.ev ? `data-ev="${x.ev.id}"` : `data-j="${j.id}"`}><span class="tag ${x.late ? 'bad' : kc}">${x.late ? 'Late' : kl}</span>${x.time ? `<span class="stime">${esc(x.time)}</span>` : ''}<span class="grow"><b>${esc(x.ev?.title || (j ? vLabel(j) : ''))}</b>${j ? `<span class="mut sm">${esc(j.customer_name || '')}${j.number ? ' \u00b7 ' + esc(j.number) : ''}${x.late ? ' \u00b7 was due ' + esc(dstr(x.day)) : ''}</span>` : ''}</span></button>`; };
  const nDrop = items.filter((x) => x.kind === 'dropoff' && x.day >= from).length, nDue = items.filter((x) => (x.kind === 'target' || x.kind === 'promised') && x.day >= from && !x.late).length;
  shell('Schedule', `${dayName(from)} \u2013 ${dayName(to)}`,
    `<div class="page">${kpis([['Drop-offs', nDrop], ['Due out', nDue], ['Late', late.length, late.length ? 'r' : ''], ['No dates', d.unscheduled.length, d.unscheduled.length ? 'w' : '']])}
    <div class="row wrap schbar"><button class="sm" id="sprev" aria-label="Previous two weeks">${icon('arrow', 'flip')}</button><button class="sm" id="stoday">Today</button><button class="sm" id="snext" aria-label="Next two weeks">${icon('arrow')}</button><input type="date" id="sjump" value="${from}" aria-label="Jump to date"><span class="sp"></span><button class="pri" id="sadd">${icon('plus')}Add to schedule</button></div>
    ${late.length && from <= today ? `<div class="card"><h3 class="bad">Late (past target date)</h3><div class="sday">${late.map(item).join('')}</div></div>` : ''}
    <div class="sgrid">${days.map((dy) => { const xs = items.filter((x) => x.day === dy && !x.late).sort((a, b) => (a.time ? 0 : 1) - (b.time ? 0 : 1) || String(a.ev?.start || a.job?.drop_off_at || '').localeCompare(String(b.ev?.start || b.job?.drop_off_at || ''))); return `<section class="card sdc ${dy === today ? 'today' : ''} ${xs.length ? '' : 'emptyday'}"><h3>${dy === today ? 'Today \u00b7 ' : ''}${esc(dayName(dy))}</h3>${xs.length ? `<div class="sday">${xs.map(item).join('')}</div>` : '<p class="mut sm" style="margin:0">Nothing scheduled</p>'}</section>`; }).join('')}</div>
    ${d.unscheduled.length ? `<div class="card"><h3>Open jobs with no dates</h3><div class="sday">${d.unscheduled.map((j) => `<button class="sit" data-j="${j.id}"><span class="tag warn">No dates</span><span class="grow"><b>${esc(vLabel(j))}</b><span class="mut sm">${esc(j.customer_name || '')} \u00b7 ${esc(j.number)}</span></span></button>`).join('')}</div></div>` : ''}</div>`);
  $('#sprev').onclick = () => { location.hash = '#/schedule/' + addDays(from, -14); };
  $('#snext').onclick = () => { location.hash = '#/schedule/' + addDays(from, 14); };
  $('#stoday').onclick = () => { location.hash = '#/schedule'; };
  $('#sjump').onchange = (e) => { if (e.target.value) location.hash = '#/schedule/' + e.target.value; };
  const allJobs = [...new Map([...d.jobs, ...d.unscheduled].map((j) => [j.id, j])).values()];
  $$('.sit[data-j]').forEach((b) => b.onclick = () => jobDates(allJobs.find((j) => String(j.id) === b.dataset.j)));
  $$('.sit[data-ev]').forEach((b) => b.onclick = () => eventDlg(d.events.find((e) => String(e.id) === b.dataset.ev)));
  $('#sadd').onclick = () => eventDlg(null);
}, );

function jobDates(j) {
  if (!j) return;
  const dt = (s) => (s ? String(s).replace(' ', 'T').slice(0, 16) : '');
  const m = dlg(`${vLabel(j)} \u00b7 ${j.number}`, `<p class="mut sm" style="margin-top:0">${esc(j.customer_name || '')}</p>
    <label for="jd1">Drop-off</label><input id="jd1" type="datetime-local" value="${esc(dt(j.drop_off_at))}">
    <label for="jd2">Target date (when it should be done)</label><input id="jd2" type="date" value="${esc((j.target_date || '').slice(0, 10))}">
    <label for="jd3">Promised to customer</label><input id="jd3" type="date" value="${esc((j.promised_date || '').slice(0, 10))}">
    <div class="row wrap" style="margin-top:14px"><button class="pri" id="jsv">Save</button><a class="btn" href="#/job/${j.id}">Open estimate</a></div>`);
  m.q('#jsv').onclick = async () => { await api('/api/sched/job/' + j.id, { method: 'PUT', body: { drop_off_at: m.q('#jd1').value ? m.q('#jd1').value.replace('T', ' ') : null, target_date: m.q('#jd2').value || null, promised_date: m.q('#jd3').value || null } }); m.close(); toast('Dates saved'); reload(); };
}
async function eventDlg(e) {
  const jobs = (await api('/api/parts2')).jobs;
  const dt = e ? String(e.start).replace(' ', 'T').slice(0, 16) : `${localToday()}T09:00`;
  const m = dlg(e ? 'Edit appointment' : 'Add to schedule', `<label for="ek">Type</label><select id="ek">${['dropoff', 'pickup', 'estimate', 'sublet', 'other'].map((k) => `<option value="${k}" ${(e?.type || 'dropoff') === k ? 'selected' : ''}>${EVK[k][0]}</option>`).join('')}</select>
    <label for="ej">Job (optional)</label><select id="ej"><option value="">None</option>${jobs.map((j) => `<option value="${j.id}" ${String(e?.job_id) === String(j.id) ? 'selected' : ''}>${esc(`${j.customer_name || 'No customer'} \u00b7 ${vLabel(j)} \u00b7 ${j.number}`)}</option>`).join('')}</select>
    <label for="et">Title</label><input id="et" value="${esc(e?.title || '')}" placeholder="e.g. Estimate for walk-in">
    <label for="es">When</label><input id="es" type="datetime-local" value="${esc(dt)}">
    <label for="en">Notes</label><textarea id="en" rows="2">${esc(e?.notes || '')}</textarea>
    <div class="row wrap" style="margin-top:14px"><button class="pri" id="esv">Save</button>${e ? '<button id="edl" class="danger">Delete</button>' : ''}</div>`);
  m.q('#esv').onclick = async () => {
    const body = { type: m.q('#ek').value, job_id: m.q('#ej').value ? Number(m.q('#ej').value) : null, title: m.q('#et').value.trim(), start: m.q('#es').value.replace('T', ' '), notes: m.q('#en').value };
    if (!body.title && !body.job_id) return toast('Add a title or pick a job', true);
    if (!body.title) body.title = EVK[body.type][0];
    if (e) await api('/api/sched/events/' + e.id, { method: 'PUT', body }); else await api('/api/sched/events', { method: 'POST', body });
    m.close(); toast('Saved'); reload();
  };
  const dl = m.q('#edl'); if (dl) dl.onclick = async () => { if (!confirm('Delete this appointment?')) return; await api('/api/sched/events/' + e.id, { method: 'DELETE' }); m.close(); reload(); };
}

// ---------- 6. Parts ----------
const PSTL = { needed: ['Needed', 'warn'], ordered: ['Ordered', 'acc'], backordered: ['Backordered', 'bad'], received: ['Received', 'ok'], installed: ['Installed', ''], returned: ['Returned', ''] };
view('parts', async (f) => {
  if (!guard('Parts')) return;
  f = f || 'open';
  const d = await api('/api/parts2');
  const open = (p) => ['needed', 'ordered', 'backordered'].includes(p.status);
  const list = f === 'vendors' ? [] : d.parts.filter((p) => f === 'all' ? true : f === 'open' ? open(p) : f === 'received' ? ['received', 'installed'].includes(p.status) : p.status === 'returned');
  const cost = (p) => (Number(p.cost) || 0) * (Number(p.qty) || 1), sell = (p) => (Number(p.sell_price || p.list_price) || 0) * (Number(p.qty) || 1);
  const live = d.parts.filter((p) => p.status !== 'returned');
  const credits = d.parts.filter((p) => p.status === 'returned' && p.credit_status !== 'received').reduce((a, p) => a + (Number(p.credit_amount) || 0), 0);
  const byJob = new Map(); list.forEach((p) => { if (!byJob.has(p.job_id)) byJob.set(p.job_id, []); byJob.get(p.job_id).push(p); });
  const pcard = (p) => { const [sl, sc] = PSTL[p.status] || [p.status, '']; const late = open(p) && p.eta && p.eta.slice(0, 10) < localToday(); return `<button class="prt" data-p="${p.id}"><span class="grow"><b>${esc(p.description || 'Part')}</b><span class="mut sm">${esc([p.part_no, p.vendor_name, p.qty > 1 ? 'x' + p.qty : ''].filter(Boolean).join(' \u00b7 ') || 'No vendor yet')}</span>
    <span class="tags"><span class="tag ${sc}">${sl}</span>${late ? '<span class="tag bad">Past ETA</span>' : ''}${p.eta && open(p) ? `<span class="tag">ETA ${esc(dstr(p.eta))}</span>` : ''}${p.received_at && p.status === 'received' ? `<span class="tag">In ${esc(dstr(p.received_at))}</span>` : ''}${p.status === 'returned' && p.credit_amount ? `<span class="tag ${p.credit_status === 'received' ? 'ok' : 'warn'}">Credit ${money(p.credit_amount)} ${p.credit_status === 'received' ? 'received' : 'pending'}</span>` : ''}</span></span>
    <span class="pamt"><small>Cost</small>${money(cost(p))}${sell(p) ? `<small>Sell ${money(sell(p))}</small>` : ''}</span></button>`; };
  shell('Parts', `${d.parts.filter(open).length} open \u00b7 ${d.vendors.length} vendor${d.vendors.length === 1 ? '' : 's'}`,
    `<div class="page">${kpis([['Open parts', d.parts.filter(open).length, d.parts.filter(open).length ? 'w' : ''], ['Backordered', d.parts.filter((p) => p.status === 'backordered').length, d.parts.some((p) => p.status === 'backordered') ? 'r' : ''], ['Parts cost', money(live.reduce((a, p) => a + cost(p), 0))], ['Credits due', money(credits), credits ? 'w' : '']])}
    <div class="row wrap" style="margin-bottom:10px"><div class="seg" role="tablist">${[['open', 'Open'], ['received', 'Received'], ['returned', 'Returned'], ['all', 'All'], ['vendors', 'Vendors']].map(([k, n]) => `<button role="tab" class="${k === f ? 'on' : ''}" data-f="${k}">${n}</button>`).join('')}</div><span class="sp"></span><button class="pri" id="padd">${icon('plus')}${f === 'vendors' ? 'Add vendor' : 'Add part'}</button></div>
    ${f === 'vendors' ? `<div class="ogrid">${d.vendors.map((v) => { const vp = d.parts.filter((p) => p.vendor_id === v.id); return `<button class="ocard vnd" data-v="${v.id}"><div class="o1"><b>${esc(v.name)}</b><span class="num">${esc(v.type || '')}</span></div><div class="o2">${esc([v.contact, v.phone, v.account_no ? 'Acct ' + v.account_no : ''].filter(Boolean).join(' \u00b7 ') || 'No contact info')}</div><div class="o3"><span class="tag">${vp.length} part${vp.length === 1 ? '' : 's'}</span>${v.discount_pct ? `<span class="tag">${esc(v.discount_pct)}% off list</span>` : ''}<span class="sp"></span><span class="amt"><small>Bought</small>${money(vp.filter((p) => p.status !== 'returned').reduce((a, p) => a + cost(p), 0))}</span></div></button>`; }).join('') || `<div class="card empty"><span class="eic">${icon('wrench')}</span><h2>No vendors yet</h2><p class="mut">Add the dealers and suppliers you buy from.</p></div>`}</div>`
    : byJob.size ? [...byJob.entries()].map(([jid, ps]) => { const p0 = ps[0]; return `<section class="card pjob"><div class="pjh"><b>${esc(vLabel(p0))}</b><span class="mut sm">${esc(p0.customer_name || '')} \u00b7 ${esc(p0.number || '')}</span><span class="sp"></span><span class="sm mut">${money(ps.reduce((a, p) => a + cost(p), 0))}</span></div><div class="plist">${ps.map(pcard).join('')}</div></section>`; }).join('')
    : `<div class="card empty"><span class="eic">${icon('wrench')}</span><h2>${d.parts.length ? 'Nothing here' : 'No parts yet'}</h2><p class="mut">${d.parts.length ? 'Try another filter.' : 'Add the parts you order for each job to track them here and on the Production board.'}</p></div>`}</div>`);
  $$('.seg button').forEach((b) => b.onclick = () => { location.hash = '#/parts/' + b.dataset.f; });
  $('#padd').onclick = () => (f === 'vendors' ? vendorDlg(null) : partDlg(null, d));
  $$('.prt').forEach((b) => b.onclick = () => partDlg(d.parts.find((p) => String(p.id) === b.dataset.p), d));
  $$('.vnd').forEach((b) => b.onclick = () => vendorDlg(d.vendors.find((v) => String(v.id) === b.dataset.v)));
});

function partDlg(p, d) {
  const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, n]) => `<option value="${esc(k)}" ${String(v ?? '') === String(k) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  const jobsOpt = [...d.jobs]; if (p && !jobsOpt.some((j) => j.id === p.job_id)) jobsOpt.unshift({ id: p.job_id, number: p.number, customer_name: p.customer_name, year: p.year, make: p.make, model: p.model });
  const m = dlg(p ? 'Edit part' : 'Add part', `${jobsOpt.length ? '' : '<div class="note warn">There are no open jobs. Write an estimate first.</div>'}
    <label for="pj">Job</label>${sel('pj', jobsOpt.map((j) => [j.id, `${j.customer_name || 'No customer'} \u00b7 ${vLabel(j)} \u00b7 ${j.number}`]), p?.job_id)}
    <div class="grid2"><div><label for="pd">Part</label><input id="pd" value="${esc(p?.description || '')}" placeholder="Front bumper cover"></div><div><label for="pn">Part number</label><input id="pn" value="${esc(p?.part_no || '')}"></div>
    <div><label for="pt">Type</label>${sel('pt', [['oem', 'OEM'], ['aftermarket', 'Aftermarket'], ['used', 'Used / LKQ'], ['reman', 'Reman']], p?.part_type || 'oem')}</div><div><label for="pq">Qty</label><input id="pq" inputmode="decimal" value="${esc(p?.qty ?? 1)}"></div>
    <div><label for="pv">Vendor</label>${sel('pv', [['', 'None'], ...d.vendors.map((v) => [v.id, v.name])], p?.vendor_id)}</div><div><label for="ps">Status</label>${sel('ps', Object.entries(PSTL).map(([k, [n]]) => [k, n]), p?.status || 'needed')}</div>
    <div><label for="pc">Your cost (each)</label><input id="pc" inputmode="decimal" value="${esc(p?.cost ?? '')}"></div><div><label for="pp">Sell price (each)</label><input id="pp" inputmode="decimal" value="${esc(p?.sell_price ?? p?.list_price ?? '')}"></div>
    <div><label for="pe">ETA</label><input id="pe" type="date" value="${esc((p?.eta || '').slice(0, 10))}"></div><div><label for="pr">Received on</label><input id="pr" type="date" value="${esc((p?.received_at || '').slice(0, 10))}"></div></div>
    <div id="pret" style="display:none"><div class="grid2"><div><label for="prr">Return reason</label><input id="prr" value="${esc(p?.return_reason || '')}" placeholder="Wrong part, damaged\u2026"></div><div><label for="pcr">Credit amount</label><input id="pcr" inputmode="decimal" value="${esc(p?.credit_amount ?? '')}"></div>
    <div><label for="pcs">Credit</label>${sel('pcs', [['pending', 'Pending'], ['received', 'Received']], p?.credit_status || 'pending')}</div></div></div>
    <label for="pno">Notes</label><textarea id="pno" rows="2">${esc(p?.notes || '')}</textarea>
    <div class="row wrap" style="margin-top:14px"><button class="pri" id="psv" ${jobsOpt.length ? '' : 'disabled'}>Save</button>${p ? '<button class="danger" id="pdl">Delete</button>' : ''}</div>`);
  const tog = () => { m.q('#pret').style.display = m.q('#ps').value === 'returned' ? '' : 'none'; }; m.q('#ps').onchange = tog; tog();
  m.q('#psv').onclick = async () => {
    const body = { job_id: Number(m.q('#pj').value), description: m.q('#pd').value.trim(), part_no: m.q('#pn').value.trim(), part_type: m.q('#pt').value, qty: m.q('#pq').value || 1, vendor_id: m.q('#pv').value || null, status: m.q('#ps').value, cost: m.q('#pc').value || 0, sell_price: m.q('#pp').value || 0, eta: m.q('#pe').value || null, received_at: m.q('#pr').value || null, notes: m.q('#pno').value };
    if (body.status === 'returned') Object.assign(body, { return_reason: m.q('#prr').value, credit_amount: m.q('#pcr').value || 0, credit_status: m.q('#pcs').value });
    if (!body.description) return toast('Enter the part name', true);
    if (p) await api('/api/parts2/' + p.id, { method: 'PUT', body }); else await api('/api/parts2', { method: 'POST', body });
    m.close(); toast('Part saved'); reload();
  };
  const dl = m.q('#pdl'); if (dl) dl.onclick = async () => { if (!confirm('Delete this part?')) return; await api('/api/parts2/' + p.id, { method: 'DELETE' }); m.close(); reload(); };
}
function vendorDlg(v) {
  const f = (id, l, k, extra = '') => `<div><label for="${id}">${l}</label><input id="${id}" value="${esc(v?.[k] ?? '')}" ${extra}></div>`;
  const m = dlg(v ? 'Edit vendor' : 'Add vendor', `<div class="grid2">${f('vn', 'Name', 'name')}${f('vt', 'Type', 'type', 'placeholder="Dealer, aftermarket, paint\u2026"')}${f('vc', 'Contact', 'contact')}${f('vp', 'Phone', 'phone', 'type="tel"')}${f('ve', 'Email', 'email', 'type="email"')}${f('va', 'Account #', 'account_no')}${f('vd', 'Discount off list (%)', 'discount_pct', 'inputmode="decimal"')}</div>
    <label for="vno">Notes</label><textarea id="vno" rows="2">${esc(v?.notes || '')}</textarea><div class="row wrap" style="margin-top:14px"><button class="pri" id="vsv">Save</button>${v ? '<button class="danger" id="vdl">Delete</button>' : ''}</div>`);
  m.q('#vsv').onclick = async () => {
    const body = { name: m.q('#vn').value.trim(), type: m.q('#vt').value.trim(), contact: m.q('#vc').value.trim(), phone: m.q('#vp').value.trim(), email: m.q('#ve').value.trim(), account_no: m.q('#va').value.trim(), discount_pct: Number(m.q('#vd').value) || 0, notes: m.q('#vno').value };
    if (!body.name) return toast('Enter the vendor name', true);
    if (v) await api('/api/vendors2/' + v.id, { method: 'PUT', body }); else await api('/api/vendors2', { method: 'POST', body });
    m.close(); toast('Vendor saved'); reload();
  };
  const dl = m.q('#vdl'); if (dl) dl.onclick = async () => { if (!confirm('Delete this vendor?')) return; await api('/api/vendors2/' + v.id, { method: 'DELETE' }); m.close(); reload(); };
}
