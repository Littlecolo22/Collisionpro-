import time, json, sys
from playwright.sync_api import sync_playwright
B=sys.argv[1] if len(sys.argv)>1 else "http://localhost:8790"; sess=open(sys.argv[2] if len(sys.argv)>2 else '/tmp/lsess').read().strip()
jobs=json.loads(sys.argv[3]) if len(sys.argv)>3 else {"sedan":1,"pickup":2,"minivan":3}
R=[]
def ok(n,c,x=''): R.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n, x, flush=True)
with sync_playwright() as p:
    br=p.chromium.launch(args=["--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist"])
    for name,vp,mob in [("phone",{"width":390,"height":844},True),("desk",{"width":1366,"height":850},False)]:
        ctx=br.new_context(viewport=vp, device_scale_factor=2 if mob else 1, has_touch=mob, is_mobile=mob)
        ctx.add_cookies([{"name":"cp_session","value":sess,"url":B}])
        pg=ctx.new_page(); errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e)))
        def center(pid, idx=0):
            return pg.evaluate("([p,i])=>{const es=[...document.querySelectorAll(`#d2 polygon[data-p='${p}'],#d2 circle[data-p='${p}']`)]; es.sort((a,b)=>{const A=a.getBoundingClientRect(),B=b.getBoundingClientRect();return B.width*B.height-A.width*A.height}); for (const e of es){const b=e.getBoundingClientRect(); const x=b.x+b.width/2,y=b.y+b.height/2; const h=document.elementFromPoint(x,y); if(h&&h.closest('[data-p]')&&h.closest('[data-p]').dataset.p===p) return [x,y,es.length]} const b=es[0].getBoundingClientRect(); return [b.x+b.width/2,b.y+b.height/2,es.length]}", [pid, idx])
        def tapp(pid, idx=0):
            x,y,n=center(pid, idx)
            if mob: pg.touchscreen.tap(x,y)
            else: pg.mouse.click(x,y)
            time.sleep(0.5)
        def fill(pid): return pg.evaluate("p=>document.querySelector(`#d2 [data-p='${p}']`).getAttribute('fill')", pid)
        def nlines(): return pg.evaluate("fetch('/api/jobs/'+location.hash.split('/')[2]).then(r=>r.json()).then(b=>(b.lines||[]).length)")
        for style,jid in jobs.items():
            pg.goto(f"{B}/#/job/{jid}/3d"); pg.wait_for_selector("#d2 polygon", state="attached", timeout=25000); time.sleep(1.0)
            if not mob and pg.evaluate("document.querySelector('#d2').hidden"): pg.click("#m2"); time.sleep(0.5)
            ok(f"{name} {style}: 2D is visible", not pg.evaluate("document.querySelector('#d2').hidden"))
            ids=pg.evaluate("[...new Set([...document.querySelectorAll('#d2 [data-p]')].map(e=>e.dataset.p))]")
            need=['fbumper_cover','hood','fender_l','door_lf','quarter_l' if style!='pickup' else 'bedside_l','roof','windshield','decklid','tire_lf','mirror_l','headlamp_l','tail_lamp_r','fbumper_reinf']
            miss=[i for i in need if i not in ids]
            ok(f"{name} {style}: key panels present ({len(ids)} parts)", not miss, miss)
            n0=nlines(); before=fill('hood'); had=pg.evaluate("fetch('/api/jobs/'+location.hash.split('/')[2]).then(r=>r.json()).then(b=>(b.lines||[]).some(l=>l.catalog_key==='hood'))")
            tapp('hood', 1)
            ok(f"{name} {style}: tap hood opens part card", pg.is_visible("#sheet:not(.hide)"))
            ok(f"{name} {style}: hood shows selected", fill('hood').lower()=='#2bd47a', fill('hood'))
            print('sheet:', pg.inner_text('#sheet')[:60].replace(chr(10),' ')); pg.click("#sheet .pdet [data-q='repair']", timeout=5000); time.sleep(1.5); pg.click('#sx'); time.sleep(0.4)
            n1=nlines(); ok(f"{name} {style}: repair hood added lines", n1>n0, (n0,n1))
            ok(f"{name} {style}: hood colored repair", fill('hood').lower()=='#f5a524', fill('hood'))
            # select door, switch to 3D and back
            tapp('door_lf', 0)
            ok(f"{name} {style}: door selected", fill('door_lf').lower()=='#2bd47a')
            pg.click("#m3"); time.sleep(1.2)
            sel3=pg.evaluate("(()=>{try{return window.CP && 1}catch(e){return 0}})()")
            pg.click("#m2"); time.sleep(0.6)
            ok(f"{name} {style}: selection kept after 3D and back", fill('door_lf').lower()=='#2bd47a' and pg.is_visible("#sheet:not(.hide)"))
            if pg.is_visible("#sx"): pg.click("#sx"); time.sleep(0.3)
            if style=='sedan':
                # long press multi-select, mirror, bulk refinish
                x,y,_=center('fender_l', 0)
                if mob:
                    pg.evaluate("([x,y])=>{const t=document.elementFromPoint(x,y); const o={pointerId:7,clientX:x,clientY:y,bubbles:true,pointerType:'touch'}; t.dispatchEvent(new PointerEvent('pointerdown',o)); window.__lp=o;}", [x,y]); time.sleep(0.7)
                    pg.evaluate("([x,y])=>{document.querySelector('#d2 svg').dispatchEvent(new PointerEvent('pointerup',window.__lp))}", [x,y])
                else:
                    pg.mouse.move(x,y); pg.mouse.down(); time.sleep(0.7); pg.mouse.up()
                time.sleep(0.3)
                ok(f"{name}: long-press starts multi-select", pg.is_visible("#bulk2:not(.hide)"))
                pg.click("#bulk2 [data-bm]"); time.sleep(0.3)
                ok(f"{name}: L/R mirror adds right fender", "2 selected" in pg.inner_text("#bulk2"), pg.inner_text("#bulk2")[:30])
                print('MSEL', pg.evaluate("[...new Set([...document.querySelectorAll('#d2 .msel')].map(e=>e.dataset.p))]")); n2=nlines(); pg.on('request', lambda r: r.method=='POST' and print('POST', r.post_data)); pg.click("#bulk2 [data-bop='refinish']"); time.sleep(1.8)
                ok(f"{name}: bulk refinish adds 2 lines", nlines()>=n2+2, (n2,nlines()))
                ok(f"{name}: fenders colored refinish", fill('fender_r').lower() not in ('#2bd47a',) and fill('fender_r')==fill('fender_l'), fill('fender_r'))
                if mob:
                    vb0=pg.evaluate("document.querySelector('#d2 svg').getAttribute('viewBox')")
                    pg.evaluate("""(()=>{const s=document.querySelector('#d2 svg'); const r=s.getBoundingClientRect(); const cx=r.x+r.width/2, cy=r.y+r.height/2;
                      const ev=(t,id,x,y)=>s.dispatchEvent(new PointerEvent(t,{pointerId:id,clientX:x,clientY:y,bubbles:true,pointerType:'touch'}));
                      ev('pointerdown',1,cx-40,cy); ev('pointerdown',2,cx+40,cy); ev('pointermove',1,cx-100,cy); ev('pointermove',2,cx+100,cy); ev('pointerup',1,cx-100,cy); ev('pointerup',2,cx+100,cy);})()""")
                    vb1=pg.evaluate("document.querySelector('#d2 svg').getAttribute('viewBox')")
                    ok("phone: pinch zooms in", float(vb1.split()[2])<float(vb0.split()[2])*0.6, (vb0,vb1))
                    pg.click("#vr"); time.sleep(0.3)
                pg.screenshot(path=f"/tmp/s2/{name}_{style}_after.png")
        ok(f"{name}: no page errors", not errs, errs[:3])
        ctx.close()
print(sum(R),'/',len(R))
