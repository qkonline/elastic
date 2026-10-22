-- Email first (October 2026): every account has a verified email and a name; passkeys are the
-- quick way back in, listed by the device they were made on.
ALTER TABLE users ADD COLUMN name TEXT;
ALTER TABLE passkeys ADD COLUMN label TEXT;

-- Rate limits: a count per key (an email or a network) inside a window that starts at `start`.
CREATE TABLE limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  start INTEGER NOT NULL
);
