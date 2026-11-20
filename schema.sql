-- CollisionPro: collision repair estimating + shop management (D1 / SQLite)
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, address TEXT, phone TEXT, email TEXT,
  tax_rate REAL DEFAULT 0.07,            -- sales tax on parts + paint materials
  tax_labor INTEGER DEFAULT 0,           -- 1 if labor is taxable in this state
  rate_body REAL DEFAULT 0, rate_paint REAL DEFAULT 0, rate_mech REAL DEFAULT 0,
  rate_frame REAL DEFAULT 0, rate_structural REAL DEFAULT 0, rate_glass REAL DEFAULT 0,
  paint_mat_rate REAL DEFAULT 0,         -- $ per refinish hour (auto paint & materials)
  total_loss_pct REAL DEFAULT 0.75,      -- total-loss threshold as share of ACV
  bays INTEGER DEFAULT 6, booths INTEGER DEFAULT 1, booth_slots_per_day INTEGER DEFAULT 6,
  tech_hours_per_day REAL DEFAULT 8,
  stage_alert_hours TEXT,                -- JSON {stage: hours} for bottleneck alerts
  est_rules TEXT,                        -- JSON power settings: paint/materials formula, taxes per category, markups/discounts
  created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL,                     -- owner, manager, estimator, technician, parts, accounting
  location_id INTEGER,                    -- NULL = all locations
  department TEXT,                        -- body, paint, mechanical, detail, frame (technicians)
  pay_type TEXT DEFAULT 'flat',           -- flat (per flagged hour) or hourly
  pay_rate REAL DEFAULT 0, commission_pct REAL DEFAULT 0,
  pw_hash TEXT, pw_salt TEXT, active INTEGER DEFAULT 1,
  created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires TEXT NOT NULL,
  created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT DEFAULT (datetime('now')), user_id INTEGER, user_name TEXT, location_id INTEGER,
  action TEXT, entity TEXT, entity_id INTEGER, job_id INTEGER, detail TEXT, ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_job ON audit_log(job_id);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, location_id INTEGER,
  name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT,
  contact_pref TEXT DEFAULT 'sms', sms_opt_in INTEGER DEFAULT 1, notes TEXT,
  created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER,
  vin TEXT, year INTEGER, make TEXT, model TEXT, trim TEXT, body TEXT, engine TEXT,
  color TEXT, paint_code TEXT, odometer INTEGER, plate TEXT,
  acv REAL,                               -- actual cash value (for total-loss check)
  adas TEXT,                              -- JSON list of ADAS features decoded from VIN
  vin_data TEXT,                          -- JSON raw decode subset
  created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS insurers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, drp INTEGER DEFAULT 0, contact TEXT, email TEXT, phone TEXT,
  rate_body REAL, rate_paint REAL, rate_mech REAL, rate_frame REAL, paint_mat_rate REAL,
  parts_discounts TEXT,                   -- JSON {OEM: pct, aftermarket: pct, ...} DRP parts discounts
  payment_terms_days INTEGER DEFAULT 30, cycle_target_days REAL, severity_target REAL, csi_target REAL,
  integration TEXT DEFAULT 'manual',      -- manual / email / (partner network: placeholder)
  notes TEXT, created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, location_id INTEGER NOT NULL,
  number TEXT, customer_id INTEGER, vehicle_id INTEGER, insurer_id INTEGER,
  claim_no TEXT, policy_no TEXT, adjuster TEXT, adjuster_email TEXT,
  deductible REAL DEFAULT 0, loss_date TEXT, loss_type TEXT, point_of_impact TEXT,
  pay_type TEXT DEFAULT 'insurance',      -- insurance / customer pay / warranty
  status TEXT DEFAULT 'estimate',         -- estimate, approved, scheduled, in_production, completed, delivered, closed, total_loss, lost
  stage TEXT DEFAULT 'intake',            -- production board column
  stage_since TEXT,
  drp_status TEXT,                        -- assignment, estimate_submitted, approved, supplement_submitted, supplement_approved, invoiced, paid, reinspection_requested, reinspection_passed
  source TEXT DEFAULT 'walk-in',
  priority INTEGER DEFAULT 0,
  estimator_id INTEGER,
  drop_off_at TEXT, target_date TEXT, promised_date TEXT,
  key_in_at TEXT, repair_start_at TEXT, completed_at TEXT, delivered_at TEXT,
  approved_at TEXT, approved_by TEXT,
  total_loss INTEGER DEFAULT 0,
  blueprint_status TEXT DEFAULT 'not started', -- not started, teardown, blueprinted, supplement sent
  pre_scan_status TEXT DEFAULT 'needed', post_scan_status TEXT DEFAULT 'needed',
  comeback INTEGER DEFAULT 0, csi_score REAL,
  portal_token TEXT,
  notes TEXT,
  created TEXT DEFAULT (datetime('now')), updated TEXT DEFAULT (datetime('now'))
