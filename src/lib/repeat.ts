import { newItem, placeFixed, uid } from './actions';
import { addDays, dayDiff, keyDate, mondayOf } from './time';
import type { Day, Item, Repeat, Series } from './types';

/** Weekday names, Sunday = 0, as Date.getDay() counts them. */
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Monday first, the order days are listed in. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const ORDINALS = ['first', 'second', 'third', 'fourth', 'last'];

/** Which day of the month: a date (the 30th), a weekday in it (the second Tuesday, nth 5 = the last), or its last day. */
export type MonthDay = { date: number } | { nth: number; dow: number } | { last: true };
/**
 * A repeat, as its words say it. Every `n` days; on weekdays; every `n` weeks on some weekdays;
 * every `n` months on a day of the month. Intervals over 1 count from the series' first
 * occurrence on or after its `from` (see ruleMatches).
 */
export type Rule =
  | { every: 'day'; n: number }
  | { every: 'weekdays' }
  | { every: 'week'; n: number; days: number[] }
  | { every: 'month'; n: number; on: MonthDay };

const nth = (d: number) => {
  const t = d % 100 >= 11 && d % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][d % 10] ?? 'th');
  return `${d}${t}`;
};
const dayList = (days: number[]) =>
  WEEK_ORDER.filter((d) => days.includes(d))
    .map((d) => DAY_NAMES[d])
    .join(', ');

/** The words for a day of the month: 'the 30th', 'the last Friday', 'the last day'. */
export function monthDayText(on: MonthDay): string {
  if ('last' in on) return 'the last day';
  if ('date' in on) return `the ${nth(on.date)}`;
  return `the ${ORDINALS[on.nth - 1]} ${DAY_NAMES[on.dow]}`;
}

/** A repeat in words, as it's stored and shown: 'Every 2 weeks on Monday, Thursday'. */
export function ruleText(r: Rule): string {
  switch (r.every) {
    case 'day':
      return r.n === 1 ? 'Every day' : `Every ${r.n} days`;
    case 'weekdays':
      return 'Weekdays';
    case 'week':
      return r.n === 1 ? `Every ${dayList(r.days)}` : `Every ${r.n} weeks on ${dayList(r.days)}`;
    case 'month':
      return r.n === 1 ? `Monthly on ${monthDayText(r.on)}` : `Every ${r.n} months on ${monthDayText(r.on)}`;
  }
}

function parseMonthDay(t: string): MonthDay | null {
  if (t === 'the last day') return { last: true };
  let m = /^the (\d{1,2})(st|nd|rd|th)$/.exec(t);
  if (m && +m[1] >= 1 && +m[1] <= 31) return { date: +m[1] };
  m = /^the (first|second|third|fourth|last) (\w+)$/.exec(t);
  const dow = m ? DAY_NAMES.indexOf(m[2]) : -1;
  return m && dow >= 0 ? { nth: ORDINALS.indexOf(m[1]) + 1, dow } : null;
}

function parseDays(t: string): number[] | null {
  const days = t.split(', ').map((x) => DAY_NAMES.indexOf(x));
  return days.length && days.every((d) => d >= 0) ? days : null;
}

/** The rule a repeat's words say, or null for 'Once' and anything else. */
export function parseRepeat(repeat: Repeat): Rule | null {
  if (repeat === 'Every day') return { every: 'day', n: 1 };
  if (repeat === 'Weekdays') return { every: 'weekdays' };
  let m = /^Every (\d+) days$/.exec(repeat);
  if (m && +m[1] >= 1) return { every: 'day', n: +m[1] };
  m = /^Every (\d+) weeks on (.+)$/.exec(repeat);
  if (m && +m[1] >= 1) {
    const days = parseDays(m[2]);
    return days ? { every: 'week', n: +m[1], days } : null;
  }
  m = /^(?:Monthly|Every (\d+) months) on (.+)$/.exec(repeat);
  if (m) {
    const on = parseMonthDay(m[2]);
    return on ? { every: 'month', n: m[1] ? Math.max(1, +m[1]) : 1, on } : null;
  }
  if (repeat.startsWith('Every ')) {
    const days = parseDays(repeat.slice(6));
    return days ? { every: 'week', n: 1, days } : null;
  }
  return null;
}

const daysIn = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

/** Whether day `key` is the day of its month that `on` names. */
function onMonthDay(on: MonthDay, key: string): boolean {
  const d = keyDate(key),
    last = daysIn(d),
    date = d.getDate();
  if ('last' in on) return date === last;
  // A month too short for the date has it on its last day (the 31st is the 30th in November).
  if ('date' in on) return date === Math.min(on.date, last);
  if (d.getDay() !== on.dow) return false;
  return on.nth === 5 ? date + 7 > last : Math.ceil(date / 7) === on.nth;
}

