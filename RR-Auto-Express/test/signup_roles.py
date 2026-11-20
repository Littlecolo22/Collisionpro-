# Live test: sign-up, owner screens, employee creation and employee restrictions.
# python3 test/signup_roles.py base_url
import sys, time, json, secrets
from playwright.sync_api import sync_playwright
BASE = sys.argv[1]
OWN_PW = 'Test-' + secrets.token_hex(6)
EMP_PW = 'Emp-' + secrets.token_hex(6)
res, errs = [], []
def ok(name, cond, extra=''):
    res.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name, extra)

def api(pg, method, path, body=None):
    return pg.evaluate("""async ([m,p,b]) => { const r = await fetch(p, {method:m, headers:{'content-type':'application/json'}, body: b ? JSON.stringify(b) : undefined, credentials:'same-origin'}); let j=null; try { j = await r.json(); } catch {} return {status:r.status, body:j}; }""", [method, path, body])

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for mobile in (False, True):
        tag = 'phone' if mobile else 'desktop'
        ctx = b.new_context(viewport={'width': 412, 'height': 915} if mobile else {'width': 1440, 'height': 900}, is_mobile=mobile, has_touch=mobile)
        pg = ctx.new_page()
        pg.on('console', lambda m, t=tag: m.type == 'error' and errs.append(f'{t}: {m.text[:160]}'))
        pg.on('pageerror', lambda e, t=tag: errs.append(f'{t} pageerror: {str(e)[:160]}'))
        pg.goto(BASE + '/'); pg.wait_for_selector('#lf'); time.sleep(1.5)
        ok(f'{tag}: login shows shop name', pg.inner_text('#lsn') == 'R&R Auto Express', pg.inner_text('#lsn'))
        ok(f'{tag}: tab title', pg.title() == 'R&R Auto Express', pg.title())
        if not mobile:
            ok('create-account link visible', pg.is_visible('#sua'))
            pg.click('#sua'); pg.wait_for_selector('#sf')
            ok('signup prefilled shop name', pg.input_value('[name=shop_name]') == 'R&R Auto Express')
            ok('no setup code field', pg.locator('[name=code]').count() == 0)
            pg.fill('[name=name]', 'Test Owner'); pg.fill('[name=email]', 'test.owner@example.com')
            pg.fill('[name=password]', OWN_PW); pg.fill('[name=password2]', OWN_PW + 'x'); pg.click('#sf button'); time.sleep(1.5)
            ok('mismatched passwords stop sign-up', pg.is_visible('#sf'))
            pg.fill('[name=password2]', OWN_PW); pg.click('#sf button')
            pg.wait_for_selector('#jl', timeout=20000); time.sleep(2)
            ok('signup lands on estimates', '#/jobs' in pg.url)
            ok('empty estimate list (no samples)', pg.locator('#jl .it').count() == 0, pg.inner_text('#jl')[:80])
            ok('header shows shop name', 'R&R Auto Express' in pg.inner_text('.brand'))
            r = api(pg, 'GET', '/api/signup'); ok('signup closed after use', r['body']['open'] is False)
            r = api(pg, 'POST', '/api/signup', {'shop_name': 'X', 'name': 'Y', 'email': 'a@b.co', 'password': 'x' * 12}); ok('second signup refused', r['status'] in (403, 429), r['status'])
            r = api(pg, 'GET', '/api/customers'); ok('no sample customers', r['status'] == 200 and len(r['body'] if isinstance(r['body'], list) else r['body'].get('customers', r['body'].get('rows', []))) == 0, str(r['body'])[:80])
            # owner: settings visible, add employee
            pg.goto(BASE + '/#/settings'); pg.wait_for_selector('#ea', timeout=15000); time.sleep(1.5)
            ok('owner sees Settings with Employees', pg.is_visible('#emp'))
            pg.fill('#en', 'Test Employee'); pg.fill('#ee', 'test.employee@example.com'); pg.fill('#ep', EMP_PW); pg.click('#ea'); time.sleep(2.5)
            ok('employee added', 'test.employee@example.com' in pg.inner_text('#el'))
            r = api(pg, 'POST', '/api/users', {'name': 'Z', 'email': 'z@example.com', 'password': 'x' * 12, 'role': 'owner'}); ok('second owner refused', r['status'] == 403, r['status'])
            # owner new estimate via VIN
            pg.goto(BASE + '/#/new'); time.sleep(2)
            r = api(pg, 'GET', '/api/vin/1HGCV1F34LA000001')
            ok('VIN decode works', r['status'] == 200 and r['body'].get('make'), (r['body'] or {}).get('make'))
            if r['body'] and r['body'].get('model3d'):
                print('   model3d:', json.dumps(r['body']['model3d']))
            pg.click('#lo') if pg.locator('#lo').count() else None
            api(pg, 'POST', '/api/logout'); ctx.close()
        else:
            pg.fill('[name=email]', 'test.employee@example.com'); pg.fill('[name=password]', EMP_PW); pg.click('#lf button')
            pg.wait_for_selector('#jl', timeout=20000); time.sleep(2)
            nav = pg.inner_text('#nav')
            ok('employee nav: estimates only', 'Estimates' in nav and 'Settings' not in nav and 'Invoices' not in nav and 'Reports' not in nav, nav.replace('\n', ' | ')[:160])
            for path, want in [('/api/settings', 'subset'), ('/api/locations', 403), ('/api/users', 403), ('/api/reports', 403), ('/api/ar', 403), ('/api/dashboard', 403), ('/api/paint/formulas', 403)]:
                r = api(pg, 'GET', path)
                if want == 'subset':
                    ok('employee settings = safe subset', r['status'] == 200 and set(r['body'].keys()) <= {'shop_name', 'vin_parts_provider', 'model_library_url'}, list(r['body'].keys()))
                else:
                    ok(f'employee blocked {path}', r['status'] == want, r['status'])
            r = api(pg, 'PUT', '/api/settings', {'shop_name': 'Hacked'}); ok('employee cannot change settings', r['status'] == 403, r['status'])
            r = api(pg, 'POST', '/api/users', {'name': 'Z', 'email': 'z2@example.com', 'password': 'x' * 12, 'role': 'employee'}); ok('employee cannot add users', r['status'] == 403, r['status'])
            # employee creates estimate via UI
            r = api(pg, 'POST', '/api/customers', {'name': 'Test Customer', 'phone': '5555550100'})
            cid = (r['body'] or {}).get('id')
            r = api(pg, 'POST', '/api/jobs', {'customer_id': cid, 'vin': '1HGCV1F34LA000001', 'vehicle': {'vin': '1HGCV1F34LA000001', 'year': 2020, 'make': 'Honda', 'model': 'Accord', 'color': 'Red'}})
            jid = (r['body'] or {}).get('id')
            ok('employee creates estimate', r['status'] == 200 and jid, str(r['body'])[:120])
            if jid:
                r = api(pg, 'POST', f'/api/jobs/{jid}/lines', {'operation': 'replace', 'description': 'Front bumper cover', 'part_type': 'OEM', 'qty': 1, 'unit_price': 410, 'labor_hours': 2.5})
                ok('employee adds line', r['status'] == 200, r['status'])
                r = api(pg, 'GET', f'/api/jobs/{jid}')
                bd = r['body'] or {}
                ok('employee job bundle hides money data', r['status'] == 200 and bd.get('invoices') == [] and bd.get('gp') is None and set((bd.get('location') or {}).keys()) <= {'id', 'name'}, list((bd.get('location') or {}).keys()))
                ok('3D sized to real model', (bd.get('model3d') or {}).get('dims_source') == 'model', json.dumps(bd.get('model3d')))
                r = api(pg, 'POST', f'/api/jobs/{jid}/invoice', {}); ok('employee cannot invoice', r['status'] == 403, r['status'])
                pg.goto(BASE + f'/#/job/{jid}/3d'); time.sleep(6)
                ok('3D picker renders for employee', pg.locator('canvas').count() > 0, pg.inner_text('#vstyle') if pg.locator('#vstyle').count() else '')
                pg.goto(BASE + f'/#/job/{jid}/finish'); time.sleep(2)
                r = pg.evaluate(f"fetch('/api/jobs/{jid}/pdf').then(r => [r.status, r.headers.get('content-type')])")
                ok('employee gets PDF', r[0] == 200 and 'pdf' in (r[1] or ''), r)
                pdf = pg.evaluate(f"fetch('/api/jobs/{jid}/pdf').then(r => r.arrayBuffer()).then(b => {{ const u = new Uint8Array(b); let s=''; for (const c of u) s += String.fromCharCode(c); return s; }})")
                open('/tmp/emp_test.pdf', 'wb').write(pdf.encode('latin-1'))
            ctx.close()
    b.close()
print('OWNER_PW', OWN_PW)
print('RESULT', sum(1 for _, c in res if c), 'of', len(res), 'passed')
print('CONSOLE ERRORS', len(errs), errs[:6])
