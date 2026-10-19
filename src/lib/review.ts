// Weekly and quarterly reviews: the numbers for a stretch of days, and when a review is due.
// A weekly review comes up at the day and time chosen in Settings and covers that week (Monday
// to Sunday); a quarterly one in the quarter's last week and the next quarter's first two.

import { habitMet, isHabit } from './habits';
import type { DayAt } from './habits';
import { MONTHS, quarterOf, quarterRange, addQuarters } from './goals';
import { isPartial, worked } from './schedule';
import { addDays, dayDiff, keyDate, mondayOf } from './time';
import type { Hue, Review, ReviewNumbers } from './types';
import { untimed } from './types';

/** ISO week id, '2026-W42': weeks run Monday to Sunday, and belong to the year their Thursday is in. */
export function weekId(key: string): string {
  const thu = keyDate(addDays(mondayOf(key), 3));
  const jan1 = new Date(thu.getFullYear(), 0, 1);
  // Whole days (rounded: summer time makes some days 23 or 25 hours).
  const week = Math.floor(Math.round((thu.getTime() - jan1.getTime()) / 86400000) / 7) + 1;
  return `${thu.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export const weekRange = (key: string): [string, string] => [mondayOf(key), addDays(mondayOf(key), 6)];

/** A week's days in words: "12 to 18 Oct", or "28 Sep to 4 Oct" across a month. */
export function weekSpan(from: string, to: string): string {
  const a = keyDate(from),
    b = keyDate(to);
  const month = (d: Date) => MONTHS[d.getMonth()];
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} to ${b.getDate()} ${month(b)}`
    : `${a.getDate()} ${month(a)} to ${b.getDate()} ${month(b)}`;
}

/** The numbers for the days from `from` to `to` (up to today; `n` minutes into today). */
export function reviewNumbers(dayAt: DayAt, from: string, to: string, today: string, n: number): ReviewNumbers {
  const out: ReviewNumbers = {
    days: 0,
    daysStarted: 0,
    tasks: 0,
    tasksDone: 0,
    logged: 0,
    byHue: [],
    checks: 0,
    checksDone: 0,
    habitsDue: 0,
    habitsKept: 0,
    postponed: [],
    longDays: 0,
  };
  const hues = new Map<Hue, number>();
  const titles = new Map<Hue, Map<string, number>>();
  const moved = new Map<string, number>();
  const weeks = new Map<string, number>();
  for (let k = from; k <= to && k <= today; k = addDays(k, 1)) {
    out.days++;
    const d = dayAt(k);
    if (!d) continue;
    const at = k === today ? n : 1e6;
    if (d.dayStarted != null) out.daysStarted++;
    let lastEnd = 0;
    for (const it of d.items) {
      if (it.status === 'skipped') continue;
      if (it.status === 'postponed' && it.movedKey && !isPartial(it)) {
        moved.set(it.title, (moved.get(it.title) ?? 0) + 1);
        continue;
      }
      if (it.kind === 'check') {
        out.checks++;
        if (it.status === 'done') out.checksDone++;
        continue;
      }
      if (isHabit(it)) {
        out.habitsDue++;
        if (habitMet(d, it, at)) out.habitsKept++;
        continue;
      }
      if (untimed(it.kind)) continue;
      const w = worked(it, at);
      out.logged += w;
      if (w > 0) {
        hues.set(it.hue, (hues.get(it.hue) ?? 0) + w);
        const t = titles.get(it.hue) ?? new Map<string, number>();
        t.set(it.title, (t.get(it.title) ?? 0) + w);
        titles.set(it.hue, t);
      }
      weeks.set(mondayOf(k), (weeks.get(mondayOf(k)) ?? 0) + w);
      if (it.endedAt != null) lastEnd = Math.max(lastEnd, it.endedAt);
      if (it.kind === 'buffer') continue;
      out.tasks++;
      if (it.status === 'done' || isPartial(it)) out.tasksDone++;
    }
    const end = d.dayEnded ?? lastEnd;
    if (d.dayStarted != null && end > d.wrap + 15) out.longDays++;
  }
  out.logged = Math.round(out.logged);
  out.byHue = [...hues]
    .map(([hue, min]) => ({
      hue,
      min: Math.round(min),
      titles: [...(titles.get(hue) ?? [])]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t]) => t),
    }))
    .sort((a, b) => b.min - a.min);
  out.postponed = [...moved]
    .map(([title, times]) => ({ title, times }))
    .sort((a, b) => b.times - a.times)
    .slice(0, 5);
  if (dayDiff(from, to) > 7)
    out.weeks = [...weeks]
      .map(([wk, min]) => ({ from: wk, logged: Math.round(min) }))
      .sort((a, b) => (a.from < b.from ? -1 : 1));
  return out;
}

export interface DueReview {
  id: string;
  kind: 'week' | 'quarter';
  from: string;
  to: string;
}

/**
 * The weekly review that's due: this week's, from its day and time on (`reviewDay`: 0 =
 * Sunday). Until then, last week's if it was never done or skipped. Only for a week the app
 * was used in (`used`: a day started).
 */
export function dueWeekly(
  today: string,
  n: number,
  reviewDay: number,
  reviewAt: number,
  reviews: Review[],
  used: (from: string, to: string) => boolean = () => true,
): DueReview | null {
  const have = new Set(reviews.map((r) => r.id));
  const momentIn = (key: string) => addDays(mondayOf(key), (reviewDay + 6) % 7);
  const passed = (key: string) => today > momentIn(key) || (today === momentIn(key) && n >= reviewAt);
  // Once this week's time has come, it's the one that counts; before then, last week's can
  // still be caught up on.
  const key = passed(today) ? today : addDays(today, -7);
  const id = weekId(key);
  if (have.has(id) || dayDiff(momentIn(key), today) > 7) return null;
  const [from, to] = weekRange(key);
  return used(from, to) ? { id, kind: 'week', from, to } : null;
}

/** The quarterly review that's due: in a quarter's last week, or the next quarter's first two. */
export function dueQuarterly(
  today: string,
  reviews: Review[],
  used: (from: string, to: string) => boolean = () => true,
): DueReview | null {
  const have = new Set(reviews.map((r) => r.id));
  const q = quarterOf(today);
  const [from, to] = quarterRange(q);
  if (dayDiff(today, to) <= 6 && !have.has(q) && used(from, to)) return { id: q, kind: 'quarter', from, to };
  const prev = addQuarters(q, -1);
  const [pf, pt] = quarterRange(prev);
  if (dayDiff(from, today) <= 13 && !have.has(prev) && used(pf, pt))
    return { id: prev, kind: 'quarter', from: pf, to: pt };
  return null;
}
