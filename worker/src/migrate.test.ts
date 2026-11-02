// Moving to another Cloudflare account: an Account object's storage copied into a fresh one comes
// out identical (tables, the sync rev, key-value entries, the alarm), and a load never lands on top
// of an object that already holds something.
import { describe, expect, it, vi } from 'vitest';
import { fakeState } from '../test/fakes';
import { Account } from './account';
import { dumpStorage, loadStorage } from './migrate';

vi.stubGlobal('WebSocketRequestResponsePair', class {});

const fresh = () => {
  const state = fakeState();
  return { state, account: new Account(state.ctx as never, {} as never) };
};

describe('migrate', () => {
  it('copies every table, entry and the alarm exactly', async () => {
    const { state } = fresh();
    const sql = state.ctx.storage.sql;
    sql.exec("INSERT INTO records (kind, key, rev, data, paths) VALUES ('goal', 'g1', 7, '{\"t\":1}', '{}')");
    sql.exec("INSERT INTO records (kind, key, rev, data, paths) VALUES ('task', 't1', 9, NULL, '{}')");
    sql.exec("INSERT INTO devices (id, endpoint, seen) VALUES ('d1', 'https://push.example/1', 5)");
    sql.exec("INSERT INTO kv (k, v) VALUES ('rev', '9'), ('alerts', '[]')");
    await state.ctx.storage.put('extra', { a: 1 });
    const at = Date.now() + 60_000;
    await state.ctx.storage.setAlarm(at);

    const dump = JSON.parse(JSON.stringify(await dumpStorage(state.ctx.storage as never)));
    const next = fresh();
    expect(await loadStorage(next.state.ctx.storage as never, dump)).toBe(5);
    expect(await dumpStorage(next.state.ctx.storage as never)).toEqual(dump);
    expect(await next.state.ctx.storage.getAlarm()).toBe(at);
    expect(next.state.ctx.storage.sql.exec("SELECT v FROM kv WHERE k = 'rev'").one().v).toBe('9');
  });

  it('refuses to load into an object that already holds rows', async () => {
    const { state } = fresh();
    state.ctx.storage.sql.exec("INSERT INTO kv (k, v) VALUES ('rev', '1')");
    const dump = { tables: { kv: [{ k: 'rev', v: '2' }] }, entries: [], alarm: null };
    await expect(loadStorage(state.ctx.storage as never, dump)).rejects.toThrow(/already has 1 rows/);
    expect(state.ctx.storage.sql.exec("SELECT v FROM kv WHERE k = 'rev'").one().v).toBe('1');
  });

  it('rejects table names it did not write', async () => {
    const { state } = fresh();
    const dump = { tables: { 'kv; DROP TABLE records': [] }, entries: [], alarm: null };
    await expect(loadStorage(state.ctx.storage as never, dump)).rejects.toThrow(/Unexpected table name/);
  });
});
