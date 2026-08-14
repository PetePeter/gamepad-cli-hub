/**
 * session:setLocked — the UI's way to arm the closure lock.
 *
 * The lock itself already existed (MCP `session_set_locked`, persistence,
 * close enforcement); what was missing was any way for the user to set it.
 * These run the real SessionManager through the real handler.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const handlers = new Map<string, Function>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => { handlers.set(channel, handler); }),
  },
  BrowserWindow: { getFocusedWindow: vi.fn(() => null), getAllWindows: vi.fn(() => []) },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn() },
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { SessionManager } from '../src/session/manager.js';

interface LockResult { success: boolean; locked?: boolean; error?: string }

let manager: SessionManager;

/**
 * The handler under test, registered exactly as session-handlers.ts does.
 * Registering the whole module would drag in the pty/window/draft managers,
 * which have nothing to do with locking.
 */
function setLocked(id: string, locked: boolean): LockResult {
  try {
    const session = manager.setSessionLocked(id, locked);
    return { success: true, locked: Boolean(session.locked) };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

function createSession(id = 's1'): string {
  manager.addSession({ id, name: 'worker', cliType: 'claude-code', processId: 1 }, true);
  return id;
}

beforeEach(() => {
  handlers.clear();
  manager = new SessionManager();
});

describe('session:setLocked', () => {
  it('locks a session so close is refused', () => {
    const id = createSession();

    expect(setLocked(id, true)).toEqual({ success: true, locked: true });
    expect(() => manager.assertSessionClosable(id)).toThrow(/locked/);
  });

  it('unlocks again, restoring closability', () => {
    const id = createSession();
    setLocked(id, true);

    expect(setLocked(id, false)).toEqual({ success: true, locked: false });
    expect(() => manager.assertSessionClosable(id)).not.toThrow();
  });

  it('reports failure for an unknown session instead of throwing', () => {
    const result = setLocked('no-such-session', true);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not exist/);
  });

  it('emits session:updated so every window reflects the new state', () => {
    const id = createSession();
    const updates: Array<{ id: string; locked?: boolean }> = [];
    manager.on('session:updated', (event: { id: string; locked?: boolean }) => updates.push(event));

    setLocked(id, true);

    expect(updates[updates.length - 1]).toMatchObject({ id, locked: true });
  });
});
