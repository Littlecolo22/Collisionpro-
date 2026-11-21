# R&R Auto Express / CollisionPro

Full project source snapshot for the R&R Auto Express CollisionPro estimating and repair workflow prototype. Includes the web interface, Cloudflare Worker/API code, D1 database schema and migrations, Android wrapper source, 2D/3D vehicle assets, and the synchronized Cloudflare Pages deployment bundle.

> **Development snapshot:** This is not a production-ready release. Some integrations require credentials or provider setup; confirm permissions and configuration before deployment. No customer database backups, local secrets, signing keystores, or APK binaries are included.

## Included

- `src/` — Worker/backend modules and API logic
- `public/` — web application source files
- Estimate parts selection uses an interactive 2D vehicle diagram with assembly drill-down; the 3D model view remains optional.
- `pages/dist/` — Pages deploy bundle, kept in sync with public assets
- `pages/`, `pages_cust/` — Cloudflare Pages configurations
- `schema.sql`, `migrations/` — D1 database schema and migrations
- `android/` — Android wrapper source, manifest, resources, and APK build script
- `export/`, `blender/`, `public/models3d/`, `pages/dist/models3d/` — vehicle models and modeling source
- `tools/` — static checks and source/deployment synchronization checker
- `BUILD_NOTES.md`, `BUILD_VERIFICATION.md`, `REPAIR_REPORT.md`, `WEBSITE_REPAIR_PROGRESS.md` — development and repair notes

## Quick start

### Prerequisites

- Node.js (LTS recommended) and npm
- Cloudflare account and Wrangler CLI for deployment
- Android build environment (Android SDK tools and Java) if building the Android package

### Install and run checks

```bash
npm install
npm run check
```

The project checks JavaScript syntax, local module paths, and source-to-Pages asset synchronization.

### Local Cloudflare development

1. Copy `.dev.vars.example` to `.dev.vars` and set your own values (never commit `.dev.vars`).
2. Install Wrangler if needed: `npm install -g wrangler`.
3. Start local Worker development using the project Wrangler configuration and follow `BUILD_NOTES.md` for D1 setup.

For live PartsTech searches, set all four server-side secrets in the Cloudflare Pages project's Settings → Variables and Secrets (or locally in `.dev.vars`): `PARTSTECH_USER_ID`, `PARTSTECH_USER_KEY`, `PARTSTECH_PARTNER_ID`, and `PARTSTECH_PARTNER_KEY`. PartsTech must issue the integration partner ID and key for your account. Then select **PartsTech first for US vehicles, Autodoc backup** in the app's Settings and use **Test connection**. PartsTech quote searches fetch current supplier prices and availability; adding a result saves its returned price to that estimate. Existing estimates are not automatically repriced. The built-in vehicle diagrams are reference diagrams and are not provided or updated by PartsTech.

### Deploy the website to Cloudflare Pages

The Cloudflare Pages project should use the repository root as its root directory. The checked-in root `wrangler.toml` identifies the Pages build output (`pages/dist`) and D1/AI bindings. The current build command `npm run build && npm test` is supported.

For Git-connected Pages deployments, configure required secrets under the Pages project's Settings → Variables and Secrets. For a CLI deployment, build first with `npm run build`, then deploy `pages/dist` to the `collisionpro` Pages project.

### Build/synchronize Cloudflare Pages assets

```bash
npm run pages:build
npm run pages:sync-check
```

Set production credentials as Cloudflare secrets, not in source files. `wrangler.worker.toml` is the separate configuration for direct Workers deployments.

### Android

Android source is under `android/`. Build requirements are Android SDK platform/build tools 35, Java JDK, and Python 3. Launcher icons are included; Pillow and FreeSans are only needed if regenerating them. The signed APK is published from `public/downloads/RR-Auto-Express.apk`; after the Pages deployment finishes, the owner can download it from Settings. Keep `android/.keystore/` private and backed up: future APK updates must use the same signing key.

## Repository hygiene

Secrets, local environment files, signing keys, database backups, build caches, logs, and local test output are excluded through `.gitignore`. The `pages/dist/` bundle is intentionally included for deployment and versioned alongside the source.

## Status

The latest source/deployment synchronization and static checks passed at packaging time: JavaScript syntax checks (69 files), local module path check (33 files), and Pages source/dist synchronization (30 files). This does not verify live Cloudflare deployment, production API credentials, or a completed Android build.
