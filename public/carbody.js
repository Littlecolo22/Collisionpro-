// R&R Auto Express - procedural studio-style car bodies.
// Every body panel is a region of one continuous parametric surface (nose cap, side bands, top bands,
// rear cap, greenhouse), so panels meet with thin shut lines and keep the same part ids as before.
import * as THREE from './vendor/three.module.min.js';
import { grilleMat, headlampMat, tailMat, tyreGeo, tyreMat, spokeGeo, caliperGeo, lugGeo, buildCabin, tube, detailFor, fitRepeat } from './cardetail.js';

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- generic surface grid ----------
// fn(u,v) -> Vector3. Options: us/vs explicit samples or u0,u1,nu / v0,v1,nv; holes: [sdf(u,v)] (<0 inside);
// offset (along outward normal), thick (shell thickness), flange (deeper wall on the outer border), outRef(P)->point inside.
export function surfGeo(fn, o = {}) {
  const us = o.us || Array.from({ length: (o.nu || 16) + 1 }, (_, i) => lerp(o.u0 ?? 0, o.u1 ?? 1, i / (o.nu || 16)));
  const vs = o.vs || Array.from({ length: (o.nv || 8) + 1 }, (_, j) => lerp(o.v0 ?? 0, o.v1 ?? 1, j / (o.nv || 8)));
  const holes = o.holes || [], NU = us.length, NV = vs.length, nu = NU - 1, nv = NV - 1;
  const sdf = (u, v) => { let m = 1e9; for (const h of holes) m = Math.min(m, h(u, v)); return m; };
  const keep = new Uint8Array(nu * nv);
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const uc = (us[i] + us[i + 1]) / 2, vc = (vs[j] + vs[j + 1]) / 2;
    keep[i * nv + j] = (!holes.length || sdf(uc, vc) > 0) && (!o.mask || o.mask(uc, vc)) ? 1 : 0;
  }
  const K = (i, j) => i >= 0 && j >= 0 && i < nu && j < nv && keep[i * nv + j];
  const used = (i, j) => K(i, j) || K(i - 1, j) || K(i, j - 1) || K(i - 1, j - 1);
  const du = Math.abs(us[nu] - us[0]) / nu * 0.3 || 1e-3, dv = Math.abs(vs[nv] - vs[0]) / nv * 0.3 || 1e-3;
  const P = [], N = [];
  const outRef = o.outRef;
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    let u = us[i], v = vs[j];
    if (holes.length && used(i, j)) {
      for (let it = 0; it < 4; it++) { const d = sdf(u, v); if (d >= 0) break; const gu = (sdf(u + du, v) - sdf(u - du, v)) / (2 * du), gv = (sdf(u, v + dv) - sdf(u, v - dv)) / (2 * dv); const g2 = gu * gu + gv * gv || 1; u -= gu * d / g2; v -= gv * d / g2; }
    }
    const p = fn(u, v);
    const eu = du, ev = dv;
    const pu = fn(u + eu, v).sub(fn(u - eu, v)), pv = fn(u, v + ev).sub(fn(u, v - ev));
    const n = new THREE.Vector3().crossVectors(pu, pv); if (n.lengthSq() < 1e-14) n.set(0, 1, 0); n.normalize();
    if (outRef) { const r = outRef(p); if (n.dot(p.clone().sub(r)) < 0) n.negate(); }
    P.push(p); N.push(n);
  }
  const idx = (i, j) => i * NV + j;
  const pos = [], uv = [], index = [];
  const off = o.offset || 0, th = o.thick || 0, fl = o.flange || th;
  const U0 = us[0], UL = us[nu] - us[0] || 1, V0 = vs[0], VL = vs[nv] - vs[0] || 1;
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const p = P[idx(i, j)], n = N[idx(i, j)]; pos.push(p.x + n.x * off, p.y + n.y * off, p.z + n.z * off); uv.push((us[i] - U0) / UL, (vs[j] - V0) / VL); }
  // orientation so outer faces point outward
  let flip = false;
  for (let i = 0; i < nu && !flip; i++) for (let j = 0; j < nv; j++) if (K(i, j)) { const a = P[idx(i, j)], b = P[idx(i + 1, j)], d = P[idx(i, j + 1)]; const fnrm = new THREE.Vector3().crossVectors(b.clone().sub(a), d.clone().sub(a)); flip = fnrm.dot(N[idx(i, j)]) < 0; i = nu; break; }
  const quad = (a, b, c, d, f) => { if (f) index.push(a, c, b, a, d, c); else index.push(a, b, c, a, c, d); };
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) if (K(i, j)) quad(idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1), flip);
  if (th > 0) {
    const base = NU * NV;
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const p = P[idx(i, j)], n = N[idx(i, j)]; const k = off - th; pos.push(p.x + n.x * k, p.y + n.y * k, p.z + n.z * k); uv.push((us[i] - U0) / UL, (vs[j] - V0) / VL); }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) if (K(i, j)) quad(base + idx(i, j), base + idx(i + 1, j), base + idx(i + 1, j + 1), base + idx(i, j + 1), !flip);
    // walls (own vertices for crisp edges)
    const wall = (ia, ja, ib, jb, border) => {
      const pa = P[idx(ia, ja)], pb = P[idx(ib, jb)], na = N[idx(ia, ja)], nb = N[idx(ib, jb)], k = off - (border ? fl : th);
      const s = pos.length / 3;
      pos.push(pa.x + na.x * off, pa.y + na.y * off, pa.z + na.z * off, pb.x + nb.x * off, pb.y + nb.y * off, pb.z + nb.z * off, pb.x + nb.x * k, pb.y + nb.y * k, pb.z + nb.z * k, pa.x + na.x * k, pa.y + na.y * k, pa.z + na.z * k);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      index.push(s, s + 1, s + 2, s, s + 2, s + 3);
    };
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      if (!K(i, j)) continue;
      const bord = (ii, jj) => ii < 0 || jj < 0 || ii >= nu || jj >= nv;
      if (!K(i, j - 1)) wall(i, j, i + 1, j, bord(i, j - 1));
      if (!K(i, j + 1)) wall(i, j + 1, i + 1, j + 1, bord(i, j + 1));
      if (!K(i - 1, j)) wall(i, j, i, j + 1, bord(i - 1, j));
      if (!K(i + 1, j)) wall(i + 1, j, i + 1, j + 1, bord(i + 1, j));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
// point + outward normal on a surface (for placing details)
export function frameAt(fn, u, v, outRef, e = 1e-3) {
  const p = fn(u, v), pu = fn(u + e, v).sub(fn(u - e, v)), pv = fn(u, v + e).sub(fn(u, v - e));
  const n = new THREE.Vector3().crossVectors(pu, pv).normalize();
  if (outRef && n.dot(p.clone().sub(outRef(p))) < 0) n.negate();
  return { p, n, tu: pu.normalize(), tv: pv.normalize() };
}
// rounded-rect sdf in param space (normalised by half sizes)
export const rrect = (cu, cv, hu, hv, r = 0.35) => (u, v) => {
  const x = Math.abs(u - cu) / hu, y = Math.abs(v - cv) / hv;
  const qx = x - (1 - r), qy = y - (1 - r);
  return (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r) * Math.min(hu, hv);
};
export const ellipse = (cu, cv, hu, hv) => (u, v) => (Math.hypot((u - cu) / hu, (v - cv) / hv) - 1) * Math.min(hu, hv);

