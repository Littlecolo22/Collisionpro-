# Invoices interaction test. usage: python3 test/pw_invoice.py BASE OWNER_SESS EMP_SESS JOB_ID
# JOB_ID: an approved, not-yet-invoiced insurance job with lines. The test creates its invoice, sets a deductible,
# records customer + insurer payments in the UI, checks balances, opens the PDF, voids, and checks the employee is blocked.
import sys, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, __file__.rsplit('/', 1)[0]); from apicall import call
B, so, se, jid = sys.argv[1], open(sys.argv[2]).read().strip(), open(sys.argv[3]).read().strip(), sys.argv[4]
ok = bad = 0
def chk(c, m):
    global ok, bad
    ok, bad = (ok + 1, bad) if c else (ok, bad + 1); print('ok  ' if c else 'FAIL', m)
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    ctx.add_cookies([{'name': 'cp_session', 'value': so, 'url': B}]); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    pg.goto(B + '/#/invoices'); time.sleep(2)
    btn = pg.locator(f'[data-mk="{jid}"]')
    chk(btn.count() == 1, 'job listed under Ready to invoice')
    btn.tap(); time.sleep(2.5)
    chk(pg.locator('.odlg').count() == 1, 'invoice dialog opens after create')
    title = pg.locator('.odlg h2').inner_text(); num = title.split(' ')[0]
    _, inv = call(B, so, 'GET', '/api/invoices'); i = [x for x in inv['invoices'] if x['number'] == num][0]; iid = i['id']; total = i['total']
    pg.fill('#ded', '500'); pg.locator('#dedsave').tap(); time.sleep(2.5)
    _, d = call(B, so, 'GET', f'/api/invoices/{iid}'); I = d['invoice']
    chk(abs(I['customer_portion'] - 500) < 0.01 and abs(I['insurer_portion'] - (total - 500)) < 0.01, f"deductible 500 -> customer {I['customer_portion']} insurer {I['insurer_portion']}")
    chk(pg.locator('#pay [name=amount]').input_value() == '500.00', 'payment form prefilled with customer balance 500.00')
    pg.locator('#pay button[type=submit]').tap(); time.sleep(2.5)
    pg.select_option('#pay [name=payer]', 'insurer'); time.sleep(0.3)
    chk(abs(float(pg.locator('#pay [name=amount]').input_value()) - (total - 500)) < 0.01, 'insurer amount prefilled with insurer balance')
    pg.fill('#pay [name=amount]', '1000'); pg.fill('#pay [name=reference]', 'CHK 1234'); pg.locator('#pay button[type=submit]').tap(); time.sleep(2.5)
    _, d = call(B, so, 'GET', f'/api/invoices/{iid}'); I = d['invoice']
    chk(abs(I['paid'] - 1500) < 0.01 and abs(I['balance'] - (total - 1500)) < 0.01 and I['status'] == 'partial', f"paid {I['paid']} balance {I['balance']} status {I['status']}")
    chk(abs(I['customer_balance']) < 0.01 and abs(I['insurer_balance'] - (total - 1500)) < 0.01, 'customer owes 0, insurer owes the rest')
    chk('Balance due' in pg.locator('.odlg').inner_text(), 'dialog shows balance due')
    st, pdf = call(B, so, 'GET', f'/api/jobs/{jid}/pdf?kind=invoice'); chk(st == 200 and pdf[:4] == b'%PDF', 'invoice PDF downloads')
    with ctx.expect_page(timeout=8000) as np: pg.locator('#ipdf').tap()
    chk(True, 'PDF button opens a new tab')
    # pay the rest -> paid
    pg.select_option('#pay [name=payer]', 'insurer'); pg.locator('#pay button[type=submit]').tap(); time.sleep(2.5)
    _, d = call(B, so, 'GET', f'/api/invoices/{iid}'); chk(d['invoice']['status'] == 'paid' and abs(d['invoice']['balance']) < 0.01, f"paid in full -> {d['invoice']['status']}")
    chk(pg.locator('#pay').count() == 0, 'payment form hidden once paid')
    # remove a payment -> partial again
    pg.locator('[data-delp]').first.tap(); time.sleep(2.5)
    _, d = call(B, so, 'GET', f'/api/invoices/{iid}'); chk(d['invoice']['status'] == 'partial', 'removing a payment reopens it')
    # employee
    for path in ['/api/invoices', f'/api/invoices/{iid}', f'/api/jobs/{jid}/pdf?kind=invoice']:
        st, _ = call(B, se, 'GET', path); chk(st == 403, f'employee GET {path} -> {st}')
    st, _ = call(B, se, 'POST', f'/api/jobs/{jid}/payments', {'amount': 5}); chk(st == 403, f'employee payment -> {st}')
    st, _ = call(B, se, 'PUT', f'/api/invoices/{iid}/deductible', {'deductible': 1}); chk(st == 403, f'employee deductible -> {st}')
    # void
    pg.locator('#ivoid').tap(); time.sleep(2.5)
    _, d = call(B, so, 'GET', f'/api/invoices/{iid}'); chk(d['invoice']['status'] == 'void', 'void works')
    chk(not errs, 'no JS errors ' + ' | '.join(errs[:3]))
    br.close()
print(f'{ok}/{ok + bad} invoice checks passed')
