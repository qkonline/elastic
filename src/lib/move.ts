// Moving the app to a new address (October 2026: kaiserkhan.com/planner/ → elastic.kaiserkhan.com).
// Browsers keep each address's storage apart, so the copy at the old address carries over what
// the new one can't see: its sign-in, as a one-time code from the worker good for two minutes,
// and this device's own settings. Both go in the fragment, which is never sent to a server.
// Before it goes, everything changed here reaches the account (Planner.moveHome()).

import type { Settings } from './types';

/** Set in the last build left at the old address (`.env.farewell`): where the app is now. */
export const MOVED_TO = import.meta.env.VITE_MOVED_TO ?? '';

type Carried = Partial<Pick<Settings, 'themePref' | 'alertOn' | 'notify' | 'checklistLayout' | 'habitsPlace'>>;

/** This device's own settings (the rest come from the account), as the new address accepts them. */
function carried(raw: Record<string, unknown>): Carried {
  const out: Carried = {};
  if (raw.themePref === 'match' || raw.themePref === 'light' || raw.themePref === 'dark') out.themePref = raw.themePref;
  if (typeof raw.alertOn === 'boolean') out.alertOn = raw.alertOn;
  if (typeof raw.notify === 'boolean') out.notify = raw.notify;
  if (raw.checklistLayout === 'list' || raw.checklistLayout === 'row') out.checklistLayout = raw.checklistLayout;
  if (raw.habitsPlace === 'checklist' || raw.habitsPlace === 'separate') out.habitsPlace = raw.habitsPlace;
  return out;
}

/** The new address, with the sign-in's one-time code (if signed in) and this device's settings. */
export function moveUrl(code: string | null, s: Settings): string {
  const d = {
    themePref: s.themePref,
    alertOn: s.alertOn,
    notify: s.notify,
    checklistLayout: s.checklistLayout,
    habitsPlace: s.habitsPlace,
  };
  const q = new URLSearchParams({ d: JSON.stringify(d) });
  if (code) q.set('handoff', code);
  // What the address asked for (?add from the Home Screen shortcut) goes too; ?fresh was the update.
  const ask = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  ask.delete('fresh');
  return `${MOVED_TO}${ask.size ? `?${ask}` : ''}#${q}`;
}

/** Arriving from the old address: what it sent, taken off the address bar at once. */
export function arrival(): { code: string | null; settings: Carried } | null {
  if (typeof location === 'undefined' || !/[#&](handoff|d)=/.test(location.hash)) return null;
  const q = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  let settings: Carried = {};
  try {
    settings = carried(JSON.parse(q.get('d') ?? '{}'));
  } catch {
    /* nothing usable */
  }
  return { code: q.get('handoff'), settings };
}

/** Opened from the Home Screen: that icon keeps the old address, so it needs adding again. */
export const installed = () =>
  typeof window !== 'undefined' &&
  (matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
