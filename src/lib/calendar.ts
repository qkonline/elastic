// What the week and month views show for a day: its timed tasks where the plan puts them, how
// much is planned and logged, and how its checks and habits went. Pure, from schedule().

import { habitMet, isHabit } from './habits';
import { isActive, isMissed, isPartial, schedule, worked } from './schedule';
import type { Day, Item } from './types';
import { untimed } from './types';

export type CalState = 'todo' | 'done' | 'running' | 'missed' | 'partial';

export interface CalRow {
  it: Item;
  start: number;
  end: number;
  state: CalState;
}

/** A task moved to another day without any work on it isn't shown (it's on that day now). */
const shown = (it: Item) => it.status !== 'skipped' && !(it.status === 'postponed' && !isPartial(it));

/**
 * The day's timed tasks with their place in the plan (`plan` is the day as the plan sees it,
 * see Planner.planOf), at `n` minutes into that day.
 */
export function calendarRows(plan: Day, n: number): CalRow[] {
  return schedule(plan, n)
    .rows.filter((r) => !untimed(r.it.kind) && shown(r.it))
    .map((r) => ({
      it: r.it,
      start: r.start,
      end: Math.max(r.end, r.start + 1),
      state: isActive(r.it)
        ? 'running'
        : r.it.status === 'done'
          ? 'done'
          : isPartial(r.it)
            ? 'partial'
            : isMissed(r, n) && plan.dayEnded == null
              ? 'missed'
              : 'todo',
    }));
}

/** Minutes planned (timed tasks, not buffers) and logged on the day. */
export function dayTotals(day: Day, n: number): { planned: number; logged: number } {
  let planned = 0,
    logged = 0;
  for (const it of day.items) {
    if (untimed(it.kind) || !shown(it)) continue;
    logged += worked(it, n);
    if (it.kind !== 'buffer') planned += it.status === 'done' || isPartial(it) ? Math.max(worked(it, n), 0) : it.min;
  }
  return { planned, logged };
}

/** Checks ticked and habits kept, out of how many the day has. */
export function untimedCounts(day: Day, n: number) {
  const checks = day.items.filter((i) => i.kind === 'check' && i.status !== 'skipped');
  const habits = day.items.filter((i) => isHabit(i) && i.status !== 'skipped');
  return {
    checks: checks.length,
    checksDone: checks.filter((i) => i.status === 'done').length,
    habits: habits.length,
    habitsMet: habits.filter((i) => habitMet(day, i, n)).length,
  };
}

/** The hours a week grid spans: from the earliest start to the latest end, at least 8 to 6. */
export function axis(rowsByDay: CalRow[][], from = 8 * 60, to = 18 * 60): [number, number] {
  let a = from,
    b = to;
  for (const rows of rowsByDay)
    for (const r of rows) {
      a = Math.min(a, r.start);
      b = Math.max(b, r.end);
    }
  return [Math.max(0, Math.floor(a / 60) * 60), Math.ceil(b / 60) * 60];
}
