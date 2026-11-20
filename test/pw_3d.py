# 3D picker test: tap-to-add, details panel quick ops, X-ray, Explode, isolate, breadcrumb, Back + history back, frame rate
# usage: python3 test/pw_3d.py BASE SESSION_FILE '{"sedan":1,"pickup":2,"minivan":3}' [shotdir]
import time, json, sys, os
from playwright.sync_api import sync_playwright
B=sys.argv[1] if len(sys.argv)>1 else "http://localhost:8790"; sess=open(sys.argv[2] if len(sys.argv)>2 else '/tmp/lsess').read().strip()
jobs=json.loads(sys.argv[3]) if len(sys.argv)>3 else {"sedan":1,"pickup":2,"minivan":3}
SH=sys.argv[4] if len(sys.argv)>4 else '/tmp/shots3d'; os.makedirs(SH, exist_ok=True)
ONLY=os.environ.get('ONLY','')
R=[]
def ok(n,c,x=''): R.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n, x, flush=True)
PROJ = """(name)=>{const pk=window.__pk; const d=pk._dbg; const T=d.THREE; let best=null;
 d.scene.traverse(o=>{ if(best) return; if(o.userData&&o.userData.part===name){ let v=true; let q=o; while(q){ if(q.visible===false){v=false;break} q=q.parent } if(v) best=o; }});
 if(!best) return null; const bb=new T.Box3().setFromObject(best); const c=bb.getCenter(new T.Vector3()); c.project(d.camera);
 const r=d.scene.userData.canvas? d.scene.userData.canvas.getBoundingClientRect() : document.querySelector('#v3 canvas').getBoundingClientRect();
 return [r.x+(c.x+1)/2*r.width, r.y+(1-c.y)/2*r.height]}"""
