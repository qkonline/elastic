import { describe, expect, it } from 'vitest';
import * as A from './actions';
import { newItem } from './actions';
import { dayStats, isMissed, schedule, worked } from './schedule';
import { clockToDay, minutesInto } from './time';
import type { Day, Item } from './types';

const day = (items: Item[], o: Partial<Day> = {}): Day => ({
  key: '2026-09-25',
  dayStart: 540,
  wrap: 1020,
  dayStarted: null,
  items,
  ...o,
});
const t = (title: string, min: number, o: Partial<Item> = {}) => newItem({ title, min, ...o });

describe('schedule', () => {
  it('chains todo items from the day start when the day has not started', () => {
    const { rows, finish } = schedule(day([t('a', 30), t('b', 45)]), 500);
    expect(rows.map((r) => [r.start, r.end])).toEqual([
      [540, 570],
      [570, 615],
    ]);
    expect(finish).toBe(615);
  });

  it('chains from dayStarted once the day has started', () => {
    const { rows } = schedule(day([t('a', 30)], { dayStarted: 552 }), 552);
    expect(rows[0].start).toBe(552);
  });

  it('uses actual times for done items and reports idle gaps', () => {
    const d = day(
      [
        t('a', 15, { status: 'done', startedAt: 552, endedAt: 564 }),
        t('b', 30, { status: 'done', startedAt: 570, endedAt: 600 }),
      ],
      {
        dayStarted: 552,
      },
    );
    const { rows } = schedule(d, 610);
    expect(rows[0]).toMatchObject({ start: 552, end: 564, gap: 0 });
    expect(rows[1]).toMatchObject({ start: 570, end: 600, gap: 6 });
  });

  it('extends a running item past its planned end while it runs over', () => {
    const d = day([t('a', 30, { status: 'running', startedAt: 540 }), t('b', 30)], { dayStarted: 540 });
    expect(schedule(d, 560).rows.map((r) => r.end)).toEqual([570, 600]);
    expect(schedule(d, 590).rows.map((r) => r.end)).toEqual([590, 620]);
  });

  it('slides the rest of the day later while paused', () => {
    const d = day([t('a', 30, { status: 'paused', startedAt: 540, pausedAt: 550 }), t('b', 30)], { dayStarted: 540 });
    // 10 minutes worked, 20 left: ends 20 minutes after now, whatever now is.
    expect(schedule(d, 560).rows[0].end).toBe(580);
    expect(schedule(d, 600).rows[0].end).toBe(620);
    expect(schedule(d, 600).rows[1].start).toBe(620);
  });

  it('places fixed items at their time and lets the cursor jump past them', () => {
    const d = day([t('a', 20), t('std', 15, { kind: 'fixed', fixedAt: 570 }), t('b', 30)]);
    const { rows } = schedule(d, 500);
    expect(rows[1]).toMatchObject({ start: 570, end: 585 });
    expect(rows[2].start).toBe(585);
  });

  it('does not slide the plan through idle time, so items become missed', () => {
    const d = day([t('a', 30), t('b', 30)]);
    const { rows } = schedule(d, 700);
    expect(rows[0].end).toBe(570);
    expect(isMissed(rows[0], 700)).toBe(true);
    expect(isMissed(rows[1], 700)).toBe(true);
  });

  it('moves a fixed item later when the tasks lined up before it do not fit', () => {
    // The screenshot: a 1h rest put in front of a 2h session fixed at 9:00.
    const d = day([
      t('rest', 60, { kind: 'buffer' }),
      t('session', 120, { kind: 'fixed', fixedAt: 540 }),
      t('next', 120),
    ]);
    const { rows } = schedule(d, 500);
    expect(rows.map((r) => [r.start, r.end])).toEqual([
      [540, 600],
      [600, 720],
      [720, 840],
    ]);
    expect(rows[1].moved).toBe(true);
    expect(rows[0].runsInto).toBeUndefined();
    // With room to spare it keeps its time.
    const roomy = schedule({ ...d, items: [t('short', 30), t('call', 30, { kind: 'fixed', fixedAt: 600 })] }, 500);
    expect(roomy.rows[1]).toMatchObject({ start: 600 });
    expect(roomy.rows[1].moved).toBeUndefined();
  });

  it('keeps a fixed item at its time for a running timer, and flags the overlap', () => {
    const d = day(
      [
        t('long', 120, { status: 'running', startedAt: 510 }),
        t('between', 30),
        t('meet', 30, { kind: 'fixed', fixedAt: 540 }),
      ],
      { dayStarted: 510 },
    );
    const { rows } = schedule(d, 515);
    expect(rows[2]).toMatchObject({ start: 540, end: 570 });
    expect(rows[2].moved).toBeUndefined();
    expect(rows[0].runsInto).toBe(true);
  });

  it('keeps a fixed item at its time when only finished work runs past it', () => {
    const d = day(
      [t('done', 90, { status: 'done', startedAt: 480, endedAt: 570 }), t('meet', 30, { kind: 'fixed', fixedAt: 540 })],
      {
        dayStarted: 480,
      },
    );
    expect(schedule(d, 575).rows[1]).toMatchObject({ start: 540 });
  });

  it('flags items past wrap-up', () => {
    const d = day([t('long', 60), t('late', 600)]);
    expect(schedule(d, 500).rows[1].pastEnd).toBe(true);
  });

  it('gives skipped and not-started postponed items zero height', () => {
    const d = day([t('a', 30, { status: 'skipped' }), t('b', 30, { status: 'postponed' }), t('c', 30)]);
    const { rows } = schedule(d, 500);
    expect(rows[0].end - rows[0].start).toBe(0);
    expect(rows[1].end - rows[1].start).toBe(0);
    expect(rows[2].start).toBe(540);
  });
});

