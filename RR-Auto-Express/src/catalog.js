// Generic parts catalog + sample labor guide, per body style.
// EVERY hour and price here is SAMPLE data for demonstration. Shops replace it with their licensed
// estimating database (CCC ONE / Mitchell / Audatex) or a VIN-specific OEM parts catalog.
//
// Tuple: [key, name, group, assembly, mesh, styles, ops, laborType, replaceH, repairH, teardownH, refinishH, oemPrice, partTypes, adas, aiLabel]
//   styles: S=sedan C=coupe T=truck U=suv (string of letters)
//   ops: P=replace R=repair I=R&I F=refinish B=blend X=operation only (no part)
//   partTypes: O=OEM A=aftermarket U=recycled/used R=reconditioned

const ALL = 'SCTU';
const CARS = 'SCU'; // body styles with a trunk/hatch instead of a pickup bed
const rows = [];
const P = (...t) => rows.push(t);

// ---- Front end (front bumper assembly drill-down) ----
P('fbumper_cover', 'Front bumper cover', 'Front end', 'front_bumper', 'fbumper_cover', ALL, 'PRIF', 'body', 1.5, 2.0, 1.2, 2.8, 540, 'OAUR', '', 'front bumper');
P('fbumper_reinf', 'Front bumper reinforcement', 'Front end', 'front_bumper', 'fbumper_reinf', ALL, 'PI', 'body', 1.0, 0, 1.2, 0, 310, 'OAU', '', '');
P('fbumper_absorber', 'Front energy absorber', 'Front end', 'front_bumper', 'fbumper_absorber', ALL, 'P', 'body', 0.3, 0, 1.2, 0, 95, 'OA', '', '');
P('grille', 'Grille', 'Front end', 'front_bumper', 'grille', ALL, 'PI', 'body', 0.5, 0, 0.3, 0, 290, 'OAU', '', 'grille');
P('grille_lower', 'Lower grille', 'Front end', 'front_bumper', 'grille_lower', ALL, 'PI', 'body', 0.3, 0, 1.2, 0, 85, 'OA', '', '');
P('fog_lamp_l', 'Fog lamp, left', 'Front end', 'front_bumper', 'fog_lamp_l', ALL, 'PI', 'body', 0.4, 0, 0.3, 0, 120, 'OA', '', '');
P('fog_lamp_r', 'Fog lamp, right', 'Front end', 'front_bumper', 'fog_lamp_r', ALL, 'PI', 'body', 0.4, 0, 0.3, 0, 120, 'OA', '', '');
P('front_radar', 'Front radar sensor (ACC / AEB)', 'Front end', 'front_bumper', 'front_radar', ALL, 'PI', 'mech', 0.5, 0, 1.2, 0, 980, 'OU', 'Front radar calibration', '');
P('park_sensor_f', 'Front park sensors (set)', 'Front end', 'front_bumper', 'park_sensor_f', ALL, 'PI', 'body', 0.4, 0, 1.2, 0, 160, 'OA', 'Park assist sensor check', '');
P('fbumper_bracket_l', 'Front bumper bracket, left', 'Front end', 'front_bumper', 'fbumper_bracket_l', ALL, 'P', 'body', 0.3, 0, 1.2, 0, 32, 'OA', '', '');
P('fbumper_bracket_r', 'Front bumper bracket, right', 'Front end', 'front_bumper', 'fbumper_bracket_r', ALL, 'P', 'body', 0.3, 0, 1.2, 0, 32, 'OA', '', '');
P('license_bracket_f', 'Front license bracket', 'Front end', 'front_bumper', 'license_bracket_f', ALL, 'P', 'body', 0.2, 0, 0, 0, 28, 'OA', '', '');
P('tow_hook_cover', 'Tow hook cover', 'Front end', 'front_bumper', 'tow_hook_cover', ALL, 'PF', 'body', 0.1, 0, 0, 0.3, 24, 'OA', '', '');
P('grille_insert', 'Grille insert (mesh)', 'Front end', 'front_bumper', 'grille_insert', ALL, 'PI', 'body', 0.4, 0, 0.3, 0, 140, 'OA', '', '');
P('grille_emblem', 'Front emblem', 'Front end', 'front_bumper', 'grille_emblem', ALL, 'PI', 'body', 0.2, 0, 0.1, 0, 65, 'OA', '', '');
P('grille_carrier', 'Grille carrier / mounting panel', 'Front end', 'front_bumper', 'grille_carrier', ALL, 'PI', 'body', 0.6, 0, 0.4, 0, 120, 'OA', '', '');
P('fog_bezel_l', 'Fog lamp bezel, left', 'Front end', 'front_bumper', 'fog_bezel_l', ALL, 'PI', 'body', 0.2, 0, 0.1, 0, 38, 'OA', '', '');
P('fog_bezel_r', 'Fog lamp bezel, right', 'Front end', 'front_bumper', 'fog_bezel_r', ALL, 'PI', 'body', 0.2, 0, 0.1, 0, 38, 'OA', '', '');

