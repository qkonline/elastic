import { describe, expect, it } from 'vitest';
import { newItem, setProgress, tapHabit } from './actions';
import {
  completion,
  habitDefaults,
  habitMet,
  habitValue,
  history,
  periodCount,
  periodEnd,
  periodStart,
  progressText,
  streak,
} from './habits';
import { materialize, repeatMatches } from './repeat';
import { addDays } from './time';
import type { Day, Habit, Item, Series } from './types';

const TODAY = '2026-10-15'; // a Thursday
const series = (habit: Partial<Habit> & { type: Habit['type'] }, extra: Partial<Series> = {}): Series => ({
  id: 'h1',
  title: 'Meditate',
  min: 0,
  kind: 'habit',
  hue: 'lime',
  fixedAt: null,
  repeat: 'Every day',
  note: '',
  subtasks: [],
  from: '2026-09-01',
  until: null,
  order: 0,
  habit: { ...habitDefaults(habit.type), ...habit },
  ...extra,
});
const itemFor = (s: Series, extra: Partial<Item> = {}): Item =>
  newItem({ title: s.title, min: 0, kind: 'habit', seriesId: s.id, habit: s.habit, repeat: s.repeat, ...extra });
const dayWith = (key: string, items: Item[]): Day => ({ key, dayStart: 540, wrap: 1020, dayStarted: 540, items });

/** Days keyed by date, with the habit done (or not) on each. */
function days(s: Series, done: Record<string, Partial<Item>>): (k: string) => Day | undefined {
  const map = new Map(Object.entries(done).map(([k, extra]) => [k, dayWith(k, [itemFor(s, extra)])]));
  return (k) => map.get(k);
}
const DONE = { status: 'done' as const };

describe('habit progress', () => {
  it('adds to an amount and is met at the target', () => {
    const s = series({ type: 'amount', target: 3, unit: 'glasses' });
    let d = dayWith(TODAY, [itemFor(s)]);
    const id = d.items[0].id;
    d = tapHabit(d, id, 600);
    d = tapHabit(d, id, 600);
    expect(progressText(d, d.items[0], 600)).toBe('2 of 3 glasses');
    expect(habitMet(d, d.items[0], 600)).toBe(false);
    d = tapHabit(d, id, 600);
    expect(habitMet(d, d.items[0], 600)).toBe(true);
    expect(d.items[0].status).toBe('done');
    d = setProgress(d, id, 1, 600);
    expect(d.items[0].status).toBe('todo');
  });

  it('counts timed tasks towards a time habit, plus minutes added by hand', () => {
    const s = series({ type: 'time', target: 30 });
    const read = newItem({ title: 'Read', min: 20, status: 'done', startedAt: 600, endedAt: 620, habitId: 'h1' });
    const d = dayWith(TODAY, [itemFor(s, { progress: 5 }), read]);
    expect(habitValue(d, d.items[0], 700)).toBe(25);
    expect(progressText(d, d.items[0], 700)).toBe('25 of 30 min');
    const running = { ...read, status: 'running' as const, endedAt: null };
    expect(habitValue({ ...d, items: [d.items[0], running] }, d.items[0], 630)).toBe(35);
  });

  it('ticks a yes/no habit and marks a slip on one to break', () => {
    const yes = series({ type: 'check' });
    let d = dayWith(TODAY, [itemFor(yes)]);
    d = tapHabit(d, d.items[0].id, 600);
    expect(habitMet(d, d.items[0], 600)).toBe(true);
    const quit = series({ type: 'quit' });
    let q = dayWith(TODAY, [itemFor(quit)]);
    expect(habitMet(q, q.items[0], 600)).toBe(true);
    q = tapHabit(q, q.items[0].id, 600);
    expect(habitMet(q, q.items[0], 600)).toBe(false);
  });
});

