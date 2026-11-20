# Customer contact edit panel: open from Customers and from the estimate, validate, save, layout checks.
# usage: python3 test/pw_customer.py BASE OWNER_TOKEN JOB_ID [shotdir]   (restores the customer it edits)
import sys, time, json, urllib.request
from playwright.sync_api import sync_playwright
B, tok, job = sys.argv[1], sys.argv[2], sys.argv[3]
shot = sys.argv[4] if len(sys.argv) > 4 else ''
sess = tok[2:] if tok.startswith('s_') else tok
SIZES = [(390, 844, 1), (844, 390, 1), (412, 915, 1), (1440, 900, 0), (980, 1900, 0)]
def api(m, p, b=None):
    r = urllib.request.Request(B + p, data=json.dumps(b).encode() if b is not None else None, method=m, headers={'Content-Type': 'application/json', 'Origin': B, 'Authorization': 'Bearer ' + tok, 'User-Agent': 'Mozilla/5.0 Chrome/120'})
    with urllib.request.urlopen(r) as x: return json.loads(x.read())
bundle = api('GET', f'/api/jobs/{job}'); cu = bundle['customer']; cid = cu['id']
KEEP = {k: cu.get(k) for k in ('name', 'phone', 'email', 'address', 'contact_pref', 'sms_opt_in', 'notes')}
PANEL = r"""() => {
 const out = []; const W = innerWidth, H = innerHeight;
 const vis = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none' || e.closest('[hidden]')) return null; return r; };
 const ov = (a, b) => a && b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
 const p = vis(document.querySelector('#ced')); if (!p) return ['panel not visible'];
 if (p.left < -1 || p.right > W + 1 || p.top < -1 || p.bottom > H + 1) out.push('panel off screen ' + JSON.stringify([p.left, p.top, p.right, p.bottom].map(Math.round)));
 const b = document.querySelector('.cedb'); if (b.scrollWidth > b.clientWidth + 1) out.push('panel body scrolls sideways');
 const se = document.scrollingElement; if (se.scrollWidth > W + 1) out.push('page scrolls sideways');
 const btns = [...document.querySelectorAll('.cedf button, .cedh button')].map(vis);
 btns.forEach((r, i) => { if (!r) out.push('button ' + i + ' hidden'); else if (r.right > p.right + 1 || r.bottom > H + 1) out.push('button ' + i + ' off panel'); });
 for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) if (ov(btns[i], btns[j])) out.push('buttons overlap ' + i + '/' + j);
 const body = vis(b), foot = vis(document.querySelector('.cedf')), head = vis(document.querySelector('.cedh'));
 if (ov(body, foot)) out.push('body overlaps footer'); if (ov(head, body)) out.push('header overlaps body');
 document.querySelectorAll('#ced input:not([type=radio]):not([type=checkbox]), #ced textarea, .cseg, .ctog').forEach((e) => { const r = vis(e); if (r && (r.right > body.right + 1 || r.left < body.left - 1)) out.push('field past panel edge: ' + (e.name || e.className)); });
 const fl = [...document.querySelectorAll('#ced .fld')].map(vis).filter(Boolean); for (let i = 0; i < fl.length; i++) for (let j = i + 1; j < fl.length; j++) if (ov(fl[i], fl[j])) out.push('fields overlap ' + i + '/' + j);
 document.querySelectorAll('#ced h3, #ced label, #ced button, .cseg label, .ctog b').forEach((e) => { if (vis(e) && e.scrollWidth > e.clientWidth + 2) out.push('clipped: ' + e.textContent.trim().slice(0, 24)); });
 if (foot && foot.height > H * 0.35) out.push('footer too tall');
 if (body && body.height < 80) out.push('body too short ' + Math.round(body.height));
 return out;
}"""
PAGE = r"""() => { const out = []; const W = innerWidth; const se = document.scrollingElement; if (se.scrollWidth > W + 1) out.push('page scrolls sideways');
 const vis = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && !e.closest('[hidden]') ? r : null; };
 const ov = (a, b) => a && b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
 const s = vis(document.querySelector('.custtop .search')), n = vis(document.querySelector('#newcust')); if (document.querySelector('#newcust')) { if (!n) out.push('New customer button hidden'); if (ov(s, n)) out.push('search overlaps New customer'); if (n && n.right > W + 1) out.push('New customer off screen'); }
 document.querySelectorAll('.custrow b, .custrow .cr, .custblk .cbn, #custedit, #newcust').forEach((e) => { const r = vis(e); if (r && r.right > W + 1) out.push('off screen: ' + e.textContent.trim().slice(0, 20)); });
 const cb = vis(document.querySelector('#custblk')); if (cb) { const e = vis(document.querySelector('#custedit')), m = vis(document.querySelector('.custblk .cbm')); if (ov(e, m)) out.push('Edit overlaps customer details'); if (document.querySelector('#custedit').scrollWidth > document.querySelector('#custedit').clientWidth + 2) out.push('Edit clipped'); }
 return out; }"""
