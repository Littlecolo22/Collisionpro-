// R&R Auto Express - code-built photo studio for the 3D picker: an HDR softbox environment for reflections,
// a gray studio backdrop, a reflective floor with a faint blurred mirror image of the car, soft contact
// shadows, and adaptive quality so phones stay smooth. Everything here is generated in code.
import * as THREE from './vendor/three.module.min.js';

// Studio colours (sRGB). The floor fades into HORIZON so the backdrop has no visible seam.
// Meshes on this layer are seen by the main camera only, not by the floor's mirror pass (it is blurred anyway).
export const DETAIL_LAYER = 2;
export const STUDIO = { top: '#4a4f56', horizon: '#26292d', floor: '#53585e' };

// Per-vehicle studio: cfg = { bg: '#6e6e6e', grad: 0..0.4 (how much lighter the top is than the floor line), refl: 0..0.4 }.
// Without cfg it is the default neutral gray studio. Returns sRGB hex strings for backdrop and floor.
const _mix = (a, b, k) => { const A = new THREE.Color(a), B = new THREE.Color(b); return '#' + A.lerp(B, k).getHexString(); };
export function studioColors(cfg = {}) {
  const bg = cfg.bg || '#74787d', gr = cfg.grad ?? 0.16;
  return { top: _mix(bg, '#ffffff', gr * 0.55), mid: bg, horizon: _mix(bg, '#000000', 0.06 + gr * 0.25), floor: _mix(bg, '#000000', 0.02 + gr * 0.12) };
}
export function backdropTex(cfg) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  if (cfg) { const sc = studioColors(cfg); g.addColorStop(0, sc.top); g.addColorStop(0.55, sc.mid); g.addColorStop(0.8, sc.horizon); g.addColorStop(1, sc.horizon); }
  else { g.addColorStop(0, '#1d2024'); g.addColorStop(0.35, STUDIO.top); g.addColorStop(0.62, '#3a3e44'); g.addColorStop(0.78, STUDIO.horizon); g.addColorStop(1, STUDIO.horizon); }
  x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// HDR environment: a dim gray room with a big overhead softbox, long side strip lights (the horizontal
// highlight streaks you see on studio car photos), front/back key panels and a warm low bounce card.
export function studioEnvironment(renderer) {
  const sc = new THREE.Scene();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const room = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.11, 0.115, 0.125), side: THREE.BackSide }));
  room.scale.set(26, 12, 26); room.position.y = 5.5; sc.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.052, 0.056) }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.4; sc.add(floor);
  const light = (w, h, k, pos, look, tint = [1, 1, 1]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k * tint[0], k * tint[1], k * tint[2]), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); sc.add(m); return m;
  };
  light(9, 4.2, 6.5, [0, 9, 0], [0, 0, 0]); // overhead softbox
  light(1.4, 1.4, 10, [0, 9.2, 0], [0, 0, 0]); // hot centre of the softbox
  for (const z of [-8, 8]) {
    light(16, 0.9, 7, [0, 3.4, z], [0, 3.4, 0]); // long upper strip (shoulder-line streak)
    light(16, 0.35, 3.5, [0, 1.25, z], [0, 1.25, 0]); // thin low strip (rocker streak)
  }
  light(4.5, 3, 4.5, [10, 3.2, 3.5], [0, 0.8, 0], [1, 0.97, 0.92]); // front key, warm
  light(4.5, 3, 2.6, [-10, 3.2, -3.5], [0, 0.8, 0], [0.9, 0.95, 1]); // rear key, cool
  light(3, 6, 1.6, [7, 5, -7], [0, 1, 0]); // kicker
  light(12, 2, 0.6, [0, 0.05, 11], [0, 1, 0], [1, 0.95, 0.88]); // low bounce card
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(sc, 0.02).texture;
  pm.dispose(); sc.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return tex;
}

