// Times of day are minutes since local midnight of the item's day (540 = 9:00 am).
// Timer timestamps use the same unit, can be fractional, and can exceed 1440: a day can run
// on past midnight (1500 = 1:00 am the next morning). Start/end times are never stored: see
// schedule.ts.

export type HueName = 'orange' | 'yellow' | 'lime' | 'cyan' | 'indigo';
/** One of the five task colours, or a custom colour as '#rrggbb'. */
export type Hue = HueName | `#${string}`;
/**
 * 'check' = no duration and no timer, just ticked off (shown in the Checklist, not the timeline).
 * 'habit' = a repeating habit (see `Habit`): like a check, it takes no room in the plan.
 */
export type Kind = 'task' | 'buffer' | 'fixed' | 'check' | 'habit';
/** Kinds that take no time in the plan and live in the Checklist instead of the timeline. */
export const untimed = (k: Kind) => k === 'check' || k === 'habit';
export type Status = 'todo' | 'running' | 'paused' | 'done' | 'postponed' | 'skipped';
export type Repeat = string; // 'Once' | 'Every day' | 'Weekdays' | `Every ${Weekday}` | 'Every Monday, Friday'
export type ThemePref = 'match' | 'light' | 'dark';
export type ShowTimes = 'started' | 'always' | 'never';

/**
 * What a habit asks for. 'check': done or not. 'amount': `target` of `unit` (8 glasses).
 * 'time': `target` minutes, from timed tasks that count towards it (`Item.habitId`) plus minutes
 * added by hand. 'quit': a habit to break; each day counts as clean unless a slip is marked.
 * `per` 'week' / 'month': the habit is due `times` days in each week (Monday first) or month,
 * on any days; it shows every day until then.
 */
export type HabitType = 'check' | 'amount' | 'time' | 'quit';
export interface Habit {
  type: HabitType;
  target: number;
  unit: string;
  per: 'day' | 'week' | 'month';
  times: number;
  /** Minutes into the day to remind at, if it isn't done by then. */
  remindAt: number | null;
}

export interface Subtask {
  id: string;
  t: string;
  d: boolean;
}

export interface Item {
  id: string;
  title: string;
  min: number;
  kind: Kind;
  fixedAt: number | null;
  hue: Hue;
  status: Status;
  startedAt: number | null;
  endedAt: number | null;
  pausedAt: number | null;
  pausedFor: number;
  repeat: Repeat;
  seriesId: string | null;
  subtasks: Subtask[];
  note: string;
  /** Set by "Mark done" on a missed item; never timed. */
  marked?: boolean;
  /** The remainder copy created by "Postpone → Later today" mid-task. */
  continued?: boolean;
  /** On the original item when its remainder went to later today. */
  laterCopy?: boolean;
  /** Not planned before this minute while still to do: a reopened task's rest starts from when it was reopened. */
  planFrom?: number | null;
  /**
   * A buffer's time once the day has started: where the plan had it then (or when it was added
   * or moved). The now line doesn't push it, as it doesn't a fixed item (schedule()).
   */
  heldAt?: number | null;
  /** Day this item was moved to, and the id of the copy there (for Undo). */
  movedKey?: string | null;
  movedId?: string | null;
  /** A habit: what it asks for (kind 'habit'). */
  habit?: Habit;
  /** A habit's progress today: an amount, minutes added by hand, or 1 = slipped (quit). */
  progress?: number;
  /** A task whose time counts towards this time habit (its series id). */
  habitId?: string | null;
  /** A task or habit that counts towards this goal. */
  goalId?: string | null;
  /**
   * Work on a Boardo card (see boardo.ts): the card and its board, and the timer session open
   * while it runs. Such an item has `min: 0`, so it counts up.
   */
  card?: { id: string; board: string; session?: string | null };
}

export interface Day {
  key: string;
  dayStart: number;
  /** Planned wrap-up; past 1440 when the day is meant to run past midnight. */
  wrap: number;
  dayStarted: number | null;
  /** Set by "End my day". A started day that hasn't ended stays Today after midnight. */
  dayEnded?: number | null;
  items: Item[];
}

export interface Settings {
  themePref: ThemePref;
  clock24: boolean;
  showTimes: ShowTimes;
  /** Chime and vibration at time's up. */
  alertOn: boolean;
  /** System notifications at time's up (needs the browser's permission too). */
  notify: boolean;
  /** Whether starting a timer may suggest turning notifications on. */
  notifyAsk: 'ask' | 'never';
  /** Day key before which the suggestion stays hidden ("Not now" = tomorrow). */
  notifyAskAfter: string | null;
  /** Minutes before a fixed-time task to give a heads-up (0 = none). */
  fixedLead: number;
  defStart: number;
  /** Planned wrap-up for new days: defStart + dayLength (can pass midnight). */
  defWrap: number;
  /** How long a productive day is, in minutes. */
  dayLength: number;
  /** "My start time varies": the day's plan and length count from Start my day. */
  flexStart: boolean;
  /** Has been through the welcome / first-visit setup. */
  onboarded: boolean;
  /** Habits in the Checklist, mixed with checks, or in a section of their own. */
  habitsPlace: 'checklist' | 'separate';
  /** The Checklist as a vertical list (folds above 3) or a row of chips that scrolls sideways. Per device. */
  checklistLayout: 'list' | 'row';
  /** When the weekly review comes up: a weekday (0 = Sunday) and minutes into that day. */
  reviewDay: number;
  reviewAt: number;
}

