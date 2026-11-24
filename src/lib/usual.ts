// How long a repeating task usually takes, from the days it was timed on this device's record. It
// is only ever offered, never applied.

import { DAY_OVER, worked } from './schedule';
import { addDays } from './time';
import type { Day } from './types';

/** How far back to look, how many times at most, and how many it takes to say anything. */
const DAYS = 90;
const TIMES = 8;
const ENOUGH = 3;

/** The middle of the last times it was timed start to finish, to 5 minutes; null: too few to say. */
export function usualLength(dayAt: (key: string) => Day | undefined, seriesId: string, today: string): number | null {
  const took: number[] = [];
  for (let k = addDays(today, -1), i = 0; i < DAYS && took.length < TIMES; i++, k = addDays(k, -1))
    for (const it of dayAt(k)?.items ?? [])
      // Not ones only marked done: nobody timed those.
      if (it.seriesId === seriesId && it.status === 'done' && !it.marked && it.startedAt != null)
        took.push(worked(it, DAY_OVER));
  if (took.length < ENOUGH) return null;
  took.sort((a, b) => a - b);
  const mid = took.length >> 1;
  const m = took.length % 2 ? took[mid] : (took[mid - 1] + took[mid]) / 2;
  return Math.max(5, Math.round(m / 5) * 5);
}
