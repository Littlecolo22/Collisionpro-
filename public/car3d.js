/* CollisionPro 3D vehicle picker: smooth studio-style procedural bodies per style, one mesh per part,
   exterior / interior / drill-down views, tap to pick, marks for repair vs replace,
   optional exact glTF model loaded by year/make/model. */
import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/addons/controls/OrbitControls.js';
import { GLTFLoader } from './vendor/addons/loaders/GLTFLoader.js';
import { buildExterior, mats, roundBox, contactShadowTex, honeycombTex, clamp } from './carbody.js';
import { buildExploded, buildStructure, detailPart, ghostify } from './carparts.js';
import { lookFor, applyLook } from './carlooks.js';
import { studioEnvironment, studioLights, createFloor, backdropTex, wheelShadows, qualityGovernor, DETAIL_LAYER } from './carstudio.js';

export const MARK_COLORS = { replace: 0xe5484d, repair: 0xf5a524, refinish: 0x3b82f6, blend: 0x60a5fa, 'r&i': 0x9aa0a6, other: 0xa855f7 };
const PAINTS = { white: 0xeef0f2, black: 0x1d1f22, silver: 0xb9bec4, gray: 0x6f757c, grey: 0x6f757c, red: 0xa3201e, blue: 0x1f4f9a, green: 0x2f6b3a, brown: 0x5b3a25, beige: 0xc9b48f, tan: 0xc9b48f, gold: 0xb8953d, orange: 0xd9621e, yellow: 0xe0b51c, purple: 0x5a2d82, maroon: 0x5c1520, burgundy: 0x5c1520, champagne: 0xd6c6a0, bronze: 0x7d5a35, pearl: 0xf3f1ea, charcoal: 0x3b3f44 };
export function paintHex(color) {
  const c = String(color || '').toLowerCase().trim();
  if (/^#?[0-9a-f]{6}$/.test(c)) return parseInt(c.replace('#', ''), 16);
  for (const k of Object.keys(PAINTS)) if (c.includes(k)) return PAINTS[k];
  return 0x8fa3b8;
}

// ---------- Body style dimensions (meters; d = distance from front bumper) ----------
const BASE = {
  sedan: { L: 4.85, W: 1.85, gc: 0.14, wr: 0.33, fo: 0.95, wb: 2.83, belt: 0.98, roof: 1.44, hoodF: 0.78, cowl: 1.6, roofF: 2.25, roofR: 3.3, rear: 'sedan', deckF: 3.85, deckY: 1.0, doors: [[1.65, 2.75], [2.75, 3.62]] },
  coupe: { L: 4.7, W: 1.87, gc: 0.13, wr: 0.34, fo: 0.95, wb: 2.75, belt: 0.93, roof: 1.32, hoodF: 0.72, cowl: 1.65, roofF: 2.35, roofR: 3.15, rear: 'sedan', deckF: 3.85, deckY: 0.97, doors: [[1.68, 2.95]] },
  hatchback: { L: 4.35, W: 1.8, gc: 0.14, wr: 0.32, fo: 0.9, wb: 2.65, belt: 0.97, roof: 1.46, hoodF: 0.78, cowl: 1.35, roofF: 1.95, roofR: 3.85, rear: 'hatch', base: 4.12, doors: [[1.4, 2.45], [2.45, 3.35]] },
  wagon: { L: 4.9, W: 1.84, gc: 0.15, wr: 0.33, fo: 0.95, wb: 2.83, belt: 0.99, roof: 1.48, hoodF: 0.78, cowl: 1.6, roofF: 2.2, roofR: 4.5, rear: 'hatch', base: 4.68, doors: [[1.65, 2.75], [2.75, 3.65]] },
  crossover: { L: 4.65, W: 1.88, gc: 0.2, wr: 0.36, fo: 0.95, wb: 2.7, belt: 1.05, roof: 1.68, hoodF: 0.9, cowl: 1.4, roofF: 2.0, roofR: 4.15, rear: 'hatch', base: 4.42, doors: [[1.45, 2.55], [2.55, 3.5]] },
  suv: { L: 5.15, W: 2.0, gc: 0.24, wr: 0.4, fo: 0.95, wb: 2.95, belt: 1.18, roof: 1.92, hoodF: 1.08, cowl: 1.55, roofF: 2.05, roofR: 4.92, rear: 'hatch', base: 5.02, doors: [[1.6, 2.75], [2.75, 3.75]] },
  minivan: { L: 5.15, W: 1.99, gc: 0.16, wr: 0.35, fo: 0.95, wb: 3.03, belt: 1.05, roof: 1.77, hoodF: 0.88, cowl: 1.15, roofF: 1.75, roofR: 4.82, rear: 'hatch', base: 4.98, doors: [[1.2, 2.3], [2.35, 3.45]], sliding: true },
  van: { L: 5.95, W: 2.03, gc: 0.2, wr: 0.37, fo: 0.9, wb: 3.66, belt: 1.15, roof: 2.45, hoodF: 0.95, cowl: 1.0, roofF: 1.55, roofR: 5.85, rear: 'van', base: 5.92, doors: [[1.05, 2.0], [2.1, 3.25]], sliding: true, cargo: true },
  pickup: { W: 2.03, gc: 0.27, wr: 0.41, fo: 0.95, belt: 1.22, roof: 1.95, hoodF: 1.1, cowl: 1.65, roofF: 2.15, rear: 'pickup' },
};
export const STYLE_LABEL = { sedan: 'Sedan', coupe: 'Coupe', hatchback: 'Hatchback', wagon: 'Wagon', suv: 'SUV', crossover: 'Crossover', minivan: 'Minivan', van: 'Cargo van', pickup: 'Pickup' };

export function specFor(m = {}) {
  const style = BASE[m.style] ? m.style : 'sedan';
  const s = JSON.parse(JSON.stringify(BASE[style]));
  s.style = style;
  if (style === 'pickup') {
    const cab = m.cab || 'crew', bed = m.bed || 'short';
    const cabBack = { regular: 2.95, extended: 3.55, crew: 3.95 }[cab] || 3.95;
    const bedLen = m.bed_length_in ? Math.min(2.7, Math.max(1.5, m.bed_length_in * 0.0254)) : bed === 'long' ? 2.45 : 1.75;
    s.cab = cab; s.bedLen = bedLen; s.cabBack = cabBack; s.roofR = cabBack - 0.06;
    s.bedStart = cabBack + 0.08; s.L = s.bedStart + bedLen + 0.22;
    s.wb = s.bedStart + bedLen * 0.42 - s.fo;
    s.doors = cab === 'regular' ? [[1.7, 2.9]] : cab === 'extended' ? [[1.7, 2.85], [2.85, 3.48]] : [[1.7, 2.85], [2.85, 3.88]];
  } else if (m.doors && m.doors <= 2 && s.doors.length > 1) {
    s.doors = [[s.doors[0][0], s.doors[0][0] + 1.25]];
  }
  // Stretch to the decoded wheelbase (not for pickups, whose cab + bed already set it)
  if (m.wheelbase_in && style !== 'pickup') {
    const wbD = m.wheelbase_in * 0.0254;
    if (wbD > 2.2 && wbD < 4.5 && Math.abs(wbD - s.wb) > 0.02) {
      const f = wbD / s.wb, fo = s.fo, wb0 = s.wb, delta = wbD - wb0;
      const map = (d) => (d <= fo ? d : d <= fo + wb0 ? fo + (d - fo) * f : d + delta);
      for (const k of ['cowl', 'roofF', 'roofR', 'deckF', 'base']) if (s[k] !== undefined) s[k] = map(s[k]);
      s.doors = s.doors.map(([a, b]) => [map(a), map(b)]);
      s.L += delta; s.wb = wbD;
    }
  }
  // Real proportions for known models: overall length (rear overhang), height and width
  if (m.length_in && style !== 'pickup') {
    const Lt = m.length_in * 0.0254, ra = s.fo + s.wb, d = Lt - s.L;
    if (Math.abs(d) > 0.02 && Math.abs(d) < 0.6 && s.L - ra > 0.4) {
      const k = (s.L - ra + d) / (s.L - ra), map = (x) => (x <= ra ? x : ra + (x - ra) * k);
      for (const key of ['roofR', 'deckF', 'base']) if (s[key] !== undefined && s[key] > ra) s[key] = map(s[key]);
      s.doors = s.doors.map(([a, b]) => [a, b > ra ? map(b) : b]);
      s.L = Lt;
    }
  }
  if (m.height_in) {
    const f = Math.min(1.15, Math.max(0.87, (m.height_in * 0.0254) / s.roof));
    s.roof = Math.max(s.belt + 0.32, s.roof * f);
  }
  if (m.width_in) s.W = Math.min(2.1, Math.max(1.65, m.width_in * 0.0254));
  // Per make/model look (our own reference notes -> proportions, glass angles, lamps, grille)
  const look = lookFor(m);
  if (look) applyLook(s, look);
  s.look = look || {};
  s.doorCount = s.doors.length * 2;
  return s;
}

// ---------- geometry helpers ----------
function prism(pts, z0, z1) {
  const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false, curveSegments: 2 });
  g.translate(0, 0, z0);
  g.computeVertexNormals();
  return g;
}
function slab(p0, p1, t) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * t / 2, ny = (dx / l) * t / 2;
  return [[p0[0] + nx, p0[1] + ny], [p1[0] + nx, p1[1] + ny], [p1[0] - nx, p1[1] - ny], [p0[0] - nx, p0[1] - ny]];
}
function boxAt(x0, x1, y0, y1, z0, z1) {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}
function labelSprite(text, scale = 1) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const x = c.getContext('2d');
  x.font = '600 40px system-ui, sans-serif';
  const w = Math.min(500, x.measureText(text).width + 36);
  x.fillStyle = 'rgba(15,23,32,0.82)'; x.beginPath(); x.roundRect((512 - w) / 2, 14, w, 64, 14); x.fill();
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 47);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(0.62 * scale, 0.116 * scale, 1); s.renderOrder = 10;
  return s;
}

