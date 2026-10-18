import { describe, expect, it } from 'vitest';
import { newItem } from './actions';
import { axis, calendarRows, dayTotals, untimedCounts } from './calendar';
import { habitDefaults } from './habits';
import type { Day } from './types';

const day = (items: Day['items'], extra: Partial<Day> = {}): Day => ({
  key: '2026-10-15',
  dayStart: 540,
  wrap: 1020,
  dayStarted: 540,
  items,
  ...extra,
});

describe('calendarRows', () => {
  it('places timed tasks and says how each went, leaving checks and habits out', () => {
    const d = day([
      newItem({ title: 'Done', min: 30, status: 'done', startedAt: 540, endedAt: 570 }),
      newItem({ title: 'Running', min: 60, status: 'running', startedAt: 570 }),
      newItem({ title: 'Check', min: 0, kind: 'check' }),
      newItem({ title: 'Later', min: 30 }),
      newItem({ title: 'Moved', min: 30, status: 'postponed', movedKey: '2026-10-16' }),
    ]);
    const rows = calendarRows(d, 600);
    expect(rows.map((r) => [r.it.title, r.state, r.start])).toEqual([
      ['Done', 'done', 540],
      ['Running', 'running', 570],
      ['Later', 'todo', 630],
    ]);
  });

  it('marks what was missed', () => {
    const d = day([newItem({ title: 'Early', min: 30 })], { dayStarted: null });
    expect(calendarRows(d, 700)[0].state).toBe('missed');
  });
});

describe('dayTotals and untimedCounts', () => {
  it('adds up what was planned and logged, and how the checklist went', () => {
    const d = day([
      newItem({ title: 'Done', min: 30, status: 'done', startedAt: 540, endedAt: 580 }),
      newItem({ title: 'Later', min: 60 }),
      newItem({ title: 'Breather', min: 15, kind: 'buffer' }),
      newItem({ title: 'Check', min: 0, kind: 'check', status: 'done' }),
      newItem({ title: 'Water', min: 0, kind: 'habit', habit: habitDefaults('check'), status: 'done' }),
      newItem({ title: 'Read', min: 0, kind: 'habit', habit: habitDefaults('check') }),
    ]);
    expect(dayTotals(d, 600)).toEqual({ planned: 100, logged: 40 });
    expect(untimedCounts(d, 600)).toEqual({ checks: 1, checksDone: 1, habits: 2, habitsMet: 1 });
  });
});

describe('axis', () => {
  it('spans at least 8 to 6, stretched to whole hours around what is planned', () => {
    expect(axis([])).toEqual([480, 1080]);
    const rows = [[{ it: newItem({ title: 'x' }), start: 430, end: 1150, state: 'todo' as const }]];
    expect(axis(rows)).toEqual([420, 1200]);
  });
});
