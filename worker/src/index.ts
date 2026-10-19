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
import { Account } from './account';
import {
  accountInfo,
  type AuthEnv,
  deleteUser,
  emailSend,
  emailVerify,
  loginFinish,
  loginStart,
  Refusal,
  registerFinish,
  registerStart,
  removeEmail,
  sessionUser,
  signOut,
} from './auth';
import { bookableTimes, isPushEndpoint } from './checks';
import { sendPush } from './push';
import type { VapidKeys } from './vapid';

export { Account };

export interface Env extends VapidKeys, AuthEnv {
  TIMERS: DurableObjectNamespace<Timer>;
  ACCOUNTS: DurableObjectNamespace<Account>;
  /** Comma-separated origins allowed to call this worker. */
  ALLOWED_ORIGINS: string;
}

const MAX_BODY = 64 * 1024;

export default {
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
    if (!allowed) return reply(403);
    const { pathname } = new URL(req.url);

    if (pathname === '/sync') return connect(req, env);
    if (req.method !== 'POST') return reply(404);

    let body: Record<string, unknown>;
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
      const user = () => sessionUser(env, token);
      const mustUser = async () => {
        const id = await user();
        if (!id) throw new Refusal(401, 'Signed out');
        return id;
      };
      const account = (id: string) => env.ACCOUNTS.get(env.ACCOUNTS.idFromName(id));

      switch (pathname) {
        case '/schedule':
        case '/cancel':
          return reply(await timer(pathname, body, env));

        case '/auth/config':
          return reply(200, { email: !!env.EMAIL && !!env.EMAIL_FROM });
        case '/auth/register/start':
          return reply(200, await registerStart(env, origin, token ? await mustUser() : null));
        case '/auth/register/finish':
          return reply(200, await registerFinish(env, origin, token ? await mustUser() : null, body));
        case '/auth/login/start':
          return reply(200, await loginStart(env, origin));
        case '/auth/login/finish':
          return reply(200, await loginFinish(env, origin, body));
        case '/auth/email/send':
          await emailSend(env, body, token ? await mustUser() : null);
          return reply(204);
        case '/auth/email/verify':
          return reply(200, await emailVerify(env, body, token ? await mustUser() : null));
        case '/auth/email/remove':
          await removeEmail(env, await mustUser());
          return reply(204);
        case '/auth/signout':
          if (typeof token === 'string') await signOut(env, token);
          return reply(204);

        case '/account': {
          const id = await mustUser();
          const info = await accountInfo(env, id);
          if (!info) throw new Refusal(401, 'Signed out');
          return reply(200, { ...info, ...(await account(id).info()) });
        }
        case '/account/delete': {
          const id = await mustUser();
          await account(id).erase();
          await deleteUser(env, id);
          return reply(204);
        }
        case '/sync/beacon': {
          const id = await mustUser();
          if (typeof body.device !== 'string' || body.device.length > 64) return reply(400);
          await account(id).beacon(body.device, body);
          return reply(204);
        }
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
 * says so (a refused upgrade would look like the network dropping), and the app hangs up.
 */
async function connect(req: Request, env: Env): Promise<Response> {
  if (req.headers.get('upgrade') !== 'websocket') return new Response(null, { status: 426 });
  const [proto, token] = (req.headers.get('sec-websocket-protocol') ?? '').split(',').map((s) => s.trim());
  const id = proto === 'elastic-day' ? await sessionUser(env, token) : null;
  if (id) return env.ACCOUNTS.get(env.ACCOUNTS.idFromName(id)).fetch(req);
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  server.send(JSON.stringify({ t: 'signedout' }));
  server.addEventListener('close', () => server.close());
  return new Response(null, { status: 101, webSocket: client, headers: { 'sec-websocket-protocol': 'elastic-day' } });
}

async function timer(path: string, body: { endpoint?: unknown; at?: unknown }, env: Env): Promise<number> {
  if (!isPushEndpoint(body.endpoint)) return 400;
  const timer = env.TIMERS.get(env.TIMERS.idFromName(body.endpoint));
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
    if ((await sendPush(endpoint, this.env)) === 'gone') await this.cancel();
  }
}
