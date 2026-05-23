/**
 * Tests for the Telegram spawn wizard project selection step.
 * Covers pure helper functions that require no mocking of async dependencies.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { spawnProjectKeyboard, _resetPathRegistry } from '../src/telegram/keyboards.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// spawnProjectKeyboard
// ---------------------------------------------------------------------------

describe('spawnProjectKeyboard', () => {
  beforeEach(() => {
    _resetPathRegistry();
  });

  it('produces callback_data in spawn:project:{id} format', () => {
    const projects = [{ id: 'abc-123', name: 'MyProject' }];
    const rows = spawnProjectKeyboard(projects);

    const button = rows[0][0];
    expect(button.callback_data).toBe('spawn:project:abc-123');
  });

  it('labels buttons with the project name', () => {
    const projects = [{ id: 'x', name: 'ShortName' }];
    const rows = spawnProjectKeyboard(projects);

    expect(rows[0][0].text).toBe('ShortName');
  });

  it('truncates long project names', () => {
    const projects = [{ id: 'x', name: 'A'.repeat(30) }];
    const rows = spawnProjectKeyboard(projects);

    expect(rows[0][0].text.length).toBeLessThanOrEqual(15);
    expect(rows[0][0].text).toMatch(/…$/);
  });

  it('places at most 3 projects per row', () => {
    const projects = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    const rows = spawnProjectKeyboard(projects);

    // Last row is the Back button — check content rows
    const contentRows = rows.slice(0, -1);
    for (const row of contentRows) {
      expect(row.length).toBeLessThanOrEqual(3);
    }
  });

  it('always has a Back button pointing to spawn:start as the last row', () => {
    const projects = [{ id: 'a', name: 'A' }];
    const rows = spawnProjectKeyboard(projects);

    const lastRow = rows[rows.length - 1];
    expect(lastRow).toHaveLength(1);
    expect(lastRow[0].callback_data).toBe('spawn:start');
    expect(lastRow[0].text).toContain('Back');
  });

  it('returns only the Back row for empty projects list', () => {
    const rows = spawnProjectKeyboard([]);

    expect(rows).toHaveLength(1);
    expect(rows[0][0].callback_data).toBe('spawn:start');
  });

  it('fills rows with exactly 3 items before starting a new row', () => {
    const projects = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    const rows = spawnProjectKeyboard(projects);

    // 6 projects → 2 content rows of 3 + 1 back row
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveLength(3);
    expect(rows[1]).toHaveLength(3);
  });
});
