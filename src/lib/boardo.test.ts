// Project cards from Boardo in the day (R8.12 to R8.18), and the marks Elastic sends back
// (R8.20 to R8.27): which cards show on which days, and what starting, pausing, setting aside
// and finishing one tells Boardo.

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as A from './actions';
import { type BoardoCard, type BoardoOp, cardsFor, deadlineLabel } from './boardo.svelte';
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
  it('keeps an overdue card that is In progress, up to today, as Overdue', () => {
    const c = card({ status: prog });
    expect(shown('2026-10-24', c)[0]).toMatchObject({ overdue: true, deadline: 'Overdue' });
    expect(shown('2026-10-25', c)).toHaveLength(1);
    expect(shown('2026-10-26', c)).toHaveLength(0);
  });
  it('drops an overdue card that is not In progress after its days', () => {
    expect(shown('2026-10-23', card({ status: { label: 'Blocked', role: null } }))).toHaveLength(0);
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
    expect(p.day.items.find((i) => i.title === 'Email')!.status).toBe('done');
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

  it('counts up with no time is up alert', async () => {
    const p = await boot();
    p.startCard(card());
    vi.setSystemTime(new Date(2026, 9, 22, 12, 0));
    p.tick();
    expect(p.announce).not.toMatch(/Time's up/);
  });
});
