// The account's link to Boardo, the shared project boards app (its docs/ARCHITECTURE.md section
// 5 is the contract). Since 23 October 2026 it's one link per account, kept here and used by
// every device signed in to it, through a service binding to Boardo's Worker that nothing
// outside this Cloudflare account can call:
// - an account whose email has a Boardo account is offered the link (`match`) and makes it in
//   one tap: both apps confirmed the email with a code, so it's the same person;
// - a Boardo account with another email links through Boardo's connect page, whose code the app
//   hands here to swap;
// - Boardo tells this Worker whose cards changed (`BoardoHooks`), and each of those accounts
//   tells its open devices to fetch them.
// The devices never hold the link's token. Signing out ends Projects on a device with the rest.

import { WorkerEntrypoint } from 'cloudflare:workers';
import type { Account } from './account';
import { type AuthEnv, Refusal } from './auth';

interface Linked {
  token: string;
  user: { email: string; name: string | null };
}

/** Boardo's side of the binding (Boardo's worker/src/link.ts). */
export interface BoardoLink {
  lookup(email: string): Promise<{ boards: number } | null>;
  linkByEmail(email: string, ext: string): Promise<Linked | null>;
  exchange(body: Record<string, unknown>, ext: string): Promise<Linked | { error: string }>;
  adopt(token: string, ext: string): Promise<Linked | null>;
  cards(token: string): Promise<{ boards: number; cards: unknown[] } | null>;
  ops(token: string, ops: unknown[]): Promise<{ results: { id: string; ok: boolean; error?: string }[] } | null>;
  revoke(token: string): Promise<void>;
}

export interface BoardoEnv extends AuthEnv {
  /** Absent where Boardo isn't set up (and in tests): no Projects. */
  BOARDO?: BoardoLink;
  ACCOUNTS: DurableObjectNamespace<Account>;
}

interface Row {
  token: string | null;
  email: string | null;
  name: string | null;
  declined: number;
}

/** What the app shows: linked (as whom), or the Boardo account its email could link to. */
export interface BoardoStatus {
  linked: { email: string; name: string | null } | null;
  match: { email: string; boards: number } | null;
  declined: boolean;
}

const MAX_OPS = 200;

function boardo(env: BoardoEnv): BoardoLink {
  if (!env.BOARDO) throw new Refusal(503, "Boardo isn't connected to this server.");
  return env.BOARDO;
}

const row = (env: BoardoEnv, userId: string) =>
  env.DB.prepare('SELECT token, email, name, declined FROM boardo_links WHERE user_id = ?').bind(userId).first<Row>();

async function keep(env: BoardoEnv, userId: string, l: Linked): Promise<BoardoStatus> {
  await env.DB.prepare(
    'INSERT OR REPLACE INTO boardo_links (user_id, token, email, name, declined, created) VALUES (?, ?, ?, ?, 0, ?)',
  )
    .bind(userId, l.token, l.user.email, l.user.name, Date.now())
    .run();
  return { linked: l.user, match: null, declined: false };
}

/** No link any more (disconnected here, or revoked in Boardo). It isn't offered on its own again. */
async function drop(env: BoardoEnv, userId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO boardo_links (user_id, token, declined, created) VALUES (?, NULL, 1, ?)
     ON CONFLICT (user_id) DO UPDATE SET token = NULL, email = NULL, name = NULL, declined = 1`,
  )
    .bind(userId, Date.now())
    .run();
}

async function email(env: BoardoEnv, userId: string): Promise<string | null> {
  const u = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first<{ email: string | null }>();
  return u?.email ?? null;
}

export async function boardoStatus(env: BoardoEnv, userId: string): Promise<BoardoStatus> {
  const r = await row(env, userId);
  if (r?.token) return { linked: { email: r.email ?? '', name: r.name }, match: null, declined: false };
  const declined = !!r?.declined;
  if (!env.BOARDO) return { linked: null, match: null, declined };
  const mine = await email(env, userId);
  const found = mine ? await env.BOARDO.lookup(mine) : null;
  return {
    linked: null,
    match: mine && found && found.boards > 0 ? { email: mine, boards: found.boards } : null,
    declined,
  };
}

/** Link to the Boardo account with this account's email. */
export async function boardoLink(env: BoardoEnv, userId: string): Promise<BoardoStatus> {
  const mine = await email(env, userId);
  const l = mine ? await boardo(env).linkByEmail(mine, userId) : null;
  if (!l) throw new Refusal(404, `There's no Boardo account for ${mine ?? 'your email'}.`);
  return keep(env, userId, l);
}

