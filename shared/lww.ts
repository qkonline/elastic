// Keeping a record the same on every device, used by the app (src/lib/sync.ts, db.ts) and the
// account's server (worker/src/account.ts) alike.
//
// A record (a day, a repeating series, a goal, a review, the shared settings) is held as a set
// of paths, each with its value and the moment it was last set (a hybrid logical clock). Two
// copies of a record merge path by path: the later setting wins, whichever copy it's in and in
// whatever order they meet, so devices and the account end up the same without ever asking
// which version a change was made from. A day's tasks are paths of their own (the task, and its
// fields in the groups that only make sense together, see GROUPS), so a task ticked on one device
// and another moved on a second both stay.
//
// Each device and the account keep a record's replica: every path ever set, deletions included
// (a task deleted is its path set to null, so an older copy can't bring it back), and the
// record itself is built from it (`fromPaths`).
//
// Changes come from what was done (a record before and after, `diff`), never from storage: a
// device clearing its own copy, or taking the account's, makes no change at all.

/** A moment: base-36 milliseconds and a counter, fixed width so they sort as text, then a device. */
export type Clock = string;
/** Before any clock: what records from before clocks existed carry. */
export const ZERO: Clock = '0';
/** A record as paths: each one's value and when it was set. */
export type Paths = Record<string, [unknown, Clock]>;
export type Values = Record<string, unknown>;
export type Kind = 'day' | 'series' | 'settings' | 'goal' | 'review';

/**
 * A hybrid logical clock: the wall clock, but never going back, and past every clock seen from
 * another device, so a change made after seeing another always sorts after it.
 */
export class Hlc {
  private ms = 0;
  private n = 0;
  private readonly device: string;
  constructor(device: string) {
    this.device = device;
  }

  now(wall = Date.now()): Clock {
    if (wall > this.ms) {
      this.ms = wall;
      this.n = 0;
    } else this.n++;
    return `${this.ms.toString(36).padStart(9, '0')}${this.n.toString(36).padStart(3, '0')}${this.device}`;
  }

  /** A clock from elsewhere: the next one made here comes after it. */
  see(c: Clock): void {
    if (c.length < 12) return;
    const ms = parseInt(c.slice(0, 9), 36);
    const n = parseInt(c.slice(9, 12), 36);
    if (ms > this.ms || (ms === this.ms && n > this.n)) {
      this.ms = ms;
      this.n = n;
    }
  }
}

/** A task's fields that only make sense together: each group is one path, set whole. */
const GROUPS: Record<string, string[]> = {
  // The timer and what it led to: running, done, set aside, moved.
  t: [
    'status',
    'startedAt',
    'endedAt',
    'pausedAt',
    'pausedFor',
    'marked',
    'continued',
    'laterCopy',
    'planFrom',
    'movedKey',
    'movedId',
    'card',
  ],
  // What kind of task it is and how long.
  k: ['kind', 'fixedAt', 'min', 'heldAt'],
  // Its repeat.
  r: ['repeat', 'seriesId'],
};
const GROUPED = new Set(Object.values(GROUPS).flat());

