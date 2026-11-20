# usage: python3 wip/export.py car res outdir   -> outdir/<car>.glb, <car>.gltf, <car>_stats.json
import sys, json, base64, os
from playwright.sync_api import sync_playwright
car, res, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]; os.makedirs(out, exist_ok=True)
with sync_playwright() as p:
    br = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
    pg = br.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto('http://127.0.0.1:8765/wip/export.html'); pg.wait_for_function('window.__ready', timeout=60000)
    r = pg.evaluate('([c,r])=>window.exportCar(c,r,true)', [car, res])
    open(f'{out}/{car}.glb', 'wb').write(base64.b64decode(r['b64']))
    r2 = pg.evaluate('([c,r])=>window.exportCar(c,r,false)', [car, res])
    open(f'{out}/{car}.gltf', 'w').write(r2['json'])
    json.dump(r['stats'], open(f'{out}/{car}_stats.json', 'w'), indent=1)
    st = r['stats']; print(car, {k: (v if not isinstance(v, list) else len(v)) for k, v in st.items()}, os.path.getsize(f'{out}/{car}.glb'), errs[:6])
    br.close()
