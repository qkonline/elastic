// Two devices signed in to one account, each with its own IndexedDB and its own copy of the
// app, syncing through a stand-in for the account's Durable Object (worker/src/account.ts) that
// speaks the same protocol over a fake WebSocket.

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Planner } from './planner.svelte';

interface Rec {
  kind: string;
  key: string;
  rev: number;
  data: unknown;
}

class FakeAccount {
  records = new Map<string, Rec>();
  rev = 0;
  sockets = new Set<FakeSocket>();
  /** While set, messages from devices wait (to make two devices change things at once). */
  held: (() => void)[] | null = null;

  handle(ws: FakeSocket, raw: string): void {
    if (raw === 'ping') return ws.deliver('pong');
    const m = JSON.parse(raw);
    if (m.t === 'hello') {
      const recs = [...this.records.values()].filter((r) => r.rev > m.since).sort((a, b) => a.rev - b.rev);
      ws.deliver(JSON.stringify({ t: 'changes', recs, rev: this.rev, done: true }));
    }
    if (m.t === 'put') {
      const ok: object[] = [];
      const conflicts: Rec[] = [];
      const changed: Rec[] = [];
      for (const c of m.recs) {
        const id = `${c.kind}:${c.key}`;
        const cur = this.records.get(id);
        if ((cur?.rev ?? 0) !== c.base) {
          conflicts.push(cur ?? { kind: c.kind, key: c.key, rev: 0, data: null });
          continue;
        }
        const rec = { kind: c.kind, key: c.key, rev: ++this.rev, data: structuredClone(c.data) };
        this.records.set(id, rec);
        ok.push({ kind: c.kind, key: c.key, rev: rec.rev });
        changed.push(rec);
      }
      ws.deliver(JSON.stringify({ t: 'ack', id: m.id, ok, conflicts }));
      if (changed.length)
        for (const other of this.sockets)
          if (other !== ws) other.deliver(JSON.stringify({ t: 'changes', recs: changed, rev: this.rev }));
    }
  }

  data(kind: string, key: string): any {
    return this.records.get(`${kind}:${key}`)?.data;
  }
}

let server: FakeAccount;

class FakeSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(_url: string, _protocols: string[]) {
    server.sockets.add(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }
  send(raw: string): void {
    const go = () => server.handle(this, raw);
    if (server.held) server.held.push(go);
    else setTimeout(go);
  }
  deliver(raw: string): void {
    setTimeout(() => this.readyState === 1 && this.onmessage?.({ data: raw }));
  }
  close(): void {
    this.readyState = 3;
    server.sockets.delete(this);
  }
}

interface Device {
  p: Planner;
  db: typeof import('./db');
}

const devices: Device[] = [];
const TODAY = '2026-10-17';

/** A device with its own database and its own copy of every module, signed in to the account. */
async function device(opts: { fresh?: boolean } = {}): Promise<Device> {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  const db = await import('./db');
  const { Planner } = await import('./planner.svelte');
  const session = { token: 't', user: { id: 'u', email: null }, device: `d${devices.length}` };
  await db.putMeta('account', session);
  if (opts.fresh) await db.markAll();
  const p = new Planner();
  await p.init();
  const d = { p, db };
  devices.push(d);
  await settle();
  return d;
}

const sync = (p: Planner) => (p as unknown as { sync: { settled(): Promise<void> } }).sync;

/** Let every message and write go through, on every device. */
async function settle(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 0));
    for (const d of devices) {
      await d.p.flush();
      await sync(d.p).settled();
    }
  }
}

const add = (p: Planner, title: string) => p.addTask({ title, min: 30, kind: 'task', hue: 'cyan', fixedAt: null });
const titles = (p: Planner) => p.day.items.map((i) => i.title);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 17, 10, 0));
  server = new FakeAccount();
  globalThis.IDBKeyRange = IDBKeyRange;
  vi.stubGlobal('WebSocket', FakeSocket);
  // Two devices in one process mustn't hear each other's tab messages.
  vi.stubGlobal('BroadcastChannel', undefined);
  // Nor share one tab lock (Node 24 has navigator.locks): each device leads its own sync.
  vi.stubGlobal('navigator', { locks: undefined, onLine: true });
});

