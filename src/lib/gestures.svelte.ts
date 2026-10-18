// Touch gestures on the day view: swipe sideways to go to the next or previous day, pull down
// from the top to refresh. Touch events (not pointer events) because the browser keeps sending
// them while it scrolls, so a gesture can be told apart from a scroll as it happens.

import type { Planner } from './planner.svelte';

/** How far (px, finger travel) a swipe has to go to change day; a quick flick needs less. */
const SWIPE = 70;
const FLICK = 35;
const FLICK_MS = 250;
/** How far (px, after resistance) a pull has to go to refresh. */
export const PULL = 72;
const PULL_MAX = 110;
/** Finger travel before deciding whether this is a swipe, a pull, or just a scroll. */
const DECIDE = 10;

class Gestures {
  /** Horizontal offset of the day while a finger is dragging it. */
  dx = $state(0);
  /** Pull-down distance (with resistance). */
  pull = $state(0);
  dragging = $state(false);
  refreshing = $state(false);
  /** Where the day was when a swipe let go, so the slide to the next day starts from there. */
  releaseDx = 0;
}

export const gestures = new Gestures();

/** Attach to the page. Returns the cleanup. */
export function dayGestures(p: Planner) {
  return (el: HTMLElement) => {
    let x0 = 0,
      y0 = 0,
      t0 = 0,
      tracking = false,
      mode: 'swipe' | 'pull' | 'scroll' | null = null;

    const start = (e: TouchEvent) => {
      tracking = false;
      if (e.touches.length !== 1 || p.sheet || p.drag || gestures.refreshing) return;
      // Capsules have their own long-press drag, and form fields need their own touches.
      if ((e.target as Element).closest('input, textarea, select, [data-no-swipe]')) return;
      tracking = true;
      mode = null;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      t0 = Date.now();
    };

    const move = (e: TouchEvent) => {
      if (!tracking) return;
      if (p.drag || e.touches.length !== 1) return cancel();
      const dx = e.touches[0].clientX - x0,
        dy = e.touches[0].clientY - y0;
      if (!mode) {
        if (Math.abs(dx) < DECIDE && Math.abs(dy) < DECIDE) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.3) mode = 'swipe';
        else if (dy > 0 && window.scrollY <= 0) mode = 'pull';
        else mode = 'scroll';
        gestures.dragging = mode !== 'scroll';
      }
      if (mode === 'swipe') {
        if (e.cancelable) e.preventDefault();
        gestures.dx = dx;
      } else if (mode === 'pull') {
        if (e.cancelable) e.preventDefault();
        gestures.pull = Math.max(0, Math.min(PULL_MAX, dy * 0.5));
      }
    };

    const end = () => {
      if (!tracking) return;
      tracking = false;
      gestures.dragging = false;
      if (mode === 'swipe') {
        const travel = gestures.dx;
        const quick = Date.now() - t0 < FLICK_MS;
        if (Math.abs(travel) >= SWIPE || (quick && Math.abs(travel) >= FLICK)) {
          // Finger moves left → the next day. Hold the day where it is until the slide takes over.
          gestures.releaseDx = travel;
          void p.step(travel < 0 ? 1 : -1).then(() => (gestures.dx = 0));
        } else gestures.dx = 0;
      } else if (mode === 'pull') {
        if (gestures.pull >= PULL) {
          gestures.refreshing = true;
          gestures.pull = PULL;
          p.say('Refreshing');
          void p.flush().then(() => location.reload());
        } else gestures.pull = 0;
      }
      mode = null;
    };

    const cancel = () => {
      tracking = false;
      mode = null;
      gestures.dragging = false;
      gestures.dx = 0;
      if (!gestures.refreshing) gestures.pull = 0;
    };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', cancel);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', cancel);
    };
  };
}
