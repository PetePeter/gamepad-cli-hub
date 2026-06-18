/**
 * Date format utilities — formatDate and formatDateTime.
 *
 * Tests verify correct formatting plus the empty-string guards for
 * missing/invalid input. Redundant calendar permutations (leap years, future
 * dates, every single/double-digit field) were dropped — they exercise the
 * same zero-pad path, not distinct behaviour.
 */

import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime } from '../../renderer/utils/date-format.js';

// ---------------------------------------------------------------------------
// formatDate — formats as yyyy/mm/dd
// ---------------------------------------------------------------------------

describe('formatDate', () => {
  it('formats timestamp as yyyy/mm/dd with zero-padded month/day', () => {
    const timestamp = new Date('2026-01-05T00:00:00Z').getTime();
    expect(formatDate(timestamp)).toBe('2026/01/05');
  });

  it('ignores time component of timestamp', () => {
    const t1 = new Date('2026-06-15T00:00:00Z').getTime();
    const t2 = new Date('2026-06-15T23:59:59Z').getTime();
    expect(formatDate(t1)).toBe('2026/06/15');
    expect(formatDate(t2)).toBe('2026/06/15');
  });

  it('returns empty string for undefined', () => {
    expect(formatDate(undefined)).toBe('');
  });

  it('returns empty string for 0 (epoch)', () => {
    expect(formatDate(0)).toBe('');
  });

  it('returns empty string for negative timestamp', () => {
    expect(formatDate(-1000)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// formatDateTime — formats as yyyy/mm/dd HH:mm
// ---------------------------------------------------------------------------

describe('formatDateTime', () => {
  it('formats timestamp as yyyy/mm/dd HH:mm', () => {
    const timestamp = new Date('2026-01-05T15:30:00Z').getTime();
    expect(formatDateTime(timestamp)).toBe('2026/01/05 15:30');
  });

  it('accepts Date object as input', () => {
    const dateObj = new Date('2026-06-15T09:45:00Z');
    expect(formatDateTime(dateObj)).toBe('2026/06/15 09:45');
  });

  it('accepts ISO string as input', () => {
    expect(formatDateTime('2026-12-25T23:59:00Z')).toBe('2026/12/25 23:59');
  });

  it('zero-pads single-digit hour and minute', () => {
    const timestamp = new Date('2026-05-10T08:05:00Z').getTime();
    expect(formatDateTime(timestamp)).toBe('2026/05/10 08:05');
  });

  it('returns empty string for undefined', () => {
    expect(formatDateTime(undefined)).toBe('');
  });

  it('returns empty string for null (treated as undefined)', () => {
    expect(formatDateTime(null as any)).toBe('');
  });

  it('returns empty string for invalid Date object', () => {
    expect(formatDateTime(new Date('invalid'))).toBe('');
  });

  it('returns empty string for invalid ISO string', () => {
    expect(formatDateTime('not-a-date')).toBe('');
  });

  it('returns empty string for 0 (epoch)', () => {
    expect(formatDateTime(0)).toBe('');
  });

  it('returns empty string for negative timestamp', () => {
    expect(formatDateTime(-1000)).toBe('');
  });

  it('ignores seconds and milliseconds', () => {
    const t1 = new Date('2026-05-10T15:30:00.000Z').getTime();
    const t2 = new Date('2026-05-10T15:30:59.999Z').getTime();
    expect(formatDateTime(t1)).toBe('2026/05/10 15:30');
    expect(formatDateTime(t2)).toBe('2026/05/10 15:30');
  });
});
