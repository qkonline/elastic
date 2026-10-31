// Dragging a task out of Someday (the column beside the plan on a computer) onto a day. Whatever
// takes one carries data-drop-day="<day key>": the day on screen, the week strip's days, the
// week and month views' days, and Coming up. On the day's plan it lands in front of the timed
// task under the pointer (a rose line shows where; a check goes on the checklist), elsewhere at
// the end of that day. With a mouse, moving it picks it up; on a touch screen, press and hold it
// first (a quick move scrolls). A plain tap opens it, from the row's click (see `justDropped`).

import { vibrate } from './alert';
import type { Planner } from './planner.svelte';

const MOVE = 6;
const HOLD_MS = 350;
const SLOP = 8;

let droppedAt = 0;
/** The click that ends a drag isn't a tap. */
export const justDropped = () => Date.now() - droppedAt < 500;

export function dragSomeday(p: Planner, e: PointerEvent, id: string, title: string): void {
  if ((e.button && e.button !== 0) || p.drag) return;
  const touch = e.pointerType !== 'mouse';
  const untimed = p.someday.find((i) => i.id === id)?.kind === 'check';
  const x0 = e.clientX,
    y0 = e.clientY;
  let ghost: HTMLElement | null = null,
    line: HTMLElement | null = null,
    over: HTMLElement | null = null,
    before: string | null = null;

  const begin = () => {
    ghost = document.createElement('div');
    ghost.className = 'sd-ghost';
    ghost.textContent = title;
    document.body.append(ghost);
    line = document.createElement('div');
    line.className = 'sd-line';
    document.body.append(line);
    document.documentElement.classList.add('sd-dragging');
    vibrate(15);
  };
  const hold = touch ? setTimeout(begin, HOLD_MS) : 0;

  // Where it would land: the day under the pointer, and on the plan the task it goes before.
  const aim = (x: number, y: number) => {
    ghost!.style.transform = `translate(${x + 12}px, ${y + 10}px)`;
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-day]') ?? null;
    if (el !== over) {
      over?.classList.remove('drop-on');
      el?.classList.add('drop-on');
      over = el;
    }
    before = null;
    line!.style.display = 'none';
    // A check goes on the checklist, wherever it's dropped.
    if (!el || el.dataset.dropDay !== p.viewKey || !('dropPlan' in el.dataset) || untimed) return;
    for (const row of el.querySelectorAll<HTMLElement>('ol [data-drag-idx]')) {
      const r = row.getBoundingClientRect();
      const it = p.day.items[Number(row.dataset.dragIdx)];
      if (!it || it.status !== 'todo' || y > r.top + r.height / 2) continue;
      before = it.id;
      Object.assign(line!.style, {
        display: 'block',
        top: `${r.top - 1}px`,
        left: `${r.left}px`,
        width: `${r.width}px`,
      });
      return;
    }
  };

  const move = (ev: PointerEvent) => {
    if (!ghost) {
      const d = Math.hypot(ev.clientX - x0, ev.clientY - y0);
      if (!touch && d > MOVE) begin();
      else {
        if (d > SLOP) cleanup();
        return;
      }
    }
    ev.preventDefault();
    aim(ev.clientX, ev.clientY);
  };
  const noScroll = (ev: TouchEvent) => {
    if (ghost && ev.cancelable) ev.preventDefault();
  };
  const finish = (commit: boolean) => {
    const key = over?.dataset.dropDay;
    cleanup();
    if (!ghost) return;
    ghost.remove();
    line?.remove();
    over?.classList.remove('drop-on');
    document.documentElement.classList.remove('sd-dragging');
    droppedAt = Date.now();
    if (commit && key) void p.planSomeday(id, key, before);
  };
  const up = () => finish(true);
  const cancel = () => finish(false);
  const key = (ev: KeyboardEvent) => ev.key === 'Escape' && finish(false);
  const cleanup = () => {
    clearTimeout(hold);
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', cancel);
    removeEventListener('touchmove', noScroll);
    removeEventListener('keydown', key);
  };
  addEventListener('pointermove', move, { passive: false });
  addEventListener('pointerup', up);
  addEventListener('pointercancel', cancel);
  addEventListener('touchmove', noScroll, { passive: false });
  addEventListener('keydown', key);
}
