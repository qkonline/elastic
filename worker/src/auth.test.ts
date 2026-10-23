// Email codes against the real schema (D1 stood in for by node:sqlite): the hourly limits and
// the tries on a code hold even when requests arrive at the same moment.
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { emailSend, emailVerify } from './auth';
import { devOutbox } from './mail';

const dir = new URL('../migrations/', import.meta.url).pathname;

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(dir + f, 'utf8'));
  const statement = (query: string, args: unknown[] = []) => ({
    bind: (...b: unknown[]) => statement(query, b),
    first: async () => (db.prepare(query).get(...(args as never[])) as object | undefined) ?? null,
    all: async () => ({ results: db.prepare(query).all(...(args as never[])) }),
    run: async () => db.prepare(query).run(...(args as never[])),
  });
  return { db, d1: { prepare: (q: string) => statement(q) } };
}

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

  it('keeps no codes for /dev/mail where a real key is set', async () => {
    const { devMail } = await import('./mail');
    expect(devMail({ DEV_MAIL: '1' })).toBe(true);
    expect(devMail({ DEV_MAIL: '1', RESEND_API_KEY: 're_x' })).toBe(false);
  });
});
