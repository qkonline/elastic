// IndexedDB persistence: one record per day (keyed 'YYYY-MM-DD'), per repeating series, goal and
// review, and in `meta` the settings, the booked notifications and the account.
//
// Syncing (see sync.ts and shared/lww.ts): `replicas` holds each record as its paths, every path
// with the moment it was set (deletions too); the record in its own store is built from that.
// `pending` holds the changes made here still to send. Changes made here go in with `commit`,
// in one transaction with the record they change; what other devices did comes in with
// `applyRemote`. Plain writes (`putDays`…, `replaceAll` without a clock) send nothing.

import { type Clock, diff, fromPaths, type Kind, merge, type Paths, stamp, toPaths } from '../../shared/lww';
import { normalizeDay, normalizeGoal, normalizeReview, normalizeSeries } from './backup';
import type { AlertGroup } from './reminders';
import type { Day, Goal, Review, Series, Settings } from './types';
import { sharedSettings } from './types';

const DB_NAME = 'elastic-day';
const VERSION = 4;

/**
 * A record as the account knows it: a day (by key), a repeating series, a goal or a review (by
 * id), or the settings ('main', the shared ones).
 */
export type RecordKind = Kind;
export const recId = (kind: RecordKind, key: string) => `${kind}:${key}`;
export function splitId(id: string): [RecordKind, string] {
  const i = id.indexOf(':');
  return [id.slice(0, i) as RecordKind, id.slice(i + 1)];
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
      if (!db.objectStoreNames.contains('goals')) db.createObjectStore('goals', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('reviews')) db.createObjectStore('reviews', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('replicas')) db.createObjectStore('replicas');
      if (!db.objectStoreNames.contains('pending')) db.createObjectStore('pending');
      // v3 kept the version last agreed with the account and an outbox of records changed since.
      // What was still to send goes again whole (sync.ts, `unsent`); the rest isn't needed.
      if (db.objectStoreNames.contains('synced')) db.deleteObjectStore('synced');
      if (db.objectStoreNames.contains('outbox')) {
        const tx = req.transaction!;
        const keys = tx.objectStore('outbox').getAllKeys();
        keys.onsuccess = () => {
          if (keys.result.length) tx.objectStore('meta').put(keys.result.map(String), 'unsent');
          db.deleteObjectStore('outbox');
        };
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgraded the schema: let it proceed, reopen lazily next time.
      db.onversionchange = () => {
        db.close();
        dbp = null;
      };
      // The browser can drop the connection (WebKit does, after the app has been in the
      // background a while): open a new one next time rather than failing every save from then on.
      db.onclose = () => (dbp = null);
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Elastic is open in another tab that is blocking an upgrade.'));
  });
  dbp.catch(() => (dbp = null));
  return dbp;
}

/**
 * A transaction, on a new connection if the one we had is closing or gone (`InvalidStateError`,
 * which `onclose` doesn't always come before).
 */
async function begin(names: StoreName | StoreName[], mode: IDBTransactionMode): Promise<IDBTransaction> {
  try {
    return (await open()).transaction(names, mode);
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'InvalidStateError')) throw e;
    dbp = null;
    return (await open()).transaction(names, mode);
  }
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

type StoreName = 'days' | 'series' | 'meta' | 'goals' | 'reviews' | 'replicas' | 'pending';
type DataStore = 'days' | 'series' | 'meta' | 'goals' | 'reviews';

