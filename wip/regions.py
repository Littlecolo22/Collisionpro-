# Screenshot + per-part screen regions -> pixel stats, so detail can be checked without viewing images.
# usage: python3 wip/regions.py car az el dm part1,part2,...
import sys, json, io
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
car, az, el, dm, parts = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), sys.argv[5].split(',')
port = sys.argv[6] if len(sys.argv) > 6 else '8765'
with sync_playwright() as p:
    br = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
    pg = br.new_page(viewport={'width': 1200, 'height': 700})
    pg.goto(f'http://127.0.0.1:{port}/wip/h.html?car={car}')
    pg.wait_for_function('window.__ready', timeout=60000); pg.wait_for_timeout(2000)
    boxes = pg.evaluate('''async ([az,el,dm,parts])=>{const THREE = await import('/public/vendor/three.module.min.js');
      const d=window.pk._debug();const c=d.camera,t=d.controls.target;const r=c.position.distanceTo(t)*dm;const a=az*Math.PI/180,e=el*Math.PI/180;
      c.position.set(t.x+r*Math.cos(e)*Math.cos(a),t.y+r*Math.sin(e),t.z+r*Math.cos(e)*Math.sin(a));d.controls.update();d.render(); await new Promise(r=>setTimeout(r,1500)); c.updateMatrixWorld(); window.__cam=[c.position.toArray(),t.toArray()];
      const out={}; const W=innerWidth,H=innerHeight;
      for (const n of parts){ let o=null; d.scene.traverse(x=>{ if(!o && ((x.userData&&x.userData.part===n)||x.name===n)) o=x; }); if(!o){out[n]=null;continue;}
        const b=new THREE.Box3().setFromObject(o); const xs=[],ys=[];
        for (const X of [b.min.x,b.max.x]) for (const Y of [b.min.y,b.max.y]) for (const Z of [b.min.z,b.max.z]) { const v=new THREE.Vector3(X,Y,Z).project(c); xs.push((v.x+1)/2*W); ys.push((1-v.y)/2*H); }
        out[n]=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)].map(Math.round); }
      return out; }''', [az, el, dm, parts])
    print('cam', pg.evaluate('window.__cam'))
    img = Image.open(io.BytesIO(pg.screenshot())).convert('RGB'); a = np.asarray(img).astype(float); l = a.mean(2)
    img.save(f'/tmp/reg_{car}.png')
    for n, bx in boxes.items():
        if not bx: print(n, 'missing'); continue
        x0, y0, x1, y1 = [max(0, v) for v in bx]; x1 = min(x1, 1199); y1 = min(y1, 699)
        if x1 - x0 < 3 or y1 - y0 < 3: print(n, 'offscreen/small', bx); continue
        reg = a[y0:y1, x0:x1]; rl = l[y0:y1, x0:x1]
        red = ((reg[..., 0] > reg[..., 1] + 50) & (reg[..., 0] > 90)).mean() * 100
        amb = ((reg[..., 0] > 170) & (reg[..., 1] > 100) & (reg[..., 2] < 90)).mean() * 100
        print(f'{n:16s} box{bx} lum mean {rl.mean():.0f} std {rl.std():.0f} max {rl.max():.0f} bright>235 {(rl > 235).mean() * 100:.1f}% red {red:.1f}% amber {amb:.1f}% edges {np.abs(np.diff(rl, axis=1)).mean():.1f}')
    br.close()
