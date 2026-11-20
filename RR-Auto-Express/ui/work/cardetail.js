// R&R Auto Express - procedural detail for the 3D cars: canvas textures for grilles, headlamps, taillamps
// and tyres, multi-spoke wheels, calipers, mirrors, wipers, sunroof, roof rails, door seams and a cabin
// you can see through the glass. All drawn in code, no outside images or models, no real brand logos.
import * as THREE from './vendor/three.module.min.js';
import { surfGeo, frameAt, mergeGeos, lerp, clamp } from './carbody.js';

const DS = THREE.DoubleSide;
const cache = {};
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const tex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const once = (k, fn) => cache[k] || (cache[k] = fn());
// a texture shared by many materials must never be disposed by the picker: mark it
const keep = (t) => { t.userData.shared = true; return t; };
export function isSharedTex(t) { return !!(t && t.userData && t.userData.shared); }

// ---------- grilles ----------
export function grilleTex(kind) {
  return once('grille:' + kind, () => {
    const W = 512, H = 256; const [c, x] = canvas(W, H);
    x.fillStyle = '#030304'; x.fillRect(0, 0, W, H);
    const barGrad = (y0, h, light = '#e9edf2', dark = '#5b626b') => { const g = x.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, dark); g.addColorStop(0.35, light); g.addColorStop(0.6, '#b9c0c8'); g.addColorStop(1, '#2b2f35'); return g; };
    if (kind === 'bars') { // big horizontal bars with vertical struts (full-size pickup)
      for (let i = 0; i < 4; i++) { const y = 18 + i * 60; x.fillStyle = barGrad(y, 26); x.fillRect(0, y, W, 26); }
      for (let k = 0; k < 9; k++) { const xx = 28 + k * 57; const g = x.createLinearGradient(xx, 0, xx + 10, 0); g.addColorStop(0, '#30353b'); g.addColorStop(0.5, '#aeb5bd'); g.addColorStop(1, '#30353b'); x.fillStyle = g; x.fillRect(xx, 0, 10, H); }
    } else if (kind === 'blocks') { // stacked rectangular slots
      for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) { const y = 10 + r * 62, xx = 8 + k * 84 + (r % 2 ? 42 : 0); x.strokeStyle = '#aab1b9'; x.lineWidth = 7; x.strokeRect(xx % W, y, 70, 46); x.strokeStyle = '#3b4047'; x.lineWidth = 2; x.strokeRect(xx % W + 5, y + 5, 60, 36); }
    } else if (kind === 'mesh') { // diamond mesh with lit upper edges (sedan lower/upper grille)
      const s = 26;
      for (let r = -1; r < H / (s / 2) + 1; r++) for (let k = -1; k < W / s + 1; k++) {
        const cx = k * s + (r % 2 ? s / 2 : 0), cy = r * s / 2;
        x.beginPath(); x.moveTo(cx, cy - s / 2 + 3); x.lineTo(cx + s / 2 - 3, cy); x.lineTo(cx, cy + s / 2 - 3); x.lineTo(cx - s / 2 + 3, cy); x.closePath();
        x.fillStyle = '#0a0b0d'; x.fill(); x.strokeStyle = '#59606a'; x.lineWidth = 2.2; x.stroke();
        x.beginPath(); x.moveTo(cx - s / 2 + 4, cy); x.lineTo(cx, cy - s / 2 + 4); x.strokeStyle = '#9aa2ac'; x.lineWidth = 1.4; x.stroke();
      }
    } else if (kind === 'twobar') { // 13th-gen full-size pickup: fine dark mesh behind two massive horizontal bars
      for (let yy = 0; yy < H; yy += 12) for (let xx = (yy / 12) % 2 ? 6 : 0; xx < W; xx += 12) { x.fillStyle = '#16181b'; x.fillRect(xx + 1, yy + 1, 9, 9); x.fillStyle = '#2b2f34'; x.fillRect(xx + 1, yy + 1, 9, 2); }
      for (const y0 of [H * 0.22, H * 0.6]) { const h = H * 0.17; const g = x.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, '#3e434a'); g.addColorStop(0.2, '#8d949c'); g.addColorStop(0.45, '#2a2e33'); g.addColorStop(1, '#0c0d0f'); x.fillStyle = g; x.fillRect(0, y0, W, h); }
    } else if (kind === 'dslats') { // dark horizontal slats with a lit top edge (sedan lower intake)
      for (let y = 4; y < H; y += 26) { const g = x.createLinearGradient(0, y, 0, y + 12); g.addColorStop(0, '#6c737c'); g.addColorStop(0.3, '#2d3137'); g.addColorStop(1, '#0f1012'); x.fillStyle = g; x.fillRect(0, y, W, 12); }
    } else if (kind === 'slats') { // thin horizontal slats
      for (let y = 6; y < H; y += 22) { x.fillStyle = barGrad(y, 9, '#9da5ae', '#262a2f'); x.fillRect(0, y, W, 9); }
    } else { // honeycomb
      const r = 15, h = r * Math.sqrt(3);
      for (let row = -1; row < H / (h / 2) + 2; row++) for (let col = -1; col < W / (r * 3) + 2; col++) {
        const cx = col * r * 3 + (row % 2 ? r * 1.5 : 0), cy = row * h / 2;
        x.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; x.lineTo(cx + (r - 2) * Math.cos(a), cy + (r - 2) * Math.sin(a)); } x.closePath();
        x.strokeStyle = '#4b525b'; x.lineWidth = 4; x.stroke();
        x.beginPath(); x.moveTo(cx - r + 3, cy); x.lineTo(cx - r / 2 + 1, cy - h / 2 + 3); x.lineTo(cx + r / 2 - 1, cy - h / 2 + 3); x.strokeStyle = '#8d959f'; x.lineWidth = 1.6; x.stroke();
      }
    }
    const t = keep(tex(c)); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  });
}
export function grilleMat(kind, chrome) {
  const t = grilleTex(kind);
  return new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, bumpMap: t, bumpScale: 1.5, metalness: chrome ? 1 : 0.55, roughness: chrome ? 0.16 : 0.32, side: DS });
}

