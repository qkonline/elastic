-- The account's link to Boardo (October 2026): one per account, made once and used by every
-- device. `token` is Boardo's, of scope `elastic-link`, which works only over the service
-- binding between the two Workers. `declined`: the person said no to linking by their email, or
-- disconnected, so it isn't offered on its own again.
CREATE TABLE boardo_links (
  user_id TEXT PRIMARY KEY,
  token TEXT,
  email TEXT,
  name TEXT,
  declined INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
