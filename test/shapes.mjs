// Print the shape of each GET endpoint (keys and a sample row) to guide the UI.
const BASE = 'http://localhost:8787';
let cookie = '';
async function call(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: BASE }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc && sc.includes('cp_session=')) cookie = sc.split(';')[0];
  const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 100); }
}
function shape(v, depth = 0) {
  if (Array.isArray(v)) return v.length ? `[${v.length}× ${shape(v[0], depth + 1)}]` : '[]';
  if (v && typeof v === 'object') {
    if (depth > 2) return '{…}';
    return '{' + Object.entries(v).map(([k, x]) => `${k}:${typeof x === 'object' && x !== null ? shape(x, depth + 1) : JSON.stringify(x)?.slice(0, 30)}`).join(', ') + '}';
  }
  return JSON.stringify(v)?.slice(0, 30);
}
await call('POST', '/api/login', { email: 'owner@collisionpro.app', password: 'LocalOwner123!' });
const paths = (process.argv[2] || '').split(',');
for (const p of paths) { const r = await call('GET', p); console.log('### ' + p + '\n' + shape(r).slice(0, Number(process.argv[3] || 1500)) + '\n'); }