afterEach(() => {
  devices.splice(0).forEach((d) => d.p.destroy());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('sync', () => {
  it('uploads a new account and brings it to the next device', async () => {
    const a = await device({ fresh: true });
    add(a.p, 'Write');
    await settle();
    expect(server.data('day', TODAY).items.map((i: { title: string }) => i.title)).toEqual(['Write']);

    const b = await device();
    expect(titles(b.p)).toEqual(['Write']);
  });

  it('shows changes on the other device as they happen', async () => {
    const a = await device({ fresh: true });
    const b = await device();
    add(a.p, 'Write');
    await settle();
    expect(titles(b.p)).toEqual(['Write']);

    b.p.startDay();
    await settle();
    expect(a.p.day.items[0].status).toBe('running');
    expect(a.p.day.dayStarted).not.toBeNull();
  });

  it('keeps both when two devices change different tasks at once', async () => {
    const a = await device({ fresh: true });
    add(a.p, 'Write');
    add(a.p, 'Review');
    await settle();
    const b = await device();
    expect(titles(b.p)).toEqual(['Write', 'Review']);

    server.held = [];
    a.p.edit(a.p.day.items[0].id, { note: 'from the phone' });
    b.p.edit(b.p.day.items[1].id, { note: 'from the laptop' });
    await settle();
    const held = server.held;
    server.held = null;
    held.forEach((go) => go());
    await settle();

    for (const d of [a, b]) expect(d.p.day.items.map((i) => i.note)).toEqual(['from the phone', 'from the laptop']);
    expect(server.data('day', TODAY).items.map((i: { note: string }) => i.note)).toEqual([
      'from the phone',
      'from the laptop',
    ]);
  });

  it('shares how days work, but not the theme', async () => {
    const a = await device({ fresh: true });
    const b = await device();
    a.p.setSettings({ clock24: true, themePref: 'dark' });
    await settle();
    expect(b.p.settings.clock24).toBe(true);
    expect(b.p.settings.themePref).toBe('match');
  });

  it('brings repeating tasks to the other device', async () => {
    const a = await device({ fresh: true });
    const b = await device();
    add(a.p, 'Stretch');
    await a.p.setRepeat(a.p.day.items[0].id, 'Every day');
    await settle();
    expect(b.p.series.map((s) => s.title)).toEqual(['Stretch']);
    await b.p.switchDay('2026-10-18');
    expect(titles(b.p)).toEqual(['Stretch']);
  });

  it("doesn't double a repeating task when two devices first save the same day at once", async () => {
    const a = await device({ fresh: true });
    const b = await device();
    add(a.p, 'Stretch');
    await a.p.setRepeat(a.p.day.items[0].id, 'Every day');
    await settle();
    // A later day neither has stored: each builds it from the series.
    await a.p.switchDay('2026-10-18');
    await b.p.switchDay('2026-10-18');
    server.held = [];
    a.p.toggleSub?.(a.p.day.items[0].id, 'none');
    a.p.edit(a.p.day.items[0].id, { note: 'from the phone' });
    add(b.p, 'Laptop task');
    await settle();
    const held = server.held;
    server.held = null;
    held.forEach((go) => go());
    await settle();
    for (const d of [a, b]) {
      expect(titles(d.p)).toEqual(['Stretch', 'Laptop task']);
      expect(d.p.day.items[0].note).toBe('from the phone');
    }
  });

  it('takes an erase on one device to the others', async () => {
    const a = await device({ fresh: true });
    add(a.p, 'Write');
    await settle();
    const b = await device();
    expect(titles(b.p)).toEqual(['Write']);
    await a.p.eraseAll();
    await settle();
    expect(server.data('day', TODAY)).toBeNull();
    expect(titles(b.p)).toEqual([]);
  });

  it('asks a device with its own plan which plan to use, and can keep both', async () => {
    const a = await device({ fresh: true });
    add(a.p, 'From the phone');
    await settle();
    // A laptop used on its own first, then signed in.
    vi.resetModules();
    globalThis.indexedDB = new IDBFactory();
    const db = await import('./db');
    const { Planner } = await import('./planner.svelte');
    const p = new Planner();
    await p.init();
    devices.push({ p, db });
    add(p, 'From the laptop');
    await p.flush();
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ records: 2 }), { status: 200 }));
    await (p as unknown as { signedIn(r: object): Promise<void> }).signedIn({
      token: 't',
      user: { id: 'u', email: null },
      fresh: false,
    });
    expect(p.joinAsk).toBe(true);
    expect(server.data('day', TODAY).items).toHaveLength(1);
    await p.joinAccount('both');
    await settle();
    expect(titles(p)).toEqual(['From the phone', 'From the laptop']);
    expect(titles(a.p)).toEqual(['From the phone', 'From the laptop']);
  });

  it("can take the account's plan instead", async () => {
    const a = await device({ fresh: true });
    add(a.p, 'From the phone');
    await settle();
    vi.resetModules();
    globalThis.indexedDB = new IDBFactory();
    const db = await import('./db');
    const { Planner } = await import('./planner.svelte');
    const p = new Planner();
    await p.init();
    devices.push({ p, db });
    add(p, 'From the laptop');
    await p.flush();
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ records: 2 }), { status: 200 }));
    await (p as unknown as { signedIn(r: object): Promise<void> }).signedIn({
      token: 't',
      user: { id: 'u', email: null },
      fresh: false,
    });
    await p.joinAccount('account');
    await settle();
    expect(titles(p)).toEqual(['From the phone']);
    expect(titles(a.p)).toEqual(['From the phone']);
  });

  it("never gives one person's plan to another account signing in on the same device", async () => {
    const a = await device({ fresh: true });
    add(a.p, 'Private plan');
    await settle();
    vi.stubGlobal('fetch', async () => new Response(null, { status: 204 }));
    await a.p.signOut();
    expect(titles(a.p)).toEqual(['Private plan']); // kept for the same person
    // Someone else makes an account on this device.
    server = new FakeAccount();
    await (a.p as unknown as { signedIn(r: object): Promise<void> }).signedIn({
      token: 't2',
      user: { id: 'someone-else', email: 'b@example.com', name: 'B' },
      fresh: true,
    });
    await settle();
    expect(titles(a.p)).toEqual([]);
    expect(server.data('day', TODAY)?.items ?? []).toEqual([]);
    expect(await a.db.getAllDays()).toEqual([]);
  });

  it("doesn't ask an existing account the welcome's questions when its settings arrive", async () => {
    // Signed in on a device with no settings of its own yet (as arriving at a new address does).
    server.records.set('settings:main', {
      kind: 'settings',
      key: 'main',
      rev: 1,
      data: {
        clock24: false,
        showTimes: 'started',
        fixedLead: 5,
        defStart: 420,
        defWrap: 960,
        dayLength: 540,
        flexStart: false,
        reviewDay: 0,
        reviewAt: 1080,
      },
    });
    server.rev = 1;
    const a = await device();
    expect(a.p.settings.defStart).toBe(420);
    expect(a.p.showWelcome).toBe(false);
  });

  it('keeps a change from the account that arrives while a change here waits to be saved', async () => {
    const a = await device({ fresh: true });
    add(a.p, 'Started');
    await settle();
    const id = a.p.day.items[0].id;
    // Another device paused it: the account's version is already in storage here...
    const theirs = await a.db.getDay(TODAY);
    await a.db.putDay({ ...theirs!, items: theirs!.items.map((i) => ({ ...i, note: 'paused there' })) });
    // ...when this one changes the day, not saved yet, and the change is announced.
    add(a.p, 'Added here');
    await (a.p as unknown as { onMessage(m: object): Promise<void> }).onMessage({ t: 'days', keys: [TODAY] });
    expect(titles(a.p)).toEqual(['Started', 'Added here']);
    expect(a.p.day.items.find((i) => i.id === id)?.note).toBe('paused there');
    await settle();
    const saved = await a.db.getDay(TODAY);
    expect(saved!.items.map((i) => i.title)).toEqual(['Started', 'Added here']);
    expect(saved!.items.find((i) => i.id === id)?.note).toBe('paused there');
  });

  it('keeps the plan when the same person signs back in', async () => {
    const a = await device({ fresh: true });
    add(a.p, 'Mine');
    await settle();
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ records: 1 }), { status: 200 }));
    await a.p.signOut();
    await (a.p as unknown as { signedIn(r: object): Promise<void> }).signedIn({
      token: 't',
      user: { id: 'u', email: null },
      fresh: false,
    });
    expect(titles(a.p)).toEqual(['Mine']);
  });

  it("never takes a record it can't read as a deletion, and asks for it again later", async () => {
    const a = await device({ fresh: true });
    add(a.p, 'Mine');
    await settle();
    const rev = server.records.get(`day:${TODAY}`)!.rev;
    // A newer version (or damage) leaves the day in a form this one can't read.
    server.records.set(`day:${TODAY}`, {
      kind: 'day',
      key: TODAY,
      rev: rev + 1,
      data: { key: TODAY, items: 'new form' },
    });
    server.rev = rev + 1;
    for (const ws of server.sockets)
      ws.deliver(JSON.stringify({ t: 'changes', recs: [server.records.get(`day:${TODAY}`)], rev: server.rev }));
    await settle();
    expect(titles(a.p)).toEqual(['Mine']);
    expect(await a.db.getDay(TODAY)).toBeTruthy();
    // An edit here waits rather than overwriting the account's copy.
    add(a.p, 'Later');
    await settle();
    expect(server.data('day', TODAY)).toEqual({ key: TODAY, items: 'new form' });
    expect(await a.db.getMeta('held')).toEqual({ [`day:${TODAY}`]: rev + 1 });
    // Updated (here: the account's copy readable after all), it asks from before that record.
    const rec = server.records.get(`day:${TODAY}`)!;
    rec.data = {
      ...(server.data('day', TODAY) as object),
      items: [{ id: 'n1', title: 'From the new version', min: 30 }],
    };
    const s = (a.p as unknown as { sync: { stop(): void; start(x: unknown): Promise<void> } }).sync;
    s.stop();
    await s.start(a.p.session);
    await settle();
    expect(titles(a.p)).toContain('From the new version');
    expect(await a.db.getMeta('held')).toEqual({});
  });

  it('brings goals and reviews to the other device', async () => {
    const a = await device({ fresh: true });
    const b = await device();
    a.p.addGoal({
      quarter: '2026-Q4',
      title: 'Reach 100 users',
      why: '',
      target: { now: 10, goal: 100, unit: 'users' },
      milestones: [],
    });
    await settle();
    expect(b.p.goals.map((g) => g.title)).toEqual(['Reach 100 users']);
    b.p.editGoal(b.p.goals[0].id, { target: { now: 40, goal: 100, unit: 'users' } });
    await settle();
    expect(a.p.goals[0].target?.now).toBe(40);
    a.p.setSettings({ reviewDay: 5 });
    await settle();
    expect(b.p.settings.reviewDay).toBe(5);
  });

  it('sends changes made while offline once it reconnects', async () => {
    const a = await device({ fresh: true });
    const b = await device();
    for (const ws of [...server.sockets]) {
      ws.close();
      ws.onclose?.({ code: 1006 });
    }
    add(b.p, 'Offline task');
    await settle();
    expect(titles(a.p)).toEqual([]);
    await new Promise((r) => setTimeout(r, 1100)); // the first retry
    await settle();
    expect(titles(a.p)).toEqual(['Offline task']);
  });
});
