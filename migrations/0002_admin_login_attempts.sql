CREATE TABLE IF NOT EXISTS admin_login_attempts (
  client_hash TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  window_started INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0
);
