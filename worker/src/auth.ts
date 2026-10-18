// Accounts and signing in. A passkey (Face ID, Touch ID, a security key) is the main way in; a
// verified email can be added as a backup, to get a six-digit code when no passkey is to hand.
// Signing in gives the device a session token, which it sends with every request. Only a hash
// of the token is stored.

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { cleanEmail } from './checks';
import { b64url, fromB64url } from './vapid';

export interface AuthEnv {
  DB: D1Database;
  /** Cloudflare Email Service. Without it, email codes are switched off. */
  EMAIL?: SendEmail;
  /** Who the codes come from, e.g. "Elastic Day <hello@example.com>". */
  EMAIL_FROM?: string;
}

/** What the app gets back from signing in. */
export interface SignedIn {
  token: string;
  user: { id: string; email: string | null };
  /** A new account, with nothing in it yet. */
  fresh: boolean;
}

/** Thrown for anything the app should show: the status and a short reason. */
export class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const CHALLENGE_MS = 5 * 60_000;
const CODE_MS = 10 * 60_000;
const CODE_GAP_MS = 60_000;
const CODE_TRIES = 5;
/** A device that hasn't been used for this long is signed out. */
const SESSION_IDLE_MS = 365 * 24 * 3600_000;
const DAY_MS = 24 * 3600_000;

const enc = new TextEncoder();
const randomId = (bytes = 16) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

async function sha256(s: string): Promise<string> {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

/** The relying party is the site the app is served from, as the browser reports it. */
const rpOf = (origin: string) => ({ rpID: new URL(origin).hostname, origin });

// ---------- sessions ----------

async function newSession(env: AuthEnv, userId: string): Promise<string> {
  const token = randomId(32);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (hash, user_id, created, used) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, now, now)
    .run();
  return token;
}

/** Whose session this token is, or null. */
export async function sessionUser(env: AuthEnv, token: unknown): Promise<string | null> {
  if (typeof token !== 'string' || !token || token.length > 100) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare('SELECT user_id, used FROM sessions WHERE hash = ?')
    .bind(hash)
    .first<{ user_id: string; used: number }>();
  if (!row) return null;
  const now = Date.now();
  if (now - row.used > SESSION_IDLE_MS) {
    await env.DB.prepare('DELETE FROM sessions WHERE hash = ?').bind(hash).run();
    return null;
  }
  if (now - row.used > DAY_MS)
    await env.DB.prepare('UPDATE sessions SET used = ? WHERE hash = ?').bind(now, hash).run();
  return row.user_id;
}

export async function signOut(env: AuthEnv, token: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE hash = ?')
    .bind(await sha256(token))
    .run();
}

async function signedIn(env: AuthEnv, userId: string, fresh: boolean): Promise<SignedIn> {
  const user = await env.DB.prepare('SELECT email FROM users WHERE id = ?')
    .bind(userId)
    .first<{ email: string | null }>();
  return { token: await newSession(env, userId), user: { id: userId, email: user?.email ?? null }, fresh };
}

export async function accountInfo(env: AuthEnv, userId: string) {
  const user = await env.DB.prepare('SELECT email, created FROM users WHERE id = ?')
    .bind(userId)
    .first<{ email: string | null; created: number }>();
  if (!user) return null;
  const keys = await env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?')
    .bind(userId)
    .first<{ n: number }>();
  return { id: userId, email: user.email, created: user.created, passkeys: keys?.n ?? 0 };
}

export async function deleteUser(env: AuthEnv, userId: string): Promise<void> {
  await env.DB.batch(
    ['users WHERE id', 'passkeys WHERE user_id', 'sessions WHERE user_id', 'email_codes WHERE user_id'].map((w) =>
      env.DB.prepare(`DELETE FROM ${w} = ?`).bind(userId),
    ),
  );
}

// ---------- passkeys ----------

async function saveChallenge(env: AuthEnv, challenge: string, userId: string, purpose: string): Promise<string> {
  const id = randomId();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM challenges WHERE expires < ?').bind(now),
    env.DB.prepare('INSERT INTO challenges (id, challenge, user_id, purpose, expires) VALUES (?, ?, ?, ?, ?)').bind(
      id,
      challenge,
      userId,
      purpose,
      now + CHALLENGE_MS,
    ),
  ]);
  return id;
}

