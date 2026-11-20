#!/bin/bash
# Customer-edit task: local preview on :8797 from pages_cust/dist with its own D1 state. usage: ./run_cust.sh [reset]
set -e
cd "$(dirname "$0")"
ES=/home/sprite/trendbots-cf/node_modules/@esbuild/linux-x64/bin/esbuild
rm -rf pages_cust/dist && cp -r public pages_cust/dist
$ES src/pages_entry.js --bundle --format=esm --platform=neutral --main-fields=module,main --conditions=workerd,worker,browser --external:node:* --outfile=pages_cust/dist/_worker.js --log-level=warning
echo _worker.js > pages_cust/dist/.assetsignore
cd pages_cust
for p in $(pgrep -f 'dev --local --port 8797'); do kill $p; done
sleep 1
if [ "$1" = "reset" ]; then
  rm -rf .wrangler/state/v3/d1
  HOME=../.wr-home ../wr d1 execute collisionpro --local --file ../schema.sql > /tmp/cust_schema.log 2>&1 || { tail -5 /tmp/cust_schema.log; exit 1; }
  for m in ../migrations/*.sql; do HOME=../.wr-home ../wr d1 execute collisionpro --local --file $m >> /tmp/cust_schema.log 2>&1 || true; done
fi
HOME=../.wr-home setsid nohup ../wr dev --local --port 8797 > ../cust_dev.log 2>&1 < /dev/null &
for i in $(seq 1 40); do sleep 1; curl -s localhost:8797/api/health >/dev/null && break; done
if [ "$1" = "reset" ]; then
  TOK=$(grep SETUP_TOKEN .dev.vars | cut -d= -f2)
  curl -s -X POST localhost:8797/api/setup/seed -H "X-Setup-Token: $TOK" -H 'Content-Type: application/json' -H 'Origin: http://localhost:8797' -d '{"owner_password":"LocalOwner123!"}' | head -c 300; echo
fi
curl -s localhost:8797/api/health; echo
