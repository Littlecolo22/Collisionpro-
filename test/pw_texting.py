# Settings > Texting UI: browser (no "This phone" option) and inside the Android app (mock window.RRAndroid):
# options, permission status, Allow texting prompt, restricted-setting help, linking, background toggle, test text, layout.
# usage: python3 test/pw_texting.py BASE OWNER_SESSION EMPLOYEE_SESSION|- [shotdir]
import sys, json
from playwright.sync_api import sync_playwright
B, own = sys.argv[1], open(sys.argv[2]).read().strip()
emp = open(sys.argv[3]).read().strip() if sys.argv[3] != '-' else None
shots = sys.argv[4] if len(sys.argv) > 4 else None
res = {'passed': 0, 'failed': []}
def chk(n, ok, d=''):
    if ok: res['passed'] += 1
    else: res['failed'].append(f'{n} {str(d)[:300]}')

MOCK = """(() => {
  const st = JSON.parse(sessionStorage.getItem('mockrr') || 'null') || {send:false, receive:false, notif:false, notifNeeded:true, telephony:true, blocked:%BLOCKED%, linked:false, hint:'', bg:false, batteryOk:false, running:false, name:'Google Pixel 8', model:'Pixel 8', android:'15', appVersion:'1.3'};
  const save = () => sessionStorage.setItem('mockrr', JSON.stringify(st));
  const fire = (d) => setTimeout(() => window.dispatchEvent(new CustomEvent('rrnative', {detail: d})), 50);
  window.__rrcalls = [];
  window.RRAndroid = {
    smsStatus: () => JSON.stringify(st),
    hasSmsPermission: () => st.send,
    requestSmsPermission: () => { window.__rrcalls.push('request'); if (!st.blocked) { st.send = st.receive = st.notif = true; } save(); fire({type:'perm', send:st.send, receive:st.receive, blocked:st.blocked}); },
    sendSms: (p, t, id) => { window.__rrcalls.push('send'); fire({type:'sms', id, status:'sent'}); },
    openAppSettings: () => window.__rrcalls.push('appsettings'),
    openBatterySettings: () => { window.__rrcalls.push('battery'); st.batteryOk = true; save(); },
    link: (tok, hint, origin) => { window.__rrcalls.push('link:' + (tok||'').slice(0,2) + ':' + origin); st.linked = true; st.hint = hint; save(); },
    unlink: () => { window.__rrcalls.push('unlink'); st.linked = false; st.hint = ''; st.bg = false; save(); },
    setBackground: (on) => { window.__rrcalls.push('bg:' + on); st.bg = on; save(); },
    syncNow: () => window.__rrcalls.push('sync'),
  };
})();"""

def layout(pg, name, w):
    bad = pg.evaluate("""() => {
      const card = document.querySelector('#smsset'); if (!card) return ['no card'];
      const out = []; const cr = card.getBoundingClientRect();
      if (document.documentElement.scrollWidth > innerWidth + 1) out.push('page scrolls sideways ' + document.documentElement.scrollWidth);
      card.querySelectorAll('button, input, label, .tag, b, .note, p, li').forEach((e) => {
        const r = e.getBoundingClientRect(); if (!r.width || e.closest('[hidden]')) return;
        if (r.left < cr.left - 1 || r.right > cr.right + 1) out.push('outside card: ' + e.tagName + ' ' + (e.id || e.textContent.trim().slice(0, 30)) + ' ' + Math.round(r.left) + '-' + Math.round(r.right));
        if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible' && e.tagName !== 'INPUT') out.push('cut off: ' + e.tagName + ' ' + e.textContent.trim().slice(0, 30));
      });
      const bs = [...card.querySelectorAll('button, .smopt, .tag')].filter((e) => e.getBoundingClientRect().width && !e.closest('[hidden]'));
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
        if (bs[i].contains(bs[j]) || bs[j].contains(bs[i])) continue;
        const a = bs[i].getBoundingClientRect(), b = bs[j].getBoundingClientRect();
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push('overlap: ' + (bs[i].id || bs[i].textContent.trim().slice(0, 20)) + ' / ' + (bs[j].id || bs[j].textContent.trim().slice(0, 20)));
      }
      return out;
    }""")
    chk(f'{name} {w} layout clean', not bad, bad[:4])

