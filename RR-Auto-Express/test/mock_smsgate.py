# Minimal local mock of api.sms-gate.app (Cloud server) for tests. Records calls in /tmp/mockgate.json
import json, base64, http.server, uuid, sys
U, P = 'mockuser', 'mockpass-123'
LOG = []
MSGS = {}
class H(http.server.BaseHTTPRequestHandler):
    def _auth(self):
        a = self.headers.get('Authorization', '')
        return a == 'Basic ' + base64.b64encode(f'{U}:{P}'.encode()).decode()
    def _send(self, code, obj):
        b = json.dumps(obj).encode(); self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def _rec(self, body=None):
        LOG.append({'m': self.command, 'p': self.path, 'b': body}); json.dump(LOG, open('/tmp/mockgate.json', 'w'))
    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0); body = json.loads(self.rfile.read(n) or b'{}'); self._rec(body)
        if not self._auth(): return self._send(401, {'message': 'unauthorized'})
        if self.path.endswith('/messages'):
            i = uuid.uuid4().hex[:12]; MSGS[i] = 'Pending'
            return self._send(202, {'id': i, 'state': 'Pending', 'recipients': [{'phoneNumber': body['phoneNumbers'][0], 'state': 'Pending'}]})
        if self.path.endswith('/webhooks'):
            return self._send(201, {'id': body.get('id'), 'url': body['url'], 'event': body['event']})
        self._send(404, {'message': 'nf'})
    def do_GET(self):
        self._rec()
        if not self._auth(): return self._send(401, {'message': 'unauthorized'})
        if '/messages/' in self.path:
            i = self.path.rsplit('/', 1)[1]; MSGS[i] = 'Delivered' if i in MSGS else 'Failed'
            return self._send(200, {'id': i, 'state': MSGS[i], 'recipients': [{'phoneNumber': '+1', 'state': MSGS[i]}]})
        self._send(404, {'message': 'nf'})
    def do_DELETE(self):
        self._rec()
        if not self._auth(): return self._send(401, {'message': 'unauthorized'})
        self.send_response(204); self.end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', 8796), H).serve_forever()
