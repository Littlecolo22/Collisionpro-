#!/bin/bash
# Freeze-fix task: local preview on :8798 from pages_freeze/dist with its own D1 state. usage: ./run_cust.sh [reset]
set -e
cd "$(dirname "$0")"
ES=/home/sprite/trendbots-cf/node_modules/@esbuild/linux-x64/bin/esbuild
rm -rf pages_freeze/dist && cp -r public pages_freeze/dist
$ES src/pages_entry.js --bundle --format=esm --platform=neutral --main-fields=module,main --conditions=workerd,worker,browser --external:node:* --outfile=pages_freeze/dist/_worker.js --log-level=warning
echo _worker.js > pages_freeze/dist/.assetsignore
cd pages_freeze
for p in $(pgrep -f 'dev --local --port 8798'); do kill $p; done
sleep 1
if [ "$1" = "reset" ]; then
  rm -rf .wrangler/state/v3/d1
  HOME=../.wr-home ../wr d1 execute collisionpro --local --file ../schema.sql > /tmp/freeze_schema.log 2>&1 || { tail -5 /tmp/freeze_schema.log; exit 1; }
  for m in ../migrations/*.sql; do HOME=../.wr-home ../wr d1 execute collisionpro --local --file $m >> /tmp/freeze_schema.log 2>&1 || true; done
fi
HOME=../.wr-home setsid nohup ../wr dev --local --port 8798 > ../freeze_dev.log 2>&1 < /dev/null &
for i in $(seq 1 40); do sleep 1; curl -s localhost:8798/api/health >/dev/null && break; done
if [ "$1" = "reset" ]; then
  TOK=$(grep SETUP_TOKEN .dev.vars | cut -d= -f2)
  curl -s -X POST localhost:8798/api/setup/seed -H "X-Setup-Token: $TOK" -H 'Content-Type: application/json' -H 'Origin: http://localhost:8798' -d '{"owner_password":"LocalOwner123!"}' | head -c 300; echo
fi
curl -s localhost:8798/api/health; echo
