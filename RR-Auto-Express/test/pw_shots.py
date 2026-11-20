# Phone screenshots of a job's estimate, 3D and 2D views at a given size.
# usage: python3 test/pw_shots.py BASE SESSION_FILE JOB_ID WxH OUTPREFIX [views]
import sys, time
from playwright.sync_api import sync_playwright
B, sess, job, size, out = sys.argv[1], open(sys.argv[2]).read().strip(), sys.argv[3], sys.argv[4], sys.argv[5]
views = (sys.argv[6] if len(sys.argv) > 6 else 'estimate,3d').split(',')
w, h = map(int, size.split('x'))
with sync_playwright() as p:
    br = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
    ctx = br.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, has_touch=True, is_mobile=True)
    ctx.add_cookies([{"name": "cp_session", "value": sess, "url": B}])
    pg = ctx.new_page()
    for v in views:
        if v == '2d':
            pg.goto(f'{B}/#/job/{job}/3d'); time.sleep(4)
            pg.evaluate("localStorage.setItem('cp_pick_view','2d')")
            b = pg.locator('#m2')
            if b.count(): b.click(); time.sleep(1.5)
        elif v.startswith('#'):
            pg.goto(B + '/' + v); time.sleep(3)
        else:
            pg.goto(f'{B}/#/job/{job}/{v}'); time.sleep(5 if v == '3d' else 3)
        name = v.replace('#/', '').replace('/', '_')
        pg.screenshot(path=f'{out}_{name}.png')
        print('saved', f'{out}_{name}.png')
    br.close()
