#!/bin/bash
# Build public + src into pages_mine/dist (separate from pages/dist, which the 3D task uses).
# usage: ./build_mine.sh [live]   -- "live" keeps the 3D picker files exactly as they are live now.
set -e
cd "$(dirname "$0")"
ES=/home/sprite/trendbots-cf/node_modules/@esbuild/linux-x64/bin/esbuild
rm -rf pages_mine/dist && cp -r public pages_mine/dist
$ES src/pages_entry.js --bundle --format=esm --platform=neutral --main-fields=module,main --conditions=workerd,worker,browser --external:node:* --outfile=pages_mine/dist/_worker.js --log-level=warning
if [ "$1" = "live" ]; then
  for f in car3d.js carbody.js carparts.js carlooks.js cardetail.js carstudio.js picker.js; do
    code=$(curl -s -o /tmp/live_$f -w '%{http_code}' "https://collisionpro.pages.dev/$f?nocache=$RANDOM")
    if [ "$code" = "200" ] && ! head -c 200 /tmp/live_$f | grep -qi '<!doctype'; then cp /tmp/live_$f pages_mine/dist/$f; echo "kept live $f"; else echo "no live $f ($code), using local"; fi
  done
else
  echo _worker.js > pages_mine/dist/.assetsignore
fi