// ---- Hood & fenders ----
P('hood', 'Hood panel', 'Hood & fenders', 'hood', 'hood', ALL, 'PRIFB', 'body', 1.0, 3.0, 0.6, 3.2, 820, 'OAUR', '', 'hood');
P('hood_insulator', 'Hood insulator', 'Hood & fenders', 'hood', 'hood_insulator', ALL, 'P', 'body', 0.2, 0, 0, 0, 65, 'OA', '', '');
P('hood_hinge_l', 'Hood hinge, left', 'Hood & fenders', 'hood', 'hood_hinge_l', ALL, 'PF', 'body', 0.6, 0, 0.6, 0.4, 70, 'OA', '', '');
P('hood_hinge_r', 'Hood hinge, right', 'Hood & fenders', 'hood', 'hood_hinge_r', ALL, 'PF', 'body', 0.6, 0, 0.6, 0.4, 70, 'OA', '', '');
P('hood_latch', 'Hood latch', 'Hood & fenders', 'hood', 'hood_latch', ALL, 'PI', 'body', 0.4, 0, 0.3, 0, 55, 'OA', '', '');
P('hood_strut', 'Hood lift supports / prop rod', 'Hood & fenders', 'hood', 'hood_strut', ALL, 'P', 'body', 0.2, 0, 0, 0, 40, 'OA', '', '');
P('hood_emblem', 'Hood emblem', 'Hood & fenders', 'hood', 'hood_emblem', ALL, 'PI', 'body', 0.2, 0, 0, 0, 45, 'O', '', '');
P('fender_l', 'Fender, left', 'Hood & fenders', '', 'fender_l', ALL, 'PRIFB', 'body', 1.8, 2.5, 0.8, 2.3, 410, 'OAUR', '', 'left fender');
P('fender_r', 'Fender, right', 'Hood & fenders', '', 'fender_r', ALL, 'PRIFB', 'body', 1.8, 2.5, 0.8, 2.3, 410, 'OAUR', '', 'right fender');
P('fender_liner_l', 'Fender liner, left', 'Hood & fenders', '', 'fender_l', ALL, 'PI', 'body', 0.4, 0, 0.4, 0, 60, 'OA', '', '');
P('fender_liner_r', 'Fender liner, right', 'Hood & fenders', '', 'fender_r', ALL, 'PI', 'body', 0.4, 0, 0.4, 0, 60, 'OA', '', '');

// ---- Lamps ----
P('headlamp_l', 'Headlamp assembly, left', 'Lamps', '', 'headlamp_l', ALL, 'PI', 'body', 0.6, 0, 1.2, 0, 760, 'OAUR', 'Headlamp aim', 'left headlamp');
P('headlamp_r', 'Headlamp assembly, right', 'Lamps', '', 'headlamp_r', ALL, 'PI', 'body', 0.6, 0, 1.2, 0, 760, 'OAUR', 'Headlamp aim', 'right headlamp');
P('tail_lamp_l', 'Tail lamp, left', 'Lamps', '', 'tail_lamp_l', ALL, 'PI', 'body', 0.3, 0, 0.3, 0, 260, 'OAU', '', 'left tail lamp');
P('tail_lamp_r', 'Tail lamp, right', 'Lamps', '', 'tail_lamp_r', ALL, 'PI', 'body', 0.3, 0, 0.3, 0, 260, 'OAU', '', 'right tail lamp');
P('chmsl', 'High-mount stop lamp', 'Lamps', '', 'roof', ALL, 'PI', 'body', 0.3, 0, 0.2, 0, 85, 'OA', '', '');

// ---- Doors (door drill-down) ----
const DOORS = [
  ['lf', 'front door, left', ALL, true], ['rf', 'front door, right', ALL, true],
  ['lr', 'rear door, left', 'STU', false], ['rr', 'rear door, right', 'STU', false],
];
for (const [d, label, st, front] of DOORS) {
  const side = d[0] === 'l' ? 'left' : 'right';
  const asm = 'door_' + d;
  const nm = (x) => `${x}, ${label}`;
  P(`${asm}_shell`, nm('Door shell'), 'Doors', asm, `${asm}_shell`, st, 'PRIF', 'body', 3.0, 3.5, 1.0, 3.6, 1150, 'OAU', '', `${side} ${front ? 'front' : 'rear'} door`);
  P(`${asm}_skin`, nm('Door outer skin'), 'Doors', asm, `${asm}_skin`, st, 'PRF', 'body', 3.4, 3.0, 1.6, 2.6, 380, 'O', '', '');
  P(`${asm}_glass`, nm('Door glass'), 'Doors', asm, `${asm}_glass`, st, 'PI', 'glass', 0.8, 0, 0.8, 0, 240, 'OAU', '', '');
  P(`${asm}_regulator`, nm('Window regulator'), 'Doors', asm, `${asm}_regulator`, st, 'P', 'mech', 1.0, 0, 0.8, 0, 190, 'OA', '', '');
  P(`${asm}_motor`, nm('Window motor'), 'Doors', asm, `${asm}_motor`, st, 'P', 'mech', 0.6, 0, 0.8, 0, 150, 'OA', '', '');
  P(`${asm}_lock`, nm('Door lock actuator'), 'Doors', asm, `${asm}_lock`, st, 'P', 'mech', 0.8, 0, 0.8, 0, 175, 'OA', '', '');
  P(`${asm}_handle_out`, nm('Outside handle'), 'Doors', asm, `${asm}_handle_out`, st, 'PIF', 'body', 0.5, 0, 0.8, 0.3, 85, 'OA', '', '');
  P(`${asm}_handle_in`, nm('Inside handle'), 'Doors', asm, `${asm}_handle_in`, st, 'P', 'body', 0.3, 0, 0.6, 0, 45, 'OA', '', '');
  P(`${asm}_trim`, nm('Door trim panel'), 'Doors', asm, `${asm}_trim`, st, 'PI', 'body', 0.6, 0, 0.6, 0, 420, 'OU', '', '');
  P(`${asm}_weatherstrip`, nm('Door weatherstrip'), 'Doors', asm, `${asm}_weatherstrip`, st, 'P', 'body', 0.4, 0, 0, 0, 110, 'OA', '', '');
  P(`${asm}_belt`, nm('Belt molding'), 'Doors', asm, `${asm}_belt`, st, 'P', 'body', 0.3, 0, 0, 0, 70, 'OA', '', '');
  P(`${asm}_speaker`, nm('Door speaker'), 'Doors', asm, `${asm}_speaker`, st, 'P', 'mech', 0.3, 0, 0.6, 0, 90, 'OA', '', '');
  P(`${asm}_harness`, nm('Door wiring harness'), 'Doors', asm, `${asm}_harness`, st, 'P', 'mech', 1.5, 0, 1.0, 0, 260, 'O', '', '');
  P(`${asm}_hinges`, nm('Door hinges (set)'), 'Doors', asm, `${asm}_hinges`, st, 'PF', 'body', 1.2, 0, 1.0, 0.5, 120, 'OA', '', '');
  P(`${asm}_check`, nm('Door check strap'), 'Doors', asm, `${asm}_check`, st, 'P', 'body', 0.4, 0, 0.6, 0, 40, 'OA', '', '');
  if (front) {
    P(`mirror_${d[0]}`, `Outside mirror, ${side}`, 'Doors', asm, `mirror_${d[0]}`, ALL, 'PIF', 'body', 0.6, 0, 0.6, 0.5, 340, 'OAU', d[0] === 'l' ? 'Surround / blind-spot camera check' : 'Surround / blind-spot camera check', `${side} mirror`);
    P(`mirror_glass_${d[0]}`, `Mirror glass, ${side}`, 'Doors', asm, `mirror_${d[0]}`, ALL, 'P', 'glass', 0.2, 0, 0, 0, 65, 'OA', '', '');
  }
}

