// Signing in against the real schema (D1 stood in for by node:sqlite): the limits on email codes
// and the tries at them hold even when requests arrive at the same moment, the day's mail runs
// out, handoff codes work once, and sessions end.
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeD1 } from '../test/fakes';
import {
  emailSend,
  emailVerify,
  handoffFinish,
  handoffStart,
  MAIL_A_DAY,
  prune,
  sessionOf,
  signOutOthers,
  tokenHash,
} from './auth';
import { devOutbox } from './mail';

let env: any;
let db: DatabaseSync;
const code = (to: string) =>
  [...devOutbox]
    .reverse()
    .find((m) => m.to === to)!
    .subject.match(/\d{6}/)![0];
const wrongFor = (c: string) => String((Number(c) + 1) % 1_000_000).padStart(6, '0');

beforeEach(() => {
  const f = fakeD1();
  db = f.db;
  env = { DB: f.d1, DEV_MAIL: '1' };
  devOutbox.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Sign in with a code (making the account if it's new). */
async function signIn(email: string, ip = '1.1.1.1') {
  await emailSend(env, { email }, null, ip);
  db.prepare('UPDATE email_codes SET sent = 0 WHERE email = ?').run(email); // past the minute's wait
  return (await emailVerify(env, { email, code: code(email), name: 'N' }, null, ip)) as {
    token: string;
    user: { id: string };
  };
}
const signUp = signIn;

describe('email codes', () => {
  it('counts every request against the hourly limit, even at once', async () => {
    const sends = Array.from({ length: 40 }, (_, i) => emailSend(env, { email: `p${i}@example.com` }, null, '1.2.3.4'));
    const res = await Promise.allSettled(sends);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(30);
    expect(db.prepare("SELECT count FROM limits WHERE key = 'ip:1.2.3.4'").get()).toEqual({ count: 40 });
  });

  it('allows five tries on a code, the right one included, even at once', async () => {
    await emailSend(env, { email: 'a@example.com' }, null, '1.1.1.1');
    const right = code('a@example.com');
    const tries = Array.from({ length: 12 }, () =>
      emailVerify(env, { email: 'a@example.com', code: wrongFor(right) }, null),
    );
    await Promise.allSettled(tries);
    await expect(emailVerify(env, { email: 'a@example.com', code: right }, null)).rejects.toThrow(/isn't right/);
  });

  it("doesn't count an address against its limit when the network is over its own", async () => {
    for (let i = 0; i < 30; i++) await emailSend(env, { email: `x${i}@example.com` }, null, '6.6.6.6');
    for (let i = 0; i < 10; i++) await emailSend(env, { email: 'v@example.com' }, null, '6.6.6.6').catch(() => {});
    expect(db.prepare("SELECT count FROM limits WHERE key = 'email:v@example.com'").get()).toBeUndefined();
    db.prepare("DELETE FROM limits WHERE key = 'mail:day'").run(); // a new day
    await expect(emailSend(env, { email: 'v@example.com' }, null, '7.7.7.7')).resolves.toBeUndefined();
  });

  it("stops tries at codes for an address after a day's worth", async () => {
    await emailSend(env, { email: 'g@example.com' }, null, '1.1.1.1');
    const right = code('g@example.com');
    for (let i = 0; i < 30; i++) {
      db.prepare("UPDATE email_codes SET tries = 0 WHERE email = 'g@example.com'").run();
      await emailVerify(env, { email: 'g@example.com', code: wrongFor(right) }, null).catch(() => {});
    }
    db.prepare("UPDATE email_codes SET tries = 0 WHERE email = 'g@example.com'").run();
    await expect(emailVerify(env, { email: 'g@example.com', code: right }, null)).rejects.toThrow(/Too many tries/);
  });

  it('uses a right code once', async () => {
    await emailSend(env, { email: 'b@example.com' }, null, '1.1.1.1');
    const right = code('b@example.com');
    const both = await Promise.allSettled([
      emailVerify(env, { email: 'b@example.com', code: right, name: 'B' }, null),
      emailVerify(env, { email: 'b@example.com', code: right, name: 'B' }, null),
    ]);
    expect(both.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 1 });
  });

  it('still signs in after a few wrong tries', async () => {
    await emailSend(env, { email: 'c@example.com' }, null, '1.1.1.1');
    const right = code('c@example.com');
    for (let i = 0; i < 4; i++)
      await expect(emailVerify(env, { email: 'c@example.com', code: wrongFor(right) }, null)).rejects.toThrow();
    await expect(emailVerify(env, { email: 'c@example.com', code: right, name: 'C' }, null)).resolves.toMatchObject({
      fresh: true,
    });
  });

  it("doesn't let wrong guesses from another network lock an address out", async () => {
    await emailSend(env, { email: 'h@example.com' }, null, '1.1.1.1');
    const right = code('h@example.com');
    for (let i = 0; i < 40; i++) {
      db.prepare("UPDATE email_codes SET tries = 0 WHERE email = 'h@example.com'").run();
      await emailVerify(env, { email: 'h@example.com', code: wrongFor(right) }, null, '6.6.6.6').catch(() => {});
    }
    db.prepare("UPDATE email_codes SET tries = 0 WHERE email = 'h@example.com'").run();
    await expect(emailVerify(env, { email: 'h@example.com', code: right }, null, '6.6.6.6')).rejects.toThrow(
      /Too many tries/,
    );
    await expect(
      emailVerify(env, { email: 'h@example.com', code: right, name: 'H' }, null, '1.1.1.1'),
    ).resolves.toMatchObject({ fresh: true });
  });

  it('counts no tries, and writes nothing, where no code was sent', async () => {
    for (let i = 0; i < 5; i++)
      await expect(emailVerify(env, { email: 'none@example.com', code: '123456' }, null, '6.6.6.6')).rejects.toThrow(
        /isn't right/,
      );
    expect(db.prepare('SELECT COUNT(*) AS n FROM limits').get()).toEqual({ n: 0 });
  });

  it("stops at the day's mail for the whole app, and counts nothing more once it has", async () => {
    for (let i = 0; i < MAIL_A_DAY; i++) await emailSend(env, { email: `m${i}@example.com` }, null, `10.0.0.${i}`);
    await expect(emailSend(env, { email: 'late@example.com' }, null, '10.0.1.1')).rejects.toThrow(
      /can't send any more codes today/,
    );
    expect(devOutbox).toHaveLength(MAIL_A_DAY);
    expect(db.prepare("SELECT key FROM limits WHERE key LIKE '%10.0.1.1%' OR key LIKE '%late@%'").all()).toEqual([]);
    // A day later there's mail again.
    db.prepare("UPDATE limits SET start = start - 86400001 WHERE key = 'mail:day'").run();
    await expect(emailSend(env, { email: 'late@example.com' }, null, '10.0.1.1')).resolves.toBeUndefined();
  });

  it('counts an IPv6 network as its /64', async () => {
    for (let i = 0; i < 30; i++) await emailSend(env, { email: `n${i}@example.com` }, null, `2001:db8:1:2::${i + 1}`);
    expect(db.prepare("SELECT count FROM limits WHERE key = 'ip:2001:db8:1:2::/64'").get()).toEqual({ count: 30 });
    db.prepare("DELETE FROM limits WHERE key = 'mail:day'").run(); // a new day
    await expect(emailSend(env, { email: 'n30@example.com' }, null, '2001:db8:1:2:ffff::1')).rejects.toThrow(
      /Too many codes/,
    );
  });

  it('answers for an address another account has as if it sent a code, and sends none', async () => {
    const other = await signUp('taken@example.com');
    const me = await signUp('me@example.com');
    const before = devOutbox.length;
    await expect(emailSend(env, { email: 'taken@example.com' }, me.user.id, '1.1.1.1')).resolves.toBeUndefined();
    expect(devOutbox.length).toBe(before);
    const signed = (await sessionOf(env, me.token))!;
    await expect(emailVerify(env, { email: 'taken@example.com', code: '000000' }, signed)).rejects.toThrow(
      /isn't right/,
    );
    expect(db.prepare('SELECT email FROM users WHERE id = ?').get(other.user.id)).toEqual({
      email: 'taken@example.com',
    });
  });

  it('asks Turnstile before emailing someone signed out, only once it has a site key and a secret', async () => {
    const answers: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: FormData }) => {
        answers.push(String(init.body.get('response')));
        return Response.json({ success: init.body.get('response') === 'good' });
      }),
    );
    env.TURNSTILE_SECRET = 'secret';
    await expect(emailSend(env, { email: 't@example.com' }, null, '1.1.1.1')).resolves.toBeUndefined();
    expect(answers).toEqual([]); // no site key: off
    env.TURNSTILE_SITE_KEY = 'site';
    await expect(emailSend(env, { email: 't2@example.com', turnstile: 'bad' }, null, '1.1.1.1')).rejects.toThrow(
      /person/,
    );
    await expect(emailSend(env, { email: 't3@example.com' }, null, '1.1.1.1')).rejects.toThrow(/person/);
    await expect(
      emailSend(env, { email: 't2@example.com', turnstile: 'good' }, null, '1.1.1.1'),
    ).resolves.toBeUndefined();
    expect(answers).toEqual(['bad', 'good']);
  });

  it('tells the old address when the email changes, and signs the account out elsewhere', async () => {
    const me = await signUp('old@example.com');
    const other = await signIn('old@example.com', '2.2.2.2');
    const signed = (await sessionOf(env, me.token))!;
    await emailSend(env, { email: 'new@example.com' }, me.user.id, '1.1.1.1');
    const r = await emailVerify(env, { email: 'new@example.com', code: code('new@example.com') }, signed);
    expect(r).toMatchObject({ email: 'new@example.com', others: true });
    expect(devOutbox.at(-1)).toMatchObject({ to: 'old@example.com', subject: 'Your Elastic email was changed' });
    expect(await sessionOf(env, other.token)).toBeNull();
    expect(await sessionOf(env, me.token)).toMatchObject({ user: me.user.id });
  });

  it('keeps no codes for /dev/mail where a real key is set', async () => {
    const { devMail } = await import('./mail');
    expect(devMail({ DEV_MAIL: '1' })).toBe(true);
    expect(devMail({ DEV_MAIL: '1', RESEND_API_KEY: 're_x' })).toBe(false);
  });
});

