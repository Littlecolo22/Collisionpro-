# Production board interaction test: drag a card to another column (desktop), tap-move (phone), employee blocked.
# usage: python3 test/pw_board.py BASE OWNER_SESSION_FILE EMP_SESSION_FILE
import sys, time, json
from playwright.sync_api import sync_playwright
B, so, se = sys.argv[1], open(sys.argv[2]).read().strip(), open(sys.argv[3]).read().strip()
ok = 0; bad = 0
def chk(c, m):
    global ok, bad
    if c: ok += 1; print('ok  ', m)
    else: bad += 1; print('FAIL', m)
with sync_playwright() as p:
    br = p.chromium.launch()
    # desktop drag
    ctx = br.new_context(viewport={'width': 1440, 'height': 900}); ctx.add_cookies([{'name': 'cp_session', 'value': so, 'url': B}])
    pg = ctx.new_page(); pg.goto(B + '/#/production'); time.sleep(2)
    card = pg.locator('.kc').first; jid = card.get_attribute('data-id'); st0 = card.evaluate("e => e.closest('.kcol').dataset.stage")
    target = 'body' if st0 != 'body' else 'paint'
    card.drag_to(pg.locator(f'.kcol[data-stage="{target}"]')); time.sleep(2)
    st1 = pg.locator(f'.kc[data-id="{jid}"]').evaluate("e => e.closest('.kcol').dataset.stage")
    chk(st1 == target, f'drag job {jid} {st0} -> {target} (now {st1})')
    b = pg.evaluate("fetch('/api/board').then(r=>r.json())")
    chk(any(str(j['id']) == jid and j['stage'] == target for j in b['jobs']), 'server saved the drag')
    ctx.close()
    # phone tap-move
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); ctx.add_cookies([{'name': 'cp_session', 'value': so, 'url': B}])
    pg = ctx.new_page(); pg.goto(B + '/#/production'); time.sleep(2)
    pg.locator(f'.kc[data-id="{jid}"]').tap(); time.sleep(0.8)
    chk(pg.locator('.odlg').count() == 1, 'tap opens move dialog')
    pg.locator('.odlg .stgrid button[data-mv="qc"]').tap(); time.sleep(2)
    st2 = pg.locator(f'.kc[data-id="{jid}"]').evaluate("e => e.closest('.kcol').dataset.stage")
    chk(st2 == 'qc', f'tap-move to Quality check (now {st2})')
    pg.locator(f'.kc[data-id="{jid}"]').tap(); time.sleep(0.6)
    pg.locator('.odlg button.pri[data-mv]').tap(); time.sleep(2)
    st3 = pg.locator(f'.kc[data-id="{jid}"]').evaluate("e => e.closest('.kcol').dataset.stage")
    chk(st3 == 'ready', f'next-stage button -> ready (now {st3})')
    b = pg.evaluate("fetch('/api/board').then(r=>r.json())")
    chk(any(str(j['id']) == jid and j['status'] == 'completed' for j in b['jobs']), 'ready marks job completed')
    pg.locator(f'.kc[data-id="{jid}"]').tap(); time.sleep(0.6)
    pg.locator('.odlg button[data-mv="body"]').first.tap(); time.sleep(2)
    b = pg.evaluate("fetch('/api/board').then(r=>r.json())")
    chk(any(str(j['id']) == jid and j['status'] == 'in_production' and j['stage'] == 'body' for j in b['jobs']), 'moving back from ready reopens it')
    ctx.close()
    # employee
    ctx = br.new_context(viewport={'width': 390, 'height': 844}); ctx.add_cookies([{'name': 'cp_session', 'value': se, 'url': B}])
    pg = ctx.new_page(); pg.goto(B + '/#/production'); time.sleep(2)
    chk(pg.locator('.kc').count() == 0 and 'Owner only' in pg.content(), 'employee sees Owner only on board')
    r = pg.evaluate(f"fetch('/api/jobs/{jid}/stage',{{method:'PUT',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{stage:'paint'}})}}).then(r=>r.status)")
    chk(r == 403, f'employee stage move blocked by server ({r})')
    r = pg.evaluate("fetch('/api/board').then(r=>r.status)")
    chk(r == 403, f'employee board API blocked ({r})')
    ctx.close(); br.close()
print(f'{ok}/{ok + bad} board checks passed')
