import { describe, expect, it } from 'vitest';
import { diff, fromPaths, Hlc, merge, newer, stamp, toPaths, ZERO, type Paths } from './lww';

const task = (id: string, title: string, o: Record<string, unknown> = {}) => ({
  id,
  title,
  min: 30,
  kind: 'task',
  hue: 'cyan',
  fixedAt: null,
  status: 'todo',
  startedAt: null,
  endedAt: null,
  pausedAt: null,
  pausedFor: 0,
  repeat: 'Once',
  subtasks: [],
  ...o,
});
const day = (items: object[], o: object = {}) => ({
  key: '2026-10-24',
  dayStart: 540,
  wrap: 1020,
  dayStarted: null,
  items,
  ...o,
});

/** A device: its replica of the day, and changes made to it at its own clock. */
function device(name: string, start: object | null) {
  const hlc = new Hlc(name);
  let replica: Paths = start ? toPaths('day', start) : {};
  return {
    get doc() {
      return fromPaths('day', '2026-10-24', replica) as ReturnType<typeof day>;
    },
    /** Do something: the change it makes, to send. */
    change(fn: (d: ReturnType<typeof day>) => object, wall: number): Paths {
      const prev = this.doc;
      const p = stamp(diff('day', prev, fn(structuredClone(prev))), hlc.now(wall));
      replica = merge(replica, p);
      return p;
    },
    take(p: Paths) {
      for (const [, c] of Object.values(p)) hlc.see(c);
      replica = merge(replica, p);
    },
    get replica() {
      return replica;
    },
  };
}

describe('latest write wins, path by path', () => {
  it('gives back the same day', () => {
    const d = day([task('a', 'Write', { note: 'x', goalId: 'g' }), task('b', 'Read')], { dayStarted: 600 });
    expect(fromPaths('day', d.key, toPaths('day', d))).toEqual(d);
  });

  it('keeps edits to different tasks, and to different fields of one task, from two devices', () => {
    const start = day([task('a', 'Write'), task('b', 'Read')]);
    const phone = device('phone', start);
    const laptop = device('laptop', start);
    const p1 = phone.change(
      (d) => ({
        ...d,
        items: d.items.map((i) => (i.id === 'a' ? { ...i, status: 'done', startedAt: 600, endedAt: 630 } : i)),
      }),
      1000,
    );
    const p2 = laptop.change(
      (d) => ({
        ...d,
        items: d.items.map((i) =>
          i.id === 'a' ? { ...i, title: 'Write more' } : i.id === 'b' ? { ...i, note: 'n' } : i,
        ),
      }),
      1001,
    );
    phone.take(p2);
    laptop.take(p1);
    for (const dev of [phone, laptop]) {
      const [a, b] = dev.doc.items as ReturnType<typeof task>[];
      expect([a.title, a.status, a.endedAt, b.note]).toEqual(['Write more', 'done', 630, 'n']);
    }
    expect(phone.replica).toEqual(laptop.replica);
  });

  it('settles the same field on the later change, whatever order they arrive in', () => {
    const start = day([task('a', 'Write')]);
    const phone = device('phone', start);
    const laptop = device('laptop', start);
    const early = laptop.change((d) => ({ ...d, items: [{ ...d.items[0], title: 'Laptop' }] }), 1000);
    const late = phone.change((d) => ({ ...d, items: [{ ...d.items[0], title: 'Phone' }] }), 2000);
    expect(fromPaths('day', 'k', merge(merge({}, early), late))).toEqual(
      fromPaths('day', 'k', merge(merge({}, late), early)),
    );
    laptop.take(late);
    phone.take(early);
    expect((phone.doc.items[0] as { title: string }).title).toBe('Phone');
    expect((laptop.doc.items[0] as { title: string }).title).toBe('Phone');
  });

  it('keeps a deleted task deleted, even when an older copy of it turns up', () => {
    const start = day([task('a', 'Write'), task('b', 'Read')]);
    const phone = device('phone', start);
    const laptop = device('laptop', start);
    const del = phone.change((d) => ({ ...d, items: d.items.filter((i) => i.id !== 'a') }), 2000);
    laptop.take(del);
    // A device that never heard of the deletion sends the whole day as it was.
    laptop.take(toPaths('day', start, ZERO));
    expect(laptop.doc.items.map((i) => (i as { id: string }).id)).toEqual(['b']);
  });

  it('adds a task made on another device after the ones in the order', () => {
    const start = day([task('a', 'Write')]);
    const phone = device('phone', start);
    const laptop = device('laptop', start);
    const p1 = phone.change((d) => ({ ...d, items: [...d.items, task('p', 'From the phone')] }), 1000);
    const p2 = laptop.change((d) => ({ ...d, items: [task('l', 'From the laptop'), ...d.items] }), 1001);
    phone.take(p2);
    laptop.take(p1);
    expect(phone.doc).toEqual(laptop.doc);
    expect((phone.doc.items as { id: string }[]).map((i) => i.id).sort()).toEqual(['a', 'l', 'p']);
  });

  it('is the same whichever way two copies are merged, and merging again changes nothing', () => {
    const a = stamp({ _: true, 'f.dayStart': 540, order: ['x'], 'i.x': true }, '1');
    const b = stamp({ 'f.dayStart': 600, 'i.x': null }, '2');
    expect(merge(a, b)).toEqual(merge(b, a));
    expect(merge(merge(a, b), b)).toEqual(merge(a, b));
    expect(Object.keys(newer(merge(a, b), b))).toEqual([]);
  });

  it('says a record that goes is gone, and nothing when nothing changed', () => {
    const d = day([task('a', 'Write')]);
    expect(diff('day', d, null)).toEqual({ _: null });
    expect(diff('day', d, structuredClone(d))).toEqual({});
    expect(diff('series', null, { id: 's', title: 'Stretch' })).toEqual({ _: true, 'f.id': 's', 'f.title': 'Stretch' });
  });

  it('never goes back in time, and comes after clocks it has seen', () => {
    const h = new Hlc('a');
    const c1 = h.now(5000);
    const c2 = h.now(4000);
    expect(c2 > c1).toBe(true);
    const other = new Hlc('b').now(9000);
    h.see(other);
    expect(h.now(5000) > other).toBe(true);
  });
});