describe('handoffs', () => {
  it('signs in once with a code, and ends the session that handed over', async () => {
    const me = await signUp('a@example.com');
    const s = (await sessionOf(env, me.token))!;
    const { code: c } = await handoffStart(env, s.user, s.hash);
    const both = await Promise.allSettled([handoffFinish(env, { code: c }), handoffFinish(env, { code: c })]);
    expect(both.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const there = (both.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ token: string }>).value;
    expect(await sessionOf(env, there.token)).toMatchObject({ user: s.user });
    expect(await sessionOf(env, me.token)).toBeNull();
    await expect(handoffFinish(env, { code: c })).rejects.toThrow(/expired/);
  });

  it('works for two minutes only', async () => {
    const me = await signUp('b@example.com');
    const s = (await sessionOf(env, me.token))!;
    const { code: c } = await handoffStart(env, s.user, s.hash);
    vi.useFakeTimers({ now: Date.now() + 2 * 60_000 + 1, toFake: ['Date'] });
    await expect(handoffFinish(env, { code: c })).rejects.toThrow(/expired/);
    expect(await sessionOf(env, me.token)).not.toBeNull();
  });

  it('refuses codes it never gave', async () => {
    await expect(handoffFinish(env, { code: 'nope' })).rejects.toThrow(/expired/);
    await expect(handoffFinish(env, {})).rejects.toThrow(/expired/);
  });
});

