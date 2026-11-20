#!/bin/bash
# Deploy for the "remaining screens" work: builds pages_mine/dist from public + src, keeps the
# 3D picker files exactly as they are live right now (another task owns them), then deploys.
set -e
cd "$(dirname "$0")"
./build_mine.sh live
rm -f pages_mine/dist/.assetsignore
cd pages
CLOUDFLARE_API_TOKEN=$(cat ../.prod.cftoken) HOME=../.wr-home ../wr pages deploy ../pages_mine/dist --project-name collisionpro --branch main --commit-dirty=true 2>&1 | tail -4
