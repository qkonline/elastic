// Project cards from Boardo in the day (R8.12 to R8.18), and the marks Elastic sends back
// (R8.20 to R8.27): which cards show on which days, and what starting, pausing, setting aside
// and finishing one tells Boardo.

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as A from './actions';
import { Boardo, type BoardoCard, type BoardoOp, byBoard, cardsFor, deadlineLabel } from './boardo.svelte';
import * as db from './db';
import { Planner } from './planner.svelte';

const card = (o: Partial<BoardoCard> = {}): BoardoCard => ({
  id: 'k1',
  title: 'Write the launch email',
  start: '2026-10-20',
  end: '2026-10-22',
  hasTime: false,
  board: { id: 'b1', name: 'Spring launch', hue: 'cyan' },
  status: { label: 'Not started', role: null },
  myDone: null,
  completed: false,
  completedAt: null,
  url: 'https://kaiserkhan.com/boardo/?card=b1/k1',
  ...o,
});
const shown = (day: string, c: BoardoCard, today = '2026-10-25') => cardsFor(day, [c], today);
const prog = { label: 'In progress', role: 'in_progress' as const };

describe('which cards show on a day', () => {
  it('shows on every day its dates cover, and not before', () => {
    expect(shown('2026-10-19', card())).toHaveLength(0);
    for (const d of ['2026-10-20', '2026-10-21', '2026-10-22']) expect(shown(d, card())).toHaveLength(1);
  });
  it('shows a card with one date on that day only', () => {
    expect(shown('2026-10-22', card({ start: null }))).toHaveLength(1);
    expect(shown('2026-10-21', card({ start: null }))).toHaveLength(0);
    expect(shown('2026-10-20', card({ end: null }))).toHaveLength(1);
  });
  it('never shows a card without dates', () => {
    expect(shown('2026-10-21', card({ start: null, end: null }))).toHaveLength(0);
  });
  it('keeps an overdue card, whatever its status, up to today, as Overdue', () => {
    for (const status of [
      prog,
      { label: 'Not started', role: null },
      { label: 'Blocked', role: null },
      { label: null, role: null },
    ]) {
      const c = card({ status });
      expect(shown('2026-10-24', c)[0]).toMatchObject({ overdue: true, deadline: 'Overdue' });
      expect(shown('2026-10-25', c)).toHaveLength(1);
      expect(shown('2026-10-26', c)).toHaveLength(0);
    }
  });
  it('drops an overdue card once my part is done', () => {
    const c = card({ myDone: new Date(2026, 9, 24, 9).getTime() });
    expect(shown('2026-10-24', c)[0]).toMatchObject({ ticked: true });
    expect(shown('2026-10-25', c)).toHaveLength(0);
  });
  it('shows a card ticked on the day my part was done, then not after', () => {
    const doneAt = new Date(2026, 9, 21, 15).getTime();
    const c = card({ myDone: doneAt, status: prog });
    expect(shown('2026-10-21', c)[0]).toMatchObject({ ticked: true, deadline: null });
    expect(shown('2026-10-22', c)).toHaveLength(0);
  });
  it('shows a Completed card finished after its end on that day', () => {
    const c = card({
      completed: true,
      completedAt: new Date(2026, 9, 24, 9).getTime(),
      status: { label: 'Completed', role: 'completed' },
    });
    expect(shown('2026-10-24', c)[0].ticked).toBe(true);
    expect(shown('2026-10-23', c)).toHaveLength(0);
  });
});

describe('cards board by board', () => {
  const on = (id: string, name: string, o: Partial<BoardoCard> = {}) =>
    card({ id: id + name, board: { id: name, name, hue: 'cyan' }, ...o });

  it('groups them by name, keeps their order, and counts done and overdue', () => {
    const rows = cardsFor(
      '2026-10-22',
      [
        on('a', 'Zebra', { end: '2026-10-21' }),
        on('b', 'Apple', { end: '2026-10-25', start: '2026-10-22' }),
        on('c', 'Apple', { end: '2026-10-21' }),
        on('d', 'Apple', { myDone: new Date(2026, 9, 22, 9).getTime() }),
      ],
      '2026-10-22',
    );
    const boards = byBoard(rows);
    expect(boards.map((b) => [b.name, b.rows.length, b.done, b.overdue])).toEqual([
      ['Apple', 3, 1, 1],
      ['Zebra', 1, 0, 1],
    ]);
    expect(boards[0].rows[0].card.id).toBe('cApple');
  });
});