/** Whether `key` fits the rule's days, leaving its interval aside. */
function fits(r: Rule, key: string): boolean {
  const dow = keyDate(key).getDay();
  if (r.every === 'day') return true;
  if (r.every === 'weekdays') return dow >= 1 && dow <= 5;
  if (r.every === 'week') return r.days.includes(dow);
  return onMonthDay(r.on, key);
}

/** The first day on or after `from` that fits the rule's days (within about two years). */
function firstFit(r: Rule, from: string): string | null {
  for (let i = 0, k = from; i < 800; i++, k = addDays(k, 1)) if (fits(r, k)) return k;
  return null;
}

const monthIndex = (key: string) => keyDate(key).getFullYear() * 12 + keyDate(key).getMonth();

/**
 * Whether the rule has a day at `key`, counting its interval from `from`: every 2 weeks on
 * Monday runs from the week of the first Monday on or after `from`.
 */
export function ruleMatches(r: Rule, key: string, from = key): boolean {
  if (!fits(r, key)) return false;
  if (r.every === 'weekdays' || r.n <= 1) return true;
  if (key < from) return false;
  if (r.every === 'day') return dayDiff(from, key) % r.n === 0;
  const first = firstFit(r, from);
  if (!first) return false;
  if (r.every === 'week') return (dayDiff(mondayOf(first), mondayOf(key)) / 7) % r.n === 0;
  return (monthIndex(key) - monthIndex(first)) % r.n === 0;
}

export function repeatMatches(repeat: Repeat, key: string, from?: string): boolean {
  const r = parseRepeat(repeat);
  return !!r && ruleMatches(r, key, from);
}

export function seriesApplies(s: Series, key: string): boolean {
  if (key < s.from) return false;
  if (s.until && key > s.until) return false;
  return repeatMatches(s.repeat, key, s.from);
}

/** The days in [a, b] the repeat has, counting from `from` (at most `max`). */
export function occurrences(repeat: Repeat, from: string, a: string, b: string, max = 1000): string[] {
  const r = parseRepeat(repeat);
  const out: string[] = [];
  if (!r) return out;
  for (let k = a > from ? a : from; k <= b && out.length < max; k = addDays(k, 1))
    if (ruleMatches(r, k, from)) out.push(k);
  return out;
}

/** The `n`th day (1 = the first) the repeat has from `from` on, leaving out `skips`; null past ten years. */
export function nthDay(repeat: Repeat, from: string, n: number, skips: Record<string, unknown> = {}): string | null {
  const r = parseRepeat(repeat);
  if (!r || n < 1) return null;
  const stop = addDays(from, 3660);
  for (let k = from, seen = 0; k <= stop; k = addDays(k, 1))
    if (ruleMatches(r, k, from) && !(k in skips) && ++seen === n) return k;
  return null;
}

/** The next day after `key` the series has, leaving out its skips. */
export function nextDay(s: Pick<Series, 'repeat' | 'from' | 'skips'>, key: string): string | null {
  const r = parseRepeat(s.repeat);
  if (!r) return null;
  const stop = addDays(key, 3660);
  for (let k = addDays(key, 1); k <= stop; k = addDays(k, 1))
    if (k >= s.from && ruleMatches(r, k, s.from) && !(k in (s.skips ?? {}))) return k;
  return null;
}

/** The last day before `key` the series has (on or after its start), leaving out its skips. */
export function prevDay(s: Pick<Series, 'repeat' | 'from' | 'skips'>, key: string): string | null {
  const r = parseRepeat(s.repeat);
  if (!r) return null;
  for (let k = addDays(key, -1); k >= s.from; k = addDays(k, -1))
    if (ruleMatches(r, k, s.from) && !(k in (s.skips ?? {}))) return k;
  return null;
}

/** How many times the series comes up in [from, `to`], skipped days left out, plus any before it was changed. */
export function timesUpTo(s: Pick<Series, 'repeat' | 'from' | 'skips' | 'prior'>, to: string): number {
  return (
    (s.prior ?? 0) + occurrences(s.repeat, s.from, s.from, to, 100_000).filter((k) => !(k in (s.skips ?? {}))).length
  );
}

/**
 * For a series that ends (after a number of times, or on a date): which time day `key` is and
 * how many there are, as in "2 of 6". Null for a series that doesn't end.
 */
