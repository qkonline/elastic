# Elastic worker

Sends Elastic's notifications (time's up, and heads-ups before fixed-time tasks) while the app is closed or the phone is locked, and holds accounts for using one plan on several devices.

## Notifications without an account

- `POST /schedule` with `{ "endpoint": "<push subscription endpoint>", "at": [<epoch ms>, …] }` books a push at each time (up to 20), replacing any booked before. A single number is accepted too.
- `POST /cancel` with `{ "endpoint": "…" }` cancels them.

Each browser gets a Durable Object (`Timer`, named after its push endpoint) that stores the endpoint and the times and sets an alarm for the earliest; when the alarm fires it sends an empty, VAPID-signed push and sets the alarm for the next time, forgetting the endpoint after the last. Pushes carry no payload, so no task data reaches the worker this way.

## Accounts

Signing in (`src/auth.ts`, D1 database `elastic-day`, schema in `migrations/`):

- `POST /auth/email/send`, `/auth/email/verify`: a six-digit code by email (through [Resend](https://resend.com); key in the `RESEND_API_KEY` secret, sender in `EMAIL_FROM`). Without a session, a code signs in, or makes the account if the address is new (the reply to `send` is the same either way). With one, it adds or changes the account's email (and can set its name at the same time). Codes last 10 minutes and allow 5 tries; at most 6 an hour go to one address and 30 to one network. Without a key `/auth/config` says `{ "email": false }`; with `DEV_MAIL` set (local), codes are kept at `GET /dev/mail` instead of sent.
- `POST /auth/name`: set the account's name.
- `POST /auth/register/start`, `/auth/register/finish` (signed in): add a passkey to the account, labelled with the browser and device it was made on.
- `POST /auth/login/start`, `/auth/login/finish`: sign in with any passkey made for the site.
- `POST /auth/passkeys/remove`, `/auth/signout`, `/account` (details, with the passkeys), `/account/delete`.

An account syncs once it has a verified email and a name. Accounts made with only a passkey (before October 2026) still sign in, but `/sync` answers them with `{ "t": "setup" }` and their alerts stop until they add both.

Signing in returns a token; only its SHA-256 is stored. A session unused for a year lapses.

Each account has a Durable Object (`Account`, `src/account.ts`) holding its plan as versioned records (each day, each repeating task, and the shared settings), its devices, and the alerts to send them:

- `GET /sync` is a WebSocket (token as the second subprotocol, after `elastic-day`). The app says `hello` with the last version it saw and gets everything since; it sends `put`s, each record with the version it was changed from, and gets an `ack` with the new versions and, for any record another device changed first, the current one to merge with. Accepted changes go out to the account's other open connections at once.
- `POST /sync/beacon` (text/plain, token in the body): what the app sends as it goes into the background.
- `POST /alerts/due` (text/plain, token in the body): for the service worker, the alerts due now.

When an alert is due, every device of the account with a push address gets an empty push, except one that has the app open and in front of it.

Requests are only accepted from the origins in `ALLOWED_ORIGINS`, for the browsers' own push services, and for times within the next 24 hours.

```bash
npx wrangler d1 migrations apply elastic-day --local   # once, for wrangler dev
npx wrangler dev                                       # local, with the private key in .dev.vars
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put RESEND_API_KEY                  # run in a terminal: it asks for the key
npx wrangler d1 migrations apply elastic-day --remote
npx wrangler deploy
```

Wrangler needs Node 22 or newer. `scripts/vapid-keys.mjs` generates a key pair.