/** Back from Boardo's connect page: swap its code (the PKCE verifier came with it). */
export async function boardoConnect(env: BoardoEnv, userId: string, body: Record<string, unknown>) {
  const { code, verifier, redirect_uri } = body;
  const l = await boardo(env).exchange({ code, verifier, client_id: 'elastic', redirect_uri }, userId);
  if ('error' in l) throw new Refusal(400, l.error);
  return keep(env, userId, l);
}

/** A device's own connection from before links were per account: it becomes the account's. */
export async function boardoAdopt(env: BoardoEnv, userId: string, body: { token?: unknown }) {
  if (typeof body.token !== 'string' || body.token.length > 100) throw new Refusal(400, 'Bad request');
  const b = boardo(env);
  const r = await row(env, userId);
  // Already linked: the device's token isn't needed any more.
  if (r?.token) {
    await b.revoke(body.token);
    return boardoStatus(env, userId);
  }
  const l = await b.adopt(body.token, userId);
  return l ? keep(env, userId, l) : boardoStatus(env, userId);
}

/** The person's cards, or `linked: null` if the link has gone (revoked in Boardo). */
export async function boardoCards(env: BoardoEnv, userId: string) {
  const r = await row(env, userId);
  if (!r?.token) return { linked: null };
  const res = await boardo(env).cards(r.token);
  if (!res) {
    await drop(env, userId);
    return { linked: null };
  }
  return { linked: { email: r.email ?? '', name: r.name }, ...res };
}

export async function boardoOps(env: BoardoEnv, userId: string, body: { ops?: unknown }) {
  if (!Array.isArray(body.ops) || body.ops.length > MAX_OPS) throw new Refusal(400, 'Bad request');
  const r = await row(env, userId);
  if (!r?.token) return { linked: null, results: [] };
  const res = await boardo(env).ops(r.token, body.ops);
  if (!res) {
    await drop(env, userId);
    return { linked: null, results: [] };
  }
  return res;
}

export async function boardoDisconnect(env: BoardoEnv, userId: string): Promise<void> {
  const r = await row(env, userId);
  if (r?.token && env.BOARDO) await env.BOARDO.revoke(r.token).catch(() => {});
  await drop(env, userId);
}

/** "No thanks" to linking by email: Settings still offers it. */
export async function boardoDecline(env: BoardoEnv, userId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO boardo_links (user_id, token, declined, created) VALUES (?, NULL, 1, ?)
     ON CONFLICT (user_id) DO UPDATE SET declined = 1`,
  )
    .bind(userId, Date.now())
    .run();
}

/** The account is being deleted. */
export async function boardoForget(env: BoardoEnv, userId: string): Promise<void> {
  const r = await row(env, userId);
  if (r?.token && env.BOARDO) await env.BOARDO.revoke(r.token).catch(() => {});
  await env.DB.prepare('DELETE FROM boardo_links WHERE user_id = ?').bind(userId).run();
}

const isId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);

/** What Boardo's Worker calls over its binding to this one. */
export class BoardoHooks extends WorkerEntrypoint<BoardoEnv> {
  /** These accounts' cards changed in Boardo: tell their open devices. */
  async cardsChanged(accounts: string[]): Promise<void> {
    if (!Array.isArray(accounts)) return;
    const ids = accounts.filter(isId).slice(0, 500);
    await Promise.all(
      ids.map((id) =>
        this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName(id))
          .boardoChanged()
          .catch(() => {}),
      ),
    );
  }
}
