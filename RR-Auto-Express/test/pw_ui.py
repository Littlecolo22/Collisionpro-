# UI check: owner resets an employee password from Settings, employee signs in and uses My account.
import sys, time, json, secrets
from playwright.sync_api import sync_playwright
BASE, OWNER = sys.argv[1], sys.argv[2]
P1, P2, P3 = 'Ui1-' + secrets.token_hex(5), 'Ui2-' + secrets.token_hex(5), 'Ui3-' + secrets.token_hex(5)
EM = 'pwtest.employee@example.com'
res, errs = [], []
def ok(n, c, x=''):
    res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n, x)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True)
    ctx.add_cookies([{'name': 'cp_session', 'value': OWNER, 'url': BASE}])
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:150]))
    pg.goto(BASE + '/#/settings'); pg.wait_for_selector('#ea', timeout=20000); time.sleep(1.5)
    pg.fill('#en', 'PW Test'); pg.fill('#ee', EM); pg.fill('#ep', P1); pg.click('#ea'); time.sleep(2.5)
    row = pg.locator('#el .row', has_text=EM)
    ok('employee listed', row.count() == 1)
    row.locator('[data-pw]').click(); time.sleep(0.5)
    pg.fill('.pwr input', P2); pg.click('.pwr button'); time.sleep(2.5)
    ok('reset form closed after save', pg.locator('.pwr').count() == 0)
    ctx.close()
    ctx = b.new_context(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:150]))
    pg.goto(BASE + '/'); pg.wait_for_selector('#lf')
    pg.fill('[name=email]', 'PWTest.Employee@example.com '); pg.fill('[name=password]', P2); pg.click('#lf button')
    try: pg.wait_for_selector('#jl', timeout=15000); ok('employee signs in after owner reset (UI)', True)
    except Exception: ok('employee signs in after owner reset (UI)', False)
    pg.goto(BASE + '/#/account'); pg.wait_for_selector('#cpf', timeout=10000)
    ok('My account in employee menu', 'My account' in pg.inner_text('#nav'))
    pg.fill('[name=cur]', P2); pg.fill('[name=pw]', P3); pg.fill('[name=pw2]', P3); pg.click('#cpf button'); time.sleep(2.5)
    pg.evaluate("fetch('/api/logout',{method:'POST'})"); time.sleep(1)
    pg.goto(BASE + '/'); pg.wait_for_selector('#lf')
    pg.fill('[name=email]', EM); pg.fill('[name=password]', P3); pg.click('#lf button')
    try: pg.wait_for_selector('#jl', timeout=15000); ok('employee signs in after changing own password (UI)', True)
    except Exception: ok('employee signs in after changing own password (UI)', False)
    b.close()
print('RESULT', sum(res), 'of', len(res), 'passed; page errors', len(errs), errs[:3])
