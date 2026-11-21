# CollisionPro build notes

## Stage 1 (estimate screens + 3D picker + Autodoc connector) — in progress
- Frontend: public/index.html, public/app.js (SPA, hash routes), public/styles.css, public/car3d.js (Three.js picker), public/vendor (three r18x + OrbitControls/GLTFLoader).
- Backend additions: catalog.js model3dFrom() (9 detailed styles -> catalog family sedan/coupe/truck/suv), logic.js decodeVin adds cab/bed/wheelbase + model3d,
  r_jobs.js jobBundle.model3d, GET /api/models3d (shop-uploaded .glb keyed caption "year|make|model", year may be *), files accept .glb with kind=model3d.
- src/partsapi.js: Autodoc Parts Catalog (RapidAPI) and PartsTech supplier quote adapters. Server-side only; keys are Worker secrets, local: .dev.vars (never committed).
  PartsTech requires the shop's PARTSTECH_USER_ID/PARTSTECH_USER_KEY and the PARTSTECH_PARTNER_ID/PARTSTECH_PARTNER_KEY issued by PartsTech. Quote searches are not cached so supplier price/availability is fetched on every search; store lists and auth tokens are cached.
  Setting vin_parts_provider: sample | autodoc | autodoc_mock | partstech_autodoc | partstech_mock. D1 cache table api_cache. Routes /api/parts/{status,test,search,vehicle,categories,articles,article/:id}.
  Endpoints used: /api/vin/decoder-v3|v1|v5/{vin}, /api/category/type-id/1/products-groups-variant-1/{vehicleId}/lang-id/4,
  /api/category/search-for-the-commodity-group-tree-by-description/..., /api/articles/list/type-id/1/vehicle-id/{v}/category-id/{c}/lang-id/4,
  /api/articles/details/article-id/{id}/lang-id/4, /api/articles/article-all-media-info, POST /api/articles/get-oems-by-list-of-articles-ids {articleIds:[]}.
  As of 2026-11-11 the user's key got "You are not subscribed to this API" (403) — connector tested with mocks.
- CSP: img-src/connect-src allow https: (part images, glTF library).

## Pages move (prepared 2026-11-14, not deployed)
- ./build_pages.sh bundles src/pages_entry.js (wraps index.js; daily job runs on first request after 11:15 UTC, claimed via D1 table daily_runs) into pages/dist/_worker.js plus static files.
- pages/wrangler.toml: project collisionpro, D1 collisionpro (fe051cca-...), AI binding. Deploy: cd pages && CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ../wr pages project create collisionpro --production-branch main; ../wr pages deploy; then add the needed secrets in Pages Settings → Variables and Secrets, including all four PartsTech secrets when enabled.
- Blocker: vault-saved token (collisionpro_cf_token) is not substituted in exec (literal <secret> tag reached Cloudflare). trendbots token lacks Pages permission (Authentication error on pages/projects) and must not be used for this.
- Local check: pages dev serves / (200), SPA routes (200), /api/health ok, /api/jobs 401 without sign-in.

## Next stages
- Stage 2: production board, schedule, parts, paint, invoices, reports, insurers, compliance, messages, customer portal UI.
- Stage 3: Android APK (Capacitor/TWA wrapper of the deployed site).

## Nov 14 2026: Pages, sign-up, roles, Android
- Live: https://collisionpro.pages.dev (Pages project "collisionpro", D1 "collisionpro"). Deploy: ./build_pages.sh, then `wr pages deploy` from pages/ with CLOUDFLARE_API_TOKEN from .prod.cftoken (chmod 600).
- Sign-up: open only while the users table is empty; first sign-up becomes owner (settings -1 'owner_claimed'), then closed. Rate limits in settings -1 'signup:*' / 'login:*'.
- Roles: owner ('*'); employee = jobs.read, jobs.write, estimate.write, files.write. Shop/financial routes need 'shop.read'. Job bundle strips rates, invoices, payments and costs for employees. Settings has Employees (add/disable/reset/remove); "My account" changes own password (needs current password).
- Demo data wiped (backup .backup_before_wipe_*.sql, private). No sample parts fallback: picker shows "No parts catalog connected".
- 3D: catalog.js DIMS table sizes the body to real length/width/height/wheelbase for ~70 common US models; paint colour from the vehicle.
- Shop name: settings shop_name (editable in Settings), now "R&R Auto Express".
- Android: android/ (WebView shell, package com.rrautoexpress.collisionpro). Build: android/build_apk.sh <versionCode> <versionName>. Keystore android/.keystore (private); every update must use it and a higher versionCode.
- Old Worker collisionpro.sergio-trendbots.workers.dev still running (token lacks Workers Scripts Edit); delete it once the token has that permission.
- Nov 14 2026 (v1.1, versionCode 2): status bar overlap fixed. MainActivity draws edge-to-edge on every Android version and puts system-bar + cutout + keyboard insets as WebView margins, with a #161C23 strip behind the status bar and light bar icons. Web: styles.css safe-area block (env(safe-area-inset-*)) on .top, .nav, .main, .sheet, .bulk, #toast, .modal, .login; theme-color #161c23. "1 line" singular in picker/estimate/finish. Deployed to Pages. No emulator here (no /dev/kvm), so the APK was not launched.

