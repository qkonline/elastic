// IndexedDB persistence. One record per day (keyed 'YYYY-MM-DD'), one per repeating series,
// and in `meta` the settings and the booked notifications. Signed in, `synced` holds the version
// of each record last agreed with the account, `outbox` the records changed here since (see
// sync.ts), and `meta` the account and how far syncing got.

import type { AlertGroup } from './reminders';
import type { Day, Goal, Review, Series, Settings } from './types';

const DB_NAME = 'elastic-day';
const VERSION = 3;

/**
 * A record as the account knows it: a day (by key), a repeating series, a goal or a review (by
 * id), or the settings ('main').
 */
export type RecordKind = 'day' | 'series' | 'settings' | 'goal' | 'review';
export const recId = (kind: RecordKind, key: string) => `${kind}:${key}`;

/**
 * Signed in: every local change is noted in the outbox, in the same transaction as the change,
 * and `onWrite` hears about it once it's saved.
 */
let tracking = false;
let afterWrite: (() => void) | null = null;
export function track(on: boolean, onWrite?: () => void): void {
  tracking = on;
  afterWrite = on ? (onWrite ?? null) : null;
}

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('series')) db.createObjectStore('series', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('synced')) db.createObjectStore('synced');
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox');
      if (!db.objectStoreNames.contains('goals')) db.createObjectStore('goals', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('reviews')) db.createObjectStore('reviews', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgraded the schema: let it proceed, reopen lazily next time.
      db.onversionchange = () => {
        db.close();
        dbp = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Elastic Day is open in another tab that is blocking an upgrade.'));
  });
  dbp.catch(() => (dbp = null));
  return dbp;
}

const done = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const txDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });

type StoreName = 'days' | 'series' | 'meta' | 'synced' | 'outbox' | 'goals' | 'reviews';
type DataStore = 'days' | 'series' | 'meta' | 'goals' | 'reviews';