describe('a done mark on its way', () => {
  const metas = new Map<string, unknown>();
  const store = {
    getMeta: async <T>(k: string) => metas.get(k) as T | undefined,
    putMeta: async (k: string, v: unknown) => void metas.set(k, v),
    deleteMeta: async (k: string) => void metas.delete(k),
  };
  const mark = (type: 'done' | 'undone') => ({ type, board: 'b1', cardId: 'k1', sessionId: 'done', at: 5 });

  it('ticks the card at once, and a fetch that has not caught up does not untick it', async () => {
    const b = new Boardo(
      store,
      () => {},
      () => null,
    );
    b.connected = true;
    b.cards = [card()];
    void b.send([mark('done')]);
    expect(b.cards[0].myDone).toBe(5);
    const fetched = (b as unknown as { withMarks(c: BoardoCard[]): BoardoCard[] }).withMarks([card()]);
    expect(fetched[0].myDone).toBe(5);
    void b.send([mark('undone')]);
    expect(b.cards[0]).toMatchObject({ myDone: null, completed: false });
  });
});

describe('deadline labels', () => {
  it.each([
    ['2026-10-22', 'Due today'],
    ['2026-10-23', 'Due tomorrow'],
    ['2026-10-26', 'Monday'],
    ['2026-11-04', '4 Nov'],
    ['2026-10-21', 'Overdue'],
  ])('%s from Thu 22 Oct reads %s', (end, label) => expect(deadlineLabel(end, '2026-10-22')).toBe(label));
  it('includes the time', () => {
    const v = new Date(2026, 9, 22, 17, 0).toISOString();
    expect(deadlineLabel(v, '2026-10-22')).toBe('Due today, 5 pm');
    expect(deadlineLabel(v, '2026-10-22', true)).toBe('Due today, 17:00');
  });
});

describe('starting something else, or ending the day, sets a card aside', () => {
  const day = (items: ReturnType<typeof A.newItem>[]) => ({
    key: '2026-10-22',
    dayStart: 540,
    wrap: 1020,
    dayStarted: 540,
    items,
  });
  it('never marks it done', () => {
    const c = {
      ...A.newItem({ title: 'Card', min: 0, card: { id: 'k1', board: 'b1' } }),
      status: 'running' as const,
      startedAt: 600,
    };
    const t = A.newItem({ title: 'Lunch', min: 30 });
    const d = A.startItem(day([c, t]), t.id, 640);
    expect(d.items.find((i) => i.id === c.id)).toMatchObject({ status: 'postponed', endedAt: 640 });
    const e = A.endDay(day([c]), 700);
    expect(e.items[0]).toMatchObject({ status: 'postponed', endedAt: 700 });
  });
});

