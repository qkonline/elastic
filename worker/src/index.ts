// Elastic's worker.
//
// Notifications for a browser that isn't signed in: when the app goes into the background, it
// asks for a push at each moment it wants to notify (time's up, heads-ups before fixed times);
// coming back to the front cancels them. Each browser gets a Timer (keyed by its push address)
// holding that address, the times and an alarm for the next one. The pushes are empty: the
// app's service worker fills in what to say from its own data.
//
// Accounts, for using the same plan on several devices: signing in (auth.ts), then each account
// gets an Account (account.ts) holding its plan, which the app syncs with over a WebSocket, and
// sending its alerts to every device.

import { DurableObject } from 'cloudflare:workers';
import { Account, PROTOCOL, SESSION_HEADER } from './account';
import {
  accountInfo,
  type AuthEnv,
  canSync,
  deleteUser,
  emailSend,
  emailVerify,
  handoffFinish,
  handoffStart,
  loginFinish,
  loginStart,
  prune,
  Refusal,
  registerFinish,
  registerStart,
  removePasskey,
  sessionOf,
  setName,
  signOut,
  signOutOthers,
  turnstileKey,
} from './auth';
import {
  boardoAdopt,
  boardoCards,
  boardoConnect,
  boardoDecline,
  boardoDisconnect,
  type BoardoEnv,
  boardoForget,
  BoardoHooks,
  boardoLink,
  boardoOps,
  boardoStatus,
} from './boardo';
import { bookableTimes, isPushEndpoint, network, timerName } from './checks';
import { devMail, devOutbox, mailOn } from './mail';
import { sendPush } from './push';
import type { VapidKeys } from './vapid';

export { Account, BoardoHooks };

export interface Env extends VapidKeys, AuthEnv, BoardoEnv {
  TIMERS: DurableObjectNamespace<Timer>;
  ACCOUNTS: DurableObjectNamespace<Account>;
  /** Comma-separated origins allowed to call this worker. */
  ALLOWED_ORIGINS: string;
  /** Requests per network a minute on the routes anyone can call (absent in tests). */
  LIMITER?: RateLimit;
  /** The app's files (absent in tests). */
  ASSETS?: Fetcher;
}

/** Routes that need no sign-in, so each network (an IPv6 /64 counts as one) may only call them so often. */
export const OPEN = new Set([
  '/schedule',
  '/cancel',
  '/auth/login/start',
  '/auth/register/start',
  '/auth/handoff',
  '/auth/email/send',
  '/auth/email/verify',
]);
/** Pages that only ever served the WordPress site share its origin: no passkeys from there. */
const NO_PASSKEYS = new Set(['https://kaiserkhan.com', 'https://www.kaiserkhan.com']);

const MAX_BODY = 64 * 1024;

