// Habits: how far one has got today, whether it's met, its streak and its history. A habit is a
// repeating series of kind 'habit' (see repeat.ts), so each day it's due has an item for it;
// what's done is read from those items. Days are looked up through `dayAt`, since history needs
// days that aren't loaded for the day screen.

import { seriesApplies } from './repeat';
import { worked } from './schedule';
import { addDays, dayDiff, keyDate, mondayOf } from './time';
import type { Day, Habit, Item, Series } from './types';

export type DayAt = (key: string) => Day | undefined;

export const isHabit = (it: Item): it is Item & { habit: Habit } => it.kind === 'habit' && !!it.habit;

/** A new habit's defaults for each type. */
export function habitDefaults(type: Habit['type']): Habit {
  return {
    type,
    target: type === 'amount' ? 8 : type === 'time' ? 30 : 1,
    unit: type === 'amount' ? 'times' : '',
    per: 'day',
    times: 3,
    remindAt: null,
  };
}

/**
 * How far it has got on `day` (at `n`, minutes into that day): ticked (1) or not, the amount,
 * minutes (added by hand plus timed tasks that count towards it), or slips for a habit to break.
 */
export function habitValue(day: Day, it: Item, n: number): number {
  const h = it.habit;
  if (!h) return 0;
  if (h.type === 'check') return it.status === 'done' ? 1 : 0;
  if (h.type === 'quit') return it.progress ? 1 : 0;
  if (h.type === 'amount') return it.progress ?? 0;
  const linked = it.seriesId ? day.items.filter((i) => i.habitId === it.seriesId) : [];
  return (it.progress ?? 0) + linked.reduce((sum, i) => sum + worked(i, n), 0);
}

/** Done for the day. A habit to break counts as met while there's no slip. */
export function habitMet(day: Day, it: Item, n: number): boolean {
  const h = it.habit;
  if (!h || it.status === 'skipped') return false;
  if (h.type === 'quit') return !it.progress;
  return habitValue(day, it, n) >= Math.max(1, h.target);
}

/** "6 of 8 glasses", "20 of 30 min": the line under a habit with a target. */
export function progressText(day: Day, it: Item, n: number): string {
  const h = it.habit;
  if (!h || h.type === 'check' || h.type === 'quit') return '';
  const v = Math.floor(habitValue(day, it, n));
  return h.type === 'time' ? `${v} of ${h.target} min` : `${v} of ${h.target}${h.unit ? ' ' + h.unit : ''}`;
}

// ---------- periods (for habits due a number of times a week or month) ----------

export function periodStart(key: string, per: Habit['per']): string {
  if (per === 'week') return mondayOf(key);
  if (per === 'month') return key.slice(0, 8) + '01';
  return key;
}

export function periodEnd(key: string, per: Habit['per']): string {
  if (per === 'week') return addDays(mondayOf(key), 6);
  if (per === 'month') {
    const d = keyDate(key);
    return addDays(key.slice(0, 8) + '01', new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - 1);
  }
  return key;
}

/** The series' item on a day, if the day has one. */
const itemOn = (day: Day | undefined, sid: string) => day?.items.find((i) => i.seriesId === sid);

/** Minutes into `key` at `now` (ms): past days count as over. */
const nOf = (key: string, today: string, n: number) => (key === today ? n : key < today ? 1e6 : 0);

/** Days in `key`'s week or month, up to `upTo`, on which the habit was met. */
export function periodCount(dayAt: DayAt, s: Series, key: string, today: string, n: number, upTo = today): number {
  const per = s.habit?.per ?? 'day';
  let count = 0;
  for (let k = periodStart(key, per), end = periodEnd(key, per); k <= end && k <= upTo; k = addDays(k, 1)) {
    const d = dayAt(k);
    const it = itemOn(d, s.id);
    if (d && it && habitMet(d, it, nOf(k, today, n))) count++;
  }
  return count;
}

