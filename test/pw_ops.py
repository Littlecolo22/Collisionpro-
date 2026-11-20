# Owner-screen layout + interaction check (production board, invoices, messages, portal, ...).
# usage: python3 test/pw_ops.py BASE SESSION_FILE ROUTES [shotdir] [sizes]
#   ROUTES: comma list like "#/production,#/invoices"; add "|click=<css>" to open a dialog before checking, e.g.
#   "#/production|click=.kc". sizes: "p,l,d" (portrait 390x844, landscape 844x390, desktop 1440x900) or all8.
import sys, time, re, os
from playwright.sync_api import sync_playwright
B, sess, routes = sys.argv[1], open(sys.argv[2]).read().strip(), sys.argv[3].split(',')
shot = sys.argv[4] if len(sys.argv) > 4 else ''
szarg = sys.argv[5] if len(sys.argv) > 5 else 'p,l,d'
ALL = {'p': (390, 844, 1), 'l': (844, 390, 1), 'd': (1440, 900, 0), 'p2': (412, 915, 1), 'l2': (915, 412, 1), 'ls': (768, 347, 1), 'dk': (980, 1900, 0), 't': (700, 1300, 0)}
SIZES = list(ALL.values()) if szarg == 'all8' else [ALL[k] for k in szarg.split(',')]
src = open(os.path.join(os.path.dirname(__file__), 'pw_layout.py')).read()
CHECK = re.search(r'CHECK = r"""(.*?)"""', src, re.S).group(1)
EXTRA = r"""() => {
 const out = []; const W = innerWidth, H = innerHeight;
 const vis = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none') return null; return r; };
 const ov = (a, b) => a && b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
 const clip = [];
 document.querySelectorAll('.top .row button, .top .row a.btn, .chip, .kc b, .kc .tag, .kcol h3, .odlg button, .odlg a.btn, .odlg h2, .oc button, .oc a.btn, .oc .tag, .ocard b, .ocard .tag, .seg button, .kpi b, .kpi span, .tabs button, .bub, .thr .it b, th, .stat b, .ofl button').forEach((e) => {
  const r = vis(e); if (!r || e.closest('.kb') && (r.right < 0 || r.left > W)) return; if (e.closest('.pbchips,.seg,.tabs') && (r.right > W || r.left < 0)) return;
  if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible') clip.push((e.textContent || '').trim().slice(0, 30) + ' w' + e.clientWidth + '<' + e.scrollWidth);
  if (e.scrollHeight > e.clientHeight + 3 && getComputedStyle(e).overflow !== 'visible' && e.tagName !== 'TH') clip.push((e.textContent || '').trim().slice(0, 30) + ' h' + e.clientHeight + '<' + e.scrollHeight);
 });
 if (clip.length) out.push('clipped: ' + clip.slice(0, 5).join(' | '));
 // siblings overlapping inside rows / dialogs / cards
 const groups = document.querySelectorAll('.top .row, .odlg .row, .odlg .factions, .oc .row, .ocard, .k3, .fgrid, .kpis, .seg, .stgrid, .ofl, .thr .it, .ihead');
 const hits = [];
 groups.forEach((g) => { const ks = [...g.children].map((c) => [c, vis(c)]).filter((x) => x[1]); for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) if (ov(ks[i][1], ks[j][1])) { if (getComputedStyle(ks[i][0]).position === 'absolute' || getComputedStyle(ks[j][0]).position === 'absolute') continue; hits.push((ks[i][0].className || ks[i][0].tagName) + '/' + (ks[j][0].className || ks[j][0].tagName)); } });
 if (hits.length) out.push('overlap: ' + hits.slice(0, 4).join(' | '));
 const dl = vis(document.querySelector('.odlg > div'));
 if (dl) { if (dl.right > W + 1 || dl.left < -1) out.push('dialog off screen sideways'); if (dl.bottom > H + 1) out.push('dialog taller than screen'); const db = document.querySelector('.odlg > div'); if (db.scrollWidth > db.clientWidth + 1) out.push('dialog scrolls sideways'); }
 // content hidden under the bottom bar: last element of page must be reachable (page has bottom padding)
 const bn = vis(document.querySelector('.bnav')); const main = document.querySelector('.main');
 if (bn && main && bn.top > H / 2) { const se = getComputedStyle(main).overflowY === 'auto' ? main : document.scrollingElement; se.scrollTop = se.scrollHeight; const pages = document.querySelectorAll('.page > *'); const last = pages[pages.length - 1]; const lr = vis(last); if (lr && lr.bottom > bn.top + 2 && !document.querySelector('.odlg')) out.push('last block hidden under bottom bar'); se.scrollTop = 0; }
 return out;
}"""
fails = 0; total = 0; errs = []
with sync_playwright() as p:
    br = p.chromium.launch()
    for (w, h, mob) in SIZES:
        ctx = br.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, has_touch=bool(mob), is_mobile=bool(mob))
        ctx.add_cookies([{"name": "cp_session", "value": sess, "url": B}])
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        for rt in routes:
            parts = rt.split('|'); url = parts[0]; acts = parts[1:]
            pg.goto('about:blank'); pg.goto(B + '/' + url); time.sleep(2.2)
            for a in acts:
                k, v = a.split('=', 1)
                if k == 'click':
                    loc = pg.locator(v).first
                    if loc.count(): loc.scroll_into_view_if_needed(); loc.click(); time.sleep(1.0)
                    else: print('  (no element for', v, ')')
            res = pg.evaluate(CHECK) + pg.evaluate(EXTRA)
            total += 1
            tag = f'{w}x{h} {rt}'
            if res: fails += 1; print('FAIL', tag, '::', '; '.join(res))
            else: print('ok  ', tag)
            if shot: pg.screenshot(path=f"{shot}/{w}x{h}_{re.sub(r'[^a-z0-9]+', '_', rt.lower()).strip('_')}.png")
        ctx.close()
    br.close()
if errs: print('JS errors:', errs[:5])
print(f'{total - fails}/{total} views clean')