/** Template for a repeating item. Day items point at it through `seriesId`. */
export interface Series {
  id: string;
  title: string;
  min: number;
  kind: Kind;
  hue: Hue;
  fixedAt: number | null;
  repeat: Repeat;
  note: string;
  subtasks: { id: string; t: string }[];
  /** First day key the series applies to. */
  from: string;
  /** Day key after which it stops (set when repeating is switched off), or null while active. */
  until: string | null;
  /** Where it goes among the repeating tasks on days built from them: lower comes first. */
  order: number;
  habit?: Habit;
  habitId?: string | null;
  goalId?: string | null;
}

/**
 * A goal for a calendar quarter ('2026-Q4'). Any mix of: a number to reach, milestones to tick
 * off, tasks and habits that count towards it (`Item.goalId`), or just the words and why.
 */
export interface Goal {
  id: string;
  quarter: string;
  title: string;
  why: string;
  target: { now: number; goal: number; unit: string } | null;
  milestones: { id: string; t: string; done: boolean }[];
  /** How it went, set at the quarter's review. */
  status: 'open' | 'hit' | 'partly' | 'missed';
  order: number;
}

/** A goal as it stood when a review was finished. */
export interface GoalSnapshot {
  id: string;
  title: string;
  target: { now: number; goal: number; unit: string } | null;
  milestones: [number, number];
  minutes: number;
  habitDays: number;
  status: Goal['status'];
}

/** The numbers a review looks at, for a week or a quarter. */
export interface ReviewNumbers {
  days: number;
  daysStarted: number;
  tasks: number;
  tasksDone: number;
  /** Minutes logged. */
  logged: number;
  /** Minutes logged per task (by title), most first; past the first few, the rest share one row
   * with no title or colour. */
  byTask: { title: string | null; hue: Hue | null; min: number }[];
  /** Reviews saved before byTask: minutes per colour. */
  byHue?: { hue: Hue; min: number; titles?: string[] }[];
  checks: number;
  checksDone: number;
  habitsDue: number;
  habitsKept: number;
  /** Tasks moved to another day most often. */
  postponed: { title: string; times: number }[];
  /** Days that ran past their planned wrap-up. */
  longDays: number;
  /** A quarter's weeks: minutes logged in each, Monday first. */
  weeks?: { from: string; logged: number }[];
}

/** A finished (or skipped) weekly or quarterly review, kept to read back. */
export interface Review {
  /** '2026-W42' or '2026-Q4'. */
  id: string;
  kind: 'week' | 'quarter';
  from: string;
  to: string;
  /** When it was finished (ms), or null if it was skipped. */
  done: number | null;
  numbers: ReviewNumbers | null;
  goals: GoalSnapshot[];
}

// 'orange' is the stored name of the first colour, which shows as rose: plans saved before it
// changed keep working as they are.
export const HUES: Record<HueName, string> = {
  orange: '#f43f5e',
  yellow: '#facc15',
  lime: '#84cc16',
  cyan: '#22d3ee',
  indigo: '#818cf8',
};
const HUE_NAMES: Record<HueName, string> = {
  orange: 'Rose',
  yellow: 'Yellow',
  lime: 'Lime',
  cyan: 'Cyan',
  indigo: 'Indigo',
};

export const isHex = (s: unknown): s is `#${string}` => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
export const isHue = (s: unknown): s is Hue => isHex(s) || (typeof s === 'string' && Object.hasOwn(HUES, s));

/** The CSS colour for a task colour. */
export function hueColor(h: Hue): string {
  return isHex(h) ? h : (HUES[h] ?? HUES.cyan);
}

/** Dark or light ink, whichever reads better on top of a task colour. */
export function inkOn(h: Hue): string {
  const c = hueColor(h);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#16181d' : '#ffffff';
}

/** The heads-up choices in Settings, in minutes before a fixed time (0 = none). */
export const FIXED_LEADS = [0, 5, 10, 15] as const;

/** The settings shared across an account's devices (about how days work); the rest are each device's own. */
export const SHARED_SETTINGS = [
  'clock24',
  'showTimes',
  'fixedLead',
  'defStart',
  'defWrap',
  'dayLength',
  'flexStart',
  'reviewDay',
  'reviewAt',
] as const;

/** The shared part of the settings. */
export const sharedSettings = (s: Partial<Settings>) =>
  Object.fromEntries(SHARED_SETTINGS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]]));

export const DEFAULT_SETTINGS: Settings = {
  themePref: 'match',
  clock24: false,
  showTimes: 'started',
  alertOn: true,
  notify: false,
  notifyAsk: 'ask',
  notifyAskAfter: null,
  fixedLead: 5,
  defStart: 540,
  defWrap: 1020,
  dayLength: 480,
  flexStart: false,
  onboarded: false,
  habitsPlace: 'checklist',
  checklistLayout: 'list',
  reviewDay: 0,
  reviewAt: 18 * 60,
};

/** A colour's name, as people see it ('orange' is shown as Rose). */
export function hueName(h: Hue): string {
  return isHex(h) ? 'Custom colour' : (HUE_NAMES[h] ?? h);
}