// ---------- headlamps ----------
// u = 0 is the lamp's outer end (the texture is mirrored for the right lamp), v = 1 is the top.
export function headlampMaps(kind) {
  return once('hl:' + kind, () => {
    const W = 512, H = 128; const [c, x] = canvas(W, H); const [e, y] = canvas(W, H);
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3a3f46'); g.addColorStop(0.5, '#1b1e22'); g.addColorStop(1, '#2c3036'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let k = 0; k < 16; k++) { x.fillStyle = k % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.12)'; x.fillRect(k * 32, 0, 16, H); }
    y.fillStyle = '#000'; y.fillRect(0, 0, W, H);
    if (kind === 'reflector') { // chrome reflector chamber behind clear glass: bright faceted background
      const rg = x.createLinearGradient(0, 0, W, 0); rg.addColorStop(0, 'rgba(210,216,224,0.55)'); rg.addColorStop(0.5, 'rgba(140,148,158,0.35)'); rg.addColorStop(1, 'rgba(220,226,232,0.5)');
      x.fillStyle = rg; x.fillRect(0, 0, W, H);
      for (let k = 0; k < 12; k++) { x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(k * W / 12, 0); x.lineTo(k * W / 12 + 18, H); x.stroke(); }
    }
    // projector / reflector bowls (clear-lens 'reflector' lamps get three big bowls, slim 'projector' lamps two small ones)
    const bowls = kind === 'reflector' ? [[0.3, 0.36], [0.56, 0.36], [0.8, 0.3]] : kind === 'projector' ? [[0.5, 0.2], [0.72, 0.2]] : [[0.42, 0.3], [0.68, 0.3]];
    for (const [u, rk] of bowls) {
      const cx = u * W, cy = H * (kind === 'projector' ? 0.4 : 0.42), r = H * rk;
      const rg = x.createRadialGradient(cx - r * 0.2, cy - r * 0.25, 2, cx, cy, r); rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.35, '#aab3bd'); rg.addColorStop(0.7, '#4d545d'); rg.addColorStop(0.9, '#d7dde4'); rg.addColorStop(1, '#22262b');
      x.fillStyle = rg; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#0d1014'; x.beginPath(); x.arc(cx, cy, r * 0.45, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#e8edf2'; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, r * 0.47, 0, Math.PI * 2); x.stroke();
    }
    if (kind === 'projector') { // amber accent strip under the slim lamp, LED light guide across the top
      const ag2 = x.createLinearGradient(0, H * 0.78, 0, H); ag2.addColorStop(0, '#ffb547'); ag2.addColorStop(1, '#c26a0c'); x.fillStyle = ag2; x.fillRect(W * 0.04, H * 0.8, W * 0.9, H * 0.13);
      y.fillStyle = '#7a4600'; y.fillRect(W * 0.04, H * 0.8, W * 0.9, H * 0.13);
    }
    // amber side marker at the outer end
    if (kind !== 'projector') {
    const ag = x.createLinearGradient(0, H * 0.55, 0, H); ag.addColorStop(0, '#f2a43a'); ag.addColorStop(1, '#b8640f'); x.fillStyle = ag; x.fillRect(4, H * 0.58, W * 0.13, H * 0.34);
    for (let k = 0; k < 6; k++) { x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(6 + k * W * 0.021, H * 0.6, 3, H * 0.3); }
    y.fillStyle = '#5a3200'; y.fillRect(4, H * 0.58, W * 0.13, H * 0.34);
    }
    // LED light guides
    const led = (fn) => { for (const [ctx, col, lw] of [[x, '#f4f8ff', 7], [y, '#ffffff', 7]]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); fn(ctx); ctx.stroke(); } };
    if (kind === 'cbar') { // C-clamp at the outer end + bar across the top
      led((k) => { k.moveTo(W * 0.3, H * 0.1); k.lineTo(W * 0.05, H * 0.1); k.lineTo(W * 0.05, H * 0.9); k.lineTo(W * 0.3, H * 0.9); });
      led((k) => { k.moveTo(W * 0.3, H * 0.1); k.lineTo(W * 0.97, H * 0.1); });
    } else if (kind === 'j') { // J / boomerang: top sweep turning down at the outer end
      led((k) => { k.moveTo(W * 0.97, H * 0.16); k.lineTo(W * 0.2, H * 0.16); k.quadraticCurveTo(W * 0.05, H * 0.18, W * 0.07, H * 0.55); });
    } else if (kind === 'projector') { // slim, bright full-width LED guide
      led((k) => { k.moveTo(W * 0.04, H * 0.14); k.lineTo(W * 0.97, H * 0.14); });
      led((k) => { k.moveTo(W * 0.04, H * 0.14); k.lineTo(W * 0.03, H * 0.62); });
    } else if (kind === 'reflector') { // clear lens: thin DRL along the upper edge and inboard corner only
      led((k) => { k.moveTo(W * 0.12, H * 0.07); k.lineTo(W * 0.97, H * 0.07); k.lineTo(W * 0.97, H * 0.5); });
    } else if (kind === 'dual') {
      led((k) => { k.moveTo(W * 0.06, H * 0.12); k.lineTo(W * 0.96, H * 0.12); });
      led((k) => { k.moveTo(W * 0.2, H * 0.88); k.lineTo(W * 0.85, H * 0.88); });
    } else { // thin strip along the top
      led((k) => { k.moveTo(W * 0.05, H * 0.12); k.lineTo(W * 0.96, H * 0.12); });
    }
    return { map: keep(tex(c)), emissiveMap: keep(tex(e)) };
  });
}
export function headlampMat(kind, right) {
  const { map, emissiveMap } = headlampMaps(kind);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map, emissiveMap, emissive: 0xffffff, emissiveIntensity: kind === 'projector' ? 3.4 : kind === 'reflector' ? 1.6 : 2.4, metalness: kind === 'reflector' ? 0.9 : 0.75, roughness: kind === 'reflector' ? 0.12 : 0.22, side: DS });
  if (right) { m.map = map.clone(); m.map.userData.shared = false; m.map.repeat.x = -1; m.map.offset.x = 1; m.map.needsUpdate = true; m.emissiveMap = emissiveMap.clone(); m.emissiveMap.userData.shared = false; m.emissiveMap.repeat.x = -1; m.emissiveMap.offset.x = 1; m.emissiveMap.needsUpdate = true; }
  return m;
}