// ---------- body definition ----------
export function bodyFns(s) {
  const L = s.L, W2 = s.W / 2, X = (d) => L / 2 - d;
  const st = s.style, isPickup = st === 'pickup', isVan = st === 'van', sedanRear = s.rear === 'sedan';
  const boxy = isPickup || isVan;
  const fa = s.fo, ra = s.fo + s.wb, ar = s.wr + 0.075;
  const dN = boxy ? 0.27 : 0.36, dR = isPickup ? 0.0 : isVan ? 0.24 : 0.34;
  const nN = boxy ? 7 : st === 'suv' ? 5 : 3.6, nR = isVan ? 7 : st === 'suv' || st === 'minivan' ? 5 : 3.6;
  const ySill = s.gc + 0.06, yb = s.gc + 0.155;
  const lastDoorEnd = s.doors[s.doors.length - 1][1];
  const halfW = (d) => W2 * (1 - (boxy ? 0.008 : 0.022) * ((d - L * 0.52) / (L * 0.5)) ** 2);
  const crownH = boxy ? 0.025 : 0.04;
  const hoodFront = s.hoodF + (boxy ? 0.0 : -0.01);
  const hoodY = (d) => { const t = clamp((d - 0.1) / (s.cowl - 0.1), 0, 1); return hoodFront + (s.belt + 0.015 - hoodFront) * (1 - (1 - t) ** 1.5); };
  const beltAt = (d) => s.belt + (s.rise ?? (boxy ? 0.005 : 0.035)) * clamp((d - s.cowl) / (L - s.cowl), 0, 1);
  const bedStart = s.bedStart || 0;
  const yS = (d) => {
    if (d <= s.cowl) return hoodY(d);
    if (isPickup && d >= bedStart - 0.02) return s.belt + 0.04;
    if (sedanRear && d > lastDoorEnd) return lerp(beltAt(lastDoorEnd), Math.max(s.deckY, beltAt(lastDoorEnd)), smooth((d - lastDoorEnd) / Math.max(0.1, s.deckF - lastDoorEnd)));
    return beltAt(d);
  };
  const prof = (yn) => {
    let k = 1 - 0.012 * ((yn - 0.5) / 0.5) ** 2;
    if (yn < 0.2) k -= 0.07 * ((0.2 - yn) / 0.2) ** 2;
    if (yn > 0.8) k -= (boxy ? 0.035 : 0.075) * ((Math.min(yn, 1.05) - 0.8) / 0.2) ** 2;
    return k;
  };
  // character lines: a crisp shoulder ridge parallel to the belt + a shallow lower door sculpt, faded out
  // before the nose / rear caps so the panels still meet them flush
  const sideEnd = isPickup ? L - 0.22 : L - dR;
  const creaseS = (s.look && s.look.crease) || 1;
  const creaseK = (d) => smooth((d - dN - 0.04) / 0.32) * smooth((sideEnd - d - 0.04) / 0.32);
  const crease = (d, y) => {
    const h = yS(d) - ySill; if (h < 0.2) return 0;
    const k = creaseK(d); if (k <= 0) return 0;
    const t1 = y - (ySill + h * (boxy ? 0.8 : 0.76)), t2 = y - (ySill + h * 0.36);
    const ridge = boxy ? 0.007 * (t1 < 0 ? Math.exp(-((t1 / 0.03) ** 2)) : Math.exp(-((t1 / 0.008) ** 2))) : 0.0065 * Math.exp(-((t1 / (t1 < 0 ? 0.03 : 0.012)) ** 2));
    return k * (ridge * creaseS - (boxy ? 0.002 : 0.004) * Math.exp(-((t2 / 0.05) ** 2)));
  };
  const sideZ = (d, y) => halfW(d) * prof((y - ySill) / Math.max(0.05, yS(d) - ySill)) + crease(d, y);
  const zS = (d) => sideZ(d, yS(d));
  // greenhouse
  const rearBase = sedanRear ? s.deckF : isPickup ? s.cabBack : isVan ? s.roofR : s.base;
  const rearBaseY = yS(rearBase);
  const tumble = isVan ? 0.06 : isPickup ? 0.12 : st === 'suv' || st === 'minivan' ? 0.13 : 0.17;
  const topY = (d) => {
    const y0 = yS(s.cowl);
    if (d <= s.cowl) return y0;
    if (d < s.roofF) { const u = (d - s.cowl) / (s.roofF - s.cowl); return y0 + (s.roof - y0) * (1 - (1 - u) ** 1.7); }
    if (d <= s.roofR) return s.roof + 0.016 * Math.sin(Math.PI * (d - s.roofF) / Math.max(0.1, s.roofR - s.roofF));
    if (isVan) return s.roof;
    if (d < rearBase) { const u = (d - s.roofR) / (rearBase - s.roofR); return s.roof - (s.roof - rearBaseY) * (isPickup ? u ** 1.1 : sedanRear ? u ** 1.45 : u ** 1.25); }
    return rearBaseY;
  };
  const z1 = (d) => {
    let z = halfW(d) - tumble;
    if (d < s.roofF) z -= 0.05 * (1 - clamp((d - s.cowl) / (s.roofF - s.cowl), 0, 1));
    if (!isPickup && !isVan && d > s.roofR) z = lerp(z, zS(d) - 0.004, ((d - s.roofR) / Math.max(0.05, rearBase - s.roofR)) ** 2.2);
    return Math.min(z, zS(d) - 0.004);
  };
  const crownAt = (d) => (d < s.roofF ? 0.07 : d <= s.roofR ? (boxy ? 0.03 : 0.05) : 0.06);
  // greenhouse side band (t 0 at shoulder, 1 at roof edge); sg -1 left, +1 right
  const gs = (sg) => (d, t) => { const y = lerp(yS(d), topY(d), t); const z = lerp(zS(d), z1(d), t) + 0.012 * Math.sin(Math.PI * t); return V3(X(d), y, sg * z); };
  const tb = (d, sv) => V3(X(d), topY(d) + crownAt(d) * (1 - sv * sv), sv * z1(d));
  // body side band: param (d, v) with v 0..1 between bot(d) and top(d)
  const archY = (d) => { let y = -1; for (const c of [fa, ra]) { const dx = d - c; if (Math.abs(dx) < ar) y = Math.max(y, s.wr + Math.sqrt(ar * ar - dx * dx)); } return y; };
  const side = (sg, bot, top) => (d, v) => { const y = lerp(bot(d), top(d), v); return V3(X(d), y, sg * sideZ(d, y)); };
  // superellipse plan for nose / rear caps
  const se = (p, n) => { const th = (p - 0.5) * Math.PI, ss = Math.sin(th), cc = Math.cos(th); return { zf: Math.sign(ss) * Math.abs(ss) ** (2 / n), df: 1 - Math.abs(cc) ** (2 / n), w: Math.abs(cc) ** 0.6, sv: Math.sign(ss) * Math.abs(ss) ** (2 / n) }; };
  const yLowN = s.gc + 0.1;
  const noseTopLean = boxy ? 0.06 : 0.13;
  const nose = (p, h) => {
    const q = se(p, nN); const dp = dN * q.df;
    const leanTop = noseTopLean * q.w * smooth((h - 0.45) / 0.55) * (boxy ? 1 : 1);
    const leanLow = (boxy ? 0.03 : 0.07) * q.w * (h < 0.25 ? ((0.25 - h) / 0.25) ** 2 : 0);
    const dTop = dp + noseTopLean * q.w;
    const yTop = hoodY(Math.max(0.1, dTop)) + crownH * (1 - q.sv * q.sv);
    const y = lerp(yLowN, yTop, h);
    const zz = halfW(dN) * q.zf * prof((y - ySill) / Math.max(0.05, yS(dN) - ySill));
    return V3(X(dp + leanTop + leanLow), y, zz);
  };
  const noseH = (p, y) => { const q = se(p, nN); const yTop = hoodY(Math.max(0.1, dN * q.df + noseTopLean * q.w)) + crownH * (1 - q.sv * q.sv); return (y - yLowN) / (yTop - yLowN); };
  const hoodEdgeD = (sv) => { const p = (Math.asin(clamp(Math.sign(sv) * Math.abs(sv) ** (nN / 2), -1, 1)) / Math.PI) + 0.5; const q = se(p, nN); return dN * q.df + noseTopLean * q.w; };
  // hood: (sv -1..1, k 0..1 front->rear)
  const bulge = (s.look && s.look.hoodBulge) || 0;
  const hoodDome = (sv, k) => bulge ? bulge * (1 - smooth((Math.abs(sv) - 0.3) / 0.22)) * smooth(k / 0.18) * smooth((1 - k) / 0.12) : 0;
  const hood = (sv, k, dEnd = s.cowl - 0.045) => { const d = lerp(hoodEdgeD(sv) + 0.006, dEnd, k); return V3(X(d), yS(d) + crownH * (1 - sv * sv) + hoodDome(sv, k), sv * zS(d)); };
  // rear cap
  const yLowR = s.gc + 0.11;
  const rearTopLean = sedanRear ? 0.07 : isVan ? 0.03 : Math.max(0.04, L - rearBase);
  const rTopY = (p) => {
    const q = se(p, nR); const d = L - dR * q.df - rearTopLean * q.w;
    if (isVan) return topY(Math.min(d, s.roofR)) + crownAt(s.roofR) * (1 - q.sv * q.sv) - 0.01;
    return yS(d) + crownH * (1 - q.sv * q.sv);
  };
  const rear = (p, h) => {
    const q = se(p, nR); const dp = L - dR * q.df;
    const lean = rearTopLean * q.w * smooth((h - 0.5) / 0.5) + 0.06 * q.w * (h < 0.25 ? ((0.25 - h) / 0.25) ** 2 : 0);
    const yTop = rTopY(p); const y = lerp(yLowR, yTop, h); const d = dp - lean;
    let zz;
    const ysd = yS(L - dR);
    if (isVan && y > ysd) zz = lerp(zS(L - dR), z1(L - dR), clamp((y - ysd) / Math.max(0.05, yTop - ysd), 0, 1));
    else zz = halfW(L - dR) * prof((y - ySill) / Math.max(0.05, ysd - ySill));
    return V3(X(d), y, zz * q.zf);
  };
  const rearH = (p, y) => (y - yLowR) / (rTopY(p) - yLowR);
  const deckEdgeD = (sv) => { const p = (Math.asin(clamp(Math.sign(sv) * Math.abs(sv) ** (nR / 2), -1, 1)) / Math.PI) + 0.5; const q = se(p, nR); return L - dR * q.df - rearTopLean * q.w; };
  const deck = (sv, k) => { const d = lerp(s.deckF + 0.012, deckEdgeD(sv) - 0.006, k); return V3(X(d), yS(d) + crownH * (1 - sv * sv), sv * zS(d)); };
  // outward reference: a point on the car's inner axis
  const outRef = (p) => V3(clamp(p.x, -L / 2 + 0.9, L / 2 - 0.9), Math.min(p.y, s.belt) - 0.3, 0);
  return { s, L, W2, X, st, isPickup, isVan, boxy, sedanRear, fa, ra, ar, dN, dR, ySill, yb, lastDoorEnd, halfW, hoodY, yS, sideZ, zS, rearBase, rearBaseY, topY, z1, gs, tb, archY, side, nose, noseH, hood, rear, rearH, deck, outRef, yLowN, yLowR, hoodEdgeD, deckEdgeD, bedStart };
}

// ---------- procedural textures ----------
let _hex = null, _contact = null;
export function honeycombTex() {
  if (_hex) return _hex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#050607'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#3a3f46'; x.lineWidth = 5;
  const r = 16, h = r * Math.sqrt(3);
  for (let row = -1; row < 6; row++) for (let col = -1; col < 6; col++) {
    const cx = col * r * 3 + (row % 2 ? r * 1.5 : 0), cy = row * h / 2;
    x.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; x.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); } x.closePath(); x.stroke();
  }
  _hex = new THREE.CanvasTexture(c); _hex.wrapS = _hex.wrapT = THREE.RepeatWrapping; _hex.colorSpace = THREE.SRGBColorSpace;
  return _hex;
}
export function contactShadowTex() {
  if (_contact) return _contact;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 64, 8, 128, 64, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.45, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.setTransform(1, 0, 0, 0.5, 0, 32); x.fillStyle = g; x.fillRect(0, -64, 256, 256);
  _contact = new THREE.CanvasTexture(c); return _contact;
}

