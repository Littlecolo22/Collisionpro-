// One-time setup: shop, users, sample reference data, and demo jobs (all clearly marked SAMPLE).
import { hashPassword, randomToken, addDays, today, nowIso, r2, num } from './util.js';
import { CATALOG } from './catalog.js';
import { lineFromCatalog } from './logic.js';

export async function seedDatabase(env, opts = {}) {
  const db = env.DB;
  const ins = async (table, row) => {
    const k = Object.keys(row);
    const r = await db.prepare(`INSERT INTO ${table} (${k.join(',')}) VALUES (${k.map(() => '?').join(',')}) RETURNING id`).bind(...k.map((x) => row[x] ?? null)).first();
    return r.id;
  };
  const shop = opts.shop_name || 'R&R Auto Express';
  // ----- Locations -----
  const alert = JSON.stringify({ intake: 24, teardown: 24, parts_hold: 72, body: 48, frame: 48, paint: 36, reassembly: 24, mechanical: 24, adas: 24, detail: 12, qc: 8 });
  const L1 = await ins('locations', { name: shop + ' - Main', address: '1200 Industrial Blvd, Your City', phone: '(555) 010-2000', email: 'service@example.com', tax_rate: 0.0725, tax_labor: 0, rate_body: 62, rate_paint: 62, rate_mech: 110, rate_frame: 85, rate_structural: 85, rate_glass: 62, paint_mat_rate: 42, total_loss_pct: 0.75, bays: 8, booths: 1, booth_slots_per_day: 6, tech_hours_per_day: 8, stage_alert_hours: alert, est_rules: JSON.stringify({ pm: { mode: 'per_rfn_hour', rate: 42, cap: 0, stage3_mult: 1.5, tone2_mult: 1.25 }, markup: { OEM: 0, aftermarket: 0, recycled: 25, reconditioned: 15, sublet: 10 }, discount: { OEM: 0, aftermarket: 0, recycled: 0, reconditioned: 0 }, tax: { parts: 0.0725, paint_mat: 0.0725, sublet: 0, misc: 0.0725 } }) });
  const L2 = await ins('locations', { name: shop + ' - Eastside', address: '88 Commerce Way, Your City', phone: '(555) 010-3000', email: 'east@example.com', tax_rate: 0.0725, rate_body: 60, rate_paint: 60, rate_mech: 105, rate_frame: 80, rate_structural: 80, rate_glass: 60, paint_mat_rate: 40, bays: 5, booths: 1, booth_slots_per_day: 5, tech_hours_per_day: 8, stage_alert_hours: alert });

  // ----- Users -----
  const creds = [];
  const user = async (email, name, role, extra = {}, pw = null) => {
    const password = pw || ('Demo-' + randomToken(6));
    const { hash, salt } = await hashPassword(password);
    const id = await ins('users', { email, name, role, pw_hash: hash, pw_salt: salt, ...extra });
    creds.push({ email, password, role, name });
    return id;
  };
  const owner = await user(opts.owner_email || 'owner@collisionpro.app', opts.owner_name || 'Sergio Robledo', 'owner', {}, opts.owner_password);
  const mgr = await user('manager@collisionpro.app', 'Dana Ortiz', 'manager', { location_id: L1 });
  const est = await user('estimator@collisionpro.app', 'Marcus Lee', 'estimator', { location_id: L1, commission_pct: 3 });
  const tBody = await user('body.tech@collisionpro.app', 'Luis Romero', 'technician', { location_id: L1, department: 'body', pay_type: 'flat', pay_rate: 28 });
  const tFrame = await user('frame.tech@collisionpro.app', 'Andre Wallace', 'technician', { location_id: L1, department: 'frame', pay_type: 'flat', pay_rate: 32 });
  const tPaint = await user('painter@collisionpro.app', 'Kim Nguyen', 'technician', { location_id: L1, department: 'paint', pay_type: 'flat', pay_rate: 30 });
  const tMech = await user('mech.tech@collisionpro.app', 'Ray Patel', 'technician', { location_id: L1, department: 'mechanical', pay_type: 'hourly', pay_rate: 34 });
  const tDet = await user('detail@collisionpro.app', 'Jess Moreno', 'technician', { location_id: L1, department: 'detail', pay_type: 'hourly', pay_rate: 18 });
  await user('parts@collisionpro.app', 'Tony Alvarez', 'parts', { location_id: L1 });
  await user('accounting@collisionpro.app', 'Priya Shah', 'accounting', {});
  await user('east.estimator@collisionpro.app', 'Beth Carter', 'estimator', { location_id: L2 });

  // ----- Insurers (SAMPLE companies) -----
  const I1 = await ins('insurers', { name: 'Sample Mutual Insurance', drp: 1, contact: 'DRP desk', email: 'drp@sample-mutual.example', phone: '(555) 020-1000', rate_body: 58, rate_paint: 58, rate_mech: 105, rate_frame: 80, paint_mat_rate: 39, payment_terms_days: 14, cycle_target_days: 7, severity_target: 3800, csi_target: 4.6, integration: 'manual', parts_discounts: JSON.stringify({ OEM: 5, aftermarket: 0, recycled: 0, reconditioned: 0 }), notes: 'SAMPLE insurer for demonstration' });
  const I2 = await ins('insurers', { name: 'Example Auto Insurance', drp: 1, contact: 'Claims', email: 'claims@example-auto.example', phone: '(555) 020-2000', rate_body: 60, rate_paint: 60, rate_mech: 108, rate_frame: 82, paint_mat_rate: 41, payment_terms_days: 21, cycle_target_days: 8, severity_target: 4200, csi_target: 4.5, integration: 'manual', notes: 'SAMPLE insurer' });
  const I3 = await ins('insurers', { name: 'Demo Casualty Co.', drp: 0, email: 'claims@demo-casualty.example', payment_terms_days: 30, integration: 'manual', notes: 'SAMPLE non-DRP insurer: shop rates apply' });

  // ----- Vendors (SAMPLE) -----
  const V = [];
  for (const v of [
    ['Sample OEM Dealer Parts', 'OEM dealer', 18, 1], ['Example Aftermarket Supply', 'aftermarket', 30, 1], ['Demo Recycled Auto Parts', 'recycled', 10, 2], ['Sample Bumper Recon', 'reconditioned', 5, 2],
    ['Demo Glass Co.', 'glass', 0, 1], ['Sample Alignment & ADAS', 'sublet', 0, 1], ['Example Paint Jobber', 'paint', 12, 1],
  ]) V.push(await ins('vendors', { name: v[0], type: v[1], discount_pct: v[2], avg_delivery_days: v[3], integration: 'manual', phone: '(555) 030-' + (1000 + V.length), notes: 'SAMPLE vendor' }));

  // ----- Catalog (SAMPLE labor guide) -----
  const cstm = CATALOG.map((c) => db.prepare('INSERT INTO catalog_parts (key,name,grp,assembly,mesh,styles,ops,labor_type,replace_hours,repair_hours,teardown_hours,refinish_hours,price_oem,price_aftermarket,price_recycled,price_reconditioned,adas,paintable,ai_label,sample) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)')
    .bind(c.key, c.name, c.grp, c.assembly, c.mesh, c.styles, c.ops, c.labor_type, c.replace_hours, c.repair_hours, c.teardown_hours, c.refinish_hours, c.price_oem, c.price_aftermarket, c.price_recycled, c.price_reconditioned, c.adas, c.paintable, c.ai_label));
  for (let i = 0; i < cstm.length; i += 40) await db.batch(cstm.slice(i, i + 40));
  const cat = Object.fromEntries(CATALOG.map((c) => [c.key, c]));

  // ----- Paint (SAMPLE) -----
  const pf = [['Toyota', '1F7', 'Classic Silver Metallic'], ['Toyota', '218', 'Attitude Black Mica'], ['Toyota', '040', 'Super White'], ['Honda', 'NH-883P', 'Platinum White Pearl'], ['Honda', 'B-593M', 'Obsidian Blue Pearl'], ['Ford', 'UX', 'Ingot Silver'], ['Ford', 'PQ', 'Race Red'], ['Ford', 'G1', 'Shadow Black'], ['Chevrolet', 'GAZ', 'Summit White'], ['Chevrolet', 'GBA', 'Black'], ['Nissan', 'KAD', 'Gun Metallic'], ['Tesla', 'PPSW', 'Pearl White Multi-Coat']];
  await db.batch(pf.map(([m, c, n]) => db.prepare('INSERT INTO paint_formulas (make,color_code,color_name,variant,brand,toners,notes,sample) VALUES (?,?,?,?,?,?,?,1)').bind(m, c, n, 'Prime', 'Sample waterborne', 'SAMPLE toner list: load your paint system data', 'Verify with your paint supplier software')));
  const inv = [['WB-CLR-1', 'Clearcoat (high solids)', 'Sample', 'clear', 'gal', 6, 3, 6, 118], ['WB-ACT-1', 'Clear activator', 'Sample', 'clear', 'qt', 8, 4, 8, 46], ['WB-BAS-WHT', 'Waterborne base - white', 'Sample', 'base', 'qt', 5, 2, 4, 64], ['WB-BAS-BLK', 'Waterborne base - black', 'Sample', 'base', 'qt', 2, 2, 4, 61], ['PR-2K', '2K urethane primer', 'Sample', 'primer', 'gal', 3, 2, 4, 96], ['SLR-1', 'Sealer', 'Sample', 'primer', 'qt', 4, 2, 4, 38], ['ABR-P320', 'Sanding discs P320 (box 100)', 'Sample', 'abrasive', 'box', 7, 3, 6, 42], ['MSK-TP', 'Masking tape 3/4" (case)', 'Sample', 'masking', 'case', 1, 2, 4, 55], ['MSK-PAPER', 'Masking paper roll', 'Sample', 'masking', 'roll', 6, 3, 6, 24], ['SEAM-1', 'Seam sealer', 'Sample', 'other', 'tube', 10, 6, 12, 14]];
  for (const loc of [L1, L2]) await db.batch(inv.map((r) => db.prepare('INSERT INTO paint_inventory (location_id,sku,name,brand,category,unit,on_hand,reorder_point,reorder_qty,unit_cost,supplier,sample) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)').bind(loc, ...r, 'Example Paint Jobber')));

  // ----- OEM repair info (SAMPLE index: links go to public OEM info portals) -----
  const docs = [
    ['All', 'OEM1Stop: links to every OEM repair information site', 'portal', 'https://www.oem1stop.com', 'Free index of OEM repair procedure and position statement sites.', 'oem procedures position statements'],
    ['All', 'I-CAR Repairability Technical Support (RTS)', 'portal', 'https://rts.i-car.com', 'Search OEM procedures, position statements and repair tips.', 'procedures welding adas'],
    ['Toyota', 'Toyota pre/post repair scan position statement (SAMPLE summary)', 'position_statement', 'https://www.oem1stop.com', 'Toyota requires pre- and post-repair scans on collision-damaged vehicles. Verify the current statement on Toyota TIS.', 'scan pre post'],
    ['Honda', 'Honda windshield replacement camera aiming (SAMPLE summary)', 'procedure', 'https://www.oem1stop.com', 'Camera aiming is required after windshield replacement on Honda Sensing vehicles. Verify on Honda ServiceExpress.', 'windshield camera adas calibration'],
    ['Ford', 'Ford bumper repair and radar position (SAMPLE summary)', 'position_statement', 'https://www.oem1stop.com', 'Check radar mounting and alignment after front bumper work. Verify on Ford Motorcraft Service.', 'bumper radar'],
    ['Chevrolet', 'GM structural welding guidelines (SAMPLE summary)', 'procedure', 'https://www.oem1stop.com', 'Follow GM published weld counts and STRSW where specified. Verify on GM Service Information.', 'welding structural'],
  ];
  await db.batch(docs.map((d) => db.prepare('INSERT INTO oem_docs (make,title,type,url,summary,keywords,sample) VALUES (?,?,?,?,?,?,1)').bind(...d)));

  // ----- Settings -----
  const settings = { shop_name: shop, auto_status_updates: '1', review_link: '', vin_parts_provider: 'none', accounting_target: 'quickbooks', disclaimer: 'This estimate is based on visible damage. Hidden damage found during teardown will be documented and submitted as a supplement before work continues.', estimate_footer: 'Thank you for choosing ' + shop + '. Lifetime warranty on workmanship for as long as you own the vehicle (paint and labor).' };
  await db.batch(Object.entries(settings).map(([k, v]) => db.prepare('INSERT INTO settings (location_id,key,value) VALUES (0,?,?) ON CONFLICT(location_id,key) DO UPDATE SET value=excluded.value').bind(k, v)));

  // ----- Compliance logs -----
  await db.batch([
    db.prepare('INSERT INTO compliance_logs (location_id,type,item,performed_on,next_due,detail,user_name) VALUES (?,?,?,?,?,?,?)').bind(L1, 'EPA 6H', 'Spray booth filter change', addDays(today(), -20), addDays(today(), 10), 'Intake and exhaust filters replaced', 'Dana Ortiz'),
    db.prepare('INSERT INTO compliance_logs (location_id,type,item,performed_on,next_due,detail,user_name) VALUES (?,?,?,?,?,?,?)').bind(L1, 'OSHA', 'Respirator fit test - paint dept', addDays(today(), -300), addDays(today(), 65), 'Kim Nguyen passed qualitative fit test', 'Dana Ortiz'),
    db.prepare('INSERT INTO compliance_logs (location_id,type,item,performed_on,next_due,detail,user_name) VALUES (?,?,?,?,?,?,?)').bind(L1, 'Hazardous waste', 'Solvent waste pickup', addDays(today(), -12), addDays(today(), 18), '2 drums, manifest on file', 'Tony Alvarez'),
    db.prepare('INSERT INTO compliance_logs (location_id,type,item,performed_on,next_due,detail,user_name) VALUES (?,?,?,?,?,?,?)').bind(L1, 'Equipment', 'Frame machine calibration', addDays(today(), -150), addDays(today(), 215), 'Annual calibration', 'Andre Wallace'),
    db.prepare('INSERT INTO compliance_logs (location_id,type,item,performed_on,next_due,detail,user_name) VALUES (?,?,?,?,?,?,?)').bind(L1, 'SDS', 'Safety data sheets binder review', addDays(today(), -40), addDays(today(), 325), 'Added new clearcoat SDS', 'Dana Ortiz'),
  ]);

  if (opts.demo === false) return { ok: true, users: creds };

  // ----- Demo customers, vehicles and jobs -----
  const people = [
    ['Maria Gonzalez', '(555) 101-2201', 'maria.g@example.com', 2021, 'Toyota', 'Camry', 'SE', 'Sedan/Saloon', 'Classic Silver Metallic', '1F7', '4T1G11AK5MU000001', 38210, 21500],
    ['James Carter', '(555) 101-2202', 'jcarter@example.com', 2019, 'Honda', 'Civic', 'EX', 'Sedan/Saloon', 'Obsidian Blue Pearl', 'B-593M', '19XFC1F30KE000002', 51200, 16800],
    ['Aisha Johnson', '(555) 101-2203', 'aisha.j@example.com', 2022, 'Ford', 'F-150', 'XLT', 'Pickup', 'Race Red', 'PQ', '1FTFW1E50NF000003', 22800, 41000],
    ['Kevin Brooks', '(555) 101-2204', 'kbrooks@example.com', 2020, 'Chevrolet', 'Equinox', 'LT', 'Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)', 'Summit White', 'GAZ', '2GNAXKEV0L6000004', 44100, 17900],
    ['Linda Park', '(555) 101-2205', 'lpark@example.com', 2018, 'Nissan', 'Altima', 'SV', 'Sedan/Saloon', 'Gun Metallic', 'KAD', '1N4BL4BV3JC000005', 72300, 11200],
    ['Robert Diaz', '(555) 101-2206', 'rdiaz@example.com', 2023, 'Toyota', 'RAV4', 'XLE', 'Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)', 'Super White', '040', '2T3P1RFV1PW000006', 12400, 31500],
    ['Grace Kim', '(555) 101-2207', 'gkim@example.com', 2017, 'Ford', 'Fusion', 'SE', 'Sedan/Saloon', 'Ingot Silver', 'UX', '3FA6P0H75HR000007', 88200, 9800],
    ['Tom Wilson', '(555) 101-2208', 'twilson@example.com', 2021, 'Honda', 'Accord', 'Sport', 'Sedan/Saloon', 'Platinum White Pearl', 'NH-883P', '1HGCV1F34MA000008', 33100, 22900],
    ['Sofia Martinez', '(555) 101-2209', 'sofia.m@example.com', 2020, 'Chevrolet', 'Silverado 1500', 'LT', 'Pickup', 'Black', 'GBA', '3GCUYDED0LG000009', 47600, 33800],
    ['Daniel Reyes', '(555) 101-2210', 'dreyes@example.com', 2019, 'Toyota', 'Corolla', 'LE', 'Sedan/Saloon', 'Attitude Black Mica', '218', '2T1BURHE0KC000010', 61000, 13400],
  ];
  const plans = [
    // [stage, status, insurer, daysAgoCreated, lines[[key, op, partType]], keyIn?, delivered?, csi]
    ['intake', 'estimate', I1, 0, [['fbumper_cover', 'replace', 'OEM'], ['grille', 'replace', 'OEM'], ['headlamp_l', 'replace', 'OEM'], ['fender_l', 'repair'], ['hood', 'blend'], ['front_radar', 'r&i']]],
    ['teardown', 'in_production', I2, 2, [['rbumper_cover', 'replace', 'aftermarket'], ['rbumper_absorber', 'replace', 'OEM'], ['decklid', 'repair'], ['tail_lamp_r', 'replace', 'OEM'], ['quarter_r', 'blend']], 1],
    ['parts_hold', 'in_production', I1, 4, [['fender_r', 'replace', 'OEM'], ['headlamp_r', 'replace', 'OEM'], ['fbumper_cover', 'repair'], ['hood', 'blend'], ['fender_liner_r', 'replace', 'OEM']], 3],
    ['body', 'in_production', null, 5, [['quarter_l', 'repair'], ['rbumper_cover', 'refinish'], ['tail_lamp_l', 'replace', 'recycled']], 4],
    ['paint', 'in_production', I3, 6, [['hood', 'replace', 'aftermarket'], ['fbumper_cover', 'replace', 'reconditioned'], ['grille', 'replace', 'aftermarket'], ['fender_l', 'blend'], ['fender_r', 'blend']], 5],
    ['reassembly', 'in_production', I2, 8, [['roof', 'repair'], ['windshield', 'replace', 'OEM'], ['cowl_panel', 'replace', 'OEM']], 6],
    ['ready', 'completed', I1, 12, [['rbumper_cover', 'replace', 'OEM'], ['park_sensor_r', 'replace', 'OEM'], ['decklid', 'blend']], 10],
    ['ready', 'delivered', I1, 25, [['fbumper_cover', 'replace', 'OEM'], ['fog_lamp_l', 'replace', 'aftermarket'], ['fender_l', 'repair']], 22, 15, 5],
    ['ready', 'delivered', I2, 40, [['quarter_r', 'repair'], ['rbumper_cover', 'replace', 'aftermarket'], ['tail_lamp_r', 'replace', 'OEM']], 37, 29, 4],
    ['ready', 'delivered', null, 55, [['hood', 'repair'], ['fbumper_cover', 'refinish']], 52, 48, 5],
  ];
  const techFor = { body: tBody, frame: tFrame, paint: tPaint, mechanical: tMech, detail: tDet };
  const stageOrder = ['intake', 'teardown', 'parts_hold', 'body', 'frame', 'paint', 'reassembly', 'mechanical', 'adas', 'detail', 'qc', 'ready'];
  const jobs = [];
  for (let i = 0; i < people.length; i++) {
    const [name, phone, email, year, make, model, trim, body, color, paint, vin, odo, acv] = people[i];
    const [stage, status, insurer, ago, lines, keyAgo, delAgo, csi] = plans[i];
    const cust = await ins('customers', { location_id: L1, name, phone, email, contact_pref: 'sms', sms_opt_in: 1, notes: 'Demo customer' });
    const style = /Pickup/.test(body) ? 'truck' : /Sport Utility/.test(body) ? 'suv' : 'sedan';
    const veh = await ins('vehicles', { customer_id: cust, vin, year, make, model, trim, body, color, paint_code: paint, odometer: odo, acv, vin_data: JSON.stringify({ body_style: style, demo: true }) });
    const created = addDays(today(), -ago) + ' 09:15:00';
    const num = 'RO-' + String(10001 + i);
    const job = await ins('jobs', {
      location_id: L1, number: num, customer_id: cust, vehicle_id: veh, insurer_id: insurer, claim_no: insurer ? 'CLM-' + (482100 + i * 37) : null, policy_no: insurer ? 'POL-' + (77310 + i) : null,
      adjuster: insurer ? 'Demo Adjuster' : null, deductible: insurer ? (i % 2 ? 500 : 1000) : 0, loss_date: addDays(today(), -ago - 2), loss_type: 'collision', point_of_impact: lines[0][0].startsWith('r') || lines[0][0].startsWith('quarter') ? 'rear' : 'front',
      pay_type: insurer ? 'insurance' : 'customer', status, stage, stage_since: addDays(today(), -Math.min(ago, 1)) + ' 08:00:00', drp_status: insurer && status !== 'estimate' ? (status === 'delivered' ? 'paid' : 'approved') : insurer ? 'assignment' : null,
      source: insurer === I1 || insurer === I2 ? 'DRP assignment' : 'walk-in', estimator_id: est, drop_off_at: keyAgo !== undefined ? addDays(today(), -keyAgo) + ' 08:30' : addDays(today(), 2) + ' 08:30',
      key_in_at: keyAgo !== undefined ? addDays(today(), -keyAgo) + ' 08:30:00' : null, repair_start_at: keyAgo !== undefined && keyAgo > 0 ? addDays(today(), -keyAgo + 1) + ' 09:00:00' : null,
      target_date: delAgo !== undefined ? addDays(today(), -delAgo) : addDays(today(), stageOrder.indexOf(stage) > 6 ? 1 : 3 + (i % 3)),
      completed_at: ['completed', 'delivered'].includes(status) ? addDays(today(), -(delAgo ?? 0) - 1) + ' 15:00:00' : null, delivered_at: delAgo !== undefined ? addDays(today(), -delAgo) + ' 16:00:00' : null,
      approved_at: status !== 'estimate' ? created : null, approved_by: status !== 'estimate' ? 'Insurer approval' : null, csi_score: csi || null, portal_token: randomToken(12),
      pre_scan_status: keyAgo !== undefined ? 'done' : 'needed', post_scan_status: status === 'delivered' || status === 'completed' ? 'done' : 'needed', created, updated: created,
    });
    jobs.push(job);
    // lines
    let n = 0;
    const lstm = [];
    for (const [key, op, pt] of lines) {
      const c = cat[key];
      if (!c) continue;
      const l = lineFromCatalog(c, op, { partType: pt || 'OEM' });
      n++;
      lstm.push(db.prepare('INSERT INTO estimate_lines (job_id,supplement_no,line_no,area,operation,description,part_type,part_no,qty,unit_price,labor_type,labor_hours,teardown_hours,refinish_hours,adas_flag,notes,source,catalog_key,reviewed) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)')
        .bind(job, 0, n, l.area, l.operation, l.description, l.part_type, op === 'replace' ? 'DEMO-' + key.toUpperCase().slice(0, 10) : '', 1, l.unit_price, l.labor_type, l.labor_hours, l.teardown_hours, l.refinish_hours, l.adas_flag, l.notes, 'catalog', key));
    }
    if (i === 4) { n++; lstm.push(db.prepare("INSERT INTO estimate_lines (job_id,supplement_no,line_no,area,operation,description,qty,unit_price,sublet_amount,labor_type,notes,source) VALUES (?,0,?,'Sublet','sublet','Four-wheel alignment',1,0,129,'mech','Sublet to alignment shop','manual')").bind(job, n)); }
    if (i === 5) { n++; lstm.push(db.prepare("INSERT INTO estimate_lines (job_id,supplement_no,line_no,area,operation,description,qty,unit_price,sublet_amount,labor_type,notes,source) VALUES (?,0,?,'Sublet','sublet','Forward camera calibration (ADAS)',1,0,295,'mech','Sublet to ADAS calibration center','manual')").bind(job, n)); }
    if (i <= 1) { // show estimator detail: judgment time, included op, corrosion protection
      n++; lstm.push(db.prepare("INSERT INTO estimate_lines (job_id,supplement_no,line_no,area,operation,description,qty,unit_price,labor_type,labor_hours,judgment,notes,source) VALUES (?,0,?,'Misc','add_labor','Corrosion protection / cavity wax',1,0,'body',0.5,1,'Judgment: per OEM corrosion procedure','manual')").bind(job, n));
      n++; lstm.push(db.prepare("INSERT INTO estimate_lines (job_id,supplement_no,line_no,area,operation,description,qty,unit_price,labor_type,incl,not_included,notes,source) VALUES (?,0,?,'Misc','add_cost','Hazardous waste disposal',1,4.5,'body',0,1,'Not included in labor guide','manual')").bind(job, n));
    }
    await db.batch(lstm);
    if (i <= 1) await db.prepare('UPDATE estimate_lines SET refinish_overlap=0.4 WHERE id=(SELECT id FROM estimate_lines WHERE job_id=? AND refinish_hours>0 ORDER BY line_no LIMIT 1 OFFSET 1)').bind(job).run();
    if (i === 2) { // supplement on the parts-hold job
      await ins('supplements', { job_id: job, number: 1, reason: 'Hidden damage found at teardown: headlamp mounting tabs and radiator support', status: 'submitted', amount: 0, submitted_at: nowIso() });
      const c = cat['fbumper_reinf'];
      const l = lineFromCatalog(c, 'replace', { partType: 'OEM', supplement_no: 1 });
      await db.prepare('INSERT INTO estimate_lines (job_id,supplement_no,line_no,area,operation,description,part_type,qty,unit_price,labor_type,labor_hours,teardown_hours,refinish_hours,notes,source,catalog_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(job, 1, n + 1, l.area, 'replace', l.description, l.part_type, 1, l.unit_price, l.labor_type, l.labor_hours, l.teardown_hours, l.refinish_hours, l.notes, 'catalog', c.key).run();
    }
    if (status === 'estimate') continue;
    // RO tasks
    const dl = (await db.prepare('SELECT * FROM estimate_lines WHERE job_id=?').bind(job).all()).results;
    const bodyH = r2(dl.reduce((a, l) => a + (['body', 'glass'].includes(l.labor_type) ? l.labor_hours : 0) + l.teardown_hours, 0));
    const paintH = r2(dl.reduce((a, l) => a + l.refinish_hours, 0));
    const si = stageOrder.indexOf(stage);
    const tasks = [['body', 'Body repair & R&I', bodyH, si > 3], ['paint', 'Refinish', paintH, si > 5], ['detail', 'Detail & clean-up', 1, si >= 11]].filter((t) => t[2] > 0);
    for (const [dept, desc, h, done] of tasks) {
      const tid = await ins('ro_tasks', { job_id: job, department: dept, description: desc, tech_id: techFor[dept], flagged_hours: h, status: done ? 'done' : (si === stageOrder.indexOf(dept) ? 'in_progress' : 'pending'), started_at: done ? created : null, finished_at: done ? addDays(today(), -Math.max(0, (delAgo ?? 1) + 1)) + ' 14:00:00' : null });
      if (done) await ins('time_entries', { job_id: job, task_id: tid, tech_id: techFor[dept], clock_in: addDays(today(), -Math.max(1, (delAgo ?? 1) + 2)) + ' 08:00:00', clock_out: addDays(today(), -Math.max(1, (delAgo ?? 1) + 2)) + ' 16:00:00', minutes: Math.round(h * 60 * (0.8 + (i % 4) * 0.08)) });
    }
    // Parts
    for (const l of dl.filter((l) => l.operation === 'replace')) {
      const vendor = { OEM: V[0], aftermarket: V[1], recycled: V[2], reconditioned: V[3] }[l.part_type] || V[0];
      const st = si >= 3 ? 'received' : stage === 'parts_hold' ? (l.description.includes('Headlamp') ? 'backordered' : 'ordered') : 'ordered';
      await ins('parts', { job_id: job, line_id: l.id, part_no: l.part_no, description: l.description, part_type: l.part_type, qty: 1, list_price: l.unit_price, cost: r2(l.unit_price * 0.75), sell_price: l.unit_price, vendor_id: vendor, status: st, eta: st === 'received' ? null : addDays(today(), st === 'backordered' ? 6 : 1), ordered_at: created, received_at: st === 'received' ? created : null, condition: st === 'received' ? 'ok' : null });
    }
    // Schedule
    if (!delAgo) await ins('schedule_events', { location_id: L1, job_id: job, type: 'delivery', title: 'Delivery ' + num, start: (addDays(today(), stageOrder.indexOf(stage) > 6 ? 1 : 3 + (i % 3))) + ' 16:00', resource: 'Front desk' });
    if (stage === 'paint') await ins('schedule_events', { location_id: L1, job_id: job, type: 'booth', title: 'Booth ' + num, start: today() + ' 13:00', end: today() + ' 15:00', resource: 'Booth 1' });
    // ADAS + scans
    if (i === 5) await ins('adas_items', { job_id: job, system: 'Forward camera', reason: 'Windshield replaced', calibration: 'Forward camera calibration (static or dynamic per OEM)', required: 1, status: 'sublet' });
    if (keyAgo !== undefined) await ins('scans', { job_id: job, type: 'pre', tool: 'Sample scan tool', dtcs: i === 2 ? 'B0012 (passenger frontal stage 1), U0100' : 'none', result: i === 2 ? 'Codes found, documented' : 'No codes', performed_by: 'Ray Patel' });
    // Rental for one job
    if (i === 2) await ins('rentals', { job_id: job, provider: 'Sample Rent-A-Car', vehicle: 'Compact sedan', reservation_no: 'RS-55821', start_date: addDays(today(), -3), end_date: addDays(today(), 4), daily_rate: 38, covered_days: 10, status: 'out' });
    // Invoices + payments for delivered / completed
    if (['delivered', 'completed'].includes(status)) {
      const loc = await db.prepare('SELECT * FROM locations WHERE id=?').bind(L1).first();
      const insr = insurer ? await db.prepare('SELECT * FROM insurers WHERE id=?').bind(insurer).first() : null;
      const { computeTotals } = await import('./logic.js');
      const jr = await db.prepare('SELECT * FROM jobs WHERE id=?').bind(job).first();
      const t = computeTotals(dl, { loc, insurer: insr, job: jr, vehicle: null });
      const invNo = 'INV-' + String(1001 + i);
      const invId = await ins('invoices', { job_id: job, location_id: L1, number: invNo, bill_to: insr ? insr.name : name, parts: t.parts, labor: t.labor, paint: t.paint_materials, sublet: t.sublet, other: t.misc, tax: t.tax, total: t.total, deductible: t.deductible, customer_portion: t.customer_pays, insurer_portion: t.insurer_pays, status: status === 'delivered' ? 'paid' : 'open', due_date: addDays(today(), 14), sent_at: nowIso(), created: addDays(today(), -(delAgo ?? 1)) + ' 15:00:00' });
      if (status === 'delivered') {
        await ins('payments', { job_id: job, invoice_id: invId, payer: 'customer', kind: insr ? 'deductible' : 'customer pay', method: 'card', amount: t.customer_pays, user_name: 'Priya Shah' });
        if (insr) await ins('payments', { job_id: job, invoice_id: invId, payer: 'insurer', kind: 'insurance', method: 'EFT', amount: t.insurer_pays, reference: 'EFT-' + (900100 + i), user_name: 'Priya Shah' });
        await ins('reviews', { job_id: job, rating: csi, comment: csi === 5 ? 'Looks brand new, great updates by text.' : 'Good work, took a day longer than promised.', responded_at: nowIso() });
      }
    }
    await ins('job_events', { job_id: job, type: 'stage', detail: 'Demo job created at stage ' + stage, user_name: 'setup' });
  }
  await db.prepare("INSERT INTO counters (name,value) VALUES ('job',10010),('inv',1010),('po',100) ON CONFLICT(name) DO UPDATE SET value=excluded.value").run();
  // Messages sample
  await ins('messages', { job_id: jobs[2], customer_id: 3, channel: 'sms', to_addr: '(555) 101-2203', subject: 'Repair schedule update', body: 'Hi Aisha, a part for your repair is delayed. We will update your completion date as soon as it ships.', status: 'queued (no SMS provider connected)', auto: 1 });
  return { ok: true, users: creds, jobs: jobs.length };
}