describe('streaks', () => {
  it('counts days in a row, with today counting once it is done', () => {
    const s = series({ type: 'check' });
    const at = days(s, { '2026-10-12': DONE, '2026-10-13': DONE, '2026-10-14': DONE, [TODAY]: {} });
    expect(streak(at, s, TODAY, 600)).toBe(3);
    const done = days(s, { '2026-10-13': DONE, '2026-10-14': DONE, [TODAY]: DONE });
    expect(streak(done, s, TODAY, 600)).toBe(3);
  });

  it('breaks on a missed day, but not on a skipped one or a day it is not due', () => {
    const s = series({ type: 'check' });
    expect(streak(days(s, { '2026-10-12': DONE, '2026-10-14': DONE }), s, TODAY, 600)).toBe(1);
    const skipped = days(s, { '2026-10-12': DONE, '2026-10-13': { status: 'skipped' }, '2026-10-14': DONE });
    expect(streak(skipped, s, TODAY, 600)).toBe(2);
    const weekdays = series({ type: 'check' }, { repeat: 'Every Monday, Wednesday' });
    expect(streak(days(weekdays, { '2026-10-12': DONE, '2026-10-14': DONE }), weekdays, TODAY, 600)).toBe(2);
  });

  it('counts weeks in a row for a habit due a number of times a week', () => {
    const s = series({ type: 'check', per: 'week', times: 2 });
    const at = days(s, {
      '2026-09-29': DONE,
      '2026-10-01': DONE, // week of Sep 28: 2
      '2026-10-06': DONE,
      '2026-10-08': DONE, // week of Oct 5: 2
      '2026-10-13': DONE, // this week: 1 so far, not over yet
    });
    expect(periodCount(at, s, TODAY, TODAY, 600)).toBe(1);
    expect(streak(at, s, TODAY, 600)).toBe(2);
  });

  it('counts clean days for a habit to break', () => {
    const s = series({ type: 'quit' }, { from: '2026-10-01' });
    expect(streak(days(s, {}), s, TODAY, 600)).toBe(15);
    expect(streak(days(s, { '2026-10-10': { progress: 1 } }), s, TODAY, 600)).toBe(5);
  });
});

describe('history and completion', () => {
  it('marks each day met, missed, skipped or not due', () => {
    const s = series({ type: 'check' }, { from: '2026-10-12' });
    const at = days(s, { '2026-10-12': DONE, '2026-10-14': { status: 'skipped' } });
    expect(history(at, s, '2026-10-11', '2026-10-16', TODAY, 600)).toEqual([
      'none',
      'met',
      'missed',
      'skipped',
      'today',
      'none',
    ]);
    expect(completion(at, s, TODAY, 600)).toBe(0.5);
  });
});

describe('periods', () => {
  it('runs weeks Monday to Sunday and months by the calendar', () => {
    expect([periodStart(TODAY, 'week'), periodEnd(TODAY, 'week')]).toEqual(['2026-10-12', '2026-10-18']);
    expect([periodStart(TODAY, 'month'), periodEnd(TODAY, 'month')]).toEqual(['2026-10-01', '2026-10-31']);
    expect(periodEnd('2026-02-10', 'month')).toBe('2026-02-28');
  });
});

describe('repeating on chosen weekdays', () => {
  it('matches each of several days', () => {
    const r = 'Every Monday, Wednesday, Friday';
    const week = Array.from({ length: 7 }, (_, i) => addDays('2026-10-12', i));
    expect(week.filter((k) => repeatMatches(r, k))).toEqual(['2026-10-12', '2026-10-14', '2026-10-16']);
    expect(repeatMatches('Every Monday', '2026-10-12')).toBe(true);
  });

  it("builds a day's habit items with their settings", () => {
    const s = series({ type: 'amount', target: 8, unit: 'glasses' });
    const d = materialize(TODAY, [s], 540, 1020, TODAY);
    expect(d.items[0]).toMatchObject({ kind: 'habit', min: 0, seriesId: 'h1', habit: { target: 8 } });
  });
});
