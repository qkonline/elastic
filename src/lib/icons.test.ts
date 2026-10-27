// Icons picked from a title (icons.ts): what entries like the ones people really have get, and
// the default when nothing fits.

import { describe, expect, it } from 'vitest';
import { DEFAULT_ICON, ICON_GROUPS, ICONS, iconFor, iconOf } from './icons';

describe('icons from a title', () => {
  it.each([
    ['Take supplements', 'pill-bottle'],
    ['Minoxidil', 'pipette'],
    ['Wash Face With Kojic Soap', 'smile'],
    ['8 glasses of water a day', 'glass-water'],
    ['Take Epuris', 'pill'],
    ['Ed video (Concept group)', 'video'],
    ['Hair Massage', 'hand'],
    ['Eye cream', 'eye'],
    ['Hair oil', 'droplet'],
    ['Breakfast', 'utensils'],
    ['Check email', 'mail'],
    ['Mathematics', 'calculator'],
    ['Udemy + Scrimba', 'graduation-cap'],
    ['Immigration Meeting + Humanitarian Visa', 'users'],
    ['Walk the dog', 'dog'],
    ['Brush teeth', 'smile'],
    ['Read 20 pages', 'book-open'],
    ['Pay rent', 'credit-card'],
    ['Fajr', 'moon-star'],
    ["Mum's birthday", 'gift'],
  ])('%s gets %s', (title, icon) => expect(iconFor(title)).toBe(icon));

  it('falls back to the default when nothing fits', () => {
    expect(iconFor('M1: Complexity')).toBe(DEFAULT_ICON);
    expect(iconFor('')).toBe(DEFAULT_ICON);
  });

  it('uses the icon chosen for an entry, and the title when that one is unknown', () => {
    expect(iconOf({ title: 'Water', icon: 'bike' })).toBe('bike');
    expect(iconOf({ title: 'Water', icon: 'no-such-icon' })).toBe('glass-water');
    expect(iconOf({ title: 'Water', icon: null })).toBe('glass-water');
  });

  it('offers every icon once to choose from', () => {
    const all = ICON_GROUPS.flatMap(([, names]) => names);
    expect(new Set(all).size).toBe(all.length);
    expect(Object.keys(ICONS).filter((k) => !all.includes(k as never))).toEqual([]);
  });
});

describe('a chosen icon', () => {
  it('goes with a repeating entry to its other days', async () => {
    const { newItem } = await import('./actions');
    const { itemFromSeries, seriesFromItem } = await import('./repeat');
    const s = seriesFromItem(
      newItem({ title: 'Hair massage', kind: 'check', icon: 'bath', repeat: 'Every day' }),
      '2026-10-27',
    );
    expect(s.icon).toBe('bath');
    expect(itemFromSeries(s, '2026-10-28').icon).toBe('bath');
    expect(iconOf(itemFromSeries({ ...s, icon: undefined }, '2026-10-28'))).toBe('hand');
  });
});
