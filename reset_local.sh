#!/bin/bash
# Recreate the local D1 database from schema.sql, start wrangler dev, seed demo data.
cd /home/sprite/collision_app
W=/home/sprite/trendbots-cf/node_modules/.bin/wrangler
for p in $(pgrep -f 'wrangler-dist/cli.js dev'); do kill $p; done
for p in $(pgrep -f 'workerd-linux-64/bin/workerd'); do kill $p; done
sleep 1
rm -rf .wrangler/state/v3/d1
$W d1 execute collisionpro --local --file schema.sql > /tmp/cp_schema.log 2>&1 || { tail -20 /tmp/cp_schema.log; exit 1; }
setsid nohup $W dev --local --port 8787 > dev.log 2>&1 < /dev/null &
for i in $(seq 1 30); do sleep 1; curl -s localhost:8787/api/health >/dev/null && break; done
TOK=$(grep SETUP_TOKEN .dev.vars | cut -d= -f2)
curl -s -X POST localhost:8787/api/setup/seed -H "X-Setup-Token: $TOK" -H 'Content-Type: application/json' -H 'Origin: http://localhost:8787' -d '{"owner_password":"LocalOwner123!"}' > /tmp/cp_seed.json; head -c 300 /tmp/cp_seed.json
echo
