# Elastic worker

Serves the app itself at elastic.kaiserkhan.com (the built `../dist`, as Workers static assets), with everything below under `/api` there. The `workers.dev` address answers the same routes at the root, for app versions from before the move.

Sends Elastic's notifications (time's up, and heads-ups before fixed-time tasks) while the app is closed or the phone is locked, and holds accounts for using one plan on several devices.

## Notifications without an account

- `POST /schedule` with `{ "endpoint": "<push subscription endpoint>", "at": [<epoch ms>, …] }` books a push at each time (up to 20), replacing any booked before. A single number is accepted too.
- `POST /cancel` with `{ "endpoint": "…" }` cancels them.

Each browser gets a Durable Object (`Timer`, named after its push endpoint) that stores the endpoint and the times and sets an alarm for the earliest; when the alarm fires it sends an empty, VAPID-signed push and sets the alarm for the next time, forgetting the endpoint after the last. Pushes carry no payload, so no task data reaches the worker this way.

## Accounts

Signing in (`src/auth.ts`, D1 database `elastic-day`, schema in `migrations/`):

- `POST /auth/email/send`, `/auth/email/verify`: a six-digit code by email (through [Resend](https://resend.com); key in the `RESEND_API_KEY` secret, sender in `EMAIL_FROM`). Without a session, a code signs in, or makes the account if the address is new (the reply to `send` is the same either way). With one, it adds or changes the account's email (and can set its name at the same time). Codes last 10 minutes and allow 5 tries; at most 6 an hour go to one address and 30 to one network. The counts and tries are each kept in one statement, so requests at the same moment can't get past them, and a code is used up once. Resend gets 10 seconds to answer. Without a key `/auth/config` says `{ "email": false }`; with `DEV_MAIL` set (local) and no key, codes are kept at `GET /dev/mail` instead of sent. Where a key is set, `DEV_MAIL` does nothing.
- `POST /auth/name`: set the account's name.
- `POST /auth/register/start`, `/auth/register/finish` (signed in): add a passkey to the account, labelled with the browser and device it was made on.
- `POST /auth/login/start`, `/auth/login/finish`: sign in with any passkey made for the site.
- `POST /auth/passkeys/remove`, `/auth/signout`, `/account` (details, with the passkeys), `/account/delete`.
- `POST /account/handoff` (signed in) and `/auth/handoff` with `{ code }`: carry a sign-in to the app's new address. The first gives a one-time code good for two minutes (stored hashed); the second signs in with it.

Passkeys belong to `RP_ID` (kaiserkhan.com) when the page is on it or a subdomain, so the ones made at kaiserkhan.com/planner/ work at elastic.kaiserkhan.com; anywhere else (localhost) they belong to the page's own host.

An account syncs once it has a verified email and a name. Accounts made with only a passkey (before October 2026) still sign in, but `/sync` answers them with `{ "t": "setup" }` and their alerts stop until they add both.

Signing in returns a token; only its SHA-256 is stored. A session unused for a year lapses.

Each account has a Durable Object (`Account`, `src/account.ts`) holding its plan as versioned records (each day, each repeating task, and the shared settings), its devices, and the alerts to send them:

- `GET /sync` is a WebSocket (token as the second subprotocol, after `elastic-day-2`). Each record (a day, a repeating task, a goal, a review, the shared settings) is kept as paths, each with the moment it was set, and the later setting of each path wins (`shared/lww.ts`, the same code the app uses). The app says `hello` with the last number it saw and gets every record changed since; it sends `put`s of the paths it changed and gets an `ack`. Each record a put changes gets the next number and goes out whole to the account's other open connections at once. Nothing is refused for being out of date, so there's nothing to merge and resend. A burst of deletions of much of the account is refused unless the put says it's meant (Erase everything, Import). An app still on the older `elastic-day` protocol is closed with code 4426 until it updates.
- `POST /sync/beacon` (text/plain, token in the body): what the app sends as it goes into the background.
- `POST /alerts/due` (text/plain, token in the body): for the service worker, the alerts due now.

When an alert is due, every device of the account with a push address gets an empty push, except one that has the app open and in front of it.

## Boardo

The account's link to [Boardo](https://kaiserkhan.com/boardo/), the shared project boards app (`src/boardo.ts`, D1 table `boardo_links`). It's one link per account, so every device signed in to it shows the cards assigned to the person there. This Worker talks to Boardo's over a service binding (`BOARDO`, Boardo's `ElasticLink` entrypoint), and devices never hold Boardo's token. All of these need an account that's set up:

- `POST /boardo`: linked (as which Boardo account), or `match`, the Boardo account with this account's email, and whether the person said no to it (`declined`).
- `POST /boardo/link`: link to the Boardo account with this account's email.
- `POST /boardo/connect` with `{ code, verifier, redirect_uri }`: link to the account approved on Boardo's connect page (OAuth with PKCE).
- `POST /boardo/adopt` with `{ token }`: a device's own token from before links were per account becomes the account's link.
- `POST /boardo/cards`, `/boardo/ops`: the person's cards, and start, stop and done marks for them.
- `POST /boardo/disconnect`, `/boardo/decline`.

Boardo calls back through its own binding to the `BoardoHooks` entrypoint when someone's cards change, and their account tells its open devices (`{ "t": "boardo" }` on the sync socket). Locally, run both Workers with `wrangler dev` and they find each other.

Requests are only accepted from the origins in `ALLOWED_ORIGINS`, for the browsers' own push services, and for times within the next 24 hours. The routes anyone can call without signing in (`/schedule`, `/cancel`, and starting a passkey sign-in or registration) take at most 60 requests a minute from one network (Cloudflare's rate limiting, the `LIMITER` binding).

An account holds up to 20,000 records. New ones past that aren't kept, and the `ack` lists them as `full`, so the app can say so rather than retrying them.

```bash
npx wrangler d1 migrations apply elastic-day --local   # once, for wrangler dev
npx wrangler dev --local-upstream localhost:8787       # local (build the app first), private key in .dev.vars
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put RESEND_API_KEY                  # run in a terminal: it asks for the key
npx wrangler d1 migrations apply elastic-day --remote
npx wrangler deploy                                    # or npm run deploy from the repo root
```

Wrangler needs Node 22 or newer. `scripts/vapid-keys.mjs` generates a key pair.