describe('worked', () => {
  it('subtracts paused time', () => {
    expect(worked(t('a', 30, { status: 'running', startedAt: 540, pausedFor: 5 }), 560)).toBe(15);
    expect(worked(t('a', 30, { status: 'paused', startedAt: 540, pausedAt: 550, pausedFor: 2 }), 600)).toBe(8);
    expect(worked(t('a', 30, { status: 'done', startedAt: 540, endedAt: 580, pausedFor: 10 }), 600)).toBe(30);
    expect(worked(t('a', 30), 600)).toBe(0);
  });
});

describe('minutesInto', () => {
  it('follows the wall clock, including on days the clocks change', () => {
    expect(minutesInto('2026-09-25', new Date(2026, 8, 25, 10, 0).getTime())).toBe(600);
    // US/EU clock changes: 10:00 is still minute 600 of the day.
    expect(minutesInto('2026-03-08', new Date(2026, 2, 8, 10, 0).getTime())).toBe(600);
    expect(minutesInto('2026-03-29', new Date(2026, 2, 29, 10, 0).getTime())).toBe(600);
    expect(minutesInto('2026-11-01', new Date(2026, 10, 1, 10, 0).getTime())).toBe(600);
    // Past midnight counts on from the same day.
    expect(minutesInto('2026-09-25', new Date(2026, 8, 26, 0, 30).getTime())).toBe(1470);
  });
});

describe('clockToDay', () => {
  it('reads small clock times as the next morning on a day that runs past midnight', () => {
    expect(clockToDay(60, 1500)).toBe(1500); // 1 am, at 1 am
    expect(clockToDay(120, 1500)).toBe(1560); // 2 am, an hour from now
    expect(clockToDay(600, 1500)).toBe(600); // 10 am is still this morning
    expect(clockToDay(60, 900)).toBe(60); // before midnight nothing changes
  });
});