/** "2 of 3 this week". */
export function periodText(dayAt: DayAt, s: Series, key: string, today: string, n: number): string {
  const h = s.habit;
  if (!h || h.per === 'day') return '';
  return `${periodCount(dayAt, s, key, today, n)} of ${h.times} this ${h.per}`;
}

// ---------- streaks and history ----------

/** How far back a streak or history looks. */
const LOOKBACK = 400;

/**
 * The current streak: days in a row met (only days it's due count, and today counts once it's
 * met), weeks or months in a row with enough days, or for a habit to break, days since the last
 * slip. A skipped day doesn't break a streak.
 */
export function streak(dayAt: DayAt, s: Series, today: string, n: number): number {
  const h = s.habit;
  if (!h) return 0;
  const stop = s.from > addDays(today, -LOOKBACK) ? s.from : addDays(today, -LOOKBACK);
  if (h.type === 'quit') {
    let count = 0;
    for (let k = today; k >= stop; k = addDays(k, -1)) {
      if (itemOn(dayAt(k), s.id)?.progress) break;
      count++;
    }
    return count;
  }
  if (h.per !== 'day') {
    let count = 0;
    for (let k = today; periodEnd(k, h.per) >= stop; k = addDays(periodStart(k, h.per), -1)) {
      const met = periodCount(dayAt, s, k, today, n) >= h.times;
      const current = periodEnd(k, h.per) >= today;
      if (met) count++;
      else if (!current) break;
    }
    return count;
  }
  let count = 0;
  for (let k = today; k >= stop; k = addDays(k, -1)) {
    if (!seriesApplies(s, k)) continue;
    const d = dayAt(k);
    const it = itemOn(d, s.id);
    if (it?.status === 'skipped') continue;
    if (d && it && habitMet(d, it, nOf(k, today, n))) count++;
    else if (k !== today) break;
  }
  return count;
}

export type HistoryMark = 'met' | 'missed' | 'skipped' | 'today' | 'none';

/** What each day from `from` to `to` was for the habit (for the calendar in its sheet). */
export function history(dayAt: DayAt, s: Series, from: string, to: string, today: string, n: number): HistoryMark[] {
  const h = s.habit;
  const out: HistoryMark[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) {
    if (!h || k < s.from || (s.until && k > s.until) || k > today) {
      out.push('none');
      continue;
    }
    const d = dayAt(k);
    const it = itemOn(d, s.id);
    const due = h.per === 'day' && h.type !== 'quit' ? seriesApplies(s, k) : true;
    if (it?.status === 'skipped') out.push('skipped');
    else if (h.type === 'quit') out.push(it?.progress ? 'missed' : k === today ? 'today' : 'met');
    else if (d && it && habitMet(d, it, nOf(k, today, n))) out.push('met');
    else if (k === today) out.push('today');
    else out.push(due && h.per === 'day' ? 'missed' : 'none');
  }
  return out;
}

/**
 * How often it was met over the last `days` days, as a share (0–1) of the days (or weeks and
 * months) it was due. Today counts only once it's met. Null before there's anything to go by.
 */
export function completion(dayAt: DayAt, s: Series, today: string, n: number, days = 30): number | null {
  const h = s.habit;
  if (!h) return null;
  const from = s.from > addDays(today, -(days - 1)) ? s.from : addDays(today, -(days - 1));
  if (h.per !== 'day') {
    let due = 0,
      met = 0;
    for (let k = today; periodEnd(k, h.per) >= from; k = addDays(periodStart(k, h.per), -1)) {
      const ok = periodCount(dayAt, s, k, today, n) >= h.times;
      if (periodEnd(k, h.per) >= today && !ok) continue; // this week or month isn't over yet
      due++;
      if (ok) met++;
    }
    return due ? met / due : null;
  }
  const marks = history(dayAt, s, from, today, today, n);
  const met = marks.filter((m) => m === 'met').length;
  const due = met + marks.filter((m) => m === 'missed').length;
  return due ? met / due : null;
}

/** Days from `from` to `to`, inclusive (for the history calendar's layout). */
export const span = (from: string, to: string) => dayDiff(from, to) + 1;