describe('sessions', () => {
  it('signs out every other session of the account', async () => {
    const a = await signUp('s@example.com');
    const b = await signIn('s@example.com');
    const c = await signIn('s@example.com');
    const x = await signUp('x@example.com');
    expect(await signOutOthers(env, a.user.id, await tokenHash(a.token))).toBe(2);
    expect(await sessionOf(env, a.token)).not.toBeNull();
    expect(await sessionOf(env, b.token)).toBeNull();
    expect(await sessionOf(env, c.token)).toBeNull();
    expect(await sessionOf(env, x.token)).not.toBeNull();
  });

  it('clears out what has expired, and sessions unused for a year', async () => {
    const a = await signUp('p@example.com');
    const b = await signUp('q@example.com');
    const now = Date.now();
    db.prepare('UPDATE sessions SET used = ? WHERE hash = ?').run(now - 366 * 86_400_000, await tokenHash(b.token));
    db.prepare("INSERT INTO limits (key, count, start) VALUES ('ip:old', 1, ?)").run(now - 3 * 86_400_000);
    db.prepare("INSERT INTO handoffs (code_hash, user_id, expires) VALUES ('h', 'u', ?)").run(now - 1);
    db.prepare(
      "INSERT INTO challenges (id, challenge, user_id, purpose, expires) VALUES ('c', 'x', '', 'login', ?)",
    ).run(now - 1);
    await prune(env, now);
    expect(await sessionOf(env, a.token)).not.toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT * FROM limits WHERE key = 'ip:old'").get()).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) AS n FROM handoffs').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM challenges').get()).toEqual({ n: 0 });
  });
});
