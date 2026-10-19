// Reordering tasks by dragging. A task can be picked up two ways:
// - Its capsule: moving a finger (or the mouse) on it picks the task up straight away, and so
//   does holding it still for a moment. A plain tap opens the task sheet, from the capsule's
//   click event (see `tapped`): opening it on pointerup would let the same tap's click land on
//   whatever the new sheet puts under the finger.
// - The rest of the row, on touch screens: press and hold. A quick move there scrolls as usual.
// While dragging, the task follows the finger, a rose line marks where it will land, and the
// page scrolls when the finger nears the top or bottom of the screen. A row that runs sideways
// (the Checklist as a row of chips) drags along x instead, scrolling the row itself near its
// ends. An ended day can't be rearranged: trying to pick a task up there says so instead.

import { vibrate } from './alert';
import type { Planner } from './planner.svelte';

/** Movement on a capsule that starts a drag (px). */
const MOVE = 6;
/** Press-and-hold that picks a task up (ms). */
const HOLD_MS = 350;
/** Finger movement allowed while holding; more than this means the user is scrolling (px). */
const SLOP = 8;
/** Distance from the top/bottom edge where the page starts scrolling, and its top speed. */
const EDGE = 70;
const SPEED = 14;

/** When the last drag ended, so the click that follows it isn't taken as a tap. */
let dragEndedAt = 0;
export const justDragged = () => Date.now() - dragEndedAt < 500;

/** Capsule click: open the task sheet unless this click is the tail end of a drag. */
export function tapped(p: Planner, id: string): void {
  if (!justDragged()) p.openSheet({ type: 'task', id });
}

export function pickUp(
  p: Planner,
  e: PointerEvent,
  id: string,
  list: () => HTMLElement | null,
  from: 'capsule' | 'row',
  axis: 'x' | 'y' = 'y',
): void {
  if ((e.button && e.button !== 0) || p.drag) return;
  const touch = e.pointerType !== 'mouse';
  if (from === 'row' && !touch) return; // with a mouse, drag the capsule
  const x0 = e.clientX,
    y0 = e.clientY;
  // Along the drag: the pointer's position, and how far the page (or the row) has scrolled.
  const at = (ev: PointerEvent) => (axis === 'x' ? ev.clientX : ev.clientY);
  const scrolled = () => (axis === 'x' ? (list()?.scrollLeft ?? 0) : window.scrollY);
  const p0 = at(e),
    scroll0 = scrolled();
  let started = false,
    last = p0,
    frame = 0;

  const begin = () => {
    if (p.locked) {
      cleanup();
      p.sayLocked();
      return;
    }
    started = true;
    p.drag = { id, over: null, dy: 0, h: rowSize(p, list(), id, axis) };
    vibrate(15);
  };
  const hold = setTimeout(() => {
    if (!started) begin();
  }, HOLD_MS);

  // Place the task under the finger and work out where it would land.
  const follow = () => {
    p.dragMove(last - p0 + (scrolled() - scroll0), dropIndex(p, last, list(), id, axis));
  };
  // Keep scrolling while the finger rests near an edge, not only while it moves.
  const edgeScroll = () => {
    frame = 0;
    if (!started) return;
    let lo: number, hi: number;
    if (axis === 'x') {
      const r = list()?.getBoundingClientRect();
      if (!r) return;
      lo = r.left;
      hi = r.right;
    } else {
      lo = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 62;
      hi = window.innerHeight;
    }
    const back = lo + EDGE - last,
      ahead = last - (hi - EDGE);
    const v = back > 0 ? -Math.min(SPEED, back / 4) : ahead > 0 ? Math.min(SPEED, ahead / 4) : 0;
    if (!v) return;
    if (axis === 'x') list()?.scrollBy(v, 0);
    else window.scrollBy(0, v);
    follow();
    frame = requestAnimationFrame(edgeScroll);
  };

  const move = (ev: PointerEvent) => {
    last = at(ev);
    if (!started) {
      const d = Math.hypot(ev.clientX - x0, ev.clientY - y0);
      if (from === 'capsule' && d > MOVE) begin();
      else {
        if (d > SLOP) cleanup(); // moved before the hold finished: it's a scroll or a swipe
        return;
      }
    }
    ev.preventDefault();
    follow();
    if (!frame) frame = requestAnimationFrame(edgeScroll);
  };
  // Once a task is up, the finger moves the task, not the page.
  const noScroll = (ev: TouchEvent) => {
    if (started && ev.cancelable) ev.preventDefault();
  };
  const finish = (commit: boolean) => {
    cleanup();
    if (!started) return;
    dragEndedAt = Date.now();
    if (commit) p.commitDrag();
    else p.drag = null;
  };
  const up = () => finish(true);
  const cancel = () => finish(false);

  const cleanup = () => {
    clearTimeout(hold);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', cancel);
    removeEventListener('touchmove', noScroll);
  };
  addEventListener('pointermove', move, { passive: false });
  addEventListener('pointerup', up);
  addEventListener('pointercancel', cancel);
  addEventListener('touchmove', noScroll, { passive: false });
}

const rowOf = (p: Planner, root: HTMLElement | null, id: string) =>
  root?.querySelector<HTMLElement>(`[data-drag-idx="${p.day.items.findIndex((i) => i.id === id)}"]`) ?? null;

/** The lifted row's full size along the drag, margins included: the gap the others open. */
function rowSize(p: Planner, root: HTMLElement | null, id: string, axis: 'x' | 'y'): number {
  const el = rowOf(p, root, id);
  if (!el) return 60;
  const cs = getComputedStyle(el);
  if (axis === 'x') {
    const gap = root ? parseFloat(getComputedStyle(root).columnGap) || 0 : 0;
    return el.offsetWidth + parseFloat(cs.marginLeft) + parseFloat(cs.marginRight) + gap;
  }
  return el.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
}

/**
 * The index the dragged task would be dropped before (items.length = the end). Uses each row's
 * place in the layout (offsetTop), which the sliding animation doesn't change, so the answer
 * doesn't flicker while rows move out of the way.
 */
function dropIndex(p: Planner, pos: number, root: HTMLElement | null, id: string, axis: 'x' | 'y'): number {
  const self = p.day.items.findIndex((i) => i.id === id);
  if (!root) return self;
  const r = root.getBoundingClientRect();
  const along = axis === 'x' ? pos - r.left + root.scrollLeft : pos - r.top;
  for (const el of root.querySelectorAll<HTMLElement>('[data-drag-idx]')) {
    const idx = Number(el.dataset.dragIdx);
    if (idx === self) continue; // the lifted task moves with the finger; measure the others
    const mid = axis === 'x' ? el.offsetLeft + el.offsetWidth / 2 : el.offsetTop + el.offsetHeight / 2;
    if (along < mid) return idx;
  }
  return p.day.items.length;
}
