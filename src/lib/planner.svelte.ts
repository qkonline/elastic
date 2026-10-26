// App state and every user action. Days are immutable values: each action computes a new Day
// with the pure functions in actions.ts, then `commit` swaps it in and queues a write.

import * as A from './actions';
import * as api from './account';
import { arrival, MOVED_TO, moveUrl, reachable } from './move';
import { API, ApiError, cancelled, complete, passkeysAvailable, type Session, type SignedIn } from './account';
import { chime, notifyHidden, requestNotifications, unlockAudio, unlockOnFirstGesture, vibrate } from './alert';
import { download, normalizeDay, parseBackup } from './backup';
import {
  diff,
  fromPaths,
  Hlc,
  type Kind as RecordKind,
  merge,
  type Paths,
  stamp,
  timerOf,
  toPaths,
} from '../../shared/lww';
import { Boardo, type BoardoCard, type BoardoOp, cardsFor } from './boardo.svelte';
import * as db from './db';
import { hasNotifications, needsInstallForNotifications } from './platform';
import { cancelPush, preparePush, pushEndpoint, schedulePush, unsubscribePush } from './push';
import { addQuarters, goalProgress, quarterOf, snapshot, suggestStatus } from './goals';
import { habitMet, isHabit, progressText } from './habits';
import { type DueReview, dueQuarterly, dueWeekly, reviewNumbers, weekId, weekRange } from './review';
import { type HeadsUp, headsUps, type Note, pushPlan } from './reminders';
import {
  materialize,
  orderAt,
  orderNextTo,
  orderSeries,
  placeBySeries,
  seriesFromItem,
  syncSeriesInto,
  withoutSeries,
} from './repeat';
import { sampleItems } from './sample';
import { dayStats, type DayStats, isActive, isPartial, schedule, worked } from './schedule';
import {
  addDays,
  atMinutes,
  clockToDay,
  addMonths,
  dayDiff,
  fT,
  hhmm,
  hm,
  keyDate,
  minutesInto,
  monthGrid,
  mondayOf,
  shortDate,
  todayKey,
} from './time';
import { SHARED_SETTINGS, Sync, type SyncStatus } from './sync';
import { activeDayKey } from './today';
import { newBuildOut, reloadToUpdate } from './update';
import type { Day, Goal, Habit, Hue, Item, Kind, Review, Series, Settings } from './types';
import { DEFAULT_SETTINGS, isHue, sharedSettings, untimed } from './types';

/** The full-screen moment after Start my day or End my day. */
export type Celebration =
  { kind: 'start'; at: number; first: string | null } | { kind: 'end'; stats: DayStats; moved: number };

/** What fills the page: the plan (Today), or one of the screens the bottom bar and Settings open. */
export type Screen =
  | { type: 'today' }
  | { type: 'habits' }
  | { type: 'goals'; quarter?: string }
  | { type: 'review'; id?: string }
  | { type: 'settings' };
/** What the task sheet's Edit form saves. */
export type TaskForm = Pick<
  Item,
  'title' | 'kind' | 'min' | 'hue' | 'fixedAt' | 'repeat' | 'note' | 'subtasks' | 'goalId' | 'habitId'
>;
/** What opens over the page. */
export type Sheet =
  | { type: 'task'; id: string }
  | { type: 'hours' }
  | { type: 'add'; at?: number; kind?: Kind }
  | { type: 'install' }
  | { type: 'wrapup' }
  | { type: 'account' }
  | { type: 'reorder'; id: string; anchor: string; dir: 'up' | 'down' }
  | { type: 'card'; id: string };
export type ConfirmType =
  'postpone' | 'delete' | 'clear' | 'erase' | 'sample' | 'finish' | 'signout' | 'unaccount' | 'goal' | 'passkey';
/** Running this far over before Done asks when it was really finished (minutes). */
export const ASK_FINISH_OVER = 5;
export interface Confirm {
  type: ConfirmType;
  id: string;
  at: number;
}
export interface Resched {
  id: string;
  time: string;
  date: string;
}
export interface Drag {
  id: string;
  /** Index the task would be dropped before (null until the finger has moved). */
  over: number | null;
  /** How far the lifted task has moved from its place, along the drag (px). */
  dy: number;
  /** Size of the lifted task's row along the drag: the gap the other rows open for it (px). */
  h: number;
}

export const CONFIRM_MS = 10_000;
/** How long the "start your day first" message stays up. */
export const NUDGE_MS = 6000;
/** How long a timer tap waits for this device to catch up with the account before going ahead. */
export const CATCH_UP_MS = 5000;
const CATCHING_UP = 'Catching up with your other devices…';
const SAVE_DELAY = 250;
const SERIES_DELAY = 500;
/** A card finished here this long ago has surely reached Boardo, from any device. */
const BOARDO_HEARD_MS = 2 * 60_000;
/** Ask for a newer build on coming back to the app (at most this often), and while it stays open. */
const UPDATE_ON_RETURN_MS = 60 * 60_000;
const UPDATE_EVERY_MS = 24 * 3600_000;
/** How far back to look for a timer left running on an earlier day. */
const RECENT_DAYS = 7;
export const THEME_KEY = 'elastic-day:theme';
const VIEW_KEY = 'elastic-day:view';
/** Day, week or month on screen. Remembered on this device. */
export type View = 'day' | 'week' | 'month';

function readView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'week' || v === 'month') return v;
  } catch {
    /* storage blocked */
  }
  return 'day';
}

type Msg =
  | { t: 'days'; keys: string[] }
  | { t: 'settings' }
  | { t: 'series' }
  | { t: 'goals' }
  | { t: 'reviews' }
  | { t: 'all' }
  | { t: 'account' };
/** How often to check whether the alerts the account sends have changed. */
const ALERTS_EVERY_MS = 5000;

function readThemeMirror(): Settings['themePref'] {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark' || v === 'match') return v;
  } catch {
    /* storage blocked */
  }
  return DEFAULT_SETTINGS.themePref;
}

const SERIES_FIELDS: (keyof Item)[] = [
  'title',
  'min',
  'kind',
  'hue',
  'fixedAt',
  'note',
  'repeat',
  'habit',
  'habitId',
  'goalId',
];
/** How far back stored days are kept at hand for habit streaks and history. */
const PAST_DAYS = 400;

/**
 * This device's stored settings, filled in. Settings saved before day length existed get it from
 * their hours. Ones saved before the welcome, or that came from the account onto a device with
 * none of its own, have no `onboarded`: the person has used Elastic, so no welcome.
 */
function stored(s: Partial<Settings>): Settings {
  const out = { ...DEFAULT_SETTINGS, ...s };
  if (s.dayLength == null) out.dayLength = Math.max(60, out.defWrap - out.defStart);
  if (s.onboarded == null) out.onboarded = true;
  return out;
}

export class Planner {
  ready = $state(false);
  failed = $state<string | null>(null);
  settings = $state.raw<Settings>({ ...DEFAULT_SETTINGS, themePref: readThemeMirror() });
  series = $state.raw<Series[]>([]);
  days = $state.raw<Record<string, Day>>({});
  /** Stored days before the ones loaded for the screen: for habit streaks and history. */
  past = $state.raw<Record<string, Day>>({});
  goals = $state.raw<Goal[]>([]);
  reviews = $state.raw<Review[]>([]);
  today = $state(todayKey());
  /** The day on screen; in the week and month views, the day they're anchored on. */
  viewKey = $state(todayKey());
  view = $state<View>(readView());
  weekOff = $state(0);
  clock = $state(Date.now());

  sheet = $state<Sheet | null>(null);
  screen = $state<Screen>({ type: 'today' });
  /** Where Settings goes back to. */
  private screenBefore: Screen = { type: 'today' };
  confirm = $state<Confirm | null>(null);
  resched = $state<Resched | null>(null);
  drag = $state<Drag | null>(null);
  hover = $state<string | null>(null);
  announce = $state('');
  importMsg = $state<{ err: boolean; t: string } | null>(null);
  /** The "get notified?" card, offered when a timer starts or a task gets a fixed time. */
  notifyPrompt = $state<'timer' | 'fixed' | 'blocked' | null>(null);
  /** Heads-ups closed from the banner. */
  private dismissedHeadsUps = $state.raw<string[]>([]);
  /** Signed in on this device: the plan syncs with the account. */
  session = $state.raw<Session | null>(null);
  syncStatus = $state<SyncStatus>('off');
  /** Just signed in on a device with its own plan: keep the account's, or add this one to it? */
  joinAsk = $state(false);
  /** A sign-in or account action is under way (buttons wait). */
  accountBusy = $state(false);
  /** The outcome of the last account action, to show in the account sheet. */
  accountMsg = $state<{ err: boolean; t: string } | null>(null);
  /** Just made an account here: offer a passkey for signing in next time. */
  offerPasskey = $state(false);
  /** Signed in, but the account has no name or email yet, so it doesn't sync until it has. */
  get needsSetup(): boolean {
    return !!this.session && (this.syncStatus === 'paused' || !complete(this.session.user));
  }
  /**
   * The sign-in page instead of the app: there's no account on this device yet, or signing in
   * isn't finished (a name, which plan to keep, the passkey offer). Builds without the worker
   * (local development) have no accounts and go straight to the app.
   */
  get signInFirst(): boolean {
    if (!this.ready || !api.accountsAvailable()) return false;
    return !this.session || this.joinAsk || this.needsSetup || this.offerPasskey;
  }
  /** Something is typed on the sign-in page: a new build waits until signing in is done. */
  holdUpdates = false;
  /** When Today's plan last followed the now line (followNow()). */
  private followedAt = 0;
  /** The last build at an old address, handing this copy over (moveHome()). */
  moving = $state<'saving' | 'offline' | 'unreachable' | 'going' | null>(null);
  /** init() has loaded the device's plan and sign-in. */
  private started = false;
  /** Saving on this device is failing: 'full' (out of storage) or 'failed'. Cleared by a save that works. */
  saveError = $state<'full' | 'failed' | null>(null);
  private saveTries = 0;
  /** The account sends this device's alerts (signed in and syncing). */
  private get accountAlerts(): boolean {
    return !!this.session && this.syncStatus !== 'paused';
  }

