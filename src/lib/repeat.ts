import { newItem, placeFixed, uid } from './actions';
import { keyDate, weekdayLong } from './time';
import type { Day, Item, Repeat, Series } from './types';

export function repeatMatches(repeat: Repeat, key: string): boolean {
  const d = keyDate(key),
    dow = d.getDay();
  if (repeat === 'Every day') return true;
  if (repeat === 'Weekdays') return dow >= 1 && dow <= 5;
  // 'Every Monday', or several days: 'Every Monday, Wednesday, Friday'.
  return repeat.startsWith('Every ') && repeat.slice(6).split(', ').includes(weekdayLong(d));
}

export function seriesApplies(s: Series, key: string): boolean {
  if (key < s.from) return false;
  if (s.until && key > s.until) return false;
  return repeatMatches(s.repeat, key);
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
  };
}

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
    };
  }
  // A fixed time that changed goes where the new time falls.
  const moved = applies && (cur.fixedAt !== next!.fixedAt || cur.kind !== next!.kind);
  return moved ? placeFixed({ ...day, items }, cur.id, 0) : { ...day, items };
}
