/* R&R Auto Express: per make/model "look" profiles for the procedural 3D cars.
   Written by hand from our own reference notes (VEHICLE_REFERENCE_NOTES.md). They only tune the
   app's own parametric body (public/carbody.js): proportions, glass angles, lamp and grille sizes,
   trim colours. No third-party geometry, files or images are used. Every panel keeps its part ID.

   Shape fields (applied in specFor after the real size is set):
     hood   metres added to the hood length (moves the windshield base; + = longer hood)
     rake   windshield angle in degrees from horizontal (smaller = faster)
     fast   sedans: 0..1 how fastback the roof is (long shallow back glass); negative = more notchback
     hatch  hatch/SUV back glass angle in degrees from horizontal (larger = more upright)
     gc     ride height change (m); wr  wheel size scale; hoodF nose height change (m)
     belt   beltline height change (m); rise  beltline rise from cowl to tail (m)
   Styling fields (used by buildExterior):
     lampW  headlamp width as a share of the nose (each side); lampH headlamp height (m)
     grille 'chrome' | 'black' | 'body' | 'closed'; gH grille opening height (0..0.45)
     lowW / lowH  lower intake half width / half height (shares of the bumper)
     tailW  tail lamp width share (each side); tailBar  full-width light bar across the trunk/hatch
     blackRoof  gloss-black roof panel; clad  black wheel-arch cladding/flare width (m)
     gTrap  upper grille trapezoid taper (0..0.4); fogPods / fog:'square' fog lamp shape; valance:'black' lower bumper
     lampAngle  angular (pickup) headlamp cut; hoodBulge  raised centre hood dome (m); lowProfile  low-profile tyres
     finish  paint material override {metalness, roughness, clearcoat, clearcoatRoughness, sheen}; glass 'dark' | 'tint'
     crease  shoulder character line strength (1 = default)
   Presentation fields (car3d / carstudio): cam {side: 1 right / -1 left, az deg off the nose, el deg up},
     studio {bg backdrop colour, grad top-to-floor gradient, refl floor reflection strength (0 = none)}
*/
export const LOOKS = {
  // ---------- sedans ----------
  // 2021+ facelift: narrow black upper trapezoid, wide slatted lower intake with fog pods, slim projector lamps
  // with an amber strip under them, satin metallic silver, two-tone machined wheels, dark glass. Spec camera:
  // front 3/4 from the LEFT, ~25 deg up, flat mid-gray studio, contact shadow, no floor reflection.
  'toyota|camry':     { gen: 'XV70 2021-2024 facelift', hood: 0.05, rake: 29, fast: 0.45, rise: 0.05, lampW: 0.25, lampH: 0.11, grille: 'black', gH: 0.13, gTrap: 0.22, lowW: 0.27, lowH: 0.21, fogPods: true, tailW: 0.27, lowProfile: true,
                        finish: { metalness: 0.78, roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.16 }, glass: 'dark', crease: 1.6,
                        cam: { side: -1, az: 38, el: 25 }, studio: { bg: '#6e6e6e', grad: 0, refl: 0 } },
  'toyota|corolla':   { gen: 'E210 2020-2025', hood: -0.03, rake: 30, fast: 0.35, rise: 0.05, lampW: 0.26, lampH: 0.12, grille: 'black', gH: 0.14, lowW: 0.26, lowH: 0.21, tailW: 0.25 },
  'honda|civic':      { gen: '10th/11th gen 2016-2025', hood: 0.02, rake: 28, fast: 0.7, rise: 0.045, lampW: 0.27, lampH: 0.11, grille: 'black', gH: 0.2, lowW: 0.24, lowH: 0.18, tailW: 0.27 },
  'honda|accord':     { gen: '10th gen 2018-2022', hood: 0.06, rake: 28, fast: 0.75, rise: 0.04, gc: -0.01, wr: 1.04, lampW: 0.26, lampH: 0.11, grille: 'chrome', gH: 0.34, lowW: 0.22, lowH: 0.16, tailW: 0.27 },
  'nissan|altima':    { gen: '6th gen 2019-2025', hood: 0.04, rake: 28, fast: 0.5, rise: 0.045, gc: -0.01, wr: 1.03, lampW: 0.26, lampH: 0.11, grille: 'black', gH: 0.42, lowW: 0.2, lowH: 0.13, tailW: 0.26 },
  'hyundai|sonata':   { gen: 'DN8 2020-2025', hood: 0.08, rake: 27, fast: 0.8, rise: 0.045, gc: -0.01, wr: 1.03, lampW: 0.27, lampH: 0.1, grille: 'black', gH: 0.38, lowW: 0.2, lowH: 0.12, tailW: 0.2, tailBar: true },
  'hyundai|elantra':  { gen: 'CN7 2021-2025', hood: 0.02, rake: 26, fast: 0.75, rise: 0.05, lampW: 0.28, lampH: 0.1, grille: 'black', gH: 0.4, lowW: 0.18, lowH: 0.12, tailW: 0.2, tailBar: true },
  'chevrolet|malibu': { gen: '9th gen 2016-2025', hood: 0.06, rake: 28, fast: 0.55, rise: 0.045, lampW: 0.26, lampH: 0.11, grille: 'chrome', gH: 0.15, lowW: 0.25, lowH: 0.2, tailW: 0.27 },
  'tesla|model 3':    { gen: 'Highland 2024-2026', hood: -0.08, hoodF: -0.06, rake: 25, fast: 0.85, rise: 0.035, gc: -0.01, lampW: 0.24, lampH: 0.07, grille: 'closed', lowW: 0.18, lowH: 0.08, tailW: 0.24, blackRoof: true },
  // ---------- crossovers / SUVs / minivan ----------
  'toyota|rav4':      { gen: 'XA50 2019-2025', hood: 0.03, rake: 31, hatch: 62, rise: 0.04, lampW: 0.25, lampH: 0.13, grille: 'black', gH: 0.4, lowW: 0.25, lowH: 0.2, tailW: 0.22, clad: 0.07 },
  'honda|cr-v':       { gen: '6th gen 2023-2025', hood: 0.03, rake: 30, hatch: 64, rise: 0.045, lampW: 0.25, lampH: 0.12, grille: 'black', gH: 0.4, lowW: 0.24, lowH: 0.17, tailW: 0.18, clad: 0.06 },
  'nissan|rogue':     { gen: '3rd gen 2021-2025', hood: 0.02, rake: 31, hatch: 70, rise: 0.05, lampW: 0.24, lampH: 0.08, grille: 'chrome', gH: 0.44, lowW: 0.24, lowH: 0.2, tailW: 0.2, clad: 0.06, blackRoof: true },
  'chevrolet|equinox':{ gen: '4th gen 2025+', hood: 0.0, hoodF: 0.04, rake: 34, hatch: 73, rise: 0.03, lampW: 0.25, lampH: 0.07, grille: 'black', gH: 0.44, lowW: 0.25, lowH: 0.18, tailW: 0.2, clad: 0.08, blackRoof: true },
  'ford|escape':      { gen: '4th gen 2020-2025', hood: -0.02, rake: 28, hatch: 54, rise: 0.045, lampW: 0.27, lampH: 0.12, grille: 'black', gH: 0.4, lowW: 0.24, lowH: 0.18, tailW: 0.22, clad: 0.05 },
  'ford|explorer':    { gen: '6th gen 2020-2025', hood: 0.08, hoodF: 0.03, rake: 33, hatch: 72, rise: 0.025, lampW: 0.24, lampH: 0.1, grille: 'black', gH: 0.42, lowW: 0.25, lowH: 0.18, tailW: 0.24, clad: 0.06 },
  'toyota|highlander':{ gen: 'XU70 2020-2025', hood: 0.04, rake: 30, hatch: 58, rise: 0.05, lampW: 0.26, lampH: 0.12, grille: 'chrome', gH: 0.4, lowW: 0.22, lowH: 0.15, tailW: 0.24, clad: 0.04 },
  'jeep|grand cherokee': { gen: 'WL 2022-2025', hood: 0.1, hoodF: 0.03, rake: 33, hatch: 72, rise: 0.015, lampW: 0.25, lampH: 0.09, grille: 'chrome', gH: 0.4, lowW: 0.25, lowH: 0.17, tailW: 0.22, blackRoof: true },
  'tesla|model y':    { gen: 'Juniper 2025-2026', hood: -0.08, hoodF: -0.06, rake: 25, hatch: 38, rise: 0.04, lampW: 0.24, lampH: 0.07, grille: 'closed', lowW: 0.18, lowH: 0.08, tailW: 0.2, tailBar: true, blackRoof: true },
  'honda|odyssey':    { gen: '5th gen 2018-2025', hood: -0.02, rake: 30, hatch: 74, rise: 0.06, lampW: 0.25, lampH: 0.12, grille: 'black', gH: 0.4, lowW: 0.25, lowH: 0.17, tailW: 0.2 },
  // ---------- pickups ----------
  // default for an F-150 with no year or 2021+
  'ford|f-150':       { gen: '14th gen 2021-2025', hoodF: 0.03, rake: 44, rise: 0.0, wr: 1.03, lampW: 0.2, lampH: 0.26, grille: 'chrome', gH: 0.44, lowW: 0.24, lowH: 0.16, clad: 0.05 },
  // 13th gen (2015-2020): massive black two-bar grille, angular clear headlamps with reflector bowls, white upper
  // bumper over a black lower valance with square fog recesses, flared arches, black handles and wide black
  // mirrors, split black panoramic sunroof, sculpted hood, satin/pearl white. Spec camera: front 3/4 from the
  // RIGHT, ~37 deg up, gradient gray studio with a glossy floor and a soft blurred reflection.
  'ford|f-150|2015-2020': { gen: '13th gen 2015-2020', hoodF: 0.03, rake: 44, rise: 0.0, wr: 1.03, lampW: 0.205, lampH: 0.25, lampAngle: true, grille: 'black', gH: 0.44, lowW: 0.25, lowH: 0.13, clad: 0.075, valance: 'black', fog: 'square', hoodBulge: 0.035,
                        finish: { metalness: 0.08, roughness: 0.3, clearcoat: 0.75, clearcoatRoughness: 0.14, sheen: 0.35 }, glass: 'tint',
                        cam: { side: 1, az: 42, el: 37 }, studio: { bg: '#969696', grad: 0.22, refl: 0.3 } },
  'chevrolet|silverado': { gen: '4th gen 2019-2025', hoodF: 0.05, rake: 42, rise: 0.0, wr: 1.04, gc: 0.02, lampW: 0.2, lampH: 0.27, grille: 'black', gH: 0.45, lowW: 0.24, lowH: 0.16, clad: 0.07 },
  'gmc|sierra':       { gen: '4th gen 2019-2025', hoodF: 0.05, rake: 42, rise: 0.0, wr: 1.03, lampW: 0.2, lampH: 0.27, grille: 'chrome', gH: 0.45, lowW: 0.24, lowH: 0.16, clad: 0.04 },
  'ram|1500':         { gen: 'DT 2019-2026', hoodF: 0.02, rake: 38, rise: 0.012, wr: 1.02, lampW: 0.21, lampH: 0.22, grille: 'black', gH: 0.42, lowW: 0.24, lowH: 0.16, clad: 0.04 },
  'toyota|tacoma':    { gen: '4th gen 2024-2025', hoodF: 0.02, rake: 38, rise: 0.025, wr: 1.03, gc: 0.03, lampW: 0.22, lampH: 0.2, grille: 'black', gH: 0.42, lowW: 0.24, lowH: 0.17, clad: 0.09, blackRoof: true },
};

