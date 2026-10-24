// Talking to the worker about accounts: making one with an email (a six-digit code) and a name,
// signing in with a passkey or a code, adding and removing passkeys, and the account's details.

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

export const API = import.meta.env.VITE_PUSH_URL?.replace(/\/$/, '') ?? '';

export interface User {
  id: string;
  email: string | null;
  /** Accounts made with only a passkey (before October 2026) have neither name nor email. */
  name?: string | null;
}

/** An account syncs once it has a verified email and a name. */
export const complete = (u: User | null | undefined) => !!u?.email && !!u.name;

/** This device's sign-in, kept in IndexedDB (meta 'account'). */
export interface Session {
  token: string;
  user: User;
  /** Tells this device apart from the account's others. */
  device: string;
}

export interface SignedIn {
  token: string;
  user: User;
  fresh: boolean;
}

export interface PasskeyInfo {
  id: string;
  /** "Safari on iPhone"; null for ones made before labels. */
  label: string | null;
  created: number;
  used: number | null;
}

export interface AccountInfo extends User {
  created: number;
  passkeys: number;
  keys: PasskeyInfo[];
  /** How many days, repeating tasks and settings the account holds. */
  records: number;
}

export const accountsAvailable = () => !!API && typeof window !== 'undefined' && 'WebSocket' in window;
/** Whether this browser can make and use passkeys at all. */
export const passkeysAvailable = () => typeof window !== 'undefined' && 'PublicKeyCredential' in window;

/** A refusal from the worker, with a message to show. 401: signed out. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Calls that use something up or send something (a code, a sign-in, an email): the request may
 * have arrived even when no answer came back, so they're never sent twice.
 */
const ONCE = new Set([
  '/auth/email/send',
  '/auth/email/verify',
  '/auth/handoff',
  '/auth/login/finish',
  '/auth/register/finish',
  '/account/handoff',
  '/account/delete',
  '/boardo/connect',
  '/boardo/adopt',
]);
/** How long a call waits for an answer: a network that hangs mustn't hold the app up. */
const WAIT_MS = 15_000;

async function call<T>(path: string, body: object = {}, token?: string): Promise<T> {
  const init = () => ({
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout?.(WAIT_MS),
  });
  const unreachable = () => new ApiError(0, "Can't reach Elastic. Check your connection and try again.");
  let res: Response;
  try {
    res = await fetch(API + path, init());
  } catch {
    if (ONCE.has(path)) throw unreachable();
    // No answer at all: try once more after a moment before saying so.
    await new Promise((r) => setTimeout(r, 800));
    try {
      res = await fetch(API + path, init());
    } catch {
      throw unreachable();
    }
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong. Try again.');
  return data as T;
}

/** A call to the worker as the signed-in account (Boardo's link uses it too). */
export const apiCall = <T>(path: string, body: object, token: string) => call<T>(path, body, token);

/** The browser's passkey prompt was closed, or timed out: not worth an error message. */
export const cancelled = (e: unknown) =>
  e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'AbortError');

function passkeyError(e: unknown): never {
  if (e instanceof ApiError || cancelled(e)) throw e;
  if (e instanceof Error && e.name === 'InvalidStateError')
    throw new ApiError(409, 'This device already has a passkey for this account.');
  throw new ApiError(0, "This browser couldn't make or use a passkey.");
}

type Options<K extends 'optionsJSON'> = Parameters<typeof startRegistration>[0][K];

/** Another passkey for the signed-in account (another browser, a security key). */
export async function addPasskey(token: string): Promise<void> {
  const { challengeId, options } = await call<{ challengeId: string; options: Options<'optionsJSON'> }>(
    '/auth/register/start',
    {},
    token,
  );
  const response = await startRegistration({ optionsJSON: options }).catch(passkeyError);
  await call('/auth/register/finish', { challengeId, response }, token);
}

/**
 * Sign in with a passkey. `autofill`: offered quietly in the email field's suggestions (where
 * the browser can), waiting until one is picked; the prompt is the browser's either way.
 */
export async function signInWithPasskey(autofill = false): Promise<SignedIn> {
  const { challengeId, options } = await call<{
    challengeId: string;
    options: Parameters<typeof startAuthentication>[0]['optionsJSON'];
  }>('/auth/login/start');
  const response = await startAuthentication({ optionsJSON: options, useBrowserAutofill: autofill }).catch(
    passkeyError,
  );
  return call('/auth/login/finish', { challengeId, response });
}

/** Whether passkeys can be offered in the email field's suggestions. */
export async function passkeyAutofill(): Promise<boolean> {
  try {
    return passkeysAvailable() && !!(await PublicKeyCredential.isConditionalMediationAvailable?.());
  } catch {
    return false;
  }
}

/** Whether email codes can be used yet. */
export async function emailAvailable(): Promise<boolean> {
  try {
    return (await call<{ email: boolean }>('/auth/config')).email;
  } catch {
    return false;
  }
}

/** Email a code: to sign in or make an account, or (with `token`) to add or change its email. */
export const sendCode = (email: string, token?: string) => call<void>('/auth/email/send', { email }, token);

export function verifyCode(email: string, code: string): Promise<SignedIn>;
export function verifyCode(email: string, code: string, token: string, name?: string): Promise<User>;
export function verifyCode(email: string, code: string, token?: string, name?: string) {
  return call('/auth/email/verify', { email, code, ...(name !== undefined ? { name } : {}) }, token);
}

export const setName = (token: string, name: string) => call<{ name: string }>('/auth/name', { name }, token);
export const removePasskey = (token: string, id: string) => call<void>('/auth/passkeys/remove', { id }, token);
export const accountInfo = (token: string) => call<AccountInfo>('/account', {}, token);
export const deleteAccount = (token: string) => call<void>('/account/delete', {}, token);

/** Best effort: the token is forgotten here either way. */
/** A one-time code to carry this sign-in to the app's new address (src/lib/move.ts). */
export const startHandoff = (token: string) => call<{ code: string }>('/account/handoff', {}, token);
/** Arriving at the new address: the old one's code, for a sign-in here. */
export const finishHandoff = (code: string) => call<SignedIn>('/auth/handoff', { code });

/** Sign this device out on the server: the session goes, and so do the account's pushes to it. */
export async function signOutRemote(token: string, device?: string): Promise<void> {
  await call('/auth/signout', device ? { device } : {}, token).catch(() => {});
}