## 2D diagram (deployed Nov 14, 2026)
- public/diagram2d.js: app-drawn SVG unfolded layout (front/top/rear + left/right sides + 4 bumper-internals boxes), portrait on phones, landscape on desktop. Same mesh ids as 3D/catalog. Tap, long-press multi-select, L/R mirror, pinch/pan/wheel zoom.
- picker.js: "2D diagram | 3D" toggle (cp_view in localStorage, 2D default <=820px), bulk bar #bulk2.
- Local dev: ./dev_build.sh then `wrangler dev --local --port 8790` in pages_local/ (no AI binding).
- Test: test/pw_diagram2d.py BASE SESSION_FILE '{"sedan":id,"pickup":id,"minivan":id}' (59 checks; uses the details panel's quick Repair button). The Nov 14 test jobs 27-29, their customers/vehicles and the temporary user-14 session were deleted from prod on Nov 15.

## Still to do (requested Nov 14)
1. Stage 2 screens (board, schedule, parts, paint, invoices, reports, insurers, compliance, messages, customer portal) on existing /api routes; owner only.
2. Bottom swipeable menu bar on phones with every page (employees: Estimates, New estimate, My account); sign out in My account.
3. Dark restyle per reference (chat attachment 01a1dd19-...): black bg, #16161c cards, 24px radius, blue pills, frosted panels, floating + button.
4. (Done Nov 15, see the 3D picker section.)

## 3D picker v2 (deployed Nov 15, 2026)
- Files: public/carbody.js (smooth parametric body: nose cap, side bands, greenhouse, top band, rear cap; alloy wheels, tires, brake discs, shaped lamps, honeycomb grille, clearcoat paint, tinted glass; each piece keeps a recipe so isolate can rebuild it with thickness, flanges, openings and tabs), public/carparts.js (detailPart, buildExploded front/rear bumper, buildStructure for X-ray, ghostify), public/car3d.js (picker with RoomEnvironment, gradient backdrop, contact shadow, nav stack), public/vendor/addons/environments/RoomEnvironment.js.
- car3d.js API: build, setMode, drillInto, select, has, where, loadExact, setMarks, resetView, snapshot, destroy, plus explode(asm), isolate(mesh,label), canIsolate, back(instant), home, setXray, setInset(bottomPx, sidePx), onNav({depth,crumbs}), getters kind/depth/crumbs/xray/mode.
  - Camera framing: frame('exterior') fits the car's bounding box to the canvas for any aspect (fitView); phones in portrait use a higher 3/4 front view (portrait pos = L*0.95, roof+1.55, L*0.62). Exploded and isolate views are fitted the same way. Resize refits unless the user has moved the camera.
  - push() saves the camera's animation goal (camGoal) instead of a mid-animation position, and explode/isolate replace the current level with an instant camera restore, so Back always returns to the right view.
  - X-ray picking uses only the structure group (the ghosted shell no longer steals taps).
  - Lighting: key light 1.35 + warm side fill 0.75 + cool fill 0.45 (hoods on light paint were blowing out to white). Operation marks also tint emissive at 0.3 so the colour key reads on light paint.
  - setInset shifts the picture (camera view offset) so the model stays in the part of the canvas the part panel does not cover (bottom sheet on phones, side panel >=900px).
- picker.js: toolbar Exterior/Interior, X-ray, Explode, reset, parts list; crumb row (Back arrow + tappable Car › Front bumper › part, plus a Front/Rear bumper switch when exploded). Each level deeper pushes a history entry ({cp3d:n}); popstate steps pk.back() so Android/browser back goes up one level. Tap a part = details panel; tap it again or "View alone" = isolate. Details panel: structural flag, material (heuristic from part name, aluminum for 2015+ F-series), labor type, ADAS, hours per op from the catalog row, quick Replace/Repair/Refinish/Blend/R&I buttons (POST /api/jobs/:id/lines/catalog, same as the form, panel stays open), related-part chips (mirror side, structural neighbours, same assembly). The old custom hours/price form is under "Custom hours, price and part type". Sheet max height 52vh on phones, side panel on desktop. window.__S exposes app state for the tests.
- Catalog: 15 new rows inserted in prod D1 (now 214 rows) and structural rows re-pointed at their own meshes; SQL generator /tmp/mkmig.mjs (INSERT ... WHERE NOT EXISTS + UPDATE mesh), safe to re-run.
- Tests: test/pw_3d.py BASE SESSION_FILE JOBS_JSON [shotdir] (46 checks per viewport, sedan/pickup/minivan, phone 390x844 touch + desktop 1366x850): tap adds lines, quick ops, isolate, history back, explode + tap piece, 3-level crumbs, Back button, Car crumb, rear switch, explode off restores camera, X-ray structural tap, frame rate under software GL. Nov 15: 92/92 locally and 92/92 on prod; 2D suite 59/59 on prod.
- Not verified: real GPU/phone frame rate (software GL gave 11-16 fps in the headless browser), and nobody has looked at the renders as pictures (checked by projected sizes, sampled paint pixels and wheel positions only).

## Dark look + bottom menu (deployed Nov 15, 2026)
- styles.css rewritten as a dark theme: bg #060608, cards #16161c with 24px radius, Inter variable font self-hosted at public/fonts/inter-var.woff2 (preloaded in index.html), blue pill primary buttons (#2f7bff), white-outline secondary buttons (default <button>), round translucent .ib icon buttons, .tag/.pill status pills, rounded .search bar, global [hidden]{display:none!important} (fixes the estimate bulk bar that always showed). PDFs are server-rendered and unchanged (white).
- app.js shell(): NAV now [key, name, short label, icon, stage]; inline SVG icons via exported icon(); navItems() (employees: jobs/new/account); signOut() exported. Desktop (>900px) keeps the side menu with icons. Phones: #bnav bottom bar, one horizontally swipeable row (#bscroll) with every page, active item highlighted and centred into view, edge fade via mask (classes fl/fr), wheel scrolls it on desktop, floating blue #fab "+" = New estimate. Bar sits in the flex column under .main so it never covers content; padding uses env(safe-area-inset-bottom). Hamburger removed.
- Sign-in/sign-up use authWrap() (gradient mark, big heading). Estimates home: hero cards (purple-blue gradients, frosted .glass panel with vehicle/customer and a white .wpill total fetched from /api/jobs/:id) for up to 3 open jobs, swipeable carousel on phones; the rest as .jrow list; search filters live. Placeholder screens show a "coming soon" card. My account shows name/email/role and a Sign out card.
- .estlayout/.v3wrap columns are minmax(0,1fr) so the estimate grid can no longer push the page sideways on phones; .tag wraps.
- Android v1.2 (versionCode 3): status-bar strip and window colors changed to #060608 to match. Built and signed with the same key; not launched (no emulator).
- Tests: test/pw_shell.py BASE OWNER_SESSION [EMPLOYEE_SESSION|-] [shotdir] (30 checks: dark bg + font on sign-in, bar visible/side menu hidden on phone, all 15 owner pages in order, swipe + fades, bar pinned to bottom, 48px targets, hero totals, search, current page in view after tap and on deep link, placeholder, FAB, account sign out, desktop side menu, employee sees Estimates + My account + FAB only). Nov 15 prod: shell 30/30, 3D 92/92, 2D 59/59 (prod test jobs 30-32 "ZZ Shell Test" and the temporary owner/employee sessions were deleted afterwards). Note: the 2D/3D pickup test needs the vehicle body "Pickup" with vin_data cab "crew"; don't run the 2D and 3D suites at the same time on the same jobs (line counts race).

## Per-model car looks (deployed Nov 15, 2026) — 3D picker task
- Touched only: public/carlooks.js (new), public/carbody.js, public/car3d.js, public/picker.js (one line: pk.build passes make/model). pages/dist already contains these; the next full deploy of pages/dist includes them.
- VEHICLE_REFERENCE_NOTES.md: our own written notes on 24 common US vehicles (generation/years, proportions, glass angles, lamps, grille, character lines), from looking at public preview pictures on 3dmodels.org. Nothing bought, downloaded or saved from that site; no third-party geometry. 3dmodels_research.md = prices/licence notes.
- carlooks.js LOOKS table keyed 'make|model' -> shape (hood, rake, fast, hatch, gc, wr, hoodF, rise) + styling (lampW, lampH, grille chrome/black/body/closed, gH, lowW/lowH, tailW, tailBar, blackRoof, clad). applyLook() runs in specFor() after real dims; unknown vehicles are unchanged.
- New child meshes: 'clad' (black arch bands, children of fender_*/quarter_*/bedside_*) and 'lightbar' (child of decklid). They carry no new part IDs; tapping them selects the parent panel.
- Tests on preview + live: test/pw_3d.py 92/92, test/pw_diagram2d.py 59/59. Test jobs 33-38 (ZZ Look Test) and the temporary session deleted.

## Phone landscape + layout fixes (deployed Nov 15, 2026)
- Phone layout now means `(max-width:900px),(max-height:500px)` everywhere (CSS media queries, estimate.js `PHONE`, picker 2D default). Short landscape phones get a slim icon-only rail on the left (`.bnav` turned vertical, labels hidden, + button at its end) instead of the side menu; header, tabs and padding shrink.
- 3D picker: desktop card is aspect 4:3, max 70vh, min 320px, sticky, `align-self:start`; parts list scrolls on its own (sticky, max-height = viewport). 901–1180px wide stacks the parts list under the 3D view. Landscape phones: the 3D view fills the height, controls are one scrolling row, legend sits bottom-right in a column, name bottom-left, and the parts list is a right-hand drawer (Parts list button opens, ✕ closes). Part sheet is a right drawer in landscape too.
- car3d.js: the camera now shifts the car down by the toolbar height so the controls don't cover it (only change there; ResizeObserver/fit were already in place).
- Estimate: phones show line cards (`#lc`, `lineCard()`), tap opens a line editor (`editLine()`), checkbox for bulk select, Select all. Desktop table: checkbox and row number on one line, real dropdown colors, wider part # column. Filter row is a two-column grid on phones; the RO header is no longer sticky on phones.
- Tests: `test/pw_layout.py BASE SESSION JOB [shotdir] [routes]` checks sideways scroll, side menu vs bottom bar, header/tab overlap, 3D name/legend overlap, toolbar height, canvas = view size, table header alignment, row-number wrap and clipped text at 390×844, 844×390, 412×915, 915×412, 768×347, 980×1900, 1440×900, 700×1300. `test/pw_shots.py` takes phone screenshots.

## Detailed 3D cars: studio look + detail pass (Nov 15, 2026) — 3D picker task
- COORDINATION: the 3D files in public/ (car3d.js, carbody.js, carparts.js, carstudio.js NEW, cardetail.js NEW) are finished and tested (3D 92/92, 2D 59/59 on the local preview). Any full deploy of public/ may ship them. The 3D task touched no other file.
- carstudio.js: code-built HDR softbox room -> PMREM environment (overhead softbox, long side strip lights for the shoulder/rocker streaks, warm/cool keys), studio lights, gray gradient backdrop, reflective floor = custom shader with a faint blurred mirror pass of the car (half-float RT, 0.5x res desktop / 0.33x phone) fading to the horizon, wheel contact blobs, and qualityGovernor(): if orbiting averages >42 ms/frame it lowers the mirror res, then turns the mirror off, then lowers pixel ratio (never steps back up).
- cardetail.js: canvas textures for grilles (bars/blocks/mesh/slats/honeycomb, fitted to real cell size), headlamps (projector bowls, LED guides cbar/j/dual/line, amber marker; emissive map), taillamps (vertical pickup, L/C, bar; emissive), tyre bump map (4 grooves + sipes, sidewall marks, no words). Spoke geometry per style (six/multi/twenty/twin/aero), calipers, lug nuts, lathe tyre with tread/sidewall bands. buildCabin(): seats + headrests (2 or 2+3 rows), dash, instrument hood, screen, console, door trim, steering wheel; userData.cabin, not pickable, hidden in X-ray (ghostify). detailFor(spec): per-style defaults + per-model overrides for the 24 models in carlooks (our own choices).
- carbody.js: crease() adds a shoulder ridge + lower door sculpt to sideZ (faded before nose/tail); side panels have more rows. Paint finish by colour (paintFinish: white solid, black deep gloss, others metallic) + clearcoat. Glass opacity 0.6 so the cabin shows. Door handles on black cups (body colour + chrome strip, or chrome). Mirrors = painted cap on black stalk(s), dark mirror glass, amber repeater (tow style for pickups/vans). Cowl now carries wipers (blades + arms + pivots). Roof carries sunroof glass/seal or roof rails (per detailFor). Pickup bed: 13 ribs, liner, tie-down hooks; tailgate cap, pressed lines, generic oval emblem. Front/rear park sensors on the bumper covers, exhaust tips on sedans. The core box is an open tub for non-cargo bodies so the interior is visible.
- No new part IDs: every new mesh is a child of an existing part (cowl, roof, mirror_*, wheel_*, tire_*, fbumper_cover, rbumper_cover, decklid, bed_floor, headlamp_*, tail_lamp_*, grille). Part lists for f150/camry/odyssey/model3/rav4/silverado are identical to before.
- Dev harness (no server/login needed): `python3 -m http.server 8765` in the app folder, then wip/h.html?car=f150|camry|rav4|odyssey|silverado|model3; wip/shot.py, wip/regions.py (per-part pixel stats), wip/perf.py, wip/geocheck.py.
- Cost: ~380-440 draw calls / 160-175k triangles per frame incl. the mirror pass (was ~150 / 41k). Software-GL test frame rate 9-13 fps (was 11-16).

## Remaining screens (Nov 15, 2026) — status
- How to work on them without touching the 3D task: `./run_mine.sh [reset]` = local preview on :8795 from pages_mine/dist with its own D1 (owner LocalOwner123!). `./deploy_rs.sh` builds pages_mine/dist from public+src and copies car3d/carbody/carparts/carlooks/cardetail/carstudio/picker.js from the LIVE site before deploying, so 3D files are never changed by this work. Owner screens part 2 live in public/ops2.js (loaded after ops.js), CSS appended to public/ops.css.
- Owner-only rule: every route in r_owner.js / r_msgs.js calls ownerOnly(c) or c.need(cap) (employee role lacks the caps) -> 403 "Owner only". UI uses guard() from ops.js.
- Tests: test/pw_layout.py (overlap/clip/sideways at 8 sizes, pass extra routes as arg 5), test/pw_shell.py (menu), test/pw_diagram2d.py (2D, pass job ids with body set: Sedan/Saloon, Pickup, Minivan), test/pw_msgs.py (Messages flow), test/mock_smsgate.py (local fake api.sms-gate.app on :8796; local .dev.vars SMSGATE_URL points at it), test/webhook_send.py (signed webhook). On the live site, make a temporary session row for user 14 (owner) / 15 (employee) and delete it after.

### Production board (live Nov 15) — public/ops.js view('production'), routes in r_ops.js
- Columns by jobs.stage (intake..ready), stage chips with counts, cards with vehicle/customer/time in stage/due (red if late)/open parts/insurer/alerts. Tap a card -> move dialog (back/forward/any stage, "Text the customer" checkbox), drag between columns on desktop. "Start a repair" puts an estimate on the board; "Delivered to customer" at Ready closes the job; moving back from Ready reopens it. PUT /api/jobs/:id/stage {stage, notify}. With notify, the stage text goes through sendCustomerMessage -> SMS gateway; if it can't send, the board offers the one-tap "Send from my phone".

### Invoices (live Nov 15) — view('invoices'), routes in r_owner.js
- Totals (billed/collected/balance/overdue), "Ready to invoice" list (Create invoice; Approve & invoice for unapproved), filters Open/Paid/All/Void. Detail: charges, customer vs insurance split, editable deductible, payment form (payer, applies to, method, date, check #), payment list with remove, PDF, Void. Invoices only from approved estimates; deposits count; status flips to partial/paid automatically.

### Messages (live Nov 15) — view('messages') in ops2.js, routes in src/r_msgs.js, gateway adapter src/sms.js
- Per-job threads (list + thread, phone shows one at a time with a back button), quick replies, unread counts, "Texts from unknown numbers" with Add to job. Bubbles show Sending/Sent/Delivered/Not sent + error.
- Gateway: SMS Gateway for Android Cloud server, https://api.sms-gate.app/3rdparty/v1, basic auth. Username/password saved via PUT /api/sms/settings into D1 table private_kv, password AES-GCM encrypted with the Pages secret SECRETS_KEY (copy in .secrets_key.prod, gitignored). Never returned by any route; /api/settings doesn't include it.
- Saving credentials registers webhooks cp-sms-received / cp-sms-sent / cp-sms-delivered / cp-sms-failed pointing at /api/sms/webhook?k=<random secret>. Webhook checks k, and if a signing key is saved, X-Signature = hex HMAC-SHA256(key, rawBody + X-Timestamp) with a 5-minute window. Incoming texts match a job by the customer's last 10 phone digits (newest open job), STOP/UNSUBSCRIBE turns texts off for that customer, START turns them back on; duplicates ignored by messageId.
- Pacing: each send gets scheduleAt >= previous slot + N seconds (Settings "Seconds between texts", default 20). Delivery: withDeliveryReport, webhooks update status, opening a thread also polls GET /messages/{id} for unsettled ones.
- "Send test text" (POST /api/sms/test) + "Check again". Fallback: "Send from my phone" logs the text (status sent_from_phone) and opens sms: with the body.
- Migration: migrations/005_messages.sql (applied to live D1 Nov 15). Old Twilio path in deliverMessage only runs if the gateway isn't set up.

### Verified on live Nov 15 (07:50 UTC run)
- test/pw_msgs.py 27/27, test/pw_portal.py 34/34 (no sign on live), test/pw_sched_parts.py 17/17 (adds/edits/deletes a ZZTEST event and part, employee 403s), test/pw_layout.py 72/72 views clean at 8 sizes on schedule, parts, portal, portal/39, messages, messages/39, settings, production, invoices. Webhook with a wrong k -> 403.
- Local only: pw_portal.py sign 36/36 (job 1 with a temporary customer-visible photo), test/pw_portal_more.py 6/6 (photo loads + opens big, estimate PDF, invoice section + invoice PDF, portal visitor gets 401 on /api/portal-admin). Temporary photo and local sessions deleted.
- Fix this run: the public portal context (index.js) had can: () => false, so the job bundle dropped invoices/payments and the portal always showed no invoice and "No invoice yet" on the invoice PDF. Now can('shop.read') only; portal routes still pick customer-safe fields.
- Gateway state on live: user saved creds (username 5NFU94), app reached the gateway and registered 4 webhooks. The test text to +14706028735 at 07:38 came back failed: "uid 10481 does not have android.permission.SEND_SMS" = the SMS Gateway app on the phone lacks the SMS permission. Fix on the phone (App info > Permissions > SMS > Allow), then Send test text again. No signing key saved (optional; k secret still guards the webhook).
- Live test data removed: old "Portal test message" (messages id 6), temporary owner/employee sessions from 06:57. Messages 7 and 8 (job 26 portal "Thank you", job 40 paint-stage text) were not made by this run and were left.

### Customer portal (live Nov 15) — public/portal.html/js/css, /p/<token>, owner screen view('portal') in ops2.js, routes index.js /api/portal/* + r_screens2.js /api/portal-admin
- Random per-job token link, owner can copy it, text it, open it as the customer, pick which photos are shared, turn it off or make a new one. Shows status/stage steps, customer-visible photos with full-size view, estimate with PDF, sign-to-approve, invoice and balance with PDF, message box.
### Schedule (live Nov 15) — view('schedule') in ops2.js, /api/sched in r_screens2.js
- Two-week grid, prev/today/next/jump, appointments (type, job, title, time, notes) add/edit/delete, job dates (in/due out) editing, late flags.
### Parts (live Nov 15) — view('parts') in ops2.js, /api/parts2 in r_screens2.js
- Filters Open/Received/Returned/All/Vendors, part add/edit/delete (job, number, type, qty, vendor, status, cost/sell, ETA, received, return reason + credit), vendors add/edit/delete, parts cost and credits due totals.

### Still "coming soon" (build in this order)
- Reports, Insurers, Paint, Compliance.

## Spec match: Camry 2021+ and F-150 13th gen, perf pass, GLB export, Cycles renders (Nov 15, 2026)
- carlooks.js: looks can be per generation with a 'make|model|YYYY-YYYY' key; lookFor() uses it when the vehicle's year
  falls in range (picker.js now passes v.year to pk.build). 'ford|f-150|2015-2020' = 13th gen; plain 'ford|f-150' stays
  the 14th-gen look for 2021+ or no year. New look fields: gTrap, fogPods, fog:'square', valance:'black', lampAngle,
  hoodBulge, lowProfile, finish {metalness, roughness, clearcoat, clearcoatRoughness, sheen}, glass 'dark'|'tint',
  crease (shoulder line strength), cam {side, az, el} (default 3/4 angle; side 1 = right, -1 = left), studio {bg, grad, refl}.
- Camry: spec cam left 3/4 at 25 deg, flat #6e6e6e studio, no floor reflection. F-150 (2015-2020): right 3/4 at 37 deg,
  gradient around #8a8a8a-#969696, floor reflection 0.3.
- cardetail.js: new grille kinds 'twobar' (pickup) and 'dslats' (sedan upper/lower); headlamp kinds 'projector'
  (slim, amber strip under it) and 'reflector' (clear lens, three chrome bowls); tyreBump('at') all-terrain blocks;
  wheel style 'five'; per-model detail keys handle 'black', mirror 'towblack', sunroof 'split', finish 'twotone'|'gunmetal',
  tread 'at', caliper 'red'.
- carbody.js: mats(paint, look) applies finish + glass tint; hood dome (hoodBulge); trapezoid upper grille (gTrap);
  square fog recesses; black lower valance on fbumper_cover; split black panoramic sunroof; black handles/mirror caps;
  two-tone wheels (dark gray barrel, machined spoke faces); low-profile tyres; ribbed painted bed walls (merged).
  s.res (default 1) scales every lofted grid for high-res export; s.compact=false skips merging.
- Perf: compactParts() merges static detail inside each tappable part into one mesh per material look (each part
  keeps its id and own material instances, recipe meshes for isolate and the cabin are untouched), and merges loose
  root decoration the same way. Small meshes (<0.14 m bounding radius) and the cabin go on layer 2 (DETAIL_LAYER in
  carstudio.js): drawn by the main camera, skipped by the blurred floor mirror pass. Raycaster has all layers enabled.
  floor.setLook(cfg) sets floor/horizon colours and reflection strength; refl 0 skips the mirror pass. Governor still
  drops reflection then pixel ratio on slow phones (floor.state.level).
  Headless phone test (wip/perf.py, software GL, 390x700 @1.75): Camry 382 -> 145 draw calls, 158k -> 78k triangles,
  9.0 -> 2.7 ms/frame; F-150 440 -> 249 calls, 175k -> 160k triangles, 11.6 -> 4.6 ms. Not measured on a real phone.
- Tests: test/pw_3d.py 92/92, test/pw_diagram2d.py 59/59 on a local copy (/tmp/rr3d, wrangler dev :8797).
- Exports: wip/export.html + wip/export.py CAR RES OUTDIR -> export/<car>.glb/.gltf (res 2, nothing merged, every part a
  named node with its part id, child meshes part__piece, shared role-named PBR materials). wip/GLTFExporter.js and
  TextureUtils.js are three r160 addons (MIT), imports patched to local paths.
- Renders: /home/sprite/bpyenv (pip bpy 5.x, Blender as a Python module, CPU). wip/render_cycles.py EXPORT OUT SAMPLES
  SCALE [cars] imports the GLBs, applies Cycles materials (pearl white 0.88/0.90/0.92 met 0.62 rough 0.22, silver
  0.52/0.57/0.62 met 0.78 rough 0.23, coat 0.45/0.22, transmissive glass, red calipers, charcoal interior), studio
  (gray floor, 4 area lights: warm key, cool fill, rear rim, overhead strip; world 0.45; 52 mm; AgX; 1800x1200; 48 spp +
  OIDN), six views + Showroom variant (polished floor, 8 strip lights) + five orthographic panels, saves
  rr_auto_vehicles.blend (collections pickup / sedan / studio, objects 'PICKUP | part'). MASK=1 renders framing masks.
  wip/sheets.py builds the 12-view contact sheet and five-view sheets. Output in /home/sprite/rr_renders.
- blender/vehicle_models.py: the user's own Blender script (indentation rebuilt from the PDF, otherwise unchanged),
  blender/run_user_script.py runs it, saves vehicle_models.blend and renders vehicle_models_render.png.
- Deployed 07:40 UTC Nov 15 (deployment 9a451c0c): static files = what was live (the screens task's 07:26 deploy) + the
  7 updated 3D files (car3d, carbody, carparts, carlooks, cardetail, carstudio, picker.js year line); worker built from
  current src. The screens task's unfinished local edits in public/ (app.js, ops2.js, ops.css) were NOT shipped.
  COORDINATION: deploy_rs.sh copies the 3D files from LIVE, so its next deploy keeps this 3D work.

## Customer contact edit (Nov 15, ~08:00 UTC, deployed via deploy_rs.sh)
- public/customer.js (new): editCustomer(cu|null) panel (bottom sheet on phones, side panel in phone landscape, centred
  dialog on computers): name, mobile phone, email, address, preferred contact (Text/Call/Email -> contact_pref sms/call/email),
  text opt-in switch (sms_opt_in), notes. Client validation mirrors the server; "Saved" shows ~1s before it closes; Esc/✕/Cancel
  ask before discarding edits. custBlock(cu) = the estimate's Customer card with tel:/mailto: links and an Edit button.
- Customers screen (screens.js view('customers')): searchable list (name/phone digits/email/address), tap a row to edit,
  "New customer" button (icon-only on phones). Employees now see Customers in their menu (app.js EMP_NAV).
- Estimate (estimate.js): "Customer" card above Totals; Edit updates the card and the header subtitle at once.
- Server (src/r_jobs.js): normPhone/normEmail/cleanCustomer. Phones stored as "(555) 123-4567" (US/CA; 11-digit 1xxx accepted,
  area code can't start 0/1), others "+<digits>"; Messages matches on digits10 so both forms match. Emails trimmed + lower-cased.
  Preferred contact must have its phone/email when it's set or changed. POST /api/jobs inline customer goes through the same cleaning.
  GET/PUT /api/customers/:id: jobs.read / jobs.write (owner + employee), 403 if the customer's location_id differs from the
  user's location_id (users with no location = whole shop). PUT logs audit 'update' 'customer' with changed fields [old,new]
  (notes logged as "(changed)" only). GET /api/customers?q= also matches phone digits ignoring formatting.
- Where contact info is copied: jobs, estimate PDF, Messages threads, portal read customers live (joins), so nothing to sync.
  Copies that ARE synced on edit: invoices.bill_to for open/partial invoices of that customer's jobs when bill_to equalled the
  old name (paid/void invoices keep their history); unmatched incoming texts (messages job_id NULL, direction 'in') from the
  new phone get linked to the customer and their newest open job.
- Tests: tests/cust_api_test.py [BASE] (local 24/24: normalisation, 6 bad inputs, other-location employee 403 read+write, estimate +
  PDF + Messages show the edit, digit search, audit by employee, employee adds customer, restore). test/pw_customer.py BASE TOKEN JOB
  [shotdir] (55/55 local and live: 390x844, 844x390, 412x915, 1440x900, 980x1900 — panel on screen, no overlaps/clipping/sideways
  scroll, validation errors, save + normalised values, new-customer panel, estimate Edit updates right away; restores the customer).
  pw_layout.py on live (estimate job 26 + customers, 8 sizes): 16/16 clean; its temporary session deleted. Local preview for this work: ./run_cust.sh [reset] on :8797 (pages_cust/).
- Live test data deleted: job 42 / customer 42 / vehicle 42 "ZZ Cust Edit Test" (RO-10019 number used), their audit rows, and the
  temporary owner(14)/employee(15) sessions. Jobs 39-41 "ZZ Layout Test" were not made by this work and were left.

## Texting from the owner's phone + "How to send texts" (Nov 15, 2026, ~08:30 UTC, deployed via deploy_rs.sh)
- **Android v1.3 (versionCode 4)**, same keystore, built with `android/build_apk.sh 4 1.3`. NOT run on a device (no emulator). Next build: versionCode 5+.
  - Manifest: SEND_SMS, RECEIVE_SMS (shows "SMS" under App permissions), POST_NOTIFICATIONS, FOREGROUND_SERVICE(+_REMOTE_MESSAGING), RECEIVE_BOOT_COMPLETED, REQUEST_IGNORE_BATTERY_OPTIMIZATIONS; telephony feature optional. No READ_SMS / READ_PHONE_STATE (not needed).
  - `SmsEngine.java`: queue loop. POST /api/sms/device/sync with `Authorization: Bearer d_...` every 15 s (app open) / 30 s (service), asks for ONE text at a time and waits the server's `pace` seconds between sends. Multipart via divideMessage + per-part sent/delivered PendingIntents (`SmsStatusReceiver`, explicit, not exported). Statuses and incoming texts queue in private prefs (allowBackup=false) until the server takes them. 401 = unlinked → clears token, fires `linkchange`.
  - `SmsService.java`: foreground service (type remoteMessaging) with a min-importance "Texting on" notification; only when the owner ticks "Send texts when the app is closed". `BootReceiver` restarts it after reboot/app update.
  - `SmsReceiver.java`: SMS_RECEIVED (BROADCAST_SMS-protected), joins multipart, skips short codes (<10 digits), forwards only while linked AND method=device. Server keeps only texts from known customer numbers (personal texts dropped).
  - JS bridge `window.RRAndroid` (only answers when the page host is collisionpro.pages.dev): smsStatus() JSON {send, receive, notif, notifNeeded, telephony, blocked, linked, hint, bg, batteryOk, running, name, model, android, appVersion}, hasSmsPermission(), requestSmsPermission(), sendSms(phone, text, cbId) → `rrnative` {type:'sms', id, status sent|delivered|failed, error}, openAppSettings(), openBatterySettings(), link(token, hint, origin), unlink(), setBackground(bool), syncNow(). Events: window `rrnative` {type: perm|resume|sms|linkchange}.
  - "blocked" = SMS denied with no rationale and either no dialog (<600 ms, restricted setting for sideloaded apps) or a second refusal → web shows App info › ⋮ › Allow restricted settings › Permissions › SMS › Allow.
  - Google Play only allows SMS permissions for default SMS apps; this APK is sideloaded, so that policy doesn't apply. Don't publish it to Play as-is.
- **Server** (src/sms.js, src/r_msgs.js, src/logic.js):
  - private_kv `sms_method` = device | gateway | manual (unset → gateway if creds saved, else manual). `sms_device` = JSON {hash (SHA-256 of token), hint, name, model, android, app_version, linked, linked_by, last_seen, perm, bg, battery_ok, last_ok, last_error}. Token itself is never stored; linking again replaces it (old phone gets 401).
  - deliverMessage: device → status `phone_queue` (or `queued (no texting phone linked)`); manual → `queued (send it from your messaging app)`; gateway as before.
  - POST /api/sms/device/link (owner) → {token, hint, ...settings}; sets method=device. POST /api/sms/device/sync (public, device token): reports perm/statuses/incoming, claims next text(s) (`phone_queue` → `phone_sending`, stale claims >3 min re-issued, >24 h queued → failed, opted-out → failed "The customer replied STOP"). Status never goes backwards (sent/delivered/failed).
  - PUT /api/sms/settings also takes {method} and {forget_device:1}. GET adds method, can_send, device (no hash, + online = check-in <2 min), phone_queue {waiting, sending}. /api/sms/test with method=device queues a real text (msg row, job_id NULL) and the test status follows it; manual → 400.
  - POST /api/messages/:id/sent-from-phone (owner): failed/queued text marked sent_from_phone when the owner sends it by hand ("Send from my phone" in the not-sent dialog).
  - Shared receiveText() for gateway webhook + phone (dedupe on ext_id, STOP/START, job_events).
  - Settings › Integrations "Text messages" row shows the chosen method.
- **Web** (public/ops2.js smsSettings, CSS at end of ops.css): Settings › Texting card, owner only: "How to send texts" radio (This phone [only when window.RRAndroid exists] / SMS Gateway app / Open my messaging app), permission rows, Allow texting, Open app settings, restricted-setting steps, Use this phone / Stop using this phone, background toggle + battery tip, queue count + last check-in, seconds between texts, Send test text with live status (polls every 3 s for 3 min). In a browser while method=device it shows which phone sends. Messages banner + composer adapt (Send → phone queue, "Messaging app" button). ops.js stage-change toast knows phone_queue. Status labels: phone_queue "Waiting for your phone", phone_sending "Sending from your phone".
- **Tests**: test/api_device.py (BASE OWNER EMP JOB) 44 checks; test/pw_texting.py (BASE OWNER EMP [shotdir]) 58 checks with a mock RRAndroid at 390×844, 844×390, 1440×900. Both passed locally and on live (temp ZZ-TXT job/customer + sessions deleted, sms_test restored). pw_msgs.py still passes on live.
- Prod `sms_pace` was 1 second when this was built (not changed); the UI default/recommendation is 20.
