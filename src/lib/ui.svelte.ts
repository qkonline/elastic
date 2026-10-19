import { MediaQuery } from 'svelte/reactivity';

/** Desktop layout: wider grid, side-panel sheets, hover actions. Matches the CSS breakpoint. */
export const desktop = new MediaQuery('(min-width: 768px)', false);

/** Svelte transitions run as Web Animations, which the CSS reduced-motion rule doesn't reach. */
export const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)', false);

/** The device's light or dark setting (used when the theme follows the device). */
export const prefersDark = new MediaQuery('(prefers-color-scheme: dark)', false);