// ---------- materials ----------
// paint finish from the colour: whites read as solid/pearl, blacks as deep gloss, the rest as metallic
export function paintFinish(paint) {
  const c = new THREE.Color(paint); const hsl = {}; c.getHSL(hsl);
  if (hsl.l > 0.8) return { metalness: 0.06, roughness: 0.22, sheen: 0 };
  if (hsl.l < 0.1) return { metalness: 0.35, roughness: 0.28 };
  return { metalness: hsl.s < 0.18 ? 0.8 : 0.62, roughness: 0.3 };
}
export function mats(paint, look = {}) {
  const DS = THREE.DoubleSide;
  const fin = look.finish || null; // per-vehicle paint finish (satin metallic, pearl white...)
  const gl = look.glass === 'dark' ? { color: 0x07090c, opacity: 0.86 } : look.glass === 'tint' ? { color: 0x0a0e12, opacity: 0.72 } : { color: 0x0b1117, opacity: 0.6 };
  const std = (o) => new THREE.MeshStandardMaterial({ side: DS, ...o });
  return {
    paint: () => new THREE.MeshPhysicalMaterial({ color: paint, ...paintFinish(paint), clearcoat: 1, clearcoatRoughness: 0.03, ...(fin ? { ...fin, sheenColor: 0xffffff } : {}), side: DS }),
    glass: () => new THREE.MeshPhysicalMaterial({ color: gl.color, metalness: 0.05, roughness: 0.02, transparent: true, opacity: gl.opacity, clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 2.2, side: DS }),
    black: () => std({ color: 0x15171a, roughness: 0.55, metalness: 0.1 }),
    gloss: () => new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, roughness: 0.15, metalness: 0.2, clearcoat: 1, side: DS }),
    chrome: () => std({ color: 0xeef1f4, metalness: 1, roughness: 0.07 }),
    lamp: () => new THREE.MeshPhysicalMaterial({ color: 0xe8f0f8, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.22, clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 2, depthWrite: false, side: DS }),
    reflector: () => std({ color: 0xb9c1ca, metalness: 0.95, roughness: 0.2 }),
    drl: () => std({ color: 0xffffff, emissive: 0xe8f2ff, emissiveIntensity: 0.9, roughness: 0.3 }),
    tail: () => new THREE.MeshPhysicalMaterial({ color: 0x9a0d16, emissive: 0x3a0004, emissiveIntensity: 0.6, roughness: 0.12, clearcoat: 1, transparent: true, opacity: 0.92, side: DS }),
    amber: () => std({ color: 0xe0a030, roughness: 0.3 }),
    tire: (k) => tyreMat(k),
    wheel: () => std({ color: 0xc4cad1, metalness: 0.9, roughness: 0.22 }),
    wheelFinish: (f) => std(f === 'gunmetal' ? { color: 0x4b5057, metalness: 0.85, roughness: 0.28 } : f === 'darkgray' ? { color: 0x34383d, metalness: 0.7, roughness: 0.34 } : f === 'dark' ? { color: 0x2a2d31, metalness: 0.75, roughness: 0.32 } : f === 'chrome' ? { color: 0xf0f2f5, metalness: 1, roughness: 0.06 } : f === 'machined' ? { color: 0xd9dde2, metalness: 0.95, roughness: 0.14 } : { color: 0xb9bfc6, metalness: 0.9, roughness: 0.24 }),
    rubber: () => std({ color: 0x0e0f10, roughness: 0.75 }),
    brake: () => std({ color: 0x6d7076, metalness: 0.8, roughness: 0.45 }),
    caliper: () => std({ color: 0xa3201e, roughness: 0.4, metalness: 0.2 }),
    core: () => new THREE.MeshBasicMaterial({ color: 0x07090b, side: DS }),
    well: () => std({ color: 0x0b0c0e, roughness: 1 }),
    trim: () => std({ color: 0x24272c, roughness: 0.8 }),
    seat: () => std({ color: 0x2d3138, roughness: 0.9 }),
    soft: () => std({ color: 0xbfb8aa, roughness: 0.95, transparent: true, opacity: 0.45 }),
    wire: () => std({ color: 0xe07b1a, roughness: 0.6 }),
    metal: () => std({ color: 0x8b939c, metalness: 0.6, roughness: 0.45 }),
    steel: () => std({ color: 0x9aa3ad, metalness: 0.75, roughness: 0.38 }),
    foam: () => std({ color: 0xcac39c, roughness: 1 }),
    carpet: () => std({ color: 0x24272c, roughness: 1 }),
    airbag: () => std({ color: 0xe8e4da, roughness: 0.9 }),
    honey: () => { const t = honeycombTex().clone(); t.needsUpdate = true; t.repeat.set(9, 2.2); return std({ color: 0xffffff, map: t, roughness: 0.5, metalness: 0.2 }); },
    plate: () => std({ color: 0xf2f2ee, roughness: 0.6 }),
  };
}

