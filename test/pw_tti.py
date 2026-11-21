# Time-to-interactive for opening the parts tab with its automatic 3D render and switching to 2D, under CPU throttling.
# usage: python3 test/pw_tti.py BASE SESSION_FILE '[26,39]' THROTTLE [outjson]
import time, json, sys
from playwright.sync_api import sync_playwright
B = sys.argv[1]; sess = open(sys.argv[2]).read().strip()
JOBS = json.loads(sys.argv[3]); THR = float(sys.argv[4]); OUT = sys.argv[5] if len(sys.argv) > 5 else '/tmp/tti.json'
INIT = r"""
(()=>{ const W=window; W.__tt={lt:[],draw:0,probe:[]};
 try{ new PerformanceObserver(l=>{for(const e of l.getEntries()) W.__tt.lt.push([e.startTime,e.duration]);}).observe({type:'longtask',buffered:true}); }catch(e){}
 for (const C of [W.WebGLRenderingContext, W.WebGL2RenderingContext]) if (C) for (const k of ['drawElements','drawArrays']) { const f=C.prototype[k]; C.prototype[k]=function(...a){ W.__tt.draw=performance.now(); return f.apply(this,a); }; }
 // responsiveness probe: a 50 ms heartbeat; lateness = how long the page could not react
 let exp=performance.now()+50; const beat=()=>{const n=performance.now(); W.__tt.probe.push([n, Math.max(0,n-exp)]); exp=n+50; setTimeout(beat,50);}; setTimeout(beat,50);
})();
"""
WAIT = """(a)=>new Promise(res=>{const t0=a.t0, sel=a.sel; const lim=t0+a.lim; const chk=()=>{const n=performance.now(); const tt=window.__tt;
  const ready = sel ? !!document.querySelector(sel) : (tt.draw>t0);
  if ((ready && n-Math.max(t0, ...tt.lt.filter(x=>x[0]>=t0-5).map(x=>x[0]+x[1]))>300) || n>lim) {
    const lts=tt.lt.filter(x=>x[0]>=t0-5); const last=lts.reduce((m,x)=>Math.max(m,x[0]+x[1]),0);
    const first = sel ? null : tt.draw;
    res({ready, firstFrame: first&&first>t0 ? Math.round(first-t0) : null, idleAt: Math.round(Math.max(last, sel?0:(tt.draw||0))-t0),
         longTasks: lts.length, maxTask: Math.round(lts.reduce((m,x)=>Math.max(m,x[1]),0)), tbt: Math.round(lts.reduce((s,x)=>s+Math.max(0,x[1]-50),0)),
         maxLate: Math.round(tt.probe.filter(p=>p[0]>=t0).reduce((m,p)=>Math.max(m,p[1]),0))}); return; }
  setTimeout(chk,100);}; setTimeout(chk,100);})"""
res = []
with sync_playwright() as p:
    br = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2.625, has_touch=True, is_mobile=True)
    ctx.add_cookies([{"name": "cp_session", "value": sess, "url": B}])
    ctx.add_init_script(INIT)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    cdp = ctx.new_cdp_session(pg)
    pg.goto(B + '/#/jobs'); pg.wait_for_selector('#nav', state='attached', timeout=60000); time.sleep(2)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': THR})
    for rep in range(2):
        for j in JOBS:
            pg.evaluate(f"location.hash='#/job/{j}'"); time.sleep(3)
            t0 = pg.evaluate(f"(()=>{{const t=performance.now(); setTimeout(()=>location.hash='#/job/{j}/3d',0); return t;}})()")
            a = pg.evaluate(WAIT, {'t0': t0, 'sel': None, 'lim': 60000}); a.update(job=j, rep=rep, step='open parts with automatic 3D'); res.append(a); print(json.dumps(a), flush=True)
            t0 = pg.evaluate("(()=>{const t=performance.now(); setTimeout(()=>document.querySelector('#m2').click(),0); return t;})()")
            a = pg.evaluate(WAIT, {'t0': t0, 'sel': '#d2:not([hidden])', 'lim': 60000}); a.update(job=j, rep=rep, step='switch to 2D'); res.append(a); print(json.dumps(a), flush=True)
    json.dump({'throttle': THR, 'res': res, 'errors': errs}, open(OUT, 'w'), indent=1)
    br.close()
print('errors', errs[:5])
