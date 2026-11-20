# Build and verification status (follow-up)

- JavaScript syntax check: run `npm run check` (excludes vendor bundles and generated build directories).
- Cloudflare Pages build: run `npm run pages:build`; requires esbuild (local install, system install, or npx network/cache).
- Android APK build: `android/build_apk.sh [versionCode] [versionName]`; requires Android SDK build-tools 35.0.0 and platform android-35, plus Java/keytool. The script's SDK path is currently `/home/sprite/android-sdk`, so change that path for other build environments.
- Runtime API/UI smoke tests in `test/smoke.mjs` and `tests/cust_api_test.py` require a running local Wrangler/Workers dev server and test database. They are not destructive-safe for a production database; run only against local test data.

This workspace currently has no Android SDK build-tools and no Wrangler executable. Network dependency installation did not finish in the allotted time, so the production Pages bundle and APK were not built here. Static syntax checks are not a substitute for build or runtime verification.
- Android build script now accepts `ANDROID_SDK_ROOT` or `ANDROID_HOME`, and `ANDROID_BUILD_TOOLS_VERSION` to override the default SDK location/version; it reports missing prerequisites early.

## Build-script hardening (latest follow-up)
- `build_pages.sh` now bundles to a temporary file before replacing `pages/dist`, preventing a failed bundle from leaving a partial deployment folder.
- The npx fallback is bounded by `BUILD_TIMEOUT_SECONDS` (default 90s) when the `timeout` command exists. Use `ESBUILD_BIN` to supply a local esbuild executable.
- Static checks were rerun successfully. The production bundle was not generated in this environment because the npm fallback did not complete; deployment has not been attempted.
