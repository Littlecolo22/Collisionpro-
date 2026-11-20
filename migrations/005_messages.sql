-- Messages: SMS gateway columns + private (server-only) settings store
ALTER TABLE messages ADD COLUMN ext_id TEXT;
ALTER TABLE messages ADD COLUMN error TEXT;
ALTER TABLE messages ADD COLUMN from_addr TEXT;
ALTER TABLE messages ADD COLUMN read_at TEXT;
ALTER TABLE messages ADD COLUMN user_name TEXT;
ALTER TABLE messages ADD COLUMN status_at TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_ext ON messages(ext_id);
CREATE INDEX IF NOT EXISTS idx_messages_job ON messages(job_id, created);
CREATE TABLE IF NOT EXISTS private_kv (
  name TEXT PRIMARY KEY,
  value TEXT,
  secret INTEGER DEFAULT 0,
  updated TEXT
);