// ---------- materials ----------

function buildInterior(s, M) {
  const g = new THREE.Group(); g.name = 'interior';
  const X = (d) => s.L / 2 - d; const W2 = s.W / 2;
  const add = (name, geo, mat, part = true) => { const m = new THREE.Mesh(geo, mat); m.name = name; if (part) m.userData.part = name; g.add(m); return m; };
  const grp = (name, parts) => { const o = new THREE.Group(); o.name = name; o.userData.part = name; parts.forEach((p) => o.add(p)); g.add(o); return o; };
  const floorY = s.gc + 0.22, c = s.cowl, cabEnd = s.style === 'pickup' ? s.cabBack : Math.min(s.roofR, s.doors[s.doors.length - 1][1] + 0.5);
  const dz = s.W * 0.24; // driver at -z (left)
  add('carpet', prism([[X(c - 0.05), floorY], [X(cabEnd), floorY], [X(cabEnd), floorY + 0.03], [X(c - 0.05), floorY + 0.03]], -W2 + 0.08, W2 - 0.08), M.carpet());
  add('dash_panel', boxAt(X(c - 0.05), X(c + 0.38), s.belt - 0.3, s.belt + 0.03, -W2 + 0.1, W2 - 0.1), M.trim());
  add('dash_pad', prism([[X(c - 0.02), s.belt + 0.03], [X(c + 0.45), s.belt + 0.03], [X(c + 0.45), s.belt + 0.07], [X(c + 0.1), s.belt + 0.1]], -W2 + 0.12, W2 - 0.12), M.seat());
  add('instrument_cluster', boxAt(X(c + 0.38), X(c + 0.44), s.belt - 0.02, s.belt + 0.12, -dz - 0.18, -dz + 0.18), M.lamp());
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 8, 24), M.black()); sw.rotation.y = Math.PI / 2; sw.rotation.z = 0.35;
  const swo = grp('steering_wheel', [sw]); swo.position.set(X(c + 0.62), s.belt - 0.02, -dz);
  const ab = add('airbag_driver', new THREE.CylinderGeometry(0.085, 0.085, 0.05, 16), M.airbag()); ab.rotation.z = Math.PI / 2 - 0.35; ab.position.set(X(c + 0.61), s.belt - 0.02, -dz);
  add('airbag_passenger', boxAt(X(c + 0.12), X(c + 0.36), s.belt + 0.075, s.belt + 0.11, dz - 0.18, dz + 0.18), M.airbag());
  const seat = (name, d, z, w) => {
    const cush = new THREE.Mesh(boxAt(-0.25, 0.25, 0, 0.12, -w / 2, w / 2), M.seat());
    const back = new THREE.Mesh(boxAt(-0.08, 0.08, 0, 0.62, -w / 2, w / 2), M.seat()); back.position.set(-0.3, 0.05, 0); back.rotation.z = 0.18;
    const head = new THREE.Mesh(boxAt(-0.05, 0.05, 0, 0.18, -w * 0.3, w * 0.3), M.seat()); head.position.set(-0.42, 0.72, 0);
    const o = grp(name, [cush, back, head]); o.position.set(X(d), floorY + 0.22, z); return o;
  };
  const fs = s.doors[0][0] + 0.75;
  seat('seat_lf', fs, -dz, 0.5); seat('seat_rf', fs, dz, 0.5);
  const hasRear = s.doors.length > 1;
  if (hasRear && !s.cargo) seat('seat_rear', fs + 0.9, 0, s.W - 0.3);
  add('console', boxAt(X(c + 0.35), X(fs + 0.05), floorY, floorY + 0.32, -0.12, 0.12), M.trim());
  for (const [sfx, sg] of [['lf', -1], ['rf', 1]]) {
    const z = sg * (W2 - 0.16);
    add('seatbelt_' + sfx, prism(slab([X(fs - 0.25), s.roof - 0.25], [X(fs + 0.15), floorY + 0.3], 0.05), z - 0.01, z + 0.01), M.wire());
  }
  // door trims
  const doorKeys = [['door_lf', 'door_rf'], ['door_lr', 'door_rr']];
  s.doors.forEach(([a, b], i) => { for (const sg of [-1, 1]) {
    const z = sg < 0 ? -W2 + 0.05 : W2 - 0.08;
    add(doorKeys[i][sg < 0 ? 0 : 1] + '_trim', boxAt(X(a + 0.04), X(b - 0.04), s.gc + 0.25, s.belt + 0.02, z, z + 0.03), M.trim());
  } });
  const inset = 0.12;
  add('headliner', prism(slab([X(s.roofF + 0.02), s.roof - 0.06], [X(Math.min(s.roofR, cabEnd)), s.roof - 0.06], 0.03), -W2 + inset, W2 - inset), M.soft());
  for (const [sfx, sg] of [['l', -1], ['r', 1]]) {
    const z = sg * (W2 - inset - 0.02);
    add('curtain_airbag_' + sfx, boxAt(X(s.roofF + 0.05), X(Math.min(s.roofR, cabEnd) - 0.05), s.roof - 0.16, s.roof - 0.08, z - 0.025, z + 0.025), M.airbag());
    add('pillar_trim_a_' + sfx, prism(slab([X(s.cowl + 0.05), s.belt + 0.02], [X(s.roofF), s.roof - 0.06], 0.06), z - 0.02, z + 0.02), M.soft());
    if (hasRear) add('pillar_trim_b_' + sfx, boxAt(X(s.doors[0][1] - 0.05), X(s.doors[0][1] + 0.05), s.belt - 0.1, s.roof - 0.06, z - 0.02, z + 0.02), M.soft());
    const cd = s.style === 'pickup' ? s.cabBack - 0.08 : Math.min(s.roofR, cabEnd) - 0.06;
    add('pillar_trim_c_' + sfx, boxAt(X(cd - 0.06), X(cd + 0.06), s.belt - 0.05, s.roof - 0.06, z - 0.02, z + 0.02), M.soft());
  }
  add('rearview_mirror', boxAt(X(s.roofF + 0.05), X(s.roofF + 0.09), s.roof - 0.2, s.roof - 0.12, -0.13, 0.13), M.black());
  return g;
}

