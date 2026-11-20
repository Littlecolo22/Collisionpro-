# tiny API helper for tests: python3 test/apicall.py BASE SESSION_FILE METHOD PATH [JSON]
import sys, json, urllib.request
def call(base, sess, method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method, headers={'Cookie': 'cp_session=' + sess, 'Content-Type': 'application/json', 'Origin': base, 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) CPTest'})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read(); ct = r.headers.get('content-type', '')
            return r.status, (json.loads(raw) if 'json' in ct else raw)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw)
        except Exception: return e.code, raw[:200]
if __name__ == '__main__':
    b, s, m, p = sys.argv[1], open(sys.argv[2]).read().strip(), sys.argv[3], sys.argv[4]
    body = json.loads(sys.argv[5]) if len(sys.argv) > 5 else None
    st, out = call(b, s, m, p, body)
    print(st, json.dumps(out)[:3000] if not isinstance(out, bytes) else out[:200])