const norm = (x) => String(x || '').toLowerCase().trim();

// Profile for a vehicle, matched on make + model ("F-150 SuperCrew" matches "f-150"), or null.
export function lookFor(m = {}) {
  const mk = norm(m.make), md = norm(m.model).replace(/^(silverado|sierra) \d+.*$/, '$1');
  if (!mk || !md) return null;
  const keys = Object.keys(LOOKS).filter((k) => { const [a, b, g] = k.split('|'); if (g) return false; return a === mk && (md === b || md.startsWith(b + ' ') || md.startsWith(b + '-') || md.startsWith(b)); });
  keys.sort((a, b) => b.length - a.length);
  if (!keys.length) return null;
  // generation-specific entries 'make|model|YYYY-YYYY' win when the vehicle's year falls inside the range
  const yr = +m.year || 0;
  const genKey = yr ? Object.keys(LOOKS).find((k) => { const p = k.split('|'); if (p.length !== 3 || p[0] + '|' + p[1] !== keys[0]) return false; const [y0, y1] = p[2].split('-').map(Number); return yr >= y0 && yr <= y1; }) : null;
  return genKey ? { key: genKey, ...LOOKS[genKey] } : { key: keys[0], ...LOOKS[keys[0]] };
}

const clampN = (v, a, b) => Math.min(b, Math.max(a, v));

