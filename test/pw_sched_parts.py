# Schedule + Parts: add/edit/delete through the UI, employee blocked on server. usage: base owner_tok emp_tok
import sys, json, re
from playwright.sync_api import sync_playwright
B, own, emp = sys.argv[1], open(sys.argv[2]).read().strip(), open(sys.argv[3]).read().strip()
res = {'passed': 0, 'failed': []}
def chk(n, ok, d=''):
    if ok: res['passed'] += 1
    else: res['failed'].append(f'{n} {d}')
TAG = 'ZZTEST'
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    ctx.add_cookies([{'name': 'cp_session', 'value': own, 'url': B}]); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto(B + '/#/schedule'); pg.wait_for_timeout(2000)
    chk('schedule loads', 'coming soon' not in pg.inner_text('#main').lower() and pg.locator('#sadd').count() == 1)
    pg.click('#sadd'); pg.wait_for_timeout(400)
    pg.fill('#et', TAG + ' walk-in'); pg.fill('#es', '2026-11-16T10:30'); pg.click('#esv'); pg.wait_for_timeout(1500)
    ev = pg.locator('[data-ev]', has_text=TAG); chk('event added', ev.count() == 1, pg.inner_text('#main')[:300])
    if ev.count():
        ev.first.click(); pg.wait_for_timeout(400); pg.fill('#et', TAG + ' moved'); pg.click('#esv'); pg.wait_for_timeout(1500)
        chk('event edited', pg.locator('[data-ev]', has_text=TAG + ' moved').count() == 1)
        pg.locator('[data-ev]', has_text=TAG).first.click(); pg.wait_for_timeout(400); pg.click('#edl'); pg.wait_for_timeout(1500)
        chk('event deleted', pg.locator('[data-ev]', has_text=TAG).count() == 0)
    pg.goto(B + '/#/parts'); pg.wait_for_timeout(2000)
    chk('parts loads', pg.locator('#padd').count() == 1)
    pg.click('#padd'); pg.wait_for_timeout(400)
    pg.fill('#pd', TAG + ' bumper cover'); pg.fill('#pc', '100'); pg.fill('#pp', '150'); pg.select_option('#ps', 'ordered'); pg.click('#psv'); pg.wait_for_timeout(1500)
    pr = pg.locator('[data-p]', has_text=TAG); chk('part added', pr.count() == 1, pg.inner_text('#main')[:300])
    if pr.count():
        pr.first.click(); pg.wait_for_timeout(400); pg.select_option('#ps', 'returned'); pg.fill('#prr', 'Wrong part'); pg.fill('#pcr', '100'); pg.click('#psv'); pg.wait_for_timeout(1500)
        pg.locator('[data-f="returned"]').click(); pg.wait_for_timeout(1200)
        chk('part returned shows', pg.locator('[data-p]', has_text=TAG).count() == 1)
        pg.locator('[data-p]', has_text=TAG).first.click(); pg.wait_for_timeout(400); pg.click('#pdl'); pg.wait_for_timeout(1500)
        pg.locator('[data-f="all"]').click(); pg.wait_for_timeout(1200)
        chk('part deleted', pg.locator('[data-p]', has_text=TAG).count() == 0)
    chk('no page errors', not errs, errs[:2])
    for path in ['/api/sched', '/api/parts2', '/api/sched/events', '/api/parts2/vendors']:
        r = pg.request.fetch(B + path, method='GET', headers={'Cookie': f'cp_session={emp}'})
        chk('employee blocked ' + path, r.status in (401, 403, 404, 405) and r.status != 200, r.status)
    r = pg.request.post(B + '/api/sched/events', data={'title': 'x', 'start': '2026-11-16 10:00'}, headers={'Cookie': f'cp_session={emp}'})
    chk('employee cannot add event', r.status == 403, r.status)
    r = pg.request.post(B + '/api/parts2', data={'job_id': 1, 'description': 'x'}, headers={'Cookie': f'cp_session={emp}'})
    chk('employee cannot add part', r.status == 403, r.status)
    ectx = b.new_context(viewport={'width': 390, 'height': 844}); ectx.add_cookies([{'name': 'cp_session', 'value': emp, 'url': B}]); e = ectx.new_page()
    for h in ('#/schedule', '#/parts'):
        e.goto(B + '/' + h); e.wait_for_timeout(1500); chk('employee sees owner only ' + h, 'owner only' in e.inner_text('body').lower())
    b.close()
print(json.dumps(res, indent=1)); sys.exit(1 if res['failed'] else 0)
