-- Offline outbox: remembers the reply to each app request that carries an idempotency key, so a request that is sent
-- again after a dropped connection is answered from here instead of being done twice (no duplicate lines or customers).
CREATE TABLE IF NOT EXISTS idem_keys (
  k TEXT NOT NULL, user_id INTEGER NOT NULL, status INTEGER NOT NULL, body TEXT, created TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (k, user_id)
);
CREATE INDEX IF NOT EXISTS idx_idem_created ON idem_keys(created);
