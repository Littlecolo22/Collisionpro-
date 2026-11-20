# Portal extras: photo actually loads, invoice + balance section, PDF links answer. usage: base owner_tok photo_job invoice_job
import sys, json
from playwright.sync_api import sync_playwright
B, own, pj, ij = sys.argv[1], open(sys.argv[2]).read().strip(), sys.argv[3], sys.argv[4]
res = {'passed': 0, 'failed': []}
def chk(n, ok, d=''):
    if ok: res['passed'] += 1
    else: res['failed'].append(f'{n} {d}')
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    ctx.add_cookies([{'name': 'cp_session', 'value': own, 'url': B}]); pg = ctx.new_page()
    links = {}
    for j in (pj, ij):
        pg.goto(B + f'/#/portal/{j}'); pg.wait_for_timeout(1800); links[j] = pg.input_value('#plu')
    pub = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); q = pub.new_page()
    q.goto(links[pj]); q.wait_for_timeout(2500)
    chk('photo loads', q.evaluate("[...document.querySelectorAll('.photos img')].some(i=>i.complete&&i.naturalWidth>50)"))
    q.locator('[data-ph]').first.click(); q.wait_for_timeout(500); chk('photo opens big', q.locator('.lb img').count() == 1); q.locator('.lb').click()
    tok = links[pj].split('/p/')[1]
    r = q.request.get(B + f'/api/portal/{tok}/pdf'); chk('estimate pdf', r.status == 200 and r.headers['content-type'] == 'application/pdf', r.status)
    q.goto(links[ij]); q.wait_for_timeout(2500); t = q.inner_text('body')
    chk('invoice section', 'Invoice and balance' in t and 'Balance due' in t, t[-400:])
    tok = links[ij].split('/p/')[1]
    r = q.request.get(B + f'/api/portal/{tok}/pdf?kind=invoice'); chk('invoice pdf', r.status == 200 and r.headers['content-type'] == 'application/pdf', r.status)
    r = q.request.get(B + f'/api/portal-admin'); chk('portal visitor cannot reach owner api', r.status in (401, 403), r.status)
    q.screenshot(path='/tmp/portal_invoice_phone.png', full_page=True)
    b.close()
print(json.dumps(res, indent=1)); sys.exit(1 if res['failed'] else 0)
