// Combining two versions of a record that were changed on different devices. `base` is the last
// version both had, `mine` this device's, `theirs` the account's. Whatever this device changed
// since `base` wins, and whatever it left alone takes the account's version, task by task and
// field by field. When both changed the same field, this device's change is the later one (the
// account only refuses a change after another device got in first), so it wins.

import type { Day, Item, Series } from './types';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Field by field. Without a base (two devices that never synced), mine wins where they differ. */
function fields<T extends object>(base: T | null, mine: T, theirs: T): T {
  const out = { ...theirs } as Record<string, unknown>;
  const b = base as Record<string, unknown> | null;
  const m = mine as Record<string, unknown>;
  // Without a base there's no telling what either side changed: mine wins, but an empty value of
  // mine (a day this device never started, say) doesn't wipe one theirs has.
  for (const k of Object.keys(m)) if (b ? !same(m[k], b[k]) : m[k] != null || !(k in out)) out[k] = m[k];
  // A field mine dropped since the base goes, unless theirs changed it.
  if (b) for (const k of Object.keys(b)) if (!(k in m) && same(out[k], b[k])) delete out[k];
  return out as T;
}

export const mergeSeries = (base: Series | null, mine: Series, theirs: Series): Series => fields(base, mine, theirs);

export function mergeSettings<T extends object>(base: T | null, mine: T, theirs: T): T {
  return fields(base, mine, theirs);
}

/**
 * A task's fields that only make sense together: the timer and what it led to (running, done,
 * set aside, moved), what kind of task it is, and its repeat. Each goes whole, from the side
 * that changed it.
 */
const TOGETHER: (keyof Item)[][] = [
  [
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
  ['kind', 'fixedAt', 'min', 'heldAt'],
  ['repeat', 'seriesId'],
];
const GROUPED = new Set<string>(TOGETHER.flat());

/** One task changed on both sides: what each side changed, the rest as it was (mine wins a tie). */
function mergeItem(base: Item, mine: Item, theirs: Item): Item {
  const out = { ...theirs } as Record<string, unknown>;
  const b = base as unknown as Record<string, unknown>;
  const m = mine as unknown as Record<string, unknown>;
  const take = (keys: string[]) => {
    for (const k of keys)
      if (k in m) out[k] = m[k];
      else delete out[k];
  };
  for (const group of TOGETHER) if (group.some((k) => !same(m[k], b[k]))) take(group);
  for (const k of new Set([...Object.keys(b), ...Object.keys(m)])) if (!GROUPED.has(k) && !same(m[k], b[k])) take([k]);
  return out as unknown as Item;
}

/**
 * How far a task has got, to choose between two copies with nothing to compare them to (the same
 * repeating task, built for a day on two devices): one worked on beats one left as it came.
 */
const worked = (i: Item) =>
  (i.status === 'todo' ? 0 : 4) +
  (i.startedAt != null ? 2 : 0) +
  (i.progress ? 1 : 0) +
  i.subtasks.filter((x) => x.d).length / 100;

const empty = (v: unknown) => v == null || v === '' || v === false || (Array.isArray(v) && v.length === 0);

/**
 * The same task on both sides with no agreed version to compare them to (a repeating task's copy,
 * built for a day on two devices): the timer and what it led to from the one that got further,
 * and every other field mine, unless mine is empty and theirs isn't.
 */
function mergeUnagreed(mine: Item, theirs: Item): Item {
  const ahead = worked(theirs) > worked(mine) ? theirs : mine;
  const out = { ...theirs } as Record<string, unknown>;
  const m = mine as unknown as Record<string, unknown>;
  const a = ahead as unknown as Record<string, unknown>;
  for (const k of TOGETHER[0])
    if (k in a) out[k] = a[k];
    else delete out[k];
  for (const k of Object.keys(m)) if (!TOGETHER[0].includes(k as keyof Item) && !empty(m[k])) out[k] = m[k];
  return out as unknown as Item;
}

/**
 * Tasks are matched by id. A task changed on one side only takes that side's version, and one
 * changed on both is merged field by field (`mergeItem`). One
 * deleted on one side stays deleted unless the other side changed it meanwhile. The order is
 * this device's if it reordered since the base, otherwise the account's, with tasks only one
 * side has slotted in after the task they followed there. Without a base, this device's tasks
 * go after the account's.
 */
export function mergeDay(base: Day | null, mine: Day, theirs: Day): Day {
  const { items: bItems = [], ...bRest } = base ?? ({} as Partial<Day>);
  const { items: mItems, ...mRest } = mine;
  const { items: tItems, ...tRest } = theirs;
  const head = fields(base ? (bRest as Omit<Day, 'items'>) : null, mRest, tRest);

  const b = new Map(bItems.map((i) => [i.id, i]));
  const m = new Map(mItems.map((i) => [i.id, i]));
  const t = new Map(tItems.map((i) => [i.id, i]));
  const kept = new Map<string, Item>();
  for (const id of new Set([...m.keys(), ...t.keys()])) {
    const bi = b.get(id),
      mi = m.get(id),
      ti = t.get(id);
    const mineChanged = bi ? !mi || !same(mi, bi) : !!mi;
    const theirsChanged = bi ? !ti || !same(ti, bi) : !!ti;
    if (mi && ti && !bi) kept.set(id, mergeUnagreed(mi, ti));
    else if (mi && ti) kept.set(id, mineChanged && theirsChanged ? mergeItem(bi!, mi, ti) : mineChanged ? mi : ti);
    else if (mi) {
      // Not on theirs: they deleted it (keep it only if I changed it), or I added it.
      if (!bi || mineChanged) kept.set(id, mi);
    } else if (ti) {
      if (!bi || theirsChanged) kept.set(id, ti);
    }
  }

  const ids = (list: Item[]) => list.map((i) => i.id);
  const reordered =
    base &&
    !same(
      ids(mItems).filter((id) => b.has(id)),
      ids(bItems).filter((id) => m.has(id)),
    );
  // Without a base, the account's plan comes first and this device's tasks follow it.
  const [first, second] = reordered ? [mItems, tItems] : [tItems, mItems];
  const order = ids(first).filter((id) => kept.has(id));
  const second_ = ids(second);
  for (const [i, id] of second_.entries()) {
    if (!kept.has(id) || order.includes(id)) continue;
    // After the nearest task before it (on its own side) that's already placed, else first
    // (last when there's no base).
    let at = base ? 0 : order.length;
    for (let j = i - 1; j >= 0; j--) {
      const k = order.indexOf(second_[j]);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    order.splice(at, 0, id);
  }
  return { ...head, items: oneTimer(order.map((id) => kept.get(id)!)) } as Day;
}

/**
 * One timer at a time: two devices can each start a task before hearing of the other. The one
 * started last keeps going; the other is set aside from that moment (as starting a task does),
 * never marked done.
 */
function oneTimer(items: Item[]): Item[] {
  const active = items.filter((i) => (i.status === 'running' || i.status === 'paused') && i.startedAt != null);
  if (active.length < 2) return items;
  const last = active.reduce((a, b) => (b.startedAt! > a.startedAt! ? b : a));
  return items.map((i) =>
    active.includes(i) && i !== last
      ? {
          ...i,
          status: 'postponed',
          endedAt: i.status === 'paused' ? i.pausedAt : Math.max(i.startedAt! + i.pausedFor, last.startedAt!),
          pausedAt: null,
        }
      : i,
  );
}
