#!/usr/bin/env python3
"""Customer contact edit: API checks on a LOCAL copy (default http://localhost:8797).
Creates an employee in location 1 and one in location 2, then removes them; restores the edited customer."""
import json, sys, urllib.request, urllib.error
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8797'
OK = []; BAD = []
def req(method, path, body=None, tok=None):
    h = {'Content-Type': 'application/json', 'Origin': BASE}
    if tok: h['Authorization'] = 'Bearer ' + tok
    r = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, method=method, headers=h)
    try:
        with urllib.request.urlopen(r) as x:
            ct = x.headers.get('content-type', '')
            return x.status, (json.loads(x.read()) if 'json' in ct else x.read())
    except urllib.error.HTTPError as e:
        t = e.read()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t
def check(name, cond, info=''):
    (OK if cond else BAD).append(name); print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else '  ' + str(info)[:300]))
def login(email, pw):
    s, d = req('POST', '/api/login', {'email': email, 'password': pw}); assert s == 200, (s, d); return d['token']

own = login('owner@collisionpro.app', 'LocalOwner123!')
emps = []
for em, loc in (('cust.test.emp@example.com', 1), ('cust.test.emp2@example.com', 2)):
    s, d = req('POST', '/api/users', {'name': 'Cust Test', 'email': em, 'role': 'employee', 'location_id': loc, 'password': 'TempTest12345!'}, own)
    check(f'create temp employee loc {loc}', s == 200, d); emps.append(d.get('id'))
try:
    e1 = login('cust.test.emp@example.com', 'TempTest12345!'); e2 = login('cust.test.emp2@example.com', 'TempTest12345!')
    s, jobs = req('GET', '/api/jobs', None, own); jobs = jobs if isinstance(jobs, list) else jobs.get('results', jobs.get('jobs', []))
    job = next(j for j in jobs if j.get('customer_id') and j.get('location_id') == 1)
    cid = job['customer_id']
    s, orig = req('GET', f'/api/customers/{cid}', None, own); check('GET customer', s == 200 and orig['id'] == cid, orig)
    keep = {k: orig.get(k) for k in ('name', 'phone', 'email', 'address', 'contact_pref', 'sms_opt_in', 'notes')}
    # employee (same location) can edit; phone/email normalised
    s, d = req('PUT', f'/api/customers/{cid}', {**keep, 'phone': '1-212.555.0199', 'email': '  Test.Person@Example.COM ', 'contact_pref': 'text', 'sms_opt_in': True, 'address': '12 Main St, Springfield', 'notes': 'Call after 5'}, e1)
    check('employee same shop can edit', s == 200, d)
    c = d.get('customer', {})
    check('phone normalised to (212) 555-0199', c.get('phone') == '(212) 555-0199', c.get('phone'))
    check('email lower-cased/trimmed', c.get('email') == 'test.person@example.com', c.get('email'))
    check('pref text stored as sms', c.get('contact_pref') == 'sms', c.get('contact_pref'))
    # bad input rejected
    for body, label in (({'phone': '555-12'}, 'short phone'), ({'phone': '(055) 555-1234'}, 'area code 0'), ({'email': 'bob@'}, 'bad email'), ({'name': '  '}, 'blank name'), ({'contact_pref': 'fax'}, 'bad pref'), ({'phone': '', 'contact_pref': 'call'}, 'call without phone')):
        if label == 'call without phone':
            req('PUT', f'/api/customers/{cid}', {'contact_pref': 'email'}, own)
        s, d = req('PUT', f'/api/customers/{cid}', body, own)
        check(f'rejects {label} (400)', s == 400, (s, d))
    # other-location employee blocked (read + write)
    s, d = req('PUT', f'/api/customers/{cid}', {'name': 'Hacker'}, e2); check('other-location employee cannot edit (403)', s == 403, (s, d))
    s, d = req('GET', f'/api/customers/{cid}', None, e2); check('other-location employee cannot read (403)', s == 403, (s, d))
    # technician-type role without jobs.write blocked
    s, d = req('PUT', '/api/customers/999999', {'name': 'x'}, own); check('unknown customer 404', s == 404, (s, d))
    # estimate bundle + PDF show change right away
    req('PUT', f'/api/customers/{cid}', {'name': 'Zed Renamed', 'phone': '(212) 555-0199', 'contact_pref': 'sms'}, own)
    s, b = req('GET', f"/api/jobs/{job['id']}", None, own)
    check('estimate shows new name/phone', b['customer']['name'] == 'Zed Renamed' and b['customer']['phone'] == '(212) 555-0199', b.get('customer'))
    s, pdf = req('GET', f"/api/jobs/{job['id']}/pdf", None, own)
    raw = pdf if isinstance(pdf, bytes) else b''
    check('estimate PDF builds after edit', s == 200 and raw[:4] == b'%PDF', (s, raw[:20]))
    import io, pypdf
    txt = ''.join(pg.extract_text() or '' for pg in pypdf.PdfReader(io.BytesIO(raw)).pages)
    found = 'Zed Renamed' in txt and '(212) 555-0199' in txt
    check('PDF contains new name', found)
    # Messages thread reads the live row
    s, th = req('GET', f"/api/messages/job/{job['id']}", None, own)
    if s == 200:
        jj = th.get('job', th)
        check('Messages thread shows new name/phone', jj.get('customer_name') == 'Zed Renamed' and jj.get('phone') == '(212) 555-0199', jj)
    else: print('NOTE messages thread route returned', s)
    s, lst = req('GET', '/api/customers?q=2125550199', None, own)
    check('search by digits finds formatted phone', any(x['id'] == cid for x in lst), len(lst) if isinstance(lst, list) else lst)
    # audit log
    s, au = req('GET', '/api/audit?entity=customer', None, own)
    rows = au if isinstance(au, list) else au.get('results', au.get('rows', []))
    hit = [r for r in rows if r.get('entity') == 'customer' and str(r.get('entity_id')) == str(cid) and r.get('action') == 'update']
    check('audit log has customer update by employee', any(r.get('user_name') == 'Cust Test' for r in hit), (s, rows[:2] if isinstance(rows, list) else rows))
    # new customer
    s, d = req('POST', '/api/customers', {'name': 'Temp NewCust', 'phone': '2125550123', 'email': '', 'contact_pref': 'sms', 'sms_opt_in': 1}, e1)
    check('employee can add customer', s == 200 and d.get('customer', {}).get('phone') == '(212) 555-0123', d)
    newid = d.get('id')
    # restore
    s, d = req('PUT', f'/api/customers/{cid}', keep, own); check('restore original customer', s == 200, d)
finally:
    for uid in emps:
        if uid: req('DELETE', f'/api/users/{uid}', None, own)
    try:
        if newid: print('temp customer id', newid)
    except NameError: pass
print(f'\n{len(OK)} passed, {len(BAD)} failed')
