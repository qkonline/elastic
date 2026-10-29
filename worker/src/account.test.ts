// The Account object's limits, on a stand-in for its SQLite storage and WebSockets: how much one
// account may hold (records, and bytes, deletions counted), deletions of records it never had,
// how fast one connection may send, and connections whose session has ended.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeD1, fakeState, FakeSocket } from '../test/fakes';
import { Account, MAX_BYTES, MAX_RECORDS, PUTS_A_MINUTE } from './account';

type DB = ReturnType<typeof fakeD1>;

let state: ReturnType<typeof fakeState>;
let d1: DB;
let account: Account;
let n = 0;
const clock = () => `${Date.now().toString(36).padStart(9, '0')}${(n++).toString(36).padStart(3, '0')}dev`;

vi.stubGlobal('WebSocketRequestResponsePair', class {});

beforeEach(() => {
  state = fakeState();
  d1 = fakeD1();
  account = new Account(state.ctx as never, { DB: d1.d1 } as never);
});

/** A signed-in session in D1, and a connection opened with it that has said hello. */
async function connect(session = 'h' + n++, device = 'd' + n++): Promise<FakeSocket> {
  d1.db
    .prepare('INSERT OR IGNORE INTO sessions (hash, user_id, created, used) VALUES (?, ?, ?, ?)')
    .run(session, 'u', Date.now(), Date.now());
  const ws = new FakeSocket();
  state.ctx.acceptWebSocket(ws);
  ws.serializeAttachment({ device: null, visible: true, at: Date.now(), session, checked: Date.now() });
  await account.webSocketMessage(ws as never, JSON.stringify({ t: 'hello', since: 0, device }));
  return ws;
}

const goal = (key: string, title: string, c = clock()) => ({
  kind: 'goal',
  key,
  paths: { _: [true, c], 'f.title': [title, c] },
});

/** Send a put and return its ack. */
async function put(ws: FakeSocket, recs: unknown[], bulk = false) {
  const id = n++;
  await account.webSocketMessage(ws as never, JSON.stringify({ t: 'put', id, recs, ...(bulk ? { bulk } : {}) }));
  return ws.messages.find((m) => m.t === 'ack' && m.id === id);
}

const stored = (key: string) =>
  state.db.prepare('SELECT data, paths FROM records WHERE key = ?').get(key) as
    { data: string | null; paths: string } | undefined;
const kvBytes = () => Number((state.db.prepare("SELECT v FROM kv WHERE k = 'bytes'").get() as { v: string }).v);

describe('what an account holds', () => {
  it('keeps changes and sends them to its other connections', async () => {
    const a = await connect();
    const b = await connect();
    expect(await put(a, [goal('g1', 'Run')])).toEqual({ t: 'ack', id: expect.any(Number) });
    expect(JSON.parse(stored('g1')!.data!)).toEqual({ title: 'Run' });
    expect(b.messages.at(-1)).toMatchObject({ t: 'changes', recs: [{ kind: 'goal', key: 'g1' }] });
  });

  it('takes no new records past MAX_RECORDS, and says which', async () => {
    const insert = state.db.prepare(
      "INSERT INTO records (kind, key, rev, data, paths) VALUES ('goal', ?, 1, '{}', '{}')",
    );
    state.db.exec('BEGIN');
    for (let i = 0; i < MAX_RECORDS; i++) insert.run(`x${i}`);
    state.db.exec('COMMIT');
    const ws = await connect();
    const ack = await put(ws, [goal('one-more', 'No room')]);
    expect(ack).toMatchObject({ full: [{ kind: 'goal', key: 'one-more' }] });
    expect(stored('one-more')).toBeUndefined();
    // A change to one it has still goes in.
    expect(await put(ws, [goal('x1', 'Changed')])).not.toHaveProperty('full');
  });

  it('keeps count of the bytes it holds, deletions included', async () => {
    const ws = await connect();
    await put(ws, [goal('a', 'x'.repeat(5000)), goal('b', 'y'.repeat(300))]);
    await put(ws, [{ kind: 'goal', key: 'b', paths: { _: [null, clock()] } }]);
    await put(ws, [{ kind: 'day', key: '2026-01-01', paths: { _: [null, clock()] } }]);
    const sum = state.db
      .prepare(
        'SELECT SUM(LENGTH(key) + COALESCE(LENGTH(paths), 0) + COALESCE(LENGTH(data), 0) + 100) AS n FROM records',
      )
      .get() as { n: number };
    expect(kvBytes()).toBe(sum.n);
    expect(kvBytes()).toBeGreaterThan(5000);
  });

  it('works the count out for an account from before it was kept', async () => {
    state.db
      .prepare("INSERT INTO records (kind, key, rev, data, paths) VALUES ('goal', 'old', 1, ?, NULL)")
      .run(JSON.stringify({ title: 'z'.repeat(1000) }));
    const ws = await connect();
    await put(ws, [goal('new', 'n')]);
    expect(kvBytes()).toBeGreaterThan(1000);
  });

  it("takes nothing that would go past MAX_BYTES, and tells the app it's full", async () => {
    const ws = await connect();
    await put(ws, [goal('small', 's')]);
    state.db.prepare("UPDATE kv SET v = ? WHERE k = 'bytes'").run(String(MAX_BYTES - 2000));
    const ack = await put(ws, [goal('big', 'b'.repeat(5000)), goal('tiny', 't')]);
    expect(ack).toMatchObject({ full: [{ kind: 'goal', key: 'big' }] });
    expect(stored('big')).toBeUndefined();
    expect(stored('tiny')).toBeDefined();
    // Growing one it has is refused the same way; shrinking or deleting always goes through.
    expect(await put(ws, [goal('small', 'b'.repeat(5000))])).toMatchObject({ full: [{ key: 'small' }] });
    expect(await put(ws, [{ kind: 'goal', key: 'tiny', paths: { _: [null, clock()] } }])).not.toHaveProperty('full');
  });

  it('keeps only that it was deleted for a record it never had', async () => {
    const ws = await connect();
    const c = clock();
    const junk = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`f.k${i}`, ['x'.repeat(500), c]]));
    await put(ws, [{ kind: 'goal', key: 'ghost', paths: { _: [null, c], ...junk } }]);
    expect(JSON.parse(stored('ghost')!.paths)).toEqual({ _: [null, c] });
    expect(stored('ghost')!.data).toBeNull();
  });

  it('keeps every path of a deletion of a record it has, so an older copy stays deleted', async () => {
    const ws = await connect();
    await put(ws, [goal('real', 'Kept')]);
    const c = clock();
    await put(ws, [{ kind: 'goal', key: 'real', paths: { _: [null, c], 'f.title': [null, c] } }]);
    expect(JSON.parse(stored('real')!.paths)).toMatchObject({ _: [null, c], 'f.title': [null, c] });
  });
});

