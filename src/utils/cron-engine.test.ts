import { describe, expect, it } from 'vitest';
import { CronEngine } from './cron-engine.js';

function expectLocalDateTime(date: Date, year: number, month: number, day: number, hour: number, minute: number): void {
  expect(date.getFullYear()).toBe(year);
  expect(date.getMonth()).toBe(month - 1);
  expect(date.getDate()).toBe(day);
  expect(date.getHours()).toBe(hour);
  expect(date.getMinutes()).toBe(minute);
}

describe('CronEngine', () => {
  it('validates common five-field cron expressions', () => {
    expect(CronEngine.isValid('0 9 * * 1-5')).toBe(true);
    expect(CronEngine.isValid('30 2 * * 0')).toBe(true);
    expect(CronEngine.isValid('0 0 1 * *')).toBe(true);
  });

  it('rejects invalid cron expressions with a message', () => {
    expect(CronEngine.validate('99 99 99 99 99').valid).toBe(false);
    expect(CronEngine.validate('invalid').valid).toBe(false);
    expect(CronEngine.validate('').error).toBe('Cron expression is required');
  });

  it('computes the next weekday run after the current time', () => {
    const next = CronEngine.nextRunTime('0 9 * * 1-5', new Date(2026, 4, 4, 14, 30, 0));
    expectLocalDateTime(next, 2026, 5, 5, 9, 0);
  });

  it('skips weekends for weekday expressions', () => {
    const next = CronEngine.nextRunTime('0 9 * * 1-5', new Date(2026, 4, 8, 17, 0, 0));
    expectLocalDateTime(next, 2026, 5, 11, 9, 0);
  });

  it('returns null when the next run would exceed the end date', () => {
    const next = CronEngine.nextRunTimeBeforeDate(
      '0 0 * * *',
      new Date(2026, 4, 10, 0, 30, 0),
      new Date(2026, 4, 10, 23, 59, 59),
    );
    expect(next).toBeNull();
  });
});