sys.path.insert(0, 'test')
from apicall import call
_, g0 = call(B, own, 'GET', '/api/sms/settings')
start_method = g0['method']
call(B, own, 'PUT', '/api/sms/settings', {'method': 'gateway' if g0['configured'] else 'manual'})
with sync_playwright() as p:
    b = p.chromium.launch()
    sizes = [(390, 844, True), (844, 390, True), (1440, 900, False)]
    # --- plain browser: two options only ---
    for w, h, mob in sizes:
        ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=mob, has_touch=True)
        ctx.add_cookies([{'name': 'cp_session', 'value': own, 'url': B}])
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(B + '/#/settings'); pg.wait_for_selector('#smsset .smopts', timeout=15000); pg.wait_for_timeout(500)
        vals = pg.eval_on_selector_all('#smsset input[name=smm]', 'es => es.map(e => e.value)')
        chk(f'browser {w} options', vals == ['gateway', 'manual'], vals)
        chk(f'browser {w} heading', 'How to send texts' in pg.inner_text('#smsset'))
        layout(pg, 'browser', w)
        if w == 390:
            pg.check('#smsset input[value=manual]'); pg.wait_for_timeout(1200)
            chk('browser manual pane', pg.locator('#smp-manual').is_visible() and not pg.locator('#smp-gateway').is_visible())
            chk('manual: no status line', pg.locator('#gts').count() == 0)
            layout(pg, 'browser-manual', w)
            pg.check('#smsset input[value=gateway]'); pg.wait_for_timeout(1200)
            chk('browser gateway pane back', pg.locator('#gu').is_visible())
        chk(f'browser {w} no js errors', not errs, errs[:2])
        ctx.close()

    # --- inside the app, Android blocked it (restricted setting) ---
    for w, h, mob in sizes:
        ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=mob, has_touch=True, device_scale_factor=3 if w == 390 else 1)
        ctx.add_cookies([{'name': 'cp_session', 'value': own, 'url': B}])
        ctx.add_init_script(MOCK.replace('%BLOCKED%', 'true'))
        call(B, own, 'PUT', '/api/sms/settings', {'method': 'gateway' if g0['configured'] else 'manual'})
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(B + '/#/settings'); pg.wait_for_selector('#smsset .smopts', timeout=15000); pg.wait_for_timeout(500)
        vals = pg.eval_on_selector_all('#smsset input[name=smm]', 'es => es.map(e => e.value)')
        chk(f'app {w} three options', vals == ['device', 'gateway', 'manual'], vals)
        chk(f'app {w} option label', 'This phone (R&R Auto Express app)' in pg.inner_text('#smsset'))
        pg.check('#smsset input[value=device]'); pg.wait_for_timeout(1500)
        txt = pg.inner_text('#smsset')
        chk(f'app {w} device pane', pg.locator('#smp-device').is_visible() and 'Send texts' in txt and 'Not allowed' in txt, txt[:300])
        chk(f'app {w} prompt asked', 'request' in pg.evaluate('window.__rrcalls'), pg.evaluate('window.__rrcalls'))
        chk(f'app {w} restricted help', 'Allow restricted settings' in txt and 'Permissions' in txt, txt[-400:])
        chk(f'app {w} allow button', pg.locator('#smallow').is_visible())
        pg.click('#smappset'); chk(f'app {w} open app settings', 'appsettings' in pg.evaluate('window.__rrcalls'))
        layout(pg, 'app-blocked', w)
        if shots and w == 390:
            pg.locator('#smsset').scroll_into_view_if_needed(); pg.wait_for_timeout(300)
            pg.locator('#smsset').screenshot(path=f'{shots}/texting_settings_phone.png')
        chk(f'app {w} no js errors', not errs, errs[:2])
        ctx.close()

    # --- inside the app, normal prompt: allow -> linked -> background -> test -> unlink -> back to gateway ---
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    ctx.add_cookies([{'name': 'cp_session', 'value': own, 'url': B}])
    ctx.add_init_script(MOCK.replace('%BLOCKED%', 'false'))
    call(B, own, 'PUT', '/api/sms/settings', {'method': 'gateway' if g0['configured'] else 'manual'})
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    pg.goto(B + '/#/settings'); pg.wait_for_selector('#smsset .smopts', timeout=15000); pg.wait_for_timeout(500)
    before = pg.evaluate("document.querySelector('#smsset input[name=smm]:checked').value")
    pg.check('#smsset input[value=device]'); pg.wait_for_timeout(4000)
    calls = pg.evaluate('window.__rrcalls'); txt = pg.inner_text('#smsset')
    chk('allow -> prompt + link', 'request' in calls and any(c.startswith('link:d_:') for c in calls), calls)
    chk('linked: this phone', 'This phone sends the shop' in txt and 'Allowed' in txt, txt[:400])
    chk('no restricted help when allowed', 'Allow restricted settings' not in txt)
    chk('background toggle shown', pg.locator('#smbg').is_visible())
    pg.check('#smbg'); pg.wait_for_timeout(1500)
    chk('background on', 'bg:true' in pg.evaluate('window.__rrcalls'))
    chk('battery tip shown', pg.locator('#smbatt').is_visible())
    layout(pg, 'app-linked', 390)
    pg.fill('#gto', '(305) 555-0199'); pg.click('#gtest'); pg.wait_for_timeout(2500)
    chk('test queued on phone', 'Waiting for your phone' in pg.inner_text('#gts') or 'Sending from your phone' in pg.inner_text('#gts'), pg.inner_text('#gts'))
    chk('sync kicked', 'sync' in pg.evaluate('window.__rrcalls'))
    g = pg.evaluate("fetch('/api/sms/settings').then(r => r.json())")
    res['test_msg_id'] = (g.get('test') or {}).get('msg_id')
    chk('server: device method + linked', g['method'] == 'device' and g['device'] and g['device']['name'] == 'Google Pixel 8', (g['method'], g.get('device')))
    pg.goto(B + '/#/messages'); pg.wait_for_timeout(2000)
    chk('messages page ok in device mode', not errs, errs[:2])
    pg.goto(B + '/#/settings'); pg.wait_for_selector('#smunlink', timeout=15000)
    pg.click('#smunlink'); pg.wait_for_timeout(1500)
    chk('unlink', 'unlink' in pg.evaluate('window.__rrcalls') and pg.locator('#smlink').is_visible())
    pg.check(f'#smsset input[value={before}]'); pg.wait_for_timeout(1500)
    g = pg.evaluate("fetch('/api/sms/settings').then(r => r.json())")
    chk('restored method', g['method'] == before and g['device'] is None, (g['method'], before))
    chk('flow no js errors', not errs, errs[:2])
    ctx.close()

    if emp:
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True)
        ctx.add_cookies([{'name': 'cp_session', 'value': emp, 'url': B}])
        pg = ctx.new_page(); pg.goto(B + '/#/settings'); pg.wait_for_timeout(2500)
        chk('employee: no texting card', pg.locator('#smsset .smopts').count() == 0)
        ctx.close()
    b.close()
call(B, own, 'PUT', '/api/sms/settings', {'method': start_method, 'forget_device': 1})
print(json.dumps(res, indent=1))
