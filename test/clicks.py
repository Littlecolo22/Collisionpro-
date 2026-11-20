# Click-through check of list/tab/new buttons: python3 test/clicks.py base_url password
import sys, time
from playwright.sync_api import sync_playwright
BASE, PW = sys.argv[1], sys.argv[2]
errs = []
with sync_playwright() as p:
    for mobile in (False, True):
        tag = 'phone' if mobile else 'desktop'
        b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = b.new_context(viewport={'width': 412, 'height': 915} if mobile else {'width': 1440, 'height': 900}, is_mobile=mobile, has_touch=mobile)
        pg = ctx.new_page()
        pg.on('console', lambda m, t=tag: m.type == 'error' and errs.append(f'{t}: {m.text[:120]}'))
        pg.goto(BASE + '/'); pg.wait_for_selector('#lf')
        pg.fill('[name=email]', 'owner@collisionpro.app'); pg.fill('[name=password]', PW); pg.click('#lf button')
        pg.wait_for_selector('#jl .it', timeout=15000)
        pg.locator('#jl .it').first.click(); time.sleep(2)
        print(tag, 'list click ->', pg.url.split('#')[-1])
        pg.locator('.tabs button', has_text='3D picker').click(); time.sleep(2)
        print(tag, '3D tab ->', pg.url.split('#')[-1], 'canvas' if pg.locator('canvas').count() else 'no canvas')
        pg.locator('.tabs button', has_text='PDF').click(); time.sleep(1.5)
        print(tag, 'PDF tab ->', pg.url.split('#')[-1])
        pg.goto(BASE + '/#/jobs'); pg.wait_for_selector('#jl .it'); pg.locator('button.pri', has_text='+').first.click(); time.sleep(1.5)
        print(tag, 'New button ->', pg.url.split('#')[-1])
        b.close()
print('CONSOLE ERRORS', len(errs), errs[:5])