// ---------- taillamps ----------
export function tailMaps(kind) {
  return once('tl:' + kind, () => {
    const vertical = kind === 'vertical';
    const W = vertical ? 128 : 512, H = vertical ? 512 : 192; const [c, x] = canvas(W, H); const [e, y] = canvas(W, H);
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#7a0a10'); g.addColorStop(0.5, '#4a0408'); g.addColorStop(1, '#6d0a0f'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    // faceted inner optics
    for (let k = 0; k < 40; k++) { x.fillStyle = k % 2 ? 'rgba(255,90,90,0.10)' : 'rgba(0,0,0,0.18)'; if (vertical) x.fillRect(0, k * H / 40, W, H / 80); else x.fillRect(k * W / 40, 0, W / 80, H); }
    y.fillStyle = '#000'; y.fillRect(0, 0, W, H);
    const led = (fn, w = 8) => { for (const [ctx, col] of [[x, '#ff6b6b'], [y, '#ff2a2a']]) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); fn(ctx); ctx.stroke(); } };
    const clear = (x0, y0, w, h) => { const cg = x.createLinearGradient(x0, y0, x0, y0 + h); cg.addColorStop(0, '#e9ecef'); cg.addColorStop(1, '#8f969e'); x.fillStyle = cg; x.fillRect(x0, y0, w, h); x.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 5; k++) x.fillRect(x0 + (k * w) / 5, y0, 2, h); };
    if (vertical) { // pickup: stacked lamp with C-shaped guide, clear reverse section in the middle
      led((k) => { k.moveTo(W * 0.85, H * 0.06); k.lineTo(W * 0.18, H * 0.06); k.lineTo(W * 0.18, H * 0.4); k.lineTo(W * 0.85, H * 0.4); });
      led((k) => { k.moveTo(W * 0.85, H * 0.62); k.lineTo(W * 0.18, H * 0.62); k.lineTo(W * 0.18, H * 0.94); k.lineTo(W * 0.85, H * 0.94); });
      clear(W * 0.3, H * 0.45, W * 0.55, H * 0.13);
    } else if (kind === 'bar') {
      led((k) => { k.moveTo(0, H * 0.3); k.lineTo(W, H * 0.3); });
      led((k) => { k.moveTo(W * 0.08, H * 0.62); k.lineTo(W * 0.6, H * 0.62); });
      clear(W * 0.62, H * 0.5, W * 0.33, H * 0.3);
    } else { // L / C shaped guides at the outer end
      led((k) => { k.moveTo(W * 0.95, H * 0.18); k.lineTo(W * 0.12, H * 0.18); k.lineTo(W * 0.06, H * 0.8); k.lineTo(W * 0.5, H * 0.8); });
      led((k) => { k.moveTo(W * 0.92, H * 0.38); k.lineTo(W * 0.24, H * 0.38); }, 5);
      clear(W * 0.58, H * 0.52, W * 0.36, H * 0.3);
    }
    return { map: keep(tex(c)), emissiveMap: keep(tex(e)) };
  });
}
export function tailMat(kind, right) {
  const { map, emissiveMap } = tailMaps(kind);
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.25, roughness: 0.12, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, side: DS });
  if (right && kind !== 'vertical') { m.map = map.clone(); m.map.userData.shared = false; m.map.repeat.x = -1; m.map.offset.x = 1; m.map.needsUpdate = true; m.emissiveMap = emissiveMap.clone(); m.emissiveMap.userData.shared = false; m.emissiveMap.repeat.x = -1; m.emissiveMap.offset.x = 1; m.emissiveMap.needsUpdate = true; }
  return m;
}

