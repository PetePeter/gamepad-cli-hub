/**
 * Tests for session:close IPC handler routing through PtyManager.
 *
 * Verifies that session:close uses ptyManager.kill() instead of
 * raw process.kill(), preventing stale PTY entries.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock electron ipcMain before importing handler
const handlers = new Map<string, Function>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { setupSessionHandlers } from '../src/electron/ipc/session-handlers.js';
import type { SessionManager } from '../src/session/manager.js';
import type { PtyManager } from '../src/session/pty-manager.js';

function createMockSessionManager(sessions: Record<string, any> = {}): SessionManager {
  return {
    getSession: vi.fn((id: string) => sessions[id] ?? null),
    removeSession: vi.fn(),
    getAllSessions: vi.fn(() => Object.values(sessions)),
    setActiveSession: vi.fn(),
    getActiveSession: vi.fn(),
    renameSession: vi.fn(),
    stopHealthCheck: vi.fn(),
    hasSession: vi.fn((id: string) => id in sessions),
  } as unknown as SessionManager;
}

function createMockPtyManager(): PtyManager {
  return {
    kill: vi.fn(),
    has: vi.fn(),
    write: vi.fn(),
    spawn: vi.fn(),
    killAll: vi.fn(),
  } as unknown as PtyManager;
}

describe('session:close IPC handler', () => {
  let sessionManager: ReturnType<typeof createMockSessionManager>;
  let ptyManager: ReturnType<typeof createMockPtyManager>;

  beforeEach(() => {
    handlers.clear();
  });

  function setup(sessions: Record<string, any> = {}) {
    sessionManager = createMockSessionManager(sessions);
    ptyManager = createMockPtyManager();
    setupSessionHandlers(sessionManager, ptyManager);
  }

  it('calls ptyManager.kill() with session id', async () => {
    setup({
      'sess-1': { id: 'sess-1', name: 'Test', cliType: 'claude-code', processId: 9999 },
    });

    const handler = handlers.get('session:close')!;
    const result = await handler({}, 'sess-1');

    expect(ptyManager.kill).toHaveBeenCalledWith('sess-1');
    expect(result).toEqual({ success: true });
  });

  it('still removes session via sessionManager even if ptyManager.kill throws', async () => {
    setup({
      'sess-1': { id: 'sess-1', name: 'Test', cliType: 'claude-code', processId: 9999 },
    });

    (ptyManager.kill as any).mockImplementation(() => {
      throw new Error('PTY already dead');
    });

    const handler = handlers.get('session:close')!;
    const result = await handler({}, 'sess-1');

    expect(ptyManager.kill).toHaveBeenCalledWith('sess-1');
    expect(sessionManager.removeSession).toHaveBeenCalledWith('sess-1');
    expect(result).toEqual({ success: true });
  });

  it('returns error when session not found', async () => {
    setup(); // no sessions

    const handler = handlers.get('session:close')!;
    const result = await handler({}, 'nonexistent');

    expect(ptyManager.kill).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: 'Session not found' });
  });
});
