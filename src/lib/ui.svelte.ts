import { MediaQuery } from 'svelte/reactivity';

/** Desktop layout: wider grid, side-panel sheets, hover actions. Matches the CSS breakpoint. */
export const desktop = new MediaQuery('(min-width: 768px)', false);

/** Room for a task to open beside the plan instead of over it (iPad landscape and wider). */
export const dockable = new MediaQuery('(min-width: 1100px)', false);

/** Svelte transitions run as Web Animations, which the CSS reduced-motion rule doesn't reach. */
export const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)', false);

/** The device's light or dark setting (used when the theme follows the device). */
export const prefersDark = new MediaQuery('(prefers-color-scheme: dark)', false);

/**
 * A question that opens below the button that asked it (Done well over time, Postpone,
 * Reschedule) can land behind the bottom bar or off the screen on a phone, so the button seems
 * to do nothing: bring it into view. Use as an attachment.
 */
export function intoView(el: HTMLElement): void {
  requestAnimationFrame(() => {
    const r = el.getBoundingClientRect();
    const inSheet = !!el.closest('[role=dialog]');
    const top = inSheet ? 0 : (document.querySelector('header')?.getBoundingClientRect().bottom ?? 0);
    // The bottom bar is hidden (no boxes) on an iPad or computer, where the sidebar replaces it.
    const bar = document.querySelector('nav.bar');
    const bottom = inSheet || !bar?.getClientRects().length ? innerHeight : bar.getBoundingClientRect().top;
    if (r.top < top || r.bottom > bottom)
      el.scrollIntoView({ block: 'center', behavior: reducedMotion.current ? 'auto' : 'smooth' });
  });
}
