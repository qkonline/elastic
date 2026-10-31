// Export / import. Version 3 holds everything (settings, repeating series, every day, goals
// and reviews); version 2 is the same without goals and reviews. Version 1 files hold a single
// day ({ items, dayStart, wrap }) and import into the day being viewed.

import { newItem, uid } from './actions';
import { isIcon } from './icons';
import { dkey } from './time';
import type { Day, Goal, Habit, Hue, Item, Kind, Review, ReviewNumbers, Series, Settings, Status } from './types';
import { DEFAULT_SETTINGS, FIXED_LEADS, isHue, untimed } from './types';

export interface Backup {
  app: 'elastic-day';
  version: 3;
  exportedAt: string;
  settings: Settings;
  series: Series[];
  days: Day[];
  goals: Goal[];
  reviews: Review[];
}

export type Parsed =
  | { kind: 'full'; settings: Settings; series: Series[]; days: Day[]; goals: Goal[]; reviews: Review[] }
  | { kind: 'day'; items: Item[]; dayStart: number; wrap: number };

const KINDS: Kind[] = ['task', 'buffer', 'fixed', 'check', 'habit'];
const HABIT_TYPES: Habit['type'][] = ['check', 'amount', 'time', 'quit'];
const STATUSES: Status[] = ['todo', 'running', 'paused', 'done', 'postponed', 'skipped'];
const KEY = /^\d{4}-\d{2}-\d{2}$/;
/** A day's key: a date, or Someday's (tasks with no day yet). */
const DAY_KEY = /^(\d{4}-\d{2}-\d{2}|someday)$/;
const num = (v: unknown, d: number | null) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const minutes = (v: unknown, d: number) => Math.max(1, Math.round(num(v, d)!));

/** Steps with unique ids (duplicates would break keyed lists and tick together). */
function normalizeSteps(raw: unknown): { id: string; t: string; d: boolean }[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.map((x) => {
    const s = obj(x);
    let id = str(s.id, '');
    if (!id || seen.has(id)) id = uid();
    seen.add(id);
    return { id, t: str(s.t, ''), d: !!s.d };
  });
}

/** A habit's settings, or undefined if there are none worth keeping. */
function normalizeHabit(raw: unknown): Habit | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = obj(raw);
  const type = HABIT_TYPES.includes(r.type as Habit['type']) ? (r.type as Habit['type']) : 'check';
  const per = r.per === 'week' || r.per === 'month' ? r.per : 'day';
  const remindAt = num(r.remindAt, null);
  return {
    type,
    target: Math.max(1, Math.round(num(r.target, 1)!)),
    unit: str(r.unit, '').slice(0, 30),
    per,
    times: Math.min(per === 'week' ? 7 : 31, Math.max(1, Math.round(num(r.times, 3)!))),
    remindAt: remindAt == null ? null : Math.max(0, Math.min(2879, Math.round(remindAt))),
    ...(typeof r.since === 'string' && KEY.test(r.since) ? { since: r.since } : {}),
  };
}