// ---------- drill-down layouts ----------
const DOOR_LAYOUT = {
  skin: { geo: () => boxAt(-0.5, 0.5, -0.28, 0.28, 0, 0.02), mat: 'paint', p: [0, 0, 0.62] },
  shell: { geo: () => boxAt(-0.5, 0.5, -0.28, 0.28, -0.06, 0.06), mat: 'metal', p: [0, 0, 0.28] },
  glass: { geo: () => boxAt(-0.42, 0.42, 0, 0.36, 0, 0.012), mat: 'glass', p: [0.04, 0.33, 0.36] },
  regulator: { mat: 'metal', p: [0.05, 0.06, 0.1], group: () => { const a = new THREE.Mesh(boxAt(-0.25, 0.25, -0.012, 0.012, 0, 0.01), null); a.rotation.z = 0.6; const b = new THREE.Mesh(boxAt(-0.25, 0.25, -0.012, 0.012, 0, 0.01), null); b.rotation.z = -0.6; return [a, b]; } },
  motor: { geo: () => new THREE.CylinderGeometry(0.06, 0.06, 0.07, 14).rotateX(Math.PI / 2), mat: 'metal', p: [0.28, -0.14, 0.05] },
  lock: { geo: () => boxAt(-0.035, 0.035, -0.07, 0.07, -0.03, 0.03), mat: 'black', p: [0.47, 0.04, 0.12] },
  handle_out: { geo: () => boxAt(-0.1, 0.1, -0.02, 0.02, 0, 0.03), mat: 'chrome', p: [0.3, 0.16, 0.8] },
  handle_in: { geo: () => boxAt(-0.07, 0.07, -0.02, 0.02, -0.03, 0), mat: 'chrome', p: [0.3, 0.12, -0.5] },
  trim: { geo: () => boxAt(-0.5, 0.5, -0.27, 0.26, -0.03, 0), mat: 'trim', p: [0, 0, -0.38] },
  weatherstrip: { mat: 'black', p: [0, 0, -0.08], group: () => [boxAt(-0.52, 0.52, 0.28, 0.3, 0, 0.02), boxAt(-0.52, 0.52, -0.3, -0.28, 0, 0.02), boxAt(-0.52, -0.5, -0.3, 0.3, 0, 0.02), boxAt(0.5, 0.52, -0.3, 0.3, 0, 0.02)].map((gg) => new THREE.Mesh(gg, null)) },
  belt: { geo: () => boxAt(-0.5, 0.5, -0.012, 0.012, 0, 0.02), mat: 'chrome', p: [0, 0.3, 0.72] },
  speaker: { geo: () => new THREE.CylinderGeometry(0.08, 0.08, 0.04, 16).rotateX(Math.PI / 2), mat: 'black', p: [-0.3, -0.16, -0.18] },
  harness: { geo: () => boxAt(-0.012, 0.012, -0.22, 0.22, -0.012, 0.012), mat: 'wire', p: [-0.44, 0.02, 0.02] },
  hinges: { mat: 'metal', p: [-0.58, 0, 0.28], group: () => [boxAt(-0.04, 0.04, 0.12, 0.2, -0.03, 0.03), boxAt(-0.04, 0.04, -0.2, -0.12, -0.03, 0.03)].map((gg) => new THREE.Mesh(gg, null)) },
  check: { geo: () => boxAt(-0.07, 0.07, -0.015, 0.015, -0.015, 0.015), mat: 'metal', p: [-0.5, -0.02, 0.14] },
  mirror: { geo: () => boxAt(-0.1, 0.1, -0.07, 0.07, -0.05, 0.05), mat: 'paint', p: [-0.4, 0.42, 0.7] },
};
function doorSlot(mesh) {
  if (/^mirror_/.test(mesh)) return 'mirror';
  const m = mesh.match(/^door_[lr][fr]_(.+)$/); return m ? m[1] : null;
}