// ---- Sides & quarters ----
P('quarter_l', 'Quarter panel, left', 'Sides & quarters', '', 'quarter_l', 'SCU', 'PRF', 'structural', 9.5, 3.5, 2.5, 3.0, 690, 'O', '', 'left quarter panel');
P('quarter_r', 'Quarter panel, right', 'Sides & quarters', '', 'quarter_r', 'SCU', 'PRF', 'structural', 9.5, 3.5, 2.5, 3.0, 690, 'O', '', 'right quarter panel');
P('rocker_l', 'Rocker panel, left', 'Sides & quarters', '', 'rocker_l', ALL, 'PRF', 'structural', 6.0, 2.0, 1.5, 1.2, 280, 'OA', '', 'left rocker');
P('rocker_r', 'Rocker panel, right', 'Sides & quarters', '', 'rocker_r', ALL, 'PRF', 'structural', 6.0, 2.0, 1.5, 1.2, 280, 'OA', '', 'right rocker');
P('quarter_glass_l', 'Quarter glass, left', 'Sides & quarters', '', 'quarter_glass_l', 'CU', 'PI', 'glass', 1.2, 0, 0.5, 0, 220, 'OA', '', '');
P('quarter_glass_r', 'Quarter glass, right', 'Sides & quarters', '', 'quarter_glass_r', 'CU', 'PI', 'glass', 1.2, 0, 0.5, 0, 220, 'OA', '', '');
P('fuel_door', 'Fuel door', 'Sides & quarters', '', 'quarter_l', ALL, 'PRF', 'body', 0.3, 0.5, 0, 0.6, 75, 'OA', '', '');
P('pillar_a_l', 'A-pillar, left (outer)', 'Sides & quarters', '', 'pillar_a_l', ALL, 'RF', 'structural', 0, 2.0, 1.5, 1.0, 0, '', '', '');
P('pillar_a_r', 'A-pillar, right (outer)', 'Sides & quarters', '', 'pillar_a_r', ALL, 'RF', 'structural', 0, 2.0, 1.5, 1.0, 0, '', '', '');
P('pillar_b_l', 'B-pillar, left (outer)', 'Sides & quarters', '', 'pillar_b_l', 'STU', 'RF', 'structural', 0, 2.0, 2.0, 0.8, 0, '', '', '');
P('pillar_b_r', 'B-pillar, right (outer)', 'Sides & quarters', '', 'pillar_b_r', 'STU', 'RF', 'structural', 0, 2.0, 2.0, 0.8, 0, '', '', '');
// Truck bed
P('bedside_l', 'Bed side, left', 'Sides & quarters', '', 'bedside_l', 'T', 'PRF', 'structural', 8.0, 3.0, 2.0, 3.0, 1450, 'OAU', '', 'left bed side');
P('bedside_r', 'Bed side, right', 'Sides & quarters', '', 'bedside_r', 'T', 'PRF', 'structural', 8.0, 3.0, 2.0, 3.0, 1450, 'OAU', '', 'right bed side');
P('bed_floor', 'Bed floor', 'Rear', '', 'bed_floor', 'T', 'PRF', 'structural', 6.0, 2.5, 3.0, 2.0, 980, 'OU', '', '');
P('bed_front', 'Bed front panel', 'Rear', '', 'bed_front', 'T', 'PRF', 'structural', 4.0, 2.0, 2.0, 1.5, 420, 'OU', '', '');

