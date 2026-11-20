# usage: python3 wip/shot.py car [phone|desk] out.png [az_deg] [el_deg] [dist_mul]
import sys, json, math
from playwright.sync_api import sync_playwright
car = sys.argv[1]; size = sys.argv[2]; out = sys.argv[3]
az = float(sys.argv[4]) if len(sys.argv) > 4 else None; el = float(sys.argv[5]) if len(sys.argv) > 5 else None; dm = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
with sync_playwright() as p:
    br = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
    ctx = br.new_context(viewport={'width': 390, 'height': 700} if size == 'phone' else {'width': 1200, 'height': 700}, device_scale_factor=2 if size == 'phone' else 1, is_mobile=size == 'phone', has_touch=size == 'phone')
    pg = ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto(f'http://127.0.0.1:8765/wip/h.html?car={car}')
    pg.wait_for_function('window.__ready', timeout=60000)
    pg.wait_for_timeout(2500)
    if az is not None:
        pg.evaluate('''([az,el,dm])=>{const d=window.pk._debug();const c=d.camera,t=d.controls.target;const r=c.position.distanceTo(t)*dm;const a=az*Math.PI/180,e=el*Math.PI/180;c.position.set(t.x+r*Math.cos(e)*Math.cos(a),t.y+r*Math.sin(e),t.z+r*Math.cos(e)*Math.sin(a));d.controls.update();d.render();}''', [az, el, dm])
        pg.wait_for_timeout(1500)
    pg.screenshot(path=out)
    print(json.dumps(pg.evaluate('''(()=>{const r=window.pk._debug().renderer;return {calls:r.info.render.calls,tris:r.info.render.triangles,geos:r.info.memory.geometries,tex:r.info.memory.textures,gov:window.pk._debug().gov.level}})()''')), [e for e in errs if 'GPU stall' not in e][:8])
    br.close()