// ---------- wheels and tyres ----------
// Tyre profile with even point spacing so the sidewall and tread bands get usable texture space.
const TYRE_N = { side: 7, shoulder: 3, tread: 10 };
export function tyreGeo(wr, rr, tw) {
  const pts = []; const rb = rr * 1.0, rs = wr - 0.032;
  const sideRow = (sgn) => { const a = []; for (let i = 0; i < TYRE_N.side; i++) { const t = i / (TYRE_N.side - 1); a.push(new THREE.Vector2(lerp(rb, rs, t), sgn * (tw / 2 - 0.012 + 0.016 * Math.sin(Math.PI * Math.min(1, t * 1.15))))); } return a; };
  const inner = sideRow(-1), outer = sideRow(1).reverse();
  const shoulder = (sgn) => { const a = []; for (let i = 1; i <= TYRE_N.shoulder; i++) { const th = (i / (TYRE_N.shoulder + 1)) * Math.PI / 2; a.push(new THREE.Vector2(rs + 0.032 * Math.sin(th), sgn * (tw / 2 - 0.03 + 0.03 * Math.cos(th)))); } return a; };
  const tread = []; for (let i = 0; i < TYRE_N.tread; i++) { const t = i / (TYRE_N.tread - 1); const yy = lerp(-(tw / 2 - 0.03), tw / 2 - 0.03, t); tread.push(new THREE.Vector2(wr + 0.003 * (1 - (2 * t - 1) ** 2), yy)); }
  pts.push(...inner, ...shoulder(-1), ...tread, ...shoulder(1).reverse(), ...outer);
  return new THREE.LatheGeometry(pts, 72);
}
export function tyreBump(kind = 'road') {
  return once('tyre:' + kind, () => {
    const total = TYRE_N.side * 2 + TYRE_N.shoulder * 2 + TYRE_N.tread; const W = 2048, H = 256; const [c, x] = canvas(W, H);
    const vRow = (j) => H - (j / (total - 1)) * H; // canvas y for profile index j (flipY)
    x.fillStyle = '#808080'; x.fillRect(0, 0, W, H);
    const t0 = TYRE_N.side + TYRE_N.shoulder, t1 = t0 + TYRE_N.tread - 1;
    const yT0 = vRow(t1), yT1 = vRow(t0);
    if (kind === 'at') { // all-terrain: big staggered blocks, wide voids, shoulder lugs running onto the sidewall
      x.fillStyle = '#141414'; x.fillRect(0, yT0 - 10, W, yT1 - yT0 + 20);
      const nb = 64, bw = W / nb;
      for (let i = 0; i < nb; i++) for (let k = 0; k < 4; k++) {
        const ya = lerp(yT0, yT1, k / 4) + 3, yb = lerp(yT0, yT1, (k + 1) / 4) - 3, off = (k % 2) * bw * 0.5;
        x.fillStyle = '#b4b4b4'; x.fillRect(i * bw + off + 3, ya, bw - 8, yb - ya);
        x.fillStyle = '#5a5a5a'; x.fillRect(i * bw + off + bw * 0.45, ya, 2, yb - ya);
      }
      for (let i = 0; i < nb; i++) { x.fillStyle = '#a0a0a0'; x.fillRect(i * bw + 4, yT0 - 22, bw * 0.55, 14); x.fillRect(i * bw + bw * 0.4, yT1 + 8, bw * 0.55, 14); }
    } else
    // tread: 4 circumferential grooves + angled sipes/blocks
    for (let k = 1; k <= 4; k++) { const yy = lerp(yT0, yT1, k / 5); x.fillStyle = '#1a1a1a'; x.fillRect(0, yy - 3, W, 6); }
    x.strokeStyle = '#2a2a2a'; x.lineWidth = 4;
    if (kind !== 'at') for (let i = 0; i < 96; i++) { const xx = (i / 96) * W; for (let k = 0; k < 5; k++) { const ya = lerp(yT0, yT1, k / 5) + 3, yb = lerp(yT0, yT1, (k + 1) / 5) - 3; x.beginPath(); x.moveTo(xx + (k % 2 ? 6 : -6), ya); x.lineTo(xx + (k % 2 ? -6 : 6), yb); x.stroke(); } }
    // sidewalls: raised ring + blocky lettering-like marks (no words) + rim protector
    for (const [a, b] of [[0, TYRE_N.side - 1], [total - TYRE_N.side, total - 1]]) {
      const ya = vRow(a), yb = vRow(b), y0 = Math.min(ya, yb), y1 = Math.max(ya, yb), hh = y1 - y0;
      x.fillStyle = '#9a9a9a'; x.fillRect(0, y0 + hh * 0.12, W, Math.max(2, hh * 0.08));
      x.fillStyle = '#a8a8a8';
      for (let i = 0; i < 2; i++) { const base = i * W / 2 + W * 0.08; for (let k = 0; k < 22; k++) { const w = 10 + ((k * 37) % 9); x.fillRect(base + k * 22, y0 + hh * 0.42, w, hh * 0.22); } }
      for (let i = 0; i < 2; i++) { const base = i * W / 2 + W * 0.33; for (let k = 0; k < 10; k++) x.fillRect(base + k * 14, y0 + hh * 0.48, 9, hh * 0.12); }
    }
    const t = keep(tex(c, false)); t.wrapS = THREE.RepeatWrapping; return t;
  });
}
export function tyreMat(kind = 'road') { return new THREE.MeshStandardMaterial({ color: 0x1d1d1e, roughness: 0.86, metalness: 0, bumpMap: tyreBump(kind), bumpScale: kind === 'at' ? 4 : 2.2 }); }

