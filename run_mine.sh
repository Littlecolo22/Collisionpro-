#!/bin/bash
# Local preview on :8795 from pages_mine/dist with its own D1 state. usage: ./run_mine.sh [reset]
cd "$(dirname "$0")" && ./build_mine.sh >/dev/null
cd pages_mine
for p in $(pgrep -f 'dev --local --port 8795'); do kill $p; done
sleep 1
if [ "$1" = "reset" ]; then
  rm -rf .wrangler/state/v3/d1
  HOME=../.wr-home ../wr d1 execute collisionpro --local --file ../schema.sql > /tmp/mine_schema.log 2>&1 || { tail -5 /tmp/mine_schema.log; exit 1; }
fi
HOME=../.wr-home setsid nohup ../wr dev --local --port 8795 > ../mine_dev.log 2>&1 < /dev/null &
for i in $(seq 1 40); do sleep 1; curl -s localhost:8795/api/health >/dev/null && break; done
if [ "$1" = "reset" ]; then
  TOK=$(grep SETUP_TOKEN .dev.vars | cut -d= -f2)
  curl -s -X POST localhost:8795/api/setup/seed -H "X-Setup-Token: $TOK" -H 'Content-Type: application/json' -H 'Origin: http://localhost:8795' -d '{"owner_password":"LocalOwner123!"}' | head -c 300; echo
fi
curl -s localhost:8795/api/health; echo
