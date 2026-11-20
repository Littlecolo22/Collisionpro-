# R&R Auto Express project export (Nov 16, 2026)

This is a snapshot of the R&R Auto Express collision-estimating app (Cloudflare Worker/Pages backend, web app, Android wrapper and 3D vehicle work) as it stood on November 16, 2026. Work on the app is still in progress, so some features described in the notes are unfinished.

## What is included

- **src/**: backend (Cloudflare Worker / Pages functions)
- **public/**: web app (HTML, JS, CSS, Three.js vendor files)
- **migrations/**, **schema.sql**: D1 database schema
- **android/**: Android app source, icons and build_apk.sh
- **blender/**, **export/**: Blender scripts and the Camry and F-150 glTF models
- **ui/**, **wip/**: UI working copies and 3D work in progress
- **test/**, **tests/**: automated test scripts
- **pages/wrangler.toml**, **pages_cust/wrangler.toml**, **wrangler.toml**, **wrangler.deploy.toml**: deploy configs
- Build and run scripts (build_pages.sh, deploy_rs.sh and others), package.json, and the project notes (BUILD_NOTES.md and others)

## What was left out, on purpose

- **Credentials**: .dev.vars, .prod.cftoken, .prod.secrets.json, .prod.seed.json, .secrets_key.prod (Cloudflare token, RapidAPI and PartsTech keys, setup token, account passwords)
- **Android signing key**: android/.keystore (needed to sign updates that install over your current app; keep it private) and built APKs in android/build
- **Customer data**: the database backup .backup_before_wipe_20261115.sql
- **Generated files**: node_modules, .wrangler, .wr-home, pages/dist and the local test copies pages_local, pages_mine, pages_freeze, pages_cust/dist
- **Logs and screenshots**: *.log, shots/
- The **wr** shortcut (a link to wrangler on the build machine)

## Getting it running

1. Run `npm install`, and install Wrangler (`npm install -g wrangler`).
2. Copy .dev.vars.example to .dev.vars and fill in your own values.
3. Local dev: `wrangler dev` (uses wrangler.toml and the local D1 database).
4. Deploy: see BUILD_NOTES.md (build_pages.sh, then `wrangler pages deploy` from pages/), and set the secrets with `wrangler pages secret put NAME`.
5. Android: see android/build_apk.sh. It needs your own keystore; a new keystore makes an APK that will not install over the current app without uninstalling it first.

Scripts that read .prod.cftoken or .dev.vars expect those files to exist locally and must never be committed. The .gitignore already excludes them.