describe('checks', () => {
  it('take no room on the timeline and are never missed', () => {
    const chk = t('mail', 0, { kind: 'check' });
    const { rows, finish } = schedule(day([t('a', 30), chk, t('b', 30)]), 700);
    expect(rows.map((r) => r.end - r.start)).toEqual([30, 0, 30]);
    expect(finish).toBe(600);
    expect(isMissed(rows[1], 700)).toBe(false);
  });

  it('count no time worked, even when ticked', () => {
    expect(worked(t('mail', 0, { kind: 'check', status: 'done', endedAt: 600 }), 700)).toBe(0);
  });
});

describe('an ended day', () => {
  it('flags nothing, since nothing is left to fit', () => {
    const d = day([t('a', 600), t('b', 60)], { dayStarted: 540, dayEnded: 700 });
    expect(schedule(d, 700).rows.some((r) => r.pastEnd || r.runsInto)).toBe(false);
    // Still going, the task too long for what's left stacks against the wrap-up instead.
    const open = schedule({ ...d, dayEnded: null }, 700).rows;
    expect(open.map((r) => r.end)).toEqual([d.wrap - 60, d.wrap]);
    expect(open.some((r) => r.pastEnd)).toBe(false);
  });
});

describe('dayStats', () => {
  it('counts tasks done, time logged and checks, leaving out skipped and moved items', () => {
    const d = day([
      t('a', 30, { status: 'done', startedAt: 540, endedAt: 580 }),
      t('b', 30, { status: 'running', startedAt: 590 }),
      t('c', 30, { status: 'skipped' }),
      t('d', 30, { status: 'postponed', movedKey: '2026-09-26' }),
      t('buf', 15, { kind: 'buffer' }),
      t('mail', 0, { kind: 'check', status: 'done', endedAt: 600 }),
      t('gym', 0, { kind: 'check' }),
    ]);
    expect(dayStats(d, 600)).toEqual({ tasks: 2, tasksDone: 1, logged: 50, checks: 2, checksDone: 1 });
  });
});