// spokes for a style; geometry lies in the XZ plane facing +Y (the outer face), like wheelGeos() in carbody.
export function spokeGeo(style, rr, face) {
  const parts = [];
  const spoke = (a, w0, w1, depth, r0 = 0.24, r1 = 0.97, dip = 0.012) => {
    const sh = new THREE.Shape(); sh.moveTo(rr * r0, -w0); sh.lineTo(rr * r1, -w1); sh.lineTo(rr * r1, w1); sh.lineTo(rr * r0, w0);
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2, steps: 1 });
    g.rotateX(-Math.PI / 2);
    // concave dish: pull the outer ends inboard
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getZ(i)); p.setY(i, p.getY(i) - dip * clamp((r / rr - 0.3) / 0.7, 0, 1)); }
    g.rotateY(a); g.translate(0, face, 0); parts.push(g);
  };
  const n = style === 'five' ? 5 : style === 'six' ? 6 : style === 'multi' ? 10 : style === 'twenty' ? 20 : style === 'aero' ? 5 : 5;
  for (let k = 0; k < n; k++) {
    const a = k * (Math.PI * 2 / n);
    if (style === 'five') spoke(a, 0.04, 0.07, 0.034, 0.24, 0.97, 0.024);
    else if (style === 'six') spoke(a, 0.03, 0.045, 0.03, 0.24, 0.97, 0.02);
    else if (style === 'multi') spoke(a, 0.012, 0.02, 0.024, 0.24, 0.97, 0.016);
    else if (style === 'twenty') { spoke(a, 0.007, 0.011, 0.02, 0.26, 0.97, 0.022); }
    else if (style === 'aero') { spoke(a, 0.05, 0.11, 0.018, 0.24, 0.95, 0.004); }
    else { spoke(a - 0.12, 0.013, 0.022, 0.024); spoke(a + 0.12, 0.013, 0.022, 0.024); }
  }
  return mergeGeos(parts);
}
// caliper: an annular sector block sitting over the disc
export function caliperGeo(rr) {
  const sh = new THREE.Shape(); const r0 = rr * 0.6, r1 = rr * 0.88, a0 = -0.42, a1 = 0.42;
  sh.absarc(0, 0, r1, a0, a1, false); sh.absarc(0, 0, r0, a1, a0, true);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 10 });
  g.rotateX(-Math.PI / 2); g.translate(0, 0.0, 0); return g;
}
export function lugGeo(rr, n) {
  const list = []; for (let k = 0; k < n; k++) { const a = k * Math.PI * 2 / n; const c = new THREE.CylinderGeometry(0.011, 0.013, 0.02, 6); c.translate(Math.cos(a) * rr * 0.16, 0, Math.sin(a) * rr * 0.16); list.push(c); }
  return mergeGeos(list);
}