// ---- Rear: trunk/liftgate/tailgate drill-down + rear bumper drill-down ----
P('decklid', 'Trunk lid', 'Rear', 'decklid', 'decklid', 'SC', 'PRIF', 'body', 1.2, 2.5, 0.5, 2.6, 760, 'OAU', '', 'trunk lid');
P('liftgate', 'Liftgate shell', 'Rear', 'decklid', 'decklid', 'U', 'PRIF', 'body', 2.0, 2.5, 1.0, 3.0, 1250, 'OU', '', 'liftgate');
P('tailgate', 'Tailgate shell', 'Rear', 'decklid', 'decklid', 'T', 'PRIF', 'body', 1.0, 2.5, 0.8, 2.8, 1350, 'OAU', '', 'tailgate');
P('decklid_hinge_l', 'Lid / gate hinge, left', 'Rear', 'decklid', 'decklid_hinge_l', ALL, 'PF', 'body', 0.6, 0, 0.5, 0.3, 65, 'OA', '', '');
P('decklid_hinge_r', 'Lid / gate hinge, right', 'Rear', 'decklid', 'decklid_hinge_r', ALL, 'PF', 'body', 0.6, 0, 0.5, 0.3, 65, 'OA', '', '');
P('decklid_latch', 'Lid / gate latch', 'Rear', 'decklid', 'decklid_latch', ALL, 'PI', 'body', 0.5, 0, 0.4, 0, 110, 'OA', '', '');
P('backup_camera', 'Backup camera', 'Rear', 'decklid', 'backup_camera', ALL, 'PI', 'mech', 0.5, 0, 0.4, 0, 340, 'OA', 'Backup camera aim check', '');
P('decklid_emblem', 'Rear emblem / nameplate', 'Rear', 'decklid', 'decklid_emblem', ALL, 'P', 'body', 0.2, 0, 0, 0, 55, 'O', '', '');
P('spoiler', 'Rear spoiler', 'Rear', 'decklid', 'spoiler', 'SCU', 'PIF', 'body', 0.6, 0, 0.5, 1.0, 380, 'OA', '', '');
P('decklid_struts', 'Lid / gate supports or cables', 'Rear', 'decklid', 'decklid_struts', ALL, 'P', 'body', 0.3, 0, 0, 0, 50, 'OA', '', '');
P('tailgate_handle', 'Tailgate handle', 'Rear', 'decklid', 'tailgate_handle', 'T', 'PI', 'body', 0.5, 0, 0.4, 0, 95, 'OA', '', '');
P('rbumper_cover', 'Rear bumper cover', 'Rear', 'rear_bumper', 'rbumper_cover', 'SCU', 'PRIF', 'body', 1.5, 2.0, 1.4, 2.8, 520, 'OAUR', '', 'rear bumper');
P('rbumper_step', 'Rear step bumper', 'Rear', 'rear_bumper', 'rbumper_cover', 'T', 'PRI', 'body', 1.2, 2.0, 1.0, 0, 640, 'OAUR', '', 'rear bumper');
P('rbumper_reinf', 'Rear bumper reinforcement', 'Rear', 'rear_bumper', 'rbumper_reinf', ALL, 'PI', 'body', 1.0, 0, 1.4, 0, 260, 'OAU', '', '');
P('rbumper_absorber', 'Rear energy absorber', 'Rear', 'rear_bumper', 'rbumper_absorber', 'SCU', 'P', 'body', 0.3, 0, 1.4, 0, 85, 'OA', '', '');
P('bsm_radar_l', 'Blind-spot radar, left', 'Rear', 'rear_bumper', 'bsm_radar_l', ALL, 'PI', 'mech', 0.4, 0, 1.4, 0, 620, 'OU', 'Blind-spot radar calibration', '');
P('bsm_radar_r', 'Blind-spot radar, right', 'Rear', 'rear_bumper', 'bsm_radar_r', ALL, 'PI', 'mech', 0.4, 0, 1.4, 0, 620, 'OU', 'Blind-spot radar calibration', '');
P('park_sensor_r', 'Rear park sensors (set)', 'Rear', 'rear_bumper', 'park_sensor_r', ALL, 'PI', 'body', 0.4, 0, 1.4, 0, 160, 'OA', 'Park assist sensor check', '');
P('rbumper_bracket_l', 'Rear bumper bracket, left', 'Rear', 'rear_bumper', 'rbumper_bracket_l', ALL, 'P', 'body', 0.3, 0, 1.4, 0, 30, 'OA', '', '');
P('rbumper_bracket_r', 'Rear bumper bracket, right', 'Rear', 'rear_bumper', 'rbumper_bracket_r', ALL, 'P', 'body', 0.3, 0, 1.4, 0, 30, 'OA', '', '');
P('reflector_l', 'Rear reflector, left', 'Rear', 'rear_bumper', 'reflector_l', ALL, 'P', 'body', 0.2, 0, 0, 0, 25, 'OA', '', '');
P('reflector_r', 'Rear reflector, right', 'Rear', 'rear_bumper', 'reflector_r', ALL, 'P', 'body', 0.2, 0, 0, 0, 25, 'OA', '', '');
P('rbumper_valance', 'Rear bumper valance / diffuser', 'Rear', 'rear_bumper', 'rbumper_valance', CARS, 'PI', 'body', 0.4, 0, 0.2, 0, 95, 'OA', '', '');
P('tow_hook_cover_r', 'Rear tow hook cover', 'Rear', 'rear_bumper', 'tow_hook_cover_r', CARS, 'PF', 'body', 0.1, 0, 0, 0.3, 24, 'OA', '', '');
P('rear_body_panel', 'Rear body panel', 'Structural', '', 'rear_body_panel', CARS, 'PRF', 'structural', 7.0, 3.0, 3.0, 1.5, 360, 'O', '', '');

// ---- Roof & glass ----
P('roof', 'Roof panel', 'Roof & glass', '', 'roof', ALL, 'PRF', 'structural', 14.0, 3.0, 4.0, 3.5, 980, 'O', '', 'roof');
P('windshield', 'Windshield', 'Roof & glass', '', 'windshield', ALL, 'PI', 'glass', 2.0, 0, 0.5, 0, 650, 'OA', 'Forward camera calibration', 'windshield');
P('back_glass', 'Back glass', 'Roof & glass', '', 'back_glass', ALL, 'PI', 'glass', 1.8, 0, 0.5, 0, 480, 'OA', '', 'rear window');
P('roof_molding_l', 'Roof molding, left', 'Roof & glass', '', 'roof', ALL, 'P', 'body', 0.5, 0, 0, 0, 70, 'OA', '', '');
P('roof_molding_r', 'Roof molding, right', 'Roof & glass', '', 'roof', ALL, 'P', 'body', 0.5, 0, 0, 0, 70, 'OA', '', '');
P('cowl_panel', 'Cowl grille panel', 'Roof & glass', '', 'cowl', ALL, 'PI', 'body', 0.5, 0, 0.6, 0, 110, 'OA', '', '');
P('wiper_arms', 'Wiper arms (set)', 'Roof & glass', '', 'cowl', ALL, 'PI', 'body', 0.3, 0, 0, 0, 95, 'OA', '', '');