async function store(name: StoreName, mode: IDBTransactionMode) {
  return (await begin(name, mode)).objectStore(name);
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

/** A plain write to one store: nothing to send. */
async function write(name: DataStore, fn: (st: IDBObjectStore) => void) {
  const tx = await begin(name, 'readwrite');
  fn(tx.objectStore(name));
  await txDone(tx);
}

export async function putDays(days: Day[]): Promise<void> {
  if (!days.length) return;
  return write('days', (st) => {
    for (const d of days) st.put(plain(d));
  });
}

export const putDay = (day: Day) => putDays([day]);

export async function getAllSeries(): Promise<Series[]> {
  return done((await store('series', 'readonly')).getAll());
}

export async function putSeries(s: Series): Promise<void> {
  return write('series', (st) => st.put(plain(s)));
}

export async function getGoals(): Promise<Goal[]> {
  return done((await store('goals', 'readonly')).getAll());
}

export async function getReviews(): Promise<Review[]> {
  return done((await store('reviews', 'readonly')).getAll());
}

export async function getSettings(): Promise<Partial<Settings> | undefined> {
  return done((await store('meta', 'readonly')).get('settings'));
}

export async function putSettings(s: Settings): Promise<void> {
  return write('meta', (st) => st.put(plain(s), 'settings'));
}

/** The notifications booked with the push worker, for the service worker to show (see reminders.ts). */
export async function putAlerts(groups: AlertGroup[]): Promise<void> {
  await done((await store('meta', 'readwrite')).put(plain({ groups }), 'alerts'));
}

// ---------- syncing (see sync.ts and shared/lww.ts) ----------

const STORE_OF: Record<RecordKind, DataStore> = {
  day: 'days',
  series: 'series',
  settings: 'meta',
  goal: 'goals',
  review: 'reviews',
};
const KINDS: [RecordKind, DataStore][] = [
  ['day', 'days'],
  ['series', 'series'],
  ['goal', 'goals'],
  ['review', 'reviews'],
];

/** A record as it's synced: settings are only the shared ones. */
const synced = (kind: RecordKind, doc: unknown) =>
  doc == null ? null : kind === 'settings' ? sharedSettings(doc as Settings) : doc;

/** A record built from its replica, checked like an import (null: none, deleted, or not readable). */
function built(kind: RecordKind, key: string, replica: Paths): unknown {
  const doc = fromPaths(kind, key, replica);
  if (doc == null) return null;
  if (kind === 'day') return normalizeDay(doc);
  if (kind === 'series') return normalizeSeries(doc, 0);
  if (kind === 'goal') return normalizeGoal(doc);
  if (kind === 'review') return normalizeReview(doc);
  return doc;
}

/** One request's result, inside a transaction (awaiting it keeps the transaction open). */
const ask = <T>(r: IDBRequest<T>) => done(r);

/** A record's replica, or (made before replicas) one with its paths set at ZERO. */
async function replicaIn(tx: IDBTransaction, kind: RecordKind, key: string): Promise<Paths> {
  const r = await ask<Paths | undefined>(tx.objectStore('replicas').get(recId(kind, key)));
  if (r) return r;
  const doc = await ask(tx.objectStore(STORE_OF[kind]).get(kind === 'settings' ? 'settings' : key));
  return toPaths(kind, synced(kind, doc));
}

/** Write a record built from its replica in its store (settings: the shared part into this device's). */
async function putBuilt(tx: IDBTransaction, kind: RecordKind, key: string, doc: unknown): Promise<void> {
  const st = tx.objectStore(STORE_OF[kind]);
  if (kind === 'settings') {
    const cur = (await ask<Settings | undefined>(st.get('settings'))) ?? {};
    if (doc == null) st.delete('settings');
    else st.put(plain({ ...cur, ...(doc as object) }), 'settings');
  } else if (doc == null) st.delete(key);
  else st.put(plain(doc));
}

export interface Change {
  kind: RecordKind;
  key: string;
  /** The paths it set, with when. */
  patch: Paths;
}

const ALL: StoreName[] = ['days', 'series', 'meta', 'goals', 'reviews', 'replicas', 'pending'];

/**
 * Changes made here: each into its record's replica, the record rebuilt from that and saved, and
 * (`send`, signed in) queued to go to the account. One transaction: nothing half done. Returns
 * the records as they now are, by recId.
 */
export async function commit(changes: Change[], send: boolean): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  if (!changes.length) return out;
  const tx = await begin(ALL, 'readwrite');
  const done_ = txDone(tx);
  for (const c of changes) {
    const id = recId(c.kind, c.key);
    const replica = merge(await replicaIn(tx, c.kind, c.key), c.patch);
    tx.objectStore('replicas').put(plain(replica), id);
    const doc = built(c.kind, c.key, replica);
    await putBuilt(tx, c.kind, c.key, doc);
    out.set(id, doc);
    if (send) {
      const p = (await ask<Paths | undefined>(tx.objectStore('pending').get(id))) ?? {};
      tx.objectStore('pending').put(plain(merge(p, c.patch)), id);
    }
  }
  await done_;
  return out;
}