,
  portal_viewed_at TEXT, portal_off INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_jobs_loc ON jobs(location_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_portal ON jobs(portal_token);

CREATE TABLE IF NOT EXISTS job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, ts TEXT DEFAULT (datetime('now')),
  type TEXT, detail TEXT, user_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_job ON job_events(job_id);

CREATE TABLE IF NOT EXISTS estimate_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL,
  supplement_no INTEGER DEFAULT 0,        -- 0 = original estimate, 1.. = supplement number
  line_no INTEGER, area TEXT,
  operation TEXT,                         -- replace, repair, r&i, refinish, blend, sublet, misc, o/h, align, add_labor, add_cost
  description TEXT,
  part_type TEXT,                         -- OEM, aftermarket, recycled, reconditioned, (blank = no part)
  part_no TEXT, qty REAL DEFAULT 1, unit_price REAL DEFAULT 0, part_cost REAL,
  labor_type TEXT DEFAULT 'body',         -- body, refinish, frame, mech, structural, glass
  labor_hours REAL DEFAULT 0,
  teardown_hours REAL DEFAULT 0,         -- teardown / R&I time to access or remove the part
  refinish_hours REAL DEFAULT 0,
  sublet_amount REAL DEFAULT 0,
  not_included INTEGER DEFAULT 0,         -- operation not included in the database labor time (P-page)
  p_page_ref TEXT, oem_proc_ref TEXT,
  adas_flag TEXT, notes TEXT,
  source TEXT DEFAULT 'manual',           -- manual, ai, import, catalog, 3d
  catalog_key TEXT,
  ai_confidence REAL, reviewed INTEGER DEFAULT 1,
  labor_overlap REAL DEFAULT 0,           -- overlap deduction on labor hours
  refinish_overlap REAL DEFAULT 0,        -- refinish overlap deduction (e.g. -0.4 adjacent major panel)
  incl INTEGER DEFAULT 0,                 -- included in another operation: listed, no time or $
  judgment INTEGER DEFAULT 0,             -- estimator judgment time (not from the labor guide)
  markup_pct REAL,                        -- NULL = use location rule for the part type
  discount_pct REAL,                      -- NULL = use location rule for the part type
  betterment_pct REAL DEFAULT 0,          -- share of the part charged to the customer (wear / betterment)
  taxable INTEGER DEFAULT 1,
  paint_stage TEXT,                       -- '', 2stage, 3stage, 2tone
  created TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lines_job ON estimate_lines(job_id);

CREATE TABLE IF NOT EXISTS supplements (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, number INTEGER,
  reason TEXT, status TEXT DEFAULT 'draft', -- draft, submitted, approved, rejected
  amount REAL DEFAULT 0, submitted_at TEXT, decided_at TEXT, decided_by TEXT,
  created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, location_id INTEGER,
  category TEXT DEFAULT 'photo',          -- photo, video, document, signature
  kind TEXT,                              -- vin, odometer, front, rear, left, right, lf, rf, lr, rr, damage, interior, teardown, progress, delivery, scan_pre, scan_post, oem_procedure, adas_calibration, weld, blueprint, other
  name TEXT, content_type TEXT, size INTEGER, chunks INTEGER DEFAULT 1,
  caption TEXT, annotations TEXT, parent_id INTEGER, supplement_id INTEGER,
  ai_result TEXT, customer_visible INTEGER DEFAULT 0,
  created_by TEXT, created TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_files_job ON files(job_id);

CREATE TABLE IF NOT EXISTS file_chunks (
  file_id INTEGER NOT NULL, idx INTEGER NOT NULL, data BLOB,
  PRIMARY KEY (file_id, idx)
);

CREATE TABLE IF NOT EXISTS ro_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER,
  department TEXT,                        -- body, frame, paint, mechanical, detail
  description TEXT, tech_id INTEGER, flagged_hours REAL DEFAULT 0,
  status TEXT DEFAULT 'pending',          -- pending, in_progress, done
  started_at TEXT, finished_at TEXT, created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, task_id INTEGER, tech_id INTEGER,
  clock_in TEXT, clock_out TEXT, minutes REAL, note TEXT
);

CREATE TABLE IF NOT EXISTS sublets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER,
  type TEXT,                              -- glass, alignment, ADAS calibration, PDR, towing, upholstery, mechanical
  vendor TEXT, po TEXT, cost REAL DEFAULT 0, price REAL DEFAULT 0,
  status TEXT DEFAULT 'needed',           -- needed, scheduled, sent, done
  due TEXT, notes TEXT, created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  type TEXT,                              -- OEM dealer, aftermarket, recycled, reconditioned, paint, sublet
  contact TEXT, email TEXT, phone TEXT, account_no TEXT, discount_pct REAL DEFAULT 0,
  integration TEXT DEFAULT 'manual',      -- manual / email / (network: placeholder)
  avg_delivery_days REAL, notes TEXT, created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, line_id INTEGER,
  part_no TEXT, description TEXT, part_type TEXT, qty REAL DEFAULT 1,
  list_price REAL DEFAULT 0, cost REAL DEFAULT 0, sell_price REAL DEFAULT 0,
  vendor_id INTEGER, po_id INTEGER,
  status TEXT DEFAULT 'needed',           -- needed, quoted, ordered, shipped, backordered, received, installed, returned
  eta TEXT, ordered_at TEXT, received_at TEXT,
  condition TEXT,                         -- ok, wrong part, damaged, missing
  core_charge REAL DEFAULT 0, core_returned INTEGER DEFAULT 0,
  return_reason TEXT, credit_amount REAL DEFAULT 0, credit_status TEXT,
  notes TEXT, created TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_parts_job ON parts(job_id);

CREATE TABLE IF NOT EXISTS part_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, part_id INTEGER, vendor_id INTEGER,
  part_type TEXT, price REAL, list_price REAL, eta_days REAL, in_stock INTEGER DEFAULT 1,
  selected INTEGER DEFAULT 0, source TEXT DEFAULT 'manual', created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, location_id INTEGER, job_id INTEGER, vendor_id INTEGER,
  number TEXT, status TEXT DEFAULT 'sent', total REAL DEFAULT 0,
  sent_via TEXT, created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS schedule_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, location_id INTEGER, job_id INTEGER,
  type TEXT,                              -- drop_off, delivery, estimate_appt, booth, rental_pickup, rental_return, other
  title TEXT, start TEXT, end TEXT, resource TEXT, notes TEXT,
  auto_moved INTEGER DEFAULT 0, created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rentals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER,
  provider TEXT, vehicle TEXT, reservation_no TEXT,
  start_date TEXT, end_date TEXT, daily_rate REAL DEFAULT 0, covered_days INTEGER DEFAULT 0,
  status TEXT DEFAULT 'reserved',         -- reserved, out, returned
  notes TEXT, created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, customer_id INTEGER,
  channel TEXT, direction TEXT DEFAULT 'out', to_addr TEXT, subject TEXT, body TEXT,
  status TEXT,                            -- queued (no provider), sent, received, failed
  auto INTEGER DEFAULT 0, created TEXT DEFAULT (datetime('now')),
  ext_id TEXT, error TEXT, from_addr TEXT, read_at TEXT, user_name TEXT, status_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_ext ON messages(ext_id);
CREATE INDEX IF NOT EXISTS idx_messages_job ON messages(job_id, created);
CREATE TABLE IF NOT EXISTS private_kv (name TEXT PRIMARY KEY, value TEXT, secret INTEGER DEFAULT 0, updated TEXT);

CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, type TEXT,
  signer_name TEXT, supplement_id INTEGER, signature_file_id INTEGER, amount REAL, ip TEXT, user_agent TEXT,
  signed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, requested_at TEXT DEFAULT (datetime('now')),
  rating INTEGER, comment TEXT, responded_at TEXT
);