// ---------- exterior ----------
export function buildExterior(s, M) {
  const F = bodyFns(s);
  const { X, W2, L, isPickup, isVan, sedanRear, fa, ra, ar, yb, ySill, outRef } = F;
  const g = new THREE.Group(); g.name = 'exterior';
  const GAP = 0.004;
  const DT = detailFor(s);
  const RES = s.res || 1; // mesh density: 1 in the app, 2-3 for the GLB export and offline renders
  const D = 20 * RES; // columns per metre
  const cols = (a, b, extra = []) => { const n = Math.max(3, Math.ceil(Math.abs(b - a) * D)); const arr = []; for (let i = 0; i <= n; i++) arr.push(lerp(a, b, i / n)); for (const e of extra) if (e > Math.min(a, b) && e < Math.max(a, b)) arr.push(e); return [...new Set(arr)].sort((p, q) => (a < b ? p - q : q - p)); };
  const archCols = (a, b) => { const ex = []; for (const c of [fa, ra]) for (let k = -12; k <= 12; k++) ex.push(c + (ar * 0.999) * Math.sin((k / 12) * Math.PI / 2)); return cols(a, b, ex); };
  const rows = (n0) => { const n = Math.round(n0 * RES); return Array.from({ length: n + 1 }, (_, j) => j / n); };
  const parts = {};
  const addPart = (name, obj, assembly) => {
    let p = parts[name];
    if (!p) { p = new THREE.Group(); p.name = name; p.userData.part = name; if (assembly) p.userData.assembly = assembly; p.userData.detail = []; g.add(p); parts[name] = p; }
    p.add(obj); return obj;
  };
  // surface piece: geometry + recipe for a detailed (thick) version used by the isolate view
  const piece = (name, fn, o, mat, assembly, det = {}) => {
    const m = new THREE.Mesh(surfGeo(fn, { outRef, ...o }), mat);
    addPart(name, m, assembly);
    m.userData.recipe = parts[name].userData.detail.length;
    parts[name].userData.detail.push({ fn, o: { outRef, ...o }, matKey: det.matKey, thick: det.thick ?? 0.006, flange: det.flange, tabs: det.tabs, holes: det.holes });
    return m;
  };
  const deco = (name, obj) => { obj.name = name; g.add(obj); return obj; };
  const sides = [['l', -1], ['r', 1]];

  // core + wheel wells (not pickable)
  const coreEnd = isPickup ? s.cabBack : L - 0.3;
  deco('core', new THREE.Mesh(boxGeo(X(F.dN + 0.12), X(s.cowl), s.gc + 0.1, s.hoodF - 0.07, -W2 + 0.3, W2 - 0.3), M.core()));
  { // dark tub behind the panels (hides seams and the inside of the skin); open on top so the cabin shows through the glass
    const top = Math.min(s.belt, sedanRear ? s.deckY : s.belt) - 0.06;
    if (s.cargo) deco('core', new THREE.Mesh(boxGeo(X(s.cowl), X(coreEnd), s.gc + 0.1, top, -W2 + 0.3, W2 - 0.3), M.core()));
    else {
      const t = 0.02, zi = W2 - 0.3;
      deco('core', new THREE.Mesh(mergeGeos([boxGeo(X(s.cowl), X(coreEnd), s.gc + 0.1, s.gc + 0.28, -zi, zi), boxGeo(X(s.cowl), X(coreEnd), s.gc + 0.1, top, -zi - t, -zi), boxGeo(X(s.cowl), X(coreEnd), s.gc + 0.1, top, zi, zi + t), boxGeo(X(s.cowl) - t, X(s.cowl), s.gc + 0.1, top, -zi, zi), boxGeo(X(coreEnd), X(coreEnd) + t, s.gc + 0.1, top, -zi, zi)]), M.core()));
    }
  }
  deco('floor', new THREE.Mesh(boxGeo(X(0.25), X(isPickup ? L - 0.25 : L - 0.25), s.gc + 0.07, s.gc + 0.1, -W2 + 0.1, W2 - 0.1), M.core()));
  for (const c of [fa, ra]) for (const [, sg] of sides) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(ar - 0.005, ar - 0.005, 0.34, 28, 1, true, Math.PI / 2 - 0.05, Math.PI + 0.1), M.well());
    w.rotation.x = Math.PI / 2; w.rotation.y = 0; w.position.set(X(c), s.wr, sg * (W2 - 0.2)); deco('well', w);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(ar, 28, 0, Math.PI), M.well()); cap.position.set(X(c), s.wr, sg * (W2 - 0.37)); deco('well', cap);
  }

  // ---- body side bands ----
  const topS = (d) => F.yS(d) - 0.002;
  const botArch = (d) => Math.max(yb, F.archY(d));
  const fenderEnd = s.doors[0][0] - GAP;
  for (const [sfx, sg] of sides) {
    piece('fender_' + sfx, F.side(sg, botArch, topS), { us: archCols(F.dN + GAP, fenderEnd), vs: rows(30) }, M.paint(), null, { tabs: 'top' });
    s.doors.forEach(([a, b], i) => {
      const name = [['door_lf', 'door_rf'], ['door_lr', 'door_rr']][i][sg < 0 ? 0 : 1];
      const top = s.cargo && i === 1 ? (d) => F.topY(d) - 0.06 : topS;
      const m = piece(name, s.cargo && i === 1 ? (d, v) => { const y = lerp(yb + 0.01, top(d), v); const yy = Math.min(y, F.yS(d)); const z = y <= F.yS(d) ? F.sideZ(d, y) : lerp(F.zS(d), F.z1(d), (y - F.yS(d)) / Math.max(0.05, F.topY(d) - F.yS(d))); return new THREE.Vector3(X(d), y, sg * z); } : F.side(sg, () => yb + 0.006, top), { us: archCols(a + GAP, b - GAP), vs: rows(s.cargo && i === 1 ? 34 : 30) }, M.paint(), name, { holes: 'handle', tabs: 'hinge' });
      parts[name].userData.assembly = name;
      // flush handle
      const hd = b - 0.22, hy = s.belt - 0.1, hz = F.sideZ(hd, hy);
      const h = new THREE.Mesh(new THREE.CapsuleGeometry(0.017, 0.14, 4, 12), DT.handle === 'chrome' ? M.chrome() : DT.handle === 'black' ? M.gloss() : M.paint()); h.rotation.z = Math.PI / 2; h.position.set(X(hd), hy, sg * (hz + 0.008)); h.scale.set(1, 1, 0.55);
      const hs = new THREE.Mesh(new THREE.CapsuleGeometry(0.004, 0.12, 2, 8), M.chrome()); hs.rotation.z = Math.PI / 2; hs.position.set(X(hd), hy + 0.012, sg * (hz + 0.017));
      const cup = new THREE.Mesh(new THREE.CircleGeometry(1, 24), M.rubber()); cup.scale.set(0.1, 0.03, 1); cup.position.set(X(hd), hy, sg * (hz + 0.0015)); cup.rotation.y = sg < 0 ? Math.PI : 0;
      const hp = new THREE.Group(); hp.name = name + '_handle_out'; hp.userData.part = name + '_handle_out'; hp.add(cup, h); if (DT.handle !== 'chrome') hp.add(hs); g.add(hp); parts[hp.name] = hp;
    });
    if (!isPickup) piece('quarter_' + sfx, F.side(sg, botArch, sedanRear ? topS : topS), { us: archCols(F.lastDoorEnd + GAP, L - F.dR - GAP), vs: rows(30) }, M.paint(), null, {});
    else {
      piece('cab_corner_' + sfx, F.side(sg, () => yb, topS), { us: cols(F.lastDoorEnd + GAP, s.cabBack), vs: rows(26) }, M.paint());
      piece('bedside_' + sfx, F.side(sg, botArch, () => s.belt + 0.035), { us: archCols(s.bedStart, L - 0.22), vs: rows(26) }, M.paint(), null, {});
      // bed rail cap
      piece('bedside_' + sfx, (d, v) => new THREE.Vector3(X(d), s.belt + 0.035 + 0.008 * Math.sin(Math.PI * v), sg * lerp(F.sideZ(d, s.belt + 0.035), W2 - 0.11, v)), { us: cols(s.bedStart, L - 0.22), vs: rows(3) }, M.paint());
    }
    // rocker
    const rk0 = fa + ar + 0.002, rk1 = ra - ar - 0.002;
    piece('rocker_' + sfx, (d, v) => { const y = lerp(s.gc + 0.045, yb - 0.002, v); const z = F.sideZ(d, yb) - 0.03 * (1 - v) ** 2 + 0.004; return new THREE.Vector3(X(d), y, sg * z); }, { us: cols(rk0, rk1), vs: rows(5) }, M.trim(), null, { matKey: 'trim' });
  }
  delete parts.cab_corner_l?.userData.part; delete parts.cab_corner_r?.userData.part;

  // ---- nose (front bumper, headlamps, grille) ----
  const LK = s.look || {};
  const pL = LK.lampW ?? (isPickup || isVan ? 0.2 : F.st === 'suv' ? 0.24 : 0.27);
  const lampH = LK.lampH ?? (isPickup ? 0.24 : isVan ? 0.2 : F.st === 'suv' ? 0.17 : 0.14);
  // black wheel-arch cladding / flares (look profile); each band belongs to the panel around its arch
  if (LK.clad) {
    const cw = Math.min(0.12, LK.clad);
    for (const [sfx, sg] of sides) for (const [c, pn] of [[fa, 'fender_' + sfx], [ra, (isPickup ? 'bedside_' : 'quarter_') + sfx]]) {
      if (!parts[pn]) continue;
      const pos = [], idx = [], N = 28;
      for (let i = 0; i <= N; i++) {
        const th = Math.PI * (i / N);
        for (const [j, r] of [[0, ar + 0.004], [1, ar + cw]]) {
          const d = c + r * Math.cos(th), y = Math.max(yb + 0.005, s.wr + r * Math.sin(th));
          pos.push(X(d), y, sg * (F.sideZ(d, Math.min(y, F.yS(d))) + (j ? 0.014 : 0.008)));
        }
        if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const mt = M.black(); mt.side = THREE.DoubleSide;
      const band = new THREE.Mesh(geo, mt); band.name = 'clad'; band.castShadow = true; parts[pn].add(band);
    }
  }
  const yBT = s.hoodF - lampH;
  const hB = (p) => F.noseH(p, yBT);
  const NP = 72 * RES;
  const ps = (a, b, n0) => { const n = Math.round(n0 * RES); return Array.from({ length: n + 1 }, (_, i) => lerp(a, b, i / n)); };
  const noseBump = (p, h) => F.nose(p, h * hB(p));
  const lowW = Math.min(0.27, LK.lowW ?? 0.2), lowH = Math.min(0.22, LK.lowH ?? 0.17);
  const lowHole = rrect(0.5, 0.42, lowW, lowH, 0.4);
  const sqFog = LK.fog === 'square', fogE = (pc, hu, hv) => sqFog ? rrect(pc, 0.42, hu * 0.95, hv * 0.62, 0.3) : ellipse(pc, 0.42, hu, hv);
  const fogHoles = [fogE(0.17, 0.045, 0.14), fogE(0.83, 0.045, 0.14)];
  piece('fbumper_cover', noseBump, { us: ps(0, 1, NP), vs: rows(16), holes: [lowHole, ...fogHoles] }, M.paint(), 'front_bumper', { thick: 0.008, flange: 0.03, tabs: 'top', holes: 'nose' });
  // recessed lower grille + fog lamps, sit in the openings
  const lg = piece('grille_lower', noseBump, { us: ps(0.5 - lowW - 0.01, 0.5 + lowW + 0.01, 34), vs: ps(Math.max(0.02, 0.42 - lowH - 0.03), Math.min(0.66, 0.42 + lowH + 0.03), 8), mask: (u, v) => lowHole(u, v) < 0.004, offset: -0.018 }, grilleMat(DT.lowk, false), 'front_bumper', { thick: 0.006 });
  fitRepeat(lg, DT.lowk);
  for (const [sfx, pc] of [['l', 0.17], ['r', 0.83]]) {
    piece('fog_lamp_' + sfx, noseBump, { us: ps(pc - 0.05, pc + 0.05, 10), vs: ps(0.26, 0.58, 8), mask: (u, v) => fogE(pc, 0.04, 0.12)(u, v) < 0, offset: -0.008 }, M.lamp(), 'front_bumper', { thick: 0.03 });
    const fr = frameAt(noseBump, pc, 0.42, outRef);
    const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.02, 18), M.reflector()); bulb.position.copy(fr.p).addScaledVector(fr.n, -0.02); bulb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fr.n); parts['fog_lamp_' + sfx].add(bulb);
    piece('fog_bezel_' + sfx, noseBump, { us: ps(pc - 0.07, pc + 0.07, 12), vs: ps(0.2, 0.64, 8), mask: (u, v) => { const e = fogE(pc, 0.06, LK.fogPods ? 0.22 : 0.2)(u, v); return e < 0 && fogHoles[sfx === 'l' ? 0 : 1](u, v) > -0.002; }, offset: 0.003 }, M.gloss(), 'front_bumper', { thick: 0.005 });
  }
  if (LK.valance === 'black') { // white upper bumper over a black textured lower valance (13th-gen pickup)
    const vt = 0.6;
    const val = new THREE.Mesh(surfGeo(noseBump, { us: ps(0, 1, NP), vs: ps(0, vt, 8), mask: (u, v) => lowHole(u, v) > -0.002 && fogHoles[0](u, v) > -0.002 && fogHoles[1](u, v) > -0.002, offset: 0.0025, outRef }), M.black());
    val.name = 'valance'; parts.fbumper_cover.add(val);
  }
  // license bracket + plate, radar
  const lb = piece('license_bracket_f', noseBump, { us: ps(0.42, 0.58, 10), vs: ps(0.67, 0.93, 5), offset: 0.006 }, M.black(), 'front_bumper', { thick: 0.012 });
  const plate = new THREE.Mesh(surfGeo(noseBump, { us: ps(0.43, 0.57, 8), vs: ps(0.69, 0.91, 4), offset: 0.011, outRef }), M.plate()); parts.license_bracket_f.add(plate);
  for (const pc of [0.3, 0.37, 0.63, 0.7]) { const fr = frameAt(noseBump, pc, 0.8, outRef); const sn = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.008, 16), M.paint()); sn.position.copy(fr.p).addScaledVector(fr.n, 0.002); sn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fr.n); sn.name = 'sensor'; parts.fbumper_cover.add(sn); const rg = new THREE.Mesh(new THREE.TorusGeometry(0.0125, 0.0018, 6, 18), M.rubber()); rg.position.copy(sn.position); rg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fr.n); parts.fbumper_cover.add(rg); }
  piece('front_radar', noseBump, { us: ps(0.475, 0.525, 4), vs: ps(0.33, 0.5, 4), offset: -0.012 }, M.gloss(), 'front_bumper', { thick: 0.03 });
  // tow hook cover (small painted plug)
  piece('tow_hook_cover', noseBump, { us: ps(0.72, 0.76, 4), vs: ps(0.66, 0.78, 3), offset: 0.0015, mask: (u, v) => ellipse(0.74, 0.72, 0.02, 0.06)(u, v) < 0 }, M.paint(), 'front_bumper', { thick: 0.01 });
  // upper: headlamps + grille
  const noseUp = (p, h) => F.nose(p, lerp(hB(p), 1, h));
  for (const [sfx, a, b] of [['l', 0, pL], ['r', 1 - pL, 1]]) {
    const lens = piece('headlamp_' + sfx, noseUp, { us: ps(a + (a ? GAP : 0), b - (a ? 0 : GAP), 20), vs: rows(6) }, M.lamp(), null, { thick: 0.09, matKey: 'lamp' });
    const inner = new THREE.Mesh(surfGeo(noseUp, { us: ps(a, b, 20), vs: rows(6), offset: -0.026, outRef }), headlampMat(DT.hl, sfx === 'r')); inner.name = 'lamp_inner'; parts['headlamp_' + sfx].add(inner);
    for (const pc of [sfx === 'l' ? lerp(a, b, 0.42) : lerp(b, a, 0.42), sfx === 'l' ? lerp(a, b, 0.68) : lerp(b, a, 0.68)]) { const fr = frameAt(noseUp, pc, 0.58, outRef); const pr = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.03, 20), M.chrome()); pr.position.copy(fr.p).addScaledVector(fr.n, -0.022); pr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fr.n); parts['headlamp_' + sfx].add(pr); const ln = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 10), M.lamp()); ln.position.copy(fr.p).addScaledVector(fr.n, -0.015); parts['headlamp_' + sfx].add(ln); }
  }
  const gHH = Math.min(0.45, LK.gH ?? 0.36), gBase = rrect(0.5, 0.5, 0.5 - pL - 0.02, gHH, 0.35), gTrap = LK.gTrap || 0;
  // trapezoid option: the opening narrows toward its bottom edge
  const gHole = gTrap ? (u, v) => { const k = 1 - gTrap * clamp((0.5 + gHH - v) / (2 * gHH), 0, 1); return gBase(0.5 + (u - 0.5) / k, v) * k; } : gBase;
  const gMat = LK.grille === 'chrome' ? M.chrome() : LK.grille === 'black' ? M.gloss() : LK.grille === 'body' || LK.grille === 'closed' ? M.paint() : isPickup ? M.chrome() : M.gloss();
  piece('grille', noseUp, { us: ps(pL + GAP, 1 - pL - GAP, 30), vs: rows(10), holes: [gHole] }, gMat, 'front_bumper', { thick: 0.012, flange: 0.03, tabs: 'top', holes: 'grille' });
  const ins = new THREE.Mesh(surfGeo(noseUp, { us: ps(pL, 1 - pL, 30), vs: rows(10), mask: (u, v) => gHole(u, v) < 0.01, offset: -0.02, outRef }), grilleMat(DT.gk, LK.grille === 'chrome' || (isPickup && LK.grille !== 'black'))); fitRepeat(ins, DT.gk); if (LK.grille === 'closed') ins.material = M.paint(); ins.name = 'grille_insert'; parts.grille.add(ins);
  { const fr = frameAt(noseUp, 0.5, 0.52, outRef); const em = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 32), M.chrome()); em.scale.set(1.35, 1, 0.75); em.position.copy(fr.p).addScaledVector(fr.n, 0.004); em.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fr.n); em.rotateY(Math.PI / 2); addPart('grille_emblem', em, 'front_bumper'); }

  // ---- hood, cowl ----
  piece('hood', (sv, k) => F.hood(sv, k), { us: ps(-1, 1, 36), vs: rows(18) }, M.paint(), 'hood', { thick: 0.006, flange: 0.025, tabs: 'rear' });
  piece('cowl', (sv, k) => { const d = lerp(s.cowl - 0.04, s.cowl + 0.004, k); return new THREE.Vector3(X(d), F.yS(d) + 0.04 * (1 - sv * sv) * 0.9 - 0.004, sv * F.zS(d) * 0.97); }, { us: ps(-1, 1, 24), vs: rows(2) }, M.black(), null, { matKey: 'black' });
  { // wipers resting at the base of the windshield (part of the cowl)
    const up = (d, sv) => F.tb(d, sv).add(new THREE.Vector3(0, 0.014, 0));
    const wl = (d0, s0, d1, s1) => { const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(up(lerp(d0, d1, t), lerp(s0, s1, t))); } return pts; };
    const c0 = s.cowl + 0.04;
    for (const [s0, s1, piv] of [[-0.82, 0.1, -0.3], [0.02, 0.78, 0.42]]) {
      const blade = new THREE.Mesh(tube(wl(c0 + 0.02, s0, c0 + 0.1, s1), 0.0075, 20), M.rubber()); blade.name = 'wiper'; parts.cowl.add(blade);
      const arm = new THREE.Mesh(tube([up(s.cowl - 0.01, piv).add(new THREE.Vector3(0, 0.005, 0)), up(c0 + 0.03, lerp(s0, s1, 0.45)).add(new THREE.Vector3(0, 0.012, 0)), up(c0 + 0.07, lerp(s0, s1, 0.62)).add(new THREE.Vector3(0, 0.009, 0))], 0.006, 12), M.black()); arm.name = 'wiper'; parts.cowl.add(arm);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.02, 14), M.black()); cap.position.copy(up(s.cowl - 0.01, piv)); parts.cowl.add(cap);
    }
  }

  // ---- greenhouse ----
  const gsCols = (a, b) => cols(a, b);
  const tRows = rows(8);
  for (const [sfx, sg] of sides) {
    const fnG = F.gs(sg);
    const doorGlass = s.doors.map(([a, b], i) => [i === 0 ? Math.max(a + 0.05, s.cowl + 0.05) : a + 0.05, b - 0.05]);
    const segs = [];
    let cur = s.cowl;
    segs.push(['pillar_a_' + sfx, cur, doorGlass[0][0], M.paint()]);
    s.doors.forEach(([a, b], i) => {
      const name = [['door_lf', 'door_rf'], ['door_lr', 'door_rr']][i][sg < 0 ? 0 : 1];
      const [ga, gb] = doorGlass[i];
      if (i > 0) segs.push([s.doors.length > 1 && i === 1 ? 'pillar_b_' + sfx : name, doorGlass[i - 1][1], ga, M.gloss()]);
      if (s.cargo && i === 1) return;
      segs.push(['glass:' + name, ga, gb]);
    });
    const lgEnd = s.cargo ? doorGlass[0][1] : doorGlass[doorGlass.length - 1][1];
    const qGlass = !isPickup && ((!s.cargo && !sedanRear) || F.st === 'coupe');
    const ghEnd = F.rearBase;
    if (isPickup) segs.push([null, lgEnd, ghEnd, M.paint()]);
    else if (s.cargo) segs.push(['quarter_' + sfx, s.cargo ? (s.doors[1] ? s.doors[1][1] : lgEnd) : lgEnd, ghEnd, M.paint()]);
    else if (qGlass) {
      const qa = lgEnd + (F.st === 'coupe' ? 0.06 : 0.1), qb = Math.min(ghEnd - 0.12, F.s.roofR + (sedanRear ? 0.2 : 0.35));
      if (qb - qa > 0.12) { segs.push(['quarter_' + sfx, lgEnd, qa, M.paint()]); segs.push(['glass:quarter_glass_' + sfx, qa, qb]); segs.push(['quarter_' + sfx, qb, ghEnd, M.paint()]); }
      else segs.push(['quarter_' + sfx, lgEnd, ghEnd, M.paint()]);
    } else segs.push(['quarter_' + sfx, lgEnd, ghEnd, M.paint()]);
    for (const [nm, a, b, mat] of segs) {
      if (b - a < 0.005) continue;
      if (nm && nm.startsWith('glass:')) {
        const name = nm.slice(6);
        const owner = name.startsWith('door_') ? name : name;
        const isDoor = /^door_/.test(name);
        // glass t 0.05..0.9 ; frame strip above + belt strip below belong to the door
        piece(isDoor ? name + '_glass' : name, fnG, { us: gsCols(a, b), vs: lerpRows(0.05, 0.9, 8) }, M.glass(), null, { thick: 0.005, matKey: 'glass' });
        if (isDoor) {
          piece(name, fnG, { us: gsCols(a - 0.03, b + 0.03), vs: lerpRows(0.9, 1, 2) }, M.gloss(), name, { matKey: 'gloss' });
          piece(name, fnG, { us: gsCols(a - 0.03, b + 0.03), vs: lerpRows(0, 0.05, 1), offset: 0.002 }, M.chrome(), name, { matKey: 'chrome' });
        } else {
          piece('quarter_' + sfx.replace(/.*/, sfx), fnG, { us: gsCols(a, b), vs: lerpRows(0.9, 1, 2) }, M.paint());
          piece('quarter_' + sfx, fnG, { us: gsCols(a, b), vs: lerpRows(0, 0.05, 1) }, M.paint());
        }
      } else if (nm) piece(nm, fnG, { us: gsCols(a, b), vs: tRows }, mat, null, {});
      else { const m = new THREE.Mesh(surfGeo(fnG, { us: gsCols(a, b), vs: tRows, outRef }), mat); deco('cab', m); }
    }
    // B-pillar for 4-door already added via segs ('pillar_b_'); make sure 2-door cars get none
  }
  // top band: windshield + A-pillars, roof, back glass + C/D pillars
  const tbF = (d, sv) => F.tb(d, sv);
  const wsE = 0.86;
  piece('windshield', tbF, { us: cols(s.cowl + 0.006, s.roofF), vs: ps(-wsE, wsE, 20) }, M.glass(), null, { thick: 0.006, matKey: 'glass' });
  piece('pillar_a_l', tbF, { us: cols(s.cowl + 0.006, s.roofF), vs: ps(-1, -wsE, 3) }, M.paint());
  piece('pillar_a_r', tbF, { us: cols(s.cowl + 0.006, s.roofF), vs: ps(wsE, 1, 3) }, M.paint());
  piece('roof', tbF, { us: cols(s.roofF, isVan ? s.roofR : s.roofR), vs: ps(-1, 1, 24) }, LK.blackRoof ? M.gloss() : M.paint(), null, { thick: 0.006, flange: 0.02 });
  // sunroof glass + seal, roof rails (all belong to the roof panel)
  if (DT.sunroof === 'split' && !LK.blackRoof && s.roofR - s.roofF > 0.85) { // black panoramic roof in two panels
    const a0 = s.roofF + 0.07, a1 = s.roofR - 0.1, mid = (a0 + a1) / 2;
    const seal = new THREE.Mesh(surfGeo(tbF, { us: cols(a0 - 0.02, a1 + 0.02), vs: ps(-0.72, 0.72, 12), offset: 0.0015, outRef }), M.gloss()); seal.name = 'sunroof'; parts.roof.add(seal);
    const sg2 = M.glass(); sg2.opacity = 0.95; sg2.color.setHex(0x030405); sg2.transparent = false;
    for (const [b0, b1] of [[a0, mid - 0.03], [mid + 0.03, a1]]) { const gm = new THREE.Mesh(surfGeo(tbF, { us: cols(b0, b1), vs: ps(-0.66, 0.66, 12), offset: 0.003, outRef }), sg2); gm.name = 'sunroof'; parts.roof.add(gm); }
  } else if (DT.sunroof && !LK.blackRoof && s.roofR - s.roofF > 0.85) {
    const r0 = s.roofF + 0.1, r1 = Math.min(s.roofR - 0.15, r0 + (isPickup ? 0.62 : 0.8));
    const seal = new THREE.Mesh(surfGeo(tbF, { us: cols(r0 - 0.02, r1 + 0.02), vs: ps(-0.6, 0.6, 12), offset: 0.0015, outRef }), M.rubber()); seal.name = 'sunroof'; parts.roof.add(seal);
    const sg2 = M.glass(); sg2.opacity = 0.92; sg2.color.setHex(0x05080b);
    const glass = new THREE.Mesh(surfGeo(tbF, { us: cols(r0, r1), vs: ps(-0.56, 0.56, 12), offset: 0.003, outRef }), sg2); glass.name = 'sunroof'; parts.roof.add(glass);
  }
  if (DT.rails && !isPickup) {
    for (const sg of [-1, 1]) {
      const r0 = s.roofF + 0.12, r1 = s.roofR - 0.05, pts = [];
      for (let i = 0; i <= 10; i++) { const d = lerp(r0, r1, i / 10); const lift = 0.045 * Math.sin(Math.PI * Math.min(1, Math.max(0, (i / 10 - 0.0) / 1))) ** 0.25; pts.push(F.tb(d, sg * 0.84).add(new THREE.Vector3(0, 0.012 + lift, 0))); }
      const rail = new THREE.Mesh(tube(pts, 0.013, 30), LK.blackRoof ? M.gloss() : M.black()); rail.scale.set(1, 1, 1); rail.name = 'roof_rail'; parts.roof.add(rail);
      for (const d of [r0 + 0.03, r1 - 0.03]) { const ft = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.035), M.black()); ft.position.copy(F.tb(d, sg * 0.84)).add(new THREE.Vector3(0, 0.022, 0)); parts.roof.add(ft); }
    }
  }
  if (!isVan) {
    const bgE = isPickup ? 0.72 : 0.8;
    const bgEnd = F.rearBase - 0.004;
    piece('back_glass', tbF, { us: cols(s.roofR + 0.004, bgEnd), vs: ps(-bgE, bgE, 18) }, M.glass(), null, { thick: 0.005, matKey: 'glass' });
    for (const [sfx, a, b] of [['l', -1, -bgE], ['r', bgE, 1]]) {
      if (isPickup) deco('cab', new THREE.Mesh(surfGeo(tbF, { us: cols(s.roofR + 0.004, bgEnd), vs: ps(a, b, 3), outRef }), M.paint()));
      else piece('quarter_' + sfx, tbF, { us: cols(s.roofR + 0.004, bgEnd), vs: ps(a, b, 3) }, M.paint());
    }
  }

  // ---- rear ----
  if (!isPickup) {
    const rbTop = sedanRear ? s.deckY - 0.24 : isVan ? s.gc + 0.5 : s.belt - 0.33;
    const hRB = (p) => F.rearH(p, rbTop);
    const rearLow = (p, h) => F.rear(p, h * hRB(p));
    const rearUp = (p, h) => F.rear(p, lerp(hRB(p), 1, h));
    piece('rbumper_cover', rearLow, { us: ps(0, 1, 60), vs: rows(12) }, M.paint(), 'rear_bumper', { thick: 0.008, flange: 0.03, tabs: 'top' });
    piece('rbumper_cover', rearLow, { us: ps(0.2, 0.8, 30), vs: ps(0, 0.22, 3), offset: 0.002 }, M.black(), 'rear_bumper');
    for (const pc of [0.25, 0.4, 0.6, 0.75]) { const fr = frameAt(rearLow, pc, 0.62, outRef); const sn = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.008, 16), M.paint()); sn.position.copy(fr.p).addScaledVector(fr.n, 0.002); sn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fr.n); sn.name = 'sensor'; parts.rbumper_cover.add(sn); }
    if (DT.style === 'sedan' || DT.style === 'coupe') for (const pc of [0.22, 0.78]) { const fr = frameAt(rearLow, pc, 0.13, outRef); const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.12, 20, 1, true), M.chrome()); tip.scale.set(1.6, 1, 0.75); tip.position.copy(fr.p).addScaledVector(fr.n, -0.03); tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fr.n); tip.name = 'exhaust'; parts.rbumper_cover.add(tip); const hole = new THREE.Mesh(new THREE.CircleGeometry(0.036, 20), M.core()); hole.scale.set(1.6, 0.75, 1); hole.position.copy(fr.p).addScaledVector(fr.n, -0.04); hole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fr.n); parts.rbumper_cover.add(hole); }
    for (const [sfx, pc] of [['l', 0.12], ['r', 0.88]]) piece('reflector_' + sfx, rearLow, { us: ps(pc - 0.035, pc + 0.035, 6), vs: ps(0.36, 0.46, 2), offset: 0.003 }, M.tail(), 'rear_bumper', { thick: 0.01 });
    const pT = isVan ? 0.1 : (LK.tailW ?? (sedanRear ? 0.26 : 0.2));
    const lampTop = isVan ? 0.62 : 1;
    for (const [sfx, a, b] of [['l', 0, pT], ['r', 1 - pT, 1]]) {
      piece('tail_lamp_' + sfx, rearUp, { us: ps(a + (a ? GAP : 0), b - (a ? 0 : GAP), 16), vs: lerpRows(0.04, lampTop, 6) }, tailMat(DT.tl === 'vertical' ? 'lc' : DT.tl, sfx === 'r'), null, { thick: 0.07, matKey: 'tail' });
      if (isVan) piece('quarter_' + sfx, rearUp, { us: ps(a, b, 6), vs: lerpRows(lampTop, 1, 6) }, M.paint());
    }
    piece('decklid', rearUp, { us: ps(pT + GAP, 1 - pT - GAP, 30), vs: rows(10) }, M.paint(), 'decklid', { thick: 0.006, flange: 0.025, tabs: 'top' });
    parts.decklid.userData.assembly = 'decklid';
    if (LK.tailBar) { const lb2 = new THREE.Mesh(surfGeo(rearUp, { us: ps(pT - 0.01, 1 - pT + 0.01, 30), vs: lerpRows(isVan ? 0.5 : 0.8, isVan ? 0.56 : 0.9, 1), offset: 0.004, outRef }), M.tail()); lb2.material.emissive.setHex(0x8a0d0d); lb2.name = 'lightbar'; parts.decklid.add(lb2); }
    if (sedanRear) piece('decklid', (sv, k) => F.deck(sv, k), { us: ps(-1, 1, 30), vs: rows(8) }, M.paint(), 'decklid');
    // rear plate (decorative, part of the lid)
    const rp = new THREE.Mesh(surfGeo(rearUp, { us: ps(0.43, 0.57, 6), vs: lerpRows(0.12, isVan ? 0.2 : 0.55, 3), offset: 0.004, outRef }), M.plate()); parts.decklid.add(rp);
    if (isVan) piece('back_glass', rearUp, { us: ps(0.2, 0.8, 20), vs: lerpRows(0.55, 0.92, 6), offset: 0.003, mask: (u) => Math.abs(u - 0.5) > 0.012 }, M.glass(), null, { matKey: 'glass' });
    piece('backup_camera', rearUp, { us: ps(0.485, 0.515, 3), vs: lerpRows(isVan ? 0.24 : 0.6, isVan ? 0.28 : 0.68, 2), offset: 0.008 }, M.gloss(), 'decklid', { thick: 0.02 });
    if (F.st === 'coupe') { const sp = new THREE.Mesh(airfoil(s.W - 0.4, 0.16, 0.03), M.paint()); sp.position.set(X(L - 0.2), s.deckY + crownLift(s), 0); addPart('spoiler', sp, 'decklid'); }
    else if (!sedanRear && !s.cargo) { const sp = new THREE.Mesh(airfoil(2 * F.z1(s.roofR) - 0.06, 0.2, 0.03), M.paint()); sp.position.set(X(s.roofR + 0.05), F.topY(s.roofR) + 0.04, 0); sp.rotation.z = -0.12; addPart('spoiler', sp, 'decklid'); }
  } else {
    // pickup: bed, tailgate, step bumper, vertical tail lamps
    const bz = W2 - 0.11;
    // painted inner bed walls with stamped vertical ribs (one merged mesh per side)
    for (const sg of [-1, 1]) {
      const wl = [boxGeo(X(s.bedStart + 0.05), X(L - 0.24), s.gc + 0.5, s.belt + 0.03, sg < 0 ? -bz : bz - 0.02, sg < 0 ? -bz + 0.02 : bz)];
      const x0 = s.bedStart + 0.16, x1 = L - 0.34, nr = Math.max(4, Math.round((x1 - x0) / 0.3));
      for (let k = 0; k <= nr; k++) { const dd = lerp(x0, x1, k / nr); const zi = sg * (bz - 0.02); wl.push(boxGeo(X(dd - 0.025), X(dd + 0.025), s.gc + 0.53, s.belt - 0.04, zi - (sg > 0 ? 0.018 : 0), zi + (sg < 0 ? 0.018 : 0))); }
      deco('bedwall', new THREE.Mesh(mergeGeos(wl.map((g) => g.index ? g.toNonIndexed() : g)), M.paint()));
    }
    const liner = () => { const m = M.trim(); m.color.setHex(0x1c1e21); m.roughness = 0.95; return m; };
    const bf = new THREE.Group(); const nR = 13; for (let k = 0; k < nR; k++) { const zz = -bz + 0.08 + (k * (2 * bz - 0.16)) / (nR - 1); const rib = new THREE.Mesh(roundBox(L - 0.25 - s.bedStart - 0.08, 0.026, 0.045, 0.01), liner()); rib.rotation.y = 0; rib.position.set(X((s.bedStart + 0.06 + L - 0.25) / 2), s.gc + 0.508, zz); bf.add(rib); }
    bf.add(new THREE.Mesh(boxGeo(X(s.bedStart + 0.05), X(L - 0.24), s.gc + 0.48, s.gc + 0.5, -bz, bz), liner()));
    for (const sg of [-1, 1]) for (const dd of [s.bedStart + 0.12, L - 0.4]) { const hk = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 14), M.chrome()); hk.position.set(X(dd), s.belt - 0.08, sg * (bz - 0.025)); bf.add(hk); }
    addPart('bed_floor', bf);
    addPart('bed_front', new THREE.Mesh(boxGeo(X(s.bedStart), X(s.bedStart + 0.05), s.gc + 0.5, s.belt + 0.035, -bz, bz), M.paint()));
    deco('cab_back', new THREE.Mesh(boxGeo(X(s.cabBack - 0.01), X(s.cabBack + 0.03), yb, s.belt + 0.03, -F.zS(s.cabBack) + 0.01, F.zS(s.cabBack) - 0.01), M.paint()));
    const tg = (zv, v) => new THREE.Vector3(X(L - 0.2 - 0.012 * (1 - zv * zv)), lerp(s.gc + 0.42, s.belt + 0.035, v), zv * (W2 - 0.12));
    piece('decklid', tg, { us: ps(-1, 1, 24), vs: rows(8) }, M.paint(), 'decklid', { thick: 0.04, flange: 0.04 });
    parts.decklid.userData.assembly = 'decklid';
    addPart('tailgate_handle', new THREE.Mesh(boxGeo(X(L - 0.206), X(L - 0.19), s.belt - 0.1, s.belt - 0.03, -0.12, 0.12), M.gloss()));
    { // tailgate: black top cap, a pressed horizontal panel line and a generic oval emblem
      const cap = new THREE.Mesh(boxGeo(X(L - 0.235), X(L - 0.19), s.belt + 0.035, s.belt + 0.055, -(W2 - 0.12), W2 - 0.12), M.black()); parts.decklid.add(cap);
      for (const yy of [s.belt - 0.15, s.gc + 0.62]) { const ln = new THREE.Mesh(boxGeo(X(L - 0.2125), X(L - 0.2085), yy - 0.004, yy + 0.004, -(W2 - 0.2), W2 - 0.2), M.paint()); parts.decklid.add(ln); }
      const em = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 32), M.chrome()); em.scale.set(1.5, 1, 0.75); em.rotation.z = Math.PI / 2; em.position.set(X(L - 0.204), s.belt - 0.24, 0); parts.decklid.add(em);
    }
    for (const [sfx, sg] of sides) { const z = sg * (W2 - 0.06); const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.1, 1, 1, 1), tailMat('vertical', sg > 0)); tl.position.set(X(L - 0.235), s.belt - 0.21, z); addPart('tail_lamp_' + sfx, tl); }
    const sb = new THREE.Mesh(roundBox(0.2, 0.26, s.W - 0.04, 0.04), M.chrome()); sb.position.set(X(L - 0.12), s.gc + 0.29, 0); addPart('rbumper_cover', sb, 'rear_bumper');
    const step = new THREE.Mesh(boxGeo(X(L - 0.05), X(L - 0.2), s.gc + 0.42, s.gc + 0.43, -0.3, 0.3), M.black()); parts.rbumper_cover.add(step);
    for (const [sfx, sg] of sides) { const r = new THREE.Mesh(boxGeo(X(L - 0.021), X(L - 0.012), s.gc + 0.25, s.gc + 0.3, sg * (W2 - 0.2) - 0.06, sg * (W2 - 0.2) + 0.06), M.tail()); addPart('reflector_' + sfx, r, 'rear_bumper'); }
  }

  // ---- mirrors: painted cap on a black stalk, dark mirror glass at the back, amber repeater ----
  for (const [sfx, sg] of sides) {
    const tow = DT.mirror === 'tow' || DT.mirror === 'towblack';
    const d0 = s.doors[0][0] + (tow ? 0.2 : 0.16), y0 = s.belt + (tow ? 0.12 : 0.09);
    const grp = new THREE.Group();
    const hw = tow ? 0.13 : 0.1, hh = tow ? 0.21 : 0.125, hd = tow ? 0.27 : 0.23, reach = tow ? 0.11 : 0.085;
    const cap = new THREE.Mesh(roundedBoxGeo(hw, hh, hd, 0.035, (x, y, z) => { // taper the front, rounder outer end
      const fx = (x / hw + 0.5); const k = 1 - 0.28 * fx; return [x, y * k, z * (1 - 0.1 * fx)]; }), DT.mirror === 'towblack' ? M.black() : M.paint());
    cap.position.set(0.0, hh * 0.25, sg * (reach + hd / 2)); grp.add(cap);
    const mir = new THREE.Mesh(roundedBoxGeo(0.006, hh * 0.84, hd * 0.9, 0.02), new THREE.MeshStandardMaterial({ color: 0x8a96a3, metalness: 1, roughness: 0.03, side: THREE.DoubleSide }));
    mir.position.set(-hw / 2 - 0.001, hh * 0.25, sg * (reach + hd / 2)); mir.name = 'mirror_glass'; grp.add(mir);
    const rim = new THREE.Mesh(roundedBoxGeo(0.01, hh * 0.92, hd * 0.96, 0.024), M.black()); rim.position.set(-hw / 2 + 0.002, hh * 0.25, sg * (reach + hd / 2)); grp.add(rim);
    const am = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, hd * 0.55), new THREE.MeshStandardMaterial({ color: 0xffa630, emissive: 0xb35a00, emissiveIntensity: 0.6, roughness: 0.3 }));
    am.position.set(hw * 0.32, hh * 0.25 - hh * 0.42, sg * (reach + hd * 0.62)); grp.add(am);
    const stalk = new THREE.Mesh(roundedBoxGeo(0.07, 0.035, reach + 0.03, 0.012), M.black()); stalk.position.set(0.0, -0.01, sg * (reach / 2)); grp.add(stalk);
    if (tow) { const s2 = stalk.clone(); s2.position.y = hh * 0.55; grp.add(s2); }
    const sail = new THREE.Mesh(roundedBoxGeo(0.14, 0.07, 0.02, 0.008), M.black()); sail.position.set(0.02, -0.02, 0); grp.add(sail);
    grp.position.set(X(d0), y0, sg * F.zS(d0) * 0.985);
    addPart('mirror_' + sfx, grp, sg < 0 ? 'door_lf' : 'door_rf');
  }

  // ---- wheels: multi-spoke alloy, tyre with tread + sidewall, vented disc, caliper, lug nuts ----
  const tw = isPickup || isVan ? 0.27 : 0.235, rr = s.wr * (isPickup ? 0.62 : LK.lowProfile ? 0.71 : 0.66);
  const WG = wheelGeos(s.wr, tw, rr);
  const tyre = tyreGeo(s.wr, rr * 1.0, tw), spokes = spokeGeo(DT.wheel, rr, tw / 2 - 0.042), cal = caliperGeo(rr), lugs = lugGeo(rr, isPickup || isVan ? 6 : 5);
  cal.translate(0, -0.035, 0); cal.rotateY(-0.5);
  lugs.translate(0, tw / 2 - 0.02, 0);
  const calMat = DT.caliper === 'red' ? M.caliper() : new THREE.MeshStandardMaterial({ color: 0x55595f, metalness: 0.6, roughness: 0.4 });
  const twoTone = DT.finish === 'twotone'; // dark gray barrel/dish with machined silver spoke faces
  for (const [pos, d] of [['f', fa], ['r', ra]]) for (const [sfx, sg] of sides) {
    const z = sg * (W2 - 0.15);
    const tire = new THREE.Mesh(tyre, M.tire(DT.tread || 'road')); tire.rotation.x = Math.PI / 2; tire.position.set(X(d), s.wr, z); addPart(`tire_${sfx}${pos}`, tire);
    const wg = new THREE.Group();
    const fin = M.wheelFinish(twoTone ? 'darkgray' : DT.finish);
    const rim = new THREE.Mesh(WG.rim, fin); const sp = new THREE.Mesh(spokes, twoTone ? M.wheelFinish('machined') : fin); const hub = new THREE.Mesh(WG.hub, M.wheelFinish(twoTone ? 'darkgray' : DT.finish === 'dark' || DT.finish === 'gunmetal' ? DT.finish : 'silver'));
    const cc = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.11, rr * 0.11, 0.008, 24), M.chrome()); cc.position.y = tw / 2 - 0.006;
    const lg = new THREE.Mesh(lugs, M.chrome());
    const disc = new THREE.Mesh(WG.disc, M.brake()); disc.position.y = 0.0;
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.36, rr * 0.36, 0.05, 24), M.brake()); hat.position.y = 0.03;
    const cl = new THREE.Mesh(cal, calMat); cl.rotation.y = pos === 'f' ? 0 : Math.PI;
    wg.add(rim, sp, hub, cc, lg, disc, hat, cl);
    wg.rotation.x = sg < 0 ? Math.PI / 2 : -Math.PI / 2; wg.position.set(X(d), s.wr, z);
    addPart(`wheel_${sfx}${pos}`, wg);
  }

  // ---- cabin seen through the glass (decoration, never pickable) ----
  if (!s.cargo) g.add(buildCabin(s, F));
  g.userData.fns = F;
  if (s.compact !== false) compactParts(g);
  return g;
}