// ---- Wheels & suspension ----
for (const [w, label] of [['lf', 'left front'], ['rf', 'right front'], ['lr', 'left rear'], ['rr', 'right rear']]) {
  P(`wheel_${w}`, `Wheel, ${label}`, 'Wheels & suspension', '', `wheel_${w}`, ALL, 'PRI', 'mech', 0.3, 1.0, 0.3, 0, 420, 'OAUR', '', `${label} wheel`);
  P(`tire_${w}`, `Tire, ${label}`, 'Wheels & suspension', '', `tire_${w}`, ALL, 'P', 'mech', 0.4, 0, 0.3, 0, 210, 'O', '', `${label} tire`);
}
P('control_arm_lf', 'Lower control arm, left front', 'Wheels & suspension', '', 'wheel_lf', ALL, 'P', 'mech', 1.2, 0, 0.3, 0, 240, 'OA', 'Wheel alignment + steering angle reset', '');
P('control_arm_rf', 'Lower control arm, right front', 'Wheels & suspension', '', 'wheel_rf', ALL, 'P', 'mech', 1.2, 0, 0.3, 0, 240, 'OA', 'Wheel alignment + steering angle reset', '');
P('tie_rod_lf', 'Outer tie rod, left', 'Wheels & suspension', '', 'wheel_lf', ALL, 'P', 'mech', 0.8, 0, 0.3, 0, 70, 'OA', 'Wheel alignment + steering angle reset', '');
P('tie_rod_rf', 'Outer tie rod, right', 'Wheels & suspension', '', 'wheel_rf', ALL, 'P', 'mech', 0.8, 0, 0.3, 0, 70, 'OA', 'Wheel alignment + steering angle reset', '');
P('strut_lf', 'Strut assembly, left front', 'Wheels & suspension', '', 'wheel_lf', ALL, 'P', 'mech', 1.5, 0, 0.3, 0, 310, 'OA', 'Wheel alignment + steering angle reset', '');
P('strut_rf', 'Strut assembly, right front', 'Wheels & suspension', '', 'wheel_rf', ALL, 'P', 'mech', 1.5, 0, 0.3, 0, 310, 'OA', 'Wheel alignment + steering angle reset', '');
P('alignment', 'Four-wheel alignment', 'Wheels & suspension', '', 'wheel_lf', ALL, 'X', 'mech', 0, 0, 0, 0, 0, '', 'Steering angle sensor reset', '');

// ---- Interior ----
const INT = 'Interior';
P('dash_panel', 'Dash panel / instrument panel', INT, 'interior', 'dash_panel', ALL, 'PI', 'body', 6.0, 0, 3.0, 0, 1350, 'OU', '', '');
P('dash_pad', 'Dash pad (upper)', INT, 'interior', 'dash_pad', ALL, 'P', 'body', 4.5, 0, 2.5, 0, 690, 'OU', '', '');
P('instrument_cluster', 'Instrument cluster', INT, 'interior', 'instrument_cluster', ALL, 'PI', 'mech', 0.8, 0, 0.6, 0, 720, 'OUR', '', '');
P('steering_wheel', 'Steering wheel', INT, 'interior', 'steering_wheel', ALL, 'PI', 'mech', 0.6, 0, 0.6, 0, 480, 'OU', 'Steering angle sensor check', '');
P('airbag_driver', 'Driver airbag', INT, 'interior', 'airbag_driver', ALL, 'P', 'mech', 0.5, 0, 0.4, 0, 890, 'O', 'SRS scan + clear codes', '');
P('airbag_passenger', 'Passenger airbag (dash)', INT, 'interior', 'airbag_passenger', ALL, 'P', 'mech', 1.5, 0, 2.5, 0, 980, 'O', 'SRS scan + clear codes', '');
P('seat_lf', 'Front seat, left (driver)', INT, 'interior', 'seat_lf', ALL, 'PI', 'body', 0.8, 0, 0.6, 0, 1450, 'OU', '', '');
P('seat_rf', 'Front seat, right (passenger)', INT, 'interior', 'seat_rf', ALL, 'PI', 'body', 0.8, 0, 0.6, 0, 1350, 'OU', 'Occupant classification sensor check', '');
P('seat_rear', 'Rear seat', INT, 'interior', 'seat_rear', 'STU', 'PI', 'body', 0.6, 0, 0.5, 0, 980, 'OU', '', '');
P('seat_side_airbag_l', 'Seat side airbag, left', INT, 'interior', 'seat_lf', ALL, 'P', 'mech', 1.5, 0, 0.8, 0, 520, 'O', 'SRS scan + clear codes', '');
P('seat_side_airbag_r', 'Seat side airbag, right', INT, 'interior', 'seat_rf', ALL, 'P', 'mech', 1.5, 0, 0.8, 0, 520, 'O', 'SRS scan + clear codes', '');
P('seatbelt_lf', 'Seat belt + pretensioner, left front', INT, 'interior', 'seatbelt_lf', ALL, 'P', 'mech', 0.8, 0, 0.6, 0, 360, 'O', 'SRS scan + clear codes', '');
P('seatbelt_rf', 'Seat belt + pretensioner, right front', INT, 'interior', 'seatbelt_rf', ALL, 'P', 'mech', 0.8, 0, 0.6, 0, 360, 'O', 'SRS scan + clear codes', '');
P('seatbelt_rear', 'Rear seat belts (set)', INT, 'interior', 'seat_rear', 'STU', 'P', 'mech', 1.0, 0, 0.6, 0, 280, 'O', '', '');
P('headliner', 'Headliner', INT, 'interior', 'headliner', ALL, 'PI', 'body', 2.5, 0, 2.0, 0, 520, 'OU', '', '');
P('console', 'Center console', INT, 'interior', 'console', ALL, 'PI', 'body', 1.0, 0, 0.6, 0, 640, 'OU', '', '');
P('carpet', 'Carpet', INT, 'interior', 'carpet', ALL, 'PI', 'body', 4.0, 0, 3.0, 0, 560, 'OU', '', '');
P('curtain_airbag_l', 'Curtain airbag, left', INT, 'interior', 'curtain_airbag_l', ALL, 'P', 'mech', 2.5, 0, 2.0, 0, 780, 'O', 'SRS scan + clear codes', '');
P('curtain_airbag_r', 'Curtain airbag, right', INT, 'interior', 'curtain_airbag_r', ALL, 'P', 'mech', 2.5, 0, 2.0, 0, 780, 'O', 'SRS scan + clear codes', '');
for (const [p, pl] of [['a', 'A'], ['b', 'B'], ['c', 'C']]) for (const [s, sl] of [['l', 'left'], ['r', 'right']]) {
  P(`pillar_trim_${p}_${s}`, `${pl}-pillar trim, ${sl}`, INT, 'interior', `pillar_trim_${p}_${s}`, p === 'b' ? 'STU' : ALL, 'PI', 'body', 0.4, 0, 0.3, 0, 85, 'OU', '', '');
}
P('rearview_mirror', 'Inside rearview mirror', INT, 'interior', 'rearview_mirror', ALL, 'PI', 'body', 0.3, 0, 0, 0, 180, 'OA', '', '');
P('sun_visors', 'Sun visors (pair)', INT, 'interior', 'headliner', ALL, 'P', 'body', 0.4, 0, 0, 0, 120, 'OA', '', '');

