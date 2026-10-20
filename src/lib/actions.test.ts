import { describe, expect, it } from 'vitest';
import * as A from './actions';
import { isMissed, schedule } from './schedule';
import type { Day, Item } from './types';

const t = (title: string, min: number, o: Partial<Item> = {}) => A.newItem({ title, min, id: title, ...o });
const day = (items: Item[], o: Partial<Day> = {}): Day => ({
  key: '2026-09-25',
  dayStart: 540,
  wrap: 1020,
  dayStarted: null,
  items,
  ...o,
});
const st = (d: Day) => d.items.map((i) => `${i.id}:${i.status}`);

describe('timer actions', () => {
  it('starting an item finishes the running one as done and stamps the day', () => {
    let d = day([t('a', 30), t('b', 30)]);
    d = A.startItem(d, 'a', 545);
    expect(d.dayStarted).toBe(545);
    d = A.startItem(d, 'b', 560);
    expect(st(d)).toEqual(['a:done', 'b:running']);
    expect(d.items[0].endedAt).toBe(560);
  });

  it('starting while another is paused sets the paused one aside, not done', () => {
    // "a" ran 9:00–9:10 and was paused; "b" starts at 9:20.
    let d = day([t('a', 30, { status: 'paused', startedAt: 540, pausedAt: 550 }), t('b', 30)], { dayStarted: 540 });
    d = A.startItem(d, 'b', 560);
    expect(d.items[0]).toMatchObject({ id: 'a', status: 'postponed', startedAt: 540, endedAt: 550, pausedAt: null });
    expect(d.items.map((i) => i.id).slice(0, 2)).toEqual(['a', 'b']);
    // The rest comes straight after the task just started.
    expect(d.items[2]).toMatchObject({ title: 'a', min: 20, status: 'todo', continued: true });
    const rows = schedule(d, 560).rows;
    expect(rows.map((r) => [r.start, r.end])).toEqual([
      [540, 550],
      [560, 590],
      [590, 610],
    ]);
    expect(rows[1].gap).toBe(10); // the pause shows as idle time before "b"
  });

  it('a paused task that already used its time is finished instead', () => {
    let d = day([t('a', 30, { status: 'paused', startedAt: 540, pausedAt: 575 }), t('b', 30)], { dayStarted: 540 });
    d = A.startItem(d, 'b', 580);
    expect(d.items[0]).toMatchObject({ status: 'done', pausedFor: 5, pausedAt: null, endedAt: 580 });
    expect(d.items).toHaveLength(2);
  });

  it('never starts a buffer', () => {
    const d = day([t('buf', 15, { kind: 'buffer' })]);
    expect(A.startItem(d, 'buf', 540)).toBe(d);
  });

  it('Start my day starts the first pending task, skipping buffers', () => {
    const d = A.startDay(day([t('buf', 15, { kind: 'buffer' }), t('a', 30)]), 552);
    expect(d.dayStarted).toBe(552);
    // The started task becomes the current point; the leading buffer now follows it.
    expect(st(d)).toEqual(['a:running', 'buf:todo']);
  });

  it('pause and resume accumulate paused time', () => {
    let d = A.startItem(day([t('a', 30)]), 'a', 540);
    d = A.pause(d, 'a', 550);
    d = A.resume(d, 'a', 557);
    expect(d.items[0]).toMatchObject({ status: 'running', pausedFor: 7, pausedAt: null });
    d = A.finish(d, 'a', 580);
    expect(d.items[0]).toMatchObject({ status: 'done', endedAt: 580 });
  });
});