export function seriesCount(s: Series, key: string): { nth: number; total: number } | null {
  if (!s.ends || !s.until) return null;
  return { nth: timesUpTo(s, key < s.until ? key : s.until), total: timesUpTo(s, s.until) };
}

/** How a repeat ends, as the task forms set it. */
export type Ends = { times: number } | { until: string } | null;

/** What `ends` says for series `s`: its last day (`until`) and how it ends. */
export function withEnds<T extends Pick<Series, 'repeat' | 'from' | 'skips' | 'prior' | 'until' | 'ends'>>(
  s: T,
  ends: Ends,
): T {
  if (!ends) return { ...s, until: null, ends: null };
  if ('until' in ends) return { ...s, until: ends.until < s.from ? s.from : ends.until, ends: 'date' };
  const left = Math.max(1, ends.times - (s.prior ?? 0));
  return { ...s, until: nthDay(s.repeat, s.from, left, s.skips ?? {}) ?? s.from, ends: 'times' };
}

/** How series `s` ends, as the task forms show it. */
export function endsOf(s: Series | undefined): Ends {
  if (!s?.ends || !s.until) return null;
  return s.ends === 'times' ? { times: timesUpTo(s, s.until) } : { until: s.until };
}

export function seriesFromItem(it: Item, from: string, id = it.seriesId ?? uid(), order = 0): Series {
  return {
    id,
    title: it.title,
    min: it.min,
    kind: it.kind,
    hue: it.hue,
    fixedAt: it.fixedAt,
    repeat: it.repeat,
    note: it.note,
    subtasks: it.subtasks.map((x) => ({ id: x.id, t: x.t })),
    from,
    until: null,
    order,
    ...(it.habit ? { habit: it.habit } : {}),
    ...(it.habitId ? { habitId: it.habitId } : {}),
    ...(it.goalId ? { goalId: it.goalId } : {}),
    ...(it.icon ? { icon: it.icon } : {}),
  };
}

/** The parts of a series about when it ends, which a task's own fields don't carry. */
export const limitsOf = (s: Series): Pick<Series, 'ends' | 'skips' | 'prior'> => ({
  ...(s.ends ? { ends: s.ends } : {}),
  ...(s.skips && Object.keys(s.skips).length ? { skips: s.skips } : {}),
  ...(s.prior ? { prior: s.prior } : {}),
});

/**
 * A series' copy for a day. Its ids come from the series and the day, so two devices that build
 * the same day (neither had it stored yet) give its copies the same ids, and sync matches them
 * rather than keeping both.
 */
export function itemFromSeries(s: Series, key: string): Item {
  const id = `${s.id}@${key}`;
  return newItem({
    id,
    title: s.title,
    min: s.min,
    kind: s.kind,
    hue: s.hue,
    fixedAt: s.fixedAt,
    repeat: s.repeat,
    note: s.note,
    seriesId: s.id,
    subtasks: (s.subtasks ?? []).map((x, i) => ({ id: `${id}.${i}`, t: x.t, d: false })),
    ...(s.habit ? { habit: s.habit } : {}),
    ...(s.habitId ? { habitId: s.habitId } : {}),
    ...(s.goalId ? { goalId: s.goalId } : {}),
    ...(s.icon ? { icon: s.icon } : {}),
  });
}

const byOrder = (a: Series, b: Series) => a.order - b.order;

/** A day that has never been stored: today or later gets its repeating items, in their order. */
export function materialize(key: string, series: Series[], dayStart: number, wrap: number, today: string): Day {
  const items =
    key >= today
      ? series
          .filter((s) => seriesApplies(s, key))
          .sort(byOrder)
          .map((s) => itemFromSeries(s, key))
      : [];
  return { key, dayStart, wrap, dayStarted: null, items };
}

/**
 * Give series without an order one: the order their tasks have on `day` (the plan the user has
 * arranged), then any others as they come.
 */
export function orderSeries(series: Series[], day: Day | undefined): Series[] {
  if (series.every((s) => Number.isFinite(s.order))) return series;
  const onDay = (day?.items ?? []).map((i) => i.seriesId);
  const rank = (s: Series) => {
    const at = onDay.indexOf(s.id);
    return at < 0 ? Infinity : at;
  };
  const sorted = series.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i);
  return series.map((s) => ({ ...s, order: sorted.findIndex((x) => x.s === s) }));
}

