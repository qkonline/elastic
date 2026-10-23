-- Moving to elastic.kaiserkhan.com (October 2026): the old address hands its sign-in to the new
-- one with a one-time code, good for two minutes, stored hashed.
CREATE TABLE handoffs (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires INTEGER NOT NULL
);