describe('postpone', () => {
  it('Later today, not started: moves to the end', () => {
    const d = A.postponeLater(day([t('a', 30), t('b', 30)]), 'a', 540);
    expect(st(d)).toEqual(['b:todo', 'a:todo']);
  });

  it('Later today, mid-task: keeps the logged time and appends the remainder', () => {
    const d = A.postponeLater(day([t('a', 45, { status: 'running', startedAt: 540 }), t('b', 30)]), 'a', 560);
    expect(d.items[0]).toMatchObject({ status: 'postponed', endedAt: 560, laterCopy: true });
    expect(d.items[2]).toMatchObject({ title: 'a', min: 25, continued: true, status: 'todo' });
  });

  it('reopening a task worked on keeps its logged time and continues it from now', () => {
    // "a" ran 9:00 to 10:00, "b" 10:00 to 10:30; at 11:00 "a" turns out not to be finished.
    const d0 = day(
      [
        t('a', 60, { status: 'done', startedAt: 540, endedAt: 600, goalId: 'g' }),
        t('b', 30, { status: 'done', startedAt: 600, endedAt: 630 }),
        t('c', 30),
      ],
      { dayStarted: 463 },
    );
    const d = A.reopen(d0, 'a', 660);
    expect(d.items[0]).toMatchObject({ id: 'a', status: 'postponed', startedAt: 540, endedAt: 600, laterCopy: true });
    // "c" was already missed (planned 10:30 to 11:00), so it stays where it was.
    expect(d.items.map((i) => i.title)).toEqual(['a', 'b', 'c', 'a']);
    expect(d.items[3]).toMatchObject({
      status: 'todo',
      continued: true,
      min: A.REOPEN_MIN,
      goalId: 'g',
      planFrom: 660,
    });
    const rows = schedule(d, 660).rows;
    // The rest is planned from now, not from where the last task ended.
    expect(rows.map((r) => [r.start, r.end])).toEqual([
      [540, 600],
      [600, 630],
      [630, 660],
      [660, 675],
    ]);
    expect(isMissed(rows[3], 670)).toBe(false);
  });

  it('a reopened task goes in front of what is still to come, planned from now', () => {
    // At 10:40 "c" (planned 10:30 to 11:30) isn't missed yet: the rest goes in front of it.
    const d0 = day(
      [
        t('a', 60, { status: 'done', startedAt: 540, endedAt: 600 }),
        t('b', 30, { status: 'done', startedAt: 600, endedAt: 630 }),
        t('c', 60),
      ],
      { dayStarted: 540 },
    );
    const d = A.reopen(d0, 'a', 640);
    expect(d.items.map((i) => i.title)).toEqual(['a', 'b', 'a', 'c']);
    const rows = schedule(d, 640).rows;
    expect(rows.map((r) => [r.start, r.end])).toEqual([
      [540, 600],
      [600, 630],
      [640, 655],
      [655, 715],
    ]);
    expect(rows[2].gap).toBe(10);
  });

  it('reopening a task finished early leaves it the time it had left', () => {
    const d = A.reopen(
      day([t('a', 60, { status: 'done', startedAt: 540, endedAt: 580 })], { dayStarted: 540 }),
      'a',
      600,
    );
    expect(d.items[1]).toMatchObject({ title: 'a', min: 20, continued: true });
  });

  it('reopening a task only marked done, or a check, puts it back in the plan', () => {
    const d0 = day(
      [
        t('a', 30, { status: 'done', startedAt: 540, endedAt: 570, marked: true }),
        t('k', 0, { kind: 'check', status: 'done', endedAt: 560 }),
      ],
      { dayStarted: 540 },
    );
    let d = A.reopen(d0, 'a', 600);
    d = A.reopen(d, 'k', 600);
    expect(st(d)).toEqual(['a:todo', 'k:todo']);
    expect(d.items[0]).toMatchObject({ startedAt: null, endedAt: null, marked: false });
  });

  it('moving a not-started item to another day leaves an undoable marker', () => {
    const res = A.moveOut(day([t('a', 30, { subtasks: [{ id: 's', t: 'x', d: true }] })]), 'a', '2026-09-26', 540)!;
    expect(res.day.items[0]).toMatchObject({
      status: 'postponed',
      movedKey: '2026-09-26',
      movedId: res.copy.id,
      startedAt: null,
    });
    expect(res.copy).toMatchObject({ title: 'a', min: 30, status: 'todo', repeat: 'Once' });
    expect(res.copy.subtasks[0].d).toBe(false);
    const back = A.restore(res.day, 'a');
    expect(back.items[0]).toMatchObject({ status: 'todo', movedKey: null });
  });

  it('moving mid-task keeps the logged time and moves only what is left', () => {
    const res = A.moveOut(day([t('a', 60, { status: 'running', startedAt: 540 })]), 'a', '2026-09-26', 580)!;
    expect(res.day.items[0]).toMatchObject({ status: 'postponed', startedAt: 540, endedAt: 580 });
    expect(res.copy).toMatchObject({ min: 20, continued: true });
  });
});

