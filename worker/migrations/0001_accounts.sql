-- Accounts: who someone is and how they sign in. Their plan lives in their Account Durable Object.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  created INTEGER NOT NULL,
  -- Verified backup email, for signing in with a code when no passkey is to hand.
  email TEXT UNIQUE
);

CREATE TABLE passkeys (
  id TEXT PRIMARY KEY,           -- credential id, base64url
  user_id TEXT NOT NULL,
  public_key TEXT NOT NULL,      -- COSE public key, base64url
  counter INTEGER NOT NULL,
  transports TEXT,               -- JSON list
  created INTEGER NOT NULL,
  used INTEGER
);
CREATE INDEX passkeys_user ON passkeys (user_id);

-- One per signed-in device. Only a hash of the token is kept.
CREATE TABLE sessions (
  hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created INTEGER NOT NULL,
  used INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- Passkey challenges, good for a few minutes and used once.
CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL,         -- 'new' | 'add' | 'login'
  expires INTEGER NOT NULL
);

-- Emailed sign-in codes, hashed.
CREATE TABLE email_codes (
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,         -- 'signin' | 'add'
  user_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  expires INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL,
  PRIMARY KEY (email, purpose)
);
