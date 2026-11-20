# Customer portal (public page) + owner admin screen. usage: pw_portal.py base owner_tok emp_tok job_id outdir [sign]
import sys, json, os, re, urllib.request
from playwright.sync_api import sync_playwright
B, own, emp, job, out = sys.argv[1], open(sys.argv[2]).read().strip(), open(sys.argv[3]).read().strip(), sys.argv[4], sys.argv[5]
sign = len(sys.argv) > 6 and sys.argv[6] == 'sign'
os.makedirs(out, exist_ok=True)
res = {'passed': 0, 'failed': []}
def chk(n, ok, d=''):
    if ok: res['passed'] += 1
    else: res['failed'].append(f'{n} {d}')
LAYOUT = """()=>{const W=innerWidth;const bad=[];const sw=document.scrollingElement.scrollWidth;if(sw>W+1)bad.push('page scrolls sideways '+sw);
document.querySelectorAll('body *').forEach(e=>{const cs=getComputedStyle(e);if(cs.display==='none'||cs.visibility==='hidden')return;const r=e.getBoundingClientRect();if(!r.width)return;
if(r.right>W+1&&!e.closest('.photos,.lb,.pgrid,.qr,.bnav,.rail'))bad.push('off right: '+e.tagName+'.'+e.className+' '+Math.round(r.right));
if(['B','SPAN','H1','H2','H3','LABEL','A','BUTTON','SMALL','P'].includes(e.tagName)&&e.scrollWidth>e.clientWidth+2&&cs.overflow!=='visible'&&cs.textOverflow!=='ellipsis'&&e.clientWidth>0)bad.push('clipped: '+e.tagName+'.'+e.className+' '+(e.textContent||'').trim().slice(0,30))});
const bs=[...document.querySelectorAll('button,a.btn,input,textarea')].filter(e=>e.offsetParent).map(e=>[e,e.getBoundingClientRect()]);
for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++){const a=bs[i][1],b=bs[j][1];if(bs[i][0].contains(bs[j][0])||bs[j][0].contains(bs[i][0]))continue;const ox=Math.min(a.right,b.right)-Math.max(a.left,b.left),oy=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);if(ox>2&&oy>2)bad.push('overlap: '+(bs[i][0].textContent||bs[i][0].id).trim().slice(0,20)+' / '+(bs[j][0].textContent||bs[j][0].id).trim().slice(0,20))}
return bad.slice(0,8)}"""
SIZES = [(390, 844, True, 'phone'), (844, 390, True, 'land'), (1440, 900, False, 'desk'), (980, 1900, True, 'dsite')]
with sync_playwright() as p:
    b = p.chromium.launch()
    # owner admin
    for w, h, mob, nm in SIZES:
        ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=mob, has_touch=True)
        ctx.add_cookies([{'name': 'cp_session', 'value': own, 'url': B}])
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(B + '/#/portal'); pg.wait_for_timeout(1800)
        chk(f'{nm} admin list', pg.locator('.pcard').count() > 0)
        chk(f'{nm} admin list layout', not pg.evaluate(LAYOUT), pg.evaluate(LAYOUT))
        pg.goto(B + f'/#/portal/{job}'); pg.wait_for_timeout(1800)
        url = pg.input_value('#plu')
        chk(f'{nm} admin link shown', '/p/' in url, url)
        chk(f'{nm} admin job layout', not pg.evaluate(LAYOUT), pg.evaluate(LAYOUT))
        pg.screenshot(path=f'{out}/admin_{nm}.png')
        chk(f'{nm} no js errors', not errs, errs[:2])
        ctx.close()
    # public portal
    for w, h, mob, nm in SIZES:
        ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=mob, has_touch=True)
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(url); pg.wait_for_timeout(2000)
        t = pg.inner_text('body')
        chk(f'{nm} portal loads', 'Repair status' in t and 'Estimate' in t, t[:200])
        chk(f'{nm} portal layout', not pg.evaluate(LAYOUT), pg.evaluate(LAYOUT))
        pg.screenshot(path=f'{out}/portal_{nm}.png', full_page=True)
        chk(f'{nm} portal no js errors', not errs, errs[:2])
        if sign and nm == 'phone' and pg.locator('#sig').count():
            pg.fill('#an', 'Test Customer')
            pg.locator('#sig').scroll_into_view_if_needed(); bx = pg.locator('#sig').bounding_box()
            pg.mouse.move(bx['x'] + 30, bx['y'] + 60); pg.mouse.down(); pg.mouse.move(bx['x'] + 150, bx['y'] + 100, steps=8); pg.mouse.move(bx['x'] + 250, bx['y'] + 50, steps=8); pg.mouse.up()
            pg.click('#sok'); pg.wait_for_timeout(2000)
            chk('portal approve', 'Approved by Test Customer' in pg.inner_text('body'), pg.inner_text('#appr')[:200])
            pg.fill('#pmt', 'Portal test message'); pg.click('#pms'); pg.wait_for_timeout(1500)
            chk('portal message', 'Portal test message' in pg.inner_text('#pmsgs'))
        ctx.close()
    # employee blocked
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True)
    ctx.add_cookies([{'name': 'cp_session', 'value': emp, 'url': B}])
    pg = ctx.new_page(); pg.goto(B + '/#/portal'); pg.wait_for_timeout(1500)
    chk('employee owner only', 'owner' in pg.inner_text('#main').lower())
    b.close()
# bad token
try: urllib.request.urlopen(urllib.request.Request(B + '/api/portal/nottherealtoken123', headers={'User-Agent': 'Mozilla/5.0'})); chk('bad token 404', False)
except urllib.error.HTTPError as e: chk('bad token 404', e.code == 404, e.code)
print(json.dumps(res, indent=1)); sys.exit(1 if res['failed'] else 0)