fails = 0; checks = 0
def rep(tag, res):
    global fails, checks
    checks += 1
    if res: fails += 1; print('FAIL', tag, '::', '; '.join(res))
    else: print('ok  ', tag)
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for i, (w, h, mob) in enumerate(SIZES):
            ctx = br.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if (mob and i == 0) else 1, has_touch=bool(mob), is_mobile=bool(mob))
            ctx.add_cookies([{'name': 'cp_session', 'value': sess, 'url': B}])
            pg = ctx.new_page(); pg.on('dialog', lambda d: d.accept())
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            tag = f'{w}x{h}'
            api('PUT', f'/api/customers/{cid}', KEEP)
            # Customers screen
            pg.goto(B + '/#/customers'); pg.wait_for_selector('.custrow', timeout=15000); time.sleep(0.6)
            rep(tag + ' customers page', pg.evaluate(PAGE))
            pg.fill('#q', KEEP['name'].split()[0]); time.sleep(0.3)
            pg.click(f'.custrow[data-id="{cid}"]'); pg.wait_for_selector('#ced'); time.sleep(0.5)
            rep(tag + ' edit panel (from Customers)', pg.evaluate(PANEL))
            if shot and i == 0: pg.screenshot(path=f'{shot}/edit_panel_phone.png')
            if shot: pg.screenshot(path=f'{shot}/panel_{tag}.png')
            # validation
            pg.fill('#ce_phone', '555-12'); pg.fill('#ce_email', 'bob@'); pg.click('#ceds'); time.sleep(0.4)
            e1 = pg.locator('.ferr[data-for=phone]').inner_text(); e2 = pg.locator('.ferr[data-for=email]').inner_text()
            rep(tag + ' shows phone/email errors and stays open', [] if (e1 and e2 and pg.locator('#ced').count()) else [f'errors: {e1!r} {e2!r}'])
            rep(tag + ' panel with errors', pg.evaluate(PANEL))
            # valid save
            nm = f'UI Test {w}'
            pg.fill('#ce_name', nm); pg.fill('#ce_phone', '212.555.01' + str(10 + i)); pg.fill('#ce_email', f' UI.Test{i}@Example.com'); pg.click('.cseg label:has-text("Email")'); time.sleep(0.2); print('   pref checked:', pg.evaluate("document.querySelector('.cseg input:checked').value")); pg.click('#ceds')
            pg.wait_for_selector('#csaved:not([hidden])', timeout=8000)
            saved_txt = pg.locator('#csaved').inner_text()
            if shot and i == 0: pg.screenshot(path=f'{shot}/saved_phone.png')
            pg.wait_for_selector('#cedm', state='detached', timeout=5000)
            pg.fill('#q', ''); time.sleep(0.2)
            row = pg.locator(f'.custrow[data-id="{cid}"]').inner_text() if pg.locator(f'.custrow[data-id="{cid}"]').count() else ''
            want_phone = f'(212) 555-01{10 + i}'
            rep(tag + ' saved, list updated', [] if ('Saved' in saved_txt and nm in row and want_phone in row and f'ui.test{i}@example.com' in row) else [f'saved={saved_txt!r} row={row!r}'])
            srv = api('GET', f'/api/customers/{cid}')
            rep(tag + ' server has normalised values', [] if (srv['phone'] == want_phone and srv['email'] == f'ui.test{i}@example.com' and srv['contact_pref'] == 'email') else [str({k: srv[k] for k in ('phone', 'email', 'contact_pref')})])
            # new customer: open + cancel
            pg.click('#newcust'); pg.wait_for_selector('#ced'); time.sleep(0.3)
            rep(tag + ' new customer panel', pg.evaluate(PANEL))
            pg.click('#cedc'); pg.wait_for_selector('#cedm', state='detached', timeout=3000)
            # estimate screen
            pg.goto(B + f'/#/job/{job}/estimate'); pg.wait_for_selector('#custblk', timeout=15000); time.sleep(1.2)
            rep(tag + ' estimate customer block', pg.evaluate(PAGE))
            pg.locator('#custedit').scroll_into_view_if_needed(); pg.click('#custedit'); pg.wait_for_selector('#ced'); time.sleep(0.4)
            rep(tag + ' edit panel (from estimate)', pg.evaluate(PANEL))
            nm2 = f'Est Edit {w}'
            pg.fill('#ce_name', nm2); pg.click('#ceds'); pg.wait_for_selector('#cedm', state='detached', timeout=8000)
            blk = pg.locator('#custblk').inner_text(); sub = pg.locator('header.top .sub').inner_text()
            rep(tag + ' estimate updates right away', [] if (nm2 in blk and nm2 in sub) else [f'blk={blk!r} sub={sub!r}'])
            if shot and i == 0: pg.screenshot(path=f'{shot}/estimate_block_phone.png')
            rep(tag + ' no page errors', errs[:3])
            ctx.close()
        br.close()
finally:
    api('PUT', f'/api/customers/{cid}', KEEP); print('restored customer', cid)
print(f'{checks - fails}/{checks} checks passed')
