// Accounts and signing in. An account is made with an email (confirmed with a six-digit code)
// and a name; passkeys (Face ID, Touch ID, a security key) are added to it as the quick way back
// in, and a code to the email always works too. Accounts made before that, with only a passkey,
// sign in as before but don't sync until they add a name and an email (`complete`).
// Signing in gives the device a session token, which it sends with every request. Only a hash
// of the token is stored.

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { cleanEmail, cleanName, deviceLabel } from './checks';
import { type MailEnv, sendMail } from './mail';
import { b64url, fromB64url } from './vapid';

export interface AuthEnv extends MailEnv {
  DB: D1Database;
  /** The passkey site for this domain and its subdomains (kaiserkhan.com). */
  RP_ID?: string;
}

export interface User {
  id: string;
  email: string | null;
  name: string | null;
}

/** What the app gets back from signing in. */
export interface SignedIn {
  token: string;
  user: User;
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
/** Codes per address, and per network, per hour. */
const PER_EMAIL = 6;
const PER_IP = 30;
/** A device that hasn't been used for this long is signed out. */
const SESSION_IDLE_MS = 365 * 24 * 3600_000;
const DAY_MS = 24 * 3600_000;

const enc = new TextEncoder();
const randomId = (bytes = 16) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

async function sha256(s: string): Promise<string> {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

/** The relying party is the site the app is served from, as the browser reports it. */
/**
 * The passkey site: RP_ID (kaiserkhan.com) for the page on it or any of its subdomains, so a
 * passkey made on kaiserkhan.com/planner/ works on elastic.kaiserkhan.com; otherwise the page's
 * own host (localhost in development).
 */
function rpOf(env: AuthEnv, origin: string) {
  const host = new URL(origin).hostname;
  const root = env.RP_ID;
  return { rpID: root && (host === root || host.endsWith('.' + root)) ? root : host, origin };
}

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

async function userOf(env: AuthEnv, userId: string): Promise<User | null> {
  return env.DB.prepare('SELECT id, email, name FROM users WHERE id = ?').bind(userId).first<User>();
}

/** An account syncs once it has a verified email and a name. */
export const complete = (u: User | null) => !!u?.email && !!u.name;

/** Whether this account may sync yet. */
export async function canSync(env: AuthEnv, userId: string): Promise<boolean> {
  return complete(await userOf(env, userId));
}

async function signedIn(env: AuthEnv, userId: string, fresh: boolean): Promise<SignedIn> {
  const user = (await userOf(env, userId)) ?? { id: userId, email: null, name: null };
  return { token: await newSession(env, userId), user, fresh };
}

export interface PasskeyInfo {
  id: string;
  /** "Safari on iPhone"; null for ones made before labels. */
  label: string | null;
  created: number;
  used: number | null;
}

export async function accountInfo(env: AuthEnv, userId: string) {
  const user = await env.DB.prepare('SELECT email, name, created FROM users WHERE id = ?')
    .bind(userId)
    .first<{ email: string | null; name: string | null; created: number }>();
  if (!user) return null;
  const keys = await env.DB.prepare(
    'SELECT id, label, created, used FROM passkeys WHERE user_id = ? ORDER BY COALESCE(used, created) DESC',
  )
    .bind(userId)
    .all<PasskeyInfo>();
  return { id: userId, ...user, passkeys: keys.results.length, keys: keys.results };
}

export async function deleteUser(env: AuthEnv, userId: string): Promise<void> {
  await env.DB.batch(
    ['users WHERE id', 'passkeys WHERE user_id', 'sessions WHERE user_id', 'email_codes WHERE user_id'].map((w) =>
      env.DB.prepare(`DELETE FROM ${w} = ?`).bind(userId),
    ),
  );
}

/** Set or change the account's name. */
export async function setName(env: AuthEnv, userId: string, body: { name?: unknown }): Promise<{ name: string }> {
  const name = cleanName(body.name);
  if (!name) throw new Refusal(400, 'Enter your name.');
  await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, userId).run();
  return { name };
}

/** Take a passkey off the account. The last one only goes once there's an email to sign in with. */
export async function removePasskey(env: AuthEnv, userId: string, body: { id?: unknown }): Promise<void> {
  if (typeof body.id !== 'string' || body.id.length > 1024) throw new Refusal(400, 'No such passkey.');
  const [user, keys] = await Promise.all([
    userOf(env, userId),
    env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?').bind(userId).first<{ n: number }>(),
  ]);
  if (!user?.email && (keys?.n ?? 0) <= 1)
    throw new Refusal(409, "Add your email first, or you'd have no way to sign in.");
  await env.DB.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?').bind(body.id, userId).run();
}

// ---------- moving to another address ----------

const HANDOFF_MS = 2 * 60_000;

/**
 * A one-time code for this sign-in to carry over to the app's new address (another origin, so
 * it has none of this one's storage). Good for two minutes; it makes a new session there.
 */
export async function handoffStart(env: AuthEnv, userId: string): Promise<{ code: string }> {
  const code = randomId(24);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM handoffs WHERE expires < ?').bind(now),
    env.DB.prepare('INSERT INTO handoffs (code_hash, user_id, expires) VALUES (?, ?, ?)').bind(
      await sha256(code),
      userId,
      now + HANDOFF_MS,
    ),
  ]);
  return { code };
}