with sync_playwright() as p:
    br=p.chromium.launch(args=["--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist"])
    for name,vp,mob in [("phone",{"width":390,"height":844},True),("desk",{"width":1366,"height":850},False)]:
        if ONLY and ONLY!=name: continue
        ctx=br.new_context(viewport=vp, device_scale_factor=2 if mob else 1, has_touch=mob, is_mobile=mob)
        ctx.add_cookies([{"name":"cp_session","value":sess,"url":B}])
        pg=ctx.new_page(); errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: m.type=='error' and errs.append('console: '+m.text))
        def nlines(): return pg.evaluate("fetch('/api/jobs/'+location.hash.split('/')[2]).then(r=>r.json()).then(b=>(b.lines||[]).length)")
        def st(): return pg.evaluate("(()=>{const k=window.__pk;return {kind:k.kind,depth:k.depth,xray:k.xray,crumbs:k.crumbs,mode:k.mode}})()")
        def tap(x,y):
            if mob: pg.touchscreen.tap(x,y)
            else: pg.mouse.click(x,y)
            time.sleep(0.7)
        def tappart(part):
            xy=pg.evaluate(PROJ, part)
            if not xy: return False
            tap(*xy); return True
        def click(sel): pg.locator(sel).first.click(); time.sleep(0.8)
        def sheet_open(): return pg.evaluate("!document.querySelector('#sheet').classList.contains('hide')")
        for style,jid in jobs.items():
            pg.goto(f"{B}/#/job/{jid}/3d"); pg.wait_for_selector("#m3", state="attached", timeout=30000); time.sleep(1.5)
            pg.evaluate("window.__pk=window.__S?window.__S.picker:null")
            if not pg.evaluate("!!window.__pk"):
                ok(f"{name} {style} picker handle", False, 'no window.__S'); continue
            if pg.evaluate("!document.querySelector('#v3 canvas') || !document.querySelector('#v3 canvas').offsetParent") or pg.evaluate("document.querySelector('#d2') && !document.querySelector('#d2').hidden"): click('#m3'); time.sleep(1.2)
            # 3D is built on demand when switching to it: wait for the real picker (not the 2D stand-in)
            for _ in range(240):
                if pg.evaluate("!!(window.__S.picker && !window.__S.picker.stub && !document.querySelector('#v3 .v3load'))"): break
                time.sleep(0.25)
            time.sleep(0.5)
            pg.evaluate("window.__pk=window.__S.picker")
            closeSel = '#sx'
            def cam(): return pg.evaluate("(()=>{const c=window.__pk._dbg.camera.position;return [c.x,c.y,c.z]})()")
            cam0=cam(); same=lambda a,b: max(abs(x-y) for x,y in zip(a,b))<0.05
            pg.screenshot(path=f"{SH}/{name}_{style}_car.png")
            # tap the hood -> sheet with details
            n0=nlines()
            okt=tappart('hood')
            ok(f"{name} {style} tap hood opens details", okt and sheet_open() and pg.locator('#sheet .pdet').count()==1, str(st()))
            if style=='sedan' and name=='phone': pg.screenshot(path=f"{SH}/{name}_{style}_details.png")
            # quick Repair adds a line
            pg.locator('#sheet .pdet [data-q="repair"]').click(); time.sleep(1.5)
            n1=nlines(); ok(f"{name} {style} quick Repair adds line", n1==n0+1, f"{n0}->{n1}")
            # tap selected hood again -> isolate
            if sheet_open(): pg.locator('#giso').click() if pg.locator('#giso').count() else tappart('hood')
            time.sleep(1.0); s=st()
            ok(f"{name} {style} isolate hood", s['kind']=='isolate' and s['depth']==1 and not pg.locator('#crumbs').is_hidden(), str(s))
            if name=='phone': pg.screenshot(path=f"{SH}/{name}_{style}_isolate.png")
            # phone/browser back gesture -> back to car
            pg.go_back(); time.sleep(1.0); s=st()
            ok(f"{name} {style} history back leaves isolate", s['kind']=='car' and s['depth']==0 and '/3d' in pg.url, str(s)+' '+pg.url)
            if sheet_open(): click(closeSel)
            # Explode
            click('#vex'); s=st()
            ok(f"{name} {style} explode front bumper", s['kind']=='exploded' and s['crumbs'][-1]=='Front bumper', str(s))
            if name=='phone': pg.screenshot(path=f"{SH}/{name}_{style}_exploded.png")
            n0=nlines()
            okt=tappart('fbumper_reinf') or tappart('fbumper_absorber')
            if okt and sheet_open():
                pg.locator('#sheet .pdet [data-q="replace"]').click(); time.sleep(1.5)
            n1=nlines(); ok(f"{name} {style} tap exploded piece + Replace adds line", okt and n1==n0+1, f"{n0}->{n1}")
            # isolate a piece from exploded view, breadcrumb has 3 levels, tap 'Car' crumb returns home
            if sheet_open() and pg.locator('#giso').count(): pg.locator('#giso').click(); time.sleep(1.0)
            s=st(); ok(f"{name} {style} isolate from exploded (3 crumbs)", s['depth']==2 and len(s['crumbs'])==3, str(s))
            if name=='phone' and style=='sedan': pg.screenshot(path=f"{SH}/{name}_{style}_isolate2.png")
            click('#vb'); s=st(); ok(f"{name} {style} Back button one level", s['depth']==1 and s['kind']=='exploded', str(s))
            if pg.locator('#crumbl [data-d="0"]').count(): click('#crumbl [data-d="0"]')
            s=st(); ok(f"{name} {style} Car crumb returns home", s['depth']==0 and s['kind']=='car', str(s))
            # rear bumper explode via switch
            click('#vex'); click('#vsw'); s=st()
            ok(f"{name} {style} switch to rear bumper", s['kind']=='exploded' and s['crumbs'][-1]=='Rear bumper', str(s))
            click('#vex'); time.sleep(0.3); s=st(); ok(f"{name} {style} Explode toggle off, camera back where it was", s['depth']==0 and same(cam(),cam0), str(s)+str(cam())+str(cam0))
            # X-ray
            click('#vxr'); s=st(); ok(f"{name} {style} X-ray on", s['xray'], str(s))
            if name=='phone': pg.screenshot(path=f"{SH}/{name}_{style}_xray.png")
            n0=nlines(); okt=False; sp=False; ttl=None
            for cand in ['frame_rail_lf','radiator_support','apron_l','apron_r','rear_rail_l']:
                if not tappart(cand): continue
                okt=True; ttl=pg.evaluate("document.querySelector('#sheet b')?.innerText")
                sp=sheet_open() and pg.locator('#sheet .tag.warn', has_text='Structural').count()>0
                if sp: break
            if okt and sheet_open(): pg.locator('#sheet .pdet [data-q="repair"]').click(); time.sleep(1.5)
            n1=nlines(); ok(f"{name} {style} X-ray part tap shows structural + adds line", okt and sp and n1==n0+1, f"{n0}->{n1} {ttl}")
            if sheet_open(): click(closeSel)
            click('#vxr'); s=st(); ok(f"{name} {style} X-ray off", not s['xray'], str(s))
            # frame rate while orbiting
            fps=pg.evaluate("""new Promise(res=>{const c=document.querySelector('#v3 canvas');const r=c.getBoundingClientRect();let n=0;const t0=performance.now();
              const f=()=>{n++; if(performance.now()-t0<2000) requestAnimationFrame(f); else res(n/((performance.now()-t0)/1000))}; requestAnimationFrame(f);
              const o={bubbles:true,pointerId:1,pointerType:'mouse',clientX:r.x+r.width/2,clientY:r.y+r.height/2,button:0,buttons:1};
              c.dispatchEvent(new PointerEvent('pointerdown',o)); let k=0; const iv=setInterval(()=>{k++; c.dispatchEvent(new PointerEvent('pointermove',{...o,clientX:o.clientX+k*3})); if(k>60){clearInterval(iv); c.dispatchEvent(new PointerEvent('pointerup',o))}},30)})""")
            ok(f"{name} {style} frame rate (software GL)", fps>8, f"{fps:.0f} fps")
        ok(f"{name} no page errors", not errs, '; '.join(errs[:4]))
        ctx.close()
    br.close()
print(f"{sum(R)}/{len(R)} passed")
sys.exit(0 if all(R) else 1)
