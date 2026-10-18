import { describe, expect, it } from 'vitest';
import { newItem } from './actions';
import { mergeDay, mergeSettings } from './merge';
import type { Day, Item } from './types';

const it_ = (id: string, extra: Partial<Item> = {}) => newItem({ id, title: id, min: 30, ...extra });
const day = (items: Item[], extra: Partial<Day> = {}): Day => ({
  key: '2026-10-17',
  dayStart: 540,
  wrap: 1020,
  dayStarted: null,
  items,
  ...extra,
});
const titles = (d: Day) => d.items.map((i) => i.title);
const patch = (d: Day, id: string, p: Partial<Item>) => ({
  ...d,
  items: d.items.map((i) => (i.id === id ? { ...i, ...p } : i)),
});

describe('mergeDay', () => {
  const base = day([it_('a'), it_('b'), it_('c')]);

  it('keeps a change from each side to different tasks', () => {
    const mine = patch(base, 'a', { status: 'done' });
    const theirs = patch(base, 'c', { status: 'running', startedAt: 600 });
    const out = mergeDay(base, mine, theirs);
    expect(out.items.map((i) => i.status)).toEqual(['done', 'todo', 'running']);
  });

  it('lets mine win when both changed the same task', () => {
    const out = mergeDay(base, patch(base, 'b', { title: 'mine' }), patch(base, 'b', { title: 'theirs' }));
    expect(titles(out)).toEqual(['a', 'mine', 'c']);
  });

  it('takes theirs for a task I left alone', () => {
    const out = mergeDay(base, base, patch(base, 'b', { note: 'from the laptop' }));
    expect(out.items[1].note).toBe('from the laptop');
  });

  it('keeps tasks added on both sides, each after the task it followed', () => {
    const mine = { ...base, items: [base.items[0], it_('m'), ...base.items.slice(1)] };
    const theirs = { ...base, items: [...base.items, it_('t')] };
    expect(titles(mergeDay(base, mine, theirs))).toEqual(['a', 'm', 'b', 'c', 't']);
  });

  it('drops a task deleted on one side unless the other changed it', () => {
    const mine = { ...base, items: base.items.filter((i) => i.id !== 'a') };
    expect(titles(mergeDay(base, mine, base))).toEqual(['b', 'c']);
    expect(titles(mergeDay(base, mine, patch(base, 'a', { title: 'kept' })))).toEqual(['kept', 'b', 'c']);
    const theirs = { ...base, items: base.items.filter((i) => i.id !== 'c') };
    expect(titles(mergeDay(base, base, theirs))).toEqual(['a', 'b']);
  });

  it('uses my order when I reordered, otherwise theirs', () => {
    const reordered = { ...base, items: [base.items[2], base.items[0], base.items[1]] };
    expect(titles(mergeDay(base, reordered, patch(base, 'a', { note: 'x' })))).toEqual(['c', 'a', 'b']);
    expect(titles(mergeDay(base, patch(base, 'a', { note: 'x' }), reordered))).toEqual(['c', 'a', 'b']);
  });

  it('merges the day fields one by one', () => {
    const out = mergeDay(base, { ...base, dayStarted: 545 }, { ...base, wrap: 1080 });
    expect([out.dayStarted, out.wrap]).toEqual([545, 1080]);
  });

  it('keeps everything from both when there is no common base, the account first', () => {
    const out = mergeDay(null, day([it_('x')], { dayStarted: 500 }), day([it_('y')], { wrap: 1100 }));
    expect(titles(out)).toEqual(['y', 'x']);
    expect(out.dayStarted).toBe(500);
  });
});

describe('mergeSettings', () => {
  it('merges field by field', () => {
    const base = { clock24: false, fixedLead: 5 };
    expect(mergeSettings(base, { clock24: true, fixedLead: 5 }, { clock24: false, fixedLead: 10 })).toEqual({
      clock24: true,
      fixedLead: 10,
    });
  });
});
