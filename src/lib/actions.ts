// Pure transformations of a Day. Each returns a new Day and never mutates its input.
// `n` is "now" in minutes since the day's local midnight.

import { isActive, isMissed, isPartial, schedule } from './schedule';
import type { Day, Item, Kind } from './types';
import { untimed } from './types';

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().slice(0, 12);
  return Math.random().toString(36).slice(2, 14);
}

export function newItem(o: Partial<Item> & { title: string }): Item {
  return {
    id: uid(),
    min: 30,
    kind: 'task',
    fixedAt: null,
    hue: 'cyan',
    status: 'todo',
    startedAt: null,
    endedAt: null,
    pausedAt: null,
    pausedFor: 0,
    repeat: 'Once',
    seriesId: null,
    subtasks: [],
    note: '',
    ...o,
  };
}

/** A fresh, unstarted copy for another day. Drops the repeat and history; unticks steps. */
export function freshCopy(it: Item, extra: Partial<Item> = {}): Item {
  return newItem({
    title: it.title,
    min: it.min,
    kind: it.kind,
    fixedAt: it.fixedAt,
    hue: it.hue,
    note: it.note,
    subtasks: it.subtasks.map((x) => ({ ...x, id: uid(), d: false })),
    ...(it.habit ? { habit: it.habit } : {}),
    ...(it.habitId ? { habitId: it.habitId } : {}),
    ...(it.goalId ? { goalId: it.goalId } : {}),
    ...extra,
  });
}

const mapItem = (day: Day, id: string, fn: (it: Item) => Partial<Item>): Day => ({
  ...day,
  items: day.items.map((i) => (i.id === id ? { ...i, ...fn(i) } : i)),
});

export const find = (day: Day, id: string) => day.items.find((i) => i.id === id);
export const activeItem = (day: Day) => day.items.find(isActive);

export function patchItem(day: Day, id: string, patch: Partial<Item>): Day {
  return mapItem(day, id, () => patch);
}

/**
 * Put the started item at the current point in the plan: in front of the first task still to
 * come, so that everything upcoming is planned after it instead of overlapping it. Tasks already
 * missed stay where they are, still missed: only the task being started moves.
 */
function toCurrentPoint(items: Item[], id: string, missed: Set<string>): Item[] {
  const self = items.find((x) => x.id === id);
  if (!self) return items;
  const rest = items.filter((x) => x.id !== id);
  // Checks live in the checklist, so they don't count.
  const at = rest.findIndex((x) => !untimed(x.kind) && x.status === 'todo' && !missed.has(x.id));
  rest.splice(at < 0 ? rest.length : at, 0, self);
  return rest;
}

/**
 * Starting an item finishes whatever else is running or paused as done, and moves the item to
 * the current point in the plan (see toCurrentPoint). Buffers never start.
 */
export function startItem(day: Day, id: string, n: number): Day {
  const target = find(day, id);
  if (!target || target.kind === 'buffer' || untimed(target.kind)) return day;
  const missed = new Set(
    schedule(day, n)
      .rows.filter((r) => r.it.id !== id && isMissed(r, n))
      .map((r) => r.it.id),
  );
  let rest: Item | null = null;
  const items = day.items.map((i): Item => {
    if (i.id === id)
      return { ...i, status: 'running', startedAt: n, endedAt: null, pausedAt: null, pausedFor: 0, marked: false };
    if (i.status === 'running') return { ...i, status: 'done', endedAt: n };
    if (i.status === 'paused') {
      const w = i.pausedAt! - i.startedAt! - i.pausedFor;
      if (w >= i.min) return { ...i, status: 'done', pausedFor: pausedSoFar(i, n), pausedAt: null, endedAt: n };
      // Paused part-way, so not finished: the time put in stays logged (up to the pause) and
      // the rest comes straight after the task being started.
      rest = restOf(i, w);
      return { ...i, status: 'postponed', endedAt: i.pausedAt, pausedAt: null, laterCopy: true };
    }
    return i;
  });
  const ordered = toCurrentPoint(items, id, missed);
  if (rest) ordered.splice(ordered.findIndex((x) => x.id === id) + 1, 0, rest);
  // Starting something on a day already ended reopens it.
  return { ...day, dayStarted: day.dayStarted ?? n, dayEnded: null, items: ordered };
}

/**
 * "Start my day": stamp the day and start the first pending task (or fixed item). The plan now
 * runs from this moment, so nothing still to do counts as missed.
 */
