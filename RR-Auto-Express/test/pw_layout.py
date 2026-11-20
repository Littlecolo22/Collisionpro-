# Layout check: no sideways page scroll, no overlapping key elements, no clipped text, at phone/desktop sizes.
# usage: python3 test/pw_layout.py BASE SESSION_FILE JOB_ID [shotdir] [routes]
import sys, time, json
from playwright.sync_api import sync_playwright
B, sess, job = sys.argv[1], open(sys.argv[2]).read().strip(), sys.argv[3]
shot = sys.argv[4] if len(sys.argv) > 4 else ''
routes = sys.argv[5].split(',') if len(sys.argv) > 5 else [f'#/job/{job}/estimate', f'#/job/{job}/3d', f'#/job/{job}/2d', '#/jobs', '#/customers', '#/settings', '#/account']
SIZES = [(390, 844, 1), (844, 390, 1), (412, 915, 1), (915, 412, 1), (768, 347, 1), (980, 1900, 0), (1440, 900, 0), (700, 1300, 0)]
CHECK = r"""() => {
 const out = []; const W = innerWidth, H = innerHeight;
 const se = document.scrollingElement; if (se.scrollWidth > W + 1) out.push('page scrolls sideways ' + se.scrollWidth + '>' + W);
 const main = document.querySelector('.main'); if (main && main.scrollWidth > main.clientWidth + 1) out.push('main scrolls sideways ' + main.scrollWidth + '>' + main.clientWidth);
 const vis = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none' || e.closest('[hidden]')) return null; return r; };
 const ov = (a, b) => a && b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
 const nav = vis(document.querySelector('.nav')), bnav = vis(document.querySelector('.bnav'));
 const phone = matchMedia('(max-width:900px),(max-height:500px)').matches;
 if (phone && nav) out.push('desktop side menu visible on phone layout');
 if (phone && !bnav) out.push('no bottom bar/rail on phone layout');
 if (nav && nav.width > W * 0.24 && W < 1000 && phone) out.push('side menu too wide');
 const top = vis(document.querySelector('.top')), tabs = vis(document.querySelector('.tabs'));
 if (ov(top, tabs)) out.push('header overlaps tabs');
 // 3D view
 const v3 = vis(document.querySelector('#v3'));
 if (v3) {
  const bar = vis(document.querySelector('#v3 > .bar')), info = vis(document.querySelector('#v3 .info')), leg = vis(document.querySelector('#v3 .legend'));
  if (ov(info, leg)) out.push('3D name overlaps legend');
  if (bar && bar.height > v3.height * 0.3) out.push('3D controls take ' + Math.round(bar.height) + 'px of ' + Math.round(v3.height) + 'px');
  const ar = v3.width / v3.height; if (ar < 0.55) out.push('3D view tall/narrow ' + Math.round(v3.width) + 'x' + Math.round(v3.height));
  if (v3.right > W + 1) out.push('3D view off screen right');
  if (v3.height < Math.min(220, H * 0.5)) out.push('3D view short ' + Math.round(v3.height));
  const cv = document.querySelector('#v3 canvas'); if (cv && !document.querySelector('#v3').classList.contains('is2d')) { const c = cv.getBoundingClientRect(); if (Math.abs(c.width - v3.width) > 4 || Math.abs(c.height - v3.height) > 4) out.push('canvas size ' + Math.round(c.width) + 'x' + Math.round(c.height) + ' != view ' + Math.round(v3.width) + 'x' + Math.round(v3.height)); }
  const side = vis(document.querySelector('#side')); if (side && side.right > W + 1 && side.left < W - 1) out.push('parts list partly off screen');
  if (side && side.left < W - 1 && side.bottom > H + 2 && getComputedStyle(document.querySelector('#side')).position === 'fixed') out.push('parts drawer taller than screen');
 }
 // estimate: cards on phones, table header aligned on desktop
 const gw = vis(document.querySelector('#gw')), lc = vis(document.querySelector('#lc'));
 if (phone && gw) out.push('wide lines table shown on phone');
 if (!phone && document.querySelector('#gw') && !gw) out.push('lines table hidden on desktop');
 if (gw) { const th = document.querySelectorAll('#eg thead th'), tr = document.querySelector('#eg tbody tr'); if (tr && tr.children.length === th.length) { for (let i = 0; i < th.length; i++) { const a = th[i].getBoundingClientRect(), b = tr.children[i].getBoundingClientRect(); if (Math.abs(a.left - b.left) > 1.5) { out.push('table header misaligned at col ' + i); break; } } } const st = document.querySelector('#eg tbody td.stick'); if (st) { const cb = st.querySelector('input').getBoundingClientRect(); const r = document.createRange(); r.selectNodeContents(st); const rs = [...r.getClientRects()]; if (rs.some((x) => x.top > cb.bottom - 2)) out.push('row number wraps below checkbox'); } }
 // clipped text in buttons, selects, chips, card headings
 const clipped = [];
 document.querySelectorAll('.top h1, .top .sub, .tabs button, .estbar select, .estbar button, .lcard .ld, .lc1 .lop, .v3 .bar button, .bi, .card h3, .lcsa').forEach((e) => { const r = vis(e); if (!r) return; if (e.tagName === 'SELECT') { const o = e.options[e.selectedIndex]; if (!o) return; const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(e); c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; const need = c.measureText(o.text).width + parseFloat(cs.paddingLeft) + 18; if (need > r.width + 1) clipped.push('select "' + o.text + '"'); return; } if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX !== 'auto' && !e.closest('.tabs,.bscroll,.v3 .bar') ) clipped.push((e.textContent || '').trim().slice(0, 24)); if (r.right > W + 1 && !e.closest('.tabs,.bscroll,.v3 .bar')) clipped.push('off-screen: ' + (e.textContent || '').trim().slice(0, 24)); });
 if (clipped.length) out.push('clipped: ' + clipped.slice(0, 5).join(' | '));
 return out;
}"""
fails = 0; total = 0
with sync_playwright() as p:
    br = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
    for (w, h, mob) in SIZES:
        ctx = br.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, has_touch=bool(mob), is_mobile=bool(mob))
        ctx.add_cookies([{"name": "cp_session", "value": sess, "url": B}])
        pg = ctx.new_page()
        for rt in routes:
            r2 = rt
            if rt.endswith('/2d'):
                r2 = rt[:-3] + '/3d'
            pg.goto(B + '/' + r2); time.sleep(4 if '/3d' in r2 else 2.2)
            if rt.endswith('/2d'):
                b = pg.locator('#m2');
                if b.count(): b.click(); time.sleep(1.2)
            elif rt.endswith('/3d'):
                b = pg.locator('#m3');
                if b.count(): b.click(); time.sleep(2.5)
            res = pg.evaluate(CHECK)
            total += 1
            tag = f'{w}x{h} {rt}'
            if res: fails += 1; print('FAIL', tag, '::', '; '.join(res))
            else: print('ok  ', tag)
            if shot: pg.screenshot(path=f"{shot}/{w}x{h}_{rt.replace('#/', '').replace('/', '_')}.png")
        ctx.close()
    br.close()
print(f'{total - fails}/{total} views clean')
