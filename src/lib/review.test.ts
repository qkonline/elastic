import { describe, expect, it } from 'vitest';
import { newItem } from './actions';
import { addQuarters, goalProgress, quarterLabel, quarterOf, quarterRange, suggestStatus } from './goals';
import { habitDefaults } from './habits';
import { dueQuarterly, dueWeekly, reviewNumbers, weekId, weekSpan } from './review';
import type { Day, Goal, Review } from './types';

const day = (key: string, items: Day['items'], extra: Partial<Day> = {}): Day => ({
  key,
  dayStart: 540,
  wrap: 1020,
  dayStarted: 540,
  items,
  ...extra,
});
const lookup = (days: Day[]) => (k: string) => days.find((d) => d.key === k);
const done = (title: string, hue: 'orange' | 'cyan', from: number, to: number, extra = {}) =>
  newItem({ title, hue, min: to - from, status: 'done', startedAt: from, endedAt: to, ...extra });

describe('quarters', () => {
  it('works out calendar quarters', () => {
    expect(quarterOf('2026-10-18')).toBe('2026-Q4');
    expect(quarterRange('2026-Q4')).toEqual(['2026-10-01', '2026-12-31']);
    expect(quarterRange('2026-Q1')).toEqual(['2026-01-01', '2026-03-31']);
    expect(addQuarters('2026-Q4', 1)).toBe('2027-Q1');
    expect(addQuarters('2026-Q1', -1)).toBe('2025-Q4');
    expect(quarterLabel('2026-Q4')).toBe('Oct–Dec 2026');
  });
});

describe('goalProgress', () => {
  const goal: Goal = {
    id: 'g1',
    quarter: '2026-Q4',
    title: 'Launch',
    why: '',
    target: null,
    milestones: [
      { id: 'a', t: 'Landing page', done: true },
      { id: 'b', t: 'First customer', done: false },
    ],
    status: 'open',
    order: 0,
  };
  it('counts milestones, linked time and linked habit days', () => {
    const days = [
      day('2026-10-05', [
        done('Build', 'orange', 540, 600, { goalId: 'g1' }),
        done('Other', 'cyan', 600, 630),
        newItem({ title: 'Post', min: 0, kind: 'habit', habit: habitDefaults('check'), status: 'done', goalId: 'g1' }),
      ]),
      day('2026-09-30', [done('Old', 'orange', 540, 600, { goalId: 'g1' })]),
    ];
    const p = goalProgress(goal, lookup(days), '2026-10-18', 600);
    expect(p).toEqual({ share: 0.5, minutes: 60, habitDays: 1, milestones: [1, 2] });
    expect(suggestStatus(p)).toBe('partly');
    const numbered = { ...goal, target: { now: 5000, goal: 5000, unit: '$' } };
    expect(suggestStatus(goalProgress(numbered, lookup(days), '2026-10-18', 600))).toBe('hit');
  });
});

describe('reviewNumbers', () => {
  it('adds up the week', () => {
    const days = [
      day('2026-10-12', [
        done('Write', 'orange', 540, 660),
        done('Email', 'cyan', 660, 690),
        newItem({ title: 'Call', min: 30, status: 'postponed', movedKey: '2026-10-13' }),
        newItem({ title: 'Mail', min: 0, kind: 'check', status: 'done' }),
      ]),
      day('2026-10-13', [done('Write', 'orange', 540, 1100), newItem({ title: 'Call', min: 30 })], { dayEnded: 1100 }),
    ];
    const n = reviewNumbers(lookup(days), '2026-10-12', '2026-10-18', '2026-10-18', 600);
    expect(n).toMatchObject({
      days: 7,
      daysStarted: 2,
      tasks: 4,
      tasksDone: 3,
      logged: 710,
      checks: 1,
      checksDone: 1,
      postponed: [{ title: 'Call', times: 1 }],
      longDays: 1,
    });
    expect(n.byHue).toEqual([
      { hue: 'orange', min: 680 },
      { hue: 'cyan', min: 30 },
    ]);
  });
});

describe('when reviews are due', () => {
  const rev = (id: string): Review => ({ id, kind: 'week', from: '', to: '', done: 1, numbers: null, goals: [] });
  it('brings up the week at its day and time, until it is done', () => {
    // Sunday 6 pm; 2026-10-18 is a Sunday.
    expect(dueWeekly('2026-10-18', 17 * 60, 0, 18 * 60, [])?.id).not.toBe(weekId('2026-10-18'));
    expect(dueWeekly('2026-10-18', 18 * 60, 0, 18 * 60, [])).toEqual({
      id: '2026-W42',
      kind: 'week',
      from: '2026-10-12',
      to: '2026-10-18',
    });
    expect(dueWeekly('2026-10-18', 18 * 60, 0, 18 * 60, [rev('2026-W42'), rev('2026-W41')])).toBeNull();
  });

  it('still offers last week for a week after its time', () => {
    expect(dueWeekly('2026-10-20', 600, 0, 18 * 60, [rev('2026-W41')])?.id).toBe('2026-W42');
    // Reviews on Mondays: on Sunday the 18th, last week's (Monday the 5th) is over a week old.
    expect(dueWeekly('2026-10-18', 600, 1, 9 * 60, [rev('2026-W42')])).toBeNull();
  });

  it('brings up the quarter at its end and the start of the next', () => {
    expect(dueQuarterly('2026-12-26', [])?.id).toBe('2026-Q4');
    expect(dueQuarterly('2026-12-20', [])).toBeNull();
    expect(dueQuarterly('2027-01-10', [])?.id).toBe('2026-Q4');
    expect(dueQuarterly('2027-01-10', [{ ...rev('2026-Q4'), kind: 'quarter' }])).toBeNull();
  });
});

describe('weekSpan', () => {
  it('names the days of a week, with both months when it spans two', () => {
    expect(weekSpan('2026-10-12', '2026-10-18')).toBe('12 to 18 Oct');
    expect(weekSpan('2026-09-28', '2026-10-04')).toBe('28 Sep to 4 Oct');
  });
});
