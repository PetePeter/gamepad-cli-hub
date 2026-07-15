/**
 * Tests for dropVerdict — the pure drag-and-drop decision logic that decides
 * what dropping a session card onto a group header does.
 */
import { describe, it, expect } from 'vitest';
import { dropVerdict } from '../renderer/runtime-group-drop';

describe('dropVerdict', () => {
  it('onto a runtime group the session is not in → add-to-group', () => {
    const v = dropVerdict({ kind: 'runtime', id: 'g1' }, 's1', 'X:\\dirA', null, 'Sweep');
    expect(v.ok).toBe(true);
    expect(v.action).toBe('add-to-group');
    expect(v.msg).toContain('Sweep');
  });

  it('onto the runtime group it is already in → rejected, no-op', () => {
    const v = dropVerdict({ kind: 'runtime', id: 'g1' }, 's1', 'X:\\dirA', 'g1', 'Sweep');
    expect(v.ok).toBe(false);
    expect(v.action).toBeUndefined();
  });

  it('onto a different runtime group → add-to-group (auto-evicts from prior)', () => {
    const v = dropVerdict({ kind: 'runtime', id: 'g2' }, 's1', 'X:\\dirA', 'g1', 'Other');
    expect(v.ok).toBe(true);
    expect(v.action).toBe('add-to-group');
  });

  it('onto its OWN folder while grouped → remove-from-group', () => {
    const v = dropVerdict({ kind: 'directory', id: 'X:\\dirA' }, 's1', 'X:\\dirA', 'g1', '', 'dirA');
    expect(v.ok).toBe(true);
    expect(v.action).toBe('remove-from-group');
    expect(v.msg).toContain('dirA');
  });

  it('onto its OWN folder while ungrouped → rejected', () => {
    const v = dropVerdict({ kind: 'directory', id: 'X:\\dirA' }, 's1', 'X:\\dirA', null);
    expect(v.ok).toBe(false);
    expect(v.action).toBeUndefined();
  });

  it('onto a DIFFERENT folder → rejected', () => {
    const v = dropVerdict({ kind: 'directory', id: 'X:\\dirB' }, 's1', 'X:\\dirA', 'g1');
    expect(v.ok).toBe(false);
    expect(v.action).toBeUndefined();
  });

  it('folder match is case-insensitive and trailing-slash tolerant', () => {
    const v = dropVerdict({ kind: 'directory', id: 'x:\\DIRA\\' }, 's1', 'X:\\dirA', 'g1', '', 'dirA');
    expect(v.ok).toBe(true);
    expect(v.action).toBe('remove-from-group');
  });
});