async function store(name: StoreName, mode: IDBTransactionMode) {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

// JSON round-trip strips Svelte state proxies and anything non-cloneable before storing.
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export async function getDay(key: string): Promise<Day | undefined> {
  return done((await store('days', 'readonly')).get(key));
}

export async function getDays(from: string, to: string): Promise<Day[]> {
  return done((await store('days', 'readonly')).getAll(IDBKeyRange.bound(from, to)));
}

export async function getAllDays(): Promise<Day[]> {
  return done((await store('days', 'readonly')).getAll());
}

/** A write to one store, noted in the outbox when signed in. */
async function write(name: DataStore, fn: (st: IDBObjectStore, note: (id: string) => void) => void) {
  const db = await open();
  const tx = db.transaction(tracking ? [name, 'outbox'] : [name], 'readwrite');
  const noted = tracking;
  fn(tx.objectStore(name), (id) => noted && tx.objectStore('outbox').put(true, id));
  await txDone(tx);
  if (noted) afterWrite?.();
}

export async function putDays(days: Day[]): Promise<void> {
  if (!days.length) return;
  return write('days', (st, note) => {
    for (const d of days) {
      st.put(plain(d));
      note(recId('day', d.key));
    }
  });
}

export const putDay = (day: Day) => putDays([day]);

export async function deleteDay(key: string): Promise<void> {
  return write('days', (st, note) => {
    st.delete(key);
    note(recId('day', key));
  });
}

export async function getAllSeries(): Promise<Series[]> {
  return done((await store('series', 'readonly')).getAll());
}

export async function putSeries(s: Series): Promise<void> {
  return write('series', (st, note) => {
    st.put(plain(s));
    note(recId('series', s.id));
  });
}

export async function getGoals(): Promise<Goal[]> {
  return done((await store('goals', 'readonly')).getAll());
}

export async function putGoal(g: Goal): Promise<void> {
  return write('goals', (st, note) => {
    st.put(plain(g));
    note(recId('goal', g.id));
  });
}

export async function deleteGoal(id: string): Promise<void> {
  return write('goals', (st, note) => {
    st.delete(id);
    note(recId('goal', id));
  });
}

export async function getReviews(): Promise<Review[]> {
  return done((await store('reviews', 'readonly')).getAll());
}

export async function putReview(r: Review): Promise<void> {
  return write('reviews', (st, note) => {
    st.put(plain(r));
    note(recId('review', r.id));
  });
}

export async function getSettings(): Promise<Partial<Settings> | undefined> {
  return done((await store('meta', 'readonly')).get('settings'));
}

export async function putSettings(s: Settings): Promise<void> {
  return write('meta', (st, note) => {
    st.put(plain(s), 'settings');
    note(recId('settings', 'main'));
  });
}

/** The notifications booked with the push worker, for the service worker to show (see reminders.ts). */
export async function putAlerts(groups: AlertGroup[]): Promise<void> {
  await done((await store('meta', 'readwrite')).put(plain({ groups }), 'alerts'));
}

/**
 * Replace everything in one transaction (Import) or wipe it (Erase everything). Signed in, the
 * account follows: every day and series there was or is now goes in the outbox, so the ones
 * gone are deleted from it too. The account and sync state in `meta` stay.
 */
export async function replaceAll(data: {
  days: Day[];
  series: Series[];
  settings: Settings | null;
  goals?: Goal[];
  reviews?: Review[];
}): Promise<void> {
  const db = await open();
  const names: StoreName[] = ['days', 'series', 'meta', 'outbox', 'goals', 'reviews'];
  const tx = db.transaction(names, 'readwrite');
  const meta = tx.objectStore('meta');
  const outbox = tx.objectStore('outbox');
  const lists: [DataStore & ('days' | 'series' | 'goals' | 'reviews'), RecordKind, { id?: string; key?: string }[]][] =
    [
      ['days', 'day', data.days],
      ['series', 'series', data.series],
      ['goals', 'goal', data.goals ?? []],
      ['reviews', 'review', data.reviews ?? []],
    ];
  for (const [name, kind, rows] of lists) {
    const st = tx.objectStore(name);
    if (tracking)
      st.getAllKeys().onsuccess = (e) => {
        for (const k of (e.target as IDBRequest<IDBValidKey[]>).result) outbox.put(true, recId(kind, String(k)));
      };
    // Requests run in order, so this clear comes after the key list above.
    st.clear();
    for (const r of rows) {
      st.put(plain(r));
      if (tracking) outbox.put(true, recId(kind, String(r.key ?? r.id)));
    }
  }
  for (const k of ['settings', 'alerts']) meta.delete(k);
  if (data.settings) meta.put(plain(data.settings), 'settings');
  if (tracking) outbox.put(true, recId('settings', 'main'));
  await txDone(tx);
  if (tracking) afterWrite?.();
}

// ---------- syncing (see sync.ts) ----------

/** The local copy of a record, or undefined if there is none. Settings come whole. */
const STORE_OF: Record<RecordKind, DataStore> = {
  day: 'days',
  series: 'series',
  settings: 'meta',
  goal: 'goals',
  review: 'reviews',
};

export async function getRecord(kind: RecordKind, key: string): Promise<unknown> {
  return done((await store(STORE_OF[kind], 'readonly')).get(kind === 'settings' ? 'settings' : key));
}

/**
 * Write what came from the account: the local copy (`data` undefined leaves it, null deletes
 * it), the version agreed with the account, and whether it still has changes to send.
 */
export async function putSyncedRecord(
  kind: RecordKind,
  key: string,
  data: unknown,
  synced: { rev: number; data: unknown },
  dirty: boolean,
): Promise<void> {
  const db = await open();
  const name = STORE_OF[kind];
  const tx = db.transaction([name, 'synced', 'outbox'], 'readwrite');
  const st = tx.objectStore(name);
  if (data !== undefined) {
    if (kind === 'settings') {
      if (data != null) st.put(plain(data), 'settings');
    } else if (data === null) st.delete(key);
    else st.put(plain(data));
  }
  const id = recId(kind, key);
  tx.objectStore('synced').put(plain(synced), id);
  if (dirty) tx.objectStore('outbox').put(true, id);
  else tx.objectStore('outbox').delete(id);
  return txDone(tx);
}

export async function getSynced(id: string): Promise<{ rev: number; data: unknown } | undefined> {
  return done((await store('synced', 'readonly')).get(id));
}

export async function getOutbox(): Promise<string[]> {
  return (await done((await store('outbox', 'readonly')).getAllKeys())).map(String);
}

/** Note records as changed here (to upload everything, or to send this device's plan to an account). */
export async function markAll(): Promise<void> {
  const db = await open();
  const tx = db.transaction(['days', 'series', 'goals', 'reviews', 'outbox'], 'readwrite');
  const outbox = tx.objectStore('outbox');
  for (const [name, kind] of [
    ['days', 'day'],
    ['series', 'series'],
    ['goals', 'goal'],
    ['reviews', 'review'],
  ] as const)
    tx.objectStore(name).getAllKeys().onsuccess = (e) => {
      for (const k of (e.target as IDBRequest<IDBValidKey[]>).result) outbox.put(true, recId(kind, String(k)));
    };
  outbox.put(true, recId('settings', 'main'));
  return txDone(tx);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return done((await store('meta', 'readonly')).get(key));
}

export async function putMeta(key: string, v: unknown): Promise<void> {
  await done((await store('meta', 'readwrite')).put(plain(v), key));
}

export async function deleteMeta(key: string): Promise<void> {
  await done((await store('meta', 'readwrite')).delete(key));
}

/** Signing out: forget what was agreed with the account and what was waiting to go. */
export async function clearSync(): Promise<void> {
  const db = await open();
  const tx = db.transaction(['synced', 'outbox', 'meta'], 'readwrite');
  tx.objectStore('synced').clear();
  tx.objectStore('outbox').clear();
  for (const k of ['account', 'syncRev']) tx.objectStore('meta').delete(k);
  return txDone(tx);
}

/** Close the connection (tests swap in a fresh database between cases). */
export async function closeDb(): Promise<void> {
  if (!dbp) return;
  const db = await dbp.catch(() => null);
  db?.close();
  dbp = null;
}

/** Ask the browser not to evict our data under storage pressure. Best effort. */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}
