import { describe, expect, it } from 'vitest';
import { newItem } from './actions';
import { parseBackup } from './backup';
import {
  materialize,
  orderAt,
  orderNextTo,
  orderSeries,
  placeBySeries,
  repeatMatches,
  seriesFromItem,
  syncSeriesInto,
  withoutSeries,
} from './repeat';
import type { Day, Item, Series } from './types';

// 2026-09-25 is a Friday.
describe('repeat rules', () => {
  it('matches every day, weekdays and a named weekday', () => {
    expect(repeatMatches('Every day', '2026-09-26')).toBe(true);
    expect(repeatMatches('Weekdays', '2026-09-25')).toBe(true);
    expect(repeatMatches('Weekdays', '2026-09-26')).toBe(false);
    expect(repeatMatches('Every Friday', '2026-10-02')).toBe(true);
    expect(repeatMatches('Every Friday', '2026-10-01')).toBe(false);
  });

  it('builds today and later days from active series only', () => {
    const s = seriesFromItem(
      newItem({ title: 'Standup', repeat: 'Weekdays', kind: 'fixed', fixedAt: 570 }),
      '2026-09-25',
      'S1',
    );
    expect(materialize('2026-09-28', [s], 540, 1020, '2026-09-25').items).toMatchObject([
      { title: 'Standup', seriesId: 'S1', fixedAt: 570 },
    ]);
    expect(materialize('2026-09-24', [s], 540, 1020, '2026-09-25').items).toEqual([]); // past
    expect(materialize('2026-09-27', [s], 540, 1020, '2026-09-25').items).toEqual([]); // Sunday
    const ended = { ...s, until: '2026-09-29' };
    expect(materialize('2026-09-30', [ended], 540, 1020, '2026-09-25').items).toEqual([]);
  });

  it('syncs a changed series into a stored later day without touching started copies', () => {
    const s = seriesFromItem(newItem({ title: 'Email', repeat: 'Every day', min: 45 }), '2026-09-25', 'S1');
    const empty: Day = { key: '2026-09-28', dayStart: 540, wrap: 1020, dayStarted: null, items: [] };
    const added = syncSeriesInto(empty, s, null, 'S1');
    expect(added.items).toMatchObject([{ title: 'Email', min: 45 }]);
    const renamed = syncSeriesInto(added, { ...s, title: 'Inbox', min: 30 }, s, 'S1');
    expect(renamed.items).toMatchObject([{ title: 'Inbox', min: 30 }]);
    const done = { ...renamed, items: [{ ...renamed.items[0], status: 'done' as const }] };
    expect(syncSeriesInto(done, { ...s, title: 'X' }, s, 'S1')).toBe(done);
    expect(syncSeriesInto(renamed, { ...s, until: '2026-09-27' }, s, 'S1').items).toEqual([]);
  });

  it('does not bring back a copy the user deleted from one day', () => {
    const s = seriesFromItem(newItem({ title: 'Gym', repeat: 'Every day' }), '2026-09-25', 'S1');
    const deleted: Day = { key: '2026-09-27', dayStart: 540, wrap: 1020, dayStarted: null, items: [] };
    expect(syncSeriesInto(deleted, { ...s, min: 45 }, s, 'S1').items).toEqual([]);
    // ...but a rule change that newly covers the day does add it.
    const weekdays = { ...s, repeat: 'Weekdays' };
    const monday = { ...deleted, key: '2026-09-28' };
    expect(syncSeriesInto(monday, weekdays, { ...s, repeat: 'Every Sunday' }, 'S1').items).toHaveLength(1);
  });

  it('takes a deleted series off a later day, leaving copies that were worked on or moved', () => {
    const gym = (status: Item['status']) => ({
      ...newItem({ title: 'Gym', repeat: 'Every day' }),
      seriesId: 'S1',
      status,
    });
    const other = newItem({ title: 'Other' });
    const day: Day = { key: '2026-09-27', dayStart: 540, wrap: 1020, dayStarted: null, items: [gym('todo'), other] };
    expect(withoutSeries(day, 'S1').items).toEqual([other]);
    expect(withoutSeries({ ...day, items: [gym('skipped')] }, 'S1').items).toEqual([]);
    const moved = { ...day, items: [gym('postponed'), other] };
    expect(withoutSeries(moved, 'S1')).toBe(moved);
  });

  it('keeps step ids unique when steps share the same text', () => {
    const it = newItem({
      title: 'Workout',
      repeat: 'Every day',
      subtasks: [
        { id: 'a', t: 'Push-ups', d: false },
        { id: 'b', t: 'Squats', d: false },
        { id: 'c', t: 'Push-ups', d: false },
      ],
    });
    const s = seriesFromItem(it, '2026-09-25', 'S1');
    const day: Day = {
      key: '2026-09-28',
      dayStart: 540,
      wrap: 1020,
      dayStarted: null,
      items: [{ ...it, seriesId: 'S1' }],
    };
    const out = syncSeriesInto(day, { ...s, min: 20 }, s, 'S1');
    const ids = out.items[0].subtasks.map((x) => x.id);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('backup parsing', () => {
  it('rejects non-JSON and foreign files', () => {
    expect(parseBackup('nope')).toEqual({ error: 'Could not read that file.' });
    expect(parseBackup('{"app":"other"}')).toEqual({ error: 'That file is not an Elastic backup.' });
  });

  it('reads an older single-day (version 1) export', () => {
    const r = parseBackup(
      JSON.stringify({
        app: 'elastic-day',
        version: 1,
        items: [{ title: 'A', min: 20, status: 'stopped', repeat: 'Weekdays' }],
        dayStart: 480,
      }),
    );
    expect(r).toMatchObject({
      kind: 'day',
      dayStart: 480,
      wrap: 1020,
      items: [{ title: 'A', min: 20, status: 'done', repeat: 'Once' }],
    });
  });

  it('reads a full export and drops malformed days', () => {
    const r = parseBackup(
      JSON.stringify({
        app: 'elastic-day',
        version: 2,
        settings: { clock24: true },
        series: [],
        days: [{ key: '2026-09-25', items: [{ title: 'A' }] }, { key: 'bad' }],
      }),
    );
    expect(r).toMatchObject({
      kind: 'full',
      settings: { clock24: true, themePref: 'match' },
      days: [{ key: '2026-09-25' }],
    });
  });

  it('drops malformed series and settings instead of letting them break the app', () => {
    const r = parseBackup(
      JSON.stringify({
        app: 'elastic-day',
        version: 2,
        settings: { defStart: '09:00', themePref: 'neon', clock24: true },
        series: [{ id: 'x', title: 'X', repeat: 'Every day', from: '2020-01-01' }, { id: 'y' }],
        days: [
          {
            key: '2026-09-25',
            items: [
              { title: 'A', status: 'running' },
              { title: 'B', status: 'running', startedAt: 600 },
              { title: 'C', status: 'paused', startedAt: 610, pausedAt: 620 },
            ],
          },
        ],
      }),
    );
    if (!('kind' in r) || r.kind !== 'full') throw new Error('expected a full backup');
    expect(r.settings).toMatchObject({ defStart: 540, themePref: 'match', clock24: true, fixedLead: 5 });
    expect(r.series).toHaveLength(1);
    expect(r.series[0].subtasks).toEqual([]);
    // One timer a day: the one started last keeps going, the other is set aside from then.
    expect(r.days[0].items.map((i) => i.status)).toEqual(['todo', 'postponed', 'paused']);
    expect(r.days[0].items[1].endedAt).toBe(610);
  });

  it('renumbers duplicate step ids on import', () => {
    const r = parseBackup(
      JSON.stringify({
        app: 'elastic-day',
        items: [
          {
            title: 'A',
            subtasks: [
              { id: 's', t: 'one' },
              { id: 's', t: 'two' },
            ],
          },
        ],
      }),
    );
    if (!('kind' in r) || r.kind !== 'day') throw new Error('expected a day backup');
    const ids = r.items[0].subtasks.map((x) => x.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('order of repeating tasks', () => {
  const S = (title: string, order: number): Series =>
    seriesFromItem(newItem({ title, repeat: 'Every day' }), '2026-09-25', title, order);
  const titles = (d: Day) => d.items.map((i) => i.title);

  it('builds later days in the series order, not the order they were saved in', () => {
    expect(titles(materialize('2026-09-26', [S('B', 2), S('A', 1), S('C', 3)], 540, 1020, '2026-09-25'))).toEqual([
      'A',
      'B',
      'C',
    ]);
  });

  it('gives series saved without an order the order of a stored day', () => {
    const [a, b, c] = [S('A', NaN), S('B', NaN), S('C', NaN)];
    const day: Day = {
      key: '2026-09-25',
      dayStart: 540,
      wrap: 1020,
      dayStarted: 540,
      items: [itemOf(b), newItem({ title: 'one-off' }), itemOf(a)],
    };
    const out = orderSeries([a, b, c], day);
    expect(titles(materialize('2026-09-26', out, 540, 1020, '2026-09-25'))).toEqual(['B', 'A', 'C']);
    const ordered = [S('A', 0)];
    expect(orderSeries(ordered, day)).toBe(ordered);
  });

  it('places a series right before or after another', () => {
    const list = [S('A', 1), S('B', 2), S('C', 3)];
    expect(orderNextTo(list, 'C', 'A', 'before')).toBe(0);
    expect(orderNextTo(list, 'C', 'A', 'after')).toBe(1.5);
    expect(orderNextTo(list, 'A', 'C', 'after')).toBe(4);
  });

  it('puts a task that starts repeating after the repeating task above it', () => {
    const list = [S('A', 1), S('B', 2)];
    const items = [itemOf(list[0]), newItem({ title: 'new', id: 'n' }), itemOf(list[1])];
    expect(orderAt(list, items, 'n')).toBe(1.5);
    expect(orderAt([], [newItem({ title: 'n', id: 'n' })], 'n')).toBe(0);
  });

  it('moves a task on a stored later day to where its order says, around one-off tasks', () => {
    const list = [S('A', 1), S('B', 0.5), S('C', 3)];
    const day: Day = {
      key: '2026-09-27',
      dayStart: 540,
      wrap: 1020,
      dayStarted: null,
      items: [itemOf(list[0]), newItem({ title: 'one-off' }), itemOf(list[1]), itemOf(list[2])],
    };
    expect(titles(placeBySeries(day, 'B', list))).toEqual(['B', 'A', 'one-off', 'C']);
    const last = [S('A', 1), S('B', 9)];
    const d2: Day = { ...day, items: [itemOf(last[1]), itemOf(last[0]), newItem({ title: 'one-off' })] };
    expect(titles(placeBySeries(d2, 'B', last))).toEqual(['A', 'B', 'one-off']);
  });
});

function itemOf(s: Series) {
  return newItem({ title: s.title, repeat: s.repeat, seriesId: s.id });
}
