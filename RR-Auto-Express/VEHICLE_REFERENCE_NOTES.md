# Vehicle reference notes for the 3D picker

Written Nov 15 2026 from looking at the public preview pictures on 3dmodels.org product pages, the way an artist looks at photos.
Nothing was bought, downloaded or saved from the site: no model files, no 3D viewer data, no preview images. These notes are our own words; the app's geometry is its own procedural code (public/carbody.js + public/car3d.js), tuned per make/model from these notes and the real dimensions already in src/catalog.js.

Angles are rough visual estimates in degrees from horizontal.

## Toyota Camry (XV70, 2018-2024; reference: XSE 2021)
- Body: mid-size sedan, low and wide.
- Side: medium-long hood; windshield ~30 deg; rear glass long and fastback-like into a short trunk deck; curved roof (XSE: black roof); moderate overhangs; standard ride height; large wheels; rising beltline.
- Front: angular swept-back headlamps; slim wing-shaped upper grille over a very large lower mesh mouth that dominates the bumper.
- Rear: wide wraparound tail lamps cutting into the trunk lid.
- Lines: sharp rising door crease, strong hood lines; black pillars.

## Toyota Corolla sedan (E210, 2020-2025; reference: XLE US-spec 2022)
- Body: compact sedan.
- Side: moderately short sloped hood; windshield ~30 deg; gentle rear glass ~25 deg; curved flowing roof; moderate front overhang, short rear; standard ride height; ~16-18 in wheels; beltline sloping up to the rear.
- Front: sharp J-shaped angular headlamps; tiny upper grille slot with emblem; very large trapezoidal lower mesh intake.
- Lines: strong shoulder crease front door to rear, rising lower door crease; black B/C pillars, body-color roof.

## Honda Civic sedan (10th/11th gen, 2016-2025; reference: LX sedan 2022)
- Body: compact sedan with fastback roof.
- Side: medium sloped hood; windshield ~30 deg; long shallow fastback rear glass; aerodynamic roof curve; short overhangs; standard ride height; medium wheels; rising beltline.
- Front: sleek angular headlamps; narrow black upper grille bar; wide lower intake with side pods.
- Lines: rising shoulder crease, sweeping lower body line; black B pillars.

## Honda Accord (10th gen, 2018-2022; reference: Sport US-spec 2021)
- Body: mid-size sedan with coupe-like fastback roof.
- Side: medium-long hood; windshield ~30 deg; long shallow fastback rear glass; sloping roof; short front overhang, moderate rear; low-slung; large 19 in wheels (Sport); rising crease.
- Front: sleek swept-back headlamps; large grille with thick chrome upper bar ('wing'); wide lower intake.
- Lines: sharp upper character line; black B pillars.

## Nissan Altima (6th gen, 2019-2025; reference: SR 2025)
- Body: mid-size sedan.
- Side: moderate hood; windshield ~25-30 deg; rear glass ~25 deg; sweeping arched roof; moderate overhangs; low ride height; large wheels; straight rising beltline.
- Front: sharp angular swept-back headlamps; large V-motion grille (deep V shape reaching down into the bumper); slim lower intake with side vents.
- Lines: strong upper crease from headlamp to tail lamp, rising lower crease; blacked-out B/C pillars (floating roof).

## Hyundai Sonata (DN8, 2020-2025; reference: US-spec 2022)
- Body: mid-size sedan, fastback 4-door-coupe look.
- Side: long hood; windshield ~30 deg; shallow fastback rear glass; sloping coupe roof; moderate overhangs; low ride height; large wheels; rising beltline.
- Front: long swept-back headlamps; chrome DRL strip running from the headlamps back along the hood edge; large cascading grille; thin lower intake.
- Rear: full-width light bar across the trunk lid.
- Lines: sharp rising side crease; black B pillars, body-color roof.

## Chevrolet Malibu (9th gen, 2016-2025; reference: 2019)
- Body: mid-size sedan.
- Side: medium-long hood; windshield ~25-30 deg; shallow sloping fastback-like rear glass; sweeping coupe roof; moderate front overhang, long rear; standard ride height; ~18 in wheels; beltline rising to the rear.
- Front: narrow swept-back headlamps; split grille: thin upper slot, large trapezoidal lower; fog vents at the corners.
- Lines: two prominent sweeping side creases; black B pillars, body-color roof.

## Ford F-150 (14th gen, 2021-2025; reference: SuperCrew 5.5 ft XLT 2024)
- Body: full-size pickup, crew cab, short bed.
- Side: long, high, flat hood; windshield ~45 deg (upright); big crew cab dominates the short bed; short front overhang, medium rear; high ride height; large wheels; beltline dips at the front door window.
- Front: C-clamp headlamps wrapping around the grille corners; large rectangular grille; body-color bumper on XLT.
- Lines: subtle shoulder line; prominent squared wheel flares; black B pillars.

