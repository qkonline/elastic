import { describe, expect, it } from 'vitest';
import { alertGroups, cleanEmail, cleanName, deviceLabel, MAX_RECORD, patches } from './checks';

describe('cleanEmail', () => {
  it('tidies an address and refuses what is not one', () => {
    expect(cleanEmail('  Kai@Example.COM ')).toBe('kai@example.com');
    expect(cleanEmail('not an email')).toBeNull();
    expect(cleanEmail('a@b')).toBeNull();
    expect(cleanEmail(42)).toBeNull();
  });
});

describe('cleanName', () => {
  it('trims and squeezes a name, and refuses an empty or very long one', () => {
    expect(cleanName('  Qaisar   Khan ')).toBe('Qaisar Khan');
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('x'.repeat(61))).toBeNull();
    expect(cleanName(7)).toBeNull();
  });
});

describe('deviceLabel', () => {
  it('names the browser and device a passkey was made on', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari on iPhone');
    expect(
      deviceLabel(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome on Mac');
    expect(
      deviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      ),
    ).toBe('Edge on Windows');
    expect(deviceLabel(null)).toBeNull();
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
  it('takes changes to days, series and settings as paths with clocks', () => {
    const c = '00000000a000dev';
    const recs = [
      { kind: 'day', key: '2026-10-18', paths: { _: [true, c], 'i.a.f.title': ['Write', c] } },
      { kind: 'series', key: 'abc', paths: { _: [null, c] } },
    ];
    expect(patches(recs)).toEqual(recs);
  });
  it('refuses unknown kinds, paths without a clock and changes that are too big', () => {
    const c = '00000000a000dev';
    expect(patches([{ kind: 'user', key: 'x', paths: {} }])).toBeNull();
    expect(patches([{ kind: 'day', key: 'x', paths: { _: [true] } }])).toBeNull();
    expect(patches([{ kind: 'day', key: 'x', paths: { _: [true, ''] } }])).toBeNull();
    expect(patches([{ kind: 'day', key: 'x', paths: [1] }])).toBeNull();
    expect(patches([{ kind: 'day', key: 'x', paths: { 'f.s': ['x'.repeat(MAX_RECORD), c] } }])).toBeNull();
  });
});
