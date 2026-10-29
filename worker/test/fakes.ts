// Stand-ins for Cloudflare's parts in the worker's tests: D1 and a Durable Object's SQLite storage
// on node:sqlite (with the real schema), WebSockets that note what they're sent, and a Durable
// Object state holding them.
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migrations = new URL('../migrations/', import.meta.url).pathname;

/** D1 with the worker's migrations applied. */
export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(migrations).sort()) db.exec(readFileSync(migrations + f, 'utf8'));
  const statement = (query: string, args: unknown[] = []) => ({
    bind: (...b: unknown[]) => statement(query, b),
    first: async () => (db.prepare(query).get(...(args as never[])) as object | undefined) ?? null,
    all: async () => ({ results: db.prepare(query).all(...(args as never[])) }),
    run: async () => db.prepare(query).run(...(args as never[])),
  });
  // A batch runs as one transaction in D1; here, one statement after another.
  const batch = async (list: { run: () => Promise<unknown> }[]) => {
    const out = [];
    for (const st of list) out.push(await st.run());
    return out;
  };
  return { db, d1: { prepare: (q: string) => statement(q), batch } };
}

/** A server-side WebSocket: what it was sent, and how it was closed. */
export class FakeSocket {
  sent: string[] = [];
  closed: { code: number; reason: string } | null = null;
  private att: unknown = null;
  send(m: string) {
    if (this.closed) throw new Error('closed');
    this.sent.push(m);
  }
  close(code: number, reason: string) {
    this.closed ??= { code, reason };
  }
  serializeAttachment(a: unknown) {
    this.att = structuredClone(a);
  }
  deserializeAttachment() {
    return structuredClone(this.att);
  }
  /** The messages sent, parsed. */
  get messages(): Record<string, unknown>[] {
    return this.sent.map((m) => JSON.parse(m));
  }
}

/** A Durable Object's state: SQLite storage, alarms, and the WebSockets it holds. */
export function fakeState() {
  const db = new DatabaseSync(':memory:');
  const cursor = (rows: Record<string, unknown>[]) => ({
    toArray: () => rows,
    one: () => {
      if (rows.length !== 1) throw new Error('Expected one row');
      return rows[0];
    },
    [Symbol.iterator]: () => rows[Symbol.iterator](),
  });
  const sql = {
    exec(query: string, ...args: unknown[]) {
      if (!args.length && query.split(';').filter((q) => q.trim()).length > 1) {
        db.exec(query);
        return cursor([]);
      }
      return cursor(db.prepare(query).all(...(args as never[])) as Record<string, unknown>[]);
    },
  };
  const sockets: FakeSocket[] = [];
  let alarm: number | null = null;
  const kv = new Map<string, unknown>();
  const ctx = {
    storage: {
      sql,
      transactionSync<T>(fn: () => T): T {
        db.exec('BEGIN');
        try {
          const r = fn();
          db.exec('COMMIT');
          return r;
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      },
      setAlarm: async (t: number) => void (alarm = t),
      deleteAlarm: async () => void (alarm = null),
      getAlarm: async () => alarm,
      deleteAll: async () => {
        for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
          name: string;
        }[])
          db.exec(`DROP TABLE IF EXISTS "${name}"`);
        kv.clear();
      },
      get: async (k: string) => kv.get(k),
      put: async (k: string | Record<string, unknown>, v?: unknown) => {
        if (typeof k === 'string') kv.set(k, v);
        else for (const [a, b] of Object.entries(k)) kv.set(a, b);
      },
    },
    acceptWebSocket: (ws: FakeSocket) => void sockets.push(ws),
    getWebSockets: () => sockets.filter((ws) => !ws.closed),
    setWebSocketAutoResponse: () => {},
    getWebSocketAutoResponseTimestamp: () => null,
  };
  return { ctx, db, sockets };
}