CREATE TABLE IF NOT EXISTS paint_formulas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, make TEXT, color_code TEXT, color_name TEXT,
  variant TEXT, brand TEXT, toners TEXT, notes TEXT, sample INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS paint_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT, location_id INTEGER, sku TEXT, name TEXT, brand TEXT,
  category TEXT, unit TEXT, on_hand REAL DEFAULT 0, reorder_point REAL DEFAULT 0, reorder_qty REAL DEFAULT 0,
  unit_cost REAL DEFAULT 0, supplier TEXT, sample INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS paint_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, inventory_id INTEGER, qty REAL, cost REAL,
  user_name TEXT, created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, location_id INTEGER, number TEXT,
  bill_to TEXT,                            -- insurer / customer
  parts REAL, labor REAL, paint REAL, sublet REAL, other REAL, tax REAL, total REAL,
  deductible REAL, customer_portion REAL, insurer_portion REAL,
  status TEXT DEFAULT 'open', due_date TEXT, sent_at TEXT, exported_at TEXT,
  created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, invoice_id INTEGER,
  payer TEXT,                              -- customer / insurer
  kind TEXT,                               -- deductible, insurer, customer pay, refund
  method TEXT, amount REAL, reference TEXT, received_at TEXT DEFAULT (datetime('now')), user_name TEXT
);

