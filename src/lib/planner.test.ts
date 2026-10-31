// The app state against an in-memory IndexedDB: what gets stored, and what comes back after
// a reload (a fresh Planner reading the same database).

import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from './db';
import type { Series } from './types';
import * as A from './actions';
import { Planner } from './planner.svelte';
import { itemFromSeries } from './repeat';
import { isMissed } from './schedule';

const TODAY = '2026-09-25'; // a Friday
const TOMORROW = '2026-09-26';
const live: Planner[] = [];

async function boot(): Promise<Planner> {
  const p = new Planner();
  live.push(p);
  await p.init();
  return p;
}

const add = (p: Planner, title: string, min = 30) =>
  p.addTask({ title, min, kind: 'task', hue: 'cyan', fixedAt: null });
const byTitle = (p: Planner, title: string) => p.day.items.find((i) => i.title === title)!;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 0));
  await db.closeDb();
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
});

afterEach(() => {
  live.splice(0).forEach((p) => p.destroy());
  vi.useRealTimers();
});

describe('Planner', () => {
  it('starts on a blank today', async () => {
    const p = await boot();
    expect(p.ready).toBe(true);
    expect(p.viewKey).toBe(TODAY);
    expect(p.day.items).toEqual([]);
    expect(p.settings.themePref).toBe('match');
  });

  it('keeps a day that could not be saved, says so, and saves it once it can', async () => {
    const p = await boot();
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = () => {
      throw new DOMException('Out of space', 'QuotaExceededError');
    };
    try {
      add(p, 'Write');
      expect(await p.flush()).toBe(false);
      expect(p.saveError).toBe('full');
      expect(p.day.items.map((i) => i.title)).toEqual(['Write']);
    } finally {
      IDBObjectStore.prototype.put = put;
    }
    expect(await p.flush()).toBe(true);
    expect(p.saveError).toBeNull();
    const q = await boot();
    expect(q.day.items.map((i) => i.title)).toEqual(['Write']);
  });

  it('keeps tasks and timer state across a reload', async () => {
    const p = await boot();
    add(p, 'Write');
    add(p, 'Review');
    p.startDay();
    await p.flush();

    const q = await boot();
    expect(q.day.items.map((i) => [i.title, i.status])).toEqual([
      ['Write', 'running'],
      ['Review', 'todo'],
    ]);
    expect(q.day.dayStarted).toBeCloseTo(600, 0);
  });

  it('moves a task to tomorrow and can undo it', async () => {
    const p = await boot();
    add(p, 'Call');
    const id = byTitle(p, 'Call').id;
    await p.postpone(id, 'tomorrow');
    await p.flush();
    expect(byTitle(p, 'Call').status).toBe('postponed');
    expect((await db.getDay(TOMORROW))?.items.map((i) => i.title)).toEqual(['Call']);

    await p.restore(id);
    await p.flush();
    expect(byTitle(p, 'Call').status).toBe('todo');
    expect((await db.getDay(TOMORROW))?.items).toEqual([]);
  });

  it('repeats an item on later days until it stops repeating', async () => {
    const p = await boot();
    add(p, 'Standup', 15);
    // A later day that already exists gets the new repeating item too.
    await p.switchDay('2026-09-28');
    add(p, 'Monday thing');
    await p.switchDay(TODAY);
    await p.setRepeat(byTitle(p, 'Standup').id, 'Weekdays');
    await p.flush();

    expect((await db.getDay('2026-09-28'))?.items.map((i) => i.title)).toEqual(['Monday thing', 'Standup']);
    await p.switchDay('2026-09-29'); // never stored: built from the series
    expect(p.day.items.map((i) => i.title)).toEqual(['Standup']);
    await p.switchDay('2026-09-27'); // Sunday
    expect(p.day.items).toEqual([]);

    await p.switchDay(TODAY);
    await p.stopRepeating(byTitle(p, 'Standup').id);
    await p.flush();
    expect((await db.getDay('2026-09-28'))?.items.map((i) => i.title)).toEqual(['Monday thing']);
    const q = await boot();
    await q.switchDay('2026-09-29');
    expect(q.day.items).toEqual([]);
  });

  it('deletes a repeating task from one day, or from later days too', async () => {
    const p = await boot();
    add(p, 'Gym', 45);
    await p.setRepeat(byTitle(p, 'Gym').id, 'Every day');
    await p.switchDay('2026-09-28'); // stored: it has another task
    add(p, 'Monday thing');
    await p.switchDay(TOMORROW);
    p.remove(byTitle(p, 'Gym').id); // just this day
    await p.flush();
    expect(p.day.items).toEqual([]);
    await p.switchDay('2026-09-27');
    expect(p.day.items.map((i) => i.title)).toEqual(['Gym']);

    await p.removeWithLater(byTitle(p, 'Gym').id);
    await p.flush();
    expect(p.day.items).toEqual([]);
    expect((await db.getDay('2026-09-28'))?.items.map((i) => i.title)).toEqual(['Monday thing']);
    expect(p.series[0].until).toBe(TOMORROW);
    const q = await boot();
    expect(q.day.items.map((i) => i.title)).toEqual(['Gym']); // earlier days keep it
    await q.switchDay('2026-09-29');
    expect(q.day.items).toEqual([]);
  });

  it('pushes edits of a repeating item to later days not yet started', async () => {
    const p = await boot();
    add(p, 'Email', 45);
    await p.setRepeat(byTitle(p, 'Email').id, 'Every day');
    await p.switchDay(TOMORROW);
    add(p, 'Other');
    await p.switchDay(TODAY);
    p.edit(byTitle(p, 'Email').id, { title: 'Inbox', min: 30 });
    await new Promise((r) => setTimeout(r, 700));
    await p.flush();
    expect((await db.getDay(TOMORROW))?.items.map((i) => [i.title, i.min])).toEqual([
      ['Inbox', 30],
      ['Other', 30],
    ]);
  });

  it('pushes edits of a repeating item to earlier days not yet started, but not past or started ones', async () => {
    const p = await boot();
    add(p, 'Email', 45);
    await p.setRepeat(byTitle(p, 'Email').id, 'Every day');
    await p.switchDay(TOMORROW);
    add(p, 'Other');
    // A started day (stood in for: a future day can't be started from the app).
    const email = p.series[0];
    await db.putDays([
      {
        key: '2026-09-27',
        dayStart: 540,
        wrap: 1020,
        dayStarted: 540,
        items: [itemFromSeries(email, '2026-09-27'), A.newItem({ title: 'Started', min: 30 })],
      },
    ]);
    await p.switchDay('2026-09-29');
    p.edit(byTitle(p, 'Email').id, { title: 'Inbox', min: 30 });
    await new Promise((r) => setTimeout(r, 700));
    await p.flush();
    expect((await db.getDay(TODAY))?.items.map((i) => [i.title, i.min])).toEqual([['Inbox', 30]]);
    expect((await db.getDay(TOMORROW))?.items.map((i) => i.title)).toEqual(['Inbox', 'Other']);
    expect((await db.getDay('2026-09-27'))?.items.map((i) => i.title)).toEqual(['Email', 'Started']);
    await p.switchDay('2026-09-28'); // never stored: built from the edited series
    expect(p.day.items.map((i) => i.title)).toEqual(['Inbox']);
  });

  it('saves the Edit form in one go: fields, repeat, and a check turned into a timed task', async () => {
    const p = await boot();
    p.addTask({ title: 'Call', min: 0, kind: 'check', hue: 'cyan', fixedAt: null });
    const it = byTitle(p, 'Call');
    await p.saveTask(it.id, {
      title: '  Call the bank ',
      kind: 'task',
      min: 20,
      hue: 'lime',
      fixedAt: null,
      repeat: 'Weekdays',
      note: 'Ask about fees',
      subtasks: [{ id: 's1', t: 'Find the number', d: false }],
      goalId: null,
      habitId: null,
    });
    await p.flush();
    const saved = p.item(it.id)!;
    expect([saved.title, saved.kind, saved.min, saved.hue, saved.note, saved.repeat, saved.status]).toEqual([
      'Call the bank',
      'task',
      20,
      'lime',
      'Ask about fees',
      'Weekdays',
      'todo',
    ]);
    expect(saved.subtasks.map((x) => x.t)).toEqual(['Find the number']);
    expect(p.series.find((s) => s.id === saved.seriesId)?.repeat).toBe('Weekdays');
    expect((await db.getDay('2026-09-28'))?.items.map((i) => i.title) ?? []).toEqual([]); // never stored: built from the series
    await p.switchDay('2026-09-28');
    expect(p.day.items.map((i) => [i.title, i.min])).toEqual([['Call the bank', 20]]);
  });

  it('keeps a repeating-item edit when the user switches day straight away', async () => {
    const p = await boot();
    add(p, 'Email', 45);
    await p.setRepeat(byTitle(p, 'Email').id, 'Every day');
    await p.switchDay(TOMORROW);
    add(p, 'Other');
    await p.switchDay(TODAY);
    p.edit(byTitle(p, 'Email').id, { title: 'Inbox' });
    await p.switchDay('2026-09-30'); // before the batched series sync fires
    await new Promise((r) => setTimeout(r, 700));
    await p.flush();
    expect((await db.getDay(TOMORROW))?.items.map((i) => i.title)).toEqual(['Inbox', 'Other']);
    expect(p.day.items.map((i) => i.title)).toEqual(['Inbox']); // built from the updated series
  });

  it('picks up changes made in another tab', async () => {
    const a = await boot();
    const b = await boot();
    add(b, 'From the other tab');
    await b.flush();
    await new Promise((r) => setTimeout(r, 50));
    expect(a.day.items.map((i) => i.title)).toEqual(['From the other tab']);
  });

  it('rebuilds unsaved days when the default hours change', async () => {
    const p = await boot();
    await p.switchDay(TOMORROW);
    expect(p.day.dayStart).toBe(540);
    p.setSettings({ defStart: 480 });
    expect(p.day.dayStart).toBe(480);
  });

  it('never runs two timers when one was left going overnight', async () => {
    vi.setSystemTime(new Date(2026, 8, 25, 16, 30));
    const p = await boot();
    add(p, 'Late');
    p.startItem(byTitle(p, 'Late').id);
    await p.flush();

    vi.setSystemTime(new Date(2026, 8, 26, 8, 0));
    const q = await boot();
    expect(q.viewKey).toBe(TOMORROW);
    expect(q.elsewhere).toMatchObject({ key: TODAY, it: { title: 'Late', status: 'running' } });
    add(q, 'Morning');
    q.startItem(byTitle(q, 'Morning').id);
    await q.flush();
    expect((await db.getDay(TODAY))?.items[0].status).toBe('postponed');
    expect(q.elsewhere).toBeNull();
  });

  it('can make a new task repeat from the start', async () => {
    const p = await boot();
    p.addTask({ title: 'Stretch', min: 10, kind: 'task', hue: 'lime', fixedAt: null, repeat: 'Every day' });
    await new Promise((r) => setTimeout(r, 50));
    expect(byTitle(p, 'Stretch')).toMatchObject({ repeat: 'Every day' });
    expect(byTitle(p, 'Stretch').seriesId).toBeTruthy();
    await p.switchDay(TOMORROW);
    expect(p.day.items.map((i) => i.title)).toEqual(['Stretch']);
  });

  it('keeps the week strip on the week of the day shown', async () => {
    const p = await boot();
    await p.switchDay('2026-09-28'); // next Monday, e.g. swiping on from Sunday
    expect(p.weekOff).toBe(1);
    expect(p.weekKeys[0]).toBe('2026-09-28');
    await p.switchDay('2026-09-27');
    expect(p.weekOff).toBe(0);
    expect(p.weekKeys).toContain('2026-09-27');
  });

  it('lets checks be ticked off only once the day has started', async () => {
    const p = await boot();
    p.addTask({ title: 'Vitamins', min: 0, kind: 'check', hue: 'lime', fixedAt: null });
    const id = byTitle(p, 'Vitamins').id;
    p.toggleCheck(id);
    expect(byTitle(p, 'Vitamins').status).toBe('todo');
    p.startDay();
    p.toggleCheck(id);
    expect(byTitle(p, 'Vitamins').status).toBe('done');
    p.toggleCheck(id);
    expect(byTitle(p, 'Vitamins').status).toBe('todo');
  });

  it('asks to start the day first, until it goes by itself', async () => {
    const p = await boot();
    p.askToStartDay('check');
    expect(p.nudge?.text).toBe('Start your day first, then mark it done.');
    expect(p.announce).toBe('Start your day first, then mark it done.');
    p.askToStartDay('timer');
    expect(p.nudge?.text).toBe('Start your day first, then start the timer.');
    vi.setSystemTime(new Date(2026, 8, 25, 10, 0, 7));
    p.tick();
    expect(p.nudge).toBeNull();
    p.askToStartDay('check');
    p.startDay();
    expect(p.nudge).toBeNull();

    await p.switchDay(TOMORROW);
    p.askToStartDay('check');
    expect(p.nudge?.text).toBe("This day hasn't started yet. Mark it done once it has.");
  });

  it('lets checks on earlier days be ticked off, started or not', async () => {
    const p = await boot();
    await p.switchDay('2026-09-24');
    p.addTask({ title: 'Vitamins', min: 0, kind: 'check', hue: 'lime', fixedAt: null });
    expect(p.waiting).toBe(false);
    p.toggleCheck(byTitle(p, 'Vitamins').id);
    expect(byTitle(p, 'Vitamins').status).toBe('done');
  });

  it('asks when an over-time task was finished, and can log it at time up', async () => {
    const p = await boot();
    add(p, 'Write', 30);
    p.startDay(); // 10:00
    const id = byTitle(p, 'Write').id;
    vi.setSystemTime(new Date(2026, 8, 25, 10, 32)); // 2 min over: Done is just done
    p.tick();
    expect(p.timeUpAt(id)).toBeCloseTo(630, 0);
    vi.setSystemTime(new Date(2026, 8, 25, 11, 5)); // 35 min over: Done asks
    p.tick();
    p.done(id);
    expect(p.armed('finish', id)).toBe(true);
    expect(byTitle(p, 'Write').status).toBe('running');
    p.finishAt(id, p.timeUpAt(id)!);
    expect(byTitle(p, 'Write')).toMatchObject({ status: 'done' });
    expect(byTitle(p, 'Write').endedAt).toBeCloseTo(630, 0);
  });

  it('corrects when a task and the day started', async () => {
    const p = await boot();
    add(p, 'Write', 30);
    p.startDay(); // 10:00
    const id = byTitle(p, 'Write').id;
    vi.setSystemTime(new Date(2026, 8, 25, 10, 10));
    p.tick();
    p.retime(id, { start: 590 }); // really began at 9:50
    expect(byTitle(p, 'Write').startedAt).toBe(590);
    expect(p.day.dayStarted).toBe(590);
    expect(p.dayStartBounds()).toEqual([0, 590]);
    p.saveHours(p.day.dayStart, p.day.wrap, 580);
    expect(p.day.dayStarted).toBe(580);
    p.saveHours(p.day.dayStart, p.day.wrap, 700); // never after the first task started
    expect(p.day.dayStarted).toBe(590);
  });

  it('keeps an ended day as it was, until it is reopened', async () => {
    const p = await boot();
    add(p, 'Write');
    add(p, 'Read');
    p.addTask({ title: 'Vitamins', min: 0, kind: 'check', hue: 'lime', fixedAt: null });
    p.startDay();
    await p.endDay(false);
    expect(p.locked).toBe(true);
    const ended = p.day;
    const read = byTitle(p, 'Read').id;
    p.edit(read, { title: 'Changed' });
    p.move(read, -1);
    p.skip(read);
    p.toggleCheck(byTitle(p, 'Vitamins').id);
    p.addTask({ title: 'More', min: 30, kind: 'task', hue: 'cyan', fixedAt: null });
    p.drag = { id: read, over: 0, dy: 0, h: 60 };
    p.commitDrag();
    await p.setRepeat(read, 'Every day');
    await p.postpone(read, 'tomorrow');
    p.remove(read);
    expect(p.day).toBe(ended);
    expect(p.series).toEqual([]);
    expect(p.drag).toBeNull();
    p.sayLocked();
    expect(p.nudge?.text).toBe('This day has ended. Reopen it at the bottom of the day to make changes.');

    p.reopenDay();
    expect(p.locked).toBe(false);
    p.edit(read, { title: 'Changed' });
    expect(byTitle(p, 'Changed')).toBeTruthy();
  });

  it('ends the day moving only what was picked, and can set the running task aside', async () => {
    const p = await boot();
    add(p, 'Write', 60);
    add(p, 'Emails');
    add(p, 'Invoices');
    p.startDay(); // 10:00, Write starts
    vi.setSystemTime(new Date(2026, 8, 25, 10, 20));
    p.tick();
    await p.endDay([byTitle(p, 'Invoices').id], false);
    expect(byTitle(p, 'Write')).toMatchObject({ status: 'postponed', endedAt: 620 });
    expect(byTitle(p, 'Emails').status).toBe('todo');
    expect(byTitle(p, 'Invoices').status).toBe('postponed');
    await p.flush();
    const next = await db.getDay(TOMORROW);
    expect(next?.items.map((i) => i.title)).toEqual(['Invoices']);
  });

  it('moves the rest of a running task set aside at the end of the day', async () => {
    const p = await boot();
    add(p, 'Write', 60);
    p.startDay();
    vi.setSystemTime(new Date(2026, 8, 25, 10, 20));
    p.tick();
    await p.endDay([byTitle(p, 'Write').id], false);
    expect(byTitle(p, 'Write')).toMatchObject({ status: 'postponed', endedAt: 620 });
    await p.flush();
    const next = await db.getDay(TOMORROW);
    expect(next?.items.map((i) => [i.title, i.min, i.continued])).toEqual([['Write', 40, true]]);
  });

  it('still marks the running task done when asked to', async () => {
    const p = await boot();
    add(p, 'Write', 60);
    p.startDay();
    vi.setSystemTime(new Date(2026, 8, 25, 10, 20));
    p.tick();
    await p.endDay([], true);
    expect(byTitle(p, 'Write')).toMatchObject({ status: 'done', endedAt: 620 });
    expect(p.locked).toBe(true);
  });

  it('keeps a late night on the day it started, until the day is ended', async () => {
    vi.setSystemTime(new Date(2026, 8, 25, 22, 0));
    const p = await boot();
    add(p, 'Ship it');
    add(p, 'Emails');
    p.addTask({ title: 'Vitamins', min: 0, kind: 'check', hue: 'lime', fixedAt: null });
    p.startDay();
    await p.flush();

    vi.setSystemTime(new Date(2026, 8, 26, 1, 0));
    const q = await boot();
    expect(q.today).toBe(TODAY);
    expect(q.viewKey).toBe(TODAY);
    expect(q.n).toBe(1500);

    await q.endDay(true);
    expect(q.celebrate).toMatchObject({ kind: 'end', moved: 2, stats: { tasks: 1, tasksDone: 1, checks: 0 } });
    await vi.waitFor(() => expect(q.viewKey).toBe(TOMORROW));
    expect(q.today).toBe(TOMORROW);
    expect(q.day.items.map((i) => i.title)).toEqual(['Emails', 'Vitamins']);
    await q.flush();
    const friday = await db.getDay(TODAY);
    expect(friday?.dayEnded).toBe(1500);
    expect(friday?.items.map((i) => [i.title, i.status])).toEqual([
      ['Ship it', 'done'],
      ['Emails', 'postponed'],
      ['Vitamins', 'postponed'],
    ]);
  });

  it('Start my day is celebrated with when it started and what comes first', async () => {
    const p = await boot();
    add(p, 'Plan');
    p.startDay();
    expect(p.celebrate).toEqual({ kind: 'start', at: 600, first: 'Plan' });
  });

  it('with a flexible start, counts the day from when it starts', async () => {
    const p = await boot();
    p.completeOnboarding({ start: 540, length: 600, flex: true });
    add(p, 'Deep work', 90);
    expect(p.planDay).toMatchObject({ dayStart: 600, wrap: 1200 });
    expect(p.sch.rows[0].start).toBe(600);
    vi.setSystemTime(new Date(2026, 8, 25, 10, 20));
    p.tick();
    p.startDay();
    expect(p.day).toMatchObject({ dayStarted: 620, dayStart: 620, wrap: 1220 });
  });

  it('Reschedule → Start now starts the day with that task, and the rest follow it', async () => {
    vi.setSystemTime(new Date(2026, 8, 25, 11, 0));
    const p = await boot(); // planned from 9:00, never started
    for (const t of ['A', 'B', 'C']) add(p, t); // 9:00, 9:30, 10:00: all missed by 11
    add(p, 'D', 60); // 10:30–11:30: under way
    const missed = () => p.sch.rows.filter((r) => isMissed(r, p.n)).map((r) => r.it.title);
    expect(missed()).toEqual(['A', 'B', 'C']);

    p.reschedNow(byTitle(p, 'B').id);
    expect(byTitle(p, 'B').status).toBe('running');
    // The day has started: what's still to do follows the now line, so nothing is missed.
    expect(missed()).toEqual([]);
    expect(p.sch.rows.map((r) => `${r.it.title} ${r.start}`)).toEqual(['B 660', 'A 690', 'C 720', 'D 750']);
  });

  it('starting late moves the wrap-up so the day keeps its planned length', async () => {
    vi.setSystemTime(new Date(2026, 8, 25, 14, 54)); // a 9-to-5 plan started at 2:54 pm
    const p = await boot();
    add(p, 'Afternoon work');
    p.startDay();
    expect(p.day).toMatchObject({ dayStarted: 894, dayStart: 540, wrap: 894 + 480 });
  });

  it('starting early leaves the wrap-up where it was', async () => {
    vi.setSystemTime(new Date(2026, 8, 25, 8, 30));
    const p = await boot();
    add(p, 'Early start');
    p.startDay();
    expect(p.day).toMatchObject({ dayStarted: 510, wrap: 1020 });
  });

  it('Reschedule → Start now before Start my day moves the wrap-up the same way', async () => {
    vi.setSystemTime(new Date(2026, 8, 25, 14, 0));
    const p = await boot();
    add(p, 'A');
    p.reschedNow(byTitle(p, 'A').id);
    expect(p.day).toMatchObject({ dayStarted: 840, wrap: 840 + 480 });
  });

  it('shows the welcome once, and never to someone who already has a plan', async () => {
    const p = await boot();
    expect(p.showWelcome).toBe(true);
    p.completeOnboarding({ start: 420, length: 600, flex: false });
    expect(p.showWelcome).toBe(false);
    expect(p.settings).toMatchObject({ defStart: 420, dayLength: 600, defWrap: 1020, flexStart: false });
    await p.flush();
    expect((await boot()).showWelcome).toBe(false);

    await p.eraseAll();
    await db.putDay({ key: TODAY, dayStart: 540, wrap: 1020, dayStarted: null, items: [] });
    expect((await boot()).showWelcome).toBe(false);
  });

  it('asks about later days when a repeating task is dragged past another one', async () => {
    const p = await boot();
    const rep = (title: string) =>
      p.addTask({ title, min: 30, kind: 'task', hue: 'cyan', fixedAt: null, repeat: 'Every day' });
    rep('A');
    rep('B');
    add(p, 'One-off');
    await new Promise((r) => setTimeout(r, 50));
    // A stored later day, and one only built from the repeating tasks.
    await p.switchDay('2026-09-27');
    add(p, 'Sunday errand');
    await p.switchDay(TODAY);

    p.drag = { id: byTitle(p, 'B').id, over: 0, dy: 0, h: 50 };
    p.commitDrag();
    expect(p.day.items.map((i) => i.title)).toEqual(['B', 'A', 'One-off']);
    expect(p.sheet).toMatchObject({ type: 'reorder', dir: 'up' });

    await p.reorderLaterDays();
    expect(p.sheet).toBeNull();
    await p.switchDay(TOMORROW);
    expect(p.day.items.map((i) => i.title)).toEqual(['B', 'A']);
    await p.switchDay('2026-09-27');
    expect(p.day.items.map((i) => i.title)).toEqual(['B', 'A', 'Sunday errand']);

    // Dragging it back today: later days already have it the other way, so ask again.
    await p.switchDay(TODAY);
    p.drag = { id: byTitle(p, 'B').id, over: 2, dy: 0, h: 50 };
    p.commitDrag();
    expect(p.sheet).toMatchObject({ type: 'reorder', dir: 'down' });
    p.closeSheet(); // Just today
    await p.switchDay(TOMORROW);
    expect(p.day.items.map((i) => i.title)).toEqual(['B', 'A']);
  });

  it("doesn't ask when a task moves only past one-off tasks, or when starting a timer reorders", async () => {
    const p = await boot();
    p.addTask({ title: 'A', min: 30, kind: 'task', hue: 'cyan', fixedAt: null, repeat: 'Every day' });
    add(p, 'X');
    p.addTask({ title: 'B', min: 30, kind: 'task', hue: 'cyan', fixedAt: null, repeat: 'Every day' });
    await new Promise((r) => setTimeout(r, 50));
    p.drag = { id: byTitle(p, 'B').id, over: 1, dy: 0, h: 50 }; // past X only
    p.commitDrag();
    expect(p.sheet).toBeNull();
    p.startDay();
    p.startItem(byTitle(p, 'B').id);
    expect(p.day.items.map((i) => i.title).indexOf('B')).toBeLessThan(p.day.items.map((i) => i.title).indexOf('X'));
    expect(p.sheet).toBeNull();
    await p.switchDay(TOMORROW);
    expect(p.day.items.map((i) => i.title)).toEqual(['A', 'B']);
  });

  it('gives repeating tasks saved before they had an order the order of the plan', async () => {
    const mk = (id: string, title: string) => ({
      id,
      title,
      min: 30,
      kind: 'task' as const,
      hue: 'cyan' as const,
      fixedAt: null,
      repeat: 'Every day',
      note: '',
      subtasks: [],
      from: TODAY,
      until: null,
    });
    // Saved in the order A, B (ids sort that way too), arranged today as B, A.
    await db.putSeries(mk('s1', 'A') as unknown as Series);
    await db.putSeries(mk('s2', 'B') as unknown as Series);
    await db.putDay({
      key: TODAY,
      dayStart: 540,
      wrap: 1020,
      dayStarted: null,
      items: [
        { ...A.newItem({ title: 'B', repeat: 'Every day' }), seriesId: 's2' },
        { ...A.newItem({ title: 'A', repeat: 'Every day' }), seriesId: 's1' },
      ],
    });
    const p = await boot();
    await p.switchDay(TOMORROW);
    expect(p.day.items.map((i) => i.title)).toEqual(['B', 'A']);
    expect((await db.getAllSeries()).every((s) => Number.isFinite(s.order))).toBe(true);
  });

  it('erases everything', async () => {
    const p = await boot();
    add(p, 'A');
    p.setSettings({ clock24: true });
    await p.flush();
    await p.eraseAll();
    const q = await boot();
    expect(q.day.items).toEqual([]);
    expect(q.settings.clock24).toBe(false);
  });

  it('adds a habit that comes back on later days and waits for the day to start', async () => {
    const p = await boot();
    p.addTask({
      title: 'Water',
      min: 0,
      kind: 'habit',
      hue: 'cyan',
      fixedAt: null,
      habit: { type: 'amount', target: 3, unit: 'glasses', per: 'day', times: 3, remindAt: null },
    });
    await vi.waitFor(() => expect(p.days[TOMORROW].items).toHaveLength(1));
    const water = byTitle(p, 'Water');
    expect(water).toMatchObject({ kind: 'habit', min: 0, repeat: 'Every day' });
    p.tapHabit(water.id);
    expect(byTitle(p, 'Water').progress).toBe(0); // the day hasn't started
    p.startDay();
    p.tapHabit(water.id);
    p.tapHabit(water.id);
    expect(byTitle(p, 'Water').progress).toBe(2);
    expect(p.sch.rows.find((r) => r.it.title === 'Water')?.end).toBe(
      p.sch.rows.find((r) => r.it.title === 'Water')?.start,
    );
    await p.switchDay(TOMORROW);
    expect(byTitle(p, 'Water')).toMatchObject({ kind: 'habit', habit: { target: 3 } });
    expect(byTitle(p, 'Water').progress ?? 0).toBe(0);
  });

  it('stops a habit at its target, and undoes a tap', async () => {
    const p = await boot();
    p.addTask({
      title: 'Water',
      min: 0,
      kind: 'habit',
      hue: 'cyan',
      fixedAt: null,
      habit: { type: 'amount', target: 2, unit: 'glasses', per: 'day', times: 3, remindAt: null },
    });
    await vi.waitFor(() => expect(p.days[TOMORROW].items).toHaveLength(1));
    p.startDay();
    const id = byTitle(p, 'Water').id;
    p.tapHabit(id);
    expect(p.nudge?.text).toBe('Water: 1 of 2 glasses');
    p.tapHabit(id);
    expect(byTitle(p, 'Water')).toMatchObject({ progress: 2, status: 'done' });
    p.tapHabit(id); // past the target: nothing more is counted
    p.tapHabit(id);
    expect(byTitle(p, 'Water').progress).toBe(2);
    expect(p.nudge?.undo).toBeUndefined();
    expect(p.nudge?.text).toMatch(/done for today/);

    p.setHabitProgress(id, 1);
    p.tapHabit(id);
    expect(byTitle(p, 'Water')).toMatchObject({ progress: 2, status: 'done' });
    p.nudge!.undo!();
    expect(byTitle(p, 'Water')).toMatchObject({ progress: 1, status: 'todo', endedAt: null });
    expect(p.nudge).toBeNull();
    await p.flush();
  });

  it('keeps a habit out of the plan: never missed, never started', async () => {
    const p = await boot();
    p.addTask({
      title: 'Stretch',
      min: 0,
      kind: 'habit',
      hue: 'lime',
      fixedAt: null,
      habit: { type: 'check', target: 1, unit: '', per: 'day', times: 3, remindAt: null },
    });
    add(p, 'Write');
    p.startDay();
    expect(byTitle(p, 'Write').status).toBe('running');
    expect(byTitle(p, 'Stretch').status).toBe('todo');
    vi.setSystemTime(new Date(2026, 8, 25, 23, 0));
    p.tick();
    expect(p.sch.rows.filter((r) => isMissed(r, p.n)).map((r) => r.it.title)).not.toContain('Stretch');
    // Let the habit's series finish saving before the next test gets a fresh database.
    await vi.waitFor(() => expect(p.days[TOMORROW].items).toHaveLength(1));
    await p.flush();
  });

  it('moves a task to another day and time from the calendar', async () => {
    const p = await boot();
    add(p, 'Write');
    add(p, 'Review');
    await p.moveItem(TODAY, byTitle(p, 'Write').id, TOMORROW, 600);
    expect(p.day.items.map((i) => i.title)).toEqual(['Review']); // not started: it simply moves
    await p.switchDay(TOMORROW);
    expect(p.day.items.map((i) => i.title)).toEqual(['Write']);
    p.addTask({ title: 'Call', min: 30, kind: 'fixed', hue: 'indigo', fixedAt: 540 });
    await p.moveItem(TOMORROW, byTitle(p, 'Call').id, TOMORROW, 840);
    expect(byTitle(p, 'Call').fixedAt).toBe(840);
    await p.moveItem(TOMORROW, byTitle(p, 'Write').id, TOMORROW, 900);
    expect(p.day.items.map((i) => i.title)).toEqual(['Call', 'Write']);
  });

  it('steps by a week or a month in those views', async () => {
    const p = await boot();
    p.setView('week');
    await p.step(1);
    expect(p.viewKey).toBe('2026-10-02');
    p.setView('month');
    await p.step(-1);
    expect(p.viewKey).toBe('2026-09-02');
    p.setView('day');
  });

  it('keeps goals with progress from linked tasks, and finishes a weekly review', async () => {
    const p = await boot();
    const g = p.addGoal({
      quarter: '2026-Q3',
      title: 'Ship the beta',
      why: '',
      target: null,
      milestones: [{ id: 'm1', t: 'Invite testers', done: false }],
    });
    add(p, 'Build');
    p.edit(byTitle(p, 'Build').id, { goalId: g.id });
    p.startDay();
    vi.setSystemTime(new Date(2026, 8, 25, 10, 30));
    p.tick();
    p.finish(byTitle(p, 'Build').id);
    p.toggleMilestone(g.id, 'm1');
    expect(p.progressOf(p.goals[0])).toMatchObject({ share: 1, minutes: 30, milestones: [1, 1] });

    // The quarter's last week: its review comes first. Then the week's (Fridays at 9).
    p.setSettings({ reviewDay: 5, reviewAt: 540 });
    p.tick();
    expect(p.dueReview).toMatchObject({ kind: 'quarter', id: '2026-Q3' });
    p.editGoal(g.id, { status: 'hit' });
    await p.finishReview(p.dueReview!);
    expect(p.reviews[0].goals[0]).toMatchObject({
      title: 'Ship the beta',
      minutes: 30,
      milestones: [1, 1],
      status: 'hit',
    });
    expect(p.dueReview).toMatchObject({ kind: 'week', from: '2026-09-21', to: '2026-09-27' });
    await p.skipReview(p.dueReview!);
    expect(p.dueReview).toBeNull();
    expect(p.reviews.find((r) => r.kind === 'quarter')).toMatchObject({ numbers: { tasksDone: 1, logged: 30 } });

    const q = await boot();
    expect(q.goals.map((x) => x.title)).toEqual(['Ship the beta']);
    expect(q.reviews).toHaveLength(2);
  });
});
