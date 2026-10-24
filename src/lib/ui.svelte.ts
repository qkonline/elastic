import { MediaQuery } from 'svelte/reactivity';

/** Desktop layout: wider grid, side-panel sheets, hover actions. Matches the CSS breakpoint. */
export const desktop = new MediaQuery('(min-width: 768px)', false);

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
    const bottom = inSheet
      ? innerHeight
      : (document.querySelector('nav.bar')?.getBoundingClientRect().top ?? innerHeight);
    if (r.top < top || r.bottom > bottom)
      el.scrollIntoView({ block: 'center', behavior: reducedMotion.current ? 'auto' : 'smooth' });
  });
}
