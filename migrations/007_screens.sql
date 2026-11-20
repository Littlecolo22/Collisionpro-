CREATE TABLE IF NOT EXISTS certifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, person TEXT, name TEXT NOT NULL, issuer TEXT, cert_no TEXT,
  issued_on TEXT, expires_on TEXT, notes TEXT, reminded_on TEXT, created TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS adjusters (
  id INTEGER PRIMARY KEY AUTOINCREMENT, insurer_id INTEGER, name TEXT NOT NULL, phone TEXT, email TEXT, notes TEXT, created TEXT DEFAULT (datetime('now'))
);
