PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS debate_sessions (
  id TEXT PRIMARY KEY,
  host_token_hash TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'interests'
    CHECK (phase IN ('interests', 'sides', 'debate', 'response', 'summary')),
  topic_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  CHECK (expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS debate_participants (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES debate_sessions(id) ON DELETE CASCADE,
  participant_token_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  nickname_key TEXT NOT NULL,
  preferences_json TEXT NOT NULL CHECK (json_valid(preferences_json)),
  side TEXT CHECK (side IN ('A', 'B') OR side IS NULL),
  task_id TEXT,
  task_title TEXT,
  task_prompt TEXT,
  avatar_index INTEGER NOT NULL CHECK (avatar_index BETWEEN 0 AND 11),
  joined_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (session_id, nickname_key)
);

CREATE TABLE IF NOT EXISTS debate_votes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES debate_sessions(id) ON DELETE CASCADE,
  voter_token_hash TEXT NOT NULL,
  preferences_json TEXT NOT NULL CHECK (json_valid(preferences_json)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS debate_task_releases (
  session_id TEXT PRIMARY KEY REFERENCES debate_sessions(id) ON DELETE CASCADE,
  released_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_debate_sessions_expires
  ON debate_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_debate_participants_session
  ON debate_participants (session_id, joined_at);

CREATE INDEX IF NOT EXISTS idx_debate_votes_session
  ON debate_votes (session_id, created_at);