const json = (v: unknown) => JSON.stringify(v ?? null);
const same = (a: unknown, b: unknown) => json(a) === json(b);
const pick = (o: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/** A record's paths and values. `_` says it exists; a missing record has none. */
export function toValues(kind: Kind, doc: unknown): Values {
  if (doc == null || typeof doc !== 'object') return {};
  const d = doc as Record<string, unknown>;
  const out: Values = { _: true };
  if (kind !== 'day') {
    for (const [k, v] of Object.entries(d)) if (v !== undefined) out[`f.${k}`] = v;
    return out;
  }
  const items = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : [];
  for (const [k, v] of Object.entries(d)) if (k !== 'items' && k !== 'key' && v !== undefined) out[`f.${k}`] = v;
  out.order = items.map((i) => i.id);
  for (const it of items) {
    const p = `i.${it.id}`;
    out[p] = true;
    for (const [g, keys] of Object.entries(GROUPS)) out[`${p}.${g}`] = pick(it, keys);
    for (const [k, v] of Object.entries(it))
      if (k !== 'id' && !GROUPED.has(k) && v !== undefined) out[`${p}.f.${k}`] = v;
  }
  return out;
}

/** The record the paths describe, or null when it doesn't exist (never made, or deleted). */
export function fromValues(kind: Kind, key: string, v: Values, clocks: Record<string, Clock> = {}): unknown {
  if (v._ !== true) return null;
  const fields = (prefix: string, keepNull: boolean) =>
    Object.fromEntries(
      Object.entries(v)
        .filter(([p, x]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('.') && (keepNull || x != null))
        .map(([p, x]) => [p.slice(prefix.length), x]),
    );
  if (kind !== 'day') return fields('f.', true);
  const ids = Object.keys(v)
    .filter((p) => /^i\.[^.]+$/.test(p) && v[p] === true)
    .map((p) => p.slice(2));
  const live = new Set(ids);
  const listed = (Array.isArray(v.order) ? (v.order as string[]) : []).filter((id) => live.has(id));
  // Tasks the order doesn't list yet (added on a device that hadn't seen it) go at the end, in
  // the order they were added.
  const rest = ids
    .filter((id) => !listed.includes(id))
    .sort((a, b) => (clocks[`i.${a}`] ?? '').localeCompare(clocks[`i.${b}`] ?? '') || a.localeCompare(b));
  const items = [...new Set([...listed, ...rest])].map((id) => {
    const p = `i.${id}`;
    const it: Record<string, unknown> = { id };
    for (const g of Object.keys(GROUPS)) Object.assign(it, (v[`${p}.${g}`] as object) ?? {});
    Object.assign(it, fields(`${p}.f.`, false));
    return it;
  });
  return { ...fields('f.', true), key, items };
}

/**
 * What changed from `prev` to `next` (null: there's none), as the paths to set. A record that
 * goes is `_` set to null; a task that goes, its `i.<id>`.
 */
export function diff(kind: Kind, prev: unknown, next: unknown): Values {
  const a = toValues(kind, prev);
  const b = toValues(kind, next);
  if (b._ !== true) return a._ === true ? { _: null } : {};
  const out: Values = {};
  for (const [p, x] of Object.entries(b)) if (!(p in a) || !same(a[p], x)) out[p] = x;
  for (const p of Object.keys(a)) {
    if (p in b) continue;
    // A task gone: just that it's gone. A field gone: null.
    const task = /^i\.[^.]+/.exec(p)?.[0];
    if (task && !(task in b)) {
      if (p === task) out[p] = null;
    } else out[p] = null;
  }
  // Every change says the record is there: a copy that hasn't got it yet (the account, another
  // device) can build it, and an edit after it was deleted elsewhere brings it back.
  if (Object.keys(out).length) out._ = true;
  return out;
}

/** Paths with one clock: changes made at one moment. */
export const stamp = (v: Values, c: Clock): Paths => Object.fromEntries(Object.entries(v).map(([p, x]) => [p, [x, c]]));

/** Two copies of a record as one: each path the later of the two (ties broken by value, so every copy agrees). */
export function merge(a: Paths, b: Paths): Paths {
  const out: Paths = { ...a };
  for (const [p, mine] of Object.entries(b)) {
    const cur = out[p];
    if (!cur || mine[1] > cur[1] || (mine[1] === cur[1] && json(mine[0]) > json(cur[0]))) out[p] = mine;
  }
  return out;
}

/** The paths of `b` that would change `a` (what to tell others after a merge). */
export function newer(a: Paths, b: Paths): Paths {
  const m = merge(a, b);
  return Object.fromEntries(Object.entries(m).filter(([p, x]) => !a[p] || a[p][1] !== x[1] || !same(a[p][0], x[0])));
}

/** A whole record as paths, all set at `c` (ZERO: records from before clocks existed). */
export const toPaths = (kind: Kind, doc: unknown, c: Clock = ZERO): Paths => stamp(toValues(kind, doc), c);

/** The record a replica's paths describe (null: none, or deleted). */
export function fromPaths(kind: Kind, key: string, paths: Paths): unknown {
  const values: Values = {};
  const clocks: Record<string, Clock> = {};
  for (const [p, [x, c]] of Object.entries(paths)) {
    values[p] = x;
    clocks[p] = c;
  }
  return fromValues(kind, key, values, clocks);
}

/** Deletions in a set of changes: whole records, and tasks. */
export const deletions = (p: Paths) =>
  Object.entries(p).filter(([k, [x]]) => x === null && (k === '_' || /^i\.[^.]+$/.test(k))).length;
