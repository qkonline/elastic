// The worker's routes, called as the app calls them: which ones anyone may call (and how often
// from one network), which need a session, which need an account that's set up, and handing a
// sign-in over to the app's new address.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeD1 } from '../test/fakes';
import worker, { OPEN } from './index';
import { devOutbox } from './mail';

vi.stubGlobal('WebSocketRequestResponsePair', class {});

const ORIGIN = 'https://elastic.kaiserkhan.com';
let env: any;
let d1: ReturnType<typeof fakeD1>;
let limited: string[];
let allow: boolean;
/** What the routes asked of the Account objects: [account, method]. */
let asked: [string, string][];

beforeEach(() => {
  d1 = fakeD1();
  limited = [];
  allow = true;
  asked = [];
  devOutbox.length = 0;
  env = {
    DB: d1.d1,
    DEV_MAIL: '1',
    ALLOWED_ORIGINS: ORIGIN,
    LIMITER: {
      limit: async ({ key }: { key: string }) => {
        limited.push(key);
        return { success: allow };
      },
    },
    ACCOUNTS: {
      idFromName: (n: string) => n,
      get: (id: string) =>
        new Proxy(
          {},
          {
            get: (_, method) => async () => {
              asked.push([id, String(method)]);
              return method === 'info' ? { records: 0 } : undefined;
            },
          },
        ),
    },
    TIMERS: { idFromName: (n: string) => n, get: () => ({ book: async () => {}, cancel: async () => {} }) },
  };
});

async function call(path: string, body: object = {}, opts: { token?: string; ip?: string; origin?: string } = {}) {
  const res = await worker.fetch!(
    new Request(`${ORIGIN}/api${path}`, {
      method: 'POST',
      headers: {
        origin: opts.origin ?? ORIGIN,
        'cf-connecting-ip': opts.ip ?? '2001:db8:5:6::1',
        'content-type': 'application/json',
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: JSON.stringify(body),
    }) as never,
    env,
    {} as never,
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** Sign in with an emailed code (making the account, with a name, if it's new). */
async function signIn(email: string, name: string | null = 'Kai'): Promise<string> {
  expect((await call('/auth/email/send', { email })).status).toBe(204);
  const code = devOutbox.at(-1)!.subject.match(/\d{6}/)![0];
  d1.db.prepare('UPDATE email_codes SET sent = 0').run();
  const r = await call('/auth/email/verify', { email, code, ...(name ? { name } : {}) });
  expect(r.status).toBe(200);
  return r.body.token;
}

const SIGNED_IN = [
  '/auth/name',
  '/auth/passkeys/remove',
  '/auth/signout/others',
  '/account',
  '/account/delete',
  '/account/handoff',
  '/sync/beacon',
  '/alerts/due',
];
const SET_UP = [
  '/boardo',
  '/boardo/link',
  '/boardo/connect',
  '/boardo/adopt',
  '/boardo/cards',
  '/boardo/ops',
  '/boardo/disconnect',
  '/boardo/decline',
];

describe('routes anyone can call', () => {
  it('are these, and no more', () => {
    expect([...OPEN].sort()).toEqual(
      [
        '/schedule',
        '/cancel',
        '/auth/login/start',
        '/auth/register/start',
        '/auth/handoff',
        '/auth/email/send',
        '/auth/email/verify',
      ].sort(),
    );
  });

  it("are counted per network, an IPv6 /64 as one, and refused once it's had its share", async () => {
    await call('/schedule', {}, { ip: '2001:db8:5:6::1' });
    await call('/auth/handoff', { code: 'x' }, { ip: '2001:db8:5:6:aaaa::9' });
    expect(limited).toEqual(['2001:db8:5:6::/64', '2001:db8:5:6::/64']);
    allow = false;
    expect(await call('/auth/email/send', { email: 'a@example.com' })).toMatchObject({ status: 429 });
    expect(devOutbox).toHaveLength(0);
  });

  it("aren't the routes that need a session, which aren't counted", async () => {
    await call('/account');
    await call('/auth/name', { name: 'x' });
    expect(limited).toEqual([]);
  });

  it('answer only the allowed origins', async () => {
    expect((await call('/auth/config', {}, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await call('/auth/config', {}, { origin: 'http://localhost:5173' })).status).toBe(403);
    expect(await call('/auth/config')).toEqual({ status: 200, body: { email: true, turnstile: null } });
  });

  it('give the Turnstile site key once it has a secret too', async () => {
    env.TURNSTILE_SITE_KEY = 'site';
    expect((await call('/auth/config')).body.turnstile).toBeNull();
    env.TURNSTILE_SECRET = 'secret';
    expect((await call('/auth/config')).body.turnstile).toBe('site');
  });
});

describe('routes that need a session', () => {
  it.each(SIGNED_IN.concat(SET_UP))('%s refuses a request without one', async (path) => {
    expect((await call(path)).status).toBe(401);
    expect((await call(path, {}, { token: 'not-a-token' })).status).toBe(401);
  });

  it("need an account that's set up for Boardo", async () => {
    const token = await signIn('half@example.com', null);
    for (const path of SET_UP) expect((await call(path, {}, { token })).status, path).toBe(403);
    await call('/auth/name', { name: 'Half' }, { token });
    // Set up now: past the checks, to Boardo (which isn't bound here).
    for (const path of SET_UP) expect([401, 403], path).not.toContain((await call(path, {}, { token })).status);
  });
});

describe('signing out', () => {
  it('signs out the other devices, and tells the account to close their connections', async () => {
    const phone = await signIn('kai@example.com');
    const laptop = await signIn('kai@example.com');
    const tablet = await signIn('kai@example.com');
    const r = await call('/auth/signout/others', { device: 'phone-1' }, { token: phone });
    expect(r).toEqual({ status: 200, body: { signedOut: 2 } });
    expect((await call('/account', {}, { token: laptop })).status).toBe(401);
    expect((await call('/account', {}, { token: tablet })).status).toBe(401);
    expect((await call('/account', {}, { token: phone })).status).toBe(200);
    expect(asked.map(([, m]) => m)).toContain('signedOutOthers');
  });

  it('closes the connections of a device that signs out', async () => {
    const token = await signIn('out@example.com');
    expect((await call('/auth/signout', { device: 'd1' }, { token })).status).toBe(204);
    expect(asked.map(([, m]) => m)).toEqual(['forget', 'checkSessions']);
    expect((await call('/account', {}, { token })).status).toBe(401);
  });
});

describe('handing a sign-in to the new address', () => {
  it('signs in there once, and signs the old copy out', async () => {
    const old = await signIn('mover@example.com');
    const { body } = await call('/account/handoff', {}, { token: old });
    const there = await call('/auth/handoff', { code: body.code });
    expect(there).toMatchObject({ status: 200, body: { user: { email: 'mover@example.com' }, fresh: false } });
    expect((await call('/account', {}, { token: there.body.token })).status).toBe(200);
    expect((await call('/account', {}, { token: old })).status).toBe(401);
    expect(await call('/auth/handoff', { code: body.code })).toMatchObject({ status: 400 });
  });
});