export function normalizeItem(raw: unknown): Item {
  const r = obj(raw);
  const habit = normalizeHabit(r.habit);
  let kind = KINDS.includes(r.kind as Kind) ? (r.kind as Kind) : 'task';
  if (kind === 'habit' && !habit) kind = 'check'; // a habit with nothing to go by is a plain check
  let status: Status =
    r.status === 'stopped' ? 'done' : STATUSES.includes(r.status as Status) ? (r.status as Status) : 'todo';
  const startedAt = num(r.startedAt, null);
  let endedAt = num(r.endedAt, null);
  let pausedAt = num(r.pausedAt, null);
  const min = untimed(kind) ? 0 : minutes(r.min, 30); // checks and habits have no duration
  if (untimed(kind) && (status === 'running' || status === 'paused')) status = 'todo'; // never timed
  // Reconcile timer fields that don't fit the status (hand-edited or damaged files).
  if ((status === 'running' || status === 'paused') && startedAt == null) status = 'todo';
  if (status === 'paused' && pausedAt == null) pausedAt = startedAt;
  if (status !== 'paused') pausedAt = null;
  if ((status === 'done' || status === 'postponed') && startedAt != null && endedAt == null) endedAt = startedAt + min;
  const timed = status !== 'todo' && status !== 'skipped';
  return newItem({
    ...(typeof r.id === 'string' && r.id ? { id: r.id } : {}),
    title: str(r.title, 'Untitled'),
    min,
    kind,
    fixedAt: kind === 'fixed' ? num(r.fixedAt, 540) : null,
    hue: isHue(r.hue) ? r.hue : 'cyan',
    status,
    startedAt: timed ? startedAt : null,
    endedAt: timed ? endedAt : null,
    pausedAt,
    pausedFor: timed ? Math.max(0, num(r.pausedFor, 0)!) : 0,
    repeat: str(r.repeat, 'Once'),
    seriesId: typeof r.seriesId === 'string' ? r.seriesId : null,
    note: str(r.note, ''),
    subtasks: normalizeSteps(r.subtasks),
    marked: !!r.marked,
    continued: !!r.continued,
    laterCopy: !!r.laterCopy,
    ...(kind === 'buffer' && typeof r.heldAt === 'number' && Number.isFinite(r.heldAt) ? { heldAt: r.heldAt } : {}),
    ...(status === 'todo' && typeof r.planFrom === 'number' && Number.isFinite(r.planFrom)
      ? { planFrom: r.planFrom }
      : {}),
    movedKey: typeof r.movedKey === 'string' && DAY_KEY.test(r.movedKey) ? r.movedKey : null,
    movedId: typeof r.movedId === 'string' ? r.movedId : null,
    ...(kind === 'habit' ? { habit, progress: Math.max(0, num(r.progress, 0)!) } : {}),
    ...(typeof r.habitId === 'string' && r.habitId ? { habitId: r.habitId } : {}),
    ...(typeof r.goalId === 'string' && r.goalId ? { goalId: r.goalId } : {}),
    ...(isIcon(r.icon) ? { icon: r.icon } : {}),
    ...(cardLink(r.card) ? { card: cardLink(r.card)! } : {}),
    ...(timed && typeof r.run === 'string' && r.run.length <= 64
      ? { run: r.run, ...(r.fix === true ? { fix: true } : {}) }
      : {}),
  });
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A link to a Boardo card, checked like the rest of an import. */
function cardLink(v: unknown): Item['card'] | null {
  const c = obj(v);
  if (typeof c.id !== 'string' || !ID.test(c.id) || typeof c.board !== 'string' || !ID.test(c.board)) return null;
  return { id: c.id, board: c.board, session: typeof c.session === 'string' && ID.test(c.session) ? c.session : null };
}

export function normalizeDay(raw: unknown): Day | null {
  const r = obj(raw);
  if (typeof r.key !== 'string' || !DAY_KEY.test(r.key)) return null;
  const all = Array.isArray(r.items) ? r.items.map(normalizeItem) : [];
  // Each task once (two with one id would break the lists on screen).
  const ids = new Set<string>();
  const items = all.filter((it) => !ids.has(it.id) && !!ids.add(it.id));
  // At most one timer per day (two devices can each start one before hearing of the other): the
  // one started last keeps going, and the others are set aside from that moment, as starting a
  // task does (never marked done: nobody said they were).
  const active = items.filter((i) => i.status === 'running' || i.status === 'paused');
  if (active.length > 1) {
    const later = (a: Item, b: Item) =>
      a.run && b.run && a.run !== b.run
        ? a.run > b.run
        : a.startedAt! !== b.startedAt!
          ? a.startedAt! > b.startedAt!
          : a.id > b.id;
    const last = active.reduce((a, b) => (later(b, a) ? b : a));
    for (const [i, it] of items.entries())
      if (active.includes(it) && it !== last)
        items[i] = {
          ...it,
          status: 'postponed',
          endedAt: it.status === 'paused' ? it.pausedAt : Math.max(it.startedAt! + it.pausedFor, last.startedAt!),
          pausedAt: null,
        };
  }
  return {
    key: r.key,
    dayStart: num(r.dayStart, 540)!,
    wrap: num(r.wrap, 1020)!,
    dayStarted: num(r.dayStarted, null),
    dayEnded: num(r.dayEnded, null),
    items,
  };
}

export function normalizeSeries(raw: unknown, index: number): Series | null {
  const r = obj(raw);
  if (typeof r.id !== 'string' || !r.id || typeof r.from !== 'string' || !KEY.test(r.from)) return null;
  const repeat = str(r.repeat, '');
  if (!repeat || repeat === 'Once') return null;
  const habit = normalizeHabit(r.habit);
  let kind = KINDS.includes(r.kind as Kind) ? (r.kind as Kind) : 'task';
  if (kind === 'habit' && !habit) kind = 'check';
  return {
    id: r.id,
    title: str(r.title, 'Untitled'),
    min: untimed(kind) ? 0 : minutes(r.min, 30),
    kind,
    hue: isHue(r.hue) ? r.hue : 'cyan',
    fixedAt: kind === 'fixed' ? num(r.fixedAt, 540) : null,
    repeat,
    note: str(r.note, ''),
    subtasks: normalizeSteps(r.subtasks).map(({ id, t }) => ({ id, t })),
    from: r.from,
    until: typeof r.until === 'string' && KEY.test(r.until) ? r.until : null,
    order: num(r.order, index)!,
    ...(kind === 'habit' ? { habit } : {}),
    ...(typeof r.habitId === 'string' && r.habitId ? { habitId: r.habitId } : {}),
    ...(typeof r.goalId === 'string' && r.goalId ? { goalId: r.goalId } : {}),
    ...(isIcon(r.icon) ? { icon: r.icon } : {}),
    ...(r.ends === 'times' || r.ends === 'date' ? { ends: r.ends } : {}),
    ...(skipsOf(r.skips) ? { skips: skipsOf(r.skips) } : {}),
    ...(typeof r.prior === 'number' && r.prior > 0 ? { prior: Math.floor(r.prior) } : {}),
  };
}

/** A series' skipped days (day key → 'extend' | 'keep'), or undefined if there are none. */
function skipsOf(raw: unknown): Series['skips'] {
  const out = Object.fromEntries(
    Object.entries(obj(raw)).filter(([k, v]) => KEY.test(k) && (v === 'extend' || v === 'keep')),
  ) as NonNullable<Series['skips']>;
  return Object.keys(out).length ? out : undefined;
}

export function normalizeSettings(raw: unknown): Settings {
  const r = obj(raw);
  const d = DEFAULT_SETTINGS;
  const pick = <T>(v: unknown, ok: readonly T[], fallback: T) => (ok.includes(v as T) ? (v as T) : fallback);
  return {
    themePref: pick(r.themePref, ['match', 'light', 'dark'] as const, d.themePref),
    clock24: typeof r.clock24 === 'boolean' ? r.clock24 : d.clock24,
    showTimes: pick(r.showTimes, ['started', 'always', 'never'] as const, d.showTimes),
    alertOn: typeof r.alertOn === 'boolean' ? r.alertOn : d.alertOn,
    notify: typeof r.notify === 'boolean' ? r.notify : d.notify,
    notifyAsk: pick(r.notifyAsk, ['ask', 'never'] as const, d.notifyAsk),
    notifyAskAfter: typeof r.notifyAskAfter === 'string' && KEY.test(r.notifyAskAfter) ? r.notifyAskAfter : null,
    fixedLead: pick(r.fixedLead, FIXED_LEADS, d.fixedLead),
    defStart: num(r.defStart, d.defStart)!,
    defWrap: num(r.defWrap, d.defWrap)!,
    dayLength: Math.max(60, num(r.dayLength, num(r.defWrap, d.defWrap)! - num(r.defStart, d.defStart)!)!),
    flexStart: typeof r.flexStart === 'boolean' ? r.flexStart : d.flexStart,
    // A backup comes from someone who has used the app, so don't show them the welcome again.
    onboarded: true,
    habitsPlace: r.habitsPlace === 'separate' ? 'separate' : 'checklist',
    checklistLayout: r.checklistLayout === 'row' ? 'row' : 'list',
    defLength: Math.min(720, Math.max(0, Math.round(num(r.defLength, d.defLength)!))),
    reviewDay:
      Number.isInteger(r.reviewDay) && (r.reviewDay as number) >= 0 && (r.reviewDay as number) <= 6
        ? (r.reviewDay as number)
        : d.reviewDay,
    reviewAt: Math.max(0, Math.min(1439, Math.round(num(r.reviewAt, d.reviewAt)!))),
  };
}

const QUARTER = /^\d{4}-Q[1-4]$/;
const STATUSES_G: Goal['status'][] = ['open', 'hit', 'partly', 'missed'];

function normalizeTarget(raw: unknown): Goal['target'] {
  if (!raw || typeof raw !== 'object') return null;
  const r = obj(raw);
  return { now: num(r.now, 0)!, goal: num(r.goal, 1)!, unit: str(r.unit, '').slice(0, 30) };
}

export function normalizeGoal(raw: unknown, index = 0): Goal | null {
  const r = obj(raw);
  if (typeof r.id !== 'string' || !r.id || typeof r.quarter !== 'string' || !QUARTER.test(r.quarter)) return null;
  return {
    id: r.id,
    quarter: r.quarter,
    title: str(r.title, 'Untitled').slice(0, 300),
    why: str(r.why, '').slice(0, 2000),
    target: normalizeTarget(r.target),
    milestones: (Array.isArray(r.milestones) ? r.milestones : []).slice(0, 50).map((m) => {
      const x = obj(m);
      return { id: str(x.id, '') || uid(), t: str(x.t, '').slice(0, 300), done: !!x.done };
    }),
    status: STATUSES_G.includes(r.status as Goal['status']) ? (r.status as Goal['status']) : 'open',
    order: num(r.order, index)!,
  };
}

const n0 = (v: unknown) => Math.max(0, num(v, 0)!);

function normalizeNumbers(raw: unknown): ReviewNumbers | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = obj(raw);
  return {
    days: n0(r.days),
    daysStarted: n0(r.daysStarted),
    tasks: n0(r.tasks),
    tasksDone: n0(r.tasksDone),
    logged: n0(r.logged),
    byTask: (Array.isArray(r.byTask) ? r.byTask : [])
      .slice(0, 20)
      .map(obj)
      .map((x) => ({
        title: typeof x.title === 'string' ? x.title : null,
        hue: isHue(x.hue) ? (x.hue as Hue) : null,
        min: n0(x.min),
      })),
    byHue: (Array.isArray(r.byHue) ? r.byHue : [])
      .map(obj)
      .filter((x) => isHue(x.hue))
      .map((x) => ({
        hue: x.hue as Hue,
        min: n0(x.min),
        ...(Array.isArray(x.titles)
          ? { titles: x.titles.filter((t): t is string => typeof t === 'string').slice(0, 3) }
          : {}),
      })),
    checks: n0(r.checks),
    checksDone: n0(r.checksDone),
    habitsDue: n0(r.habitsDue),
    habitsKept: n0(r.habitsKept),
    postponed: (Array.isArray(r.postponed) ? r.postponed : [])
      .slice(0, 10)
      .map(obj)
      .map((x) => ({ title: str(x.title, ''), times: n0(x.times) })),
    longDays: n0(r.longDays),
    ...(Array.isArray(r.weeks)
      ? {
          weeks: r.weeks
            .map(obj)
            .filter((x) => typeof x.from === 'string' && KEY.test(x.from))
            .map((x) => ({ from: x.from as string, logged: n0(x.logged) })),
        }
      : {}),
  };
}

