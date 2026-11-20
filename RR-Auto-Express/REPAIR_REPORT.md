# R&R Auto Express / CollisionPro repair report — v6

## Source
Based on the user's RR Auto Express code and 3D-model archives, carried forward from website-repair-v5.

## Changes in v6
1. Fixed an asynchronous 3D-model lookup race in `public/picker.js`. If a user navigates to another repair order while `/api/models3d` is still responding, the old request can no longer update or load a model into the newly opened picker.
2. The exact-model load completion now verifies that its original picker session is still active before changing the UI or applying part marks.
3. Removed generated Python `__pycache__` files from the distributable archive.

## Existing repair work retained
- Hardened Cloudflare Pages build script with local/system/npx esbuild resolution and bounded npx fallback.
- Restored route lifecycle cleanup in alternate UI copies.
- Bundled the Camry and F-150 GLB sample assets under `public/models3d/`.
- Added matching sample-model fallback for Toyota Camry and Ford F-150, while shop-uploaded exact models retain priority.

## Validation
- `node tools/static-check.mjs`: passed, 69/69 JavaScript files.
- `node tools/check-local-imports.mjs`: passed, 33 JavaScript files scanned.
- `node --check public/picker.js`: passed.
- Live API smoke tests could not run: no local server was listening at `127.0.0.1:8787` (56 requests failed to connect; this is an environment/startup limitation, not evidence that those routes passed or failed).
- Cloudflare Pages production bundling and deployment remain unverified because esbuild is not installed in this environment and the npm fallback cannot reach the package registry.
- Android APK build/install remains unverified.

## Important limitations
- The bundled Camry and F-150 models are sample assets, not guaranteed year/trim-exact OEM geometry.
- Parts pricing/labor data and third-party integrations remain subject to configured shop data, credentials, API access, and licensing.