export function startDay(day: Day, n: number): Day {
  const timed = (i: Item) => i.status === 'todo' && i.kind !== 'buffer' && !untimed(i.kind);
  const first = day.items.find((i) => timed(i) && i.kind === 'task') ?? day.items.find(timed);
  const d = { ...day, dayStarted: n, dayEnded: null };
  return first ? startItem(d, first.id, n) : d;
}

/** Tick or untick a check (a task with no duration). */
export function toggleCheck(day: Day, id: string, n: number): Day {
  return mapItem(day, id, (i) =>
    i.kind !== 'check' ? {} : i.status === 'done' ? { status: 'todo', endedAt: null } : { status: 'done', endedAt: n },
  );
}

/**
 * Tap a habit: tick or untick a yes/no habit, mark or unmark a slip on a habit to break, or add
 * one to an amount (`by` minutes for a time habit).
 */
export function tapHabit(day: Day, id: string, n: number, by = 1): Day {
  const it = find(day, id);
  if (!it || it.kind !== 'habit' || !it.habit) return day;
  const t = it.habit.type;
  if (t === 'check')
    return mapItem(day, id, (i) =>
      i.status === 'done' ? { status: 'todo', endedAt: null } : { status: 'done', endedAt: n },
    );
  if (t === 'quit') return mapItem(day, id, (i) => ({ progress: i.progress ? 0 : 1 }));
  return setProgress(day, id, (it.progress ?? 0) + by, n);
}

/** Set an amount or time habit's progress (minutes added by hand, for a time habit). */
export function setProgress(day: Day, id: string, value: number, n: number): Day {
  return mapItem(day, id, (i) => {
    const v = Math.max(0, Math.round(value));
    const met = !!i.habit && v >= Math.max(1, i.habit.target);
    return { progress: v, status: met ? 'done' : 'todo', endedAt: met ? (i.endedAt ?? n) : null };
  });
}

/** "End my day": finish whatever is running or paused, and mark the day as ended. */
export function endDay(day: Day, n: number): Day {
  const act = activeItem(day);
  const d = act ? finish(day, act.id, n) : day;
  return { ...d, dayEnded: n };
}

export function reopenDay(day: Day): Day {
  return { ...day, dayEnded: null };
}

export function pause(day: Day, id: string, n: number): Day {
  return mapItem(day, id, (i) => (i.status === 'running' ? { status: 'paused', pausedAt: n } : {}));
}

/** Time paused so far, banked when a paused item resumes or ends (never negative). */
const pausedSoFar = (i: Item, n: number) => i.pausedFor + Math.max(0, n - i.pausedAt!);

export function resume(day: Day, id: string, n: number): Day {
  return mapItem(day, id, (i) =>
    i.status === 'paused' ? { status: 'running', pausedFor: pausedSoFar(i, n), pausedAt: null } : {},
  );
}

export function finish(day: Day, id: string, n: number): Day {
  return mapItem(day, id, (i) => ({
    status: 'done',
    endedAt: n,
    pausedFor: i.status === 'paused' ? pausedSoFar(i, n) : i.pausedFor,
    pausedAt: null,
  }));
}

// ---------- correcting recorded times ----------

/** A range of minutes into the day, inclusive. */
export type Range = [number, number];
const clamp = (v: number, [lo, hi]: Range) => Math.min(hi, Math.max(lo, v));

/** Items whose time is on the record: running, paused, done, or set aside part-way. */
const onRecord = (i: Item) => i.startedAt != null && (isActive(i) || i.status === 'done' || isPartial(i));

/**
 * How far an item's recorded start (and finish, once it has one) can be moved: not before the
 * item before it in time had finished, not past the start of the next one or `limit` (now, on
 * Today), with at least a minute worked. Each range always contains the value it has now.
 */
export function timeBounds(day: Day, id: string, n: number, limit: number): { start: Range; end: Range | null } | null {
  const it = find(day, id);
  if (!it || !onRecord(it)) return null;
  const s0 = it.startedAt!;
  const others = day.items.filter((i) => i.id !== id && onRecord(i));
  const endOf = (i: Item) => (isActive(i) ? n : (i.endedAt ?? i.startedAt!));
  const prevEnd = Math.max(0, ...others.filter((i) => i.startedAt! < s0).map(endOf));
  const nextStart = Math.min(limit, ...others.filter((i) => i.startedAt! > s0).map((i) => i.startedAt!));
  if (isActive(it)) {
    // Running or paused: it can't have started later than the time worked allows.
    const latest = (it.status === 'paused' ? it.pausedAt! : n) - it.pausedFor;
    return { start: [Math.min(prevEnd, s0), Math.max(s0, Math.min(latest, nextStart))], end: null };
  }
  const e0 = it.endedAt ?? s0;
  return {
    start: [Math.min(prevEnd, s0), Math.max(s0, e0 - 1)],
    end: [Math.min(s0 + 1, e0), Math.max(e0, nextStart)],
  };
}

