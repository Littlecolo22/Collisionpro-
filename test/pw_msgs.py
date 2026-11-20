# Messages UI flow: list -> thread -> quick reply -> send (gateway) -> bubble; settings card; employee blocked.
import sys, json
from playwright.sync_api import sync_playwright
B, own, emp, job = sys.argv[1], open(sys.argv[2]).read().strip(), open(sys.argv[3]).read().strip(), sys.argv[4]
send = len(sys.argv) > 5 and sys.argv[5] == 'send'
res = {'passed': 0, 'failed': []}
def chk(n, ok, d=''):
    if ok: res['passed'] += 1
    else: res['failed'].append(f'{n} {d}')
with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h in [(390, 844), (844, 390), (1440, 900)]:
        ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=w < 900, has_touch=True)
        ctx.add_cookies([{'name': 'cp_session', 'value': own, 'url': B}])
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(B + '/#/messages'); pg.wait_for_timeout(1500)
        chk(f'{w} list shows threads', pg.locator('.mt').count() > 0)
        pg.locator(f'.mt[data-j="{job}"]').click(); pg.wait_for_timeout(1500)
        chk(f'{w} thread opens', pg.locator('#mth .mh').count() == 1 and pg.evaluate('location.hash') == f'#/messages/{job}')
        if w < 900: chk(f'{w} list hidden on phone thread', not pg.locator('.mlist').is_visible())
        chk(f'{w} composer visible', pg.locator('#mtx').is_visible())
        r = pg.locator('.mcomp').bounding_box(); chk(f'{w} composer inside screen', r and r['y'] + r['height'] <= h + 1, str(r))
        if pg.locator('[data-q]').first.is_enabled():
            pg.locator('[data-q]').first.click(); chk(f'{w} quick reply fills', 'estimate' in pg.input_value('#mtx').lower())
        if send and w == 1440:
            pg.fill('#mtx', 'UI test text'); n0 = pg.locator('.bb.out').count()
            pg.click('#msend'); pg.wait_for_timeout(2000)
            chk('send adds bubble', pg.locator('.bb.out').count() == n0 + 1, pg.inner_text('#mbody')[-200:])
        if w < 900:
            pg.click('.mh .back'); pg.wait_for_timeout(1200); chk(f'{w} back to list', pg.locator('.mlist').is_visible())
        pg.goto(B + '/#/settings'); pg.wait_for_timeout(2000)
        chk(f'{w} settings texting card', 'SMS Gateway' in pg.inner_text('#smsset'))
        chk(f'{w} password field empty', pg.input_value('#gp') == '')
        chk(f'{w} no js errors', not errs, errs[:2])
        ctx.close()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    ctx.add_cookies([{'name': 'cp_session', 'value': emp, 'url': B}])
    pg = ctx.new_page(); pg.goto(B + '/#/messages'); pg.wait_for_timeout(1500)
    chk('employee sees owner only', 'owner' in pg.inner_text('#main').lower(), pg.inner_text('#main')[:100])
    pg.goto(B + '/#/settings'); pg.wait_for_timeout(1500)
    chk('employee no texting card', pg.locator('#smsset').count() == 0 or 'SMS Gateway' not in pg.inner_text('body'))
    b.close()
print(json.dumps(res, indent=1)); sys.exit(1 if res['failed'] else 0)
