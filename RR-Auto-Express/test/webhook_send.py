# usage: webhook_send.py base k signing_key event json_payload [badsig]
import sys, json, time, hmac, hashlib, urllib.request
base, k, key, event, payload = sys.argv[1:6]
body = json.dumps({'deviceId': 'dev1', 'event': event, 'id': 'evt' + str(time.time()), 'payload': json.loads(payload), 'webhookId': 'cp-x'})
ts = str(int(time.time()))
sig = hmac.new(key.encode(), (body + ts).encode(), hashlib.sha256).hexdigest()
if len(sys.argv) > 6: sig = '0' * 64
req = urllib.request.Request(f'{base}/api/sms/webhook?k={k}', data=body.encode(), method='POST', headers={'Content-Type': 'application/json', 'X-Signature': sig, 'X-Timestamp': ts, 'User-Agent': 'android-sms-gateway/1.0'})
try:
    r = urllib.request.urlopen(req); print(r.status, r.read().decode()[:200])
except urllib.error.HTTPError as e: print(e.code, e.read().decode()[:200])
