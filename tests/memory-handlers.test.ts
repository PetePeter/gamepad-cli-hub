import { describe, expect, it } from 'vitest';
import { resolveRendererMemorySession } from '../src/electron/ipc/memory-handlers.js';

describe('renderer memory owner resolution', () => {
  it('uses the single session mapped to a snapped-out child window', () => {
    expect(resolveRendererMemorySession(42, 1, ['session-child'], 'session-main')).toBe('session-child');
  });

  it('uses the active session only for the registered main window', () => {
    expect(resolveRendererMemorySession(1, 1, [], 'session-main')).toBe('session-main');
    expect(resolveRendererMemorySession(99, 1, [], 'session-main')).toBeNull();
  });

  it('rejects ambiguous or unmapped child windows', () => {
    expect(resolveRendererMemorySession(42, 1, [], 'session-main')).toBeNull();
    expect(resolveRendererMemorySession(42, 1, ['one', 'two'], 'session-main')).toBeNull();
  });
});