// ---------- Picker ----------
// ---------- Picker ----------
function gradientTex(top, bottom) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, top); g.addColorStop(1, bottom); x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const PART_LABEL = (id) => id.replace(/_/g, ' ');
// ---- shared 3D state: one WebGL renderer for the whole app, reused by every picker, so opening a car again never makes
// a new GPU context and the compiled shaders stay ready. Built cars are kept for the last two vehicles.
const SHARED = { renderer: null, env: null, aa: null };
const MODEL_CACHE = new Map(); // key -> { ext, int }
function disposeTree(root) { root?.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (m.map && m.map !== honeycombTex()) m.map.dispose(); m.dispose(); } } }); }
function cacheTake(k) { const v = MODEL_CACHE.get(k); if (v) MODEL_CACHE.delete(k); return v || null; }
function cachePut(k, v) { MODEL_CACHE.delete(k); MODEL_CACHE.set(k, v); while (MODEL_CACHE.size > 2) { const [k0, v0] = MODEL_CACHE.entries().next().value; MODEL_CACHE.delete(k0); disposeTree(v0.ext); disposeTree(v0.int); } }
export function isPhone() { return Math.min(screen.width || 9999, screen.height || 9999) < 820 || matchMedia('(pointer: coarse)').matches; }
// 3D quality for this device: 'auto' (lite on phones), 'full', 'lite' or '2d' (3D off). Saved per device.
export function quality3d() { const q = (() => { try { return localStorage.getItem('cp_3dq'); } catch { return null; } })(); return ['auto', 'full', 'lite', '2d'].includes(q) ? q : 'auto'; }
function profile3d() { const q = quality3d(); const lite = q === 'lite' || (q === 'auto' && isPhone()); const dpr = window.devicePixelRatio || 1;
  return { lite, q, maxPR: Math.min(dpr, lite ? 1.5 : 2), minPR: Math.min(dpr, 1), reflectStart: !lite, reflectMax: q !== 'lite' }; }
// Frees the shared renderer and every cached car (used when 3D is switched off or the GPU was lost).
export function releaseShared3d() { for (const v of MODEL_CACHE.values()) { disposeTree(v.ext); disposeTree(v.int); } MODEL_CACHE.clear();
  if (SHARED.renderer) { try { SHARED.env?.dispose(); SHARED.renderer.dispose(); SHARED.renderer.forceContextLoss(); SHARED.renderer.domElement.remove(); } catch (e) { console.warn(e); } }
  SHARED.renderer = null; SHARED.env = null; }