describe('connections', () => {
  it('closes one that sends too many puts in a minute, to come back after a pause', async () => {
    const ws = await connect();
    for (let i = 0; i < PUTS_A_MINUTE; i++) await put(ws, [goal('g', `t${i}`)]);
    expect(ws.closed).toBeNull();
    const ack = await put(ws, [goal('g', 'one too many')]);
    expect(ack).toBeUndefined();
    expect(ws.closed).toEqual({ code: 1013, reason: 'Slow down' });
    expect(JSON.parse(stored('g')!.data!).title).toBe(`t${PUTS_A_MINUTE - 1}`);
  });

  it('takes nothing from a session that has ended, and says it signed out', async () => {
    const ws = await connect('gone');
    d1.db.prepare("DELETE FROM sessions WHERE hash = 'gone'").run();
    expect(await put(ws, [goal('g', 'From a lost phone')])).toBeUndefined();
    expect(stored('g')).toBeUndefined();
    expect(ws.messages.at(-1)).toEqual({ t: 'signedout' });
    expect(ws.closed).toMatchObject({ code: 1000 });
  });

  it('sends nothing to a connection whose session has ended once it is due a check', async () => {
    const a = await connect();
    const b = await connect('later-gone');
    d1.db.prepare("DELETE FROM sessions WHERE hash = 'later-gone'").run();
    b.serializeAttachment({ ...b.deserializeAttachment(), checked: 0 });
    await put(a, [goal('g', 'Private')]);
    expect(b.sent.some((m) => m.includes('Private'))).toBe(false);
    expect(b.closed).toMatchObject({ code: 1000 });
  });

  it('closes a connection from before sessions were noted, so it comes back with one', async () => {
    const ws = new FakeSocket();
    state.ctx.acceptWebSocket(ws);
    ws.serializeAttachment({ device: 'd', visible: true, at: Date.now() });
    expect(await put(ws, [goal('g', 'x')])).toBeUndefined();
    expect(ws.closed).toMatchObject({ code: 1012 });
    expect(stored('g')).toBeUndefined();
  });

  it('signs out the other devices: their connections close and their pushes stop', async () => {
    const mine = await connect('mine', 'phone');
    const other = await connect('other', 'laptop');
    for (const [id, ep] of [
      ['phone', 'https://fcm.googleapis.com/fcm/send/a'],
      ['laptop', 'https://fcm.googleapis.com/fcm/send/b'],
    ])
      state.db.prepare('INSERT OR REPLACE INTO devices (id, endpoint, seen) VALUES (?, ?, ?)').run(id, ep, Date.now());
    d1.db.prepare("DELETE FROM sessions WHERE hash != 'mine'").run();
    await account.signedOutOthers('phone');
    expect(other.closed).toMatchObject({ code: 1000 });
    expect(other.messages.at(-1)).toEqual({ t: 'signedout' });
    expect(mine.closed).toBeNull();
    expect(state.db.prepare('SELECT id FROM devices').all()).toEqual([{ id: 'phone' }]);
  });
});
