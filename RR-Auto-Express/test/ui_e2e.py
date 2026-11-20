# Headless end-to-end UI test: python3 test/ui_e2e.py [base_url] [password]
import sys, json, time, os
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8787'
PW = sys.argv[2] if len(sys.argv) > 2 else 'LocalOwner123!'
OUT = '/home/sprite/collision_app/shots'; os.makedirs(OUT, exist_ok=True)
VINS = [('1HGCV1F34LA000000', 'sedan'), ('1FTFW1E50KFA00000', 'pickup'), ('5FNRL6H78KB000000', 'minivan')]
errors = []; results = []
def ok(name, cond, extra=''):
    results.append((name, bool(cond), extra)); print(('PASS ' if cond else 'FAIL ') + name, extra)

def run(p, mobile):
    tag = 'phone' if mobile else 'desktop'
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 412, 'height': 915} if mobile else {'width': 1440, 'height': 900}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page()
    pg.on('console', lambda m: m.type == 'error' and errors.append(f'{tag}: {m.text}'))
    pg.on('pageerror', lambda e: errors.append(f'{tag} pageerror: {e}'))
    pg.goto(BASE + '/'); pg.wait_for_selector('#lf')
    pg.fill('[name=email]', 'owner@collisionpro.app'); pg.fill('[name=password]', PW); pg.click('#lf button')
    pg.wait_for_selector('#jl .it', timeout=15000); ok(f'{tag} login + estimates list', True)
    vins = VINS if not mobile else VINS[:2]
    for vin, expect in vins:
        pg.goto(BASE + '/#/new'); pg.wait_for_selector('#vin')
        pg.fill('#vin', vin); pg.click('#dec')
        try:
            pg.wait_for_selector('#decoded .grid2', timeout=20000); dec = pg.inner_text('#decoded')
        except Exception: dec = ''
        ok(f'{tag} decode {vin}', expect in dec.lower() or (expect == 'pickup' and 'pickup' in dec.lower()), dec.replace('\n', ' ')[:140])
        pg.fill('[name=cname]', 'Test ' + expect); pg.fill('[name=color]', {'sedan': 'Lunar Silver', 'pickup': 'Race Red', 'minivan': 'Modern Steel'}[expect])
        pg.click('#create'); pg.wait_for_selector('#v3 canvas', timeout=15000); time.sleep(2.5)
        info = pg.inner_text('#vinfo'); ok(f'{tag} 3D model for {expect}', expect.lower() in info.lower() or (expect == 'pickup' and 'Pickup' in info), info.replace('\n', ' | ')[:160])
        pg.screenshot(path=f'{OUT}/{tag}_3d_{expect}.png')
        if expect == 'sedan' or (mobile and expect == 'sedan'):
            job_url = pg.url
            # tap a part in the center-ish of the car (front fender/door area) via the list instead for reliability, then a canvas tap
            box = pg.locator('#v3 canvas').bounding_box()
            pg.mouse.click(box['x'] + box['width'] * 0.5, box['y'] + box['height'] * 0.55); time.sleep(0.8)
            tapped = pg.locator('#sheet:not(.hide)').count() > 0
            ok(f'{tag} tap part on model opens sheet', tapped, pg.inner_text('#sheet b') if tapped else '')
            if tapped:
                pg.screenshot(path=f'{OUT}/{tag}_tap_sheet.png')
                pg.click('#sheet .pf [data-go]'); pg.wait_for_selector('#sheet.hide', state='attached', timeout=10000); time.sleep(0.6)
            # parts list: hood replace
            pg.fill('#pq', 'hood'); time.sleep(0.3)
            pg.locator('#pl .p').first.click(); pg.wait_for_selector('#sheet:not(.hide) .pf'); pg.click('#sheet .pf [data-go]'); time.sleep(1.2)
            ok(f'{tag} add from parts list', 'lines' in pg.inner_text('#td'), pg.inner_text('#td'))
            # drill into the front left door from the parts list
            pg.fill('#pq', 'window regulator'); time.sleep(0.3)
            pg.locator('#pl .p').first.click(); time.sleep(1.5)
            mode_drill = pg.locator('#vb:not([hidden])').count() > 0
            ok(f'{tag} drill into door', mode_drill, pg.inner_text('#vstyle'))
            if pg.locator('#sheet:not(.hide) .pf').count():
                pg.click('#sheet .pf [data-op=replace]') if pg.locator('#sheet .pf [data-op=replace]').count() else None
                pg.click('#sheet .pf [data-go]'); time.sleep(1.0)
            pg.screenshot(path=f'{OUT}/{tag}_drill_door.png')
            pg.click('#vb'); time.sleep(0.5)
            pg.click('#vi'); time.sleep(1.0)
            pg.fill('#pq', 'airbag'); time.sleep(0.3)
            pg.locator('#pl .p').first.click(); time.sleep(0.8)
            pg.screenshot(path=f'{OUT}/{tag}_interior.png')
            ok(f'{tag} interior view', pg.locator('#vi.on').count() > 0)
            if pg.locator('#sheet:not(.hide) .pf').count(): pg.click('#sheet .pf [data-go]'); time.sleep(1.0)
            # grid
            jid = job_url.split('/job/')[1].split('/')[0]
            pg.goto(f'{BASE}/#/job/{jid}/estimate'); pg.wait_for_selector('#eg tbody tr[data-id]', timeout=15000)
            n = pg.locator('#eg tbody tr[data-id]').count(); ok(f'{tag} grid shows lines', n >= 3, f'{n} lines')
            first = pg.locator('#eg tbody tr[data-id]').first
            inp = first.locator('[data-f=labor_hours]'); inp.fill('2.5'); inp.press('Tab'); time.sleep(1.2)
            tot1 = pg.inner_text('#tot'); ok(f'{tag} edit line updates totals', 'Total' in tot1)
            pg.check('#sa'); time.sleep(0.3); ok(f'{tag} bulk bar', pg.locator('#bulk:not([hidden])').count() > 0, pg.inner_text('#bc'))
            pg.select_option('#bf', 'markup_pct'); pg.fill('#bv', '10'); pg.click('#bset'); time.sleep(1.5)
            pg.screenshot(path=f'{OUT}/{tag}_grid.png', full_page=False)
            mk = pg.locator('#eg tbody tr[data-id] [data-f=markup_pct]')
            ok(f'{tag} bulk set markup', mk.count() == 0 or mk.first.input_value() == '10')
            pg.goto(f'{BASE}/#/job/{jid}/finish'); pg.wait_for_selector('#gen'); pg.click('#gen')
            pg.wait_for_selector('#dl:not([hidden])', timeout=20000); ok(f'{tag} PDF generated', True)
            pg.click('#ln'); time.sleep(1.5); link = pg.input_value('#lnv'); ok(f'{tag} share link', '/p/' in link or '/s/' in link or 'http' in link, link)
            if not mobile:
                pg.goto(f'{BASE}/#/job/{jid}/3d'); pg.wait_for_selector('#tad', timeout=8000) if pg.locator('#tad').count() or True else None
                time.sleep(1.5)
                if pg.locator('#tad').count():
                    pg.click('#tad'); time.sleep(3); txt = pg.inner_text('#pad'); ok('desktop Autodoc panel', 'mock' in txt.lower() or 'autodoc' in txt.lower(), txt.replace('\n', ' ')[:200])
                    pg.screenshot(path=f'{OUT}/desktop_autodoc.png')
    b.close()

with sync_playwright() as p:
    run(p, False); run(p, True)
print('CONSOLE ERRORS:', json.dumps(errors[:20], indent=1))
print('SUMMARY', sum(1 for r in results if r[1]), '/', len(results))
