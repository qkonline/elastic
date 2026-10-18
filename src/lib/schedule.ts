import type { Day, Item } from './types';
import { untimed } from './types';

export interface Row {
  it: Item;
  idx: number;
  start: number;
  end: number;
  /** Idle minutes between the previous item's end and this item's actual start. */
  gap: number;
  /** An open item overlaps the next pending fixed item. */
  runsInto?: boolean;
  /** An open item ends after the wrap-up time. */
  pastEnd?: boolean;
  /** A fixed item that starts later than its set time, because of what's planned before it. */
  moved?: boolean;
}

export const isActive = (it: Item) => it.status === 'running' || it.status === 'paused';

/** Postponed after some work was logged (its time stays on the timeline). */
export const isPartial = (it: Item) => it.status === 'postponed' && it.startedAt != null;

/**
 * Minutes actually worked on an item at time `n`. Timestamps are wall-clock minutes, so a timer
 * running across a clock change (around 2 am, twice a year) is off by that hour; the floor at
 * zero keeps the fall-back case from going negative.
 */
export function worked(it: Item, n: number): number {
  if (untimed(it.kind)) return 0; // ticked off, never timed
  const s = it.status;
  let w = 0;
  if (s === 'running') w = n - it.startedAt! - it.pausedFor;
  else if (s === 'paused') w = it.pausedAt! - it.startedAt! - it.pausedFor;
  else if (s === 'done' || isPartial(it)) w = (it.endedAt ?? it.startedAt!) - it.startedAt! - it.pausedFor;
  return Math.max(0, w);
}

/** Minutes paused so far, including the current pause. */
export function pausedTotal(it: Item, n: number): number {
  return it.pausedFor + (it.status === 'paused' ? n - it.pausedAt! : 0);
}

/**
 * Walk the items in order and compute each one's start and end. Recomputed every tick.
 * Idle time does not slide the plan: when nothing runs, planned times stay put, and that
 * is how items become missed. A paused item does push everything after it later.
 *
 * A fixed item starts at its set time, or when the tasks lined up before it end, if that's
 * later (it's then `moved`). Only tasks still to do move it: with nothing lined up in front of
 * it (just what's done), or with a timer running or paused in front of it, it holds its time
 * and what overlaps it is flagged `runsInto`, since a meeting doesn't wait for whatever you've
 * just started.
 */
export function schedule(day: Day, n: number): { rows: Row[]; finish: number } {
  const started = day.dayStarted != null;
  let cur = started ? day.dayStarted! : day.dayStart;
  // Tasks left in front of everything that has happened were missed before the day started
  // (and kept as missed when another task was started): they stay where the plan had them.
  const first = day.items.findIndex((i) => i.status === 'done' || isActive(i) || isPartial(i));
  if (started && first > 0 && day.items.slice(0, first).some((i) => i.status === 'todo' && !untimed(i.kind)))
    cur = Math.min(day.dayStart, cur);
  // Idle time only counts once the day has started.
  const idle = (start: number) => start - Math.max(cur, started ? day.dayStarted! : cur);
  // Where the plan has got to, for placing fixed items: what's done, then the tasks lined up.
  // Since the last fixed item: `lined` once a task still to do has been counted, `timing` once
  // a running or paused item has.
  let plan = cur;
  let lined = false;
  let timing = false;

  const rows: Row[] = day.items.map((it, idx) => {
    let start: number,
      end: number,
      gap = 0;
    const s = it.status;
    // Checks (no duration) and skipped or moved items take no room in the plan.
    let moved = false;
    if (untimed(it.kind) || s === 'skipped' || (s === 'postponed' && !isPartial(it))) {
      start = end = cur;
    } else if (s === 'done' || isPartial(it)) {
      start = it.startedAt!;
      end = it.endedAt ?? start;
      gap = idle(start);
      cur = Math.max(cur, end);
      plan = Math.max(plan, end);
    } else if (s === 'running') {
      start = it.startedAt!;
      gap = idle(start);
      end = Math.max(n, start + it.min + it.pausedFor);
      cur = end;
      timing = true;
    } else if (s === 'paused') {
      start = it.startedAt!;
      gap = idle(start);
      end = n + Math.max(0, it.min - (it.pausedAt! - start - it.pausedFor));
      cur = end;
      timing = true;
    } else if (it.kind === 'fixed') {
      const at = it.fixedAt ?? cur;
      start = lined && !timing ? Math.max(at, plan) : at;
      moved = start > at + 0.5;
      end = start + it.min;
      cur = Math.max(cur, end);
      plan = end;
      lined = timing = false;
    } else {
      start = cur;
      end = start + it.min;
      cur = end;
      plan = timing ? cur : plan + it.min;
      lined = true;
    }
    return { it, idx, start, end, gap: gap >= 1 ? gap : 0, ...(moved ? { moved } : {}) };
  });

  // Warnings are about what's still to fit, so an ended day has none.
  const ended = day.dayEnded != null;
  rows.forEach((r, i) => {
    const open = !ended && !untimed(r.it.kind) && !['done', 'skipped', 'postponed'].includes(r.it.status);
    if (open && r.it.kind !== 'fixed') {
      const f = rows.slice(i + 1).find((x) => x.it.kind === 'fixed' && x.it.status === 'todo');
      if (f && r.end > f.start + 0.5 && r.start < f.end) r.runsInto = true;
    }
    if (open && r.end > day.wrap + 0.5) r.pastEnd = true;
  });

  const live = rows.filter((r) => r.it.status !== 'skipped');
  const finish = live.length ? Math.max(...live.map((r) => r.end)) : started ? n : day.dayStart;
  return { rows, finish };
}

/** A todo item whose planned end has passed (today only). Checks are never missed. */
export const isMissed = (r: Row, n: number) => !untimed(r.it.kind) && r.it.status === 'todo' && r.end <= n + 1e-6;

export interface DayStats {
  tasks: number;
  tasksDone: number;
  /** Minutes worked. */
  logged: number;
  checks: number;
  checksDone: number;
}

/** What a day adds up to. Skipped items and ones moved to another day don't count. */
export function dayStats(day: Day, n: number): DayStats {
  const counts = (i: Item) => i.status !== 'skipped' && !(i.status === 'postponed' && !isPartial(i));
  const tasks = day.items.filter((i) => !untimed(i.kind) && i.kind !== 'buffer' && counts(i));
  const checks = day.items.filter((i) => i.kind === 'check' && counts(i));
  return {
    tasks: tasks.length,
    tasksDone: tasks.filter((i) => i.status === 'done' || isPartial(i)).length,
    logged: day.items.reduce((sum, i) => sum + worked(i, n), 0),
    checks: checks.length,
    checksDone: checks.filter((i) => i.status === 'done').length,
  };
}