  day: Day = $derived(this.days[this.viewKey] ?? this.blankDay(this.viewKey));
  isToday = $derived(this.viewKey === this.today);
  /** The link to Boardo: project cards assigned to me, and the time I work on them. */
  boardo = new Boardo(
    db,
    (m) => this.say(m),
    () => this.session?.token ?? null,
    (askedAt) => this.followBoardo(askedAt),
  );
  /** Project cards from Boardo on the day on screen still to work on: they need the day started too. */
  private projectsToStart = $derived(
    this.boardo.connected &&
      this.boardo.boards > 0 &&
      cardsFor(this.viewKey, this.boardo.cards, this.today).some((r) => !r.ticked),
  );
  /** Ticking a check or starting a timer waits for Start my day. Earlier days are history and never wait. */
  waiting = $derived(this.day.dayStarted == null && this.viewKey >= this.today);
  /** An ended day is a record: it can be looked at but not changed (Today's can be reopened). */
  locked = $derived(this.day.dayEnded != null);
  /** Why an ended day can't be changed, and what to do about it. */
  lockedText = $derived(
    this.isToday
      ? 'This day has ended. Reopen it at the bottom of the day to make changes.'
      : 'This day has ended, so it stays as it was.',
  );
  /**
   * Shown after tapping a check or a Start button before the day has started (Start my day
   * answers it). `quiet`: a message only, without calling out the Start my day button.
   */
  nudge = $state<{ text: string; at: number; quiet?: boolean } | null>(null);
  /**
   * Signed in, and not caught up with the account since opening or coming back after a while:
   * the plan on screen may be out of date, so timer taps wait (whenCurrent()). On 25 Oct 2026 a
   * phone opened 40 minutes out of date showed a task finished on the laptop as still running,
   * and Done tapped on it logged 41 minutes for it.
   */
  catchingUp = $state(false);
  private held: { title: string; sig: () => string; was: string; run: () => void } | null = null;
  private catchUpTimer: ReturnType<typeof setTimeout> | null = null;
  /** Records from the account being loaded into the store (fromAccount). */
  private landing: Promise<void> = Promise.resolve();
  /** Now, in minutes since midnight of the viewed day. */
  n = $derived(minutesInto(this.viewKey, this.clock));
  /**
   * The clock to the minute, for what doesn't need the seconds (calendars, habit history, review
   * numbers): reading it, rather than `clock`, recomputes once a minute instead of 4 times a second.
   */
  minute = $derived(Math.floor(this.clock / 60_000) * 60_000);
  /**
   * The viewed day as the plan sees it. With a flexible start, today's plan (until the day is
   * started) runs from now for the usual day length.
   */
  planDay: Day = $derived(this.planOf(this.day));
  sch = $derived(schedule(this.planDay, this.n));
  /** Clock times on the plan: always on other days; on Today as the setting says. */
  timesShown = $derived(
    !this.isToday ||
      this.settings.showTimes === 'always' ||
      (this.settings.showTimes === 'started' && this.day.dayStarted != null),
  );
  /** Today still waits for Start my day (anything left to do but buffers, checks included). */
  startPending = $derived(
    this.isToday &&
      this.day.dayStarted == null &&
      (this.day.items.some((i) => i.status === 'todo' && i.kind !== 'buffer') || this.projectsToStart),
  );
  /** First visit: show the welcome until it's been completed or skipped. */
  showWelcome = $derived(this.ready && !this.settings.onboarded);
  celebrate = $state<Celebration | null>(null);
  active = $derived(this.day.items.find(isActive) ?? null);
  /** A timer running or paused on a day other than the one on screen (e.g. left on last night). */
  elsewhere = $derived.by(() => this.activeOn((k) => k !== this.viewKey));
  /** A timer anywhere: on Habits, Goals, Review and Settings the plan isn't in sight at all. */
  activeAnywhere = $derived.by(() => this.activeOn(() => true));
  private activeOn(which: (key: string) => boolean): { key: string; it: Item } | null {
    for (const d of Object.values(this.days)) {
      if (!which(d.key)) continue;
      const it = d.items.find(isActive);
      if (it) return { key: d.key, it };
    }
    return null;
  }
  /** The fixed-time task whose heads-up is due, until it starts (Today or the day after). */
  comingUp: HeadsUp | null = $derived.by(() => {
    const now = this.clock;
    return (
      this.headsUps().find(
        (h) => h.at <= now && now < h.startsAt && !this.dismissedHeadsUps.includes(h.tag + h.startsAt),
      ) ?? null
    );
  });
  weekKeys = $derived.by(() => {
    const mon = addDays(mondayOf(this.today), this.weekOff * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  });

  private stored = new Set<string>();
  private pending = new Set<string>();
  /** What was done to days not saved yet (saves wait a moment), by key, as changes with clocks. */
  private unsent = new Map<string, Paths>();
  /** The clock changes made here are stamped with (shared/lww.ts). */
  private hlc = new Hlc(A.uid());
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private seriesTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private alerted = new Set<string>();
  private bc: BroadcastChannel | null = null;
  private iv: ReturnType<typeof setInterval> | null = null;
  private nav = 0;
  private pushScheduled = false;
  /** Heads-ups due after this moment still need their chime (earlier ones had it, or were missed). */
  private remindFrom = Date.now();
  private updateCheckedAt = Date.now();
  /** A newer build is out: reload for it at the next quiet moment. */
  private updateReady = false;
  private reloading = false;
  private alertsCheckedAt = 0;
  private sync = new Sync(API, {
    flush: async () => void (await this.flush()),
    changed: (ids) => this.fromAccount(ids),
    status: (st) => {
      this.syncStatus = st;
      // Can't catch up (offline, or the account isn't set up): what's here is all there is.
      if (st === 'offline' || st === 'paused' || st === 'off') this.setCatchingUp(false);
      // Connected to the account: Boardo's cards come through it.
      if (st === 'live') void this.boardo.online();
    },
    boardo: () => this.boardo.nudge(),
    current: (v) => this.setCatchingUp(!v),
    signedOut: () => void this.forgetSession('You were signed out on this device. Your plan is still here.'),
    alerts: () => pushPlan(this.alerts(), Date.now()),
    endpoint: () => (this.settings.notify ? pushEndpoint() : null),
    clock: () => this.hlc.now(),
    see: (c) => this.hlc.see(c),
  });

  // ---------- lifecycle ----------

  async init(): Promise<void> {
    try {
      const [s, series, goals, reviews] = await Promise.all([
        db.getSettings(),
        db.getAllSeries(),
        db.getGoals(),
        db.getReviews(),
      ]);
      this.goals = goals;
      this.reviews = reviews;
      this.settings = s ? stored(s) : { ...DEFAULT_SETTINGS, themePref: this.settings.themePref };
      this.series = series;
      // Yesterday has to be loaded first: if it's still going, it's Today.
      await this.loadRecent();
      await this.loadPast();
      this.today = activeDayKey(todayKey(), this.days, Date.now());
      this.viewKey = this.today;
      await this.ensureDay(this.today);
      await this.fillSeriesOrder();
      await this.loadWeek();
      await this.ensureDay(addDays(this.today, 1)); // for heads-ups past midnight
      if (this.view === 'month') await this.loadMonth();
      if (!s && (this.stored.size || series.length)) this.setSettings({ onboarded: true });
      // Anything already over time when the page loads has had its alert.
      this.rungAlready();
      this.remindFrom = this.updateCheckedAt = Date.now();
      // The sign-in before the app shows, or a signed-in device would show the sign-in page first.
      this.session = (await db.getMeta<Session>('account').catch(() => undefined)) ?? null;
      this.ready = true;
    } catch (e) {
      this.failed = e instanceof Error ? e.message : String(e);
      return;
    }
    this.iv = setInterval(() => this.tick(), 250);
    // The app opens from the service worker's cache: ask straight away whether there's a newer
    // build, and take it now if nothing is under way (otherwise at the next quiet moment).
    this.settleUntil = Date.now() + 60_000;
    void this.checkForUpdate(true);
    const session = this.session;
    if (session) {
      // Signed in before devices noted whose plan they hold: it's this account's.
      if (!(await db.getMeta('owner').catch(() => null))) void db.putMeta('owner', session.user.id);
      void this.boardo.load();
      void this.sync.start(session);
    }
    // Arrived from the app's old address: this device's settings, and its sign-in (move.ts).
    const came = arrival();
    if (came) void this.arrive(came);
    this.started = true;
    try {
      this.bc = new BroadcastChannel('elastic-day');
      this.bc.onmessage = (e) => void this.onMessage(e.data as Msg);
    } catch {
      /* no cross-tab sync */
    }
    if (typeof document === 'undefined') return;
    // After a reload a timer may already be running; the chime needs one user gesture first.
    unlockOnFirstGesture();
    // A push booked before the app was last closed isn't wanted while it's open (going into the
    // background books a fresh one), and could ring for a timer that has since changed.
    if (this.settings.notify) void preparePush().then((ok) => ok && !document.hidden && cancelPush());
    addEventListener('pagehide', () => void this.flush());
    document.addEventListener('visibilitychange', () => (document.hidden ? this.onHidden() : this.onVisible()));
  }

  /**
   * Going into the background: save, and have the push worker ring at time's up and before
   * fixed times. What each push should say is stored for the service worker.
   */
  /** Timers already over time count as having rung (a push said so, or the moment has gone). */
  private rungAlready(): void {
    for (const d of Object.values(this.days))
      for (const it of d.items) if (isActive(it) && worked(it, minutesInto(d.key)) >= it.min) this.alerted.add(it.id);
  }

  /** When the page last went out of sight. */
  private hiddenAt = 0;

  private onHidden(): void {
    this.hiddenAt = Date.now();
    // A drag whose finger-up never came, or a reschedule panel left open, would otherwise keep
    // the plan from following the now line and a new build from loading, for good.
    this.drag = null;
    this.resched = null;
    this.updateIfQuiet();
    void this.flush();
    // Signed in, the account sends the alerts, to every device of the account.
    this.sync.setVisible(false);
    if (!this.settings.notify) return;
    const plan = pushPlan(this.alerts(), Date.now());
    // Signed in, the service worker asks the account what to show, and falls back on this.
    void db.putAlerts(plan).catch(() => {});
    // Signed in to an account that isn't set up yet, this device books its own, as signed out.
    if (this.accountAlerts) this.pushScheduled = !!pushEndpoint() && plan.length > 0;
    else this.pushScheduled = schedulePush(plan.map((g) => g.at));
  }

  /** Until when the app has only just opened or come back: the moment to take a new build. */
  private settleUntil = 0;

  private onVisible(): void {
    this.settleUntil = Date.now() + 60_000;
    this.sync.setVisible(true);
    // Sound may need another tap to come back after the background (iOS).
    unlockOnFirstGesture();
    if (this.pushScheduled && !this.accountAlerts) cancelPush();
    // Back after a while: what came due meanwhile came as a notification (booked here, or sent by
    // the account), or its moment has gone. Either way it doesn't chime now, all at once.
    if (this.pushScheduled || (this.accountAlerts && this.settings.notify) || Date.now() - this.hiddenAt > 120_000) {
      this.remindFrom = Date.now();
      this.rungAlready();
    }
    this.pushScheduled = false;
    this.tick();
    // Back in the app: the moment to pick up a newer build, before anything is under way.
    if (this.updateReady) this.updateIfQuiet();
    else if (Date.now() - this.updateCheckedAt > UPDATE_ON_RETURN_MS) void this.checkForUpdate(true);
  }

  /**
   * Ask the server whether a newer build is out. Reload for it straight away when the app has
   * just come back or is out of sight; otherwise (open and in use) at the next of those moments.
   */
  private async checkForUpdate(returning: boolean): Promise<void> {
    this.updateCheckedAt = Date.now();
    this.updateReady ||= await newBuildOut();
    if (returning || (typeof document !== 'undefined' && document.hidden)) this.updateIfQuiet();
  }

  /**
   * Pull to refresh: save, then (signed in) catch up with the account and send what's waiting,
   * fetch Boardo's cards and look for a new build, and say how it went. Signed out, the plan is
   * read again from this device. Nothing reloads the page (a reload can hang on a bad network).
   */
  async refresh(): Promise<void> {
    if (!(await this.flush())) return;
    this.settleUntil = Date.now() + 60_000;
    void this.checkForUpdate(true);
    if (!this.session) {
      await this.reloadAll();
      return this.say('Refreshed');
    }
    this.boardo.nudge();
    if (await this.sync.syncNow()) return this.say('Up to date');
    const text = "Can't reach your account right now. Your changes are saved here and go when it's back.";
    this.nudge = { text, at: Date.now() };
    this.say(text);
  }

  /** Save and reload for a newer build, unless a sheet, drag, question or celebration is up. */
  private updateIfQuiet(): void {
    if (!this.updateReady || this.reloading) return;
    if (this.sheet || this.drag || this.confirm || this.resched || this.celebrate || this.showWelcome) return;
    if (this.screen.type === 'settings') return;
    if (this.signInFirst && (this.holdUpdates || this.session)) return;
    this.reloading = true;
    // Only once everything is saved: a reload would lose what isn't.
    void this.flush().then((ok) => {
      // Still here a while after reloading (iOS can drop the navigation of a page it freezes): let a
      // later moment try again.
      if (ok)
        return reloadToUpdate().then((went) => {
          if (went === false) {
            this.reloading = false;
            // Still arriving (its service worker is storing it): just after opening or coming
            // back, look again shortly; otherwise at the next quiet moment.
            if (Date.now() < this.settleUntil) setTimeout(() => this.updateIfQuiet(), 3000);
          } else setTimeout(() => (this.reloading = false), 20_000);
        });
      this.reloading = false;
    });
  }

  /** Notifications still to come: the running timer's time's up, and heads-ups before fixed times. */
  private alerts(): { at: number; note: Note }[] {
    const now = Date.now();
    const out: { at: number; note: Note }[] = [];
    for (const d of Object.values(this.days)) {
      const it = d.items.find((i) => i.status === 'running');
      // Work on a Boardo card counts up, with no time's up.
      if (!it || it.card || this.alerted.has(it.id)) continue;
      const left = it.min - worked(it, minutesInto(d.key, now));
      if (left > 0)
        out.push({ at: now + left * 60000, note: { title: "Time's up", body: it.title, tag: 'timer-' + it.id } });
    }
    for (const h of this.headsUps()) out.push({ at: h.at, note: this.headsUpNote(h) });
    for (const r of this.habitReminders()) if (r.at > now) out.push(r);
    const rv = this.reviewReminder();
    if (rv && rv.at > now) out.push(rv);
    return out;
  }

  /** This week's review, at its day and time, if it hasn't been done. */
  private reviewReminder(): { at: number; note: Note } | null {
    const { reviewDay, reviewAt } = this.settings;
    const key = addDays(mondayOf(this.today), (reviewDay + 6) % 7);
    const id = weekId(key);
    if (this.reviews.some((r) => r.id === id)) return null;
    return {
      at: atMinutes(key, reviewAt),
      note: { title: 'Your week in review', body: 'A few minutes to look back at your week', tag: 'review-' + id },
    };
  }

  /** Today's habits with a reminder that aren't done yet. */
  private habitReminders(): { at: number; note: Note }[] {
    // Today's, and tomorrow's for the early morning (pushes are booked a day ahead).
    return [this.today, addDays(this.today, 1)].flatMap((k) => this.habitRemindersOn(this.days[k]));
  }

  private habitRemindersOn(d: Day | undefined): { at: number; note: Note }[] {
    if (!d || d.dayEnded != null) return [];
    const n = minutesInto(d.key, this.clock);
    return d.items
      .filter(isHabit)
      .filter(
        (i) => i.habit.remindAt != null && i.status !== 'skipped' && (i.habit.type === 'quit' || !habitMet(d, i, n)),
      )
      .map((i) => {
        const tag = `habit-${d.key}-${i.seriesId ?? i.id}`;
        const so = progressText(d, i, n);
        const body = i.habit.type === 'quit' ? 'A reminder for today' : so ? `${so} so far` : 'Not done yet today';
        return { at: atMinutes(d.key, i.habit.remindAt!), note: { title: i.title, body, tag } };
      });
  }

  /** Fixed-time tasks on Today and the day after (for the small hours), with their heads-up times. */
  private headsUps(): HeadsUp[] {
    // As planned, not as planOf() shows a flexible day not started yet: that plan runs from now,
    // so a fixed task after others would move later every minute and its heads-up never come.
    const days = [this.today, addDays(this.today, 1)].map((k) => this.days[k]).filter(Boolean);
    return headsUps(days, this.settings.fixedLead, this.clock);
  }

  /** A day as the plan sees it: with a flexible start, today's plan runs from now until it's started. */
  planOf(d: Day): Day {
    if (!this.settings.flexStart || d.key !== this.today || d.dayStarted != null) return d;
    const start = Math.ceil(minutesInto(d.key, this.clock) / 5) * 5;
    return { ...d, dayStart: start, wrap: start + this.settings.dayLength };
  }

  private headsUpNote(h: HeadsUp): Note {
    return { title: `Coming up at ${fT(h.start, this.settings.clock24)}`, body: h.it.title, tag: h.tag };
  }

  dismissHeadsUp(h: HeadsUp): void {
    this.dismissedHeadsUps = [...this.dismissedHeadsUps, h.tag + h.startsAt];
  }

  destroy(): void {
    if (this.iv) clearInterval(this.iv);
    // Nothing more from this store: pending saves would land in whatever database comes next.
    if (this.saveTimer) clearTimeout(this.saveTimer);
    for (const t of this.seriesTimers.values()) clearTimeout(t);
    this.bc?.close();
    this.sync.stop();
    this.boardo.destroy();
  }

  tick(): void {
    this.clock = Date.now();
    const tk = activeDayKey(todayKey(), this.days, this.clock);
    if (tk !== this.today) this.rollover(tk);
    // Clearing a day waits for an answer; the other confirms give up after a while.
    if (this.confirm && this.confirm.type !== 'clear' && Date.now() - this.confirm.at > CONFIRM_MS) this.confirm = null;
    if (this.nudge && Date.now() - this.nudge.at > NUDGE_MS) this.nudge = null;
    if (this.clock - this.followedAt >= 1000) this.followNow();
    if (Date.now() - this.updateCheckedAt > UPDATE_EVERY_MS) void this.checkForUpdate(false);
    if (this.accountAlerts && this.clock - this.alertsCheckedAt > ALERTS_EVERY_MS) {
      this.alertsCheckedAt = this.clock;
      this.sync.alertsChanged();
    }
    for (const d of Object.values(this.days)) {
      for (const it of d.items) {
        if (it.status !== 'running' || it.card) continue;
        const over = worked(it, minutesInto(d.key, this.clock)) >= it.min;
        // Lengthening a task that already rang arms its alert again.
        if (!over) {
          this.alerted.delete(it.id);
          continue;
        }
        if (this.alerted.has(it.id)) continue;
        this.alerted.add(it.id);
        this.say(`Time's up for ${it.title}`);
        if (this.settings.alertOn) {
          chime();
          vibrate([180, 90, 180]);
        }
        // With a push booked, the push brings the notification. Showing one here as well gave
        // two on iPhones, where a page catching up after being frozen still counts as hidden.
        if (this.settings.notify && !this.pushScheduled) notifyHidden("Time's up", it.title, 'timer-' + it.id);
      }
    }
    // A heads-up rings once, as its time passes, and not once the task is due to start. With a
    // push booked, the push brings it.
    const from = this.remindFrom;
    this.remindFrom = this.clock;
    if (this.pushScheduled) return;
    for (const h of this.headsUps()) {
      if (h.at <= from || h.at > this.clock || this.clock >= h.startsAt) continue;
      const note = this.headsUpNote(h);
      this.say(`${note.title}: ${note.body}`);
      if (this.settings.alertOn) {
        chime([1175]);
        vibrate(180);
      }
      if (this.settings.notify) notifyHidden(note.title, note.body, note.tag);
    }
    const rv = this.reviewReminder();
    for (const r of [...this.habitReminders(), ...(rv ? [rv] : [])]) {
      if (r.at <= from || r.at > this.clock) continue;
      this.say(`${r.note.title}: ${r.note.body}`);
      if (this.settings.alertOn) {
        chime([1175]);
        vibrate(180);
      }
      if (this.settings.notify) notifyHidden(r.note.title, r.note.body, r.note.tag);
    }
  }

  /** Midnight passed with the app open. Follow it to the new day unless a timer is running. */
  private rollover(tk: string): void {
    const old = this.today;
    this.today = tk;
    this.weekOff = 0;
    void this.ensureDay(tk)
      .then(() => this.loadWeek())
      .then(() => this.ensureDay(addDays(tk, 1)));
    if (this.viewKey === old && !this.days[old]?.items.some(isActive)) void this.switchDay(tk);
  }

  // ---------- loading & saving ----------

  private blankDay(key: string): Day {
    return materialize(key, this.series, this.settings.defStart, this.settings.defWrap, this.today);
  }

  /** Load a day from storage, or build it from repeating items (not stored until edited). */
  async ensureDay(key: string): Promise<Day> {
    const have = this.days[key];
    if (have) return have;
    const got = await db.getDay(key);
    if (this.days[key]) return this.days[key];
    if (got) this.stored.add(key);
    const d = got ?? this.blankDay(key);
    this.days = { ...this.days, [key]: d };
    return d;
  }

  async loadWeek(): Promise<void> {
    await Promise.all(this.weekKeys.map((k) => this.ensureDay(k)));
  }

  /** Load the last few stored days so a timer still running from one of them isn't lost. */
  private async loadRecent(): Promise<void> {
    const got = await db.getDays(addDays(this.today, -RECENT_DAYS), addDays(this.today, -1));
    const next = { ...this.days };
    for (const d of got) {
      if (next[d.key]) continue;
      next[d.key] = d;
      this.stored.add(d.key);
    }
    this.days = next;
  }

  /** Stored days further back, for habit history. Days loaded for the screen take precedence. */
  private async loadPast(): Promise<void> {
    const got = await db.getDays(addDays(this.today, -PAST_DAYS), addDays(this.today, -1));
    this.past = Object.fromEntries(got.map((d) => [d.key, d]));
  }

  /** A day as last known: loaded, or from the stored past. */
  dayAt = (key: string): Day | undefined => this.days[key] ?? this.past[key];

  private put(day: Day): void {
    day = this.runs(this.days[day.key], this.cardOps(this.days[day.key], day));
    // What was done, as changes: against the day as it was, stamped with now. Changes come from
    // here, never from storage, so nothing the app does to storage by itself is ever sent. A day
    // built from repeating tasks and never saved goes whole, but as built it counts as older
    // than anything done anywhere (ZERO): another device's edits to that day win over it, and
    // only what was done here is new.
    const was = this.days[day.key];
    let change = stamp(diff('day', was ?? null, day), this.hlc.now());
    if (!this.stored.has(day.key)) change = merge(toPaths('day', was ?? null), change);
    this.unsent.set(day.key, merge(this.unsent.get(day.key) ?? {}, change));
    this.days = { ...this.days, [day.key]: day };
    this.stored.add(day.key);
    this.pending.add(day.key);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), SAVE_DELAY);
  }

  /**
   * Timer runs, marked for the merge (shared/lww.ts timerRank): a timer started here gets the
   * clock it starts at, and a change to a run that had already finished (its times corrected,
   * reopened) says it was made knowing that, so a finish from a device that hadn't heard the
   * timer stop doesn't beat it, nor it the first finish.
   */
  private runs(prev: Day | undefined, next: Day): Day {
    const before = new Map((prev?.items ?? []).map((i) => [i.id, i]));
    const ended = (i: Item) => i.status === 'done' || isPartial(i);
    let items = next.items;
    next.items.forEach((it, idx) => {
      const was = before.get(it.id);
      let cur = it;
      if (isActive(it)) {
        if (!was || !isActive(was)) cur = { ...it, run: this.hlc.now(), fix: undefined };
      } else if (ended(it) && it.endedAt != null) {
        if (it.run && !it.fix && was && ended(was) && timerOf(was) !== timerOf(it)) cur = { ...it, fix: true };
      } else if (it.run || it.fix) cur = { ...it, run: undefined, fix: undefined };
      if (cur !== it) {
        if (items === next.items) items = [...next.items];
        items[idx] = Object.fromEntries(Object.entries(cur).filter(([, v]) => v !== undefined)) as unknown as Item;
      }
    });
    return items === next.items ? next : { ...next, items };
  }

  /**
   * Work on Boardo cards that started, stopped, finished or reopened in this change goes to
   * Boardo (R8.22 to R8.27): a start opens a timer session (its id kept on the item while it
   * runs), anything that stops it closes the session, and Done marks my part done. Only changes
   * made here pass through, so another device's changes, synced in, never send twice.
   */
  private cardOps(prev: Day | undefined, next: Day): Day {
    if (!this.boardo.connected) return next;
    const before = new Map((prev?.items ?? []).filter((i) => i.card).map((i) => [i.id, i]));
    const ops: Omit<BoardoOp, 'id'>[] = [];
    const now = Date.now();
    const at = (m: number | null) => (m == null ? now : Math.min(now, atMinutes(next.key, m)));
    let items = next.items;
    next.items.forEach((it, idx) => {
      if (!it.card) return;
      const was = before.get(it.id);
      before.delete(it.id);
      const base = { board: it.card.board, cardId: it.card.id };
      const wasRunning = was?.status === 'running';
      const running = it.status === 'running';
      let cur = it;
      if (wasRunning && !running && was!.card?.session) {
        const end = it.status === 'paused' ? it.pausedAt : it.endedAt;
        ops.push({ ...base, type: 'stop', sessionId: was!.card.session, at: at(end) });
        cur = { ...cur, card: { ...it.card, session: null } };
      }
      if (!wasRunning && running) {
        const session = A.uid().replace(/[^A-Za-z0-9_-]/g, '');
        ops.push({ ...base, type: 'start', sessionId: session, at: now });
        cur = { ...cur, card: { ...it.card, session } };
      }
      if (it.status === 'done' && was?.status !== 'done')
        ops.push({ ...base, type: 'done', sessionId: 'done', at: at(it.endedAt) });
      // Not when Boardo is where it was reopened (followBoardo): it already knows.
      if (was?.status === 'done' && it.status !== 'done' && !this.openInBoardo(it.card.id))
        ops.push({ ...base, type: 'undone', sessionId: 'done', at: now });
      if (cur !== it) {
        if (items === next.items) items = [...next.items];
        items[idx] = cur;
      }
    });
    // Deleted while running: the session closes.
    for (const gone of before.values())
      if (gone.status === 'running' && gone.card?.session)
        ops.push({ board: gone.card.board, cardId: gone.card.id, type: 'stop', sessionId: gone.card.session, at: now });
    if (ops.length) void this.boardo.send(ops);
    return items === next.items ? next : { ...next, items };
  }

  /** Boardo has this card, and it isn't done: not my part, and not the whole card. */
  private openInBoardo(cardId: string): boolean {
    const c = this.boardo.cards.find((x) => x.id === cardId);
    return !!c && c.myDone == null && !c.completed;
  }

  /**
   * Boardo is where a card is done or not. One finished here and reopened there (my part
   * undone, or set back to In progress) goes back to set aside on Today, its time kept, so it
   * doesn't stay done in the timeline while Projects offers it again. Only a finish Boardo has
   * surely heard of by the time these cards were asked for (`askedAt`): a Done tapped meanwhile,
   * or on another device that hasn't sent it yet, stands.
   */
  private followBoardo(askedAt: number): void {
    const day = this.days[this.today];
    if (!day || day.dayEnded != null) return;
    let next = day;
    for (const it of day.items) {
      if (!it.card || it.status !== 'done' || !this.openInBoardo(it.card.id) || this.boardo.waiting(it.card.id))
        continue;
      if (it.endedAt == null || atMinutes(day.key, it.endedAt) > askedAt - BOARDO_HEARD_MS) continue;
      next = A.reopen(next, it.id, this.n);
    }
    if (next !== day) this.put(next);
  }

  /**
   * Start work on a Boardo card from Projects: a task with no length (it counts up), at the
   * current point, like any task started. A card already going here is resumed or opened.
   */
  startCard(c: BoardoCard): void {
    if (!this.isToday) return;
    if (this.locked) return this.sayLocked();
    if (this.waiting) return this.askToStartDay('timer');
    const work = () =>
      this.day.items
        .filter((i) => i.card?.id === c.id)
        .map(timerOf)
        .join();
    if (this.whenCurrent(c.title, work, () => this.startCard(c))) return;
    const going = this.day.items.find((i) => i.card?.id === c.id && isActive(i));
    if (going) {
      if (going.status === 'paused') this.resume(going.id);
      else this.openSheet({ type: 'task', id: going.id });
      return;
    }
    const hue: Hue = c.board.hue === 'rose' ? 'orange' : isHue(c.board.hue) ? (c.board.hue as Hue) : 'cyan';
    const it = A.newItem({ title: c.title, min: 0, kind: 'task', hue, card: { id: c.id, board: c.board.id } });
    this.update((d) => A.addItem(d, it, this.n));
    this.startItem(it.id);
  }

  /** Stop work on a card without finishing it: Postpone, for a card. */
  setAside(id: string): void {
    const it = this.item(id);
    if (!it?.card || this.whenTaskCurrent(id, () => this.setAside(id))) return;
    this.confirm = null;
    this.update((d) => A.patchItem(d, id, A.setAside(it, this.n)), `${it.title} set aside`);
  }

  /** Save the days changed since the last save. False if that failed (they stay waiting). */
  async flush(): Promise<boolean> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.pending.size) return true;
    const keys = [...this.pending];
    this.pending.clear();
    const taken = new Map(keys.map((k) => [k, this.unsent.get(k) ?? {}]));
    for (const k of keys) this.unsent.delete(k);
    try {
      // Saved with what was done to them, and (signed in) that queued to go to the account.
      await db.commit(
        keys
          .filter((k) => Object.keys(taken.get(k)!).length)
          .map((k) => ({ kind: 'day', key: k, patch: taken.get(k)! })),
        !!this.session,
      );
    } catch (e) {
      for (const k of keys) {
        this.unsent.set(k, merge(taken.get(k)!, this.unsent.get(k) ?? {}));
        this.pending.add(k);
      }
      this.saveFailed(e);
      return false;
    }
    if (this.session) this.sync.kick();
    this.saveError = null;
    this.saveTries = 0;
    this.post({ t: 'days', keys });
    void db.requestPersistence();
    return true;
  }

  /**
   * A save failed (storage full, or the browser refused): say so until one works, and try
   * again, less often each time, up to once a minute. Nothing reloads meanwhile.
   */
  /** Everything is about to be replaced: a save still waiting would write the old plan back over it. */
  private dropPending(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.pending.clear();
    this.unsent.clear();
  }

  /**
   * A repeating series, goal, review or the shared settings changed from `prev` to `next` (null:
   * none): saved with what changed, and (signed in) that queued to go to the account.
   */
  private async saveRecord(kind: RecordKind, key: string, prev: unknown, next: unknown): Promise<void> {
    const patch = stamp(diff(kind, prev, next), this.hlc.now());
    if (!Object.keys(patch).length) return;
    await db.commit([{ kind, key, patch }], !!this.session);
    if (this.session) this.sync.kick();
  }

  private saveFailed(e: unknown): void {
    console.error('Could not save', e);
    this.saveError = e instanceof DOMException && e.name === 'QuotaExceededError' ? 'full' : 'failed';
    if (!this.saveTimer)
      this.saveTimer = setTimeout(() => void this.flush(), Math.min(60_000, 2000 * 2 ** this.saveTries++));
  }

  private post(m: Msg): void {
    try {
      this.bc?.postMessage(m);
    } catch {
      /* ignore */
    }
  }

  /** Another tab wrote something: reload what we have cached. */
  private async onMessage(m: Msg): Promise<void> {
    // Its changes are in the outbox: this tab may be the one that sends them.
    this.sync.kick();
    if (m.t === 'account') return this.loadSession();
    if (m.t === 'all') return this.reloadAll();
    if (m.t === 'goals') {
      this.goals = await db.getGoals();
      return;
    }
    if (m.t === 'reviews') {
      this.reviews = await db.getReviews();
      return;
    }
    if (m.t === 'settings') {
      const s = await db.getSettings();
      if (!s) return;
      const prev = this.settings;
      this.settings = stored(s);
      if (prev.defStart !== this.settings.defStart || prev.defWrap !== this.settings.defWrap) this.rebuildUnstored();
      return;
    }
    if (m.t === 'series') {
      this.series = await db.getAllSeries();
      this.rebuildUnstored();
      return;
    }
    for (const k of m.keys) {
      if (!(k in this.days)) continue;
      // One key at a time, after the await. What was done here and not saved yet (saves wait a
      // moment) goes on top of what's stored, path by path, the later of each winning: neither
      // is lost (shared/lww.ts).
      if (this.unsent.has(k)) {
        const replica = merge(await db.getReplica('day', k), this.unsent.get(k) ?? {});
        const d = normalizeDay(fromPaths('day', k, replica));
        if (d) this.days = { ...this.days, [k]: d };
        continue;
      }
      const d = await db.getDay(k);
      if (d) {
        this.days = { ...this.days, [k]: d };
        this.stored.add(k);
      } else if (this.stored.has(k)) {
        // Deleted (an import or erase on another device): back to a day built from repeats.
        this.stored.delete(k);
        this.days = { ...this.days, [k]: this.blankDay(k) };
      }
    }
  }

  /** Records changed from the account: reload them here and in this device's other tabs. */
  private fromAccount(ids: string[]): void {
    const keys = ids.filter((id) => id.startsWith('day:')).map((id) => id.slice(4));
    const msgs: Msg[] = [];
    if (ids.some((id) => id.startsWith('settings:'))) msgs.push({ t: 'settings' });
    if (ids.some((id) => id.startsWith('series:'))) msgs.push({ t: 'series' });
    if (ids.some((id) => id.startsWith('goal:'))) msgs.push({ t: 'goals' });
    if (ids.some((id) => id.startsWith('review:'))) msgs.push({ t: 'reviews' });
    if (keys.length) msgs.push({ t: 'days', keys });
    if (keys.some((k) => !(k in this.days) && k < this.today)) void this.loadPast();
    this.landing = this.landing.then(async () => {
      for (const m of msgs) {
        this.post(m);
        await this.onMessage(m);
      }
    });
  }

  private setCatchingUp(on: boolean): void {
    if (this.catchUpTimer) clearTimeout(this.catchUpTimer);
    this.catchUpTimer = null;
    if (on) {
      this.catchingUp = true;
      // Not for long: an account slow to answer shouldn't keep the timer from working.
      this.catchUpTimer = setTimeout(() => this.setCatchingUp(false), CATCH_UP_MS);
      return;
    }
    if (!this.catchingUp) return;
    this.catchingUp = false;
    void this.landing.then(() => this.runHeld());
  }

  /**
   * A timer tap while catching up waits until caught up, then goes ahead if what it was tapped
   * on is as it was; otherwise it says so (a timer stopped on another device, say). True: held.
   */
  private whenCurrent(title: string, sig: () => string, run: () => void): boolean {
    if (!this.catchingUp) return false;
    this.held = { title, sig, was: sig(), run };
    this.nudge = { text: CATCHING_UP, at: Date.now(), quiet: true };
    this.say(CATCHING_UP);
    return true;
  }

  /** whenCurrent() for a task: it waits on that task's timer. */
  private whenTaskCurrent(id: string, run: () => void): boolean {
    const sig = () => {
      const it = this.item(id);
      return it ? timerOf(it) : '';
    };
    return this.whenCurrent(this.item(id)?.title ?? 'That task', sig, run);
  }

  /** whenCurrent() for the day as a whole: it waits on whether it has started, and its timers. */
  private dayTimers = () => JSON.stringify([this.day.dayStarted, this.day.dayEnded, this.day.items.map(timerOf)]);

  private runHeld(): void {
    const h = this.held;
    this.held = null;
    if (this.nudge?.text === CATCHING_UP) this.nudge = null;
    if (!h) return;
    if (h.sig() === h.was) return h.run();
    const text = `${h.title} was changed on another device. Have a look, then try again.`;
    this.nudge = { text, at: Date.now(), quiet: true };
    this.say(text);
  }

  /**
   * Repeating tasks saved before they had an order take the order they have on the latest
   * stored day up to today, the plan as the user last arranged it.
   */
  private async fillSeriesOrder(): Promise<void> {
    const base = Object.keys(this.days)
      .filter((k) => this.stored.has(k) && k <= this.today)
      .sort()
      .pop();
    const next = orderSeries(this.series, base ? this.days[base] : undefined);
    if (next === this.series) return;
    this.series = next;
    for (const s of next) await db.putSeries(s);
    this.rebuildUnstored();
  }

  /** Days that exist only as templates get rebuilt after repeating items or defaults change. */
  private rebuildUnstored(): void {
    const next = { ...this.days };
    for (const k of Object.keys(next)) if (!this.stored.has(k)) next[k] = this.blankDay(k);
    this.days = next;
  }

  private async reloadAll(): Promise<void> {
    // Everything is read first and swapped in at once: meanwhile the plan on screen stays as it
    // was, rather than a day rebuilt from repeating tasks that a tap could save over the real one.
    const keys = [...new Set([this.viewKey, this.today, addDays(this.today, 1), ...this.weekKeys])];
    const [s, series, goals, reviews, recent, got] = await Promise.all([
      db.getSettings(),
      db.getAllSeries(),
      db.getGoals(),
      db.getReviews(),
      db.getDays(addDays(this.today, -RECENT_DAYS), addDays(this.today, -1)),
      Promise.all(keys.map((k) => db.getDay(k))),
    ]);
    this.dropPending();
    this.goals = goals;
    this.reviews = reviews;
    this.settings = s ? stored(s) : { ...DEFAULT_SETTINGS };
    this.series = series;
    const days: Record<string, Day> = {};
    this.stored.clear();
    for (const d of [...recent, ...got.filter((d): d is Day => !!d)]) {
      days[d.key] = d;
      this.stored.add(d.key);
    }
    for (const k of keys) days[k] ??= this.blankDay(k);
    this.days = days;
    this.sheet = null;
    this.confirm = null;
    this.resched = null;
    await this.loadPast();
  }

  // ---------- small helpers ----------

  say(m: string): void {
    this.announce = m;
  }

  item(id: string): Item | undefined {
    return A.find(this.day, id);
  }

  /** Apply a pure action to the viewed day and store the result. An ended day stays as it is. */
  private update(fn: (d: Day) => Day, msg?: string): void {
    if (this.locked) return;
    const next = fn(this.day);
    if (next !== this.day) this.put(next);
    if (msg) this.say(msg);
  }

  /** Minutes since midnight of today (for defaults like a new fixed item's time). */
  nowToday(): number {
    return minutesInto(this.today, this.clock);
  }

  // ---------- navigation & UI state ----------

  async switchDay(key: string): Promise<void> {
    if (key === this.viewKey && this.days[key]) return;
    // Tapping through days quickly: only the last tap wins, whatever order the loads finish in.
    const nav = ++this.nav;
    await this.ensureDay(key);
    if (nav !== this.nav) return;
    this.fixBlankTitle();
    this.viewKey = key;
    this.sheet = null;
    this.confirm = null;
    this.nudge = null;
    this.resched = null;
    this.drag = null;
    this.hover = null;
    // Keep the week strip on the week of the day being shown (swiping can cross into the next).
    const week = Math.floor(dayDiff(mondayOf(this.today), key) / 7);
    if (week !== this.weekOff) {
      this.weekOff = week;
      void this.loadWeek();
    }
  }

  /** Day, week or month. */
  setView(v: View): void {
    this.view = v;
    this.sheet = null;
    this.confirm = null;
    this.nudge = null;
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage blocked */
    }
    if (v === 'month') void this.loadMonth();
    else void this.loadWeek();
  }

  /** The day a step back or forward lands on: a day, a week or a month, as the view goes. */
  stepKey(dir: -1 | 1): string {
    if (this.view === 'week') return addDays(this.viewKey, 7 * dir);
    if (this.view === 'month') return addMonths(this.viewKey, dir);
    return addDays(this.viewKey, dir);
  }

  async step(dir: -1 | 1): Promise<void> {
    await this.switchDay(this.stepKey(dir));
    if (this.view === 'month') await this.loadMonth();
  }

  /** The days the month view shows. */
  async loadMonth(): Promise<void> {
    await Promise.all(monthGrid(this.viewKey).map((k) => this.ensureDay(k)));
  }

  /** Open a day from the week or month view. */
  async openDay(key: string): Promise<void> {
    await this.switchDay(key);
    this.setView('day');
  }

  /** Open a task on another day (week or month view): that day becomes the anchor. */
  async openTaskOn(key: string, id: string): Promise<void> {
    if (key !== this.viewKey) await this.switchDay(key);
    this.openSheet({ type: 'task', id });
  }

  /** New task on a day (week or month view), at a time if one was picked (a fixed time). */
  async addOn(key: string, at?: number): Promise<void> {
    if (key !== this.viewKey) await this.switchDay(key);
    if (this.locked) return this.sayLocked();
    this.openSheet({ type: 'add', at });
  }

  /**
   * Move a task to another day, or to another time (`at`) on its own day, from the calendar.
   * A fixed time takes the new time. Any other task goes where `at` falls in that day's plan.
   * From a day that hasn't started it simply moves; from one under way it's set aside as moved
   * (with Undo), like Move to another day. Ended days stay as they are.
   */
  async moveItem(from: string, id: string, to: string, at?: number): Promise<void> {
    const src = await this.ensureDay(from);
    const dst = from === to ? src : await this.ensureDay(to);
    if (src.dayEnded != null || dst.dayEnded != null) return this.sayLocked();
    const it = A.find(src, id);
    if (!it || (untimed(it.kind) && from === to)) return;
    const n = minutesInto(to, this.clock);
    const snap = at == null ? null : Math.max(0, Math.round(at / 15) * 15);
    const place = (d: Day, item: Item): Day => {
      if (snap == null) return A.addItem(d, item, n);
      if (item.kind === 'fixed')
        return A.placeFixed(
          A.addItem({ ...d, items: d.items.filter((x) => x.id !== item.id) }, { ...item, fixedAt: snap }, n),
          item.id,
          n,
        );
      const rest = { ...d, items: d.items.filter((x) => x.id !== item.id) };
      const rows = schedule(this.planOf(rest), n).rows;
      const before = rows.find((r) => r.it.status === 'todo' && !untimed(r.it.kind) && r.start >= snap - 1e-6);
      const at_ = before ? rest.items.findIndex((x) => x.id === before.it.id) : rest.items.length;
      const items = [...rest.items];
      items.splice(at_, 0, item);
      return { ...rest, items };
    };
    if (from === to) {
      if (it.status !== 'todo') return;
      this.put(place(src, it));
      return;
    }
    if (src.dayStarted == null && it.status === 'todo') {
      this.put(A.remove(src, id));
      this.put(place(dst, A.freshCopy(it)));
    } else {
      const res = A.moveOut(src, id, to, minutesInto(from, this.clock));
      if (!res) return;
      this.put(res.day);
      this.put(place(dst, res.copy));
    }
    this.say(`${it.title} moved to ${shortDate(keyDate(to))}`);
  }

  backToToday(): void {
    this.weekOff = 0;
    void this.switchDay(this.today).then(() => (this.view === 'month' ? this.loadMonth() : this.loadWeek()));
  }

  shiftWeek(d: -1 | 1): void {
    this.weekOff += d;
    void this.loadWeek();
  }

  /** Show a screen in place of the plan (closing anything open over it). */
  openScreen(s: Screen): void {
    this.fixBlankTitle();
    this.sheet = null;
    this.confirm = null;
    this.nudge = null;
    this.importMsg = null;
    this.drag = null;
    if (s.type === 'settings' && this.screen.type !== 'settings') this.screenBefore = this.screen;
    this.screen = s;
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }

  /** Back from Settings to the screen it was opened from. */
  leaveSettings(): void {
    this.openScreen(this.screenBefore.type === 'settings' ? { type: 'today' } : this.screenBefore);
  }

  openSheet(s: Sheet): void {
    this.fixBlankTitle();
    this.sheet = s;
    this.confirm = null;
    this.nudge = null;
    this.importMsg = null;
    if (s.type === 'add') this.resched = null;
  }

  closeSheet(): void {
    this.fixBlankTitle();
    // Closing the account sheet past the passkey offer is a "Not now".
    if (this.sheet?.type === 'account' && complete(this.session?.user)) this.offerPasskey = false;
    this.sheet = null;
    this.confirm = null;
  }

  /** A title cleared in the task sheet becomes "Untitled" once the sheet goes away. */
  private fixBlankTitle(): void {
    if (this.sheet?.type !== 'task') return;
    const it = this.item(this.sheet.id);
    if (it && !it.title.trim()) this.edit(it.id, { title: 'Untitled' });
  }

  arm(type: ConfirmType, id: string): void {
    this.confirm = { type, id, at: Date.now() };
  }

  armed(type: ConfirmType, id: string): boolean {
    return !!this.confirm && this.confirm.type === type && this.confirm.id === id;
  }

  disarm(): void {
    this.confirm = null;
  }

  // ---------- timer ----------

  /** A check or a Start button was tapped before the day started: say to start it first. */
  askToStartDay(what: 'check' | 'timer'): void {
    // The Start my day button is only on Today's day view: elsewhere, say where it is.
    const first =
      this.screen.type === 'today' && this.view === 'day' ? 'Start your day first' : 'Start your day on Today first';
    const text = !this.isToday
      ? "This day hasn't started yet. Mark it done once it has."
      : what === 'check'
        ? `${first}, then mark it done.`
        : `${first}, then start the timer.`;
    this.nudge = { text, at: Date.now() };
    this.say(text);
  }

  /** Something on an ended day was tapped: say why nothing happens. */
  sayLocked(): void {
    this.nudge = { text: this.lockedText, at: Date.now() };
    this.say(this.lockedText);
  }

  startDay(): void {
    unlockAudio();
    if (this.whenCurrent('Today', this.dayTimers, () => this.startDay())) return;
    this.nudge = null;
    const n = this.n;
    const timed = (i: Item) => i.status === 'todo' && i.kind !== 'buffer' && !untimed(i.kind);
    const first = this.day.items.find((i) => timed(i) && i.kind === 'task') ?? this.day.items.find(timed);
    if (first) {
      this.alerted.delete(first.id);
      this.finishElsewhere();
    }
    this.update(
      // The day's hours first: what still fits before the wrap-up depends on them.
      (d) => A.startDay({ ...d, ...this.opening(d, n) }, n),
      first ? `${first.title} started` : 'Day started',
    );
    this.celebrate = { kind: 'start', at: n, first: first?.title ?? null };
    if (first) this.offerNotifications('timer');
  }

  /** "End my day", optionally moving what's left (one-off tasks and checks) to the next day. */
  async endDay(moveRest: boolean): Promise<void> {
    if (this.whenCurrent('Today', this.dayTimers, () => void this.endDay(moveRest))) return;
    const key = this.viewKey,
      n = this.n;
    let d = A.endDay(this.day, n);
    const left = moveRest
      ? d.items.filter((i) => i.status === 'todo' && i.kind !== 'buffer' && i.repeat === 'Once')
      : [];
    const copies: Item[] = [];
    for (const it of left) {
      const res = A.moveOut(d, it.id, addDays(key, 1), n);
      if (res) {
        d = res.day;
        copies.push(res.copy);
      }
    }
    this.sheet = null;
    this.put(d);
    this.celebrate = { kind: 'end', stats: dayStats(d, n), moved: copies.length };
    if (copies.length) {
      const next = await this.ensureDay(addDays(key, 1));
      this.put(copies.reduce((day, c) => A.addItem(day, c), next));
    }
    this.say(copies.length ? `Day ended; ${copies.length} moved to tomorrow` : 'Day ended');
    this.tick(); // past midnight, Today moves on to the new date
  }

  /** The one change an ended day takes: opening it again. */
  reopenDay(): void {
    this.put(A.reopenDay(this.day));
    this.say('Day reopened');
    this.tick();
  }

  /** Tick a check off, or untick it. Ticking waits for the day to start, like Start does. */
  toggleCheck(id: string): void {
    const it = this.item(id);
    if (!it || (it.status !== 'done' && this.waiting)) return;
    this.update((d) => A.toggleCheck(d, id, this.n), `${it.title} ${it.status === 'done' ? 'not done' : 'done'}`);
  }

  /**
   * Tap a habit: tick it, add one (`by` minutes for a time habit), or mark a slip. Like a check,
   * it waits for the day to start; taking a tick back never does.
   */
  tapHabit(id: string, by = 1): void {
    const it = this.item(id);
    if (!it || !isHabit(it)) return;
    const undo = it.habit.type === 'check' ? it.status === 'done' : it.habit.type === 'quit' && !!it.progress;
    if (this.waiting && !undo) return;
    this.update((d) => A.tapHabit(d, id, this.n, by), this.habitSaid(id, by));
  }

  /** Set how much of an amount or time habit is done (minutes added by hand, for time). */
  setHabitProgress(id: string, value: number): void {
    const it = this.item(id);
    if (!it || !isHabit(it) || this.waiting) return;
    this.update((d) => A.setProgress(d, id, value, this.n), this.habitSaid(id, 0, value));
  }

  private habitSaid(id: string, by: number, value?: number): string {
    const it = this.item(id);
    if (!it || !isHabit(it)) return '';
    const h = it.habit;
    if (h.type === 'check') return `${it.title} ${it.status === 'done' ? 'not done' : 'done'}`;
    if (h.type === 'quit') return it.progress ? `${it.title}: slip taken back` : `${it.title}: slip marked`;
    const v = value ?? (it.progress ?? 0) + by;
    return `${it.title}: ${v} ${h.type === 'time' ? 'min' : h.unit || ''}`.trim();
  }

  /** The welcome's answers become the defaults for new days. */
  completeOnboarding(o: { start: number; length: number; flex: boolean }): void {
    this.setSettings({
      defStart: o.start,
      dayLength: o.length,
      defWrap: o.start + o.length,
      flexStart: o.flex,
      onboarded: true,
    });
  }

  startItem(id: string): void {
    const it = this.item(id);
    if (!it || it.kind === 'buffer' || untimed(it.kind)) return;
    unlockAudio();
    if (this.whenTaskCurrent(id, () => this.startItem(id))) return;
    this.alerted.delete(id);
    this.confirm = null;
    this.nudge = null;
    this.finishElsewhere();
    const n = this.n;
    this.update((d) => {
      if (d.dayStarted != null) return A.startItem(d, id, n);
      // This starts the day (Reschedule → Start now before Start my day): from the plan as shown,
      // with the day's hours set first, as Start my day does.
      return A.startItem({ ...this.planDay, ...this.opening(d, n) }, id, n);
    }, `${it.title} started`);
    this.offerNotifications('timer');
  }

  /**
   * A day's hours once it starts at `n`. A flexible day runs its usual length from now. Any
   * other day keeps its planned length when it starts late, so its wrap-up moves later by as
   * much; starting early leaves the wrap-up where it was.
   */
  private opening(d: Day, n: number): Partial<Day> {
    const s = this.settings;
    if (s.flexStart) return { dayStart: n, wrap: n + s.dayLength };
    const length = d.wrap > d.dayStart ? d.wrap - d.dayStart : s.dayLength;
    return { wrap: Math.max(d.wrap, n + length) };
  }

  /**
   * Today's tasks still to do follow the now line (schedule()); here the ones that no longer fit
   * before a fixed item or buffer go after it, and buffers get their times (A.letThrough()).
   * Not while a task is being dragged.
   */
  private followNow(): void {
    this.followedAt = this.clock;
    const d = this.days[this.today];
    if (!d || this.drag) return;
    const next = A.letThrough(d, minutesInto(this.today, this.clock));
    if (next !== d) this.put(next);
  }

  /** Only one timer at a time across all days: finish one left running on another day. */
  private finishElsewhere(): void {
    const e = this.elsewhere;
    if (!e) return;
    const m = minutesInto(e.key, this.clock);
    // A Boardo card is only ever set aside, never marked done, by starting something else (only
    // Done marks my part done in Boardo).
    this.put(
      e.it.card ? A.patchItem(this.days[e.key], e.it.id, A.setAside(e.it, m)) : A.finish(this.days[e.key], e.it.id, m),
    );
  }

  pause(id: string): void {
    const it = this.item(id);
    if (!it || this.whenTaskCurrent(id, () => this.pause(id))) return;
    const left = Math.max(0, (it.min - worked(it, this.n)) * 60);
    this.update(
      (d) => A.pause(d, id, this.n),
      it.card
        ? `${it.title} paused`
        : `${it.title} paused, ${Math.floor(left / 60)} minutes ${Math.floor(left % 60)} seconds left`,
    );
  }

  resume(id: string): void {
    unlockAudio();
    if (this.whenTaskCurrent(id, () => this.resume(id))) return;
    this.update((d) => A.resume(d, id, this.n), `${this.item(id)?.title} resumed`);
  }

  finish(id: string): void {
    this.confirm = null;
    if (this.whenTaskCurrent(id, () => this.finish(id))) return;
    this.update((d) => A.finish(d, id, this.n), `${this.item(id)?.title} done`);
  }

  /**
   * The Done button. Well over time, the task may have been finished a while ago and Done tapped
   * late, so ask: when time was up, or just now (see finishAt).
   */
  done(id: string): void {
    if (this.whenTaskCurrent(id, () => this.done(id))) return;
    const it = this.item(id);
    if (it && !it.card && isActive(it) && worked(it, this.n) - it.min >= ASK_FINISH_OVER) this.arm('finish', id);
    else this.finish(id);
  }

  /** When an over-time task's time was up: where it would have ended without running over. */
  timeUpAt(id: string): number | null {
    const it = this.item(id);
    return it && isActive(it) ? it.startedAt! + it.pausedFor + it.min : null;
  }

  /** Done, logged as finished at `at` (no later than now). */
  finishAt(id: string, at: number): void {
    this.confirm = null;
    if (this.whenTaskCurrent(id, () => this.finishAt(id, at))) return;
    const end = Math.min(at, this.n);
    this.update((d) => A.finish(d, id, end), `${this.item(id)?.title} done at ${fT(end, this.settings.clock24)}`);
  }

  // ---------- correcting recorded times ----------

  /** How far a task's recorded start and finish can be moved (now is the limit). */
  timeBounds(id: string): { start: A.Range; end: A.Range | null } | null {
    return A.timeBounds(this.day, id, this.n, this.n);
  }

  /** "I actually started at 9:10" / "I finished at 9:50": correct a task's recorded times. */
  retime(id: string, t: { start?: number; end?: number }): void {
    this.update((d) => A.retime(d, id, t, this.n, this.n));
  }

  markDone(id: string, start: number, end: number): void {
    this.resched = null;
    this.update((d) => A.markDone(d, id, start, end), `${this.item(id)?.title} marked done`);
  }

  /** Done without its timer: a task still to come, logged as just finished (A.markDoneNow). */
  markDoneNow(id: string): void {
    if (this.waiting) return this.askToStartDay('check');
    if (this.whenTaskCurrent(id, () => this.markDoneNow(id))) return;
    this.resched = null;
    this.confirm = null;
    this.update((d) => A.markDoneNow(d, id, this.n), `${this.item(id)?.title} marked done`);
  }

  reopen(id: string): void {
    const had = new Set(this.day.items.map((i) => i.id));
    this.update((d) => A.reopen(d, id, this.n), `${this.item(id)?.title} reopened`);
    // Reopened from its sheet with time worked: the sheet follows the "continued" copy, the part
    // still to do.
    const copy = this.day.items.find((i) => !had.has(i.id));
    if (copy && this.sheet?.type === 'task' && this.sheet.id === id) this.sheet = { type: 'task', id: copy.id };
  }

  skip(id: string): void {
    this.update((d) => A.skip(d, id), `${this.item(id)?.title} skipped`);
  }

  /** Restore a skipped item, or undo a move (removing the untouched copy from the other day). */
  async restore(id: string): Promise<void> {
    if (this.locked) return;
    const it = this.item(id);
    if (!it) return;
    const key = this.viewKey;
    if (it.status === 'postponed' && it.movedKey && it.movedId) {
      const target = await this.ensureDay(it.movedKey);
      const copy = A.find(target, it.movedId);
      if (copy && copy.status === 'todo') this.put(A.remove(target, it.movedId));
    }
    const d = this.days[key];
    if (d) this.put(A.restore(d, id));
    this.say(`${it.title} restored`);
  }

  // ---------- postpone / reschedule ----------

  async postpone(id: string, where: 'later' | 'tomorrow'): Promise<void> {
    if (this.locked) return;
    const it = this.item(id);
    if (!it) return;
    this.confirm = null;
    if (isActive(it) && this.whenTaskCurrent(id, () => void this.postpone(id, where))) return;
    if (where === 'tomorrow') return this.moveToDay(id, addDays(this.today, 1), `${it.title} moved to tomorrow`);
    // A timer left running on an earlier day: "later today" means today, not that day.
    if (this.viewKey !== this.today && isActive(it))
      return this.moveToDay(id, this.today, `${it.title} moved to later today`);
    this.update((d) => A.postponeLater(d, id, this.n), `${it.title} moved to later today`);
  }

  openResched(id: string): void {
    let t = Math.ceil((this.n + 60) / 15) * 15;
    if (t > 1425) t = 1425;
    this.resched = { id, time: hhmm(t), date: addDays(this.today, 1) };
    this.confirm = null;
  }

  reschedNow(id: string): void {
    if (this.locked) return;
    const it = this.item(id);
    if (!it) return;
    const res = A.reschedNow(this.day, id);
    this.resched = null;
    this.put(res.day);
    if (res.start) this.startItem(id);
    else this.say(`${it.title} is up next`);
  }

  reschedLater(id: string): void {
    const it = this.item(id);
    if (!it || !this.resched) return;
    const tm = Math.max(clockToDay(hm(this.resched.time), Math.max(this.day.wrap, this.n)), this.n);
    this.resched = null;
    this.update(
      (d) => A.reschedLater(d, id, tm, this.n),
      `${it.title} moved to around ${fT(tm, this.settings.clock24)}`,
    );
  }

  async moveToDay(id: string, key: string, msg?: string): Promise<void> {
    if (this.locked) return;
    if (!key || key === this.viewKey) return;
    const src = this.viewKey;
    const res = A.moveOut(this.day, id, key, this.n);
    if (!res) return;
    this.resched = null;
    this.confirm = null;
    this.put(res.day);
    const target = await this.ensureDay(key);
    this.put(A.addItem(target, res.copy, minutesInto(key, this.clock)));
    if (this.viewKey !== src) return;
    this.say(msg ?? `${res.copy.title} moved to ${shortDate(keyDate(key))}`);
  }

  // ---------- editing ----------

  addTask(o: {
    title: string;
    min: number;
    kind: Kind;
    hue: Hue;
    fixedAt: number | null;
    repeat?: string;
    habit?: Habit;
  }): void {
    const { repeat: asked, habit, ...fields } = o;
    // A habit always repeats: on its days, or every day for one due a number of times a week.
    const repeat =
      o.kind === 'habit' ? (habit?.per === 'day' && asked && asked !== 'Once' ? asked : 'Every day') : asked;
    const it = A.newItem({
      ...fields,
      min: untimed(o.kind) ? 0 : o.min,
      fixedAt: o.kind === 'fixed' ? o.fixedAt : null,
      ...(o.kind === 'habit' && habit ? { habit, progress: 0 } : {}),
    });
    this.sheet = null;
    this.update((d) => A.addItem(d, it, this.n), `Added ${it.title}`);
    // A repeating task becomes a series straight away, like choosing a repeat in the task sheet.
    if (repeat && repeat !== 'Once') void this.setRepeat(it.id, repeat);
    if (it.kind === 'fixed') this.offerNotifications('fixed');
  }

  /** Edit fields. Series fields on a repeating item also flow to later days not yet started. */
  edit(id: string, patch: Partial<Item>): void {
    const it = this.item(id);
    if (!it) return;
    // A new time puts a fixed item where that time falls in the plan.
    this.update((d) => {
      const next = A.patchItem(d, id, patch);
      return 'fixedAt' in patch ? A.placeFixed(next, id, this.n) : next;
    });
    if (it.seriesId && Object.keys(patch).some((k) => SERIES_FIELDS.includes(k as keyof Item)))
      this.queueSeriesSync(it.seriesId, this.viewKey);
  }

  /**
   * Save the task sheet's Edit form: every changed field in one change, then the repeat (which
   * may start or end a series). Turning a check into a timed task puts it back to do; turning a
   * task into a check keeps it done if it was.
   */
  async saveTask(id: string, form: TaskForm): Promise<void> {
    if (this.locked) return;
    const it = this.item(id);
    if (!it) return;
    const title = form.title.trim() || 'Untitled';
    const f = { ...form, title };
    const patch: Partial<Item> = {};
    const keys = ['title', 'kind', 'min', 'hue', 'fixedAt', 'note', 'subtasks', 'goalId', 'habitId'] as const;
    for (const k of keys)
      if (JSON.stringify(f[k] ?? null) !== JSON.stringify(it[k] ?? null)) Object.assign(patch, { [k]: f[k] });
    if ('kind' in patch && f.kind === 'check') Object.assign(patch, { status: it.status === 'done' ? 'done' : 'todo' });
    else if ('kind' in patch && it.kind === 'check') Object.assign(patch, { status: 'todo', endedAt: null });
    if (Object.keys(patch).length) {
      this.update((d) => {
        const next = A.patchItem(d, id, patch);
        return 'fixedAt' in patch || 'kind' in patch ? A.placeFixed(next, id, this.n) : next;
      }, `Updated ${title}`);
      if (it.seriesId) this.queueSeriesSync(it.seriesId, this.viewKey);
    }
    if (f.repeat !== it.repeat) await this.setRepeat(id, f.repeat);
    if (f.kind === 'fixed' && it.kind !== 'fixed') this.offerNotifications('fixed');
  }

  setKind(id: string, k: Kind): void {
    const it = this.item(id);
    this.update((d) => A.placeFixed(A.setKind(d, id, k), id, this.n));
    if (it?.seriesId) this.queueSeriesSync(it.seriesId, this.viewKey);
    if (k === 'fixed') this.offerNotifications('fixed');
  }

  move(id: string, dir: -1 | 1): void {
    const it = this.item(id);
    const to = this.day.items.findIndex((i) => i.id === id) + dir;
    if (!it || to < 0 || to >= this.day.items.length) return;
    this.update((d) => A.move(d, id, dir), `Moved ${it.title} to position ${to + 1}`);
  }

  remove(id: string): void {
    const it = this.item(id);
    if (this.sheet?.type === 'task' && this.sheet.id === id) this.sheet = null;
    this.confirm = null;
    this.update((d) => A.remove(d, id), it ? `Deleted ${it.title}` : undefined);
  }

  /** Delete a repeating task from this day and every later day: its series ends the day before. */
  async removeWithLater(id: string): Promise<void> {
    if (this.locked) return;
    const it = this.item(id);
    const s = it?.seriesId ? this.series.find((x) => x.id === it.seriesId) : undefined;
    this.remove(id);
    if (!it || !s) return;
    const key = this.viewKey;
    this.say(`Deleted ${it.title} from later days too`);
    this.cancelSeriesSync(s.id);
    const before = addDays(key, -1);
    const ended = { ...s, until: s.until != null && s.until < before ? s.until : before };
    this.series = this.series.map((x) => (x.id === s.id ? ended : x));
    await this.saveRecord('series', s.id, s, ended);
    this.post({ t: 'series' });
    for (const d of await this.laterDays(key)) {
      const without = withoutSeries(d, s.id);
      if (without !== d) this.put(without);
    }
    this.rebuildUnstored();
  }

  toggleSub(id: string, sid: string): void {
    const it = this.item(id);
    if (!it) return;
    this.edit(id, { subtasks: it.subtasks.map((y) => (y.id === sid ? { ...y, d: !y.d } : y)) });
  }

  // Steps added from the task sheet without going through Edit task (several at once when pasted).
  addSubs(id: string, ts: string[]): void {
    const it = this.item(id);
    const add = ts.map((t) => t.trim()).filter(Boolean);
    if (!it || !add.length || this.locked) return;
    this.edit(id, { subtasks: [...it.subtasks, ...add.map((t) => ({ id: A.uid(), t, d: false }))] });
    if (it.seriesId) this.queueSeriesSync(it.seriesId, this.viewKey);
    if (add.length > 1) this.say(`Added ${add.length} subtasks`);
  }

  async setRepeat(id: string, repeat: string): Promise<void> {
    if (this.locked) return;
    const it = this.item(id);
    if (!it || it.repeat === repeat) return;
    if (repeat === 'Once') return this.stopRepeating(id);
    if (it.seriesId) {
      this.edit(id, { repeat });
      return;
    }
    const key = this.viewKey;
    const s = seriesFromItem({ ...it, repeat }, key, A.uid(), orderAt(this.series, this.day.items, id));
    this.series = [...this.series, s];
    this.update((d) => A.patchItem(d, id, { repeat, seriesId: s.id }));
    await this.saveRecord('series', s.id, null, s);
    this.post({ t: 'series' });
    await this.propagate(s, null, s.id, key);
  }

  async stopRepeating(id: string): Promise<void> {
    if (this.locked) return;
    const it = this.item(id);
    if (!it) return;
    const key = this.viewKey;
    const sid = it.seriesId;
    this.update((d) => A.patchItem(d, id, { repeat: 'Once', seriesId: null }), `${it.title} no longer repeats`);
    if (!sid) return;
    this.cancelSeriesSync(sid);
    const s = this.series.find((x) => x.id === sid);
    if (!s) return;
    const ended = { ...s, until: key };
    this.series = this.series.map((x) => (x.id === sid ? ended : x));
    await this.saveRecord('series', sid, s, ended);
    this.post({ t: 'series' });
    await this.propagate(ended, s, sid, key);
  }

  /** Series edits are batched: typing a title shouldn't rewrite every later day per keystroke. */
  private queueSeriesSync(sid: string, key: string): void {
    this.cancelSeriesSync(sid);
    this.seriesTimers.set(
      sid,
      setTimeout(() => {
        this.seriesTimers.delete(sid);
        void this.syncSeries(sid, key);
      }, SERIES_DELAY),
    );
  }

  private cancelSeriesSync(sid: string): void {
    const t = this.seriesTimers.get(sid);
    if (t) clearTimeout(t);
    this.seriesTimers.delete(sid);
  }

  /** Copy the edited item (on day `key`) back into its series and push the change to later days. */
  private async syncSeries(sid: string, key: string): Promise<void> {
    const it = this.days[key]?.items.find((i) => i.seriesId === sid);
    const old = this.series.find((x) => x.id === sid);
    if (!it || !old) return;
    const s: Series = { ...seriesFromItem(it, old.from, sid, old.order), until: old.until };
    this.series = this.series.map((x) => (x.id === sid ? s : x));
    await this.saveRecord('series', sid, old, s);
    this.post({ t: 'series' });
    await this.propagate(s, old, sid, key);
  }

  /**
   * Apply a series change (`prev` → `next`) to the other stored days not yet started, from today
   * on: earlier ones as well as later ones, so editing next Saturday's copy also changes the
   * copies on the days before it. Past days are never touched.
   */
  private async propagate(next: Series, prev: Series | null, sid: string, key: string): Promise<void> {
    for (const d of await this.openDays(key)) {
      const synced = syncSeriesInto(d, next, prev, sid);
      if (synced !== d) this.put(synced);
    }
    this.rebuildUnstored();
  }

  /** Stored days after `key` (never past days) that haven't been started. */
  private async laterDays(key: string): Promise<Day[]> {
    const after = addDays(key, 1);
    return this.unstartedFrom(after > this.today ? after : this.today);
  }

  /** Stored days from today on, other than `key`, that haven't been started. */
  private async openDays(key: string): Promise<Day[]> {
    return (await this.unstartedFrom(this.today)).filter((d) => d.key !== key);
  }

  private async unstartedFrom(from: string): Promise<Day[]> {
    await this.flush();
    const days = new Map((await db.getDays(from, '9999-12-31')).map((d) => [d.key, d]));
    // Include stored days held in memory, and prefer them: they're never older than the database.
    for (const [k, d] of Object.entries(this.days)) if (k >= from && this.stored.has(k)) days.set(k, d);
    return [...days.values()].filter((d) => d.dayStarted == null);
  }

  /**
   * After a repeating task is dragged past another repeating task, ask whether later days should
   * have it that way round too (`anchor` is the one it now sits before, or after). Not asked
   * when they already do, or on past days.
   */
  private reorderQuestion(id: string, dir: 'up' | 'down'): Sheet | null {
    const it = this.item(id);
    const mine = it?.seriesId ? this.series.find((x) => x.id === it.seriesId) : undefined;
    if (!it || !mine || this.viewKey < this.today) return null;
    const live = (x: Item) =>
      !!x.seriesId &&
      x.seriesId !== mine.id &&
      this.series.some((y) => y.id === x.seriesId && (y.until == null || y.until >= this.viewKey));
    const items = this.day.items;
    const i = items.findIndex((x) => x.id === id);
    const next = dir === 'up' ? items.slice(i + 1).find(live) : items.slice(0, i).reverse().find(live);
    const other = next && this.series.find((y) => y.id === next.seriesId);
    if (!other || (dir === 'up' ? mine.order < other.order : mine.order > other.order)) return null;
    return { type: 'reorder', id, anchor: other.id, dir };
  }

  /** "Later days too": move the repeating task on later days the way it was just moved here. */
  async reorderLaterDays(): Promise<void> {
    const q = this.sheet;
    if (q?.type !== 'reorder') return;
    this.sheet = null;
    const it = this.item(q.id);
    const s = it?.seriesId ? this.series.find((x) => x.id === it.seriesId) : undefined;
    if (!it || !s) return;
    const next = { ...s, order: orderNextTo(this.series, s.id, q.anchor, q.dir === 'up' ? 'before' : 'after') };
    this.series = this.series.map((x) => (x.id === s.id ? next : x));
    await this.saveRecord('series', s.id, s, next);
    this.post({ t: 'series' });
    for (const d of await this.laterDays(this.viewKey)) {
      const placed = placeBySeries(d, s.id, this.series);
      if (placed !== d) this.put(placed);
    }
    this.rebuildUnstored();
    this.say(`${it.title} moved on later days too`);
  }

  // ---------- drag ----------

  dragMove(dy: number, over: number): void {
    if (this.drag && (this.drag.dy !== dy || this.drag.over !== over)) this.drag = { ...this.drag, dy, over };
  }

  commitDrag(): void {
    if (this.locked) {
      this.drag = null;
      return;
    }
    const d = this.drag;
    this.drag = null;
    if (!d || d.over == null) return;
    const it = this.item(d.id);
    const from = this.day.items.findIndex((i) => i.id === d.id);
    let to = d.over;
    if (to > from) to--;
    if (to === from) return;
    this.update((day) => A.reorder(day, d.id, d.over!), it ? `Moved ${it.title} to position ${to + 1}` : undefined);
    // Only a drag asks about later days; starting a timer or rescheduling changes this day alone.
    const ask = this.reorderQuestion(d.id, to > from ? 'down' : 'up');
    if (ask) this.sheet = ask;
  }

  // ---------- day ----------

  /**
   * The day hours sheet: where the plan begins and the wrap-up, or once the day is under way,
   * when it really started (`started`) and the wrap-up. A flexible day's plan begins when it
   * started.
   */
  saveHours(start: number, wrap: number, started?: number): void {
    this.sheet = null;
    this.update((d) => {
      if (started == null || d.dayStarted == null) return { ...d, dayStart: start, wrap };
      const next = A.retimeDay(d, started, this.n);
      return { ...next, wrap, ...(this.settings.flexStart ? { dayStart: next.dayStarted! } : {}) };
    }, 'Day hours saved');
  }

  /** The earliest and latest the day can be said to have started. */
  dayStartBounds(): A.Range | null {
    return A.dayStartBounds(this.day, this.n);
  }

  clearDay(): void {
    this.confirm = null;
    this.update((d) => A.clearDay(d), 'Day cleared');
  }

  /** Replace the viewed day with the sample, planned from now (today) or the day's start. */
  loadSample(): void {
    this.confirm = null;
    this.sheet = null;
    const d = this.day;
    const start = this.isToday ? Math.max(d.dayStart, Math.ceil(this.n / 15) * 15) : d.dayStart;
    this.put({ ...d, dayStart: start, dayStarted: null, items: sampleItems(start) });
    this.say('Sample day loaded');
  }

  // ---------- settings & data ----------

  setSettings(patch: Partial<Settings>): void {
    const prev = this.settings;
    this.settings = { ...this.settings, ...patch };
    if ('defStart' in patch || 'defWrap' in patch) this.rebuildUnstored();
    if ('themePref' in patch) {
      try {
        localStorage.setItem(THEME_KEY, this.settings.themePref);
      } catch {
        /* storage blocked */
      }
    }
    // This device's own settings stored as they are; the shared ones also as a change to send.
    void db
      .putSettings(this.settings)
      .then(() => this.saveRecord('settings', 'main', sharedSettings(prev), sharedSettings(this.settings)))
      .then(() => this.post({ t: 'settings' }))
      .catch((e) => this.saveFailed(e));
  }

  async exportData(): Promise<void> {
    await this.flush();
    const [stored, series, goals, reviews] = await Promise.all([
      db.getAllDays().catch(() => [] as Day[]),
      db.getAllSeries().catch(() => this.series),
      db.getGoals().catch(() => this.goals),
      db.getReviews().catch(() => this.reviews),
    ]);
    // Days that couldn't be saved yet come from memory, so a backup keeps them.
    const unsaved = [...this.pending].map((k) => this.days[k]).filter(Boolean);
    const days = [...stored.filter((d) => !this.pending.has(d.key)), ...unsaved];
    download({
      app: 'elastic-day',
      version: 3,
      exportedAt: new Date().toISOString(),
      settings: this.settings,
      series,
      days,
      goals,
      reviews,
    });
  }

  async importFile(file: File): Promise<void> {
    const res = parseBackup(await file.text());
    if ('error' in res) {
      this.importMsg = { err: true, t: res.error };
      return;
    }
    if (res.kind === 'day') {
      this.put({ ...this.day, items: res.items, dayStart: res.dayStart, wrap: res.wrap });
      this.importMsg = { err: false, t: 'Imported. Your plan has been replaced with the backup.' };
      return;
    }
    this.dropPending();
    await db.replaceAll(
      {
        days: res.days,
        series: res.series,
        settings: res.settings,
        goals: res.goals,
        reviews: res.reviews,
      },
      // Signed in, the account follows: deliberately, as of now.
      this.session ? this.hlc.now() : undefined,
    );
    this.sync.kick();
    try {
      localStorage.setItem(THEME_KEY, res.settings.themePref);
    } catch {
      /* storage blocked */
    }
    await this.reloadAll();
    this.post({ t: 'all' });
    this.importMsg = { err: false, t: 'Imported. Everything has been replaced with the backup.' };
  }

  async eraseAll(): Promise<void> {
    this.confirm = null;
    this.dropPending();
    // Signed in, the account's copy goes too: deliberately, as of now.
    await db.replaceAll({ days: [], series: [], settings: null }, this.session ? this.hlc.now() : undefined);
    this.sync.kick();
    try {
      localStorage.removeItem(THEME_KEY);
    } catch {
      /* storage blocked */
    }
    this.alerted.clear();
    this.viewKey = this.today;
    this.weekOff = 0;
    await this.reloadAll();
    this.post({ t: 'all' });
    this.say('Everything erased');
  }

  // ---------- goals ----------

  /** The quarter a day falls in, as '2026-Q4'. */
  quarterOf = quarterOf;

  private async saveGoal(g: Goal): Promise<void> {
    const prev = this.goals.find((x) => x.id === g.id) ?? null;
    this.goals = [...this.goals.filter((x) => x.id !== g.id), g];
    await this.saveRecord('goal', g.id, prev, g);
    this.post({ t: 'goals' });
  }

  addGoal(o: Pick<Goal, 'title' | 'why' | 'target' | 'milestones'> & { quarter: string }): Goal {
    const order = Math.max(-1, ...this.goals.filter((g) => g.quarter === o.quarter).map((g) => g.order)) + 1;
    const g: Goal = { id: A.uid(), status: 'open', order, ...o };
    void this.saveGoal(g);
    this.say(`Goal added: ${g.title}`);
    return g;
  }

  editGoal(id: string, patch: Partial<Omit<Goal, 'id'>>): void {
    const g = this.goals.find((x) => x.id === id);
    if (g) void this.saveGoal({ ...g, ...patch });
  }

  toggleMilestone(id: string, mid: string): void {
    const g = this.goals.find((x) => x.id === id);
    if (g) this.editGoal(id, { milestones: g.milestones.map((m) => (m.id === mid ? { ...m, done: !m.done } : m)) });
  }

  async removeGoal(id: string): Promise<void> {
    this.confirm = null;
    const g = this.goals.find((x) => x.id === id);
    this.goals = this.goals.filter((x) => x.id !== id);
    await this.saveRecord('goal', id, g ?? null, null);
    this.post({ t: 'goals' });
    if (g) this.say(`Goal deleted: ${g.title}`);
  }

  /** An unfinished goal carried into the next quarter: the same goal, starting again as open. */
  carryGoal(id: string): void {
    const g = this.goals.find((x) => x.id === id);
    if (!g) return;
    const next = addQuarters(g.quarter, 1);
    if (this.goals.some((x) => x.quarter === next && x.title === g.title)) return;
    this.addGoal({ quarter: next, title: g.title, why: g.why, target: g.target, milestones: g.milestones });
  }

  progressOf(g: Goal) {
    return goalProgress(g, this.dayAt, this.today, this.nowToday());
  }

  // ---------- reviews ----------

  /** The review that's due now: the quarter's at its turn, otherwise the week's. */
  dueReview: DueReview | null = $derived.by(() => {
    const n = minutesInto(this.today, this.clock);
    const done = this.reviews;
    // Only for stretches the app was used in: a day was started.
    const used = (from: string, to: string) => {
      for (let k = from; k <= to && k <= this.today; k = addDays(k, 1))
        if (this.dayAt(k)?.dayStarted != null) return true;
      return false;
    };
    return (
      dueQuarterly(this.today, done, used) ??
      dueWeekly(this.today, n, this.settings.reviewDay, this.settings.reviewAt, done, used)
    );
  });

  /** The numbers for this week so far, or any stretch of days. */
  numbersFor(from: string, to: string) {
    return reviewNumbers(this.dayAt, from, to, this.today, this.nowToday());
  }

  thisWeek(): [string, string] {
    return weekRange(this.today);
  }

  /** The goals a review looks at: the quarter's (for a week, the quarter it ends in). */
  goalsFor(due: { kind: 'week' | 'quarter'; id: string; to: string }): Goal[] {
    const q = due.kind === 'quarter' ? due.id : quarterOf(due.to);
    return this.goals.filter((g) => g.quarter === q).sort((a, b) => a.order - b.order);
  }

  /** Finish a review: keep its numbers and where each goal stood, to read back later. */
  async finishReview(due: DueReview): Promise<void> {
    // A quarter's goals not marked take the result the review suggested.
    if (due.kind === 'quarter')
      for (const g of this.goalsFor(due))
        if (g.status === 'open') this.editGoal(g.id, { status: suggestStatus(this.progressOf(g)) });
    const goals = this.goalsFor(due).map((g) => snapshot(g, this.progressOf(g)));
    const r: Review = {
      id: due.id,
      kind: due.kind,
      from: due.from,
      to: due.to,
      done: Date.now(),
      numbers: this.numbersFor(due.from, due.to),
      goals,
    };
    await this.saveReview(r);
    this.say(due.kind === 'week' ? 'Weekly review done' : 'Quarterly review done');
  }

  /** Not this time: the review goes away until the next one. */
  async skipReview(due: DueReview): Promise<void> {
    await this.saveReview({
      id: due.id,
      kind: due.kind,
      from: due.from,
      to: due.to,
      done: null,
      numbers: null,
      goals: [],
    });
  }

  private async saveReview(r: Review): Promise<void> {
    const prev = this.reviews.find((x) => x.id === r.id) ?? null;
    this.reviews = [...this.reviews.filter((x) => x.id !== r.id), r];
    await this.saveRecord('review', r.id, prev, r);
    this.post({ t: 'reviews' });
  }

  // ---------- account ----------

  /** Run an account action: one at a time, with its error (if any) shown in the account sheet. */
  private async accountAction(fn: () => Promise<void>): Promise<boolean> {
    if (this.accountBusy) return false;
    this.accountBusy = true;
    this.accountMsg = null;
    try {
      await fn();
      return true;
    } catch (e) {
      // Closing the browser's passkey prompt is an answer, not an error.
      if (!cancelled(e)) this.accountMsg = { err: true, t: e instanceof Error ? e.message : String(e) };
      if (e instanceof ApiError && e.status === 401 && this.session) await this.forgetSession();
      return false;
    } finally {
      this.accountBusy = false;
    }
  }

  signIn(): Promise<boolean> {
    return this.accountAction(async () => this.signedIn(await api.signInWithPasskey()));
  }

  /**
   * Passkeys offered in the email field's suggestions: waits quietly until one is picked. A
   * prompt that's closed, or replaced by another, says nothing.
   */
  async passkeyFromAutofill(): Promise<void> {
    if (this.session || !(await api.passkeyAutofill())) return;
    try {
      const r = await api.signInWithPasskey(true);
      if (this.session || this.accountBusy) return;
      this.accountBusy = true;
      try {
        await this.signedIn(r);
      } finally {
        this.accountBusy = false;
      }
    } catch (e) {
      if (!cancelled(e) && e instanceof ApiError && e.status) this.accountMsg = { err: true, t: e.message };
    }
  }

  /** Email a code, to sign in or to make an account (the same either way). */
  sendSignInCode(email: string): Promise<boolean> {
    return this.accountAction(() => api.sendCode(email));
  }

  signInWithCode(email: string, code: string): Promise<boolean> {
    return this.accountAction(async () => this.signedIn(await api.verifyCode(email, code)));
  }

  /**
   * Signed in on this device. A new account takes everything here. An existing one: a device
   * with nothing of its own just takes the account's plan; one with its own plan asks first.
   */
  private async signedIn(r: SignedIn): Promise<void> {
    await this.flush();
    // Signing in where a sign-in is still syncing (a passkey on the sign-in page while asked
    // which plan to keep, say): stop it first. Otherwise what happens to this device's plan below
    // (wiped for another account, replaced by the account's) is recorded as changes to send, and
    // sent as deletions: on 23 Oct 2026 that wiped an account.
    this.sync.stop();
    const session: Session = { token: r.token, user: r.user, device: A.uid() };
    await db.clearSync();
    // Someone else's plan is on this device (they signed out): it goes, so it never reaches this
    // account. It's safe in theirs.
    const owner = await db.getMeta<string>('owner');
    if (owner && owner !== r.user.id) await this.wipeDevice();
    this.session = session;
    // A new account still gets the welcome's questions; an existing one already has its settings.
    if (!r.fresh && !this.settings.onboarded) this.setSettings({ onboarded: true });
    cancelPush(); // the account sends this device's notifications from now on
    if (!r.fresh && (await this.hasOwnPlan())) {
      const info = await api.accountInfo(r.token).catch(() => null);
      // Asked first; the sign-in is only kept once it's answered. Asked too when there was no
      // telling (no answer): merging this plan into one the account has can't be undone.
      if (!info || info.records) {
        this.joinAsk = true;
        return;
      }
      await db.markAll(this.hlc.now());
    }
    await this.keepSession(session);
    // A new account takes everything here; it goes up once it has a name (the next step).
    if (r.fresh) {
      await db.markAll(this.hlc.now());
      this.offerPasskey = passkeysAvailable();
    }
    await this.sync.start(session);
  }

  /**
   * Another account signs in where someone else's plan is: their days, repeating tasks, goals,
   * reviews, synced settings and Boardo cards go. What belongs to the device stays (theme,
   * sound, notifications, layouts).
   */
  private async wipeDevice(): Promise<void> {
    const shared = new Set<string>([...SHARED_SETTINGS, 'onboarded']);
    const kept = Object.fromEntries(Object.entries(this.settings).filter(([k]) => !shared.has(k)));
    this.dropPending();
    await db.replaceAll({ days: [], series: [], goals: [], reviews: [], settings: { ...DEFAULT_SETTINGS, ...kept } });
    await db.deleteMeta('shown').catch(() => {});
    await this.boardo.wipe();
    await this.reloadAll();
    this.post({ t: 'all' });
  }

  /** Arrived from the app's old address with its device settings and, if signed in there, a sign-in code. */
  private async arrive(came: NonNullable<ReturnType<typeof arrival>>): Promise<void> {
    const { notify, ...rest } = came.settings;
    this.setSettings(came.code ? { ...rest, onboarded: true } : rest);
    // Notifications are allowed address by address: offered again here.
    if (notify) this.notifyPrompt = 'timer';
    const code = came.code;
    if (code && !this.session) await this.accountAction(async () => this.signedIn(await api.finishHandoff(code)));
  }

  /**
   * The last build left at an old address (`MOVED_TO`): once everything changed here has reached
   * the account, go to the new address, taking this sign-in (a one-time code) and this device's
   * settings. Offline it waits, and says so.
   */
  async moveHome(): Promise<void> {
    if (!MOVED_TO || this.moving === 'going') return;
    this.moving = 'saving';
    // The sign-in has to be loaded first, or this would leave without it.
    while (!this.started && !this.failed) await new Promise((r) => setTimeout(r, 100));
    const since = Date.now();
    for (;;) {
      const saved = await this.flush();
      const s = this.session;
      // An account not set up yet doesn't sync: it carries on at the new address as it is.
      const synced = !s || this.syncStatus === 'paused' || (await this.sync.drained());
      // Records the account won't take stay behind rather than keep everyone waiting.
      const stuck = this.syncStatus === 'live' && Date.now() - since > 30_000;
      // The new address has to answer from here before going there: a network's DNS can still
      // have it cached as missing for a while after it was made.
      const ready = saved && (synced || stuck);
      const there: boolean = ready ? await reachable() : false;
      if (ready && there) {
        try {
          const code = s ? (await api.startHandoff(s.token)).code : null;
          this.moving = 'going';
          location.replace(moveUrl(code, this.settings));
          return;
        } catch (e) {
          // Signed out meanwhile: go anyway, to sign in there.
          if (e instanceof ApiError && e.status === 401) {
            this.moving = 'going';
            location.replace(moveUrl(null, this.settings));
            return;
          }
        }
      }
      // Offline, or online but the account's server or the new address can't be reached from here.
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const cut: boolean = this.syncStatus === 'offline' || (ready && !there);
      this.moving = offline ? 'offline' : cut ? 'unreachable' : 'saving';
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  /** Remember the sign-in on this device, for its other tabs and the next launch. */
  private async keepSession(session: Session): Promise<void> {
    await db.putMeta('account', session);
    // Whose plan this device holds, so another account signing in here doesn't get it.
    await db.putMeta('owner', session.user.id);
    this.post({ t: 'account' });
  }

  /** Anything here worth keeping: a stored day with tasks on it, or a repeating task. */
  private async hasOwnPlan(): Promise<boolean> {
    const [days, series] = await Promise.all([db.getAllDays(), db.getAllSeries()]);
    return series.length > 0 || days.some((d) => d.items.length > 0);
  }

  /** The answer to joinAsk: use the account's plan here, or add this device's plan to it. */
  async joinAccount(keep: 'account' | 'both'): Promise<void> {
    const session = this.session;
    if (!session || !this.joinAsk) return;
    this.joinAsk = false;
    if (keep === 'account') {
      // This device's own days and repeating tasks go; its settings stay until the account's arrive.
      this.dropPending();
      await db.replaceAll({ days: [], series: [], settings: this.settings });
      await this.reloadAll();
      this.post({ t: 'all' });
    } else await db.markAll(this.hlc.now());
    await this.keepSession(session);
    this.accountMsg = { err: false, t: 'Signed in. Your plan now syncs with your other devices.' };
    await this.sync.start(session);
  }

  /** Not signing in after all (the join question was put aside). */
  async cancelJoin(): Promise<void> {
    const s = this.session;
    if (!s || !this.joinAsk) return;
    await this.forgetSession();
    await api.signOutRemote(s.token, s.device);
  }

  /** Another tab signed in or out, or set the account up. */
  private async loadSession(): Promise<void> {
    const session = (await db.getMeta<Session>('account')) ?? null;
    if (session && session.token === this.session?.token) {
      const was = complete(this.session.user);
      this.session = session;
      if (!was && complete(session.user)) this.sync.resume();
      return;
    }
    if (session?.token === this.session?.token) return;
    this.sync.stop();
    // Signed out, or in as someone else, in another tab: what was open here is theirs no longer.
    this.sheet = null;
    this.confirm = null;
    this.session = session;
    if (session) await this.sync.start(session);
  }

  addPasskey(): Promise<boolean> {
    const s = this.session;
    if (!s) return Promise.resolve(false);
    return this.accountAction(async () => {
      await api.addPasskey(s.token);
      this.offerPasskey = false;
      this.accountMsg = { err: false, t: 'Passkey added. Next time, sign in with it.' };
    });
  }

  removePasskey(id: string): Promise<boolean> {
    const s = this.session;
    this.confirm = null;
    if (!s) return Promise.resolve(false);
    return this.accountAction(async () => {
      await api.removePasskey(s.token, id);
      this.accountMsg = { err: false, t: 'Passkey removed.' };
    });
  }

  /** The account's name: asked for once it's made, and changeable after. */
  saveName(name: string): Promise<boolean> {
    const s = this.session;
    if (!s) return Promise.resolve(false);
    return this.accountAction(async () => {
      const r = await api.setName(s.token, name);
      const was = complete(s.user);
      await this.updateUser({ name: r.name });
      if ((!was || this.syncStatus === 'paused') && complete(this.session?.user)) this.setUp();
      else this.accountMsg = { err: false, t: 'Name saved.' };
    });
  }

  /** Email a code to add (or change) the account's email. */
  sendEmailCode(email: string): Promise<boolean> {
    const s = this.session;
    if (!s) return Promise.resolve(false);
    return this.accountAction(() => api.sendCode(email, s.token));
  }

  /** Confirm the account's email with its code (and, for an account that has none, its name). */
  confirmEmail(email: string, code: string, name?: string): Promise<boolean> {
    const s = this.session;
    if (!s) return Promise.resolve(false);
    return this.accountAction(async () => {
      const was = complete(s.user);
      const u = await api.verifyCode(email, code, s.token, name);
      await this.updateUser({ email: u.email, name: u.name });
      if ((!was || this.syncStatus === 'paused') && complete(this.session?.user)) this.setUp();
      else this.accountMsg = { err: false, t: 'Email saved.' };
    });
  }

  /** The account now has a name and an email: sync picks up, with everything saved meanwhile. */
  private setUp(): void {
    this.accountMsg = { err: false, t: "You're all set. Your plan syncs with your other devices now." };
    this.sync.resume();
  }

  private async updateUser(patch: Partial<Session['user']>): Promise<void> {
    if (!this.session) return;
    this.session = { ...this.session, user: { ...this.session.user, ...patch } };
    await db.putMeta('account', this.session);
    this.post({ t: 'account' });
  }

  /** The account's details (passkeys, email), fresh from the worker. */
  async accountDetails(): Promise<api.AccountInfo | null> {
    const s = this.session;
    if (!s) return null;
    try {
      const info = await api.accountInfo(s.token);
      if (info.email !== s.user.email || info.name !== (s.user.name ?? null)) {
        const was = complete(s.user);
        await this.updateUser({ email: info.email, name: info.name });
        if (!was && complete(this.session?.user)) this.sync.resume();
      }
      return info;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401)
        await this.forgetSession('You were signed out on this device. Your plan is still here.');
      return null;
    }
  }

  /** Stop syncing on this device. The plan stays here, and on the account. */
  async signOut(): Promise<void> {
    const s = this.session;
    this.confirm = null;
    if (!s) return;
    await this.flush();
    // Changes still on their way to the account get a few seconds to arrive first.
    for (let i = 0; i < 25 && this.syncStatus === 'live' && !(await this.sync.drained()); i++)
      await new Promise((r) => setTimeout(r, 200));
    await this.forgetSession('Signed out. This device keeps its copy of your plan.');
    await api.signOutRemote(s.token, s.device);
  }

  /** Delete the account and everything it holds. Each device keeps the copy it has. */
  deleteAccount(): Promise<boolean> {
    const s = this.session;
    this.confirm = null;
    if (!s) return Promise.resolve(false);
    return this.accountAction(async () => {
      await api.deleteAccount(s.token);
      await this.forgetSession('Account deleted. This device keeps its copy of your plan.');
    });
  }

  private async forgetSession(msg?: string): Promise<void> {
    this.sync.stop();
    this.boardo.stop();
    // The sign-in page comes up; signing in again starts on Today.
    this.openScreen({ type: 'today' });
    this.session = null;
    this.joinAsk = false;
    this.offerPasskey = false;
    this.pushScheduled = false;
    await db.clearSync();
    this.post({ t: 'account' });
    if (msg) {
      this.accountMsg = { err: false, t: msg };
      this.say(msg);
    }
  }

  // ---------- notifications ----------

  /**
   * After a timer starts or a task gets a fixed time, suggest notifications unless they're on,
   * refused, or snoozed.
   */
  private offerNotifications(why: 'timer' | 'fixed'): void {
    const s = this.settings;
    if (s.notify || s.notifyAsk === 'never' || (s.notifyAskAfter && this.today < s.notifyAskAfter)) return;
    if (!hasNotifications() && !needsInstallForNotifications()) return;
    if (hasNotifications() && Notification.permission === 'denied') return;
    if (why === 'fixed' && !s.fixedLead) return;
    this.notifyPrompt = why;
  }

  /** The three answers on the suggestion card. */
  async answerNotifyPrompt(a: 'on' | 'later' | 'never'): Promise<void> {
    if (a === 'on') {
      const ok = await this.enableNotifications();
      this.notifyPrompt = ok ? null : 'blocked';
      return;
    }
    this.notifyPrompt = null;
    if (a === 'later') this.setSettings({ notifyAskAfter: addDays(this.today, 1) });
    else this.setSettings({ notifyAsk: 'never', notify: false });
  }

  /** Ask the browser for permission (must run from a tap) and switch notifications on. */
  async enableNotifications(): Promise<boolean> {
    const perm = await requestNotifications();
    if (perm !== 'granted') {
      this.setSettings({ notify: false });
      return false;
    }
    this.setSettings({ notify: true, notifyAskAfter: null });
    await preparePush();
    this.say('Notifications on');
    return true;
  }

  disableNotifications(): void {
    // Turning them off in Settings is a clear answer: don't suggest them again.
    this.setSettings({ notify: false, notifyAsk: 'never' });
    void unsubscribePush();
    this.say('Notifications off');
  }
}

export const planner = new Planner();