describe('following the now line', () => {
  const at = (d: Day, n: number) => schedule(d, n).rows.map((r) => `${r.it.title} ${r.start}-${r.end}`);

  it('keeps the next task at the now line after a break, and counts the break as idle', () => {
    // Started at 10; breakfast 10 to 11, then out until 11:30.
    const d = day(
      [t('breakfast', 60, { status: 'done', startedAt: 600, endedAt: 660 }), t('email', 60), t('read', 30)],
      {
        dayStarted: 600,
        wrap: 1080,
      },
    );
    const rows = schedule(d, 690).rows;
    expect(at(d, 690)).toEqual(['breakfast 600-660', 'email 690-750', 'read 750-780']);
    expect(rows[1].gap).toBe(30);
    expect(rows.some((r) => isMissed(r, 690))).toBe(false);
  });

  it('leaves the plan as it was before Start my day and once the day has ended', () => {
    const items = [t('a', 60), t('b', 60)];
    expect(at(day(items), 700)).toEqual(['a 540-600', 'b 600-660']);
    expect(at(day(items, { dayStarted: 540, dayEnded: 560 }), 700)).toEqual(['a 540-600', 'b 600-660']);
  });

  it('keeps fixed items at their time, even with tasks pushed in front of them', () => {
    const d = day([t('a', 60), t('meet', 30, { kind: 'fixed', fixedAt: 720 }), t('b', 30)], { dayStarted: 540 });
    const rows = schedule(d, 690).rows;
    expect(at(d, 690)).toEqual(['a 690-750', 'meet 720-750', 'b 750-780']);
    expect(rows[1].moved).toBeUndefined();
    expect(rows[0].runsInto).toBe(true); // until letThrough() puts it after the meeting
  });

  it('counts the idle time before a fixed item once its time has come, not before', () => {
    const d = day(
      [t('a', 15, { status: 'done', startedAt: 600, endedAt: 615 }), t('meet', 15, { kind: 'fixed', fixedAt: 645 })],
      { dayStarted: 600 },
    );
    expect(schedule(d, 630).rows[1].gap).toBe(0); // 10:30: the 10:45 meeting is still ahead
    expect(schedule(d, 645).rows[1].gap).toBe(30);
  });

  it('keeps a buffer at its time, missed once the now line has passed it', () => {
    const d = day(
      [
        t('a', 60, { status: 'done', startedAt: 600, endedAt: 660 }),
        t('pause', 15, { kind: 'buffer', heldAt: 660 }),
        t('b', 30),
      ],
      {
        dayStarted: 600,
      },
    );
    const rows = schedule(d, 700).rows;
    expect(at(d, 700)).toEqual(['a 600-660', 'pause 660-675', 'b 700-730']);
    expect(isMissed(rows[1], 700)).toBe(true);
    expect(isMissed(rows[2], 700)).toBe(false);
  });

  it('stacks what no longer fits against the wrap-up; a task is missed once the line passes its end', () => {
    // Wrap-up at 6 pm; at 3 pm two 2-hour tasks are left (4 hours, 3 to go).
    const d = day([t('a', 120), t('b', 120)], { dayStarted: 600, wrap: 1080 });
    expect(at(d, 840)).toEqual(['a 840-960', 'b 960-1080']); // 2 pm: still just fits
    expect(at(d, 900)).toEqual(['a 840-960', 'b 960-1080']); // 3 pm: stacked
    expect(schedule(d, 900).rows.some((r) => isMissed(r, 900))).toBe(false);
    expect(
      schedule(d, 960)
        .rows.filter((r) => isMissed(r, 960))
        .map((r) => r.it.title),
    ).toEqual(['a']);
    expect(schedule(d, 900).rows.some((r) => r.pastEnd)).toBe(false);
  });

  it("takes a buffer's time when the day is too full for what's left", () => {
    // 3:30 pm: three hours of tasks, a buffer held at 4:30, two and a half hours to the 6 pm wrap-up.
    const d = day([t('a', 60), t('b', 60), t('pause', 30, { kind: 'buffer', heldAt: 990 }), t('c', 60)], {
      dayStarted: 600,
      wrap: 1080,
    });
    const s = schedule(d, 930);
    expect(s.stacked).toBe(true);
    expect(at(d, 930)).toEqual(['a 900-960', 'b 960-1020', 'pause 990-1020', 'c 1020-1080']);
    // ...and doesn't move the buffer up in front of the tasks, as it would with time to spare.
    expect(A.letThrough(d, 930)).toBe(d);
  });

  it('never stacks a task over the one under way or one done', () => {
    const run = t('r', 120, { status: 'running', startedAt: 600 });
    const d = day([run, t('next', 60)], { dayStarted: 600, wrap: 700 });
    const [, next] = schedule(d, 610).rows;
    expect(next.start).toBeGreaterThanOrEqual(720);
    expect(isMissed(schedule(d, 705).rows[1], 705)).toBe(false);
    const done = day([t('d', 160, { status: 'done', startedAt: 540, endedAt: 700 }), t('next', 60)], {
      dayStarted: 540,
      wrap: 720,
    });
    expect(schedule(done, 700).rows[1].start).toBeGreaterThanOrEqual(700);
  });

  it('never stacks a task into a fixed item listed above it', () => {
    const d = day([t('a', 60), t('meet', 30, { kind: 'fixed', fixedAt: 1050 }), t('b', 30)], {
      dayStarted: 600,
      wrap: 1080,
    });
    // At 4:30 pm "a" fits before the meeting at 5:30; "b", after the meeting, can't fit before
    // the 6 pm wrap-up at all, so it runs past it rather than into the meeting.
    expect(at(d, 990)).toEqual(['a 990-1050', 'meet 1050-1080', 'b 1080-1110']);
    expect(schedule(d, 990).rows[2].pastEnd).toBe(true);
  });
});
