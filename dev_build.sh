#!/bin/bash
cd "$(dirname "$0")" && ./build_pages.sh && echo _worker.js > pages/dist/.assetsignore
