CREATE TABLE IF NOT EXISTS admin_magic_links (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX IF NOT EXISTS admin_magic_links_expiry_idx ON admin_magic_links(expires_at);