/** An order that puts series `moving` right before or after series `anchor`. */
export function orderNextTo(series: Series[], moving: string, anchor: string, side: 'before' | 'after'): number {
  const list = series.filter((s) => s.id !== moving).sort(byOrder);
  const i = list.findIndex((s) => s.id === anchor);
  if (i < 0) return list.length ? list[list.length - 1].order + 1 : 0;
  const a = list[i].order;
  const b = side === 'before' ? list[i - 1]?.order : list[i + 1]?.order;
  return b == null ? a + (side === 'before' ? -1 : 1) : (a + b) / 2;
}

/**
 * The order for a task of `day` that has just started repeating: after the repeating task
 * above it, or before the one below it, or last.
 */
export function orderAt(series: Series[], items: Item[], id: string): number {
  const i = items.findIndex((x) => x.id === id);
  const known = (x: Item | undefined) => !!x?.seriesId && series.some((s) => s.id === x.seriesId);
  const above = items.slice(0, i).reverse().find(known);
  if (above) return orderNextTo(series, '', above.seriesId!, 'after');
  const below = items.slice(i + 1).find(known);
  if (below) return orderNextTo(series, '', below.seriesId!, 'before');
  return series.length ? Math.max(...series.map((s) => s.order)) + 1 : 0;
}

/**
 * Put series `sid`'s task on a (not yet started) day where its order says: before the first
 * repeating task that comes after it, or else just after the last one that comes before it.
 */
export function placeBySeries(day: Day, sid: string, series: Series[]): Day {
  const order = new Map(series.map((s) => [s.id, s.order]));
  const it = day.items.find((i) => i.seriesId === sid);
  const mine = order.get(sid);
  if (!it || it.status !== 'todo' || mine == null) return day;
  const rest = day.items.filter((i) => i !== it);
  const rank = (x: Item) => (x.seriesId ? order.get(x.seriesId) : undefined);
  let at = rest.findIndex((x) => (rank(x) ?? -Infinity) > mine);
  if (at < 0) for (let k = 0; k < rest.length; k++) if ((rank(rest[k]) ?? Infinity) < mine) at = k + 1;
  if (at < 0) return day; // no other repeating task to go by
  rest.splice(at, 0, it);
  return rest.every((x, k) => x === day.items[k]) ? day : { ...day, items: rest };
}

/** A later day without series `sid`'s task, unless that task has been worked on or moved. */
export function withoutSeries(day: Day, sid: string): Day {
  const items = day.items.filter((i) => i.seriesId !== sid || (i.status !== 'todo' && i.status !== 'skipped'));
  return items.length === day.items.length ? day : { ...day, items };
}

/**
 * Bring a stored, not-yet-started later day in line with a series that changed from `prev` to
 * `next` (null = the series ended). The item is added only where the rule newly applies, so a
 * copy the user deleted from one day stays deleted; untouched copies are updated; copies on
 * days the rule no longer covers are dropped.
 */
export function syncSeriesInto(day: Day, next: Series | null, prev: Series | null, seriesId: string): Day {
  const idx = day.items.findIndex((i) => i.seriesId === seriesId);
  const applies = !!next && seriesApplies(next, day.key);
  if (idx < 0) {
    const newlyApplies = applies && !(prev && seriesApplies(prev, day.key));
    if (!newlyApplies) return day;
    const it = itemFromSeries(next!, day.key);
    return placeFixed({ ...day, items: [...day.items, it] }, it.id, 0);
  }
  const cur = day.items[idx];
  if (cur.status !== 'todo') return day;
  const items = [...day.items];
  if (!applies) items.splice(idx, 1);
  else {
    // Keep ticks on steps that survived the edit; each existing step is matched at most once.
    const unused = [...cur.subtasks];
    const steps = next!.subtasks.map((x) => {
      const at = unused.findIndex((y) => y.t === x.t);
      return at >= 0 ? unused.splice(at, 1)[0] : { id: uid(), t: x.t, d: false };
    });
    items[idx] = {
      ...cur,
      title: next!.title,
      min: next!.min,
      kind: next!.kind,
      hue: next!.hue,
      fixedAt: next!.fixedAt,
      repeat: next!.repeat,
      note: next!.note,
      subtasks: steps,
      habit: next!.habit,
      habitId: next!.habitId ?? null,
      goalId: next!.goalId ?? null,
      icon: next!.icon ?? null,
    };
  }
  // A fixed time that changed goes where the new time falls.
  const moved = applies && (cur.fixedAt !== next!.fixedAt || cur.kind !== next!.kind);
  return moved ? placeFixed({ ...day, items }, cur.id, 0) : { ...day, items };
}