describe('starting late', () => {
  const plan = (d: Day, n: number) => schedule(d, n).rows.map((r) => `${r.it.id} ${r.start}-${r.end}`);

  it('starting a missed task at noon moves only that task; the other missed ones stay missed', () => {
    // Day started at 9. "work" was planned 10–11, "call" 11–11:30 and "report" 11:30–12:15:
    // by noon the first two are missed.
    const d0 = day(
      [t('mail', 60, { status: 'done', startedAt: 540, endedAt: 600 }), t('work', 60), t('call', 30), t('report', 45)],
      { dayStarted: 540 },
    );
    const res = A.reschedNow(d0, 'work');
    expect(res.start).toBe(true);
    const d1 = A.startItem(res.day, 'work', 720);
    expect(plan(d1, 720)).toEqual(['mail 540-600', 'call 600-630', 'work 720-780', 'report 780-825']);
    const rows = schedule(d1, 720).rows;
    expect(rows.filter((r) => isMissed(r, 720)).map((r) => r.it.id)).toEqual(['call']);
    expect(rows.find((r) => r.it.id === 'work')?.gap).toBe(90); // idle from 10:30 to noon
  });

  it('keeps missed tasks missed when a task starts before Start my day', () => {
    // Planned from 10, never started; at noon "a" and "b" are missed and "c" is on now.
    const d0 = day([t('a', 60), t('b', 60), t('c', 60), t('d', 30)], { dayStart: 600 });
    const d1 = A.startItem(d0, 'b', 720);
    expect(d1.dayStarted).toBe(720);
    expect(plan(d1, 720)).toEqual(['a 600-660', 'b 720-780', 'c 780-840', 'd 840-870']);
    expect(
      schedule(d1, 720)
        .rows.filter((r) => isMissed(r, 720))
        .map((r) => r.it.id),
    ).toEqual(['a']);
    // Time before the day started isn't idle time.
    expect(schedule(d1, 720).rows[1].gap).toBe(0);
  });

  it('Start my day plans everything still to do from now', () => {
    const d0 = day([t('work', 60), t('call', 30), t('report', 45)], { dayStart: 600 });
    const d1 = A.startDay(d0, 720);
    expect(d1.dayStarted).toBe(720);
    expect(plan(d1, 720)).toEqual(['work 720-780', 'call 780-810', 'report 810-855']);
  });

  it('starting a task further down brings it up in front of the ones not started yet', () => {
    const d0 = day(
      [t('mail', 30, { status: 'done', startedAt: 540, endedAt: 570 }), t('a', 30), t('b', 30), t('c', 30)],
      {
        dayStarted: 540,
      },
    );
    const d1 = A.startItem(d0, 'c', 580); // "a" (planned 9:30–10) is under way, not missed
    expect(d1.items.map((i) => i.id)).toEqual(['mail', 'c', 'a', 'b']);
    expect(plan(d1, 580)).toEqual(['mail 540-570', 'c 580-610', 'a 610-640', 'b 640-670']);
  });

  it('adds a fixed item where its time falls, so a busy plan does not push it', () => {
    const d0 = day([t('a', 60), t('b', 60), t('c', 60)]); // 9:00, 10:00, 11:00
    const call = { ...t('call', 30, { kind: 'fixed' as const, fixedAt: 630 }) }; // 10:30
    const d1 = A.addItem(d0, call, 500);
    // In front of b, which would clash with it, leaving a gap rather than an overlap.
    expect(d1.items.map((i) => i.id)).toEqual(['a', 'call', 'b', 'c']);
    expect(plan(d1, 500)).toEqual(['a 540-600', 'call 630-660', 'b 660-720', 'c 720-780']);
    // A later time moves it along the list, an earlier one before everything it would clash with.
    expect(A.placeFixed(A.patchItem(d1, 'call', { fixedAt: 720 }), 'call', 500).items.map((i) => i.id)).toEqual([
      'a',
      'b',
      'c',
      'call',
    ]);
    expect(A.placeFixed(A.patchItem(d1, 'call', { fixedAt: 540 }), 'call', 500).items[0].id).toBe('call');
  });

  it('keeps fixed-time items at their time', () => {
    const d0 = day([t('a', 30), t('meet', 30, { kind: 'fixed', fixedAt: 900 }), t('b', 60)], { dayStarted: 540 });
    const d1 = A.startItem(d0, 'b', 720);
    expect(plan(d1, 720)).toEqual(['a 540-570', 'b 720-780', 'meet 900-930']);
  });

  it('Do it next goes right after the running task without starting', () => {
    const d = day([t('a', 30), t('run', 30, { status: 'running', startedAt: 600 }), t('b', 30)], { dayStarted: 540 });
    const res = A.reschedNow(d, 'a');
    expect(res.start).toBe(false);
    expect(res.day.items.map((i) => i.id)).toEqual(['run', 'a', 'b']);
  });

  it('Later today goes before the first pending item starting at or after the time', () => {
    const d = day([t('a', 30), t('b', 60), t('c', 60), t('d', 60)]);
    // Planned: a 9:00, b 9:30, c 10:30, d 11:30. Move 'a' to around 11:00 (before d).
    const out = A.reschedLater(d, 'a', 660, 545);
    expect(out.items.map((i) => i.id)).toEqual(['b', 'c', 'a', 'd']);
  });
});