// ---------- draw-call savings ----------
// Static detail inside one tappable part (lugs, spokes, sensors, ribs, trim strips...) is merged into one mesh per
// material look, so a part costs a handful of draw calls instead of dozens. Parts stay separate objects with the
// same ids, and every merged mesh keeps its own material instance, so highlight/X-ray/isolate/explode still work.
// Meshes isolate rebuilds from a recipe, and the cabin (hidden in X-ray), are left as they are.
function matKey(m) {
  const h = (c) => (c ? c.getHex() : -1);
  return [m.type, h(m.color), h(m.emissive), m.emissiveIntensity, m.metalness, m.roughness, m.clearcoat, m.opacity, m.transparent, m.side,
    m.map && m.map.uuid, m.emissiveMap && m.emissiveMap.uuid, m.bumpMap && m.bumpMap.uuid, m.roughnessMap && m.roughnessMap.uuid, m.normalMap && m.normalMap.uuid, m.alphaMap && m.alphaMap.uuid, m.flatShading].join('|');
}
function needsUV(m) { return !!(m.map || m.emissiveMap || m.bumpMap || m.roughnessMap || m.normalMap || m.alphaMap); }
function mergeInto(part, list) {
  const inv = new THREE.Matrix4(), rel = new THREE.Matrix4(), nm = new THREE.Matrix3();
  {
    inv.copy(part.matrixWorld).invert();
    const uv = needsUV(list[0].material);
    let nv = 0, ni = 0;
    for (const c of list) { nv += c.geometry.attributes.position.count; ni += c.geometry.index ? c.geometry.index.count : c.geometry.attributes.position.count; }
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = uv ? new Float32Array(nv * 2) : null, I = new Uint32Array(ni);
    let vo = 0, io = 0; const v = new THREE.Vector3();
    for (const c of list) {
      const geo = c.geometry; if (!geo.attributes.normal) geo.computeVertexNormals();
      rel.multiplyMatrices(inv, c.matrixWorld); nm.getNormalMatrix(rel);
      const pa = geo.attributes.position, na = geo.attributes.normal, ua = geo.attributes.uv;
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(rel); P.set([v.x, v.y, v.z], (vo + i) * 3);
        v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); N.set([v.x, v.y, v.z], (vo + i) * 3);
        if (U && ua) { U[(vo + i) * 2] = ua.getX(i); U[(vo + i) * 2 + 1] = ua.getY(i); }
      }
      const flip = rel.determinant() < 0;
      if (geo.index) { const ix = geo.index.array; for (let i = 0; i < ix.length; i += 3) { I[io++] = ix[i] + vo; I[io++] = ix[flip ? i + 2 : i + 1] + vo; I[io++] = ix[flip ? i + 1 : i + 2] + vo; } }
      else for (let i = 0; i < pa.count; i += 3) { I[io++] = vo + i; I[io++] = vo + (flip ? i + 2 : i + 1); I[io++] = vo + (flip ? i + 1 : i + 2); }
      vo += pa.count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); if (U) g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    g.setIndex(new THREE.BufferAttribute(I, 1)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, list[0].material); m.name = [...new Set(list.map((c) => c.name).filter(Boolean))].slice(0, 4).join('+') || 'detail';
    m.castShadow = list.some((c) => c.castShadow); m.receiveShadow = list.some((c) => c.receiveShadow); m.renderOrder = list[0].renderOrder;
    for (const c of list) { c.parent.remove(c); c.geometry.dispose(); }
    part.add(m);
  }
  return part.children[part.children.length - 1];
}
export function compactParts(root) {
  root.updateMatrixWorld(true);
  const groups = [];
  for (const part of root.children) {
    if (!part.userData.part || part.userData.cabin) continue;
    const buckets = new Map();
    part.traverse((c) => {
      if (!c.isMesh || c.userData.recipe !== undefined || c.userData.cabin || c.userData.keep || c.isInstancedMesh) return;
      const k = matKey(c.material); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(c);
    });
    for (const list of buckets.values()) if (list.length > 1) groups.push([part, list]);
  }
  for (const [part, list] of groups) mergeInto(part, list);
  // non-pickable decoration hung straight on the root (bed walls, trim, wells...): one mesh per material look
  const rb = new Map();
  for (const c of [...root.children]) { if (!c.isMesh || c.userData.part || c.userData.cabin || c.userData.keep) continue; const k = matKey(c.material); if (!rb.has(k)) rb.set(k, []); rb.get(k).push(c); }
  for (const list of rb.values()) if (list.length > 1) mergeInto(root, list);
  // small detail (and the cabin) skips the blurred floor reflection pass: layer 2 is drawn by the main camera only
  root.traverse((c) => {
    if (!c.isMesh) return;
    if (!c.geometry.boundingSphere) c.geometry.computeBoundingSphere();
    if (c.userData.cabin || c.geometry.boundingSphere.radius < 0.14) c.layers.set(2);
  });
  // drop now-empty helper groups
  const empty = []; root.traverse((o) => { if (o !== root && !o.isMesh && !o.userData.part && o.children.length === 0) empty.push(o); });
  for (const o of empty) o.parent && o.parent.remove(o);
  return root;
}
const crownLift = (s) => 0.07;
function lerpRows(a, b, n) { return Array.from({ length: n + 1 }, (_, j) => lerp(a, b, j / n)); }
// rounded box centred on the origin; warp(x,y,z) -> [x,y,z] can taper it
export function roundedBoxGeo(w, h, d, r, warp) {
  const g = new THREE.BoxGeometry(w, h, d, 6, 6, 6); const p = g.attributes.position; r = Math.min(r, w / 2, h / 2, d / 2);
  const ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r; const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); c.set(clamp(v.x, -ix, ix), clamp(v.y, -iy, iy), clamp(v.z, -iz, iz)); v.sub(c).normalize().multiplyScalar(r).add(c); let o = [v.x, v.y, v.z]; if (warp) o = warp(...o); p.setXYZ(i, o[0], o[1], o[2]); }
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); const m = mergeVerts(g); m.computeVertexNormals(); return m;
}
function mergeVerts(g) { // weld duplicated box-face vertices so rounded corners shade smoothly
  const p = g.attributes.position, map = new Map(), pos = [], remap = []; for (let i = 0; i < p.count; i++) { const k = `${p.getX(i).toFixed(5)},${p.getY(i).toFixed(5)},${p.getZ(i).toFixed(5)}`; let j = map.get(k); if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); } remap.push(j); }
  const idx = (g.index ? Array.from(g.index.array) : [...Array(p.count).keys()]).map((i) => remap[i]);
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setIndex(idx); g.dispose(); return o;
}
export function boxGeo(x0, x1, y0, y1, z0, z1) {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g;
}
export function roundBox(w, h, d, r) {
  const sh = new THREE.Shape(); const x = -w / 2, y = -h / 2;
  sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r); sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h); sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r); sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d - 2 * r * 0.5, bevelEnabled: true, bevelSize: r * 0.5, bevelThickness: r * 0.5, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(d - r) / 2); g.computeVertexNormals(); return g;
}
export function airfoil(span, chord, t) {
  const sh = new THREE.Shape(); sh.moveTo(chord / 2, 0); sh.quadraticCurveTo(0, t * 1.2, -chord / 2, t * 0.5); sh.lineTo(-chord / 2, 0); sh.quadraticCurveTo(0, -t * 0.3, chord / 2, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: span, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -span / 2); g.computeVertexNormals(); return g;
}
// alloy wheel + tyre geometries (axis = y)
export function wheelGeos(wr, tw = 0.235, rr = wr * 0.66) {
  const prof = [];
  const n = 14;
  // tyre cross-section (rounded), revolved
  prof.push(new THREE.Vector2(rr * 0.98, -tw / 2 + 0.01));
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (Math.PI * i) / n; const rx = wr - 0.035 + Math.cos(a) * 0.035, y = Math.sin(a) * (tw / 2 - 0.004); prof.push(new THREE.Vector2(i === 0 || i === n ? lerp(rr, wr, 0.55) : rx, y)); }
  prof.splice(1, 0, new THREE.Vector2(lerp(rr, wr, 0.55), -tw / 2 + 0.002));
  prof.push(new THREE.Vector2(lerp(rr, wr, 0.55), tw / 2 - 0.002), new THREE.Vector2(rr * 0.98, tw / 2 - 0.01));
  const tire = new THREE.LatheGeometry(prof, 48);
  // rim barrel + lip
  const rp = [new THREE.Vector2(rr * 0.9, -tw / 2 + 0.02), new THREE.Vector2(rr, -tw / 2 + 0.01), new THREE.Vector2(rr * 1.02, -tw / 2 + 0.004), new THREE.Vector2(rr * 0.97, -tw / 2 + 0.03), new THREE.Vector2(rr * 0.95, tw / 2 - 0.03), new THREE.Vector2(rr * 1.02, tw / 2 - 0.004), new THREE.Vector2(rr * 0.96, tw / 2 + 0.003)];
  const rim = new THREE.LatheGeometry(rp, 48);
  // 5 split spokes
  const sk = [];
  for (let k = 0; k < 10; k++) {
    const a = Math.floor(k / 2) * (Math.PI * 2 / 5) + (k % 2 ? 0.13 : -0.13);
    const sh = new THREE.Shape(); sh.moveTo(rr * 0.22, -0.014); sh.lineTo(rr * 0.97, -0.026); sh.lineTo(rr * 0.97, 0.026); sh.lineTo(rr * 0.22, 0.014);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.022, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.005, bevelSegments: 2 });
    g.rotateX(-Math.PI / 2); g.rotateY(a); g.translate(0, tw / 2 - 0.045, 0);
    sk.push(g);
  }
  const spokes = mergeGeos(sk);
  const hub = new THREE.CylinderGeometry(rr * 0.24, rr * 0.27, 0.05, 24); hub.translate(0, tw / 2 - 0.035, 0);
  const disc = new THREE.CylinderGeometry(rr * 0.82, rr * 0.82, 0.025, 32);
  const caliper = new THREE.BoxGeometry(0.09, 0.06, 0.16);
  return { tire, rim, spokes, hub, disc, caliper };
}
export function mergeGeos(list) {
  const pos = [], idx = []; let off = 0;
  for (const g of list) { const p = g.attributes.position.array; for (let i = 0; i < p.length; i++) pos.push(p[i]); const ix = g.index ? g.index.array : [...Array(p.length / 3).keys()]; for (const i of ix) idx.push(i + off); off += p.length / 3; g.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