/**
 * Correct when an item started or finished ("I actually started at 9:10"), within timeBounds.
 * A pause longer than the time left in between shrinks to fit, and a day can't have started
 * after its tasks did.
 */
export function retime(day: Day, id: string, t: { start?: number; end?: number }, n: number, limit: number): Day {
  const b = timeBounds(day, id, n, limit);
  const it = find(day, id);
  if (!b || !it) return day;
  const start = t.start != null ? clamp(Math.round(t.start), b.start) : it.startedAt!;
  const patch: Partial<Item> = { startedAt: start };
  if (b.end) {
    const end = t.end != null ? clamp(Math.round(t.end), b.end) : it.endedAt!;
    patch.endedAt = Math.max(end, start + 1);
    patch.pausedFor = Math.min(it.pausedFor, Math.max(0, patch.endedAt - start - 1));
  }
  const next = mapItem(day, id, () => patch);
  return day.dayStarted != null && start < day.dayStarted ? { ...next, dayStarted: start } : next;
}

/** When the day can be said to have started: not after its first task started, or `limit`. */
export function dayStartBounds(day: Day, limit: number): Range | null {
  if (day.dayStarted == null) return null;
  const first = Math.min(limit, ...day.items.filter(onRecord).map((i) => i.startedAt!));
  return [0, Math.max(day.dayStarted, first)];
}

/** Correct when the day started. */
export function retimeDay(day: Day, t: number, limit: number): Day {
  const b = dayStartBounds(day, limit);
  return b ? { ...day, dayStarted: clamp(Math.round(t), b) } : day;
}

/** "Mark done" on a missed item: logged at its planned slot, flagged as never timed. */
export function markDone(day: Day, id: string, start: number, end: number): Day {
  return mapItem(day, id, () => ({
    status: 'done',
    startedAt: start,
    endedAt: end,
    pausedFor: 0,
    pausedAt: null,
    marked: true,
  }));
}

export function reopen(day: Day, id: string): Day {
  return mapItem(day, id, () => ({
    status: 'todo',
    startedAt: null,
    endedAt: null,
    pausedAt: null,
    pausedFor: 0,
    marked: false,
  }));
}

export const skip = (day: Day, id: string) => patchItem(day, id, { status: 'skipped' });

export function remove(day: Day, id: string): Day {
  return { ...day, items: day.items.filter((i) => i.id !== id) };
}

/** Swap with the neighbour: the task sheet's ↑ Earlier / ↓ Later. */
export function move(day: Day, id: string, d: -1 | 1): Day {
  const a = [...day.items];
  const i = a.findIndex((x) => x.id === id),
    j = i + d;
  if (i < 0 || j < 0 || j >= a.length) return day;
  [a[i], a[j]] = [a[j], a[i]];
  return { ...day, items: a };
}

/** Drop the dragged item before index `over` (items.length = the end). */
export function reorder(day: Day, id: string, over: number): Day {
  const a = [...day.items];
  const from = a.findIndex((i) => i.id === id);
  if (from < 0) return day;
  const [x] = a.splice(from, 1);
  let to = over;
  if (to > from) to--;
  a.splice(to, 0, x);
  return { ...day, items: a };
}

export function setKind(day: Day, id: string, k: Kind): Day {
  return mapItem(day, id, (i) => ({
    kind: k,
    fixedAt: k === 'fixed' && i.fixedAt == null ? day.dayStart : i.fixedAt,
    hue: k === 'fixed' && i.hue === 'cyan' ? 'indigo' : i.hue,
  }));
}

/** Add an item at the end of the day, or a fixed one where its time falls (see placeFixed). */
export function addItem(day: Day, it: Item, n = 0): Day {
  const next = { ...day, items: [...day.items, it] };
  return it.kind === 'fixed' ? placeFixed(next, it.id, n) : next;
}

/**
 * Put a fixed item still to do where its time falls in the plan: in front of the first task
 * still to do that would end after that time (or fixed item that starts after it), so the
 * tasks before it fit and it keeps its time. Used when one is added, moved to another day, or
 * its time or type changes; dragging it, or others around it, is left alone.
 */
export function placeFixed(day: Day, id: string, n: number): Day {
  const it = find(day, id);
  if (!it || it.kind !== 'fixed' || it.fixedAt == null || it.status !== 'todo') return day;
  const t = it.fixedAt;
  const rest = day.items.filter((i) => i.id !== id);
  const after = schedule({ ...day, items: rest }, n).rows.find(
    (r) => r.it.status === 'todo' && !untimed(r.it.kind) && (r.it.kind === 'fixed' ? r.start > t : r.end > t + 0.5),
  );
  const at = after ? after.idx : rest.length;
  rest.splice(at, 0, it);
  return rest.every((x, k) => x === day.items[k]) ? day : { ...day, items: rest };
}

