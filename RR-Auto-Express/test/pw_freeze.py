# Freeze/leak stress test: phone-sized headless browser, navigates every screen and opens/closes 3D estimates
# many times, tracking JS heap, DOM nodes, listeners, live WebGL contexts, rAF loops, timers and long tasks.
# usage: python3 test/pw_freeze.py BASE SESSION_FILE '[26,39,40,41]' [rounds] [outjson]
import time, json, sys
from playwright.sync_api import sync_playwright
B = sys.argv[1]; sess = open(sys.argv[2]).read().strip()
JOBS = json.loads(sys.argv[3]) if len(sys.argv) > 3 else [26, 39, 40, 41]
ROUNDS = int(sys.argv[4]) if len(sys.argv) > 4 else 4
OUT = sys.argv[5] if len(sys.argv) > 5 else '/tmp/freeze.json'
INIT = r"""
(()=>{
 const W=window; W.__fz={ctx:[],raf:0,rafCb:0,lt:[],timers:new Map(),ivs:new Set(),wl:0,dl:0};
 const gc=HTMLCanvasElement.prototype.getContext;
 HTMLCanvasElement.prototype.getContext=function(t,...a){const c=gc.call(this,t,...a); if(c&&/webgl/.test(t)&&!W.__fz.ctx.includes(c)) W.__fz.ctx.push(c); return c;};
 const r=W.requestAnimationFrame.bind(W); W.requestAnimationFrame=(f)=>{W.__fz.raf++; return r((t)=>{W.__fz.rafCb++; f(t);});};
 const si=W.setInterval.bind(W), ci=W.clearInterval.bind(W);
 W.setInterval=(f,ms,...a)=>{const id=si(f,ms,...a); W.__fz.ivs.add(id); return id;}; W.clearInterval=(id)=>{W.__fz.ivs.delete(id); ci(id);};
 const st=W.setTimeout.bind(W), ct=W.clearTimeout.bind(W);
 W.setTimeout=(f,ms,...a)=>{let id; id=st((...b)=>{W.__fz.timers.delete(id); typeof f==='function'&&f(...b);},ms,...a); W.__fz.timers.set(id,ms||0); return id;};
 W.clearTimeout=(id)=>{W.__fz.timers.delete(id); ct(id);};
 for (const [o,k] of [[W,'wl'],[document,'dl']]) { const a=o.addEventListener.bind(o), rm=o.removeEventListener.bind(o); o.addEventListener=(t,f,x)=>{W.__fz[k]++; return a(t,f,x);}; o.removeEventListener=(t,f,x)=>{W.__fz[k]--; return rm(t,f,x);}; }
 try { new PerformanceObserver((l)=>{for(const e of l.getEntries()) W.__fz.lt.push([Math.round(e.startTime),Math.round(e.duration),location.hash]);}).observe({type:'longtask',buffered:true}); } catch(e){}
})();
"""
STATE = """(()=>{const f=window.__fz; const live=f.ctx.filter(c=>!c.isContextLost()).length; const canv=document.querySelectorAll('canvas').length;
 return {live, made:f.ctx.length, canvasesInDom:canv, timers:f.timers.size, longTimers:[...f.timers.values()].filter(x=>x>=1000).length, ivs:f.ivs.size, wl:f.wl, dl:f.dl, lt:f.lt.length, ltMax:f.lt.reduce((a,b)=>Math.max(a,b[1]),0)}})()"""
RAFRATE = """new Promise(res=>{const f=window.__fz; const a=f.rafCb; setTimeout(()=>res(f.rafCb-a),1000);})"""
SCREENS = ['jobs', 'customers', 'production', 'schedule', 'parts', 'invoices', 'messages', 'portal', 'settings', 'account', 'help', 'new']
res = {'samples': [], 'errors': []}
with sync_playwright() as p:
    br = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-precise-memory-info", "--js-flags=--expose-gc"])
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2.625, has_touch=True, is_mobile=True)
    ctx.add_cookies([{"name": "cp_session", "value": sess, "url": B}])
    ctx.add_init_script(INIT)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: res['errors'].append(str(e)[:300]))
    pg.on("console", lambda m: m.type == 'error' and res['errors'].append('console: ' + m.text[:300]))
    cdp = ctx.new_cdp_session(pg); cdp.send('Performance.enable')
    def metrics(label):
        try: cdp.send('HeapProfiler.collectGarbage')
        except Exception: pass
        time.sleep(0.4)
        m = {x['name']: x['value'] for x in cdp.send('Performance.getMetrics')['metrics']}
        s = pg.evaluate(STATE); s['rafPerSec'] = pg.evaluate(RAFRATE)
        s.update(label=label, heapMB=round(m['JSHeapUsedSize'] / 1e6, 1), nodes=int(m['Nodes']), listeners=int(m['JSEventListeners']), docs=int(m['Documents']))
        res['samples'].append(s); print(json.dumps(s), flush=True)
    def go(h, wait=1.2):
        t0 = time.time(); pg.evaluate(f"location.hash={json.dumps(h)}"); time.sleep(wait); return time.time() - t0
    pg.goto(B + '/#/jobs'); pg.wait_for_selector('#nav', state='attached', timeout=30000); time.sleep(2)
    metrics('start')
    for rnd in range(ROUNDS):
        for s in SCREENS: go('#/' + s, 0.9)
        for j in JOBS:
            go(f'#/job/{j}', 1.0)
            go(f'#/job/{j}/3d', 3.0)
            # switch 2D/3D and spin the camera a little
            try:
                pg.evaluate("document.querySelector('#m3')&&document.querySelector('#m3').click()"); time.sleep(1.2)
                pg.evaluate("document.querySelector('#m2')&&document.querySelector('#m2').click()"); time.sleep(0.5)
            except Exception as e: res['errors'].append('toggle ' + str(e)[:200])
        # vehicle-to-vehicle without leaving the 3D view (hash stays on /3d)
        for j in JOBS: go(f'#/job/{j}/3d', 2.5)
        go('#/messages/' + str(JOBS[0]), 2.0); time.sleep(4)
        go('#/settings', 1.5)
        metrics(f'round{rnd + 1}')
    go('#/jobs', 2)
    metrics('end on jobs')
    # messages left open
    go('#/messages/' + str(JOBS[0]), 2); time.sleep(20); metrics('messages open 20s')
    json.dump(res, open(OUT, 'w'), indent=1)
    br.close()
print('ERRORS', len(res['errors'])); [print(' ', e) for e in res['errors'][:15]]
