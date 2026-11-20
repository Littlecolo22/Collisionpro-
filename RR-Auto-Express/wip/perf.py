# usage: python3 wip/perf.py car size  -> ms per frame for 30 forced renders (orbiting), stats
import sys, json
from playwright.sync_api import sync_playwright
car = sys.argv[1]; size = sys.argv[2]
with sync_playwright() as p:
    br = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
    ctx = br.new_context(viewport={'width': 390, 'height': 700} if size == 'phone' else {'width': 1200, 'height': 700}, device_scale_factor=2 if size == 'phone' else 1, is_mobile=size == 'phone', has_touch=size == 'phone')
    pg = ctx.new_page()
    pg.goto(f'http://127.0.0.1:8765/wip/h.html?car={car}')
    pg.wait_for_function('window.__ready', timeout=60000); pg.wait_for_timeout(2000)
    r = pg.evaluate('''()=>{const d=window.pk._debug();const c=d.camera,t=d.controls.target;const r=c.position.distanceTo(t);const gl=d.renderer.getContext();
      const t0=performance.now();for(let i=0;i<30;i++){const a=i*0.1;c.position.set(t.x+r*Math.cos(a)*0.9,c.position.y,t.z+r*Math.sin(a)*0.9);c.lookAt(t);d.renderer.render(d.scene,c);}gl.finish();const ms=(performance.now()-t0)/30;
      return {ms:Math.round(ms*10)/10,calls:d.renderer.info.render.calls,tris:d.renderer.info.render.triangles,pr:d.renderer.getPixelRatio()}}''')
    print(car, size, json.dumps(r))
    br.close()