function sharedRenderer() {
  const r = SHARED.renderer;
  if (r && !r.getContext().isContextLost()) return r;
  if (r) releaseShared3d();
  const nr = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  nr.outputColorSpace = THREE.SRGBColorSpace; nr.toneMapping = THREE.ACESFilmicToneMapping; nr.toneMappingExposure = 1.05;
  nr.domElement.style.touchAction = 'none';
  SHARED.renderer = nr; SHARED.env = studioEnvironment(nr);
  return nr;
}
export function createPicker(container, opts = {}) {
  const phone = isPhone(); const prof = profile3d();
  const renderer = sharedRenderer();
  renderer.setPixelRatio(prof.maxPR);
  container.appendChild(renderer.domElement);
  const ac = new AbortController(); const sig = { signal: ac.signal }; // every canvas listener of this picker goes with it
  const scene = new THREE.Scene();
  let BG_CAR = backdropTex({}); const BG_ISO = gradientTex('#d9dcdf', '#9a9fa5');
  scene.background = BG_CAR;
  scene.environment = SHARED.env;
  studioLights(scene);
  const floorObj = createFloor(renderer, { scale: phone ? 0.33 : 0.5 });
  const ground = floorObj.mesh; scene.add(ground);
  if (!prof.reflectStart) { floorObj.state.level = 2; floorObj.setReflect(false); }
  const gov = qualityGovernor(renderer, floorObj, { ...prof, onSlow: () => { if (!destroyed && opts.onSlow) opts.onSlow(); } });
  let wshadow = null;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: contactShadowTex(), transparent: true, depthWrite: false, opacity: 0.9 })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.001; scene.add(shadow); floorObj.state.hide.push(shadow);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.03, 100);
  camera.layers.enable(DETAIL_LAYER); // small detail is drawn by the main camera but skipped by the blurred floor reflection
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = true; controls.screenSpacePanning = true; controls.minDistance = 0.6; controls.maxDistance = 14; controls.maxPolarAngle = Math.PI * 0.495;
  controls.enableDamping = false;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  let modelKey = null, spec = null, M = null, ext = null, int = null, drill = null, struct = null, exg = null, iso = null, mode = 'exterior', selected = null, marks = {}, paint = 0x8fa3b8, exact = false, xray = false;
  let kind = 'car'; // car | drill | exploded | isolate
  let cur = { kind: 'car', label: 'Car' };
  const stack = [];
  const cache = {}; // lazily built exploded assemblies / structure for lookups
  const views = {};
  let needs = true, anim = null, camGoal = null, inset = 0, insetX = 0;
  function applyInset() { const w = container.clientWidth || 300, h = container.clientHeight || 300; const iy = inset < h * 0.85 ? inset : 0, ix = insetX < w * 0.7 ? insetX : 0; const bar = container.querySelector(':scope > .bar'); const it = bar && bar.offsetHeight && !iy ? Math.min(bar.offsetTop + bar.offsetHeight, h * 0.22) : 0; if (iy || ix || it) camera.setViewOffset(w, h, ix / 2, (iy - it) / 2, w, h); else camera.clearViewOffset(); camera.updateProjectionMatrix(); }
  const render = () => { needs = true; kick(); };
  controls.addEventListener('change', render);
  let userMoved = false; controls.addEventListener('start', () => { userMoved = true; });
  let raf = 0, alive = true;
  // Draws only when something changed or moves: idle costs nothing, and animations use real frame times, so they run
  // at the screen's own rate (60, 90 or 120 Hz). Nothing is drawn while the app is in the background.
  let dragging = false;
  function kick() { if (alive && !raf && !document.hidden) raf = requestAnimationFrame(loop); }
  const loop = (t) => {
    raf = 0; if (!alive) return;
    let moving = dragging;
    if (anim) { if (anim(t) === false) anim = null; else moving = true; needs = true; }
    if (needs) { needs = false; renderer.render(scene, camera); gov.frame(t, moving); } else gov.frame(t, false);
    if (moving || anim || needs) kick();
  };
  controls.addEventListener('start', () => { dragging = true; kick(); });
  controls.addEventListener('end', () => { dragging = false; });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { needs = true; kick(); } }, sig);
  kick();
  // If the phone takes the GPU back (low memory, app in background), stop drawing instead of hanging, and offer a reload.
  let destroyed = false, lostBox = null;
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); if (destroyed) return;
    alive = false; cancelAnimationFrame(raf); raf = 0;
    if (opts.onLost) { opts.onLost('lost'); return; } // the page decides (the parts tab falls back to the 2D diagram)
    if (!lostBox) {
      lostBox = document.createElement('div'); lostBox.className = 'v3lost';
      lostBox.innerHTML = '<div><b>3D view paused</b><p>The phone needed the graphics memory back.</p><button class="pri" type="button">Reload 3D</button></div>';
      lostBox.querySelector('button').onclick = () => { releaseShared3d(); window.dispatchEvent(new HashChangeEvent('hashchange')); };
      container.appendChild(lostBox);
    }
  }, sig);
  renderer.domElement.addEventListener('webglcontextrestored', () => { if (destroyed) return; lostBox?.remove(); lostBox = null; alive = true; needs = true; kick(); }, sig);
  const resize = () => { const w = container.clientWidth || 300, h = container.clientHeight || 300; if (!container.clientWidth || !container.clientHeight) return; const a0 = camera.aspect; renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px'; camera.aspect = w / h; applyInset(); render();  try { if (Math.abs(Math.log((w / h) / a0)) > 0.15 && spec && kind === 'car' && !userMoved) frame(mode, false); } catch { /* not built yet */ } };
  const ro = new ResizeObserver(resize); ro.observe(container);

  function eachPart(root, fn) { root?.traverse((o) => { if (o.userData.part && o !== root) fn(o); }); }
  function meshesOf(o) { const out = []; o.traverse((c) => { if (c.isMesh) out.push(c); }); return out; }
  function paintState(o) {
    const name = o.userData.part; const op = marks[name];
    for (const m of meshesOf(o)) {
      if (!m.material || m.userData.base === undefined) continue;
      m.material.color.setHex(op ? (MARK_COLORS[op] || MARK_COLORS.other) : m.userData.base);
      const sel = name === selected && kind !== 'isolate';
      if (m.material.emissive) m.material.emissive.setHex(sel ? 0x2bd47a : op ? (MARK_COLORS[op] || MARK_COLORS.other) : (m.userData.baseEm ?? 0));
      if (m.material.emissiveIntensity !== undefined) m.material.emissiveIntensity = sel ? 0.55 : op ? 0.3 : (m.userData.baseEmI ?? m.material.emissiveIntensity);
    }
  }
  function prep(root) {
    root.traverse((m) => { if (m.isMesh && m.material) { if (!m.material.color) return; m.userData.base = m.material.color.getHex(); m.userData.baseEm = m.material.emissive ? m.material.emissive.getHex() : 0; m.userData.baseEmI = m.material.emissiveIntensity; } });
  }
  function refreshAll() { for (const r of [ext, int, drill, struct, exg, iso]) eachPart(r, paintState); render(); }
  function camState() { return { pos: camera.position.clone(), target: controls.target.clone(), min: controls.minDistance, max: controls.maxDistance, polar: controls.maxPolarAngle }; }
  function applyCam(c, animate = true) {
    controls.minDistance = Math.min(c.min || 0.3, camera.position.distanceTo(controls.target)); controls.maxDistance = Math.max(c.max || 14, camera.position.distanceTo(controls.target)); controls.maxPolarAngle = c.polar ?? Math.PI * 0.495;
    if (!animate) { anim = null; camGoal = null; camera.position.copy(c.pos); controls.target.copy(c.target); controls.minDistance = c.min || 0.6; controls.maxDistance = c.max || 14; controls.update(); render(); return; }
    const p0 = camera.position.clone(), t0 = controls.target.clone(); let start = null;
    camGoal = { pos: c.pos.clone(), target: c.target.clone(), min: c.min, max: c.max, polar: c.polar };
    anim = (t) => { if (start === null) start = t; const k = Math.min(1, (t - start) / 450); const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; camera.position.lerpVectors(p0, c.pos, e); controls.target.lerpVectors(t0, c.target, e); controls.update(); if (k >= 1) { controls.minDistance = c.min || 0.6; controls.maxDistance = c.max || 14; camGoal = null; return false; } }; kick();
  }
  function fitAspect(v) { const k = clamp(1.3 / camera.aspect, 1, 2.4); if (k === 1) return v; return { ...v, pos: v.target.clone().add(v.pos.clone().sub(v.target).multiplyScalar(k)), max: Math.max(v.max || 14, 14 * k), min: (v.min || 0.6) }; }
  // Move the camera along its view line until the box fills about mx x my of the canvas (any aspect, phone portrait too).
  function fitView(v, box, mx = 0.9, my = 0.78) {
    if (!box || box.isEmpty()) return fitAspect(v);
    const dir = v.pos.clone().sub(v.target); let D = dir.length(); dir.normalize();
    const cam = camera.clone(); const pts = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, y, z));
    for (let i = 0; i < 6; i++) {
      cam.position.copy(v.target).addScaledVector(dir, D); cam.lookAt(v.target); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      let ex = 0, ey = 0, behind = false;
      for (const p of pts) { const q = p.clone().project(cam); if (q.z > 1 || q.z < -1) behind = true; ex = Math.max(ex, Math.abs(q.x)); ey = Math.max(ey, Math.abs(q.y)); }
      const k = behind ? 1.5 : Math.max(ex / mx, ey / my);
      if (Math.abs(k - 1) < 0.02) break;
      D *= behind ? k : 1 + (k - 1) * 0.9;
    }
    return { ...v, pos: v.target.clone().addScaledVector(dir, D), max: Math.max(v.max || 14, D * 1.8), min: Math.min(v.min || 0.6, D * 0.5) };
  }
  function frame(view, animate) {
    let v = views[view]; if (!v) return; userMoved = false;
    if (view === 'exterior' && ext) {
      if (camera.aspect < 0.85 && v.portrait) v = { ...v, pos: v.portrait };
      const box = new THREE.Box3(); ext.traverse((o) => { if (o.isMesh && o.visible && !o.userData.label) box.expandByObject(o); });
      v = fitView(v, box, 0.92, 0.7);
    } else v = fitAspect(v);
    applyCam({ ...v, polar: v.polar ?? Math.PI * 0.495 }, animate);
  }
  function clearTemp() {
    for (const k of ['drill', 'exg', 'iso']) { const r = k === 'drill' ? drill : k === 'exg' ? exg : iso; if (r) { scene.remove(r); dispose(r); } }
    drill = exg = iso = null;
  }
  function build(m3d, info = {}) {
    clearTemp(); stack.length = 0; kind = 'car'; cur = { kind: 'car', label: 'Car' };
    stash(); if (struct) { scene.remove(struct); dispose(struct); }
    struct = null; for (const k in cache) delete cache[k];
    exact = false; xray = false;
    spec = specFor({ ...(m3d || {}), make: (m3d && m3d.make) || info.make, model: (m3d && m3d.model) || info.model, year: (m3d && m3d.year) || info.year }); paint = paintHex(info.color);
    modelKey = JSON.stringify([m3d || {}, info.make, info.model, info.year, paint]);
    const hit = cacheTake(modelKey); // the same car opened again: reuse its built parts (already on the GPU)
    if (hit) { ext = hit.ext; int = hit.int; M = hit.M; }
    else { M = mats(paint, spec.look); ext = buildExterior(spec, M); int = buildInterior(spec, M); prep(ext); prep(int); }
    scene.add(ext); scene.add(int);
    const L = spec.L;
    // Default angle: front 3/4 from the side and height the vehicle's look asks for (front is +x, the right side is +z).
    const vc = (spec.look && spec.look.cam) || null;
    if (vc) {
      const az = vc.az * Math.PI / 180, el = vc.el * Math.PI / 180, tgt = new THREE.Vector3(0, spec.belt * 0.55, 0);
      const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), (vc.side || 1) * Math.cos(el) * Math.sin(az));
      views.exterior = { pos: tgt.clone().addScaledVector(dir, L * 1.3), target: tgt, min: 1.5, max: 14 };
    } else views.exterior = { pos: new THREE.Vector3(L * 0.78, 1.75, L * 0.88), portrait: new THREE.Vector3(L * 0.95, spec.roof + 1.55, L * 0.62), target: new THREE.Vector3(0, spec.belt * 0.55, 0), min: 1.5, max: 14 };
    const stl = (spec.look && spec.look.studio) || {};
    BG_CAR.dispose(); BG_CAR = backdropTex(stl); floorObj.setLook(stl);
    const cabX = spec.L / 2 - (spec.cowl + 0.8);
    views.interior = { pos: new THREE.Vector3(cabX - 2.0, spec.roof + 1.6, 1.4), target: new THREE.Vector3(cabX, spec.belt - 0.15, 0), min: 0.6, max: 6 };
    floorObj.setFade(L * 0.5, L * 1.9); if (wshadow) { scene.remove(wshadow); floorObj.state.hide.splice(floorObj.state.hide.indexOf(wshadow), 1); } wshadow = wheelShadows(spec); scene.add(wshadow); floorObj.state.hide.push(wshadow);
    shadow.scale.set(L * 1.25, spec.W * 1.6, 1);
    setMode('exterior', true);
    opts.onBuilt && opts.onBuilt({ spec, exact });
  }
  // Puts the current car back in the cache (clean: no marks, no selection, no ghosting) instead of throwing it away.
  function stash() {
    if (!ext) return;
    scene.remove(ext); if (int) scene.remove(int);
    if (exact || !modelKey) { dispose(ext); if (int) dispose(int); }
    else { const keepM = marks, keepS = selected; marks = {}; selected = null; try { ghostify(ext, false); eachPart(ext, paintState); eachPart(int, paintState); } catch (e) { console.warn(e); } marks = keepM; selected = keepS; ext.visible = true; if (int) int.visible = true; cachePut(modelKey, { ext, int, M }); }
    ext = int = null;
  }
  function dispose(root) { root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (m.map && m.map !== honeycombTex()) m.map.dispose(); m.dispose(); } } }); }
  function ghostExt(on) { if (ext && !exact) ghostify(ext, on); }
  function ensureStruct() {
    if (!struct && spec && !exact) { struct = buildStructure(spec, opts.hasPart || null); prep(struct); struct.visible = false; scene.add(struct); }
    return struct;
  }
  // show the scene for the current level
  function show() {
    const car = kind === 'car';
    if (ext) ext.visible = (car && mode === 'exterior') || kind === 'exploded';
    if (int) int.visible = car && mode === 'interior';
    if (struct) struct.visible = car && mode === 'exterior' && xray;
    ghostExt((car && mode === 'exterior' && xray) || kind === 'exploded');
    if (drill) drill.visible = kind === 'drill';
    if (exg) exg.visible = kind === 'exploded';
    if (iso) iso.visible = kind === 'isolate';
    ground.visible = shadow.visible = car || kind === 'exploded'; if (wshadow) wshadow.visible = car;
    scene.background = kind === 'isolate' ? BG_ISO : BG_CAR;
    refreshAll();
  }
  function nav() { opts.onNav && opts.onNav({ depth: stack.length, crumbs: [...stack.map((s) => s.cur.label), cur.label], kind, cur }); }
  function push(next) { stack.push({ cur, kind, cam: camGoal || camState(), selected }); cur = next; kind = next.kind; }
  function setMode(m, force) {
    const had = stack.length > 0 || kind !== 'car';
    if (m === mode && !force && !had) return;
    clearTemp(); stack.length = 0; kind = 'car'; cur = { kind: 'car', label: m === 'interior' ? 'Interior' : 'Car' };
    mode = m;
    show();
    frame(m, !force);
    opts.onMode && opts.onMode(m === 'drill' ? 'exterior' : m);
    nav();
  }
  function setXray(on) {
    xray = !!on; if (xray) ensureStruct();
    if (kind !== 'car' || mode !== 'exterior') { setMode('exterior'); }
    show(); nav(); return xray;
  }
  function back(instant) {
    if (!stack.length) return 0;
    const prev = stack.pop();
    if (kind === 'isolate' && iso) { scene.remove(iso); dispose(iso); iso = null; }
    if (kind === 'exploded' && exg && prev.kind !== 'exploded') { scene.remove(exg); dispose(exg); exg = null; }
    if (kind === 'drill' && drill && prev.kind !== 'drill') { scene.remove(drill); dispose(drill); drill = null; }
    cur = prev.cur; kind = prev.kind; selected = prev.selected ?? null;
    show(); applyCam(prev.cam, !instant);
    opts.onMode && opts.onMode(kind === 'drill' ? 'drill' : mode, { title: cur.label });
    nav(); return stack.length;
  }
  function home() { if (stack.length) { while (stack.length) back(); } }
  // rows: [{key,name,mesh}] for one assembly (old door / hood / decklid layouts)
  function drillInto(assembly, rows, title) {
    if (assembly === 'front_bumper' || assembly === 'rear_bumper') { if (!exact) return explode(assembly, title); }
    if (drill) { scene.remove(drill); dispose(drill); }
    if (kind === 'isolate') back();
    push({ kind: 'drill', label: title || assembly, assembly });
    drill = new THREE.Group(); drill.name = 'drill';
    const isDoor = /^door_[lr][fr]$/.test(assembly);
    const right = /_r[fr]$/.test(assembly) || assembly === 'door_rf' || assembly === 'door_rr';
    const seen = new Set(); const items = [];
    for (const r of rows) { if (!r.mesh || seen.has(r.mesh)) continue; seen.add(r.mesh); items.push(r); }
    const mkMat = (k) => (M[k] || M.metal)();
    let gi = 0; const cols = Math.ceil(Math.sqrt(items.length || 1));
    for (const r of items) {
      const slot = isDoor ? doorSlot(r.mesh) : null;
      const lay = slot && DOOR_LAYOUT[slot];
      let obj;
      if (lay) {
        if (lay.group) { obj = new THREE.Group(); for (const c of lay.group()) { c.material = mkMat(lay.mat); obj.add(c); } }
        else obj = new THREE.Mesh(lay.geo(), mkMat(lay.mat));
        obj.position.set(right ? -lay.p[0] : lay.p[0], lay.p[1], lay.p[2]);
      } else {
        const big = /cover|skin|hood$|decklid$|liftgate|tailgate|panel/.test(r.mesh + ' ' + r.key);
        obj = new THREE.Mesh(big ? roundBox(0.52, 0.2, 0.06, 0.02) : roundBox(0.22, 0.16, 0.1, 0.02), mkMat(/radar|sensor|camera|bracket|reinf|absorber|latch|hinge|strut/.test(r.mesh) ? 'metal' : /lamp/.test(r.mesh) ? 'lamp' : 'paint'));
        const col = gi % cols, row = Math.floor(gi / cols); gi++;
        obj.position.set((col - (cols - 1) / 2) * 0.62, 0.35 - row * 0.42, 0);
      }
      obj.name = r.mesh; obj.userData.part = r.mesh;
      const short = String(r.short || r.name).slice(0, 26);
      const lbl = labelSprite(short, 0.7); lbl.position.set(0, lay ? 0.0 : 0.15, 0.09); lbl.userData.label = true;
      if (lay) { const box = new THREE.Box3().setFromObject(obj); lbl.position.set(0, (box.max.y - obj.position.y) + 0.06, 0.02); }
      obj.add(lbl);
      drill.add(obj);
    }
    prep(drill);
    scene.add(drill);
    views.drill = isDoor ? { pos: new THREE.Vector3(right ? -0.9 : 0.9, 0.55, right ? -2.3 : 2.3), target: new THREE.Vector3(0, 0.05, 0.15 * (right ? -1 : 1)), min: 0.6, max: 5 } : { pos: new THREE.Vector3(0.5, 0.4, 2.2 + cols * 0.25), target: new THREE.Vector3(0, 0, 0), min: 0.6, max: 6 };
    show(); frame('drill');
    opts.onMode && opts.onMode('drill', { assembly, title });
    nav();
  }
  // exploded front / rear bumper
  function explode(assembly, title) {
    if (kind === 'isolate') back(true);
    if (kind === 'exploded') back(true);
    const g = buildExploded(assembly, spec, opts.hasPart || null);
    prep(g);
    push({ kind: 'exploded', label: title || (assembly === 'front_bumper' ? 'Front bumper' : 'Rear bumper'), assembly });
    exg = g; scene.add(g);
    // animate apart
    const kids = g.children.slice(); kids.forEach((c) => c.position.set(0, 0, 0));
    let start = null;
    const tween = (t) => { if (start === null) start = t; const k = Math.min(1, (t - start) / 700); const e = 1 - (1 - k) ** 3; for (const c of kids) c.position.copy(c.userData.offset).multiplyScalar(e); return k < 1; };
    show();
    const front = assembly === 'front_bumper', L = spec.L, sx = front ? 1 : -1;
    const tgt = new THREE.Vector3(sx * (L / 2 + 0.25), spec.gc + 0.45, 0);
    const eb = new THREE.Box3(); kids.forEach((c) => c.position.copy(c.userData.offset)); g.updateMatrixWorld(true); eb.setFromObject(g); kids.forEach((c) => c.position.set(0, 0, 0)); g.updateMatrixWorld(true);
    if (!eb.isEmpty()) eb.getCenter(tgt);
    applyCam(fitView({ pos: tgt.clone().add(new THREE.Vector3(sx * 3.4, 1.5 - tgt.y, 2.6)), target: tgt, min: 0.8, max: 9 }, eb, 0.9, 0.72));
    const camAnim = anim; anim = (t) => { const a = camAnim ? camAnim(t) : false; const b = tween(t); return a !== false || b; }; kick();
    opts.onMode && opts.onMode('exploded', { assembly, title: cur.label });
    nav();
  }
  // find a part object anywhere (car, structure, exploded sets)
  function findPart(name) {
    let f = null;
    const look = (r) => { if (!f) eachPart(r, (o) => { if (!f && o.userData.part === name) f = o; }); };
    if (kind === 'exploded') look(exg);
    look(ext); look(struct); look(exg); look(drill);
    if (!f && !exact && spec) {
      ensureStruct(); look(struct);
      for (const a of ['front_bumper', 'rear_bumper']) { if (f) break; if (!cache[a]) cache[a] = buildExploded(a, spec, null); look(cache[a]); }
    }
    return f;
  }
  function canIsolate(name) { return !!findPart(name); }
  function isolate(name, label) {
    const src = findPart(name); if (!src) return false;
    if (kind === 'isolate') { if (iso) { scene.remove(iso); dispose(iso); iso = null; } stack.length && (() => { const p = stack.pop(); cur = p.cur; kind = p.kind; applyCam(p.cam, false); })(); }
    const fromExt = ext && isChild(src, ext);
    const d = fromExt && !exact ? detailPart(src, spec) : cloneDeep(src);
    const wrap = new THREE.Group(); wrap.name = 'iso'; wrap.userData.part = name; wrap.add(d);
    if (!fromExt) d.traverse((c) => { if (c.isMesh) c.material = c.material.clone(); });
    d.traverse((c) => { if (c.isMesh && c.material) { c.material.transparent = c.material.opacity < 1; c.material.depthWrite = true; if (c.material.opacity < 0.3) c.material.opacity = 1, c.material.transparent = false; } });
    const box = new THREE.Box3().setFromObject(d); const ctr = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3());
    d.position.sub(ctr);
    prep(wrap);
    push({ kind: 'isolate', label: label || PART_LABEL(name), part: name });
    selected = name;
    iso = wrap; scene.add(iso);
    show();
    const r = Math.max(size.x, size.y, size.z, 0.08);
    // look at the part from the side the car's outside faces
    const out = ctr.clone(); out.y = 0; if (out.lengthSq() < 0.01) out.set(1, 0, 0); out.normalize();
    const dir = new THREE.Vector3(out.x * 0.9 + 0.35, 0.55, out.z * 0.9 + 0.5).normalize();
    const dist = r * 1.9 / Math.tan((camera.fov * Math.PI) / 360) * 0.62 * Math.max(1, 1 / Math.max(0.5, camera.aspect));
    const ib = new THREE.Box3().setFromObject(iso);
    const fv = fitView({ pos: dir.multiplyScalar(dist), target: new THREE.Vector3(0, 0, 0), min: r * 0.4, max: r * 8 }, ib, 0.8, 0.62);
    applyCam({ ...fv, min: Math.min(r * 0.4, fv.min), polar: Math.PI });
    nav();
    return true;
  }
  function isChild(o, root) { while (o) { if (o === root) return true; o = o.parent; } return false; }
  function cloneDeep(src) {
    src.updateWorldMatrix(true, true);
    const g = new THREE.Group();
    src.traverse((c) => { if (c.isMesh && !c.userData.label) { const m = new THREE.Mesh(c.geometry.clone(), c.material.clone()); m.applyMatrix4(c.matrixWorld); g.add(m); } });
    return g;
  }
  // tap picking
  const ray = new THREE.Raycaster(); ray.layers.enableAll(); const ndc = new THREE.Vector2();
  let down = null;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: Date.now(), n: e.isPrimary ? 1 : 2 }; }, sig);
  el.addEventListener('pointerup', (e) => {
    if (!down || !e.isPrimary) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); const dt = Date.now() - down.t; down = null;
    if (moved > 9 || dt > 600) return;
    if (kind === 'isolate') return;
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const roots = kind === 'drill' ? [drill] : kind === 'exploded' ? [exg] : mode === 'interior' ? [int] : xray ? [struct] : [ext];
    let part = null, root = null;
    for (const rt of roots) {
      if (!rt) continue;
      const hits = ray.intersectObject(rt, true).filter((h) => !h.object.userData.label && !h.object.isSprite && h.object.visible);
      for (const h of hits) { let o = h.object; while (o && !o.userData.part && o !== rt) o = o.parent; if (o && o.userData.part) { part = o; root = rt; break; } }
      if (part) break;
    }
    if (part) {
      const where = kind === 'exploded' ? 'exploded' : root === struct ? 'xray' : kind === 'drill' ? 'drill' : mode;
      select(part.userData.part);
      opts.onPick && opts.onPick({ mesh: part.userData.part, assembly: part.userData.assembly || (kind === 'exploded' || kind === 'drill' ? cur.assembly : null), mode: where });
    } else { select(null); opts.onPick && opts.onPick(null); }
  }, sig);
  function select(name) { selected = name; refreshAll(); }
  function has(name) { let f = false; for (const r of [ext, int, drill, struct, exg]) eachPart(r, (o) => { if (o.userData.part === name) f = true; }); return f; }
  function where(name) { for (const [k, r] of [['exterior', ext], ['interior', int], ['drill', drill], ['xray', struct], ['exploded', exg]]) { let f = false; eachPart(r, (o) => { if (o.userData.part === name) f = true; }); if (f) return k; } return null; }
  async function loadExact(url, info = {}) {
    try {
      const gltf = await new GLTFLoader().loadAsync(url);
      const root = gltf.scene; root.name = 'exterior';
      const box = new THREE.Box3().setFromObject(root); const size = box.getSize(new THREE.Vector3());
      const long = Math.max(size.x, size.z); const k = (spec?.L || 4.8) / long; root.scale.setScalar(k);
      if (size.z > size.x) root.rotation.y = Math.PI / 2;
      const b2 = new THREE.Box3().setFromObject(root); const ctr = b2.getCenter(new THREE.Vector3());
      root.position.x -= ctr.x; root.position.z -= ctr.z; root.position.y -= b2.min.y;
      root.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); if (o.name && /^[a-z0-9_]+$/.test(o.name)) o.userData.part = o.name; } });
      if (ext) { scene.remove(ext); dispose(ext); }
      ext = root; prep(ext); scene.add(ext); exact = true; setMode('exterior', true);
      opts.onBuilt && opts.onBuilt({ spec, exact: true });
      return true;
    } catch (e) { console.warn('exact model not loaded', e?.message || e); return false; }
  }
  return {
    build, setMode, drillInto, explode, isolate, canIsolate, back, home, setXray, select, has, where, loadExact,
    setMarks(m) { marks = m || {}; refreshAll(); },
    get mode() { return kind === 'drill' ? 'drill' : mode; }, get kind() { return kind; }, get depth() { return stack.length; }, get xray() { return xray; }, get spec() { return spec; },
    get crumbs() { return [...stack.map((s) => s.cur.label), cur.label]; },
    resetView() { if (kind === 'car') frame(mode); else if (kind === 'drill') frame('drill'); else if (stack.length) { const top = cur; back(); top.kind === 'isolate' ? isolate(top.part, top.label) : explode(top.assembly, top.label); } },
    resize,
    get _dbg() { return { ext, int, struct, exg, iso, scene, camera, THREE, renderer, gov, floor: floorObj }; },
    // Keep the model in the part of the canvas a bottom panel does not cover: shift the picture up by half the covered height.
    setInset(px, side = 0) { inset = Math.max(0, px | 0); insetX = Math.max(0, side | 0); applyInset(); render(); },
    debugCam(p, t) { anim = null; camera.position.set(...p); controls.target.set(...t); controls.update(); render(); },
    _debug() { return { renderer, scene, camera, controls, gov, floor: floorObj, ext, render }; },
    snapshot() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    // Frees everything this 3D view holds: the render loop, the WebGL context (phones only allow a few), GPU buffers
    // and textures, observers and the canvas. Safe to call twice; one failing step never stops the rest.
    destroy() {
      if (destroyed) return; destroyed = true; alive = false; cancelAnimationFrame(raf); raf = 0;
      const safe = (f) => { try { f(); } catch (e) { console.warn('3D cleanup', e); } };
      safe(() => ac.abort()); safe(() => ro.disconnect()); safe(() => controls.dispose());
      safe(() => stash());
      for (const r of [drill, struct, exg, iso, wshadow, ...Object.values(cache)]) if (r && r.traverse) safe(() => dispose(r));
      safe(() => { shadow.geometry.dispose(); shadow.material.dispose(); });
      safe(() => floorObj.dispose());
      safe(() => { BG_CAR.dispose(); BG_ISO.dispose(); scene.background = null; scene.environment = null; });
      safe(() => scene.clear());
      safe(() => renderer.renderLists.dispose());
      safe(() => { lostBox?.remove(); if (renderer.domElement.parentNode === container) renderer.domElement.remove(); });
      drill = struct = exg = iso = wshadow = null; for (const k in cache) delete cache[k];
    },
    // Compiles the shaders off the main thread where the phone supports it, so the first frame does not stall.
    // Same as build(), but the body, the interior and their GPU setup are made in separate steps with a paint in between,
    // so the phone never sits frozen for the whole build.
    async buildAsync(m3d, info = {}) {
      const yieldNow = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      const sp = specFor({ ...(m3d || {}), make: (m3d && m3d.make) || info.make, model: (m3d && m3d.model) || info.model, year: (m3d && m3d.year) || info.year });
      const pt = paintHex(info.color); const key = JSON.stringify([m3d || {}, info.make, info.model, info.year, pt]);
      if (!MODEL_CACHE.has(key)) {
        const m = mats(pt, sp.look); const e = buildExterior(sp, m); await yieldNow(); if (destroyed) { disposeTree(e); return; }
        prep(e); await yieldNow(); if (destroyed) { disposeTree(e); return; }
        const i = buildInterior(sp, m); prep(i); await yieldNow(); if (destroyed) { disposeTree(e); disposeTree(i); return; }
        cachePut(key, { ext: e, int: i, M: m });
      }
      build(m3d, info);
    },
    async precompile() { try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); } catch (e) { console.warn(e); } if (!destroyed) render(); },
    get quality() { return { ...prof, pr: renderer.getPixelRatio(), level: gov.level, reflect: !!floorObj.state.enabled }; },
    get destroyed() { return destroyed; },
  };
}