## Hyundai Elantra (CN7, 2021-2025; reference: US-spec 2023)
- Body: compact sedan, coupe-like fastback roof.
- Side: moderate sloping hood; steeply raked windshield (~25-28 deg); fastback rear glass; coupe roof; short overhangs; standard ride height; medium-large wheels; rising beltline.
- Front: sharp angular swept-back headlamps that merge into a wide jewel-pattern grille; triangular side vents, slim lower lip.
- Rear: full-width H-shaped light bar.
- Lines: signature sharp Z-shaped triangular crease across the doors; blacked-out B pillars.

## Chevrolet Silverado 1500 (4th gen, 2019-2025; reference: Crew Cab ZR2 2025)
- Body: full-size pickup, crew cab.
- Side: high, squared hood; fairly upright windshield; cab longer than bed on crew cab short bed; short front overhang, moderate rear; high ride height; large tires; straight, high beltline.
- Front: slim horizontally split headlamps with C-shaped DRLs; massive wide grille; high bumper with tow hooks.
- Lines: strong shoulder lines; prominent square wheel-arch flares (black on ZR2/Trail Boss); blacked-out B pillars.

## Ram 1500 (5th gen DT, 2019-2026; reference: BackCountry 2026)
- Body: full-size pickup, crew cab; cab:bed about 60:40.
- Side: moderately long high hood with a power bulge; windshield more raked than Ford/Chevy; short front overhang, moderate rear; high ride height; 18-20 in wheels; straight beltline rising slightly to the rear.
- Front: rectangular headlamps with LED signatures; large mesh grille with RAM lettering; bumper with integrated fog lamps.
- Lines: sharp hood character lines; mild rounded fender flares; blacked-out B pillars. Softer, more rounded overall than F-150/Silverado.

## Toyota RAV4 (XA50, 2019-2025; reference: hybrid Style 2022)
- Body: compact SUV, rugged/boxy styling.
- Side: medium hood; windshield ~30 deg; hatch ~45 deg; flat, slightly tapering roof; short overhangs; moderate SUV ride height; ~18 in wheels; beltline rising slightly to the rear.
- Front: sharp angular headlamps; trapezoid hexagonal-mesh grille; wide blocky lower mesh.
- Lines: sharp shoulder crease and a lower door kick-up; angular, squared black wheel-arch flares and cladding; black pillars and (on some trims) black roof.

## Honda CR-V (6th gen, 2023-2025; reference: 2023)
- Body: compact SUV.
- Side: moderate sloping hood; steeply raked windshield; moderately steep hatch; slightly tapering roof; short overhangs; moderate SUV ride height; medium wheels; beltline rising to a kink at the rear quarter window.
- Front: sleek wraparound headlamps; upright black grille with honeycomb mesh; wide lower intake.
- Lines: sharp shoulder line; black wheel-arch and lower-door cladding; black B and C pillars.

## Toyota Tacoma (4th gen, 2024-2025; reference: Double Cab Short Bed TRD Pro 2025)
- Body: mid-size pickup, double cab, short bed.
- Side: long high hood with scoop; windshield more raked than full-size trucks; large cab, short bed; short overhangs; high ground clearance; large wheels; rising beltline with a kink at the rear door.
- Front: angular bracket/C-shaped headlamps; large black grille; high off-road bumper.
- Lines: sharp chiseled door creases; big angular black fender flares; blacked-out pillars and roof (TRD Pro).

## Nissan Rogue (3rd gen, 2021-2025; reference: Platinum 2023)
- Body: compact SUV.
- Side: moderate hood; windshield ~30 deg; near-vertical hatch; straight, slightly sloping roof; short overhangs; moderate ride height; large wheels; beltline rising, upswept at the rear quarter.
- Front: split-level lamps (thin DRL on top, main lamps lower in the bumper); V-motion chrome grille outline; wide trapezoidal lower intake with silver skid plate.
- Lines: sharp shoulder line, lower door crease; black cladding; black pillars with two-tone black roof.

## Chevrolet Equinox (4th gen, 2025+; reference: RS 2025)
- Body: compact SUV, boxy and upright.
- Side: short-medium hood, high and flat; fairly upright windshield; upright hatch; flat roof; short overhangs; moderate ride height; large wheels; rising beltline.
- Front: split lamps (thin DRLs high, main units lower); massive blacked-out grille; black lower lip.
- Lines: sharp shoulder crease, muscular squared arches with thick black cladding; black pillars with floating roof.

## Tesla Model Y (Juniper, 2025-2026; reference: Standard 2026)
- Body: crossover with fastback hatch.
- Side: short, low hood; very raked windshield ~25 deg; steeply sloped fastback hatch; continuous arched roof; short overhangs; crossover ride height; 19-20 in aero wheels; high rising beltline.
- Front: slim horizontal headlamps (light bar across the nose on Juniper); no grille; slim lower intake.
- Lines: clean body with minimal creases; black pillars and panoramic glass roof.