CREATE TABLE IF NOT EXISTS adas_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, system TEXT, reason TEXT,
  calibration TEXT, required INTEGER DEFAULT 1,
  status TEXT DEFAULT 'needed',           -- needed, sublet, done, not required
  performed_by TEXT, performed_at TEXT, file_id INTEGER, notes TEXT
);

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, type TEXT, -- pre / post / in-process
  tool TEXT, dtcs TEXT, result TEXT, performed_by TEXT, performed_at TEXT DEFAULT (datetime('now')),
  file_id INTEGER, source TEXT DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS weld_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, tech_name TEXT,
  weld_type TEXT, location_on_vehicle TEXT, procedure_ref TEXT, equipment TEXT, settings TEXT,
  test_weld INTEGER DEFAULT 0, destructive_test_pass INTEGER, certification TEXT, notes TEXT,
  created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oem_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, make TEXT, title TEXT, type TEXT, -- position statement, repair procedure, ADAS requirement
  url TEXT, summary TEXT, keywords TEXT, sample INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS job_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, oem_doc_id INTEGER, line_id INTEGER, note TEXT,
  created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS compliance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, location_id INTEGER, type TEXT, -- EPA, OSHA
  item TEXT, performed_on TEXT, next_due TEXT, detail TEXT, user_name TEXT,
  created TEXT DEFAULT (datetime('now'))
);

-- Parts catalog + labor guide (generic per body style). Every row is SAMPLE data until replaced
-- by a licensed estimating database (CCC ONE / Mitchell / Audatex) or an OEM VIN parts catalog.
CREATE TABLE IF NOT EXISTS catalog_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, name TEXT, grp TEXT, assembly TEXT, mesh TEXT,
  styles TEXT,                            -- comma list: sedan,coupe,truck
  ops TEXT,                               -- comma list of allowed operations
  labor_type TEXT, replace_hours REAL, repair_hours REAL, teardown_hours REAL, refinish_hours REAL,
  price_oem REAL, price_aftermarket REAL, price_recycled REAL, price_reconditioned REAL,
  adas TEXT, paintable INTEGER DEFAULT 0, ai_label TEXT, sample INTEGER DEFAULT 1, notes TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  location_id INTEGER DEFAULT 0, key TEXT, value TEXT, PRIMARY KEY (location_id, key)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, prefix TEXT, key_hash TEXT, scopes TEXT,
  location_id INTEGER, active INTEGER DEFAULT 1, last_used TEXT, created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER);

CREATE TABLE IF NOT EXISTS share_links (
  token TEXT PRIMARY KEY, job_id INTEGER, kind TEXT, supp INTEGER,
  expires TEXT, created_by TEXT, created TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lines_job ON estimate_lines(job_id);
CREATE INDEX IF NOT EXISTS idx_parts_job ON parts(job_id);
CREATE INDEX IF NOT EXISTS idx_files_job ON files(job_id);
CREATE INDEX IF NOT EXISTS idx_events_job ON job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_audit_job ON audit_log(job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_loc ON jobs(location_id, status);
CREATE INDEX IF NOT EXISTS idx_chunks ON file_chunks(file_id, idx);

CREATE TABLE IF NOT EXISTS certifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, person TEXT, name TEXT NOT NULL, issuer TEXT, cert_no TEXT,
  issued_on TEXT, expires_on TEXT, notes TEXT, reminded_on TEXT, created TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS adjusters (
  id INTEGER PRIMARY KEY AUTOINCREMENT, insurer_id INTEGER, name TEXT NOT NULL, phone TEXT, email TEXT, notes TEXT, created TEXT DEFAULT (datetime('now'))
);
