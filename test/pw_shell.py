# Dark look + bottom menu checks.
# usage: python3 test/pw_shell.py BASE OWNER_SESSION_FILE [EMPLOYEE_SESSION_FILE] [shotdir]
import sys, os, json
from playwright.sync_api import sync_playwright
B = sys.argv[1].rstrip('/'); own = open(sys.argv[2]).read().strip()
emp = open(sys.argv[3]).read().strip() if len(sys.argv) > 3 and sys.argv[3] != '-' else ''
SH = sys.argv[4] if len(sys.argv) > 4 else '/tmp/shell_shots'; os.makedirs(SH, exist_ok=True)
ok = 0; bad = []
def chk(name, cond, info=''):
    global ok
    if cond: ok += 1
    else: bad.append(f'{name} {info}')
OWNER_PAGES = ['jobs','customers','production','schedule','parts','paint','invoices','reports','insurers','compliance','messages','portal','settings','account','help']
with sync_playwright() as p:
    br = p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
    errs = []
    def mk(sess, w, h, mobile):
        ctx = br.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
        if sess: ctx.add_cookies([{'name': 'cp_session', 'value': sess, 'url': B}])
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:200])); return ctx, pg
    # ---- sign-in screen (phone)
    ctx, pg = mk('', 390, 844, True); pg.goto(B + '/'); pg.wait_for_selector('#lf')
    bg = pg.evaluate("getComputedStyle(document.body).backgroundColor")
    chk('login dark bg', bg in ('rgb(6, 6, 8)',), bg)
    ff = pg.evaluate("getComputedStyle(document.querySelector('.authh')).fontFamily")
    chk('login font', 'Inter' in ff, ff)
    pg.wait_for_timeout(400); pg.screenshot(path=f'{SH}/phone_signin.png'); ctx.close()
    # ---- owner, phone
    ctx, pg = mk(own, 390, 844, True); pg.goto(B + '/#/jobs'); pg.wait_for_selector('#bnav'); pg.wait_for_timeout(1500)
    chk('side nav hidden on phone', not pg.is_visible('#nav'))
    chk('bottom bar visible', pg.is_visible('#bnav'))
    labels = pg.eval_on_selector_all('#bscroll .bi', 'els=>els.map(e=>e.dataset.k)')
    chk('owner sees all pages', labels == OWNER_PAGES, str(labels))
    chk('bar is swipeable', pg.evaluate("(()=>{const b=document.querySelector('#bscroll');return b.scrollWidth>b.clientWidth+50})()"))
    chk('fade on right at start', pg.evaluate("document.querySelector('#bscroll').classList.contains('fr')"))
    chk('fab visible', pg.is_visible('#fab'))
    r = pg.evaluate("(()=>{const b=document.querySelector('#bnav').getBoundingClientRect();return [b.top,b.bottom,innerHeight]})()")
    chk('bar pinned to bottom', abs(r[1] - r[2]) < 2, str(r))
    tg = pg.evaluate("[...document.querySelectorAll('#bscroll .bi')].every(e=>{const r=e.getBoundingClientRect();return r.height>=48&&r.width>=48})")
    chk('bar tap targets >=48px', tg)
    chk('hero card shown', pg.locator('.hero').count() >= 1, str(pg.locator('.hero').count()))
    pg.wait_for_timeout(1500)
    tot = pg.eval_on_selector_all('.wpill', 'els=>els.map(e=>e.textContent)')
    chk('hero totals loaded', len(tot) > 0 and all(t.startswith('$') for t in tot), str(tot))
    pg.screenshot(path=f'{SH}/phone_estimates.png')
    # search filters
    pg.fill('#q', 'zzzz-no-match'); chk('search filters', 'No estimates match' in pg.inner_text('#jl')); pg.fill('#q', '')
    # swipe to a far page and make sure it is highlighted and scrolled into view
    pg.click('#bscroll .bi[data-k="jobs"]')
    pg.evaluate("document.querySelector('#bscroll').scrollLeft=9999"); pg.wait_for_timeout(200)
    chk('fade on left after swipe', pg.evaluate("document.querySelector('#bscroll').classList.contains('fl')"))
    pg.click('#bscroll .bi[data-k="settings"]'); pg.wait_for_timeout(1200)
    chk('settings route', pg.evaluate('location.hash') == '#/settings')
    vis = pg.evaluate("(()=>{const b=document.querySelector('#bscroll'),a=b.querySelector('.bi.act');if(!a)return 'none';const R=b.getBoundingClientRect(),r=a.getBoundingClientRect();return a.dataset.k+':'+(r.left>=R.left-1&&r.right<=R.right+1)})()")
    chk('current page highlighted + in view', vis == 'settings:true', vis)
    pg.goto(B + '/#/help'); pg.wait_for_timeout(800)
    vis = pg.evaluate("(()=>{const b=document.querySelector('#bscroll'),a=b.querySelector('.bi.act');const R=b.getBoundingClientRect(),r=a.getBoundingClientRect();return a.dataset.k+':'+(r.left>=R.left-1&&r.right<=R.right+1)})()")
    chk('deep link: last page in view', vis == 'help:true', vis)
    pg.goto(B + '/#/production'); pg.wait_for_timeout(900)
    chk('production board renders', 'coming soon' not in pg.inner_text('#main').lower() and pg.query_selector('#main .page') is not None)
    pg.click('#fab'); pg.wait_for_timeout(800)
    chk('fab opens new estimate', pg.evaluate('location.hash') == '#/new')
    chk('fab highlighted on new', pg.evaluate("document.querySelector('#fab').classList.contains('act')"))
    pg.goto(B + '/#/account'); pg.wait_for_timeout(800)
    chk('account has sign out', pg.is_visible('#so'))
    pg.screenshot(path=f'{SH}/phone_account.png')
    pg.goto(B + '/#/settings'); pg.wait_for_timeout(1200); pg.screenshot(path=f'{SH}/phone_settings.png')
    # estimate screen still opens with the bar
    jid = pg.evaluate("fetch('/api/jobs').then(r=>r.json()).then(j=>(Array.isArray(j)?j:j.jobs)[0]?.id)")
    if jid:
        pg.goto(f'{B}/#/job/{jid}/estimate'); pg.wait_for_timeout(1500)
        chk('job screen: estimates highlighted', pg.evaluate("document.querySelector('#bscroll .bi.act')?.dataset.k") == 'jobs')
        pg.screenshot(path=f'{SH}/phone_job.png')
    ctx.close()
    # ---- owner, desktop
    ctx, pg = mk(own, 1366, 900, False); pg.goto(B + '/#/jobs'); pg.wait_for_selector('#nav'); pg.wait_for_timeout(1500)
    chk('desktop side menu', pg.is_visible('#nav'))
    chk('desktop no bottom bar', not pg.is_visible('#bnav'))
    chk('desktop new button', pg.is_visible('.top .dk'))
    pg.screenshot(path=f'{SH}/desk_estimates.png')
    pg.click('#nav a[href="#/customers"]'); pg.wait_for_timeout(800)
    chk('desktop nav works', pg.evaluate('location.hash') == '#/customers')
    ctx.close()
    # ---- employee, phone
    if emp:
        ctx, pg = mk(emp, 390, 844, True); pg.goto(B + '/#/jobs'); pg.wait_for_selector('#bnav'); pg.wait_for_timeout(1000)
        labels = pg.eval_on_selector_all('#bscroll .bi', 'els=>els.map(e=>e.dataset.k)')
        chk('employee sees Estimates + My account', labels == ['jobs', 'account'], str(labels))
        chk('employee has + button', pg.is_visible('#fab'))
        dl = pg.eval_on_selector_all('#nav a', 'els=>els.map(e=>e.getAttribute("href"))')
        chk('employee desktop menu', dl == ['#/jobs', '#/new', '#/account'], str(dl))
        pg.screenshot(path=f'{SH}/phone_employee.png'); ctx.close()
    br.close()
chk('no page errors', not errs, str(errs[:3]))
print(json.dumps({'passed': ok, 'failed': bad}, indent=1))
