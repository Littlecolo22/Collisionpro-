// 2D tappable parts diagram (flat unfolded layout drawn by the app, not OEM art).
// Part ids are the same mesh ids the 3D picker and the catalog use.
import { specFor, paintHex, MARK_COLORS } from './car3d.js';

const NS = 'http://www.w3.org/2000/svg';
const hx = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
const SEL = '#2bd47a';
function mix(n, t, f) { const a = [(n >> 16) & 255, (n >> 8) & 255, n & 255], b = [(t >> 16) & 255, (t >> 8) & 255, t & 255]; return a.map((v, i) => Math.round(v + (b[i] - v) * f)).reduce((x, v) => x * 256 + v, 0); }
function lum(n) { return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
const FILL = { glass: '#3d5468', lamp: '#dde6ee', tail: '#b3262b', amber: '#e8a33a', black: '#252a31', chrome: '#b9c0c7', trim: '#3a4048', tire: '#14171a', wheel: '#8e979f', foam: '#c8bf8a', steel: '#7d8790', well: '#0b0e11', glassbg: '#1c2630' };
const LABELS = { fbumper_cover: 'Front bumper', rbumper_cover: 'Rear bumper', hood: 'Hood', roof: 'Roof', windshield: 'Windshield', back_glass: 'Back glass', decklid: 'Trunk', grille: 'Grille', grille_lower: 'Lower grille', fender_l: 'L fender', fender_r: 'R fender', quarter_l: 'L quarter', quarter_r: 'R quarter', door_lf: 'LF door', door_rf: 'RF door', door_lr: 'LR door', door_rr: 'RR door', rocker_l: 'Rocker', rocker_r: 'Rocker', bedside_l: 'L bedside', bedside_r: 'R bedside', bed_floor: 'Bed floor', fbumper_absorber: 'Absorber', fbumper_reinf: 'Reinforcement', rbumper_absorber: 'Absorber', rbumper_reinf: 'Reinforcement', fbumper_bracket_l: 'Bracket L', fbumper_bracket_r: 'Bracket R', rbumper_bracket_l: 'Bracket L', rbumper_bracket_r: 'Bracket R', park_sensor_f: 'Park sensors', park_sensor_r: 'Park sensors', tow_hook_cover: 'Tow hook cover', bsm_radar_l: 'Blind-spot L', bsm_radar_r: 'Blind-spot R' };

// ---------- geometry (meters) ----------
function rect(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
function slab(p0, p1, t) { const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1; const nx = -dy / l * t, ny = dx / l * t; return [p0, p1, [p1[0] + nx, p1[1] + ny], [p0[0] + nx, p0[1] + ny]]; }

function geometry(m3d) {
  const s = specFor(m3d || {});
  const L = s.L, W = s.W, W2 = W / 2, H = s.roof + 0.03;
  const isPickup = s.style === 'pickup', sedan = s.rear === 'sedan', cargo = !!s.cargo;
  const fa = s.fo, ra = s.fo + s.wb, ar = s.wr + 0.07;
  const archY = (d, yb) => { let y = yb; for (const c of [fa, ra]) { const dx = d - c; if (Math.abs(dx) < ar) y = Math.max(y, s.wr + Math.sqrt(ar * ar - dx * dx)); } return y; };
  const panel = (d0, d1, yb, top) => { const n = Math.max(6, Math.ceil((d1 - d0) / 0.05)); const p = []; for (let i = 0; i <= n; i++) { const d = d0 + (d1 - d0) * i / n; p.push([d, archY(d, yb)]); } for (let i = n; i >= 0; i--) { const d = d0 + (d1 - d0) * i / n; p.push([d, typeof top === 'function' ? top(d) : top]); } return p; };
  const rearBase = sedan ? s.deckF : isPickup ? s.cabBack : s.base;
  const rearBaseY = sedan ? s.deckY : s.belt + 0.05;
  const topY = (d) => d <= s.cowl ? s.belt : d < s.roofF ? s.belt + (s.roof - s.belt) * (d - s.cowl) / (s.roofF - s.cowl) : d <= s.roofR ? s.roof : isPickup ? s.belt : d < rearBase ? s.roof + (rearBaseY - s.roof) * (d - s.roofR) / (rearBase - s.roofR) : rearBaseY;
  const hoodY = (d) => s.hoodF + (s.belt + 0.02 - s.hoodF) * Math.min(1, Math.max(0, (d - 0.25) / (s.cowl - 0.25)));
  const yb = s.gc + 0.14;
  const doors = s.doors, d0a = doors[0][0], d0b = doors[0][1], lde = doors[doors.length - 1][1];
  const bTop = s.belt - (cargo ? 0.5 : 0.33);
  const greenEnd = isPickup ? s.cabBack - 0.02 : sedan ? s.deckF : rearBase;

  // ----- side view, local (d, y) as seen from the LEFT; sfx l/r -----
  const side = (x) => {
    const S = []; const P = (id, kind, pts, o = {}) => S.push({ id, kind, pts, ...o });
    // background: wheel wells, glass house
    for (const c of [fa, ra]) S.push({ kind: 'well', c: [c, s.wr], r: ar });
    const gh = []; const n = 24; for (let i = 0; i <= n; i++) { const d = s.cowl + (greenEnd - s.cowl) * i / n; gh.push([d, topY(d)]); }
    gh.push([greenEnd, s.belt]); gh.push([s.cowl, s.belt]); P(null, 'glassbg', gh);
    P('fbumper_cover', 'paint', [[0.31, s.gc + 0.1], [0.04, s.gc + 0.12], [0, s.gc + 0.25], [0, s.hoodF - 0.1], [0.06, s.hoodF], [0.31, s.hoodF]]);
    P('fender_' + x, 'paint', panel(0.28, d0a - 0.01, yb, hoodY), { lab: 1 });
    P('hood', 'paint', slab([0.27, s.hoodF + 0.0], [s.cowl - 0.06, s.belt + 0.01], 0.05));
    P('headlamp_' + x, 'lamp', rect(0, s.hoodF - 0.15, 0.3, s.hoodF - 0.01));
    doors.forEach(([a, b], i) => {
      const id = 'door_' + x + (i === 0 ? 'f' : 'r');
      const top = cargo && i === 1 ? (d) => topY(d) - 0.05 : s.belt;
      P(id, 'paint', panel(a + 0.008, b - 0.008, yb + 0.01, top), { lab: 1 });
      if (!(cargo && i === 1)) {
        const lo = Math.max(a + 0.04, s.cowl + 0.06), hi = b - 0.04;
        if (hi > lo + 0.1) { const g = []; const m = 12; for (let k = 0; k <= m; k++) { const d = lo + (hi - lo) * k / m; g.push([d, s.belt + 0.03]); } for (let k = m; k >= 0; k--) { const d = lo + (hi - lo) * k / m; g.push([d, Math.max(s.belt + 0.04, topY(d) - 0.06)]); } P(id + '_glass', 'glass', g); }
      }
      P(id + '_handle_out', 'chrome', rect(b - 0.3, s.belt - 0.12, b - 0.12, s.belt - 0.08), { pad: 1 });
    });
    if (!isPickup) {
      const qTop = cargo ? (d) => topY(d) - 0.05 : sedan ? (d) => (d < s.deckF ? s.belt + (s.deckY - s.belt) * Math.min(1, (d - lde) / Math.max(0.1, s.deckF - lde)) : s.deckY) : s.belt;
      P('quarter_' + x, 'paint', panel(lde + 0.008, L - 0.26, yb, qTop), { lab: 1 });
      const qa = lde + 0.06, qb = (sedan ? s.deckF : rearBase) - 0.08;
      if (((!cargo && !sedan) || s.style === 'coupe') && qb > qa + 0.12) { const g = []; const m = 12; for (let k = 0; k <= m; k++) { const d = qa + (qb - qa) * k / m; g.push([d, s.belt + 0.03]); } for (let k = m; k >= 0; k--) { const d = qa + (qb - qa) * k / m; g.push([d, Math.max(s.belt + 0.04, topY(d) - 0.06)]); } P('quarter_glass_' + x, 'glass', g); }
      if (sedan) {
        P('rbumper_cover', 'paint', [[L - 0.3, s.gc + 0.1], [L - 0.03, s.gc + 0.12], [L, s.gc + 0.25], [L, s.deckY - 0.22], [L - 0.06, s.deckY - 0.05], [L - 0.3, s.deckY - 0.05]]);
        P('tail_lamp_' + x, 'tail', rect(L - 0.24, s.deckY - 0.24, L, s.deckY - 0.04));
        P('decklid', 'paint', slab([s.deckF + 0.02, s.deckY + 0.0], [L - 0.2, s.deckY - 0.02], 0.05));
      } else {
        P('rbumper_cover', 'paint', [[L - 0.32, s.gc + 0.1], [L - 0.03, s.gc + 0.12], [L, s.gc + 0.25], [L, bTop - 0.02], [L - 0.32, bTop - 0.02]]);
        if (cargo) P('decklid', 'paint', rect(L - 0.07, bTop, L, s.roof - 0.04)); else P('decklid', 'paint', slab([rearBase - 0.01, s.belt + 0.05], [L - 0.02, bTop], 0.06));
        P('tail_lamp_' + x, 'tail', rect(L - 0.22, bTop + 0.02, L, s.belt + (cargo ? -0.05 : 0.12)));
      }
    } else {
      P(null, 'paint', panel(lde + 0.008, s.cabBack, yb, s.belt));
      P('bedside_' + x, 'paint', panel(s.bedStart, L - 0.22, s.gc + 0.3, s.belt + 0.04), { lab: 1 });
      P('decklid', 'paint', rect(L - 0.26, s.gc + 0.45, L - 0.2, s.belt + 0.04));
      P('rbumper_cover', 'chrome', rect(L - 0.22, s.gc + 0.14, L, s.gc + 0.42));
      P('tail_lamp_' + x, 'tail', rect(L - 0.3, s.belt - 0.38, L - 0.2, s.belt - 0.02));
    }
    P('rocker_' + x, 'trim', rect(d0a, s.gc + 0.06, lde, s.gc + 0.16));
    P('pillar_a_' + x, 'paint', slab([s.cowl + 0.02, s.belt], [s.roofF, s.roof], 0.07));
    if (doors.length > 1) P('pillar_b_' + x, 'black', rect(d0b - 0.04, s.belt, d0b + 0.04, s.roof - 0.02));
    P('roof', 'paint', slab([s.roofF - 0.04, s.roof - 0.05], [s.roofR + 0.05, s.roof - 0.05], 0.06));
    P('mirror_' + x, 'paint', rect(d0a + 0.1, s.belt + 0.04, d0a + 0.3, s.belt + 0.19), { pad: 1 });
    for (const [c, k] of [[fa, 'f'], [ra, 'r']]) { S.push({ id: 'tire_' + x + k, kind: 'tire', c: [c, s.wr], r: s.wr }); S.push({ id: 'wheel_' + x + k, kind: 'wheel', c: [c, s.wr], r: s.wr * 0.62 }); }
    return S;
  };

  // ----- top view, local (x lateral, car-left negative; d) -----
  const top = () => {
    const S = []; const P = (id, kind, pts, o = {}) => S.push({ id, kind, pts, ...o });
    const bodyEnd = L;
    P(null, 'body', [[-W2 + 0.4, 0], [W2 - 0.4, 0], [W2 - 0.1, 0.05], [W2, 0.25], [W2, bodyEnd - 0.25], [W2 - 0.1, bodyEnd - 0.05], [W2 - 0.4, bodyEnd], [-W2 + 0.4, bodyEnd], [-W2 + 0.1, bodyEnd - 0.05], [-W2, bodyEnd - 0.25], [-W2, 0.25], [-W2 + 0.1, 0.05]]);
    for (const sg of [-1, 1]) {
      const x = sg < 0 ? 'l' : 'r'; const f = (v) => sg * v;
      P('fender_' + x, 'paint', [[f(W2 - 0.03), 0.29], [f(W2 - 0.18), 0.29], [f(W2 - 0.18), d0a - 0.01], [f(W2), d0a - 0.01], [f(W2), 0.45]]);
      doors.forEach(([a, b], i) => {
        const id = 'door_' + x + (i === 0 ? 'f' : 'r');
        P(id, 'paint', rect(f(W2), a + 0.008, f(W2 - 0.12), b - 0.008));
        const lo = Math.max(a + 0.04, s.cowl + 0.06), hi = Math.min(b - 0.04, isPickup ? s.cabBack - 0.06 : s.roofR + 0.3);
        if (hi > lo + 0.1 && !(cargo && i === 1)) P(id + '_glass', 'glass', rect(f(W2 - 0.12), lo, f(W2 - 0.2), hi));
      });
      P('mirror_' + x, 'paint', rect(f(W2 + 0.17), d0a + 0.1, f(W2), d0a + 0.3), { pad: 1 });
      if (isPickup) P('bedside_' + x, 'paint', rect(f(W2), s.bedStart, f(W2 - 0.12), L - 0.22));
      else {
        const rEnd = sedan ? s.deckF : rearBase;
        P('quarter_' + x, 'paint', [[f(W2), lde + 0.008], [f(W2 - 0.2), lde + 0.008], [f(W2 - 0.2), Math.min(s.roofR, rEnd)], [f(W2 - 0.14), rEnd], [f(W2 - 0.12), L - 0.26], [f(W2 - 0.04), L - 0.26], [f(W2), L - 0.42]]);
      }
    }
    P('fbumper_cover', 'paint', [[-W2 + 0.05, 0.31], [-W2, 0.22], [-W2 + 0.12, 0.04], [-W2 + 0.4, 0], [W2 - 0.4, 0], [W2 - 0.12, 0.04], [W2, 0.22], [W2 - 0.05, 0.31]], { lab: 1 });
    P('hood', 'paint', [[-W2 + 0.19, 0.31], [W2 - 0.19, 0.31], [W2 - 0.19, s.cowl - 0.07], [-W2 + 0.19, s.cowl - 0.07]], { lab: 1 });
    P('cowl', 'black', rect(-W2 + 0.14, s.cowl - 0.07, W2 - 0.14, s.cowl + 0.03));
    P('windshield', 'glass', [[-W2 + 0.14, s.cowl + 0.03], [W2 - 0.14, s.cowl + 0.03], [W2 - 0.2, s.roofF], [-W2 + 0.2, s.roofF]], { lab: 1 });
    P('roof', 'paint', rect(-W2 + 0.2, s.roofF, W2 - 0.2, s.roofR), { lab: 1 });
    if (sedan) {
      P('back_glass', 'glass', [[-W2 + 0.2, s.roofR], [W2 - 0.2, s.roofR], [W2 - 0.14, s.deckF], [-W2 + 0.14, s.deckF]], { lab: 1 });
      P('decklid', 'paint', [[-W2 + 0.14, s.deckF + 0.01], [W2 - 0.14, s.deckF + 0.01], [W2 - 0.12, L - 0.24], [-W2 + 0.12, L - 0.24]], { lab: 1 });
      if (s.style === 'coupe') P('spoiler', 'black', rect(-W2 + 0.18, L - 0.36, W2 - 0.18, L - 0.28));
      P('rbumper_cover', 'paint', [[-W2 + 0.05, L - 0.31], [W2 - 0.05, L - 0.31], [W2, L - 0.22], [W2 - 0.12, L - 0.04], [W2 - 0.4, L], [-W2 + 0.4, L], [-W2 + 0.12, L - 0.04], [-W2, L - 0.22]], { lab: 1 });
    } else if (isPickup) {
      P('back_glass', 'glass', rect(-W2 + 0.2, s.cabBack - 0.06, W2 - 0.2, s.cabBack));
      P('bed_front', 'paint', rect(-W2 + 0.12, s.bedStart, W2 - 0.12, s.bedStart + 0.06));
      P('bed_floor', 'black', rect(-W2 + 0.12, s.bedStart + 0.06, W2 - 0.12, L - 0.26), { lab: 1 });
      P('decklid', 'paint', rect(-W2 + 0.04, L - 0.26, W2 - 0.04, L - 0.2), { pad: 1 });
      P('rbumper_cover', 'chrome', rect(-W2 + 0.02, L - 0.2, W2 - 0.02, L));
    } else {
      if (!cargo) {
        P('back_glass', 'glass', [[-W2 + 0.2, s.roofR], [W2 - 0.2, s.roofR], [W2 - 0.16, rearBase], [-W2 + 0.16, rearBase]], { lab: 1 });
        P('decklid', 'paint', [[-W2 + 0.16, rearBase], [W2 - 0.16, rearBase], [W2 - 0.12, L - 0.3], [-W2 + 0.12, L - 0.3]]);
        P('spoiler', 'black', rect(-W2 + 0.2, s.roofR - 0.04, W2 - 0.2, s.roofR + 0.08));
      } else P('decklid', 'paint', rect(-W2 + 0.12, L - 0.3, W2 - 0.12, L - 0.24));
      P('rbumper_cover', 'paint', [[-W2 + 0.04, L - 0.3], [W2 - 0.04, L - 0.3], [W2, L - 0.22], [W2 - 0.12, L - 0.04], [W2 - 0.4, L], [-W2 + 0.4, L], [-W2 + 0.12, L - 0.04], [-W2, L - 0.22]], { lab: 1 });
    }
    return S;
  };

  const inset = cargo ? 0.05 : 0.12;
  const silhouette = () => [[-W2, s.gc + 0.1], [W2, s.gc + 0.1], [W2, s.belt], [W2 - inset - 0.06, s.roof], [-W2 + inset + 0.06, s.roof], [-W2, s.belt]];
  const tiresFR = (k) => [-1, 1].map((sg) => ({ id: 'tire_' + (sg < 0 ? 'l' : 'r') + k, kind: 'tire', pts: rect(sg * (W2 - 0.03), 0, sg * (W2 - 0.28), s.gc + 0.2) }));
  // ----- front view, local (x car-left negative, y) -----
  const front = () => {
    const S = [...tiresFR('f')]; const P = (id, kind, pts, o = {}) => S.push({ id, kind, pts, ...o });
    P(null, 'body', silhouette());
    P('fbumper_cover', 'paint', [[-W2, s.gc + 0.1], [W2, s.gc + 0.1], [W2, s.hoodF - 0.12], [W2 - 0.05, s.hoodF - 0.02], [-W2 + 0.05, s.hoodF - 0.02], [-W2, s.hoodF - 0.12]], { lab: 1, labY: s.gc + 0.4 });
    P('hood', 'paint', [[-W2 + 0.04, s.hoodF - 0.02], [W2 - 0.04, s.hoodF - 0.02], [W2 - 0.1, s.belt + 0.03], [-W2 + 0.1, s.belt + 0.03]]);
    const hlw = isPickup ? 0.38 : 0.44; const gW = Math.min(W * ((isPickup || /suv|crossover|van/.test(s.style)) ? 0.36 : 0.27), W2 - hlw - 0.02);
    P('grille', isPickup ? 'chrome' : 'black', rect(-gW, s.hoodF - (isPickup ? 0.38 : 0.26), gW, s.hoodF - 0.06));
    for (const sg of [-1, 1]) { const x = sg < 0 ? 'l' : 'r'; P('headlamp_' + x, 'lamp', rect(sg * (W2 - 0.04), s.hoodF - 0.15, sg * (W2 - hlw), s.hoodF - 0.01)); P('fog_lamp_' + x, 'amber', rect(sg * (W2 - 0.28), s.gc + 0.18, sg * (W2 - 0.12), s.gc + 0.26), { pad: 1 }); P('mirror_' + x, 'paint', rect(sg * (W2 + 0.17), s.belt + 0.04, sg * W2, s.belt + 0.19), { pad: 1 }); }
    P('grille_lower', 'black', rect(-W * 0.3, s.gc + 0.16, W * 0.3, s.gc + 0.3));
    P('front_radar', 'trim', rect(-0.07, s.gc + 0.19, 0.07, s.gc + 0.27), { pad: 1 });
    P('license_bracket_f', 'black', rect(-0.16, s.gc + 0.32, 0.16, s.gc + 0.44), { pad: 1 });
    P('windshield', 'glass', [[-W2 + inset, s.belt + 0.05], [W2 - inset, s.belt + 0.05], [W2 - inset - 0.08, s.roof - 0.05], [-W2 + inset + 0.08, s.roof - 0.05]], { lab: 1 });
    P('roof', 'paint', rect(-W2 + inset + 0.08, s.roof - 0.05, W2 - inset - 0.08, s.roof + 0.01));
    return S;
  };
  // ----- rear view, local (x car-left negative, y) -----
  const rear = () => {
    const S = [...tiresFR('r')]; const P = (id, kind, pts, o = {}) => S.push({ id, kind, pts, ...o });
    P(null, 'body', silhouette());
    if (sedan) {
      P('back_glass', 'glass', [[-W2 + inset, s.deckY + 0.05], [W2 - inset, s.deckY + 0.05], [W2 - inset - 0.1, s.roof - 0.05], [-W2 + inset + 0.1, s.roof - 0.05]], { lab: 1 });
      P('rbumper_cover', 'paint', [[-W2, s.gc + 0.1], [W2, s.gc + 0.1], [W2, s.deckY - 0.26], [-W2, s.deckY - 0.26]], { lab: 1 });
      P('decklid', 'paint', rect(-W2 + 0.41, s.deckY - 0.26, W2 - 0.41, s.deckY + 0.03), { lab: 1 });
      for (const sg of [-1, 1]) P('tail_lamp_' + (sg < 0 ? 'l' : 'r'), 'tail', rect(sg * (W2 - 0.02), s.deckY - 0.26, sg * (W2 - 0.4), s.deckY - 0.02));
      P('backup_camera', 'black', rect(-0.05, s.deckY - 0.12, 0.05, s.deckY - 0.06), { pad: 1 });
      if (s.style === 'coupe') P('spoiler', 'black', rect(-W2 + 0.18, s.deckY + 0.04, W2 - 0.18, s.deckY + 0.09));
    } else if (isPickup) {
      P('back_glass', 'glass', rect(-W2 + 0.2, s.belt + 0.08, W2 - 0.2, s.roof - 0.1));
      P('roof', 'paint', rect(-W2 + inset + 0.08, s.roof - 0.05, W2 - inset - 0.08, s.roof + 0.01));
      for (const sg of [-1, 1]) P('bedside_' + (sg < 0 ? 'l' : 'r'), 'paint', rect(sg * W2, s.gc + 0.3, sg * (W2 - 0.13), s.belt + 0.04));
      P('decklid', 'paint', rect(-W2 + 0.13, s.gc + 0.45, W2 - 0.13, s.belt + 0.04), { lab: 1, labY: s.gc + 0.62, name: 'Tailgate' });
      P('tailgate_handle', 'black', rect(-0.12, s.belt - 0.12, 0.12, s.belt - 0.04), { pad: 1 });
      P('backup_camera', 'trim', rect(-0.04, s.belt - 0.2, 0.04, s.belt - 0.14), { pad: 1 });
      for (const sg of [-1, 1]) P('tail_lamp_' + (sg < 0 ? 'l' : 'r'), 'tail', rect(sg * (W2 + 0.0), s.belt - 0.38, sg * (W2 - 0.12), s.belt - 0.02));
      P('rbumper_cover', 'chrome', rect(-W2, s.gc + 0.14, W2, s.gc + 0.42), { lab: 1, name: 'Step bumper' });
    } else {
      const nm = cargo ? 'Rear doors' : 'Liftgate';
      if (cargo) { P('decklid', 'paint', rect(-W2 + 0.04, bTop, W2 - 0.04, s.roof - 0.04), { lab: 1, labY: bTop + 0.12, name: nm }); S.push({ kind: 'line', pts: [[0, bTop], [0, s.roof - 0.04]] }); P('back_glass', 'glass', rect(-W2 + 0.15, s.belt + 0.15, W2 - 0.15, s.roof - 0.3)); }
      else {
        P('decklid', 'paint', [[-W2 + 0.14, bTop], [W2 - 0.14, bTop], [W2 - 0.14, s.belt + 0.05], [W2 - inset - 0.12, s.roof - 0.04], [-W2 + inset + 0.12, s.roof - 0.04], [-W2 + 0.14, s.belt + 0.05]], { lab: 1, labY: bTop + 0.16, name: nm });
        P('back_glass', 'glass', [[-W2 + inset + 0.1, s.belt + 0.08], [W2 - inset - 0.1, s.belt + 0.08], [W2 - inset - 0.16, s.roof - 0.1], [-W2 + inset + 0.16, s.roof - 0.1]], { lab: 1 });
        P('spoiler', 'black', rect(-W2 + 0.2, s.roof - 0.06, W2 - 0.2, s.roof + 0.02));
      }
      for (const sg of [-1, 1]) P('tail_lamp_' + (sg < 0 ? 'l' : 'r'), 'tail', rect(sg * W2, bTop + 0.02, sg * (W2 - 0.12), s.belt + (cargo ? -0.05 : 0.12)));
      P('rbumper_cover', 'paint', [[-W2, s.gc + 0.1], [W2, s.gc + 0.1], [W2, bTop - 0.02], [-W2, bTop - 0.02]], { lab: 1 });
      P('backup_camera', 'black', rect(-0.05, bTop + 0.05, 0.05, bTop + 0.1), { pad: 1 });
    }
    for (const sg of [-1, 1]) P('reflector_' + (sg < 0 ? 'l' : 'r'), 'tail', rect(sg * (W2 - 0.04), s.gc + 0.22, sg * (W2 - 0.2), s.gc + 0.27), { pad: 1 });
    return S;
  };
  return { deckName: sedan ? 'Trunk' : isPickup ? 'Tailgate' : cargo ? 'Rear doors' : 'Liftgate', s, L, W, H, sideL: side('l'), sideR: side('r'), top: top(), front: front(), rear: rear(), isPickup, sedan, cargo };
}

// corner boxes with bumper internals; bw x bh in meters
function corners(bw, bh) {
  const fz = (id, kind, x0, y0, x1, y1, o = {}) => ({ id, kind, pts: rect(x0, y0, x1, y1), lab: 1, ...o });
  const m = 0.08, w = bw - 2 * m;
  const big = (p) => [fz(p + 'bumper_absorber', 'foam', m, 0.34, m + w, 0.62), fz(p + 'bumper_reinf', 'steel', m, 0.76, m + w, 1.04), { kind: 'note', p: [bw / 2, 1.24], t: 'Tap a part' }];
  const small = (p) => [fz(p + 'bumper_bracket_l', 'steel', m, 0.32, m + w * 0.46, 0.6), fz(p + 'bumper_bracket_r', 'steel', m + w * 0.54, 0.32, m + w, 0.6), fz('park_sensor_' + p[0], 'trim', m, 0.72, m + w, 0.94)];
  return {
    tl: { title: 'FRONT BUMPER · INSIDE', items: big('f') },
    tr: { title: 'FRONT BUMPER · MOUNTS', items: [...small('f'), fz('tow_hook_cover', 'paint', m + w * 0.25, 1.06, m + w * 0.75, 1.3)] },
    bl: { title: 'REAR BUMPER · INSIDE', items: big('r') },
    br: { title: 'REAR BUMPER · MOUNTS', items: [...small('r'), fz('bsm_radar_l', 'trim', m, 1.06, m + w * 0.46, 1.3), fz('bsm_radar_r', 'trim', m + w * 0.54, 1.06, m + w, 1.3)] },
  };
}

// ---------- layouts: place each view with an affine map ----------
function layout(G, kind) {
  const { L, W, H } = G; const m = 0.12, g = 0.32, mo = 0.2;
  const views = [];
  if (kind === 'portrait') {
    const TW = 2 * m + 2 * H + 2 * g + W + 2 * mo, TH = 2 * m + 2 * H + 2 * g + L;
    const cx = m + H + g + mo + W / 2, ty0 = m + H + g;
    views.push({ name: 'top', shapes: G.top, T: ([x, d]) => [cx + x, ty0 + d] });
    views.push({ name: 'left', shapes: G.sideL, T: ([d, y]) => [m + y, ty0 + d], title: ['LEFT SIDE', m + H / 2, ty0 - 0.1] });
    views.push({ name: 'right', shapes: G.sideR, T: ([d, y]) => [TW - m - y, ty0 + d], title: ['RIGHT SIDE', TW - m - H / 2, ty0 - 0.1] });
    views.push({ name: 'front', shapes: G.front, T: ([x, y]) => [cx - x, m + H - y], title: ['FRONT', cx, m + H + 0.2] });
    views.push({ name: 'rear', shapes: G.rear, T: ([x, y]) => [cx + x, ty0 + L + g + H - y], title: ['REAR', cx, ty0 + L + g - 0.1] });
    views.push({ name: 'toptitle', shapes: [], title: ['TOP', cx, ty0 + L + 0.2] });
    const bw = H + g - 0.06, bh = H;
    const C = corners(bw, bh);
    const box = (c, x0, y0) => views.push({ name: 'box', box: [x0, y0, bw, bh], title: [c.title, x0 + bw / 2, y0 + 0.16], shapes: c.items, T: ([x, y]) => [x0 + x, y0 + y] });
    box(C.tl, m, m); box(C.tr, TW - m - bw, m); box(C.bl, m, ty0 + L + g); box(C.br, TW - m - bw, ty0 + L + g);
    return { w: TW, h: TH, views };
  }
  const TW = 2 * m + 2 * H + 2 * g + L, TH = 2 * m + 2 * H + 2 * g + W + 2 * mo;
  const lx0 = m + H + g, cy = m + H + g + mo + W / 2;
  views.push({ name: 'top', shapes: G.top, T: ([x, d]) => [lx0 + d, cy - x] });
  views.push({ name: 'left', shapes: G.sideL, T: ([d, y]) => [lx0 + d, cy + W / 2 + mo + g + H - y], title: ['LEFT SIDE', lx0 + L / 2, cy + W / 2 + mo + 0.2] });
  views.push({ name: 'right', shapes: G.sideR, T: ([d, y]) => [lx0 + d, cy - W / 2 - mo - g - H + y], title: ['RIGHT SIDE', lx0 + L / 2, cy - W / 2 - mo - 0.1] });
  views.push({ name: 'front', shapes: G.front, T: ([x, y]) => [lx0 - g - H + y, cy - x], title: ['FRONT', lx0 - g - H / 2, cy - W / 2 - mo - 0.1] });
  views.push({ name: 'rear', shapes: G.rear, T: ([x, y]) => [lx0 + L + g + H - y, cy - x], title: ['REAR', lx0 + L + g + H / 2, cy - W / 2 - mo - 0.1] });
  const bw = H + g - 0.06, bh = H;
  const C = corners(bw, bh);
  const box = (c, x0, y0) => views.push({ name: 'box', box: [x0, y0, bw, bh], title: [c.title, x0 + bw / 2, y0 + 0.16], shapes: c.items, T: ([x, y]) => [x0 + x, y0 + y] });
  box(C.tl, m, m); box(C.tr, TW - m - bw, m); box(C.bl, m, TH - m - bh); box(C.br, TW - m - bw, TH - m - bh);
  return { w: TW, h: TH, views };
}

const el = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const f3 = (v) => Math.round(v * 1000) / 1000;

export function createDiagram(container, { onTap, onLong, has, names } = {}) {
  const svg = el('svg', { class: 'd2svg', role: 'img', 'aria-label': 'Parts diagram' });
  container.appendChild(svg);
  let G = null, LY = null, kind = null, paint = 0x8fa3b8, marks = {}, sel = null, multi = new Set(), vb = null, fitS = 1;
  const byId = new Map();

  function fillFor(sh) {
    const id = sh.id;
    if (id && (multi.has(id) || sel === id)) return SEL;
    if (id && marks[id]) return hx(MARK_COLORS[marks[id]] || MARK_COLORS.other);
    if (sh.kind === 'paint') return hx(paint);
    if (sh.kind === 'body') return hx(mix(paint, 0x0b0e11, 0.55));
    return FILL[sh.kind] || '#555';
  }
  function render() {
    svg.textContent = '';
    byId.clear();
    const dark = lum(paint) < 0.3;
    const stroke = dark ? '#6c7a88' : '#0b0f13';
    const gBg = el('g'), gP = el('g'), gHit = el('g'), gTxt = el('g', { class: 'd2txt' });
    svg.append(gBg, gP, gHit, gTxt);
    for (const v of LY.views) {
      if (v.box) { const [x, y, w, h] = v.box; gBg.appendChild(el('rect', { x, y, width: w, height: h, rx: 0.06, class: 'd2box' })); }
      if (v.title) { const t = el('text', { x: v.title[1], y: v.title[2], class: 'd2title' }); t.textContent = v.title[0]; gTxt.appendChild(t); }
      for (let sh of v.shapes) {
        if (sh.id && has && !has(sh.id)) { if (v.name === 'box') continue; sh = { ...sh, id: null, lab: 0, pad: 0 }; }
        let node, bb;
        if (sh.kind === 'note') { const [x, y] = v.T(sh.p); const t = el('text', { x, y, class: 'd2note' }); t.textContent = sh.t; gTxt.appendChild(t); continue; }
        if (sh.c) {
          const [cx, cy] = v.T(sh.c);
          node = el('circle', { cx: f3(cx), cy: f3(cy), r: f3(sh.r) }); bb = [cx - sh.r, cy - sh.r, cx + sh.r, cy + sh.r];
        } else {
          const pts = sh.pts.map(v.T);
          if (sh.kind === 'line') { gP.appendChild(el('polyline', { points: pts.map((p) => p.map(f3).join(',')).join(' '), class: 'd2line', stroke })); continue; }
          node = el('polygon', { points: pts.map((p) => p.map(f3).join(',')).join(' ') });
          const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        }
        node.setAttribute('fill', fillFor(sh));
        node.setAttribute('stroke', sh.kind === 'well' || sh.kind === 'glassbg' ? 'none' : stroke);
        node.setAttribute('class', 'd2s' + (sh.id ? ' pt' : '') + (sh.kind === 'body' || sh.kind === 'well' || sh.kind === 'glassbg' ? ' bg' : ''));
        if (sh.id) { node.dataset.p = sh.id; (byId.get(sh.id) || byId.set(sh.id, []).get(sh.id)).push({ node, sh }); }
        (sh.kind === 'body' || sh.kind === 'well' || sh.kind === 'glassbg' ? gBg : gP).appendChild(node);
        if (sh.id && sh.pad) {
          const mn = 0.26, cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2, w = Math.max(mn, bb[2] - bb[0]), h = Math.max(mn, bb[3] - bb[1]);
          const r = el('rect', { x: f3(cx - w / 2), y: f3(cy - h / 2), width: f3(w), height: f3(h), fill: 'transparent', class: 'd2hit' }); r.dataset.p = sh.id; gHit.appendChild(r);
        }
        if (sh.id && sh.lab) {
          const w = bb[2] - bb[0], h = bb[3] - bb[1]; const txt = sh.name || (sh.id === 'decklid' ? G.deckName : LABELS[sh.id]) || (names && names(sh.id)) || '';
          const fs = 0.105; const words = txt.split(' '); const lines = (txt.length * fs * 0.56 > w - 0.04 && words.length > 1) ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [txt];
          const tw = Math.max(...lines.map((l) => l.length)) * fs * 0.56;
          if (txt && tw < w + 0.02 && h > fs * lines.length + 0.03) {
            let cy = (bb[1] + bb[3]) / 2; if (sh.labY !== undefined) { const p = v.T([0, sh.labY]); if (v.name === 'front' || v.name === 'rear') cy = kind === 'portrait' ? p[1] : cy; }
            const t = el('text', { x: f3((bb[0] + bb[2]) / 2), y: f3(cy - (lines.length - 1) * fs * 0.55), class: 'd2lab' });
            lines.forEach((l, i) => { const ts = el('tspan', { x: f3((bb[0] + bb[2]) / 2), dy: i ? f3(fs * 1.1) : 0 }); ts.textContent = l; t.appendChild(ts); });
            gTxt.appendChild(t);
          }
        }
      }
    }
    applyVB();
  }
  function restyle() {
    for (const [id, arr] of byId) for (const { node, sh } of arr) {
      node.setAttribute('fill', fillFor(sh));
      node.classList.toggle('sel', sel === id); node.classList.toggle('msel', multi.has(id));
    }
  }
  function pads() {
    const r = container.getBoundingClientRect();
    const p = container.parentElement; let top = 6, bot = 6;
    const bar = p.querySelector('.bar'); if (bar) top = Math.max(top, bar.getBoundingClientRect().bottom - r.top + 4);
    for (const q of p.querySelectorAll('.info,.legend,.bulk2:not(.hide)')) { const b = q.getBoundingClientRect(); if (b.height && b.top > r.top + r.height / 2) bot = Math.max(bot, r.bottom - b.top + 4); }
    return { r, top, bot };
  }
  function chooseAndFit(force) {
    const { r, top, bot } = pads(); if (!r.width || !G) return;
    const aw = r.width - 12, ah = Math.max(80, r.height - top - bot);
    const P = layout(G, 'portrait'), Q = layout(G, 'landscape');
    const sp = Math.min(aw / P.w, ah / P.h), sq = Math.min(aw / Q.w, ah / Q.h);
    const k = sq > sp * 1.04 ? 'landscape' : 'portrait';
    if (k !== kind || force) { kind = k; LY = k === 'portrait' ? P : Q; render(); }
    fitS = Math.min(aw / LY.w, ah / LY.h);
    const w = r.width / fitS, h = r.height / fitS;
    vb = { x: LY.w / 2 - w / 2, y: -(top / fitS) - ((ah / fitS) - LY.h) / 2, w, h };
    applyVB();
  }
  function applyVB() { if (vb) svg.setAttribute('viewBox', [vb.x, vb.y, vb.w, vb.h].map(f3).join(' ')); }
  function zoomAt(sx, sy, f) {
    const r = container.getBoundingClientRect(); const cur = r.width / vb.w; const ns = Math.min(fitS * 8, Math.max(fitS * 0.7, cur * f));
    const wx = vb.x + sx / cur, wy = vb.y + sy / cur;
    vb.w = r.width / ns; vb.h = r.height / ns; vb.x = wx - sx / ns; vb.y = wy - sy / ns; applyVB();
  }
  function panBy(dx, dy) { const r = container.getBoundingClientRect(); const cur = r.width / vb.w; vb.x -= dx / cur; vb.y -= dy / cur; applyVB(); }
  // ----- pointer handling: tap, long-press, pan, pinch, wheel -----
  const pts = new Map(); let tap = null, pinch = null, lpTimer = 0;
  const partAt = (x, y) => { const e = document.elementFromPoint(x, y); return e && e.closest && e.closest('[data-p]') ? e.closest('[data-p]').dataset.p : null; };
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'dblclick', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'wheel']) container.addEventListener(t, (e) => e.stopPropagation());
  svg.addEventListener('pointerdown', (e) => {
    try { svg.setPointerCapture(e.pointerId); } catch {}
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      const id = partAt(e.clientX, e.clientY);
      tap = { id, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, long: false };
      clearTimeout(lpTimer);
      lpTimer = setTimeout(() => { if (tap && !tap.moved && tap.id) { tap.long = true; navigator.vibrate?.(20); onLong?.(tap.id); } }, 480);
    } else if (pts.size === 2) {
      clearTimeout(lpTimer); if (tap) tap.moved = true;
      const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = container.getBoundingClientRect();
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      panBy(mx - pinch.mx, my - pinch.my); if (pinch.d > 0) zoomAt(mx - r.left, my - r.top, d / pinch.d);
      pinch = { d, mx, my }; return;
    }
    if (tap) {
      if (!tap.moved && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) { tap.moved = true; clearTimeout(lpTimer); }
      if (tap.moved && !tap.long) panBy(e.clientX - tap.lx, e.clientY - tap.ly);
      tap.lx = e.clientX; tap.ly = e.clientY;
    }
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId); clearTimeout(lpTimer);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0 && tap) { if (!tap.moved && !tap.long && e.type === 'pointerup') onTap?.(tap.id); tap = null; }
  };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  svg.addEventListener('touchend', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  svg.addEventListener('contextmenu', (e) => e.preventDefault());
  svg.addEventListener('wheel', (e) => { e.preventDefault(); const r = container.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  // Stops watching once the diagram leaves the page, so old diagrams can be freed (an observer keeps its target alive).
  const ro = new ResizeObserver(() => { if (!container.isConnected) { ro.disconnect(); return; } chooseAndFit(); }); ro.observe(container);

  return {
    build(m3d, { color } = {}) { G = geometry(m3d); paint = paintHex(color); kind = null; chooseAndFit(true); },
    refit() { chooseAndFit(); },
    setMarks(m) { marks = m || {}; restyle(); },
    select(id) { sel = id || null; restyle(); },
    setMulti(set) { multi = new Set(set || []); restyle(); },
    has(id) { return byId.has(id); },
    ids() { return [...byId.keys()]; },
    resetView() { chooseAndFit(); },
    get layout() { return kind; },
    get viewBox() { return vb && { ...vb }; },
    destroy() { ro.disconnect(); svg.remove(); },
  };
}
