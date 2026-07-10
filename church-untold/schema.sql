PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL CHECK (length(event_id) BETWEEN 1 AND 80),
  answers_json TEXT NOT NULL CHECK (json_valid(answers_json)),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_submissions_event_expires
  ON submissions (event_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_submissions_expires
  ON submissions (expires_at);
