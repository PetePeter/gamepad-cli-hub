import { describe, it, expect } from 'vitest';
import { formatHelmRef } from './helm-ref.js';

describe('formatHelmRef', () => {
  it('formats a session ref with label + meta', () => {
    expect(formatHelmRef('session', { label: 'boss', meta: 'claude-code', id: 'uuid-1' }))
      .toBe('helm session: "boss" (claude-code) id=uuid-1');
  });

  it('formats an artifact ref with a label only', () => {
    expect(formatHelmRef('artifact', { label: 'Auth Flow Audit', id: 'uuid-2' }))
      .toBe('helm artifact: "Auth Flow Audit" id=uuid-2');
  });

  it('formats a plan ref with a human id', () => {
    expect(formatHelmRef('plan', { label: 'Fix login', id: 'P-0003' }))
      .toBe('helm plan: "Fix login" id=P-0003');
  });

  it('omits the label cleanly when absent or blank', () => {
    expect(formatHelmRef('plan', { id: 'P-0003' })).toBe('helm plan: id=P-0003');
    expect(formatHelmRef('plan', { label: '  ', id: 'P-0003' })).toBe('helm plan: id=P-0003');
  });

  it('omits meta when absent', () => {
    expect(formatHelmRef('session', { label: 'x', id: 'u' })).toBe('helm session: "x" id=u');
  });
});