// ---------- cabin visible through the glass (decoration only, never pickable) ----------
const box = (x0, x1, y0, y1, z0, z1) => { const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; };
const rbox = (cx, cy, cz, w, h, d, r, rotZ = 0) => { const g = new THREE.CapsuleGeometry(r, 1, 3, 8); g.scale(w / (2 * r), h / (1 + 2 * r), d / (2 * r)); if (rotZ) g.rotateZ(rotZ); g.translate(cx, cy, cz); return g; };
export function buildCabin(s, F) {
  const { X, W2, isPickup } = F; const g = new THREE.Group(); g.name = 'cabin';
  const leather = [], bolster = [], dark = [], light = [], metal = [];
  const floorY = s.gc + 0.3;
  const front = s.doors[0], rear = s.doors.length > 1 ? s.doors[1] : null;
  const cushionY = Math.max(floorY + 0.2, s.belt - 0.42);
  const headroom = (d) => F.topY(d) - 0.12;
  const seat = (dHip, zc, w) => {
    const back = Math.min(headroom(dHip + 0.05) - 0.16, cushionY + 0.62);
    leather.push(rbox(X(dHip - 0.24), cushionY - 0.04, zc, 0.5, 0.11, w * 0.82, 0.05));
    bolster.push(rbox(X(dHip - 0.24), cushionY, zc - w * 0.42, 0.46, 0.12, 0.07, 0.035), rbox(X(dHip - 0.24), cushionY, zc + w * 0.42, 0.46, 0.12, 0.07, 0.035));
    leather.push(rbox(X(dHip + 0.05), (cushionY + back) / 2 + 0.02, zc, 0.11, back - cushionY, w * 0.8, 0.05, 0.22));
    bolster.push(rbox(X(dHip + 0.04), (cushionY + back) / 2, zc - w * 0.43, 0.13, back - cushionY - 0.04, 0.07, 0.035, 0.22), rbox(X(dHip + 0.04), (cushionY + back) / 2, zc + w * 0.43, 0.13, back - cushionY - 0.04, 0.07, 0.035, 0.22));
    const hy = Math.min(back + 0.12, headroom(dHip + 0.1) - 0.02);
    bolster.push(rbox(X(dHip + 0.12), hy, zc, 0.09, 0.15, w * 0.46, 0.04, 0.15));
    metal.push(box(X(dHip + 0.1) - 0.006, X(dHip + 0.1) + 0.006, back - 0.02, hy - 0.06, zc - 0.06, zc - 0.05), box(X(dHip + 0.1) - 0.006, X(dHip + 0.1) + 0.006, back - 0.02, hy - 0.06, zc + 0.05, zc + 0.06));
    dark.push(box(X(dHip - 0.45), X(dHip), floorY, cushionY - 0.08, zc - w * 0.35, zc + w * 0.35));
  };
  const zIn = W2 - 0.16;
  const dFront = front[0] + (front[1] - front[0]) * 0.78;
  seat(dFront, -zIn * 0.52, 0.52); seat(dFront, zIn * 0.52, 0.52);
  if (rear || (isPickup && s.cabBack - dFront > 1.0)) {
    const dr = rear ? rear[0] + (rear[1] - rear[0]) * 0.72 : s.cabBack - 0.25;
    if (dr - dFront > 0.6) { seat(dr, -zIn * 0.62, 0.56); seat(dr, 0, 0.42); seat(dr, zIn * 0.62, 0.56); }
  }
  // dashboard, instrument hood, centre stack, console
  const dDash0 = s.cowl + 0.02, dDash1 = s.cowl + 0.5, dashTop = s.belt + 0.03;
  dark.push(box(X(dDash1), X(dDash0), dashTop - 0.28, dashTop, -zIn, zIn));
  light.push(box(X(dDash1 + 0.02), X(dDash1 - 0.06), dashTop - 0.2, dashTop - 0.12, -zIn, zIn));
  dark.push(rbox(X(dDash1 - 0.12), dashTop + 0.03, -zIn * 0.52, 0.18, 0.07, 0.36, 0.03));
  metal.push(box(X(dDash1 + 0.005), X(dDash1 - 0.02), dashTop - 0.1, dashTop + 0.06, -0.12, 0.12)); // screen
  dark.push(box(X(dDash1 + 0.25), X(dDash1 - 0.05), floorY, dashTop - 0.2, -0.13, 0.13));
  dark.push(box(X(dFront + 0.05), X(dDash1 + 0.2), floorY, cushionY + 0.05, -0.11, 0.11));
  // door trim + headliner + floor
  for (const sg of [-1, 1]) dark.push(box(X(Math.max(s.cowl + 0.3, front[0])), X(rear ? rear[1] : front[1]), floorY + 0.1, s.belt + 0.02, sg * (W2 - 0.11), sg * (W2 - 0.085)));
  dark.push(box(X(dDash0), X(rear ? rear[1] : isPickup ? s.cabBack : front[1] + 0.4), floorY - 0.02, floorY, -zIn, zIn));
  // steering wheel (driver = left = -z)
  const sw = new THREE.TorusGeometry(0.18, 0.017, 10, 36); sw.rotateY(Math.PI / 2); sw.rotateZ(-0.42); sw.translate(X(dDash1 - 0.08 + 0.18), dashTop - 0.02, -zIn * 0.52); dark.push(sw);
  const hub = new THREE.CylinderGeometry(0.055, 0.06, 0.05, 16); hub.rotateZ(Math.PI / 2 - 0.42); hub.translate(X(dDash1 + 0.1), dashTop - 0.02, -zIn * 0.52); dark.push(hub);
  for (const a of [0, 2.1, -2.1]) { const sp = box(-0.004, 0.004, 0, 0.17, -0.012, 0.012); sp.rotateX(a); sp.rotateZ(-0.42); sp.translate(X(dDash1 + 0.1), dashTop - 0.02, -zIn * 0.52); metal.push(sp); }
  const col = new THREE.CylinderGeometry(0.035, 0.045, 0.3, 10); col.rotateZ(Math.PI / 2 - 0.42 + 0.0); col.translate(X(dDash1 - 0.02), dashTop - 0.09, -zIn * 0.52); dark.push(col);
  const mk = (list, mat, name) => { if (!list.length) return; const m = new THREE.Mesh(mergeGeos(list), mat); m.name = name; m.userData.cabin = true; g.add(m); };
  const std = (o) => new THREE.MeshStandardMaterial({ side: DS, ...o });
  mk(leather, std({ color: 0x3a3d42, roughness: 0.72 }), 'cabin_seats');
  mk(bolster, std({ color: 0x24262a, roughness: 0.6 }), 'cabin_bolsters');
  mk(dark, std({ color: 0x1b1d20, roughness: 0.8 }), 'cabin_trim');
  mk(light, std({ color: 0x6d6f72, roughness: 0.45, metalness: 0.5 }), 'cabin_accent');
  mk(metal, std({ color: 0x0c0e11, roughness: 0.15, metalness: 0.6, emissive: 0x0a1a2a, emissiveIntensity: 0.6 }), 'cabin_screen');
  return g;
}