export function normalizeReview(raw: unknown): Review | null {
  const r = obj(raw);
  const kind = r.kind === 'quarter' ? 'quarter' : r.kind === 'week' ? 'week' : null;
  if (typeof r.id !== 'string' || !kind || typeof r.from !== 'string' || !KEY.test(r.from)) return null;
  if (typeof r.to !== 'string' || !KEY.test(r.to)) return null;
  return {
    id: r.id,
    kind,
    from: r.from,
    to: r.to,
    done: num(r.done, null),
    numbers: normalizeNumbers(r.numbers),
    goals: (Array.isArray(r.goals) ? r.goals : []).slice(0, 100).map((g) => {
      const x = obj(g);
      const ms = Array.isArray(x.milestones) ? x.milestones : [0, 0];
      return {
        id: str(x.id, ''),
        title: str(x.title, ''),
        target: normalizeTarget(x.target),
        milestones: [n0(ms[0]), n0(ms[1])] as [number, number],
        minutes: n0(x.minutes),
        habitDays: n0(x.habitDays),
        status: STATUSES_G.includes(x.status as Goal['status']) ? (x.status as Goal['status']) : 'open',
      };
    }),
  };
}

export function parseBackup(text: string): Parsed | { error: string } {
  let d: Record<string, unknown>;
  try {
    d = obj(JSON.parse(text));
  } catch {
    return { error: 'Could not read that file.' };
  }
  if (d.app !== 'elastic-day') return { error: 'That file is not an Elastic backup.' };
  if ((d.version === 2 || d.version === 3) && Array.isArray(d.days)) {
    return {
      kind: 'full',
      settings: normalizeSettings(d.settings),
      series: Array.isArray(d.series) ? d.series.map(normalizeSeries).filter((x): x is Series => !!x) : [],
      days: d.days.map(normalizeDay).filter((x): x is Day => !!x),
      goals: Array.isArray(d.goals) ? d.goals.map(normalizeGoal).filter((x): x is Goal => !!x) : [],
      reviews: Array.isArray(d.reviews) ? d.reviews.map(normalizeReview).filter((x): x is Review => !!x) : [],
    };
  }
  if (Array.isArray(d.items)) {
    const day = normalizeDay({ key: '2000-01-01', items: d.items })!;
    return {
      kind: 'day',
      items: day.items.map((x) => ({ ...x, repeat: 'Once', seriesId: null, movedKey: null, movedId: null })),
      dayStart: num(d.dayStart, 540)!,
      wrap: num(d.wrap, 1020)!,
    };
  }
  return { error: 'That file is not an Elastic backup.' };
}

export function download(data: Backup): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `elastic-${dkey(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
