// R&R Auto Express - part-level geometry: isolate (detailed shell with thickness, openings, tabs),
// exploded front/rear bumper assemblies, and X-ray inner structure. All in car coordinates (x = front).
import * as THREE from './vendor/three.module.min.js';
import { bodyFns, surfGeo, frameAt, rrect, ellipse, lerp, clamp, roundBox, boxGeo, mats as bodyMats } from './carbody.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = new THREE.Vector3(0, 1, 0);
const ps = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => lerp(a, b, i / n));
// distinct colours for exploded sub-parts
export const EXPLODE_COLORS = [0x5b8def, 0x46b3a5, 0xd6a24a, 0x9b7fd6, 0xe0796b, 0x7fbf5a, 0x4fb7e0, 0xc98bb5, 0xb0b8c2, 0xe6c35c, 0x6f87a8, 0xd88a3d, 0x8fd1c2, 0xa7a3e8, 0xcf6f8f, 0x9ccf6a];
const solid = (hex, o = {}) => new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.42, metalness: 0.1, clearcoat: 0.4, side: THREE.DoubleSide, ...o });

// mounting tab: rounded plate with a bolt hole, in its local XY plane, extends along +Y from y=0
function tabGeo(w = 0.05, h = 0.04, t = 0.004, hole = 0.0075) {
  const sh = new THREE.Shape(); const r = Math.min(w, h) * 0.4;
  sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, h - r); sh.quadraticCurveTo(w / 2, h, w / 2 - r, h); sh.lineTo(-w / 2 + r, h); sh.quadraticCurveTo(-w / 2, h, -w / 2, h - r); sh.lineTo(-w / 2, 0);
  const hp = new THREE.Path(); hp.absarc(0, h * 0.58, hole, 0, Math.PI * 2, true); sh.holes.push(hp);
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 12 }); g.translate(0, 0, -t / 2); return g;
}
function placeTab(fn, u, v, outRef, depth, mat, alongU) {
  const f = frameAt(fn, u, v, outRef);
  const t = alongU ? f.tu : f.tv; // edge tangent
  const m = new THREE.Mesh(tabGeo(), mat);
  // local Y -> -n (tab hangs inward from the flange), local X -> edge tangent
  const y = f.n.clone().negate(), x = t.clone().sub(y.clone().multiplyScalar(t.dot(y))).normalize(), z = new THREE.Vector3().crossVectors(x, y);
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  m.position.copy(f.p).addScaledVector(f.n, -depth);
  return m;
}

// ---------- isolate ----------
// Rebuild a part at higher resolution with thickness, flanges, openings and mounting tabs.
export function detailPart(partObj, s) {
  const out = new THREE.Group(); out.name = 'iso';
  const recipes = partObj.userData.detail || [];
  const F = s ? bodyFns(s) : null;
  const own = []; partObj.traverse((c) => { if (c.isMesh) own.push(c); });
  const up = (arr, k) => { if (!arr) return arr; const res = []; for (let j = 0; j < arr.length - 1; j++) for (let q = 0; q < k; q++) res.push(lerp(arr[j], arr[j + 1], q / k)); res.push(arr[arr.length - 1]); return res; };
  for (const c of own) {
    const r = c.userData.recipe !== undefined ? recipes[c.userData.recipe] : null;
    if (!r) { out.add(cloneMesh(c, partObj)); continue; }
    const o = { ...r.o };
    o.us = up(o.us, 2); o.vs = up(o.vs, 2);
    const holes = [...(o.holes || [])];
    if (r.holes === 'handle' && F) { const hd = o.us[o.us.length - 1] - 0.22 + 0.004; const y0 = F.yb + 0.006, y1 = F.yS(hd); const vh = (s.belt - 0.1 - y0) / (y1 - y0); holes.push(rrect(hd, vh, 0.085, 0.045 / (y1 - y0), 0.5)); }
    o.holes = holes; o.thick = r.thick ?? 0.006; o.flange = r.flange ?? Math.max(o.thick, 0.012);
    const mat = c.material.clone();
    if (mat.transparent && mat.opacity < 0.5) mat.opacity = 0.55;
    out.add(new THREE.Mesh(surfGeo(r.fn, o), mat));
    const lastU = o.us[o.us.length - 1], firstU = o.us[0], lastV = o.vs[o.vs.length - 1], firstV = o.vs[0];
    const tm = mat.clone();
    if (r.tabs === 'top') for (const f of [0.12, 0.35, 0.65, 0.88]) out.add(placeTab(r.fn, lerp(firstU, lastU, f), lastV - (lastV - firstV) * 0.02, o.outRef, o.flange, tm, true));
    if (r.tabs === 'rear') for (const f of [0.18, 0.82]) out.add(placeTab(r.fn, lerp(firstU, lastU, f), lastV - (lastV - firstV) * 0.02, o.outRef, o.flange, tm, true));
    if (r.tabs === 'hinge') for (const f of [0.3, 0.7]) out.add(placeTab(r.fn, firstU + 0.01, lerp(firstV, lastV, f), o.outRef, o.flange, tm, false));
  }
  return out;
}
function cloneMesh(c, root) {
  const m = new THREE.Mesh(c.geometry.clone(), c.material.clone());
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.parent ? root.parent.matrixWorld : new THREE.Matrix4()).invert();
  m.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
  return m;
}

