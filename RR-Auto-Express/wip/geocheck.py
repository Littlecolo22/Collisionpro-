# Part-name list + geometry sanity checks (cabin inside body, mirrors at the doors, wipers at the cowl)
import sys, json
from playwright.sync_api import sync_playwright
port = sys.argv[2] if len(sys.argv) > 2 else '8765'
with sync_playwright() as p:
    br = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
    pg = br.new_page(viewport={'width': 900, 'height': 600})
    out = {}
    for car in sys.argv[1].split(','):
        pg.goto(f'http://127.0.0.1:{port}/wip/h.html?car={car}')
        pg.wait_for_function('window.__ready', timeout=60000)
        out[car] = pg.evaluate('''async () => { const THREE = await import('/public/vendor/three.module.min.js');
          let root = null; const d = window.pk._debug ? window.pk._debug() : null;
          const sc = d ? d.scene : window.__scene; if (!sc) { await new Promise(r=>setTimeout(r,1500)); } const sc2 = sc || window.__scene; if (!sc2) return {}; return (()=>{ const sc = sc2;
          const names = new Set(); sc.traverse(o => { if (o.userData && o.userData.part) names.add(o.userData.part); });
          const bb = (o) => new THREE.Box3().setFromObject(o);
          const body = new THREE.Box3(); sc.traverse(o => { if (o.userData && o.userData.part && /door|roof|quarter|bed|fender|hood/.test(o.userData.part) && !/mirror|handle/.test(o.userData.part)) body.union(bb(o)); });
          const res = { parts: [...names].sort(), body: [body.min.toArray().map(v=>+v.toFixed(2)), body.max.toArray().map(v=>+v.toFixed(2))] };
          const cab = sc.getObjectByName('cabin'); if (cab) { const b = bb(cab); res.cabin = [b.min.toArray().map(v=>+v.toFixed(2)), b.max.toArray().map(v=>+v.toFixed(2))]; res.cabinInside = body.containsBox(b); }
          for (const n of ['mirror_l', 'wheel_lf', 'tire_lf', 'cowl', 'grille', 'roof']) { let o = null; sc.traverse(x => { if (!o && x.userData && x.userData.part === n) o = x; }); if (o) { const b = bb(o); res[n] = [b.min.toArray().map(v=>+v.toFixed(2)), b.max.toArray().map(v=>+v.toFixed(2))]; } }
          return res; })(); }''')
    print(json.dumps(out))
    br.close()
