// Picking up a newer build: asked for as the app opens (it opens from the service worker's
// cache) and on coming back to it (at most hourly), and the reload waits until nothing is open
// on screen.

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from './db';

vi.mock('./update', () => ({
  newBuildOut: vi.fn(async () => newer),
  reloadToUpdate: vi.fn(async () => {}),
}));

let newer = true;
const { Planner } = await import('./planner.svelte');
const { newBuildOut, reloadToUpdate } = await import('./update');

type Lifecycle = { onHidden(): void; onVisible(): void };
const settle = () => new Promise((r) => setTimeout(r, 20));

async function boot() {
  const p = new Planner();
  await p.init();
  p.setSettings({ onboarded: true });
  return p;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 0));
  await db.closeDb();
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
  vi.clearAllMocks();
  newer = true;
});
afterEach(() => vi.useRealTimers());

describe('newer builds', () => {
  it('asks as the app opens, and not again within the hour', async () => {
    newer = false;
    const p = await boot();
    await settle();
    expect(newBuildOut).toHaveBeenCalledOnce();
    vi.setSystemTime(new Date(2026, 8, 25, 10, 30));
    (p as unknown as Lifecycle).onVisible();
    await settle();
    expect(newBuildOut).toHaveBeenCalledOnce();
    p.destroy();
  });

  it('takes a newer build as soon as the app opens, when nothing is under way', async () => {
    newer = false;
    (await boot()).destroy(); // a first visit: past the welcome
    await settle();
    vi.clearAllMocks();
    newer = true;
    const p = new Planner();
    await p.init();
    await settle();
    expect(reloadToUpdate).toHaveBeenCalledOnce();
    p.destroy();
  });

  it('reloads on coming back when a newer build is out', async () => {
    const p = await boot();
    vi.setSystemTime(new Date(2026, 8, 25, 11, 30));
    (p as unknown as Lifecycle).onVisible();
    await settle();
    expect(newBuildOut).toHaveBeenCalledOnce();
    expect(reloadToUpdate).toHaveBeenCalledOnce();
    p.destroy();
  });

  it('stays put when the build is current', async () => {
    newer = false;
    const p = await boot();
    vi.setSystemTime(new Date(2026, 8, 25, 11, 30));
    (p as unknown as Lifecycle).onVisible();
    await settle();
    expect(reloadToUpdate).not.toHaveBeenCalled();
    p.destroy();
  });

  it('waits while a sheet is open, then reloads once the app is out of sight', async () => {
    const p = await boot();
    p.openSheet({ type: 'add' });
    vi.setSystemTime(new Date(2026, 8, 25, 11, 30));
    (p as unknown as Lifecycle).onVisible();
    await settle();
    expect(reloadToUpdate).not.toHaveBeenCalled();
    p.closeSheet();
    (p as unknown as Lifecycle).onHidden();
    await settle();
    expect(reloadToUpdate).toHaveBeenCalledOnce();
    p.destroy();
  });
});