// ---------- exploded assemblies ----------
// Returns { group, items:[{mesh, obj}] } ; obj.userData.part = mesh id ; offsets already applied.
export function buildVehicleExploded(s, ext, int) {
  const g = new THREE.Group();
  g.name = 'exploded_vehicle';
  const clone = (source) => {
    const obj = source.clone(true);
    obj.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      node.geometry = node.geometry.clone();
      const multiple = Array.isArray(node.material);
      const mats = multiple ? node.material : [node.material];
      const copies = mats.map((mat) => {
        const copy = mat.clone();
        if (copy.map) copy.map = copy.map.clone();
        return copy;
      });
      node.material = multiple ? copies : copies[0];
    });
    return obj;
  };
  const offsetFor = (name) => {
    const side = /(?:^|_)(l|lf|lr)(?:_|$)/.exec(name)?.[1];
    const z = side ? -1 : 1;
    if (name === 'hood') return new THREE.Vector3(0, 0.85, 0);
    if (/^(windshield|back_glass)$/.test(name)) return new THREE.Vector3(0, 1.15, 0);
    if (name === 'roof') return new THREE.Vector3(0, 1.5, 0);
    if (/^door_/.test(name)) return new THREE.Vector3(0, 0.24, z * 0.72);
    if (/^(fender|quarter|mirror)_/.test(name)) return new THREE.Vector3(0, 0.28, z * 0.48);
    if (/^fbumper_/.test(name) || /^(grille|grille_insert|grille_emblem|headlamp_|fog_lamp_)/.test(name)) return new THREE.Vector3(0.82, 0.12, 0);
    if (/^rbumper_/.test(name) || /^tail_lamp_/.test(name)) return new THREE.Vector3(-0.82, 0.12, 0);
    if (/^(decklid|liftgate|tailgate)$/.test(name)) return new THREE.Vector3(-0.1, 0.88, 0);
    if (/^(tire|wheel)_/.test(name)) return new THREE.Vector3(0, -0.42, z * 0.55);
    return null;
  };
  for (const child of ext.children) {
    const name = child.userData?.part;
    const copy = clone(child);
    const offset = name && offsetFor(name);
    if (offset) copy.position.add(offset);
    g.add(copy);
  }
  for (const child of int?.children || []) {
    const copy = clone(child);
    copy.position.y -= 0.82;
    g.add(copy);
  }

  const metal = new THREE.MeshStandardMaterial({ color: 0x92999f, metalness: 0.82, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24282c, metalness: 0.35, roughness: 0.46 });
  const part = (name, obj, position, assembly = name) => {
    obj.name = name;
    obj.userData.part = name;
    obj.userData.assembly = assembly;
    obj.position.copy(position);
    g.add(obj);
  };

  const engine = new THREE.Group();
  engine.add(new THREE.Mesh(roundBox(0.68, 0.43, 0.56, 0.07), metal));
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(roundBox(0.52, 0.2, 0.13, 0.035), dark);
    head.position.set(-0.04, 0.31, side * 0.2);
    head.rotation.z = side * 0.18;
    engine.add(head);
  }
  const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 24), dark);
  pulley.rotation.x = Math.PI / 2;
  pulley.position.x = 0.34;
  engine.add(pulley);
  part('engine', engine, new THREE.Vector3(s.L / 2 - s.fo - 0.08, -0.82, 0));

  const radiator = new THREE.Group();
  radiator.add(new THREE.Mesh(roundBox(0.1, 0.42, 0.82, 0.025), metal));
  const fanMat = new THREE.MeshStandardMaterial({ color: 0x33383d, metalness: 0.35, roughness: 0.45 });
  for (const side of [-1, 1]) {
    const fan = new THREE.Group();
    fan.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.025, 20), fanMat));
    for (let i = 0; i < 5; i++) {
      const blade = new THREE.Mesh(roundBox(0.06, 0.16, 0.015, 0.006), fanMat);
      blade.position.x = 0.07;
      blade.rotation.z = i * Math.PI * 0.4;
      fan.add(blade);
    }
    fan.position.z = side * 0.23;
    radiator.add(fan);
  }
  part('radiator', radiator, new THREE.Vector3(s.L / 2 - s.fo + 0.16, -0.82, 0));

  const suspension = new THREE.Group();
  const springMat = new THREE.MeshStandardMaterial({ color: 0x4d5359, metalness: 0.78, roughness: 0.32 });
  const caliperMat = new THREE.MeshStandardMaterial({ color: 0xc83232, metalness: 0.28, roughness: 0.4 });
  for (const x of [s.L / 2 - s.fo, s.L / 2 - s.fo - s.wb]) {
    for (const side of [-1, 1]) {
      const spring = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.016, 8, 20), springMat);
      spring.position.set(x, -0.28, side * (s.W / 2 + 0.08));
      spring.rotation.y = Math.PI / 2;
      suspension.add(spring);
      const caliper = new THREE.Mesh(roundBox(0.08, 0.17, 0.1, 0.025), caliperMat);
      caliper.position.set(x, -0.3, side * (s.W / 2 + 0.12));
      suspension.add(caliper);
    }
  }
  part('suspension', suspension, new THREE.Vector3(0, -0.38, 0));

  g.traverse((node) => { if (node.isMesh) node.castShadow = true; });
  return g;
}

