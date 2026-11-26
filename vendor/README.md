# Vendor Three.js

These files re-export Three.js r160 from jsDelivr so the 3D picker works without large binaries in the repo.

- `three.module.min.js`
- `addons/controls/OrbitControls.js`
- `addons/loaders/GLTFLoader.js`

The app needs network access to `cdn.jsdelivr.net` for 3D. For fully offline builds, replace with the files from `vendor-three-fix.zip`.