// ---- Mechanical & electrical (list-only; highlights the nearest outer part) ----
const ME = 'Mechanical & electrical';
P('radiator', 'Radiator', ME, '', 'grille', ALL, 'PI', 'mech', 1.8, 0, 1.5, 0, 340, 'OA', '', '');
P('condenser', 'A/C condenser', ME, '', 'grille', ALL, 'PI', 'mech', 1.6, 0, 1.5, 0, 290, 'OA', '', '');
P('cooling_fan', 'Cooling fan assembly', ME, '', 'grille', ALL, 'PI', 'mech', 1.0, 0, 0.8, 0, 260, 'OA', '', '');
P('ac_recharge', 'Evacuate & recharge A/C', ME, '', 'grille', ALL, 'X', 'mech', 1.0, 0, 0, 0, 0, '', '', '');
P('battery', 'Battery', ME, '', 'hood', ALL, 'PI', 'mech', 0.4, 0, 0, 0, 190, 'OA', '', '');
P('srs_module', 'Airbag control module', ME, '', 'console', ALL, 'P', 'mech', 1.2, 0, 1.0, 0, 640, 'O', 'SRS scan + clear codes', '');
P('pre_scan', 'Pre-repair diagnostic scan', ME, '', 'dash_panel', ALL, 'X', 'mech', 0.5, 0, 0, 0, 0, '', '', '');
P('post_scan', 'Post-repair diagnostic scan', ME, '', 'dash_panel', ALL, 'X', 'mech', 0.5, 0, 0, 0, 0, '', '', '');
P('cam_calibration', 'Forward camera calibration', ME, '', 'windshield', ALL, 'X', 'mech', 1.0, 0, 0, 0, 0, '', 'Forward camera calibration', '');
P('radar_calibration', 'Front radar calibration', ME, '', 'fbumper_cover', ALL, 'X', 'mech', 1.0, 0, 0, 0, 0, '', 'Front radar calibration', '');

// ---- Structural (list-only) ----
const STR = 'Structural';
P('radiator_support', 'Radiator support', STR, '', 'radiator_support', ALL, 'PR', 'structural', 6.5, 3.0, 3.0, 1.2, 520, 'OA', '', '');
P('frame_rail_lf', 'Front frame rail, left', STR, '', 'frame_rail_lf', ALL, 'PR', 'frame', 12.0, 4.0, 5.0, 1.5, 680, 'O', '', '');
P('frame_rail_rf', 'Front frame rail, right', STR, '', 'frame_rail_rf', ALL, 'PR', 'frame', 12.0, 4.0, 5.0, 1.5, 680, 'O', '', '');
P('apron_l', 'Inner fender apron, left', STR, '', 'apron_l', ALL, 'PR', 'structural', 8.0, 3.0, 4.0, 1.5, 440, 'O', '', '');
P('apron_r', 'Inner fender apron, right', STR, '', 'apron_r', ALL, 'PR', 'structural', 8.0, 3.0, 4.0, 1.5, 440, 'O', '', '');
P('rear_rail_l', 'Rear frame rail, left', STR, '', 'rear_rail_l', ALL, 'PR', 'frame', 10.0, 4.0, 5.0, 1.0, 590, 'O', '', '');
P('rear_rail_r', 'Rear frame rail, right', STR, '', 'rear_rail_r', ALL, 'PR', 'frame', 10.0, 4.0, 5.0, 1.0, 590, 'O', '', '');
P('trunk_floor', 'Trunk / spare tire floor', STR, '', 'trunk_floor', CARS, 'PR', 'structural', 9.0, 3.0, 3.0, 1.0, 420, 'O', '', '');
P('door_beam_lf', 'Door intrusion beam, front left', STR, '', 'door_beam_lf', ALL, 'P', 'structural', 2.5, 0, 1.5, 0, 160, 'O', '', '');
P('door_beam_rf', 'Door intrusion beam, front right', STR, '', 'door_beam_rf', ALL, 'P', 'structural', 2.5, 0, 1.5, 0, 160, 'O', '', '');
P('door_beam_lr', 'Door intrusion beam, rear left', STR, '', 'door_beam_lr', 'SU', 'P', 'structural', 2.5, 0, 1.5, 0, 150, 'O', '', '');
P('door_beam_rr', 'Door intrusion beam, rear right', STR, '', 'door_beam_rr', 'SU', 'P', 'structural', 2.5, 0, 1.5, 0, 150, 'O', '', '');
P('pillar_a_inner_l', 'A-pillar reinforcement (inner), left', STR, '', 'pillar_a_inner_l', ALL, 'PR', 'structural', 9.0, 3.0, 4.0, 1.0, 380, 'O', '', '');
P('pillar_a_inner_r', 'A-pillar reinforcement (inner), right', STR, '', 'pillar_a_inner_r', ALL, 'PR', 'structural', 9.0, 3.0, 4.0, 1.0, 380, 'O', '', '');
P('pillar_b_inner_l', 'B-pillar reinforcement (inner), left', STR, '', 'pillar_b_inner_l', 'STU', 'PR', 'structural', 10.0, 3.0, 4.0, 1.0, 420, 'O', '', '');
P('pillar_b_inner_r', 'B-pillar reinforcement (inner), right', STR, '', 'pillar_b_inner_r', 'STU', 'PR', 'structural', 10.0, 3.0, 4.0, 1.0, 420, 'O', '', '');
P('frame_setup', 'Frame bench setup & measure', STR, '', 'rocker_l', ALL, 'X', 'frame', 2.5, 0, 0, 0, 0, '', '', '');