describe('what Elastic tells Boardo', () => {
  let sent: Omit<BoardoOp, 'id'>[] = [];
  const live: Planner[] = [];

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 22, 10, 0));
    await db.closeDb();
    globalThis.indexedDB = new IDBFactory();
    globalThis.IDBKeyRange = IDBKeyRange;
    sent = [];
  });
  afterEach(() => {
    live.splice(0).forEach((p) => p.destroy());
    vi.useRealTimers();
  });

  async function boot() {
    const p = new Planner();
    live.push(p);
    await p.init();
    p.boardo.connected = true;
    p.boardo.send = async (ops) => void sent.push(...ops);
    p.addTask({ title: 'Email', min: 30, kind: 'task', hue: 'cyan', fixedAt: null });
    p.startDay();
    sent = [];
    return p;
  }

  it('start, pause, resume, done', async () => {
    const p = await boot();
    p.startCard(card());
    const it = p.day.items.find((i) => i.card)!;
    expect(it).toMatchObject({ min: 0, status: 'running', hue: 'cyan', card: { id: 'k1', board: 'b1' } });
    // Email had run under a minute: it goes back to do rather than leave a record of no work.
    expect(p.day.items.find((i) => i.title === 'Email')!.status).toBe('todo');
    expect(sent.map((o) => o.type)).toEqual(['start']);
    const first = sent[0].sessionId;
    vi.setSystemTime(new Date(2026, 9, 22, 10, 30));
    p.clock = Date.now();
    p.pause(it.id);
    p.resume(it.id);
    p.done(it.id);
    expect(sent.map((o) => o.type)).toEqual(['start', 'stop', 'start', 'stop', 'done']);
    expect(sent[1]).toMatchObject({ sessionId: first, board: 'b1', cardId: 'k1' });
    expect(sent[2].sessionId).not.toBe(first);
    expect(p.day.items.find((i) => i.card)!.status).toBe('done');
  });

  it('starting another task stops the card without marking it done', async () => {
    const p = await boot();
    p.startCard(card());
    p.addTask({ title: 'Lunch', min: 30, kind: 'task', hue: 'cyan', fixedAt: null });
    p.startItem(p.day.items.find((i) => i.title === 'Lunch')!.id);
    expect(sent.map((o) => o.type)).toEqual(['start', 'stop']);
    expect(p.day.items.find((i) => i.card)!.status).toBe('postponed');
  });

  it('waits for Start my day', async () => {
    const p = new Planner();
    live.push(p);
    await p.init();
    p.boardo.connected = true;
    p.addTask({ title: 'Email', min: 30, kind: 'task', hue: 'cyan', fixedAt: null });
    p.startCard(card());
    expect(p.day.items.some((i) => i.card)).toBe(false);
    expect(p.nudge).not.toBeNull();
  });

  it('a card reopened in Boardo goes back to set aside here, its time kept, without telling Boardo', async () => {
    const p = await boot();
    const follow = (at: number) => (p as unknown as { followBoardo(at: number): void }).followBoardo(at);
    p.startCard(card());
    vi.setSystemTime(new Date(2026, 9, 22, 10, 45));
    p.clock = Date.now();
    const id = p.day.items.find((i) => i.card)!.id;
    p.done(id);
    sent = [];
    // Boardo still has my part done: it stays done.
    p.boardo.cards = [card({ myDone: Date.now(), status: prog })];
    vi.setSystemTime(new Date(2026, 9, 22, 11, 0));
    p.clock = Date.now();
    follow(Date.now());
    expect(p.item(id)!.status).toBe('done');
    // Set back to In progress there: set aside here, with the 45 minutes worked.
    p.boardo.cards = [card({ status: prog })];
    follow(Date.now());
    expect(p.item(id)).toMatchObject({ status: 'postponed', startedAt: 600, endedAt: 645 });
    expect(sent).toEqual([]);
  });

  it('a Done not yet heard of in Boardo stands', async () => {
    const p = await boot();
    const follow = (at: number) => (p as unknown as { followBoardo(at: number): void }).followBoardo(at);
    p.startCard(card());
    vi.setSystemTime(new Date(2026, 9, 22, 10, 45));
    p.clock = Date.now();
    const id = p.day.items.find((i) => i.card)!.id;
    p.done(id);
    p.boardo.cards = [card({ status: prog })];
    follow(Date.now() - 1000);
    expect(p.item(id)!.status).toBe('done');
  });

  it('Mark done sends only the mark, and adds nothing to the plan', async () => {
    const p = await boot();
    const items = p.day.items.length;
    p.markCardDone(card());
    expect(sent.map((o) => o.type)).toEqual(['done']);
    expect(sent[0]).toMatchObject({ board: 'b1', cardId: 'k1', sessionId: 'done' });
    expect(p.day.items).toHaveLength(items);
    p.nudge!.undo!();
    expect(sent.map((o) => o.type)).toEqual(['done', 'undone']);
  });

  it('Mark done waits for Start my day', async () => {
    const p = new Planner();
    live.push(p);
    await p.init();
    p.boardo.connected = true;
    p.boardo.send = async (ops) => void sent.push(...ops);
    p.addTask({ title: 'Email', min: 30, kind: 'task', hue: 'cyan', fixedAt: null });
    p.markCardDone(card());
    expect(sent).toEqual([]);
    expect(p.nudge?.text).toMatch(/then mark it done/);
  });

  it('Mark done finishes a card going here', async () => {
    const p = await boot();
    p.startCard(card());
    p.markCardDone(card());
    expect(sent.map((o) => o.type)).toEqual(['start', 'stop', 'done']);
    expect(p.day.items.find((i) => i.card)!.status).toBe('done');
  });

  it('Mark done on a card set aside today finishes its row, and Undo puts it back', async () => {
    const p = await boot();
    p.startCard(card());
    vi.setSystemTime(new Date(2026, 9, 22, 10, 30));
    p.clock = Date.now();
    const id = p.day.items.find((i) => i.card)!.id;
    p.setAside(id);
    sent = [];
    p.markCardDone(card());
    expect(p.item(id)!.status).toBe('done');
    expect(sent.map((o) => o.type)).toEqual(['done']);
    p.boardo.cards = [card({ myDone: Date.now() })];
    p.nudge!.undo!();
    expect(p.item(id)!.status).toBe('postponed');
    expect(sent.map((o) => o.type)).toEqual(['done', 'undone']);
  });

  it('counts up with no time is up alert', async () => {
    const p = await boot();
    p.startCard(card());
    vi.setSystemTime(new Date(2026, 9, 22, 12, 0));
    p.tick();
    expect(p.announce).not.toMatch(/Time's up/);
  });
});