// Apply a profile's shape fields to a body spec in place (metres; d = distance from the front bumper).
export function applyLook(s, k) {
  if (!k) return s;
  const pickup = s.style === 'pickup', d0 = s.doors[0][0], lastEnd = s.doors[s.doors.length - 1][1];
  if (k.gc) s.gc = clampN(s.gc + k.gc, 0.1, 0.36);
  if (k.wr) s.wr = clampN(s.wr * k.wr, 0.29, 0.46);
  if (k.belt) s.belt += k.belt;
  if (k.hoodF) s.hoodF += k.hoodF;
  s.hoodF = Math.min(s.hoodF, s.belt - 0.06);
  if (k.rise !== undefined) s.rise = clampN(k.rise, 0, 0.08);
  if (k.hood && !pickup) {
    const c = clampN(s.cowl + k.hood, d0 - 0.4, d0 + 0.02), dl = c - s.cowl;
    s.cowl = c; s.roofF += dl;
  }
  if (k.rake) {
    const h = s.roof - (s.belt + 0.015);
    const run = clampN(h / Math.tan((k.rake * Math.PI) / 180) * 0.85, 0.3, 1.0);
    s.roofF = clampN(s.cowl + run, s.cowl + 0.3, s.doors[0][1] - 0.25);
  }
  if (s.rear === 'sedan' && k.fast) {
    s.roofR = clampN(s.roofR - 0.32 * k.fast, s.roofF + 0.45, s.deckF - 0.25);
    s.deckF = clampN(s.deckF + 0.08 * k.fast, s.roofR + 0.3, s.L - 0.3);
    s.deckY = s.deckY + 0.02 * Math.max(0, k.fast);
  }
  if (s.rear === 'hatch' && k.hatch && s.base) {
    const drop = s.roof - s.belt;
    const run = clampN(drop / Math.tan((k.hatch * Math.PI) / 180), 0.08, 0.75);
    s.roofR = clampN(s.base - run, Math.max(s.roofF + 0.6, lastEnd + 0.04), s.base - 0.06);
  }
  s.roof = Math.max(s.roof, s.belt + 0.32);
  return s;
}
