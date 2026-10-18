// Talking to the worker about accounts: making one with a passkey, signing in (passkey, or an
// emailed code once a backup email is set), and the account's details.

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

export const API = import.meta.env.VITE_PUSH_URL?.replace(/\/$/, '') ?? '';

export interface User {
  id: string;
  email: string | null;
}

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

export interface AccountInfo extends User {
  created: number;
  passkeys: number;
  /** How many days, repeating tasks and settings the account holds. */
  records: number;
}

export const accountsAvailable = () =>
  !!API && typeof window !== 'undefined' && 'PublicKeyCredential' in window && 'WebSocket' in window;

/** A refusal from the worker, with a message to show. 401: signed out. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, body: object = {}, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach Elastic Day. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong. Try again.');
  return data as T;
}

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

/** Make a new account, with a passkey on this device. */
export async function createAccount(): Promise<SignedIn> {
  const { challengeId, options } = await call<{ challengeId: string; options: Options<'optionsJSON'> }>(
    '/auth/register/start',
  );
  const response = await startRegistration({ optionsJSON: options }).catch(passkeyError);
  return call('/auth/register/finish', { challengeId, response });
}

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

export async function signInWithPasskey(): Promise<SignedIn> {
  const { challengeId, options } = await call<{
    challengeId: string;
    options: Parameters<typeof startAuthentication>[0]['optionsJSON'];
  }>('/auth/login/start');
  const response = await startAuthentication({ optionsJSON: options }).catch(passkeyError);
  return call('/auth/login/finish', { challengeId, response });
}

/** Whether email codes can be used yet. */
export async function emailAvailable(): Promise<boolean> {
  try {
    return (await call<{ email: boolean }>('/auth/config')).email;
  } catch {
    return false;
  }
}

/** Email a code: to sign in, or (with `token`) to confirm a backup email. */
export const sendCode = (email: string, token?: string) => call<void>('/auth/email/send', { email }, token);

export function verifyCode(email: string, code: string): Promise<SignedIn>;
export function verifyCode(email: string, code: string, token: string): Promise<{ email: string }>;
export function verifyCode(email: string, code: string, token?: string) {
  return call('/auth/email/verify', { email, code }, token);
}

export const removeEmail = (token: string) => call<void>('/auth/email/remove', {}, token);
export const accountInfo = (token: string) => call<AccountInfo>('/account', {}, token);
export const deleteAccount = (token: string) => call<void>('/account/delete', {}, token);

/** Best effort: the token is forgotten here either way. */
export async function signOutRemote(token: string): Promise<void> {
  await call('/auth/signout', {}, token).catch(() => {});
}
