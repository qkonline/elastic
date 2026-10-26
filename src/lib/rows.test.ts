import { describe, expect, it } from 'vitest';
import * as A from './actions';
import { dragShifts, itemVM, timelineRows, type TimelineRow } from './rows';
import { schedule } from './schedule';
import type { Day } from './types';

// Just enough of each row for dragShifts: items a–d, with an idle-time row in front of c.
const item = (id: string, idx: number) => ({ type: 'item', key: id, id, idx }) as unknown as TimelineRow;
const rows: TimelineRow[] = [
  item('a', 0),
  item('b', 1),
  { type: 'gap', key: 'gc', gap: '6m' },
  item('c', 2),
  item('d', 3),
];

describe('dragShifts', () => {
  it('slides the rows in between up when a task moves down', () => {
    // Drag a to land before d: b, the idle row and c move up by a's height.
    expect(dragShifts(rows, { id: 'a', over: 3, h: 60 }, 4)).toEqual({ b: -60, gc: -60, c: -60 });
  });

  it('slides them down when a task moves up, opening the gap before the idle row', () => {
    expect(dragShifts(rows, { id: 'd', over: 2, h: 50 }, 4)).toEqual({ gc: 50, c: 50 });
  });

  it('handles dropping at the end and dropping in place', () => {
    expect(dragShifts(rows, { id: 'b', over: 4, h: 40 }, 4)).toEqual({ gc: -40, c: -40, d: -40 });
    expect(dragShifts(rows, { id: 'b', over: 2, h: 40 }, 4)).toEqual({}); // before c is where b already is
    expect(dragShifts(rows, { id: 'b', over: null, h: 40 }, 4)).toEqual({});
  });
});

describe('a long pause', () => {
  it('still shows on the task once it is done', () => {
    // An hour's task started at 2 pm, paused at 2:10, resumed at 7 and done at 7:50.
    let d: Day = {
      key: '2026-09-27',
      dayStart: 840,
      wrap: 1320,
      dayStarted: null,
      items: [A.newItem({ title: 'Deep work', min: 60, id: 'a' })],
    };
    d = A.finish(A.resume(A.pause(A.startDay(d, 840), 'a', 850), 'a', 1140), 'a', 1190);
    const row = schedule(d, 1190).rows[0];
    const vm = itemVM(row, { day: d, rows: [row], n: 1190, isToday: true, showTimes: true, clock24: false });
    expect(vm.sub).toBe('worked 1h');
  });

  it('shows inside the finished task, like idle time, before where it finished', () => {
    // An hour's task started at 2 pm, paused at 2:10 and resumed at 7, then done at 7:50.
    const day = (): Day => ({
      key: '2026-09-27',
      dayStart: 840,
      wrap: 1320,
      dayStarted: null,
      items: [A.newItem({ title: 'Deep work', min: 60, id: 'a' }), A.newItem({ title: 'Email', min: 30, id: 'b' })],
    });
    const at = (d: Day, n: number) =>
      timelineRows({ day: d, rows: schedule(d, n).rows, n, isToday: true, showTimes: true, clock24: false })
        .filter((r) => r.type !== 'now')
        .map((r) => (r.type === 'item' ? r.id : r.type === 'pause' ? `paused ${r.pause}, ${r.then}` : r.type));

    const paused = A.pause(A.startDay(day(), 840), 'a', 850);
    expect(at(paused, 1000)).toEqual(['a', 'b']); // while paused, its card counts the pause
    const again = A.resume(paused, 'a', 1140);
    expect(at(again, 1150)).toEqual(['a', 'b']); // nor while it's running again
    expect(at(A.finish(again, 'a', 1190), 1190)).toEqual(['a', 'paused 4h 50m, resumed, then done at 7:50 pm', 'b']);
    // A task never paused has none.
    expect(at(A.finish(A.startDay(day(), 840), 'a', 900), 900)).toEqual(['a', 'b']);
  });
});