export function buildExploded(assembly, s, have) {
  const F = bodyFns(s);
  const front = assembly === 'front_bumper';
  const g = new THREE.Group(); g.name = 'exploded';
  const outRef = F.outRef;
  let ci = 0;
  const add = (mesh, obj, dx, dz = 0, dy = 0) => {
    if (have && !have(mesh)) return null;
    const wrap = new THREE.Group(); wrap.name = mesh; wrap.userData.part = mesh; wrap.add(obj);
    const col = EXPLODE_COLORS[ci++ % EXPLODE_COLORS.length];
    obj.traverse((c) => { if (c.isMesh && !c.userData.keepMat) c.material = solid(col); });
    wrap.userData.offset = new THREE.Vector3((front ? 1 : -1) * dx, dy, dz);
    wrap.position.copy(wrap.userData.offset);
    g.add(wrap); return wrap;
  };
  const mesh = (geo) => new THREE.Mesh(geo);
  if (F.isPickup && !front) return pickupRear(F, s, add, g);
  if (front) {
    const yBT = s.hoodF - (F.isPickup ? 0.24 : F.isVan ? 0.2 : F.st === 'suv' ? 0.17 : 0.14);
    const hB = (p) => F.noseH(p, yBT);
    const nb = (p, h) => F.nose(p, h * hB(p));
    const nu = (p, h) => F.nose(p, lerp(hB(p), 1, h));
    const pL = F.isPickup || F.isVan ? 0.2 : F.st === 'suv' ? 0.24 : 0.27;
    const lowHole = rrect(0.5, 0.42, 0.2, 0.17, 0.4), fogL = ellipse(0.17, 0.42, 0.045, 0.14), fogR = ellipse(0.83, 0.42, 0.045, 0.14);
    const gHole = rrect(0.5, 0.5, 0.5 - pL - 0.02, 0.36, 0.35);
    // cover
    const cov = new THREE.Group();
    cov.add(mesh(surfGeo(nb, { us: ps(0, 1, 90), vs: ps(0, 1, 22), holes: [lowHole, fogL, fogR, rrect(0.5, 0.8, 0.05, 0.06, 0.5)], thick: 0.008, flange: 0.035, outRef })));
    for (const f of [0.08, 0.3, 0.7, 0.92]) cov.add(placeTab(nb, f, 0.985, outRef, 0.035, null, true));
    add('fbumper_cover', cov, 0.75);
    add('grille', mesh(surfGeo(nu, { us: ps(pL, 1 - pL, 40), vs: ps(0, 1, 14), holes: [gHole], thick: 0.012, flange: 0.03, outRef })), 0.95, 0, 0.12);
    add('grille_insert', mesh(surfGeo(nu, { us: ps(pL, 1 - pL, 40), vs: ps(0, 1, 14), mask: (u, v) => gHole(u, v) < 0.01, offset: -0.02, thick: 0.01, outRef })), 0.62, 0, 0.12);
    { const f = frameAt(nu, 0.5, 0.52, outRef); const em = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.014, 40)); em.scale.set(1.35, 1, 0.75); em.position.copy(f.p).addScaledVector(f.n, 0.01); em.quaternion.setFromUnitVectors(UP, f.n); em.rotateY(Math.PI / 2); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 8, 40)); ring.position.copy(em.position).addScaledVector(f.n, 0.008); ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), f.n); ring.scale.set(1, 0.72, 1); const e = new THREE.Group(); e.add(em, ring); add('grille_emblem', e, 1.2, 0, 0.12); }
    // grille carrier: plastic frame behind the grille
    { const d0 = F.dN + 0.16, zc = F.halfW(d0) * (0.5 - pL) * 2.1, y0 = yBT - 0.05, y1 = s.hoodF - 0.02;
      const sh = new THREE.Shape(); sh.moveTo(-zc, y0); sh.lineTo(zc, y0); sh.lineTo(zc, y1); sh.lineTo(-zc, y1); sh.lineTo(-zc, y0);
      const hp = new THREE.Path(); const m = 0.04; hp.moveTo(-zc + m, y0 + m); hp.lineTo(-zc + m, y1 - m); hp.lineTo(zc - m, y1 - m); hp.lineTo(zc - m, y0 + m); hp.lineTo(-zc + m, y0 + m); sh.holes.push(hp);
      for (const zz of [-zc * 0.75, -zc * 0.25, zc * 0.25, zc * 0.75]) { const h = new THREE.Path(); h.absarc(zz, y1 - 0.02, 0.006, 0, Math.PI * 2, true); sh.holes.push(h); }
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 }); geo.rotateY(Math.PI / 2); geo.translate(F.X(d0) - 0.035, 0, 0);
      const grp = new THREE.Group(); grp.add(mesh(geo));
      for (const sg of [-1, 1]) { const ear = mesh(tabGeo(0.06, 0.07, 0.006, 0.009)); ear.rotation.y = Math.PI / 2; ear.position.set(F.X(d0) - 0.02, y1 - 0.06, sg * (zc + 0.03)); ear.rotation.x = sg * Math.PI / 2; grp.add(ear); }
      add('grille_carrier', grp, 0.35, 0, 0.12); }
    add('grille_lower', mesh(surfGeo(nb, { us: ps(0.29, 0.71, 34), vs: ps(0.22, 0.62, 10), mask: (u, v) => lowHole(u, v) < 0.004, offset: -0.018, thick: 0.01, outRef })), 0.55, 0, -0.08);
    for (const [sfx, pc, fh] of [['l', 0.17, fogL], ['r', 0.83, fogR]]) {
      const sg = sfx === 'l' ? -1 : 1;
      add('fog_bezel_' + sfx, mesh(surfGeo(nb, { us: ps(pc - 0.08, pc + 0.08, 18), vs: ps(0.18, 0.66, 12), mask: (u, v) => ellipse(pc, 0.42, 0.065, 0.22)(u, v) < 0, holes: [fh], offset: 0.003, thick: 0.008, flange: 0.02, outRef })), 1.0, sg * 0.18, -0.12);
      const fl = new THREE.Group(); const f = frameAt(nb, pc, 0.42, outRef);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.07, 24)); body.position.copy(f.p).addScaledVector(f.n, -0.04); body.quaternion.setFromUnitVectors(UP, f.n);
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.046, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)); lens.position.copy(f.p).addScaledVector(f.n, -0.006); lens.quaternion.setFromUnitVectors(UP, f.n); lens.scale.set(1, 0.25, 1);
      fl.add(body, lens); add('fog_lamp_' + sfx, fl, 0.45, sg * 0.18, -0.12);
    }
    // side brackets: curved plastic guides where the cover meets the fender
    for (const sfx of ['l', 'r']) {
      const sg = sfx === 'l' ? -1 : 1; const d0 = F.dN + 0.04, d1 = F.dN + 0.32;
      const fn = (d, v) => { const y = lerp(yBT - 0.16, yBT + 0.02, v); return V3(F.X(d), y, sg * (F.sideZ(d, y) - 0.012)); };
      const grp = new THREE.Group(); grp.add(mesh(surfGeo(fn, { us: ps(d0, d1, 12), vs: ps(0, 1, 6), holes: [ellipse((d0 + d1) / 2, 0.5, 0.06, 0.18), ellipse(d0 + 0.05, 0.5, 0.012, 0.08), ellipse(d1 - 0.05, 0.5, 0.012, 0.08)], thick: 0.006, flange: 0.03, outRef })));
      for (const f of [0.25, 0.75]) grp.add(placeTab(fn, lerp(d0, d1, f), 0.98, outRef, 0.03, null, true));
      add('fbumper_bracket_' + sfx, grp, 0.2, sg * 0.42);
    }
    // energy absorber (foam) + reinforcement beam
    add('fbumper_absorber', mesh(surfGeo(nb, { us: ps(0.1, 0.9, 50), vs: ps(0.3, 0.72, 6), offset: -0.03, thick: 0.08, outRef })), 0.3, 0, -0.02);
    add('fbumper_reinf', beam(F, s, true), 0.0);
    add('tow_hook_cover', mesh(surfGeo(nb, { us: ps(0.715, 0.765, 8), vs: ps(0.64, 0.8, 6), mask: (u, v) => ellipse(0.74, 0.72, 0.022, 0.07)(u, v) < 0, offset: 0.002, thick: 0.012, outRef })), 1.15, 0.12, -0.1);
    add('front_radar', (() => { const f = frameAt(nb, 0.5, 0.42, outRef); const m = new THREE.Mesh(roundBox(0.1, 0.08, 0.04, 0.012)); m.position.copy(f.p).addScaledVector(f.n, -0.06); m.lookAt(m.position.clone().add(f.n)); return m; })(), 0.15, 0, -0.18);
    add('park_sensor_f', sensors(nb, outRef, [0.25, 0.4, 0.6, 0.75], 0.35), 0.55, 0, -0.28);
    add('license_bracket_f', mesh(surfGeo(nb, { us: ps(0.42, 0.58, 12), vs: ps(0.67, 0.93, 6), offset: 0.006, thick: 0.014, holes: [ellipse(0.45, 0.8, 0.006, 0.02), ellipse(0.55, 0.8, 0.006, 0.02)], outRef })), 1.1, 0, -0.05);
  } else {
    const sedanRear = F.sedanRear;
    const rbTop = sedanRear ? s.deckY - 0.24 : F.isVan ? s.gc + 0.5 : s.belt - 0.33;
    const hRB = (p) => F.rearH(p, rbTop);
    const rl = (p, h) => F.rear(p, h * hRB(p));
    const cov = new THREE.Group();
    cov.add(mesh(surfGeo(rl, { us: ps(0, 1, 80), vs: ps(0.22, 1, 18), holes: [ellipse(0.12, 0.41, 0.035, 0.05), ellipse(0.88, 0.41, 0.035, 0.05)], thick: 0.008, flange: 0.035, outRef })));
    for (const f of [0.08, 0.3, 0.7, 0.92]) cov.add(placeTab(rl, f, 0.985, outRef, 0.035, null, true));
    add('rbumper_cover', cov, 0.75);
    add('rbumper_valance', mesh(surfGeo(rl, { us: ps(0.2, 0.8, 40), vs: ps(0, 0.22, 5), offset: 0.002, thick: 0.01, flange: 0.025, holes: [rrect(0.35, 0.1, 0.04, 0.06), rrect(0.65, 0.1, 0.04, 0.06)], outRef })), 0.95, 0, -0.14);
    for (const [sfx, pc] of [['l', 0.12], ['r', 0.88]]) add('reflector_' + sfx, mesh(surfGeo(rl, { us: ps(pc - 0.035, pc + 0.035, 6), vs: ps(0.36, 0.46, 3), offset: 0.003, thick: 0.012, outRef })), 1.05, (sfx === 'l' ? -1 : 1) * 0.12, 0.02);
    for (const sfx of ['l', 'r']) {
      const sg = sfx === 'l' ? -1 : 1; const d1 = s.L - F.dR - 0.04, d0 = d1 - 0.28;
      const fn = (d, v) => { const y = lerp(rbTop - 0.16, rbTop + 0.02, v); return V3(F.X(d), y, sg * (F.sideZ(d, y) - 0.012)); };
      const grp = new THREE.Group(); grp.add(mesh(surfGeo(fn, { us: ps(d0, d1, 12), vs: ps(0, 1, 6), holes: [ellipse((d0 + d1) / 2, 0.5, 0.06, 0.18), ellipse(d0 + 0.05, 0.5, 0.012, 0.08), ellipse(d1 - 0.05, 0.5, 0.012, 0.08)], thick: 0.006, flange: 0.03, outRef })));
      add('rbumper_bracket_' + sfx, grp, 0.2, sg * 0.42);
      const r = new THREE.Mesh(roundBox(0.1, 0.075, 0.035, 0.01)); const f = frameAt(rl, sfx === 'l' ? 0.1 : 0.9, 0.6, outRef); r.position.copy(f.p).addScaledVector(f.n, -0.07); r.lookAt(r.position.clone().add(f.n));
      add('bsm_radar_' + sfx, r, 0.3, sg * 0.25, 0.05);
    }
    add('rbumper_absorber', mesh(surfGeo(rl, { us: ps(0.12, 0.88, 46), vs: ps(0.35, 0.75, 6), offset: -0.03, thick: 0.07, outRef })), 0.35, 0, -0.02);
    add('rbumper_reinf', beam(F, s, false), 0.0);
    add('tow_hook_cover_r', mesh(surfGeo(rl, { us: ps(0.735, 0.785, 8), vs: ps(0.5, 0.66, 6), mask: (u, v) => ellipse(0.76, 0.58, 0.022, 0.07)(u, v) < 0, offset: 0.002, thick: 0.012, outRef })), 1.15, 0.12, -0.1);
    add('park_sensor_r', sensors(rl, outRef, [0.25, 0.4, 0.6, 0.75], 0.55), 0.55, 0, -0.28);
  }
  return g;
}
function sensors(fn, outRef, us, v) {
  const grp = new THREE.Group();
  for (const u of us) { const f = frameAt(fn, u, v, outRef); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 16)); c.position.copy(f.p).addScaledVector(f.n, -0.02); c.quaternion.setFromUnitVectors(UP, f.n); const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.04)); b.position.copy(f.p).addScaledVector(f.n, -0.055); b.quaternion.copy(c.quaternion); grp.add(c, b); }
  return grp;
}
// steel reinforcement beam: hat section swept along the bumper plan curve, with crush cans + mounting plates
function beam(F, s, front) {
  const grp = new THREE.Group();
  const y = front ? s.gc + 0.32 : s.gc + 0.36;
  const dBack = front ? F.dN + 0.06 : s.L - F.dR - 0.12;
  const zMax = F.halfW(dBack) - 0.14;
  const pts = []; for (let i = 0; i <= 20; i++) { const z = lerp(-zMax, zMax, i / 20); const bow = 0.06 * (1 - (z / zMax) ** 2); pts.push(V3(F.X(dBack) + (front ? bow : -bow), y, z)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const sh = new THREE.Shape(); const h = 0.1, w = 0.05, t = 0.006;
  sh.moveTo(-h / 2 - 0.02, 0); sh.lineTo(-h / 2, 0); sh.lineTo(-h / 2 + 0.01, w); sh.lineTo(h / 2 - 0.01, w); sh.lineTo(h / 2, 0); sh.lineTo(h / 2 + 0.02, 0); sh.lineTo(h / 2 + 0.02, t); sh.lineTo(h / 2 - t, t); sh.lineTo(h / 2 - 0.01 - t, w - t); sh.lineTo(-h / 2 + 0.01 + t, w - t); sh.lineTo(-h / 2 + t, t); sh.lineTo(-h / 2 - 0.02, t);
  const geo = new THREE.ExtrudeGeometry(sh, { steps: 40, bevelEnabled: false, extrudePath: curve });
  grp.add(new THREE.Mesh(geo));
  for (const sg of [-1, 1]) {
    const z = sg * (zMax - 0.22);
    const can = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.08)); can.position.set(F.X(dBack) + (front ? -0.09 : 0.09), y, z); grp.add(can);
    const pl = new THREE.Mesh(tabGeo(0.14, 0.14, 0.008, 0.01)); pl.rotation.y = Math.PI / 2; pl.position.set(F.X(dBack) + (front ? -0.17 : 0.17), y - 0.07, z); grp.add(pl);
  }
  return grp;
}
function pickupRear(F, s, add, g) {
  const X = F.X, L = s.L, W2 = s.W / 2;
  const sb = new THREE.Mesh(roundBox(0.2, 0.26, s.W - 0.04, 0.04)); sb.position.set(X(L - 0.12), s.gc + 0.29, 0); add('rbumper_cover', sb, 0.6);
  for (const sfx of ['l', 'r']) { const sg = sfx === 'l' ? -1 : 1; const br = new THREE.Mesh(boxGeo(X(L - 0.22), X(L - 0.6), s.gc + 0.25, s.gc + 0.33, sg * 0.45 - 0.04, sg * 0.45 + 0.04)); add('rbumper_bracket_' + sfx, br, 0.25, sg * 0.3); const r = new THREE.Mesh(boxGeo(X(L - 0.021), X(L - 0.012), s.gc + 0.25, s.gc + 0.3, sg * (W2 - 0.2) - 0.06, sg * (W2 - 0.2) + 0.06)); add('reflector_' + sfx, r, 0.9, sg * 0.1); const rd = new THREE.Mesh(roundBox(0.1, 0.075, 0.035, 0.01)); rd.position.set(X(L - 0.25), s.gc + 0.45, sg * (W2 - 0.1)); add('bsm_radar_' + sfx, rd, 0.3, sg * 0.25); }
  const rf = new THREE.Mesh(boxGeo(X(L - 0.2), X(L - 0.28), s.gc + 0.25, s.gc + 0.35, -W2 + 0.2, W2 - 0.2)); add('rbumper_reinf', rf, 0.0);
  add('park_sensor_r', sensors((u, v) => V3(X(L - 0.02), s.gc + 0.2 + v * 0.2, lerp(-W2 + 0.1, W2 - 0.1, u)), (p) => V3(0, p.y, p.z), [0.25, 0.4, 0.6, 0.75], 0.5), 0.9, 0, -0.2);
  return g;
}

