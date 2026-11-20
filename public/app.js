// CollisionPro front end (stage 1): shell, login, jobs, VIN, photos, estimate grid, 3D picker, parts, settings, share.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const hrs = (n) => (Number(n) || 0).toFixed(1);
export const S = { me: null, settings: {}, job: null, catalog: [], sel: new Set(), sort: null, filter: '', picker: null };
window.__S = S;

export function toast(msg, err) {
  const d = document.createElement('div'); d.textContent = msg; if (err) d.className = 'err';
  $('#toast').appendChild(d); setTimeout(() => d.remove(), err ? 6000 : 2600);
}
export async function api(path, opts = {}) {
  const o = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
  if (opts.body instanceof FormData) o.body = opts.body;
  else if (opts.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
  const r = await fetch(path, o);
  if (r.status === 401 && !path.includes('/login')) { S.me = null; renderLogin(); throw new Error('Signed out'); }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.blob();
  if (!r.ok) { const m = data?.error || data?.message || `Error ${r.status}`; if (!opts.quiet) toast(m, true); throw new Error(m); }
  return data;
}

// ---------- shell ----------
// [key, full name, short label for the phone bar, icon, stage]
const NAV = [
  ['jobs', 'Estimates', 'Estimates', 'doc'], ['new', 'New estimate', 'New', 'plus'], ['customers', 'Customers', 'Customers', 'users'],
  ['production', 'Production board', 'Board', 'board'], ['schedule', 'Schedule', 'Schedule', 'cal'], ['parts', 'Parts', 'Parts', 'wrench'],
  ['paint', 'Paint', 'Paint', 'drop', 2], ['invoices', 'Invoices', 'Invoices', 'receipt'], ['reports', 'Reports', 'Reports', 'chart', 2],
  ['insurers', 'Insurers', 'Insurers', 'shield', 2], ['compliance', 'Compliance', 'Compliance', 'check', 2], ['messages', 'Messages', 'Messages', 'chat'],
  ['portal', 'Customer portal', 'Portal', 'globe'], ['settings', 'Settings', 'Settings', 'sliders'], ['account', 'My account', 'Account', 'user'], ['help', 'Help', 'Help', 'help'],
];
const EMP_NAV = ['jobs', 'new', 'customers', 'account'];
const IC = {
  x: '<path d="M6 6l12 12M18 6L6 18"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  send: '<path d="M4 12l16-8-6 16-3-7z"/><path d="M11 13l9-9"/>', phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  dl: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  board: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 7.5v8M12 7.5v4.5M16 7.5v6"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="4"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.1l-5.8 5.8a1.8 1.8 0 0 0 2.5 2.6l5.9-5.9a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.3-.4-.4-2.3z"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  chart: '<path d="M3 21h18M6 17v-5M11 17V6M16 17v-8M21 17v-3"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  check: '<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  sliders: '<path d="M4 6h9M19 6h1M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="16" cy="6" r="2.2"/><circle cx="9" cy="12" r="2.2"/><circle cx="17" cy="18" r="2.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  car: '<path d="M5 16h14M3.5 13l1.8-5a2 2 0 0 1 1.9-1.4h9.6a2 2 0 0 1 1.9 1.4l1.8 5v4a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V17H7v1a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1z"/><circle cx="7.5" cy="13.2" r=".6"/><circle cx="16.5" cy="13.2" r=".6"/>',
  out: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"/>',
};
export const icon = (k, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${IC[k] || ''}</svg>`;
export function navItems() {
  const caps = S.me?.caps || []; const full = caps.includes('*') || caps.includes('shop.read');
  return NAV.filter(([k]) => full || EMP_NAV.includes(k));
}
export async function signOut() { await api('/api/logout', { method: 'POST' }).catch(() => {}); S.me = null; renderLogin(); }
function shell(title, sub, body, actions = '') {
  let cur = (location.hash.split('/')[1] || 'jobs'); if (cur === 'job') cur = 'jobs';
  const items = navItems(); const me = S.me?.user || {};
  const shop = S.me?.shop_name || 'R&R Auto Express';
  $('#app').innerHTML = `<div class="shell"><nav class="nav" id="nav" aria-label="Pages"><div class="brand"><span class="mark">${esc(initials(shop))}</span><span><b>${esc(shop)}</b><small>${esc(me.name || '')}${me.role ? ' · ' + esc(me.role) : ''}</small></span></div>
  ${items.map(([k, n, , ic, st]) => `<a href="#/${k}" class="${cur === k ? 'act' : ''}" ${cur === k ? 'aria-current="page"' : ''}>${icon(ic)}<span class="nl">${n}</span>${st ? '<span class="soon">soon</span>' : ''}</a>`).join('')}
  <div class="foot"><button class="ghost" id="logout">${icon('out')}Sign out</button></div></nav>
  <div class="main" id="main"><header class="top"><div class="ttl"><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${actions}</header>${body}</div>
  <nav class="bnav" id="bnav" aria-label="Pages"><div class="bscroll" id="bscroll">${items.filter(([k]) => k !== 'new').map(([k, , s, ic]) => `<a href="#/${k}" class="bi ${cur === k ? 'act' : ''}" ${cur === k ? 'aria-current="page"' : ''} data-k="${k}"><span class="bic">${icon(ic)}</span><span class="bl">${s}</span></a>`).join('')}</div>
  <a href="#/new" class="fab ${cur === 'new' ? 'act' : ''}" id="fab" aria-label="New estimate" title="New estimate">${icon('plus')}</a></nav></div>`;
  $('#logout').onclick = (e) => { e.preventDefault(); signOut(); };
  const bs = $('#bscroll');
  const fade = () => { bs.classList.toggle('fl', bs.scrollLeft > 4); bs.classList.toggle('fr', bs.scrollLeft + bs.clientWidth < bs.scrollWidth - 4); };
  const center = () => { const a = $('.bi.act', bs); if (a && bs.clientWidth) bs.scrollLeft = Math.max(0, a.offsetLeft - (bs.clientWidth - a.offsetWidth) / 2); fade(); };
  center(); requestAnimationFrame(center);
  bs.addEventListener('scroll', fade, { passive: true });
  bs.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { bs.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
}
window.addEventListener('resize', () => { const bs = $('#bscroll'); if (bs) { bs.classList.toggle('fl', bs.scrollLeft > 4); bs.classList.toggle('fr', bs.scrollLeft + bs.clientWidth < bs.scrollWidth - 4); } });
function initials(n) { const w = String(n || '').replace(/[^A-Za-z0-9& ]/g, ' ').split(/\s+/).filter(Boolean); return (w.length > 1 ? w.slice(0, 2).map((x) => x[0]).join('') : (w[0] || 'RR').slice(0, 2)).toUpperCase(); }

function authWrap(inner) {
  const shop = S.shopName || 'R&R Auto Express';
  return `<div class="auth"><div class="authin"><div class="authbrand"><span class="mark lg">${esc(initials(shop))}</span></div>${inner}</div></div>`;
}
function renderLogin() {
  if (S.picker) { const pk = S.picker; S.picker = null; try { pk.destroy(); } catch (e) { console.warn(e); } }
  $('#app').innerHTML = authWrap(`<h1 class="authh" id="lsn">${esc(S.shopName || 'R&R Auto Express')}</h1><p class="mut authp">Collision estimating. Sign in to continue.</p>
  <form id="lf" class="card authcard"><label>Email</label><input name="email" type="email" autocomplete="username" required>
  <label>Password</label><input name="password" type="password" autocomplete="current-password" required>
  <button class="pri big" style="width:100%;margin-top:18px">Sign in</button></form>
  <p class="sm" id="sul" hidden style="margin:18px 0 0;text-align:center">New shop? <a href="#" id="sua">Create your account</a></p>`);
  $('#lf').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    try { await api('/api/login', { method: 'POST', body: { email: f.get('email'), password: f.get('password') } }); await boot(); } catch {}
  };
  api('/api/signup', { quiet: true }).then((r) => {
    if (!r) return;
    if (r.shop_name) { S.shopName = r.shop_name; document.title = r.shop_name; if ($('#lsn')) $('#lsn').textContent = r.shop_name; const m = $('.authbrand .mark'); if (m) m.textContent = initials(r.shop_name); }
    if (r.open && $('#sul')) $('#sul').hidden = false;
  }).catch(() => {});
  $('#sua').onclick = (e) => { e.preventDefault(); renderSignup(); };
}

function renderSignup() {
  $('#app').innerHTML = authWrap(`<h1 class="authh">Create your account</h1><p class="mut authp">You'll be the shop owner. Add your staff later in Settings.</p>
  <form id="sf" class="card authcard"><label>Shop name</label><input name="shop_name" autocomplete="organization" required maxlength="80" value="${esc(S.shopName || 'R&R Auto Express')}">
  <label>Your name</label><input name="name" autocomplete="name" required maxlength="80">
  <label>Email</label><input name="email" type="email" autocomplete="username" required>
  <label>Password (10+ characters)</label><input name="password" type="password" autocomplete="new-password" minlength="10" required>
  <label>Confirm password</label><input name="password2" type="password" autocomplete="new-password" minlength="10" required>
  <button class="pri big" style="width:100%;margin-top:18px">Create account</button></form>
  <p class="sm" style="margin:18px 0 0;text-align:center"><a href="#" id="bkl">Back to sign in</a></p>`);
  $('#bkl').onclick = (e) => { e.preventDefault(); renderLogin(); };
  $('#sf').onsubmit = async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    if (f.password !== f.password2) return toast('The passwords do not match', true);
    delete f.password2;
    try { await api('/api/signup', { method: 'POST', body: f }); location.hash = '#/jobs'; await boot(); } catch {}
  };
}

async function boot() {
  const ss = await api('/api/session', { quiet: true }).catch(() => ({}));
  if (!ss.signed_in) return renderLogin();
  try { S.me = await api('/api/me', { quiet: true }); } catch { return renderLogin(); }
  try { S.settings = await api('/api/settings', { quiet: true }); } catch { S.settings = {}; }
  if (S.me?.shop_name) document.title = S.me.shop_name;
  if (!location.hash || location.hash === '#/' ) location.hash = '#/jobs'; else route();
}
window.addEventListener('hashchange', () => S.me && route());

const VIEWS = {};
// Cleanup for the screen being left: listeners on window/document, timers. Run before the next screen renders.
const LEAVE = [];
export function onLeave(fn) { LEAVE.push(fn); }
function runLeave() { while (LEAVE.length) { const f = LEAVE.pop(); try { f(); } catch (e) { console.warn(e); } } }
export function view(name, fn) { VIEWS[name] = fn; }
async function route() {
  runLeave();
  // A failing 3D cleanup must never stop navigation (it used to, and the app looked frozen on the Parts tab).
  if (S.picker && !location.hash.includes('/3d')) { const pk = S.picker; S.picker = null; try { pk.destroy(); } catch (e) { console.warn('3D cleanup', e); } }
  const [, name = 'jobs', ...rest] = location.hash.split('/');
  const fn = VIEWS[name];
  try {
    if (fn) await fn(...rest);
    else { const n = NAV.find((x) => x[0] === name); shell(n ? n[1] : 'Not found', '', `<div class="page"><div class="card empty">${n ? `<span class="eic">${icon(n[3])}</span><h2>${n[1]} is coming soon</h2><p class="mut">This screen is in the next build. The data behind it is already in place.</p>` : '<h2>Nothing here</h2>'}<a class="btn pri" href="#/jobs">Go to estimates</a></div></div>`); }
  } catch (e) { if (e.message !== 'Signed out') { console.warn(e); toast(e.message, true); } }
}

export { $, $$, esc, money, hrs, shell, route };
// Delegated handlers (the CSP blocks inline onclick/onerror attributes)
document.addEventListener('click', (e) => { const el = e.target.closest && e.target.closest('[data-href]'); if (el) location.hash = el.getAttribute('data-href'); });
document.addEventListener('error', (e) => { const t = e.target; if (t && t.tagName === 'IMG' && t.dataset && t.dataset.hideerr) t.style.visibility = 'hidden'; }, true);
// Load UI modules in a predictable order and surface failures instead of leaving the
// user trapped on the initial Loading screen (e.g. stale/missing asset deployments).
(async function loadAppModules() {
  const modules = ['./screens.js', './estimate.js', './ops.js', './ops2.js', './picker.js'];
  for (const path of modules) {
    try { await import(path); }
    catch (err) {
      console.error(`CollisionPro failed to load module: ${path}`, err);
      const host = document.querySelector('#app');
      if (host) host.innerHTML = `<div class="page"><div class="card empty" role="alert">
        <h2>CollisionPro couldn't load a screen</h2>
        <p class="mut">A website file failed to load: <code>${path}</code>.</p>
        <p class="mut">This can happen when an update is only partially deployed or your browser has an older cached version.</p>
        <button class="pri" id="cpreload">Reload website</button>
        <button class="btn" id="cpback" style="margin-left:8px">Back</button>
      </div></div>`;
      document.querySelector('#cpreload')?.addEventListener('click', () => location.reload());
      document.querySelector('#cpback')?.addEventListener('click', () => history.back());
      return;
    }
  }
  try { await boot(); }
  catch (err) {
    console.error('CollisionPro boot failed', err);
    const host = document.querySelector('#app');
    if (host) host.innerHTML = `<div class="page"><div class="card empty" role="alert">
      <h2>CollisionPro couldn't start</h2><p class="mut">The app failed while connecting or starting up.</p>
      <button class="pri" id="cpreload">Retry</button>
    </div></div>`;
    document.querySelector('#cpreload')?.addEventListener('click', () => location.reload());
  }
})();
