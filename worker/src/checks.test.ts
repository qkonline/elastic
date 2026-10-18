import { describe, expect, it } from 'vitest';
import { alertGroups, changes, cleanEmail, MAX_RECORD } from './checks';

describe('cleanEmail', () => {
  it('tidies an address and refuses what is not one', () => {
    expect(cleanEmail('  Kai@Example.COM ')).toBe('kai@example.com');
    expect(cleanEmail('not an email')).toBeNull();
    expect(cleanEmail('a@b')).toBeNull();
    expect(cleanEmail(42)).toBeNull();
  });
});

describe('alertGroups', () => {
  const now = 1_790_000_000_000;
  const note = { title: "Time's up", body: 'Write', tag: 'timer-1' };
  it('takes groups within the next day, sorted', () => {
    const out = alertGroups(
      [
        { at: now + 120_000, notes: [note] },
        { at: now + 60_000, notes: [note] },
      ],
      now,
    );
    expect(out?.map((g) => g.at)).toEqual([now + 60_000, now + 120_000]);
  });
  it('refuses times too far ahead, empty groups and odd notes', () => {
    expect(alertGroups([{ at: now + 2 * 86_400_000, notes: [note] }], now)).toBeNull();
    expect(alertGroups([{ at: now + 1000, notes: [] }], now)).toBeNull();
    expect(alertGroups([{ at: now + 1000, notes: [{ title: 1, body: '', tag: '' }] }], now)).toBeNull();
    expect(alertGroups('nope', now)).toBeNull();
  });
});

describe('changes', () => {
  it('takes days, series and settings, with data as JSON or null to delete', () => {
    expect(
      changes([
        { kind: 'day', key: '2026-10-18', base: 0, data: { items: [] } },
        { kind: 'series', key: 'abc', base: 3, data: null },
      ]),
    ).toEqual([
      { kind: 'day', key: '2026-10-18', base: 0, data: '{"items":[]}' },
      { kind: 'series', key: 'abc', base: 3, data: null },
    ]);
  });
  it('refuses unknown kinds, bad versions and records that are too big', () => {
    expect(changes([{ kind: 'user', key: 'x', base: 0, data: {} }])).toBeNull();
    expect(changes([{ kind: 'day', key: 'x', base: -1, data: {} }])).toBeNull();
    expect(changes([{ kind: 'day', key: 'x', base: 0, data: [1] }])).toBeNull();
    expect(changes([{ kind: 'day', key: 'x', base: 0, data: { s: 'x'.repeat(MAX_RECORD) } }])).toBeNull();
  });
});