// Direct lights that match the softboxes (kept modest: the environment does most of the work).
export function studioLights(scene) {
  const hemi = new THREE.HemisphereLight(0xeef3fa, 0x30343a, 0.35); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.25); key.position.set(1.5, 9, 2.5); scene.add(key);
  const front = new THREE.DirectionalLight(0xfff3e4, 0.55); front.position.set(9, 2.6, 3.5); scene.add(front);
  const back = new THREE.DirectionalLight(0xe4ecff, 0.4); back.position.set(-9, 2.6, -3.5); scene.add(back);
  const side = new THREE.DirectionalLight(0xffffff, 0.35); side.position.set(0, 3, 9); scene.add(side);
  return [hemi, key, front, back, side];
}

// Floor: studio gray that fades into the backdrop, with a faint, softly blurred mirror image of the car.
// The mirror pass renders only the car (no backdrop) into a smaller offscreen target.
export function createFloor(renderer, opts = {}) {
  const size = 60;
  const geo = new THREE.PlaneGeometry(size, size);
  const rtType = renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const rt = new THREE.WebGLRenderTarget(16, 16, { type: rtType, samples: 0 });
  const textureMatrix = new THREE.Matrix4();
  const uniforms = {
    tReflect: { value: rt.texture }, textureMatrix: { value: textureMatrix },
    uFloor: { value: new THREE.Color(STUDIO.floor) }, uHorizon: { value: new THREE.Color(STUDIO.horizon) },
    uStrength: { value: 0.24 }, uOn: { value: 1 }, uR0: { value: 2.5 }, uR1: { value: 9 }, uTexel: { value: new THREE.Vector2(1 / 16, 1 / 16) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, depthWrite: true,
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vUvP; varying vec3 vW;
      void main(){ vUvP = textureMatrix * vec4(position,1.0); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform sampler2D tReflect; uniform vec3 uFloor; uniform vec3 uHorizon; uniform float uStrength; uniform float uOn; uniform float uR0; uniform float uR1; uniform vec2 uTexel;
      varying vec4 vUvP; varying vec3 vW;
      void main(){
        float r = length(vW.xz * vec2(0.62, 1.0));
        float fade = smoothstep(uR0, uR1, r);
        vec3 base = mix(uFloor * (1.0 - 0.18 * smoothstep(0.0, uR0, r)), uHorizon, fade);
        vec4 acc = vec4(0.0);
        if (uOn > 0.5) {
          vec2 uv = vUvP.xy / vUvP.w;
          float h = 2.2;
          acc += texture2D(tReflect, uv) * 0.28;
          acc += texture2D(tReflect, uv + uTexel * vec2( h, 0.0)) * 0.12; acc += texture2D(tReflect, uv + uTexel * vec2(-h, 0.0)) * 0.12;
          acc += texture2D(tReflect, uv + uTexel * vec2(0.0,  h)) * 0.12; acc += texture2D(tReflect, uv + uTexel * vec2(0.0, -h)) * 0.12;
          acc += texture2D(tReflect, uv + uTexel * vec2( h,  h)) * 0.06; acc += texture2D(tReflect, uv + uTexel * vec2(-h, -h)) * 0.06;
          acc += texture2D(tReflect, uv + uTexel * vec2( h, -h)) * 0.06; acc += texture2D(tReflect, uv + uTexel * vec2(-h,  h)) * 0.06;
          #ifdef TONE_MAPPING
          acc.rgb = toneMapping(acc.rgb);
          #endif
          acc.rgb = clamp(acc.rgb, 0.0, 1.0);
        }
        float k = acc.a * uStrength * (1.0 - fade);
        vec3 col = mix(base, acc.rgb, k);
        gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
      }`,
  });
  mat.toneMapped = true;
  const floor = new THREE.Mesh(geo, mat); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.002; floor.name = 'studio_floor';
  floor.renderOrder = -1;
  const st = { enabled: opts.reflect !== false, scale: opts.scale || 0.5, hide: [], strength: 0.24, level: 0 };
  const virtualCamera = new THREE.PerspectiveCamera();
  const P = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), V = new THREE.Vector3(), T = new THREE.Vector3(), LA = new THREE.Vector3();
  const R = new THREE.Matrix4(), plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
  const sz = new THREE.Vector2(); let busy = false;
  floor.onBeforeRender = (rend, scene, camera) => {
    if (busy || !st.enabled || !floor.visible) { uniforms.uOn.value = 0; return; }
    uniforms.uOn.value = 1;
    rend.getDrawingBufferSize(sz);
    const w = Math.max(64, Math.round(sz.x * st.scale)), h = Math.max(64, Math.round(sz.y * st.scale));
    if (rt.width !== w || rt.height !== h) { rt.setSize(w, h); uniforms.uTexel.value.set(1 / w, 1 / h); }
    P.setFromMatrixPosition(floor.matrixWorld); C.setFromMatrixPosition(camera.matrixWorld);
    R.extractRotation(floor.matrixWorld); N.set(0, 0, 1).applyMatrix4(R);
    V.subVectors(P, C); if (V.dot(N) > 0) { uniforms.uOn.value = 0; return; }
    V.reflect(N).negate(); V.add(P);
    R.extractRotation(camera.matrixWorld); LA.set(0, 0, -1).applyMatrix4(R); LA.add(C);
    T.subVectors(P, LA); T.reflect(N).negate(); T.add(P);
    virtualCamera.position.copy(V); virtualCamera.up.set(0, 1, 0).applyMatrix4(R).reflect(N); virtualCamera.lookAt(T);
    virtualCamera.layers.set(0);
    virtualCamera.far = camera.far; virtualCamera.near = camera.near; virtualCamera.updateMatrixWorld(); virtualCamera.projectionMatrix.copy(camera.projectionMatrix);
    textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1); textureMatrix.multiply(virtualCamera.projectionMatrix).multiply(virtualCamera.matrixWorldInverse).multiply(floor.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(N, P); plane.applyMatrix4(virtualCamera.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pe = virtualCamera.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + pe[8]) / pe[0]; q.y = (Math.sign(clip.y) + pe[9]) / pe[5]; q.z = -1; q.w = (1 + pe[10]) / pe[14];
    clip.multiplyScalar(2 / clip.dot(q)); pe[2] = clip.x; pe[6] = clip.y; pe[10] = clip.z + 1 - 0.003; pe[14] = clip.w;
    virtualCamera.projectionMatrixInverse.copy(virtualCamera.projectionMatrix).invert();
    busy = true; floor.visible = false;
    const bg = scene.background, env = scene.environment; scene.background = null;
    const hidden = st.hide.filter((o) => o.visible); hidden.forEach((o) => { o.visible = false; });
    const prevRT = rend.getRenderTarget(), prevClear = rend.getClearColor(new THREE.Color()), prevA = rend.getClearAlpha();
    rend.setRenderTarget(rt); rend.setClearColor(0x000000, 0); rend.clear(); rend.render(scene, virtualCamera);
    rend.setRenderTarget(prevRT); rend.setClearColor(prevClear, prevA);
    hidden.forEach((o) => { o.visible = true; }); scene.background = bg; scene.environment = env;
    floor.visible = true; busy = false;
  };
  return {
    mesh: floor, state: st,
    setFade(r0, r1) { uniforms.uR0.value = r0; uniforms.uR1.value = r1; },
    setReflect(on, scale) { st.enabled = !!on && st.strength > 0; if (scale) st.scale = scale; },
    // per-vehicle look: floor/horizon colours and reflection strength (0 skips the mirror pass entirely: one less scene render a frame)
    setLook(cfg) { const sc = studioColors(cfg); uniforms.uFloor.value.set(sc.floor); uniforms.uHorizon.value.set(sc.horizon); st.strength = cfg.refl ?? 0.24; uniforms.uStrength.value = st.strength; st.enabled = st.strength > 0 && st.level < 2; },
    dispose() { rt.dispose(); geo.dispose(); mat.dispose(); },
  };
}

// Soft wheel contact shadows (dark ovals right under each tyre) on top of the big body shadow.
let _blob = null;
export function blobTex() {
  if (_blob) return _blob;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.5, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); _blob = new THREE.CanvasTexture(c); return _blob;
}
export function wheelShadows(spec) {
  const g = new THREE.Group(); g.name = 'wheel_shadows';
  const L = spec.L, W2 = spec.W / 2, X = (d) => L / 2 - d;
  for (const d of [spec.fo, spec.fo + spec.wb]) for (const sg of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(spec.wr * 1.5, 0.42), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: 0.85 }));
    m.rotation.x = -Math.PI / 2; m.position.set(X(d), 0.002, sg * (W2 - 0.15)); g.add(m);
  }
  return g;
}

// Adaptive quality: watch the frame interval while the user is orbiting; if it stays slow, drop the
// mirror pass, then pixel ratio. Never steps back up (no flicker).
// Adaptive quality while the car moves. It learns the screen's frame interval (about 16.7 ms at 60 Hz, 8.3 ms at 120 Hz)
// from the fastest frames it sees, steps quality down when frames run long (reflection off, then lower sharpness) and
// steps back up only after a long run of on-time frames. A step that had to be undone is never tried again, so it
// does not flicker or heat the phone. prof: { maxPR, minPR, reflectMax } (old callers may pass a boolean).
export function qualityGovernor(renderer, floor, prof) {
  if (typeof prof !== 'object' || !prof) { const dpr = window.devicePixelRatio || 1; prof = { maxPR: Math.min(dpr, prof ? 1.75 : 2), minPR: Math.min(dpr, 1), reflectMax: true }; }
  const dts = []; let last = 0, good = 0, vsync = 1000 / 60, fails = 0;
  const prs = [prof.maxPR, Math.max(prof.minPR, prof.maxPR * 0.8), Math.max(prof.minPR, prof.maxPR * 0.65)].filter((v, i, a) => i === 0 || v < a[i - 1] - 0.01);
  let pri = 0; const blocked = new Set();
  const reflectOn = () => !!floor.state.enabled;
  const api = {
    frame(t, continuous) {
      if (!continuous) { last = 0; return; }
      if (last) { const dt = t - last; if (dt > 0 && dt < 250) { dts.push(dt); if (dts.length > 30) dts.shift(); } }
      last = t;
      if (dts.length < 12) return;
      const sorted = [...dts].sort((x, y) => x - y);
      vsync = Math.max(6.5, Math.min(vsync, sorted[1])); // fastest frames ≈ the display's refresh interval
      const avg = dts.reduce((x, y) => x + y, 0) / dts.length;
      if (avg > vsync * 1.7) { // running long: drop one step
        good = 0; dts.length = 0; fails++;
        if (reflectOn()) { floor.state.level = 2; floor.setReflect(false); blocked.add('reflect'); }
        else if (pri < prs.length - 1) { blocked.add('pr' + pri); pri++; renderer.setPixelRatio(prs[pri]); }
        else if (avg > 160 && fails > 4 && !api.slowSent) { api.slowSent = true; prof.onSlow && prof.onSlow(); } // still under ~6 fps at the lowest setting
        api.level = Math.min(3, api.level + 1); return;
      }
      if (avg < vsync * 1.2) { good++; if (good < 120) return; good = 0; dts.length = 0; // ~1-2 s of smooth frames: try one step up
        if (pri > 0 && !blocked.has('pr' + (pri - 1))) { pri--; renderer.setPixelRatio(prs[pri]); api.level = Math.max(0, api.level - 1); }
        else if (pri === 0 && !reflectOn() && prof.reflectMax && !blocked.has('reflect') && floor.state.strength > 0) { floor.state.level = 0; floor.setReflect(true); }
      } else good = 0;
    },
    level: 0,
    get vsyncMs() { return vsync; }, get pixelRatio() { return prs[pri]; }, get fails() { return fails; },
  };
  return api;
}