export async function handoffFinish(env: AuthEnv, body: { code?: unknown }): Promise<SignedIn> {
  const gone = new Refusal(400, 'That link has expired. Sign in here instead.');
  if (typeof body.code !== 'string' || body.code.length > 64) throw gone;
  const row = await env.DB.prepare('DELETE FROM handoffs WHERE code_hash = ? AND expires >= ? RETURNING user_id')
    .bind(await sha256(body.code), Date.now())
    .first<{ user_id: string }>();
  if (!row) throw gone;
  return signedIn(env, row.user_id, false);
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
 * Options for adding a passkey to the signed-in account. (Accounts are made with an email now;
 * a passkey is only ever added to one.)
 */
export async function registerStart(env: AuthEnv, origin: string, userId: string | null) {
  if (!userId) throw new Refusal(403, 'Make your account with your email first.');
  const { rpID } = rpOf(env, origin);
  const user = await userOf(env, userId);
  if (!user) throw new Refusal(401, 'Signed out');
  const userName = user.email ?? 'Elastic';
  const keys = await env.DB.prepare('SELECT id, transports FROM passkeys WHERE user_id = ?')
    .bind(userId)
    .all<{ id: string; transports: string | null }>();
  const exclude = keys.results.map((k) => ({
    id: k.id,
    transports: k.transports ? JSON.parse(k.transports) : undefined,
  }));
  const options = await generateRegistrationOptions({
    rpName: 'Elastic',
    rpID,
    userName,
    userDisplayName: user.name ?? userName,
    userID: enc.encode(userId) as Uint8Array<ArrayBuffer>,
    attestationType: 'none',
    excludeCredentials: exclude,
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  const challengeId = await saveChallenge(env, options.challenge, userId, 'add');
  return { challengeId, options };
}

/** Check the new passkey and keep it, labelled with the device it was made on. */
export async function registerFinish(
  env: AuthEnv,
  origin: string,
  userId: string | null,
  body: { challengeId?: unknown; response?: unknown },
  ua: string | null,
): Promise<{ ok: true }> {
  if (!userId) throw new Refusal(403, 'Make your account with your email first.');
  const ch = await takeChallenge(env, body.challengeId, 'add');
  if (ch.user_id !== userId) throw new Refusal(400, 'That took too long. Try again.');
  const { rpID } = rpOf(env, origin);
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
  try {
    await env.DB.prepare(
      'INSERT INTO passkeys (id, user_id, public_key, counter, transports, created, label) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        credential.id,
        userId,
        b64url(credential.publicKey),
        credential.counter,
        credential.transports ? JSON.stringify(credential.transports) : null,
        Date.now(),
        deviceLabel(ua),
      )
      .run();
  } catch {
    throw new Refusal(409, 'That passkey is already in use.');
  }
  return { ok: true };
}

/** Options for signing in: any passkey this site made can answer. */
export async function loginStart(env: AuthEnv, origin: string) {
  const { rpID } = rpOf(env, origin);
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
  const { rpID } = rpOf(env, origin);
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
 * Count one use of `key` in a window (an hour unless said); false once it's over `max`. Rate
 * limits for sending codes, per address and per network, and for trying them.
 */
async function withinLimit(env: AuthEnv, key: string, max: number, now: number, window = 3_600_000): Promise<boolean> {
  // One statement, so requests at the same moment can't all read the same count.
  const row = await env.DB.prepare(
    `INSERT INTO limits (key, count, start) VALUES (?1, 1, ?2)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN ?2 - start > ?3 THEN 1 ELSE count + 1 END,
       start = CASE WHEN ?2 - start > ?3 THEN ?2 ELSE start END
     RETURNING count`,
  )
    .bind(key, now, window)
    .first<{ count: number }>();
  return (row?.count ?? 1) <= max;
}

/** Tries at codes for one address in a day, whatever the network: guessing stays hopeless. */
const TRIES_A_DAY = 30;

/**
 * Email a code: to sign in, or make an account (`userId` null; the same for new and known
 * addresses, so it says nothing about who has an account), or to add or change the email of the
 * signed-in account.
 */
export async function emailSend(
  env: AuthEnv,
  body: { email?: unknown },
  userId: string | null,
  ip: string,
): Promise<void> {
  const email = cleanEmail(body.email);
  if (!email) throw new Refusal(400, "That doesn't look like an email address.");
  const purpose = userId ? 'add' : 'signin';
  if (userId) {
    const owner = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
    if (owner && owner.id !== userId) throw new Refusal(409, 'That email is already used by another account.');
  }
  const last = await env.DB.prepare('SELECT sent FROM email_codes WHERE email = ? AND purpose = ?')
    .bind(email, purpose)
    .first<{ sent: number }>();
  const now = Date.now();
  if (last && now - last.sent < CODE_GAP_MS)
    throw new Refusal(429, 'A code is on its way. Wait a minute before asking for another.');
  // The network first: one that's used up its codes mustn't use up an address's too.
  if (!(await withinLimit(env, `ip:${ip}`, PER_IP, now)) || !(await withinLimit(env, `email:${email}`, PER_EMAIL, now)))
    throw new Refusal(429, 'Too many codes asked for. Try again in an hour.');
  const code = sixDigits();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT OR REPLACE INTO email_codes (email, purpose, user_id, hash, expires, tries, sent) VALUES (?, ?, ?, ?, ?, 0, ?)',
    ).bind(email, purpose, userId ?? '', await sha256(`${email}|${code}`), now + CODE_MS, now),
    // Old counts and codes nobody used go, so neither table grows for ever.
    env.DB.prepare('DELETE FROM limits WHERE start < ?').bind(now - 2 * DAY_MS),
    env.DB.prepare('DELETE FROM email_codes WHERE expires < ?').bind(now - DAY_MS),
  ]);
  const p = 'font:16px/1.5 system-ui,sans-serif';
  await sendMail(env, {
    to: email,
    subject: `Your Elastic code is ${code}`,
    text: `Your Elastic code is ${code}\n\nIt works for 10 minutes. If you didn't ask for it, you can ignore this email.`,
    html: `<p style="${p}">Your Elastic code is</p><p style="font:600 28px/1.2 system-ui,sans-serif;letter-spacing:4px">${code}</p><p style="font:14px/1.5 system-ui,sans-serif;color:#5b6170">It works for 10 minutes. If you didn't ask for it, you can ignore this email.</p>`,
  });
}

/**
 * Check an emailed code. Signed out: sign in, or make the account if the address is new.
 * Signed in: keep it as the account's email (with `name`, when one is given at the same time).
 */
export async function emailVerify(
  env: AuthEnv,
  body: { email?: unknown; code?: unknown; name?: unknown },
  userId: string | null,
): Promise<SignedIn | User> {
  const email = cleanEmail(body.email);
  const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '') : '';
  const purpose = userId ? 'add' : 'signin';
  const wrong = new Refusal(400, "That code isn't right, or it has expired.");
  if (!email || code.length !== 6) throw wrong;
  const name = body.name === undefined ? undefined : cleanName(body.name);
  if (name === null) throw new Refusal(400, 'Enter your name.');
  if (!(await withinLimit(env, `tries:${email}`, TRIES_A_DAY, Date.now(), DAY_MS)))
    throw new Refusal(429, 'Too many tries for this email today. Try again tomorrow.');
  // Every try counts before the code is compared, in one statement, so tries at the same moment
  // can't get past the limit; the right code is then used up once (a second, concurrent use fails).
  const row = await env.DB.prepare(
    `UPDATE email_codes SET tries = tries + 1
     WHERE email = ? AND purpose = ? AND tries < ? AND expires >= ? RETURNING user_id, hash`,
  )
    .bind(email, purpose, CODE_TRIES, Date.now())
    .first<{ user_id: string; hash: string }>();
  if (!row || (userId && row.user_id !== userId)) throw wrong;
  if ((await sha256(`${email}|${code}`)) !== row.hash) throw wrong;
  const used = await env.DB.prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ? AND hash = ? RETURNING 1')
    .bind(email, purpose, row.hash)
    .first();
  if (!used) throw wrong;
  if (!userId) {
    const owner = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
    if (owner) return signedIn(env, owner.id, false);
    const id = randomId();
    try {
      await env.DB.prepare('INSERT INTO users (id, created, email, name) VALUES (?, ?, ?, ?)')
        .bind(id, Date.now(), email, name ?? null)
        .run();
    } catch {
      // Made a moment ago by another device with the same code's twin: sign in to that one.
      const again = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
      if (again) return signedIn(env, again.id, false);
      throw new Refusal(500, 'Something went wrong. Try again.');
    }
    return signedIn(env, id, true);
  }
  try {
    await env.DB.prepare('UPDATE users SET email = ?, name = COALESCE(?, name) WHERE id = ?')
      .bind(email, name ?? null, userId)
      .run();
  } catch {
    throw new Refusal(409, 'That email is already used by another account.');
  }
  return (await userOf(env, userId))!;
}