/**
 * What other devices did (from the account): merged into each record's replica, and the record
 * rebuilt. Changes still to send stay as they are. The ids of the records that changed here.
 */
export async function applyRemote(recs: Change[]): Promise<string[]> {
  const changed: string[] = [];
  if (!recs.length) return changed;
  const tx = await begin(ALL, 'readwrite');
  const done_ = txDone(tx);
  for (const r of recs) {
    const id = recId(r.kind, r.key);
    const before = await replicaIn(tx, r.kind, r.key);
    const replica = merge(before, r.patch);
    if (JSON.stringify(replica) === JSON.stringify(before)) continue;
    tx.objectStore('replicas').put(plain(replica), id);
    const was = built(r.kind, r.key, before);
    const doc = built(r.kind, r.key, replica);
    if (JSON.stringify(was) === JSON.stringify(doc)) continue;
    await putBuilt(tx, r.kind, r.key, doc);
    changed.push(id);
  }
  await done_;
  return changed;
}

/** A record's replica (for merging edits not saved yet with what came in). */
export async function getReplica(kind: RecordKind, key: string): Promise<Paths> {
  const tx = await begin(['replicas', STORE_OF[kind]], 'readonly');
  return replicaIn(tx, kind, key);
}

/** The changes waiting to go, by recId. */
export async function getPending(): Promise<Record<string, Paths>> {
  const st = await store('pending', 'readonly');
  const [keys, values] = await Promise.all([done(st.getAllKeys()), done(st.getAll())]);
  return Object.fromEntries(keys.map((k, i) => [String(k), values[i] as Paths]));
}

/** The account has these: they're done with, unless changed again since they went. */
export async function ackPending(sent: Record<string, Paths>): Promise<void> {
  const tx = await begin('pending', 'readwrite');
  const done_ = txDone(tx);
  const st = tx.objectStore('pending');
  for (const [id, paths] of Object.entries(sent)) {
    const cur = await ask<Paths | undefined>(st.get(id));
    if (!cur) continue;
    const rest = Object.fromEntries(Object.entries(cur).filter(([p, x]) => !paths[p] || paths[p][1] !== x[1]));
    if (Object.keys(rest).length) st.put(rest, id);
    else st.delete(id);
  }
  await done_;
}

/**
 * Everything here, to send as this device's (a new account, or a device's plan added to one):
 * every path of every record set at `clock`, so it's newer than what the account has.
 */
export async function markAll(clock: Clock, only?: string[]): Promise<void> {
  const tx = await begin(ALL, 'readwrite');
  const done_ = txDone(tx);
  const docs: [RecordKind, string, unknown][] = [];
  for (const [kind, name] of KINDS) {
    const st = tx.objectStore(name);
    const keys = await ask(st.getAllKeys());
    const all = await ask(st.getAll());
    keys.forEach((k, i) => docs.push([kind, String(k), all[i]]));
  }
  docs.push(['settings', 'main', synced('settings', await ask(tx.objectStore('meta').get('settings')))]);
  for (const [kind, key, doc] of docs) {
    const id = recId(kind, key);
    if (doc == null || (only && !only.includes(id))) continue;
    const patch = toPaths(kind, doc, clock);
    tx.objectStore('replicas').put(plain(merge(await replicaIn(tx, kind, key), patch)), id);
    const p = (await ask<Paths | undefined>(tx.objectStore('pending').get(id))) ?? {};
    tx.objectStore('pending').put(plain(merge(p, patch)), id);
  }
  await done_;
}