export default {
  // Once a day: old rate-limit counts, expired codes and challenges, and sessions unused for a year go.
  async scheduled(_event, env): Promise<void> {
    await prune(env);
  },

  async fetch(req, env): Promise<Response> {
    const origin = req.headers.get('origin') ?? '';
    const allowed = env.ALLOWED_ORIGINS.split(',').some((o) => o.trim() === origin);
    const cors: Record<string, string> = allowed
      ? {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'GET, POST',
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-max-age': '86400',
          vary: 'origin',
        }
      : {};
    const reply = (status: number, body?: unknown) =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: body === undefined ? cors : { ...cors, 'content-type': 'application/json' },
      });

    if (req.method === 'OPTIONS') return reply(allowed ? 204 : 403);
    // An address on the app's host that isn't one of its files (an old /planner/ link, say): the app.
    const path = new URL(req.url).pathname;
    if (!origin && req.method === 'GET' && env.ASSETS && !/^\/(api\/|sync$|dev\/)/.test(path))
      return Response.redirect(new URL('/', req.url).href, 302);
    if (!allowed) return reply(403);
    // On the app's own address (elastic.kaiserkhan.com) the API is under /api, and everything
    // else is the app's files (served before this runs). On workers.dev, which app versions from
    // before 23 Oct 2026 call, it's at the root.
    let { pathname } = new URL(req.url);
    if (pathname.startsWith('/api/')) pathname = pathname.slice(4);

    if (pathname === '/sync') return connect(req, env);
    // Local development only: the codes that would have been emailed.
    if (pathname === '/dev/mail' && devMail(env)) return reply(200, devOutbox);
    if (req.method !== 'POST') return reply(404);
    if (OPEN.has(pathname) && env.LIMITER) {
      const { success } = await env.LIMITER.limit({ key: network(req.headers.get('cf-connecting-ip')) });
      if (!success) return reply(429, { error: 'Too many requests. Try again in a minute.' });
    }

    let body: Record<string, unknown>;
    if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return reply(413);
    try {
      const text = await req.text();
      if (text.length > MAX_BODY) return reply(413);
      body = text ? JSON.parse(text) : {};
      if (!body || typeof body !== 'object') return reply(400);
    } catch {
      return reply(400);
    }

    try {
      // Calls that can't set headers (beacons, the service worker's) carry the token in the body.
      const token = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? body.token;
      const session = () => sessionOf(env, token);
      const user = async () => (await session())?.user ?? null;
      const mustSession = async () => {
        const s = await session();
        if (!s) throw new Refusal(401, 'Signed out');
        return s;
      };
      const mustUser = async () => (await mustSession()).user;
      const ip = req.headers.get('cf-connecting-ip') ?? '';
      const account = (id: string) => env.ACCOUNTS.get(env.ACCOUNTS.idFromName(id));
      // Signed in to an account that's set up (a name and an email), as syncing needs.
      const mustSetUp = async () => {
        const id = await mustUser();
        if (mailOn(env) && !(await canSync(env, id))) throw new Refusal(403, 'Finish setting up your account first.');
        return id;
      };

      if (pathname.startsWith('/auth/login/') || pathname.startsWith('/auth/register/'))
        if (NO_PASSKEYS.has(origin)) throw new Refusal(403, 'Sign in at elastic.kaiserkhan.com.');
      switch (pathname) {
        case '/schedule':
        case '/cancel':
          return reply(await timer(pathname, body, env));

        case '/auth/config':
          return reply(200, { email: mailOn(env), turnstile: turnstileKey(env) });
        case '/auth/register/start':
          return reply(200, await registerStart(env, origin, token ? await mustUser() : null));
        case '/auth/register/finish':
          return reply(
            200,
            await registerFinish(env, origin, token ? await mustUser() : null, body, req.headers.get('user-agent')),
          );
        case '/auth/login/start':
          return reply(200, await loginStart(env, origin));
        case '/auth/login/finish':
          return reply(200, await loginFinish(env, origin, body));
        case '/auth/email/send':
          await emailSend(env, body, token ? await mustUser() : null, ip);
          return reply(204);
        case '/auth/email/verify': {
          const signed = token ? await mustSession() : null;
          const r = await emailVerify(env, body, signed, ip);
          if (signed && 'others' in r) {
            // The email changed and the other sessions ended: their connections close too.
            const { others: _, ...u } = r;
            const device = typeof body.device === 'string' && body.device.length <= 64 ? body.device : null;
            await account(signed.user).signedOutOthers(device);
            return reply(200, u);
          }
          return reply(200, r);
        }
        case '/auth/name':
          return reply(200, await setName(env, await mustUser(), body));
        case '/auth/passkeys/remove':
          await removePasskey(env, await mustUser(), body);
          return reply(204);
        case '/auth/handoff':
          return reply(200, await handoffFinish(env, body));
        case '/account/handoff': {
          const s = await mustSession();
          return reply(200, await handoffStart(env, s.user, s.hash));
        }
        case '/auth/signout':
          if (typeof token === 'string') {
            // The device stops getting this account's pushes (its id came with the sign-out).
            const id = await user();
            if (id && typeof body.device === 'string' && body.device.length <= 64)
              await account(id).forget(body.device);
            await signOut(env, token);
            // Any other connection opened with this sign-in closes too.
            if (id) await account(id).checkSessions(true);
          }
          return reply(204);
        case '/auth/signout/others': {
          // Every other device signed in to the account is signed out, and its connection closes.
          const s = await mustSession();
          const n = await signOutOthers(env, s.user, s.hash);
          const device = typeof body.device === 'string' && body.device.length <= 64 ? body.device : null;
          await account(s.user).signedOutOthers(device);
          return reply(200, { signedOut: n });
        }

        case '/account': {
          const id = await mustUser();
          const info = await accountInfo(env, id);
          if (!info) throw new Refusal(401, 'Signed out');
          return reply(200, { ...info, ...(await account(id).info()) });
        }
        case '/account/delete': {
          const id = await mustUser();
          // Sign-ins go first, so nothing reaches the data meanwhile.
          await deleteUser(env, id);
          await boardoForget(env, id);
          await account(id).erase();
          return reply(204);
        }
        case '/sync/beacon': {
          const id = await mustUser();
          if (typeof body.device !== 'string' || body.device.length > 64) return reply(400);
          if (mailOn(env) && !(await canSync(env, id))) return reply(204);
          await account(id).beacon(body.device, body);
          return reply(204);
        }

        case '/boardo':
          return reply(200, await boardoStatus(env, await mustSetUp()));
        case '/boardo/link': {
          const id = await mustSetUp();
          const st = await boardoLink(env, id);
          await account(id).boardoChanged(); // the account's other devices pick it up
          return reply(200, st);
        }
        case '/boardo/connect': {
          const id = await mustSetUp();
          const st = await boardoConnect(env, id, body);
          await account(id).boardoChanged(); // the account's other devices pick it up
          return reply(200, st);
        }
        case '/boardo/adopt': {
          const id = await mustSetUp();
          const st = await boardoAdopt(env, id, body);
          await account(id).boardoChanged(); // the account's other devices pick it up
          return reply(200, st);
        }
        case '/boardo/cards':
          return reply(200, await boardoCards(env, await mustSetUp()));
        case '/boardo/ops':
          return reply(200, await boardoOps(env, await mustSetUp(), body));
        case '/boardo/disconnect': {
          const id = await mustSetUp();
          await boardoDisconnect(env, id);
          await account(id).boardoChanged();
          return reply(204);
        }
        case '/boardo/decline':
          await boardoDecline(env, await mustSetUp());
          return reply(204);

        case '/alerts/due':
          return reply(200, { groups: await account(await mustUser()).dueAlerts() });
      }
      return reply(404);
    } catch (e) {
      if (e instanceof Refusal) return reply(e.status, { error: e.message });
      console.error(e);
      return reply(500, { error: 'Something went wrong. Try again.' });
    }
  },
} satisfies ExportedHandler<Env>;