describe('reorder', () => {
  it('drops before the target index', () => {
    const d = day([t('a', 1), t('b', 1), t('c', 1)]);
    expect(A.reorder(d, 'a', 3).items.map((i) => i.id)).toEqual(['b', 'c', 'a']);
    expect(A.reorder(d, 'c', 0).items.map((i) => i.id)).toEqual(['c', 'a', 'b']);
    expect(A.move(d, 'b', -1).items.map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('setKind to fixed defaults the time and swaps cyan for indigo', () => {
    const d = A.setKind(day([t('a', 30)]), 'a', 'fixed');
    expect(d.items[0]).toMatchObject({ kind: 'fixed', fixedAt: 540, hue: 'indigo' });
  });
});

describe('checks and the end of the day', () => {
  const c = (title: string, o: Partial<Item> = {}) => t(title, 0, { kind: 'check', ...o });

  it('ticks and unticks a check', () => {
    let d = A.toggleCheck(day([c('mail')]), 'mail', 600);
    expect(d.items[0]).toMatchObject({ status: 'done', endedAt: 600 });
    d = A.toggleCheck(d, 'mail', 610);
    expect(d.items[0]).toMatchObject({ status: 'todo', endedAt: null });
  });

  it('never times a check', () => {
    const d = day([c('mail')]);
    expect(A.startItem(d, 'mail', 540)).toBe(d);
    expect(st(A.startDay(day([c('mail'), t('a', 30)]), 545)).sort()).toEqual(['a:running', 'mail:todo']);
  });

  it('leaves checks where they are when a task starts', () => {
    const d = A.startItem(day([t('a', 30), c('mail'), t('b', 30)]), 'b', 545);
    expect(d.items.map((i) => i.id)).toEqual(['b', 'a', 'mail']);
  });

  it('ending the day finishes the running task, and starting one reopens it', () => {
    let d = A.startItem(day([t('a', 30), t('b', 30)]), 'a', 545);
    d = A.endDay(d, 1500);
    expect(d.dayEnded).toBe(1500);
    expect(d.items[0]).toMatchObject({ status: 'done', endedAt: 1500 });
    expect(A.reopenDay(d).dayEnded).toBeNull();
    expect(A.startItem(d, 'b', 1510).dayEnded).toBeNull();
  });
});

describe('correcting recorded times', () => {
  // "a" ran 9:00–9:30, "b" 9:40–10:20, "c" has been running since 10:30; now is 10:45.
  const d0 = day(
    [
      t('a', 30, { status: 'done', startedAt: 540, endedAt: 570 }),
      t('b', 30, { status: 'done', startedAt: 580, endedAt: 620 }),
      t('c', 30, { status: 'running', startedAt: 630 }),
      t('d', 30),
    ],
    { dayStarted: 540 },
  );

  it('moves a running task’s start, but not into the task before it or past now', () => {
    expect(A.timeBounds(d0, 'c', 645, 645)).toEqual({ start: [620, 645], end: null });
    expect(A.find(A.retime(d0, 'c', { start: 625 }, 645, 645), 'c')!.startedAt).toBe(625);
    expect(A.find(A.retime(d0, 'c', { start: 600 }, 645, 645), 'c')!.startedAt).toBe(620);
    expect(A.find(A.retime(d0, 'c', { start: 700 }, 645, 645), 'c')!.startedAt).toBe(645);
  });

  it('moves a done task’s start and finish between its neighbours, a minute apart at least', () => {
    expect(A.timeBounds(d0, 'b', 645, 645)).toEqual({ start: [570, 619], end: [581, 630] });
    const d1 = A.retime(d0, 'b', { start: 575, end: 615 }, 645, 645);
    expect(A.find(d1, 'b')).toMatchObject({ startedAt: 575, endedAt: 615 });
    expect(A.find(A.retime(d0, 'b', { end: 700 }, 645, 645), 'b')!.endedAt).toBe(630);
  });

  it('shrinks a pause that no longer fits', () => {
    const paused = day([t('a', 30, { status: 'done', startedAt: 540, endedAt: 600, pausedFor: 30 })], {
      dayStarted: 540,
    });
    expect(A.find(A.retime(paused, 'a', { start: 590 }, 700, 700), 'a')).toMatchObject({
      startedAt: 590,
      pausedFor: 9,
    });
  });

  it('moves the day’s start back with an earlier first task, and never after it', () => {
    expect(A.retime(d0, 'a', { start: 520 }, 645, 645).dayStarted).toBe(520);
    expect(A.dayStartBounds(d0, 645)).toEqual([0, 540]);
    expect(A.retimeDay(d0, 600, 645).dayStarted).toBe(540);
    expect(A.retimeDay(d0, 510, 645).dayStarted).toBe(510);
  });
});