// ---------- X-ray inner structure ----------
export function buildStructure(s, have) {
  const F = bodyFns(s);
  const X = F.X, W2 = s.W / 2;
  const g = new THREE.Group(); g.name = 'structure';
  const steel = () => new THREE.MeshStandardMaterial({ color: 0x9fb4c8, metalness: 0.55, roughness: 0.35, side: THREE.DoubleSide });
  const hiStr = () => new THREE.MeshStandardMaterial({ color: 0xd9a84e, metalness: 0.5, roughness: 0.35, side: THREE.DoubleSide });
  const add = (name, obj, mat) => { if (have && !have(name)) return; const w = new THREE.Group(); w.name = name; w.userData.part = name; w.add(obj); obj.traverse((c) => { if (c.isMesh) c.material = mat(); }); g.add(w); };
  const tube = (pts, w, h) => { const c = new THREE.CatmullRomCurve3(pts.map((p) => V3(...p))); const sh = new THREE.Shape(); const r = Math.min(w, h) * 0.25; sh.moveTo(-w / 2 + r, -h / 2); sh.lineTo(w / 2 - r, -h / 2); sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); sh.lineTo(w / 2, h / 2 - r); sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); sh.lineTo(-w / 2 + r, h / 2); sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); sh.lineTo(-w / 2, -h / 2 + r); sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2); return new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { steps: 24, bevelEnabled: false, extrudePath: c })); };
  const front = F.dN + 0.12, yLow = s.gc + 0.28;
  // radiator support: frame with a big opening
  { const d = F.dN + 0.3, zc = F.halfW(d) - 0.22, y0 = s.gc + 0.25, y1 = s.hoodF - 0.05;
    const sh = new THREE.Shape(); sh.moveTo(-zc, y0); sh.lineTo(zc, y0); sh.lineTo(zc, y1); sh.lineTo(-zc, y1); sh.lineTo(-zc, y0);
    const hp = new THREE.Path(); const m = 0.06; hp.moveTo(-zc + m * 2.4, y0 + m); hp.lineTo(-zc + m * 2.4, y1 - m); hp.lineTo(zc - m * 2.4, y1 - m); hp.lineTo(zc - m * 2.4, y0 + m); hp.lineTo(-zc + m * 2.4, y0 + m); sh.holes.push(hp);
    for (const sg of [-1, 1]) { const h = new THREE.Path(); h.absarc(sg * (zc - m * 1.2), (y0 + y1) / 2, 0.04, 0, Math.PI * 2, true); sh.holes.push(h); }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1 }); geo.rotateY(Math.PI / 2); geo.translate(X(d) - 0.025, 0, 0);
    add('radiator_support', new THREE.Mesh(geo), steel); }
  // front rails
  for (const [sfx, sg] of [['lf', -1], ['rf', 1]]) { const z = sg * (W2 - 0.42); add('frame_rail_' + sfx, tube([[X(front), yLow, z], [X(s.fo), yLow + 0.02, z], [X(s.cowl - 0.1), yLow, z], [X(s.cowl + 0.25), s.gc + 0.14, z * 0.92], [X(s.cowl + 0.7), s.gc + 0.12, z * 0.85]], 0.08, 0.12), hiStr); }
  // aprons with strut tower
  for (const [sfx, sg] of [['l', -1], ['r', 1]]) {
    const z = sg * (W2 - 0.3); const d0 = F.dN + 0.32, d1 = s.cowl - 0.05;
    const fn = (d, v) => { const top = F.yS(d) - 0.06; const y = lerp(s.wr + 0.06, top, v); const tower = Math.exp(-(((d - s.fo - 0.05) / 0.13) ** 2)) * 0.09 * Math.sin(Math.PI * v); return V3(X(d), y, z - sg * tower); };
    add('apron_' + sfx, new THREE.Mesh(surfGeo(fn, { us: ps(d0, d1, 24), vs: ps(0, 1, 8), holes: [ellipse(s.fo + 0.05, 0.85, 0.05, 0.1)], thick: 0.01, flange: 0.03, outRef: () => V3(0, 0, 0) })), steel);
  }
  // inner pillars (hat-section reinforcements)
  for (const [sfx, sg] of [['l', -1], ['r', 1]]) {
    const pts = []; for (let i = 0; i <= 8; i++) { const d = lerp(s.cowl + 0.03, s.roofF + 0.05, i / 8); const t = 0.99; const p = F.gs(sg)(d, Math.min(1, t)); pts.push([p.x, p.y - 0.01, p.z - sg * 0.04]); }
    pts.unshift([X(s.cowl - 0.15), F.yS(s.cowl) - 0.3, sg * (F.zS(s.cowl) - 0.05)]);
    add('pillar_a_inner_' + sfx, tube(pts, 0.06, 0.09), hiStr);
    if (s.doors.length > 1) { const d = s.doors[0][1]; add('pillar_b_inner_' + sfx, tube([[X(d), F.ySill + 0.02, sg * (F.sideZ(d, F.ySill + 0.2) - 0.05)], [X(d), s.belt, sg * (F.zS(d) - 0.05)], [X(d + 0.02), F.topY(d) - 0.05, sg * (F.z1(d) - 0.05)]], 0.12, 0.06), hiStr); }
    // door beams
    s.doors.forEach(([a, b], i) => { if (s.cargo && i === 1) return; const name = 'door_beam_' + (sfx) + (i === 0 ? 'f' : 'r'); const z = sg * (F.sideZ((a + b) / 2, s.belt - 0.25) - 0.07); const bm = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, b - a - 0.14, 16)); const ang = Math.atan2(0.18, b - a - 0.14); c.rotation.z = Math.PI / 2 - ang; c.position.set(X((a + b) / 2), s.belt - 0.3, z); bm.add(c); for (const e of [-1, 1]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.012)); pl.position.set(X((a + b) / 2) + e * (b - a - 0.14) / 2 * Math.cos(ang) * -1, s.belt - 0.3 + e * 0.09, z); bm.add(pl); } add(name.replace(/^door_beam_l/, 'door_beam_l').replace(/^door_beam_r/, 'door_beam_r'), bm, hiStr); });
  }
  // rear rails, trunk floor, rear body panel
  if (!F.isPickup) {
    for (const [sfx, sg] of [['l', -1], ['r', 1]]) { const z = sg * (W2 - 0.4); add('rear_rail_' + sfx, tube([[X(s.fo + s.wb - 0.7), s.gc + 0.12, z], [X(s.fo + s.wb - 0.1), s.gc + 0.3, z], [X(s.L - 0.35), s.gc + 0.3, z]], 0.08, 0.1), hiStr); }
    const d0 = s.fo + s.wb + 0.3, d1 = s.L - 0.32; const zf = W2 - 0.35;
    const fn = (d, z) => { const dc = (d - (d0 + d1) / 2) / ((d1 - d0) / 2), zc = z / zf; const r = Math.hypot(dc * 1.1, zc * 1.6); const well = r < 0.85 ? -0.12 * Math.cos(r / 0.85 * Math.PI / 2) ** 0.6 : 0; return V3(X(d), s.gc + 0.36 + well, z); };
    add('trunk_floor', new THREE.Mesh(surfGeo(fn, { us: ps(d0, d1, 24), vs: ps(-zf, zf, 24), thick: 0.008, flange: 0.03, outRef: (p) => V3(p.x, p.y - 1, p.z) })), steel);
    { const d = s.L - 0.3; const zc = F.halfW(d) - 0.2, y0 = s.gc + 0.3, y1 = (F.sedanRear ? s.deckY : s.belt) - 0.08; const sh = new THREE.Shape(); sh.moveTo(-zc, y0); sh.lineTo(zc, y0); sh.lineTo(zc, y1); sh.lineTo(-zc, y1); sh.lineTo(-zc, y0); const hp = new THREE.Path(); hp.absarc(0, (y0 + y1) / 2, 0.035, 0, Math.PI * 2, true); sh.holes.push(hp); const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 }); geo.rotateY(Math.PI / 2); geo.translate(X(d), 0, 0); add('rear_body_panel', new THREE.Mesh(geo), steel); }
  } else {
    for (const [sfx, sg] of [['l', -1], ['r', 1]]) { const z = sg * (W2 - 0.42); add('rear_rail_' + sfx, tube([[X(s.cowl + 0.7), s.gc + 0.12, z * 0.85], [X(s.fo + s.wb - 0.5), s.gc + 0.14, z * 0.85], [X(s.fo + s.wb), s.gc + 0.36, z * 0.85], [X(s.L - 0.25), s.gc + 0.32, z * 0.85]], 0.08, 0.16), hiStr); }
  }
  return g;
}
export function ghostify(root, on) {
  root.traverse((m) => {
    if (!m.isMesh || !m.material) return;
    if (m.userData.cabin) { m.visible = !on; return; } // seats/dash would only clutter the X-ray view
    if (on) { if (!m.userData.ghost) { m.userData.ghost = { t: m.material.transparent, o: m.material.opacity, dw: m.material.depthWrite }; } m.material.transparent = true; m.material.opacity = 0.1; m.material.depthWrite = false; }
    else if (m.userData.ghost) { m.material.transparent = m.userData.ghost.t; m.material.opacity = m.userData.ghost.o; m.material.depthWrite = m.userData.ghost.dw; delete m.userData.ghost; }
    m.material.needsUpdate = true;
  });
}
