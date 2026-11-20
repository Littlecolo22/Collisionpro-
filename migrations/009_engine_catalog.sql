-- Add a selectable engine assembly and its sample estimating parts.
INSERT OR IGNORE INTO catalog_parts
  (key,name,grp,assembly,mesh,styles,ops,labor_type,replace_hours,repair_hours,teardown_hours,refinish_hours,price_oem,price_aftermarket,price_recycled,price_reconditioned,adas,paintable,ai_label,sample)
VALUES
  ('engine','Engine assembly','Mechanical & electrical','engine','engine','sedan,coupe,truck,suv','replace,repair,r&i','mech',8,5,3,0,5200,2340,2860,NULL,'',0,'',1),
  ('engine_mount_l','Engine mount, left','Mechanical & electrical','engine','engine_mount_l','sedan,coupe,truck,suv','replace,r&i','mech',0.8,0,0.6,0,180,81,99,NULL,'',0,'',1),
  ('engine_mount_r','Engine mount, right','Mechanical & electrical','engine','engine_mount_r','sedan,coupe,truck,suv','replace,r&i','mech',0.8,0,0.6,0,180,81,99,NULL,'',0,'',1),
  ('engine_mount_rear','Rear engine mount','Mechanical & electrical','engine','engine_mount_rear','sedan,coupe,truck,suv','replace,r&i','mech',0.8,0,0.6,0,210,95,116,NULL,'',0,'',1),
  ('air_intake','Air intake duct','Mechanical & electrical','engine','air_intake','sedan,coupe,truck,suv','replace,r&i','mech',0.5,0,0.3,0,95,43,52,NULL,'',0,'',1),
  ('airbox','Air cleaner housing','Mechanical & electrical','engine','airbox','sedan,coupe,truck,suv','replace,r&i','mech',0.4,0,0.3,0,125,56,69,NULL,'',0,'',1),
  ('intake_manifold','Intake manifold','Mechanical & electrical','engine','intake_manifold','sedan,coupe,truck,suv','replace,r&i','mech',1.8,0,0.8,0,520,234,286,NULL,'',0,'',1),
  ('alternator','Alternator','Mechanical & electrical','engine','alternator','sedan,coupe,truck,suv','replace,r&i','mech',1.2,0,0.4,0,390,176,215,NULL,'',0,'',1),
  ('starter','Starter motor','Mechanical & electrical','engine','starter','sedan,coupe,truck,suv','replace,r&i','mech',1.4,0,0.5,0,280,126,154,NULL,'',0,'',1),
  ('belt_tensioner','Drive belt and tensioner','Mechanical & electrical','engine','belt_tensioner','sedan,coupe,truck,suv','replace,r&i','mech',0.8,0,0.3,0,160,72,88,NULL,'',0,'',1),
  ('engine_harness','Engine wiring harness','Mechanical & electrical','engine','engine_harness','sedan,coupe,truck,suv','replace,r&i','mech',2.5,0,1.0,0,680,306,374,NULL,'',0,'',1);

UPDATE catalog_parts SET assembly='engine', mesh='radiator' WHERE key='radiator';
UPDATE catalog_parts SET assembly='engine', mesh='condenser' WHERE key='condenser';
UPDATE catalog_parts SET assembly='engine', mesh='cooling_fan' WHERE key='cooling_fan';
UPDATE catalog_parts SET assembly='engine', mesh='battery' WHERE key='battery';
