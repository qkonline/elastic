import { describe, expect, it } from 'vitest';
import { newItem } from './actions';
import { addDays } from './time';
import type { Day } from './types';
import { usualLength } from './usual';

const TODAY = '2026-11-24';
const days = (took: (number | null)[]) => {
  const all: Record<string, Day> = {};
  took.forEach((m, i) => {
    const key = addDays(TODAY, -1 - i);
    const item = newItem({
      title: 'Inbox',
      seriesId: 's',
      status: 'done',
      startedAt: 600,
      endedAt: 600 + Math.abs(m ?? 0),
      marked: m == null,
    });
    all[key] = { key, dayStart: 540, wrap: 1020, dayStarted: 540, dayEnded: 1000, items: [item] };
  });
  return (k: string) => all[k];
};

describe('how long a task usually takes', () => {
  it('is the middle of the last times it was timed', () => {
    expect(usualLength(days([42, 47, 44, 300]), 's', TODAY)).toBe(45);
  });
  it('says nothing from too few, or from ones nobody timed', () => {
    expect(usualLength(days([42, 47]), 's', TODAY)).toBeNull();
    expect(usualLength(days([42, 47, null, null]), 's', TODAY)).toBeNull();
    expect(usualLength(days([42, 47, 44]), 'other', TODAY)).toBeNull();
  });
});
