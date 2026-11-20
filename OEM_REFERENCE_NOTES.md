# OEM reference notes (from 7zap, used as a technician's reference only)

Written Nov 15, 2026. These are my own notes after reading a handful of public 7zap pages the way a
technician would look something up. No diagrams, images, part numbers or lists were copied into the
app or stored here. 7zap's terms forbid copying, storing or extracting its content, so nothing in
this file is 7zap data: it is a list of gaps in OUR catalog (src/catalog.js), described in our words.

Pages looked at (USA region, about ten pages total):
- Hyundai Sonata DN8 (2019-2024): Front bumper, Rear bumper, Fender & hood panel,
  Fender apron & radiator support panel, and the Panels/Structural Elements group list.
- Toyota Camry XV70 facelift (2021-2025): Bumpers group list, Front bumper & bumper stay.
- Ford: the USA car and van lists. The F-150 is NOT in 7zap's Ford USA car or van catalogs
  (cars list Mustang S550, Explorer, Ranger, Maverick, Edge etc.; vans list only Transit models),
  so trucks could not be compared.

## What 7zap shows without paying
- Group tree per generation (Body/Exterior > Panels/Structural, Doors, Bumpers, Glass/Mirrors,
  Exterior lighting, etc.).
- Per diagram: part names, quantity, and a masked OEM number (e.g. first two digits only, rest
  starred). Diagrams need a free account; full numbers need a paid plan. No prices on the page,
  only an "Offers" link per row.
- Lists on the public pages look capped at about 20 rows, so they are partial.
- VIN decoder per make, and a search box for part number, name, VIN or frame.

## Gaps in our catalog, by area

### Front bumper
- **Lower bumper molding / lip** (Hyundai lists a lower molding assembly; Toyota lists bumper
  garnishes, including side garnishes). Add: `fbumper_molding_lower`, `fbumper_garnish_l/_r`.
- **Front turn signal / side marker lamps** mounted in the bumper (Sonata DN8 has them as their
  own lamp assemblies, left and right). We only have fog lamps. Add `turn_lamp_f_l/_r`.
- **Front bumper wiring harness** (Hyundai lists several versions depending on sensors). Common
  replace item when sensor pigtails are torn. Add `fbumper_harness`.
- **Bumper side cover / end piece** (Hyundai lists a separate left cover piece next to the main
  cover). Optional; model-specific.
- **Lower energy absorber** (Toyota lists an upper absorber AND a lower absorber). We have one
  absorber. Add `fbumper_absorber_lower`.
- **Park sensors are sold one at a time, and in paint-specific versions** (both makes list the
  ultrasonic sensor with quantity 2 or 4 and several colour suffixes). Our item is a "set".
  Change to a per-sensor item with a quantity, and flag "may need painting / colour-specific".
- **Naming**: our "Front bumper bracket, left/right" matches what Toyota calls the bumper side
  retainer and Hyundai calls the side mounting bracket. Rename to
  "Front bumper side retainer/bracket, left/right" so either wording is found by search.
- **Naming**: our "Grille" vs "Grille carrier": on the Sonata the upper grille is listed as an
  upper radiator grille cover. Fine as is; add "upper" to the label for clarity.

### Rear bumper
- **Rear bumper stays** (Hyundai lists left/right stays separately from the side brackets).
  Add `rbumper_stay_l/_r`.
- **Side mounting retainers / slides** are separate small parts. Our side brackets cover this;
  rename as above.
- **Rear side marker / repeater lamps** in the bumper (Hyundai lists bulb holders for side
  repeaters). Add `marker_lamp_r_l/_r` as optional.
- **Rear park sensors** are 4 individual sensors, paint-specific. Same change as front.
- **Rear bumper wiring harness**: not seen in the capped list, but present on sensor-equipped
  cars. Add `rbumper_harness` (same reasoning as front).

### Hood and fenders
- **Fender insulators (foam blocks)**: Hyundai lists an upper and a lower insulator per side.
  We have none. Add `fender_insulator_l/_r` (one line each, covers upper+lower).
- **Hood hinges, hood panel, fender panels**: we have these; names match.

### Radiator support / front structure (biggest naming issue)
- **Radiator support vs carrier**: on the Sonata the front is not one welded radiator support.
  It is a bolted carrier with an upper carrier mounting bracket per side, plus an upper headlamp
  support reinforcement per side. Rename `radiator_support` to
  "Radiator support / front-end carrier" and add `headlamp_support_reinf_l/_r` and
  `carrier_bracket_upper_l/_r`.
- **Front frame rail**: on unibody cars (Sonata) the OEM name is front side member, with a
  separate lower extension per side. Rename to "Front side member (frame rail), left/right"
  and add `side_member_ext_lower_l/_r`.
- **Fender mounting brackets**: front-upper, rear-upper, and a fender-to-bumper bracket per side
  are separate parts on the Sonata. Add `fender_bracket_front_upper_l/_r`,
  `fender_bracket_rear_upper_l/_r`, `fender_bumper_bracket_l/_r`. These break often in front hits.
- **Dash panel (firewall)**: Hyundai lists the structural dash panel in this group. Our only
  "Dash panel" is the interior instrument panel trim, which could be picked by mistake. Add a
  structural `firewall` ("Dash panel / firewall (structural)") and rename the interior one to
  "Instrument panel (dash trim)".

### Other structural groups we don't model
Hyundai's Panels/Structural group also has: floor panel, cowl panel, roof panel, back panel &
trunk lid, side body panel, under cover.
- **Engine under cover / splash shield**: missing, and it is one of the most common front-hit
  lines. Add `engine_undercover` (and `splash_shield_l/_r` if the car has side pieces).
- **Cowl panel (structural)**: we only have the plastic cowl grille. Add `cowl_panel_inner`.
- **Floor pan**: add `floor_pan` (structural, list-only) for side and rear hits.
- Back panel = our "Rear body panel"; side body panel = our quarter/rocker/pillar outers. OK.

### Trucks (F-150, Silverado, Tacoma)
Could not be compared: 7zap has no F-150 in its USA Ford lists. Use a different reference for
trucks (dealer parts sites or the PartsTech catalog once keys arrive).

## Suggested order of fixes
1. Renames (side member, radiator support/carrier, bumper retainers, firewall vs dash trim).
2. High-frequency adds: engine under cover, fender insulators, fender brackets, lower bumper
   molding, front turn/marker lamps, bumper harnesses, lower absorber.
3. Park sensors to per-sensor items with quantity and a paint flag.
4. Structural adds: headlamp support reinforcements, carrier brackets, side member extensions,
   firewall, inner cowl, floor pan. Each needs an X-ray mesh mapping in the 3D picker, so do this
   after the 3D task that is currently editing car3d.js / carbody.js finishes.

## Proposed (not built): "Look up OEM part #" button
- Where: part details panel, under the operation buttons.
- What it opens, in a new tab: 7zap's VIN decoder for the vehicle's make,
  `https://7zap.com/en/vin-decoder/<make>/`, with the estimate's VIN copied to the clipboard, or
  if there is no VIN, the make's USA catalog page `https://7zap.com/en/catalog/cars/<make>/#region=usa`.
  Deep links to a generation need 7zap's own page names (e.g. `sonata-dn8-parts-catalog`), which
  we'd have to keep a small hand-made table for; start with the make-level link.
- The app never fetches 7zap pages itself; the user just opens the site, like a bookmark.
- Terms: 7zap's free plan is personal-use only and not for workshops; paid plans allow
  professional use for specific customer jobs, one person per account, no API or bulk rights.
  So each person who uses the button needs their own paid 7zap account.
