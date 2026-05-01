/**
 * Date format utilities — formatDate and formatDateTime.
 *
 * Tests verify correct formatting for timestamps, Date objects, and ISO strings.
 * Focus on zero-padding for months/days and handling of edge cases.
 */

import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime } from '../../renderer/utils/date-format.js';

// ---------------------------------------------------------------------------
// formatDate — formats as yyyy/mm/dd
// ---------------------------------------------------------------------------

describe('formatDate', () => {
  it('formats timestamp as yyyy/mm/dd with zero-padded month/day', () => {
    // 2026-01-05 (Jan 5, 2026 — midnight UTC)
    const timestamp = new Date('2026-01-05T00:00:00Z').getTime();
    expect(formatDate(timestamp)).toBe('2026/01/05');
  });

  it('zero-pads single-digit months', () => {
    // 2026-01-15 (Jan 15, 2026)
    const timestamp = new Date('2026-01-15T00:00:00Z').getTime();
    expect(formatDate(timestamp)).toBe('2026/01/15');
  });

  it('zero-pads single-digit days', () => {
    // 2026-03-05 (Mar 5, 2026)
    const timestamp = new Date('2026-03-05T00:00:00Z').getTime();
    expect(formatDate(timestamp)).toBe('2026/03/05');
  });

  it('formats double-digit month and day', () => {
    // 2026-12-25 (Dec 25, 2026 — Christmas)
    const timestamp = new Date('2026-12-25T00:00:00Z').getTime();
    expect(formatDate(timestamp)).toBe('2026/12/25');
  });

  it('ignores time component of timestamp', () => {
    // 2026-06-15 at various times should all format to same date
    const t1 = new Date('2026-06-15T00:00:00Z').getTime();
    const t2 = new Date('2026-06-15T12:30:45Z').getTime();
    const t3 = new Date('2026-06-15T23:59:59Z').getTime();

    expect(formatDate(t1)).toBe('2026/06/15');
    expect(formatDate(t2)).toBe('2026/06/15');
    expect(formatDate(t3)).toBe('2026/06/15');
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

  it('handles year 2000 (leap year)', () => {
    const timestamp = new Date('2000-02-29T00:00:00Z').getTime();
    expect(formatDate(timestamp)).toBe('2000/02/29');
  });

  it('handles year 1900 (non-leap year)', () => {
    const timestamp = new Date('1900-03-01T00:00:00Z').getTime();
    expect(formatDate(timestamp)).toBe('1900/03/01');
  });

  it('handles future dates', () => {
    const timestamp = new Date('2099-12-31T00:00:00Z').getTime();
    expect(formatDate(timestamp)).toBe('2099/12/31');
  });
});

// ---------------------------------------------------------------------------
// formatDateTime — formats as yyyy/mm/dd HH:mm
// ---------------------------------------------------------------------------

describe('formatDateTime', () => {
  it('formats timestamp as yyyy/mm/dd HH:mm', () => {
    // 2026-01-05 at 15:30
    const timestamp = new Date('2026-01-05T15:30:00Z').getTime();
    expect(formatDateTime(timestamp)).toBe('2026/01/05 15:30');
  });

  it('accepts Date object as input', () => {
    const dateObj = new Date('2026-06-15T09:45:00Z');
    expect(formatDateTime(dateObj)).toBe('2026/06/15 09:45');
  });

  it('accepts ISO string as input', () => {
    const isoString = '2026-12-25T23:59:00Z';
    expect(formatDateTime(isoString)).toBe('2026/12/25 23:59');
  });

  it('zero-pads single-digit hour', () => {
    const timestamp = new Date('2026-05-10T08:00:00Z').getTime();
    expect(formatDateTime(timestamp)).toBe('2026/05/10 08:00');
  });

  it('zero-pads single-digit minute', () => {
    const timestamp = new Date('2026-05-10T15:05:00Z').getTime();
    expect(formatDateTime(timestamp)).toBe('2026/05/10 15:05');
  });

  it('handles midnight (00:00)', () => {
    const timestamp = new Date('2026-03-15T00:00:00Z').getTime();
    expect(formatDateTime(timestamp)).toBe('2026/03/15 00:00');
  });

  it('handles 23:59', () => {
    const timestamp = new Date('2026-03-15T23:59:00Z').getTime();
    expect(formatDateTime(timestamp)).toBe('2026/03/15 23:59');
  });

  it('zero-pads month and day in date portion', () => {
    const timestamp = new Date('2026-01-05T10:30:00Z').getTime();
    expect(formatDateTime(timestamp)).toBe('2026/01/05 10:30');
  });

  it('returns empty string for undefined', () => {
    expect(formatDateTime(undefined)).toBe('');
  });

  it('returns empty string for null (as undefined)', () => {
    // Treating null like undefined
    expect(formatDateTime(null as any)).toBe('');
  });

  it('returns empty string for invalid Date object', () => {
    const invalidDate = new Date('invalid');
    expect(formatDateTime(invalidDate)).toBe('');
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

  it('handles Date object with morning time', () => {
    const dateObj = new Date('2026-07-20T06:30:00Z');
    expect(formatDateTime(dateObj)).toBe('2026/07/20 06:30');
  });

  it('handles ISO string with afternoon time', () => {
    expect(formatDateTime('2026-11-10T14:15:00Z')).toBe('2026/11/10 14:15');
  });

  it('handles year 2000 with specific time', () => {
    const timestamp = new Date('2000-02-29T12:00:00Z').getTime();
    expect(formatDateTime(timestamp)).toBe('2000/02/29 12:00');
  });

  it('ignores seconds in timestamp', () => {
    const t1 = new Date('2026-05-10T15:30:00Z').getTime();
    const t2 = new Date('2026-05-10T15:30:59Z').getTime();

    expect(formatDateTime(t1)).toBe('2026/05/10 15:30');
    expect(formatDateTime(t2)).toBe('2026/05/10 15:30');
  });

  it('ignores milliseconds in timestamp', () => {
    const t1 = new Date('2026-05-10T15:30:00.000Z').getTime();
    const t2 = new Date('2026-05-10T15:30:00.999Z').getTime();

    expect(formatDateTime(t1)).toBe('2026/05/10 15:30');
    expect(formatDateTime(t2)).toBe('2026/05/10 15:30');
  });
});