/**
 * The app's live connection to its account. Browsers can't set headers on a WebSocket, so the
 * token comes as the second subprotocol. A token that's no good gets a connection that only
 * says so (a refused upgrade would look like the network dropping), and the app hangs up. So
 * does an account that has no name or email yet ('setup'): it doesn't sync until it has, and
 * the alerts it was sending stop (each device books its own meanwhile).
 */
async function connect(req: Request, env: Env): Promise<Response> {
  if (req.headers.get('upgrade') !== 'websocket') return new Response(null, { status: 426 });
  const [proto, token] = (req.headers.get('sec-websocket-protocol') ?? '').split(',').map((s) => s.trim());
  // An app from before 24 Oct 2026 syncs whole records: it's asked to try again later (it reads
  // that as offline, not signed out) and takes the new build meanwhile.
  if (proto === 'elastic-day') {
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    server.close(4426, 'Update the app');
    return new Response(null, { status: 101, webSocket: client, headers: { 'sec-websocket-protocol': proto } });
  }
  const session = proto === PROTOCOL ? await sessionOf(env, token) : null;
  const id = session?.user ?? null;
  const account = id ? env.ACCOUNTS.get(env.ACCOUNTS.idFromName(id)) : null;
  // Only held back once email works, or it would have no way to be set up. The connection
  // remembers its session, so it closes once the session ends.
  if (session && account && (!mailOn(env) || (await canSync(env, session.user)))) {
    const headers = new Headers(req.headers);
    headers.set(SESSION_HEADER, session.hash);
    return account.fetch(new Request(req, { headers }));
  }
  if (account) await account.pause();
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  server.send(JSON.stringify({ t: id ? 'setup' : 'signedout' }));
  server.addEventListener('close', () => server.close());
  return new Response(null, { status: 101, webSocket: client, headers: { 'sec-websocket-protocol': PROTOCOL } });
}

async function timer(path: string, body: { endpoint?: unknown; at?: unknown }, env: Env): Promise<number> {
  if (!isPushEndpoint(body.endpoint)) return 400;
  // One Timer per push address, however it's written.
  const timer = env.TIMERS.get(env.TIMERS.idFromName(timerName(body.endpoint)));
  if (path === '/cancel') {
    await timer.cancel();
    return 204;
  }
  const times = bookableTimes(body.at);
  if (!times) return 400;
  await timer.book(body.endpoint, times);
  return 204;
}

/** One per browser that isn't signed in: the pushes booked for that browser, if any. */
export class Timer extends DurableObject<Env> {
  /** Replaces whatever was booked before. `times` is sorted, earliest first. */
  async book(endpoint: string, times: number[]): Promise<void> {
    await this.ctx.storage.put({ endpoint, times });
    await this.ctx.storage.setAlarm(Math.max(times[0], Date.now()));
  }

  async cancel(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  async alarm(): Promise<void> {
    const endpoint = await this.ctx.storage.get<string>('endpoint');
    // Book the next one before sending this one. (Bookings from before lists had no times.)
    const rest = ((await this.ctx.storage.get<number[]>('times')) ?? []).slice(1);
    if (rest.length && endpoint) {
      await this.ctx.storage.put('times', rest);
      await this.ctx.storage.setAlarm(Math.max(rest[0], Date.now()));
    } else await this.ctx.storage.deleteAll();
    if (!endpoint) return;
    // A push that fails isn't retried: the alarm would run again and skip the next booked time.
    try {
      if ((await sendPush(endpoint, this.env)) === 'gone') await this.cancel();
    } catch (e) {
      console.error('Push failed', e);
    }
  }
}