const LETTER = { S: 'sedan', C: 'coupe', T: 'truck', U: 'suv' };
const OPS = { P: 'replace', R: 'repair', I: 'r&i', F: 'refinish', B: 'blend', X: 'misc' };
const PT = { O: 1, A: 0.45, U: 0.55, R: 0.62 };

export const CATALOG = rows.map(([key, name, grp, assembly, mesh, styles, ops, labor_type, rh, ph, th, fh, oem, pts, adas, ai]) => ({
  key, name, grp, assembly, mesh,
  styles: [...styles].map((c) => LETTER[c]).join(','),
  ops: [...ops].map((c) => OPS[c]).join(','),
  labor_type, replace_hours: rh, repair_hours: ph, teardown_hours: th, refinish_hours: fh,
  price_oem: pts.includes('O') ? oem : null,
  price_aftermarket: pts.includes('A') ? Math.round(oem * PT.A) : null,
  price_recycled: pts.includes('U') ? Math.round(oem * PT.U) : null,
  price_reconditioned: pts.includes('R') ? Math.round(oem * PT.R) : null,
  adas: adas || '', paintable: fh > 0 ? 1 : 0, ai_label: ai || '', sample: 1,
}));

export const BODY_STYLES = ['sedan', 'coupe', 'truck', 'suv'];
// Detailed 3D body styles and the catalog family each one uses for its parts list
export const STYLES_3D = ['sedan', 'coupe', 'hatchback', 'wagon', 'suv', 'crossover', 'minivan', 'van', 'pickup'];
export const FAMILY_OF = { sedan: 'sedan', coupe: 'coupe', hatchback: 'suv', wagon: 'suv', suv: 'suv', crossover: 'suv', minivan: 'suv', van: 'suv', pickup: 'truck' };
const BIG_SUV = /tahoe|suburban|yukon|escalade|expedition|navigator|sequoia|4runner|land cruiser|wrangler|bronco(?! sport)|gx|lx|armada|grand wagoneer|wagoneer|durango|qx80|g-class|defender|tundra/i;
// Pick the closest 3D model from an NHTSA vPIC decode (or a stored vehicle record)

// Approximate exterior size of popular US models (current generation), inches: [length, width (no mirrors), height, wheelbase].
// Used only to shape the built-in 3D body to the real proportions. Unknown models keep the body-style defaults.
const DIMS = {
  'toyota|camry': [193, 72, 56.9, 111.2], 'toyota|corolla': [182.5, 70.1, 56.5, 106.3], 'toyota|rav4': [180.9, 73, 67, 105.9], 'toyota|highlander': [194.9, 76, 68.1, 112.2],
  'toyota|tacoma': [213, 75, 71, 131.9], 'toyota|tundra': [233.6, 80.2, 78, 145.7], 'toyota|4runner': [190.2, 75.8, 71.5, 109.8], 'toyota|sienna': [203.7, 78.5, 69.7, 120.5], 'toyota|prius': [181.1, 70.2, 55.9, 108.3],
  'honda|civic': [184, 70.9, 55.7, 107.7], 'honda|accord': [195.7, 73.3, 57.1, 111.4], 'honda|cr-v': [184.8, 73.5, 66.5, 106.3], 'honda|pilot': [199.9, 78.5, 71, 113.8], 'honda|odyssey': [205.2, 78.5, 69.6, 118.1], 'honda|hr-v': [179.8, 72.4, 63.4, 104.5],
  'ford|f-150': [231.7, 79.9, 77.2, 145.4], 'ford|escape': [180.5, 74.1, 66.1, 106.7], 'ford|explorer': [198.8, 78.9, 69.9, 119.1], 'ford|mustang': [189.4, 75.5, 54.3, 107], 'ford|ranger': [210.8, 75.5, 73.2, 126.8],
  'ford|bronco': [189.4, 79.3, 73, 116.1], 'ford|edge': [188.8, 75.9, 68.3, 112.2], 'ford|maverick': [199.7, 72.6, 68.7, 121.1], 'ford|transit': [237.6, 81.3, 99.6, 147.6], 'ford|fusion': [191.8, 72.9, 58.2, 112.2],
  'chevrolet|silverado': [231.9, 81.2, 75.5, 147.4], 'chevrolet|equinox': [183.1, 72.6, 65.4, 107.3], 'chevrolet|malibu': [194.2, 73, 57.6, 111.4], 'chevrolet|tahoe': [210.7, 81, 75.9, 120.9], 'chevrolet|traverse': [204.3, 78.6, 70.7, 120.9],
  'chevrolet|colorado': [213.2, 74.6, 70.3, 131.4], 'chevrolet|camaro': [188.3, 74.7, 53.1, 110.7], 'chevrolet|trax': [179.2, 71.9, 61.7, 106.3], 'gmc|sierra': [231.7, 81.2, 75.5, 147.4], 'gmc|yukon': [210.4, 81, 76.4, 120.9],
  'ram|1500': [232.9, 82.1, 77.6, 144.6], 'dodge|charger': [198.4, 75, 58.2, 120.4], 'dodge|durango': [200.8, 75.8, 71.9, 119.8], 'jeep|grand cherokee': [193.5, 77.5, 70.8, 116.7], 'jeep|wrangler': [188.4, 73.8, 73.6, 118.4],
  'jeep|cherokee': [182, 74.9, 67.8, 107.1], 'jeep|compass': [173.4, 73.8, 64.8, 103.8], 'nissan|altima': [192.9, 72.9, 56.8, 111.2], 'nissan|rogue': [183, 72.4, 66.5, 106.5], 'nissan|sentra': [182.7, 71.5, 56.8, 106.8],
  'nissan|frontier': [210.2, 74.7, 71.9, 126], 'nissan|pathfinder': [197.7, 77.2, 70.2, 114.2], 'hyundai|elantra': [184.1, 71.9, 55.7, 107.1], 'hyundai|tucson': [182.3, 73.4, 65.6, 108.5], 'hyundai|santa fe': [190.2, 75.2, 69.3, 110.8],
  'hyundai|sonata': [192.9, 73.2, 56.9, 111.8], 'kia|sorento': [189.4, 74.8, 67.3, 110.8], 'kia|sportage': [183.5, 73.4, 65.4, 108.5], 'kia|telluride': [196.9, 78.3, 69.9, 114.2], 'kia|forte': [182.7, 70.9, 56.5, 106.3],
  'subaru|outback': [191.3, 74.6, 66.1, 108.1], 'subaru|forester': [182.3, 71.5, 68.1, 105.1], 'subaru|crosstrek': [176.4, 71, 63.6, 105.1], 'tesla|model 3': [184.8, 72.8, 56.8, 113.2], 'tesla|model y': [187, 75.6, 63.9, 113.8],
  'volkswagen|jetta': [186.5, 70.8, 57.7, 105.7], 'volkswagen|tiguan': [186.1, 72.4, 66.3, 109.8], 'mazda|cx-5': [180.1, 72.6, 66.1, 106.2], 'mazda|mazda3': [183.5, 70.7, 56.7, 107.3], 'bmw|3 series': [185.7, 71.9, 56.8, 112.2],
  'bmw|x5': [194.9, 78.9, 69.1, 117.1], 'mercedes-benz|c-class': [187, 71.7, 56.6, 112.8], 'lexus|rx': [192.5, 75.6, 67.3, 112.2], 'audi|q5': [184.3, 74.5, 65.5, 111],
};
export function dimsFor(make, model) {
  const mk = String(make || '').toLowerCase().trim(), md = String(model || '').toLowerCase().trim();
  if (!mk || !md) return null;
  let r = DIMS[mk + '|' + md];
  if (!r) { const k = Object.keys(DIMS).filter((x) => x.startsWith(mk + '|') && md.startsWith(x.split('|')[1])).sort((a, b) => b.length - a.length)[0]; r = k && DIMS[k]; }
  return r ? { length_in: r[0], width_in: r[1], height_in: r[2], wheelbase_in: r[3] } : null;
}