// tube through world points
export function tube(points, r, segs = 24) { const c = new THREE.CatmullRomCurve3(points); return new THREE.TubeGeometry(c, segs, r, 8, false); }

// ---------- per-model detail choices (our own notes; see VEHICLE_REFERENCE_NOTES.md) ----------
const BY_STYLE = {
  pickup: { gk: 'bars', lowk: 'honeycomb', hl: 'cbar', tl: 'vertical', wheel: 'six', finish: 'machined', caliper: 'gray', handle: 'body', sunroof: true, rails: false, mirror: 'tow' },
  sedan: { gk: 'mesh', lowk: 'mesh', hl: 'j', tl: 'lc', wheel: 'twin', finish: 'machined', caliper: 'gray', handle: 'body', sunroof: true, rails: false, mirror: 'std' },
  coupe: { gk: 'mesh', lowk: 'mesh', hl: 'j', tl: 'lc', wheel: 'twenty', finish: 'dark', caliper: 'red', handle: 'body', sunroof: false, rails: false, mirror: 'std' },
  hatch: { gk: 'honeycomb', lowk: 'honeycomb', hl: 'line', tl: 'lc', wheel: 'twin', finish: 'silver', caliper: 'gray', handle: 'body', sunroof: true, rails: false, mirror: 'std' },
  suv: { gk: 'honeycomb', lowk: 'honeycomb', hl: 'line', tl: 'lc', wheel: 'multi', finish: 'silver', caliper: 'gray', handle: 'body', sunroof: true, rails: true, mirror: 'std' },
  minivan: { gk: 'slats', lowk: 'honeycomb', hl: 'line', tl: 'lc', wheel: 'twin', finish: 'machined', caliper: 'gray', handle: 'body', sunroof: false, rails: false, mirror: 'std' },
  van: { gk: 'slats', lowk: 'slats', hl: 'dual', tl: 'lc', wheel: 'six', finish: 'silver', caliper: 'gray', handle: 'body', sunroof: false, rails: false, mirror: 'tow' },
};
const BY_MODEL = {
  'ford|f-150': { gk: 'bars', hl: 'cbar', wheel: 'six', finish: 'machined' },
  'ford|f-150|2015-2020': { gk: 'twobar', lowk: 'honeycomb', hl: 'reflector', wheel: 'five', finish: 'gunmetal', caliper: 'red', handle: 'black', mirror: 'towblack', sunroof: 'split', tread: 'at' },
  'chevrolet|silverado': { gk: 'blocks', hl: 'dual', finish: 'dark' },
  'gmc|sierra': { gk: 'blocks', hl: 'cbar', finish: 'chrome' },
  'ram|1500': { gk: 'slats', hl: 'line', wheel: 'multi' },
  'toyota|tacoma': { gk: 'honeycomb', hl: 'line', finish: 'dark', mirror: 'std' },
  'toyota|camry': { gk: 'dslats', lowk: 'dslats', hl: 'projector', wheel: 'twin', finish: 'twotone', handle: 'chrome', mirror: 'std', sunroof: false },
  'honda|accord': { gk: 'honeycomb', hl: 'line', finish: 'dark' },
  'honda|civic': { gk: 'honeycomb', hl: 'line', wheel: 'twenty', finish: 'dark' },
  'toyota|corolla': { gk: 'mesh', hl: 'j' },
  'nissan|altima': { gk: 'slats', hl: 'j' },
  'hyundai|sonata': { gk: 'mesh', hl: 'line', tl: 'bar' },
  'hyundai|elantra': { gk: 'mesh', hl: 'line', tl: 'bar', wheel: 'multi' },
  'chevrolet|malibu': { gk: 'slats', hl: 'line' },
  'tesla|model 3': { hl: 'line', wheel: 'aero', finish: 'dark', sunroof: false, handle: 'body' },
  'tesla|model y': { hl: 'line', wheel: 'aero', finish: 'dark', sunroof: false, tl: 'bar', rails: false },
  'toyota|rav4': { gk: 'honeycomb', rails: true, finish: 'dark' },
  'honda|cr-v': { gk: 'honeycomb', rails: true },
  'nissan|rogue': { gk: 'slats', rails: true },
  'chevrolet|equinox': { gk: 'slats', hl: 'line', rails: true, finish: 'dark' },
  'ford|escape': { gk: 'honeycomb', rails: true },
  'ford|explorer': { gk: 'honeycomb', rails: true, finish: 'dark' },
  'toyota|highlander': { gk: 'slats', rails: true, finish: 'machined' },
  'jeep|grand cherokee': { gk: 'slats', rails: true, wheel: 'multi' },
  'honda|odyssey': { gk: 'honeycomb' },
};
export function detailFor(s) {
  const st = s.style === 'pickup' ? 'pickup' : s.style === 'van' ? 'van' : s.style === 'minivan' ? 'minivan' : s.style === 'suv' ? 'suv' : s.style === 'coupe' ? 'coupe' : s.rear === 'sedan' ? 'sedan' : s.style === 'hatch' || s.style === 'wagon' ? 'hatch' : 'suv';
  const key = (s.look && s.look.key) || '';
  return { style: st, ...BY_STYLE[st], ...(BY_MODEL[key] || {}) };
}

// texture repeat so grille cells come out at a believable real size on any grille opening
const SPAN = { twobar: [1.6, 0.8], dslats: [0.75, 0.38], bars: [1.0, 0.45], blocks: [0.98, 0.49], mesh: [0.69, 0.345], honeycomb: [0.57, 0.285], slats: [0.7, 0.35] };
export function fitRepeat(mesh, kind) {
  const g = mesh.geometry; g.computeBoundingBox(); const b = g.boundingBox; const w = Math.max(b.max.z - b.min.z, 0.05), h = Math.max(b.max.y - b.min.y, 0.03);
  const [sw, sh] = SPAN[kind] || SPAN.honeycomb; const m = mesh.material;
  for (const k of ['map', 'bumpMap']) if (m[k]) { m[k] = m[k].clone(); m[k].userData.shared = false; m[k].repeat.set(w / sw, h / sh); m[k].needsUpdate = true; }
}