## Jeep Grand Cherokee (WL, 2022-2025; reference: Summit Reserve 2025)
- Body: mid-size SUV, long and horizontal.
- Side: long flat hood; fairly upright windshield; near-upright hatch ~75 deg; straight flat roof; short front overhang, moderate rear; elevated ride height; large wheels; straight horizontal beltline.
- Front: slim rectangular headlamps; 7-slot grille; wide rectangular lower intake with side pods.
- Lines: sharp shoulder line; body-color arches on Summit (black on Laredo/Trailhawk); black pillars and black roof.

## Toyota Highlander (XU70, 2020-2025; reference: Platinum hybrid 2024)
- Body: 3-row mid-size SUV.
- Side: medium-long sloped hood; windshield ~30 deg; sloped hatch ~45 deg; roof tapering to the rear; moderate overhangs; crossover ride height; large wheels; rising beltline.
- Front: sharp swept-back headlamps; trapezoid black mesh grille with chrome wing; slim lower intake.
- Lines: swooping line kicking up over the rear wheel arch; light black lower cladding; blacked-out A/B/C pillars.

## Ford Escape (4th gen, 2020-2025; reference: Plug-In Hybrid 2025)
- Body: compact crossover, car-like.
- Side: moderate-short sloping hood; raked windshield; strongly sloped hatch; gently curved roof sloping rearward; moderate front overhang, short rear; crossover ride height; large wheels; rising beltline.
- Front: elongated swept-back headlamps; wide octagonal mesh grille; wide lower intake with fog surrounds.
- Lines: subtle upper character line; black lower cladding; blacked-out B and C pillars.

## Ford Explorer (6th gen, 2020-2025; reference: Timberline 2024)
- Body: 3-row mid-size SUV, rear-drive proportions.
- Side: medium-long hood, long dash-to-axle; windshield ~35 deg; hatch steep ~75 deg; flat roof with rails; short front overhang, moderate rear; elevated ride height; 18-20 in wheels with tall tires; straight beltline rising slightly to the rear.
- Front: slim horizontal headlamps; wide hexagonal mesh grille; wide rectangular lower intake.
- Rear: wide horizontal tail lamps, upright hatch.
- Lines: strong shoulder crease; black cladding on arches and sills (Timberline/XLT trims); blacked-out A/B/D pillars with a body-color angled C-pillar.

## Honda Odyssey (5th gen, 2018-2025; reference: Elite 2024)
- Body: minivan, sliding rear doors.
- Side: short hood; fast windshield ~30-35 deg, nearly continuous with hood; flat roof with rear spoiler; slightly sloped hatch; sliding-door track hidden under the rear quarter glass; moderate overhangs; minivan ride height; large wheels.
- Signature: lightning-bolt kink in the beltline where it drops behind the sliding door.
- Front: wide angular headlamps; large multi-slat black grille; wide lower intake.
- Lines: strong lower body character line; blacked-out pillars giving a floating roof.

## Tesla Model 3 (Highland, 2024-2026; reference: Standard 2026)
- Body: fastback sedan (separate trunk lid).
- Side: short, low, sloping hood; very fast windshield ~25-30 deg; fastback rear glass flowing into a short trunk deck; smooth arched roof; short overhangs; low ride height; 18-19 in wheels; slightly upswept beltline.
- Front: ultra-slim horizontal headlamps; no grille (closed nose); thin lower slot.
- Lines: subtle shoulder line, upswept lower door crease; continuous glass canopy with black pillars.


## Spec renders sent by the user (Nov 15, 2026)
- Camry (2021+ facelift) target: satin metallic silver; narrow black upper trapezoid grille + wide black lower grille with
  horizontal slats; centred oval badge (we use a generic emblem); slim LED projector lamps, amber strip below; wide lower
  intake with fog pods and parking sensors; sharp shoulder line; chrome handles; body-colour mirrors on black bases;
  black window trim; two-tone machined multi-spoke wheels, low-profile tyres; dark tinted glass; red LED tail at the edge.
  Camera front 3/4 LEFT, ~25 deg up; flat #6e6e6e background, contact shadow, no reflection.
- F-150 (13th gen, 2015-2017 style) target: crew cab, short bed; satin pure white; massive black two-bar grille with oval
  badge (generic emblem); angular clear headlamps with reflectors; white upper bumper, black lower valance, square fog
  recesses; black split panoramic sunroof; ribbed white bed walls; black handles, wide black mirrors, flared arches;
  5-spoke gunmetal wheels, red calipers, all-terrain tyres. Camera front 3/4 RIGHT, ~35-40 deg up; gradient #8a8a8a,
  glossy floor with soft blurred reflection.