export function model3dFrom(d = {}) {
  const b = String(d.body || '').toLowerCase();
  const doors = Number(d.doors) || null;
  let style;
  if (b.includes('pickup') || b.includes('truck')) style = 'pickup';
  else if (b.includes('minivan')) style = 'minivan';
  else if (b.includes('van')) style = 'van';
  else if (b.includes('wagon')) style = 'wagon';
  else if (b.includes('hatchback') || b.includes('liftback')) style = 'hatchback';
  else if (b.includes('sport utility') || b.includes('suv') || b.includes('crossover') || b.includes('mpv')) {
    const truckish = BIG_SUV.test(String(d.model || '')) || /4wd|4x4/i.test(d.drive || '') && !/awd|all-wheel/i.test(d.drive || '');
    style = truckish ? 'suv' : 'crossover';
  } else if (b.includes('coupe') || b.includes('convertible') || b.includes('roadster') || doors === 2) style = 'coupe';
  else style = 'sedan';
  const out = { style, family: FAMILY_OF[style], doors: doors || ({ coupe: 2, pickup: 4, van: 4 }[style] || 4) };
  if (style === 'pickup') {
    const cab = String(d.cab || '').toLowerCase();
    out.cab = /crew|max/.test(cab) ? 'crew' : /extra|super|quad|double|king|extended|access/.test(cab) ? 'extended' : /regular|standard|conventional/.test(cab) ? 'regular' : (doors && doors <= 2 ? 'regular' : 'crew');
    if (out.cab === 'regular') out.doors = 2;
    const bed = Number(d.bed_length_in) || 0;
    out.bed = bed ? (bed >= 78 ? 'long' : 'short') : (/long|8/.test(String(d.bed_type || '').toLowerCase()) ? 'long' : 'short');
    out.bed_length_in = bed || null;
  }
  if (style === 'coupe' || style === 'hatchback') out.doors = doors && doors <= 3 ? 2 : style === 'coupe' ? 2 : 4;
  if (Number(d.wheelbase_in) > 0) out.wheelbase_in = Number(d.wheelbase_in);
  const dm = dimsFor(d.make, d.model);
  if (dm) {
    out.length_in = dm.length_in; out.width_in = dm.width_in; out.height_in = dm.height_in;
    if (!out.wheelbase_in) out.wheelbase_in = dm.wheelbase_in;
    out.dims_source = 'model';
  }
  return out;
}

// Map an NHTSA vPIC BodyClass string to one of our 3D body styles
export function styleFromBodyClass(bodyClass = '', doors = 0) {
  const b = String(bodyClass).toLowerCase();
  if (b.includes('pickup') || b.includes('truck')) return 'truck';
  if (b.includes('sport utility') || b.includes('suv') || b.includes('crossover') || b.includes('wagon') || b.includes('minivan') || b.includes('van')) return 'suv';
  if (b.includes('coupe') || b.includes('convertible') || b.includes('roadster') || Number(doors) === 2) return 'coupe';
  return 'sedan';
}