/** Remaining minutes for a remainder copy (never less than 5). */
const remainder = (it: Item, w: number) => Math.max(5, Math.round(it.min - w));

/** The rest of a task set aside part-way through, as a new task badged "continued". */
function restOf(it: Item, w: number): Item {
  return newItem({
    title: it.title,
    min: remainder(it, w),
    hue: it.hue,
    kind: it.kind === 'fixed' ? 'task' : it.kind,
    note: it.note,
    subtasks: it.subtasks,
    continued: true,
  });
}

/**
 * Postpone → Later today.
 * Not started: move to the end of the list.
 * Mid-task: the original becomes `postponed` (keeping its logged time) and a new item with
 * the remaining minutes is appended, badged "continued".
 */
export function postponeLater(day: Day, id: string, n: number): Day {
  const items = [...day.items];
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return day;
  const it = items[i];
  if (!isActive(it)) {
    items.splice(i, 1);
    items.push({ ...it, status: 'todo' });
    return { ...day, items };
  }
  const pf = it.status === 'paused' ? pausedSoFar(it, n) : it.pausedFor;
  const w = n - it.startedAt! - pf;
  items[i] = { ...it, status: 'postponed', endedAt: n, pausedFor: pf, pausedAt: null, laterCopy: true };
  items.push(restOf(it, w));
  return { ...day, items };
}

/**
 * Move an item to another day (Postpone → Tomorrow, Reschedule → Another day).
 * Returns the updated source day and the copy to append to the target day.
 * Mid-task, the source keeps its logged time and only the remaining minutes move.
 */
export function moveOut(day: Day, id: string, toKey: string, n: number): { day: Day; copy: Item } | null {
  const it = find(day, id);
  if (!it) return null;
  if (isActive(it)) {
    const pf = it.status === 'paused' ? pausedSoFar(it, n) : it.pausedFor;
    const w = n - it.startedAt! - pf;
    const copy = freshCopy(it, {
      min: remainder(it, w),
      kind: it.kind === 'fixed' ? 'task' : it.kind,
      continued: true,
    });
    copy.subtasks = it.subtasks.map((x) => ({ ...x }));
    return {
      day: mapItem(day, id, () => ({
        status: 'postponed',
        endedAt: n,
        pausedFor: pf,
        pausedAt: null,
        movedKey: toKey,
        movedId: copy.id,
      })),
      copy,
    };
  }
  const copy = freshCopy(it);
  return {
    day: mapItem(day, id, () => ({
      status: 'postponed',
      startedAt: null,
      endedAt: null,
      pausedAt: null,
      pausedFor: 0,
      movedKey: toKey,
      movedId: copy.id,
    })),
    copy,
  };
}

/** Undo a skip or a move. The caller removes the moved copy from its day. */
export function restore(day: Day, id: string): Day {
  return mapItem(day, id, () => ({ status: 'todo', movedKey: null, movedId: null }));
}

/**
 * Reschedule → Start now / Do it next.
 * With something running or paused, the item goes right after it ("do it next"). Otherwise the
 * caller starts it, and starting moves it to the current point in the plan.
 */
export function reschedNow(day: Day, id: string): { day: Day; start: boolean } {
  if (!find(day, id)) return { day, start: false };
  const act = activeItem(day);
  if (!act) return { day, start: true };
  const items = day.items.filter((i) => i.id !== id);
  items.splice(items.findIndex((i) => i.id === act.id) + 1, 0, find(day, id)!);
  return { day: { ...day, items }, start: false };
}

/** Reschedule → Later today: before the first pending, non-fixed item that starts at or after `tm`. */
export function reschedLater(day: Day, id: string, tm: number, n: number): Day {
  const it = find(day, id);
  if (!it) return day;
  if (tm < n) tm = n;
  const rows = schedule(day, n).rows;
  const items = day.items.filter((i) => i.id !== id);
  const tg = rows.find(
    (r) => r.it.id !== id && r.it.status === 'todo' && r.it.kind !== 'fixed' && r.end > n && r.start >= tm - 1,
  );
  const at = tg ? items.findIndex((i) => i.id === tg.it.id) : items.length;
  items.splice(at, 0, it);
  return { ...day, items };
}

export function clearDay(day: Day): Day {
  return { ...day, items: [], dayStarted: null };
}