/**
 * Replace everything in one transaction. `clock` (Import, Erase everything, signed in): the
 * account follows, each record gone or changed sent as changed at that moment, and marked as
 * meant (the account refuses so many deletions otherwise). Without it (this device's plan making
 * way for an account's, or for another person's): nothing is sent, and what was set when is
 * forgotten. The account and the sync state in `meta` stay.
 */
export async function replaceAll(
  data: { days: Day[]; series: Series[]; settings: Settings | null; goals?: Goal[]; reviews?: Review[] },
  clock?: Clock,
): Promise<void> {
  const tx = await begin(ALL, 'readwrite');
  const done_ = txDone(tx);
  const next: Record<string, [RecordKind, string, unknown]> = {};
  const lists: [RecordKind, { id?: string; key?: string }[]][] = [
    ['day', data.days],
    ['series', data.series],
    ['goal', data.goals ?? []],
    ['review', data.reviews ?? []],
  ];
  for (const [kind, rows] of lists)
    for (const r of rows) next[recId(kind, String(r.key ?? r.id))] = [kind, String(r.key ?? r.id), r];
  if (clock) {
    // What each record was, to say what changed.
    const old: Record<string, [RecordKind, string, unknown]> = {};
    for (const [kind, name] of KINDS) {
      const st = tx.objectStore(name);
      const keys = await ask(st.getAllKeys());
      const all = await ask(st.getAll());
      keys.forEach((k, i) => (old[recId(kind, String(k))] = [kind, String(k), all[i]]));
    }
    const settings = await ask(tx.objectStore('meta').get('settings'));
    old['settings:main'] = ['settings', 'main', synced('settings', settings)];
    next['settings:main'] = ['settings', 'main', synced('settings', data.settings)];
    for (const id of new Set([...Object.keys(old), ...Object.keys(next)])) {
      const [kind, key] = (old[id] ?? next[id]).slice(0, 2) as [RecordKind, string];
      const patch = stamp(diff(kind, old[id]?.[2] ?? null, next[id]?.[2] ?? null), clock);
      if (!Object.keys(patch).length) continue;
      tx.objectStore('replicas').put(plain(merge(await replicaIn(tx, kind, key), patch)), id);
      const p = (await ask<Paths | undefined>(tx.objectStore('pending').get(id))) ?? {};
      tx.objectStore('pending').put(plain(merge(p, patch)), id);
    }
    tx.objectStore('meta').put(Date.now(), 'bulk');
  } else {
    tx.objectStore('replicas').clear();
    tx.objectStore('pending').clear();
  }
  for (const [, name] of KINDS) tx.objectStore(name).clear();
  for (const [kind, , r] of Object.values(next)) if (kind !== 'settings') tx.objectStore(STORE_OF[kind]).put(plain(r));
  const meta = tx.objectStore('meta');
  for (const k of ['settings', 'alerts']) meta.delete(k);
  if (data.settings) meta.put(plain(data.settings), 'settings');
  await done_;
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

/** Signing out: nothing more to send, and no account. What was set when (replicas) stays. */
export async function clearSync(): Promise<void> {
  const tx = await begin(['pending', 'meta'], 'readwrite');
  tx.objectStore('pending').clear();
  for (const k of ['account', 'syncRev', 'unsent', 'bulk']) tx.objectStore('meta').delete(k);
  return txDone(tx);
}

/** Close the connection (tests swap in a fresh database between cases). */
export async function closeDb(): Promise<void> {
  if (!dbp) return;
  const db = await dbp.catch(() => null);
  db?.close();
  dbp = null;
}

/**
 * Delete the whole database (the copy left at the app's old address, once everything in it is on
 * the account). Gives up waiting after a few seconds if another tab holds it open.
 */
export async function destroy(): Promise<void> {
  await closeDb();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = () => resolve();
    setTimeout(resolve, 3000);
  });
}

/** Ask the browser not to evict our data under storage pressure. Best effort. */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}
