import { describe, expect, it } from 'vitest';
import { stepLines } from './steps';

describe('stepLines', () => {
  it('makes one step per line and drops blank lines', () => {
    expect(stepLines('Call the bank\n\n  Pay rent  \r\nBook flights\n')).toEqual([
      'Call the bank',
      'Pay rent',
      'Book flights',
    ]);
  });

  it('takes list marks off the start of each line', () => {
    expect(stepLines('- one\n* two\n• three\n1. four\n2) five\n- [ ] six\n[x] seven')).toEqual([
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
    ]);
  });

  it('keeps text that only looks like a mark', () => {
    expect(stepLines('-5 degrees\n2026 plan\n3.5 km run')).toEqual(['-5 degrees', '2026 plan', '3.5 km run']);
  });
});
