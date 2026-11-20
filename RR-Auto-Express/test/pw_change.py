# Live test of employee password changes. python3 test/pw_change.py base owner_session_token
import sys, json, secrets, urllib.request, urllib.error
BASE, OWNER = sys.argv[1], sys.argv[2]
res = []
def ok(n, c, x=''):
    res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n, x)
def call(m, path, body=None, tok=None):
    h = {'content-type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) CollisionProTest', 'Origin': BASE}
    if tok: h['Authorization'] = 'Bearer s_' + tok
    r = urllib.request.Request(BASE + path, method=m, headers=h, data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(r) as f: return f.status, json.loads(f.read() or b'null')
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or b'null')
        except Exception: return e.code, None
def login(email, pw):
    s, b = call('POST', '/api/login', {'email': email, 'password': pw})
    return (b or {}).get('token', '')[2:] if s == 200 else None
P1, P2, P3 = 'First-' + secrets.token_hex(5), 'Second-' + secrets.token_hex(5), 'Third-' + secrets.token_hex(5)
EM = 'pwtest.employee@example.com'
s, b = call('POST', '/api/users', {'name': 'PW Test', 'email': 'PWTest.Employee@Example.com ', 'password': P1, 'role': 'employee', 'active': 1}, OWNER)
ok('owner creates employee (mixed-case email)', s == 200, s)
uid = (b or {}).get('id')
t1 = login(EM, P1); ok('employee signs in with first password', t1)
ok('sign-in with capitals and spaces in email', login('  PWTEST.employee@EXAMPLE.com ', P1))
s, b = call('PUT', f'/api/users/{uid}', {'password': P2, 'active': 1}, OWNER); ok('owner resets password', s == 200, (s, b))
ok('old session signed out after reset', call('GET', '/api/me', tok=t1)[0] == 401)
ok('old password refused', not login(EM, P1))
t2 = login(EM, P2); ok('employee signs in with owner-set password', t2)
ok('owner-set password with trailing space typed', login(EM, P2 + ' '))
s, b = call('PUT', f'/api/users/{uid}', {'password': P3, 'current_password': 'wrong-one-123'}, t2); ok('self change with wrong current password refused', s == 403, s)
s, b = call('PUT', f'/api/users/{uid}', {'password': P3, 'current_password': P2}, t2); ok('employee changes own password', s == 200, (s, b))
ok('employee stays signed in after own change', call('GET', '/api/me', tok=t2)[0] == 200)
ok('previous password refused', not login(EM, P2))
ok('employee signs in with own new password', login(EM, P3))
call('PUT', f'/api/users/{uid}', {'role': 'owner'}, t2); s, b = call('GET', '/api/users', None, OWNER); ok('employee cannot make itself owner', s == 200 and [u['role'] for u in b if u['id'] == uid] == ['employee'], [u['role'] for u in (b or []) if u.get('id') == uid])
for i in range(3): login(EM, 'bad-password-' + str(i))
ok('a few wrong tries do not lock out', login(EM, P3))
s, b = call('DELETE', f'/api/users/{uid}', None, OWNER); ok('owner removes test employee', s == 200, s)
ok('removed employee cannot sign in', not login(EM, P3))
print('UID', uid)
print('RESULT', sum(res), 'of', len(res), 'passed')
