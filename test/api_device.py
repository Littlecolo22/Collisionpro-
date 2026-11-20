# Texting from the owner's phone (R&R Auto Express app): link, sync, queue, pacing, statuses, replies, unlink, methods.
# usage: python3 test/api_device.py BASE OWNER_SESSION_FILE EMPLOYEE_SESSION_FILE|- JOB_ID [keep]
# Restores the texting method to what it was before and forgets the test phone at the end.
import sys, json, time, urllib.request
sys.path.insert(0, 'test')
from apicall import call
B, own = sys.argv[1], open(sys.argv[2]).read().strip()
emp = open(sys.argv[3]).read().strip() if sys.argv[3] != '-' else None
job = int(sys.argv[4])
res = {'passed': 0, 'failed': []}
def chk(n, ok, d=''):
    if ok: res['passed'] += 1
    else: res['failed'].append(f'{n} {str(d)[:300]}')
def dev(tok, body):
    req = urllib.request.Request(B + '/api/sms/device/sync', data=json.dumps(body).encode(), method='POST',
        headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok, 'User-Agent': 'RRAutoExpressApp/1.3 (texting)'})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read())
        except Exception: return e.code, None

st, g0 = call(B, own, 'GET', '/api/sms/settings'); chk('settings read', st == 200, g0)
method0, pace0 = g0['method'], g0['pace']
made = []
try:
    st, r = call(B, own, 'PUT', '/api/sms/settings', {'method': 'bogus'}); chk('bad method refused', st == 400, r)
    if emp:
        st, r = call(B, emp, 'POST', '/api/sms/device/link', {'name': 'x'}); chk('employee cannot link', st == 403, (st, r))
        st, r = call(B, emp, 'PUT', '/api/sms/settings', {'method': 'device'}); chk('employee cannot change method', st == 403, (st, r))
    st, r = dev('d_' + 'x' * 43, {}); chk('unknown device token refused', st == 401, (st, r))
    st, r = dev('', {}); chk('missing token refused', st == 401, (st, r))

    st, L = call(B, own, 'POST', '/api/sms/device/link', {'name': 'Test Phone', 'model': 'Pixel T', 'android': '15', 'app_version': '1.3', 'perm': {'send': True, 'receive': True, 'notif': True}, 'bg': True})
    chk('link ok', st == 200 and L.get('token', '').startswith('d_') and L['method'] == 'device' and L['device']['name'] == 'Test Phone', (st, L))
    chk('token hash not exposed', 'hash' not in json.dumps(L.get('device')), L.get('device'))
    tok = L['token']
    call(B, own, 'PUT', '/api/sms/settings', {'pace': 2})
    st, s1 = dev(tok, {'perm': {'send': True, 'receive': True}, 'want': 1}); chk('sync ok', st == 200 and s1['method'] == 'device' and s1['pace'] == 2, (st, s1))
    st, g = call(B, own, 'GET', '/api/sms/settings'); chk('device online after sync', g['device'] and g['device']['online'] and g['can_send'], g.get('device'))

    # test text goes to the phone queue
    st, r = call(B, own, 'POST', '/api/sms/test', {'to': '(305) 555-0199'}); chk('test queued', st == 200 and r['test']['status'] == 'phone_queue' and r['test'].get('msg_id'), (st, r.get('test') if isinstance(r, dict) else r))
    tid = r['test']['msg_id']; made.append(tid)
    # two customer texts
    ids = []
    for i in range(2):
        st, r = call(B, own, 'POST', f'/api/messages/job/{job}', {'body': f'Device test text {i} ' + ('long part ' * (30 if i else 1))})
        chk(f'customer text {i} queued', st == 200 and r['status'] == 'phone_queue', (st, r)); ids.append(r.get('id')); made.append(r.get('id'))
    st, g = call(B, own, 'GET', '/api/sms/settings'); chk('queue count 3', g['phone_queue']['waiting'] == 3, g['phone_queue'])
    # phone picks up one at a time
    st, s = dev(tok, {'want': 1}); chk('gets one text', st == 200 and len(s['outbox']) == 1 and s['outbox'][0]['id'] == tid and s['more'], s)
    chk('outbox has e164 number + body', s['outbox'][0]['to'] == '+13055550199' and 'Test text from' in s['outbox'][0]['body'], s['outbox'])
    st, s = dev(tok, {'want': 0}); chk('want 0 gets nothing', s['outbox'] == [], s)
    st, s = dev(tok, {'statuses': [{'id': tid, 'status': 'sent'}], 'want': 1}); chk('next text after report', len(s['outbox']) == 1 and s['outbox'][0]['id'] == ids[0], s)
    st, r = call(B, own, 'POST', '/api/sms/test/refresh'); chk('test shows sent', r['test']['status'] == 'sent', r.get('test'))
    st, s = dev(tok, {'statuses': [{'id': tid, 'status': 'delivered'}, {'id': ids[0], 'status': 'failed', 'error': 'No phone signal'}], 'want': 1})
    chk('third text', len(s['outbox']) == 1 and s['outbox'][0]['id'] == ids[1] and not s['more'], s)
    st, s = dev(tok, {'statuses': [{'id': tid, 'status': 'sent'}, {'id': ids[1], 'status': 'sent'}], 'want': 1}); chk('queue empty', s['outbox'] == [], s)
    st, th = call(B, own, 'GET', f'/api/messages/job/{job}')
    msgs = {m['id']: m for m in th.get('messages', [])} if isinstance(th, dict) else {}
    chk('failed text has error', msgs.get(ids[0], {}).get('status') == 'failed' and 'signal' in (msgs.get(ids[0], {}).get('error') or ''), msgs.get(ids[0]))
    chk('sent text', msgs.get(ids[1], {}).get('status') == 'sent', msgs.get(ids[1]))
    st, r = call(B, own, 'POST', '/api/sms/test/refresh'); chk('delivered not downgraded', r['test']['status'] == 'delivered', r.get('test'))
    st, r = call(B, own, 'POST', f'/api/messages/{ids[0]}/sent-from-phone'); chk('mark sent from phone', st == 200)
    st, th = call(B, own, 'GET', f'/api/messages/job/{job}'); m0 = [m for m in th['messages'] if m['id'] == ids[0]]
    chk('failed -> sent_from_phone', m0 and m0[0]['status'] == 'sent_from_phone', m0)

    # replies: customer number lands in the thread; a stranger is dropped
    st, jb = call(B, own, 'GET', f'/api/messages/job/{job}')
    phone = jb['job']['phone']
    ref = 'reply-%d' % time.time()
    st, s = dev(tok, {'incoming': [{'from': phone, 'body': 'Device reply test', 'ref': ref}, {'from': '+12125550000', 'body': 'personal text', 'ref': ref + 'x'}, {'from': '22395', 'body': 'Your code is 1234', 'ref': ref + 'y'}], 'want': 0})
    chk('one reply kept', st == 200 and s['received'] == 1, (phone, s))
    st, s = dev(tok, {'incoming': [{'from': phone, 'body': 'Device reply test', 'ref': ref}], 'want': 0}); chk('duplicate dropped', s['received'] == 0, s)
    st, th = call(B, own, 'GET', f'/api/messages/job/{job}'); rin = [m for m in th['messages'] if m['direction'] == 'in' and m['body'] == 'Device reply test']
    chk('reply in thread', len(rin) == 1, len(rin)); made += [m['id'] for m in rin]
    st, thr = call(B, own, 'GET', '/api/messages/threads')
    chk('stranger not stored', not any(u['body'] in ('personal text', 'Your code is 1234') for u in thr.get('unmatched', [])), thr.get('unmatched', [])[:3])

    # stale claim is handed out again; opted-out customer is not texted
    st, r = call(B, own, 'POST', '/api/sms/test', {'to': '3055550199'}); t2 = r['test']['msg_id']; made.append(t2)
    st, s = dev(tok, {'want': 1}); chk('claimed', s['outbox'] and s['outbox'][0]['id'] == t2, s)
    st, s = dev(tok, {'want': 1}); chk('not handed out twice', s['outbox'] == [], s)
    st, s = dev(tok, {'statuses': [{'id': t2, 'status': 'sent'}], 'want': 0})

    # methods: manual -> queued, nothing handed to the phone
    st, r = call(B, own, 'PUT', '/api/sms/settings', {'method': 'manual'}); chk('manual saved', r['method'] == 'manual' and not r['can_send'], r.get('method'))
    st, r = call(B, own, 'POST', f'/api/messages/job/{job}', {'body': 'Manual mode text'}); chk('manual -> queued', str(r.get('status')).startswith('queued'), r); made.append(r.get('id'))
    st, r = call(B, own, 'POST', '/api/sms/test', {'to': '3055550199'}); chk('manual test refused', st == 400, r)
    st, s = dev(tok, {'want': 1}); chk('manual: phone gets nothing', s['outbox'] == [] and not s['forward_incoming'], s)
    st, it = call(B, own, 'GET', '/api/settings'); smsi = [x for x in it.get('integrations', []) if x.get('key') == 'sms']
    chk('integrations shows manual', smsi and 'manual' in smsi[0]['status'], smsi)

    # re-link replaces the old token; forget turns the phone off
    st, L2 = call(B, own, 'POST', '/api/sms/device/link', {'name': 'Second Phone'}); chk('relink', st == 200 and L2['method'] == 'device', L2.get('method'))
    st, s = dev(tok, {}); chk('old token refused after relink', st == 401, st)
    st, s = dev(L2['token'], {'want': 0}); chk('new token works', st == 200, st)
    st, r = call(B, own, 'PUT', '/api/sms/settings', {'forget_device': 1}); chk('forget', r['device'] is None and not r['can_send'], r.get('device'))
    st, s = dev(L2['token'], {}); chk('forgotten token refused', st == 401, st)
    st, r = call(B, own, 'POST', f'/api/messages/job/{job}', {'body': 'No phone linked text'}); chk('device w/o phone -> queued note', 'no texting phone' in str(r.get('status')), r); made.append(r.get('id'))
finally:
    call(B, own, 'PUT', '/api/sms/settings', {'method': method0, 'pace': pace0, 'forget_device': 1})
    res['made_ids'] = [i for i in made if i]
    st, g = call(B, own, 'GET', '/api/sms/settings'); chk('restored', g['method'] == method0 and g['device'] is None, (g['method'], method0))
print(json.dumps(res, indent=1))