/** A challenge can be answered once, within a few minutes. */
async function takeChallenge(env: AuthEnv, id: unknown, purpose: string) {
  if (typeof id !== 'string' || id.length > 64) throw new Refusal(400, 'That took too long. Try again.');
  const row = await env.DB.prepare('DELETE FROM challenges WHERE id = ? RETURNING challenge, user_id, purpose, expires')
    .bind(id)
    .first<{ challenge: string; user_id: string; purpose: string; expires: number }>();
  if (!row || row.purpose !== purpose || row.expires < Date.now())
    throw new Refusal(400, 'That took too long. Try again.');
  return row;
}

/**
 * Options for making a passkey: for a new account, or (`userId`) another passkey on an account
 * that's signed in.
 */
export async function registerStart(env: AuthEnv, origin: string, userId: string | null) {
  const { rpID } = rpOf(origin);
  const uid = userId ?? randomId();
  let userName = 'Elastic Day';
  let exclude: { id: string; transports?: string[] }[] = [];
  if (userId) {
    const user = await env.DB.prepare('SELECT email FROM users WHERE id = ?')
      .bind(userId)
      .first<{ email: string | null }>();
    if (!user) throw new Refusal(401, 'Signed out');
    if (user.email) userName = user.email;
    const keys = await env.DB.prepare('SELECT id, transports FROM passkeys WHERE user_id = ?')
      .bind(userId)
      .all<{ id: string; transports: string | null }>();
    exclude = keys.results.map((k) => ({ id: k.id, transports: k.transports ? JSON.parse(k.transports) : undefined }));
  }
  const options = await generateRegistrationOptions({
    rpName: 'Elastic Day',
    rpID,
    userName,
    userDisplayName: userName,
    userID: enc.encode(uid) as Uint8Array<ArrayBuffer>,
    attestationType: 'none',
    excludeCredentials: exclude,
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  const challengeId = await saveChallenge(env, options.challenge, uid, userId ? 'add' : 'new');
  return { challengeId, options };
}

/** Check the new passkey and keep it. A new account is signed in straight away. */
export async function registerFinish(
  env: AuthEnv,
  origin: string,
  userId: string | null,
  body: { challengeId?: unknown; response?: unknown },
): Promise<SignedIn | { ok: true }> {
  const ch = await takeChallenge(env, body.challengeId, userId ? 'add' : 'new');
  if (userId && ch.user_id !== userId) throw new Refusal(400, 'That took too long. Try again.');
  const { rpID } = rpOf(origin);
  let v;
  try {
    v = await verifyRegistrationResponse({
      response: body.response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
      expectedChallenge: ch.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch {
    throw new Refusal(400, "That passkey couldn't be checked. Try again.");
  }
  if (!v.verified) throw new Refusal(400, "That passkey couldn't be checked. Try again.");
  const { credential } = v.registrationInfo;
  const now = Date.now();
  const insertKey = env.DB.prepare(
    'INSERT INTO passkeys (id, user_id, public_key, counter, transports, created) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(
    credential.id,
    ch.user_id,
    b64url(credential.publicKey),
    credential.counter,
    credential.transports ? JSON.stringify(credential.transports) : null,
    now,
  );
  try {
    if (userId) await insertKey.run();
    else
      await env.DB.batch([
        env.DB.prepare('INSERT INTO users (id, created) VALUES (?, ?)').bind(ch.user_id, now),
        insertKey,
      ]);
  } catch {
    throw new Refusal(409, 'That passkey is already in use.');
  }
  return userId ? { ok: true } : signedIn(env, ch.user_id, true);
}

/** Options for signing in: any passkey this site made can answer. */
export async function loginStart(env: AuthEnv, origin: string) {
  const { rpID } = rpOf(origin);
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
  const challengeId = await saveChallenge(env, options.challenge, '', 'login');
  return { challengeId, options };
}

export async function loginFinish(
  env: AuthEnv,
  origin: string,
  body: { challengeId?: unknown; response?: unknown },
): Promise<SignedIn> {
  const ch = await takeChallenge(env, body.challengeId, 'login');
  const response = body.response as Parameters<typeof verifyAuthenticationResponse>[0]['response'];
  const id = response && typeof response === 'object' ? response.id : null;
  const key =
    typeof id === 'string' && id.length <= 1024
      ? await env.DB.prepare('SELECT user_id, public_key, counter, transports FROM passkeys WHERE id = ?')
          .bind(id)
          .first<{ user_id: string; public_key: string; counter: number; transports: string | null }>()
      : null;
  if (!key) throw new Refusal(400, "That passkey isn't linked to an account any more.");
  const { rpID } = rpOf(origin);
  let v;
  try {
    v = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: id!,
        publicKey: fromB64url(key.public_key) as Uint8Array<ArrayBuffer>,
        counter: key.counter,
        transports: key.transports ? JSON.parse(key.transports) : undefined,
      },
      requireUserVerification: false,
    });
  } catch {
    throw new Refusal(400, "That passkey couldn't be checked. Try again.");
  }
  if (!v.verified) throw new Refusal(400, "That passkey couldn't be checked. Try again.");
  await env.DB.prepare('UPDATE passkeys SET counter = ?, used = ? WHERE id = ?')
    .bind(v.authenticationInfo.newCounter, Date.now(), id)
    .run();
  return signedIn(env, key.user_id, false);
}

// ---------- email codes ----------

/** Six digits, evenly spread. */
function sixDigits(): string {
  const max = 4_294_000_000; // a multiple of 10^6 below 2^32, so no digit is favoured
  for (;;) {
    const [n] = crypto.getRandomValues(new Uint32Array(1));
    if (n < max) return String(n % 1_000_000).padStart(6, '0');
  }
}

/**
 * Email a code: to sign in (`userId` null; only to an account's verified backup email, and
 * without saying whether there is one), or to verify a backup email for a signed-in account.
 */
export async function emailSend(env: AuthEnv, body: { email?: unknown }, userId: string | null): Promise<void> {
  if (!env.EMAIL || !env.EMAIL_FROM) throw new Refusal(503, "Email codes aren't available yet.");
  const email = cleanEmail(body.email);
  if (!email) throw new Refusal(400, "That doesn't look like an email address.");
  const purpose = userId ? 'add' : 'signin';
  const owner = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
  let forUser: string;
  if (userId) {
    if (owner && owner.id !== userId) throw new Refusal(409, 'That email is already used by another account.');
    forUser = userId;
  } else {
    if (!owner) return; // say nothing: whether an email has an account is nobody's business
    forUser = owner.id;
  }
  const last = await env.DB.prepare('SELECT sent FROM email_codes WHERE email = ? AND purpose = ?')
    .bind(email, purpose)
    .first<{ sent: number }>();
  const now = Date.now();
  if (last && now - last.sent < CODE_GAP_MS)
    throw new Refusal(429, 'A code is on its way. Wait a minute before asking for another.');
  const code = sixDigits();
  await env.DB.prepare(
    'INSERT OR REPLACE INTO email_codes (email, purpose, user_id, hash, expires, tries, sent) VALUES (?, ?, ?, ?, ?, 0, ?)',
  )
    .bind(email, purpose, forUser, await sha256(`${email}|${code}`), now + CODE_MS, now)
    .run();
  await env.EMAIL.send({
    from: env.EMAIL_FROM,
    to: email,
    subject: `Your Elastic Day code is ${code}`,
    text: `Your Elastic Day code is ${code}\n\nIt works for 10 minutes. If you didn't ask for it, you can ignore this email.`,
  });
}

/** Check an emailed code: sign in, or (signed in) keep the email as the account's backup. */
export async function emailVerify(
  env: AuthEnv,
  body: { email?: unknown; code?: unknown },
  userId: string | null,
): Promise<SignedIn | { email: string }> {
  const email = cleanEmail(body.email);
  const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '') : '';
  const purpose = userId ? 'add' : 'signin';
  const wrong = new Refusal(400, "That code isn't right, or it has expired.");
  if (!email || code.length !== 6) throw wrong;
  const row = await env.DB.prepare(
    'SELECT user_id, hash, expires, tries FROM email_codes WHERE email = ? AND purpose = ?',
  )
    .bind(email, purpose)
    .first<{ user_id: string; hash: string; expires: number; tries: number }>();
  if (!row || row.expires < Date.now() || row.tries >= CODE_TRIES || (userId && row.user_id !== userId)) throw wrong;
  if ((await sha256(`${email}|${code}`)) !== row.hash) {
    await env.DB.prepare('UPDATE email_codes SET tries = tries + 1 WHERE email = ? AND purpose = ?')
      .bind(email, purpose)
      .run();
    throw wrong;
  }
  await env.DB.prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ?').bind(email, purpose).run();
  if (!userId) return signedIn(env, row.user_id, false);
  try {
    await env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(email, userId).run();
  } catch {
    throw new Refusal(409, 'That email is already used by another account.');
  }
  return { email };
}

export async function removeEmail(env: AuthEnv, userId: string): Promise<void> {
  await env.DB.prepare('UPDATE users SET email = NULL WHERE id = ?').bind(userId).run();
}
