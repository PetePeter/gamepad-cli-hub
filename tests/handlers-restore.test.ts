/**
 * Tests for session restore wiring in registerIPCHandlers.
 * Verifies restoreSessions() and startHealthCheck() are called at startup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock the SessionManager class to verify method calls
const mockRestoreSessions = vi.fn().mockReturnValue([]);
const mockStartHealthCheck = vi.fn();
const mockStopHealthCheck = vi.fn();

vi.mock('../src/session/manager.js', () => ({
  SessionManager: vi.fn(function (this: any) {
    this.restoreSessions = mockRestoreSessions;
    this.startHealthCheck = mockStartHealthCheck;
    this.stopHealthCheck = mockStopHealthCheck;
    this.on = vi.fn();
    this.getAllSessions = vi.fn().mockReturnValue([]);
    this.getSession = vi.fn();
    this.hasSession = vi.fn();
    this.addSession = vi.fn();
    this.removeSession = vi.fn();
    this.setActiveSession = vi.fn();
  }),
}));

vi.mock('../src/session/pty-manager.js', () => ({
  PtyManager: vi.fn(function (this: any) {
    this.on = vi.fn();
    this.spawn = vi.fn();
    this.write = vi.fn();
    this.kill = vi.fn();
    this.killAll = vi.fn();
    this.resize = vi.fn();
    this.has = vi.fn();
    this.getPid = vi.fn();
    this.getSessionIds = vi.fn(() => []);
  }),
}));

vi.mock('../src/session/state-detector.js', () => ({
  StateDetector: vi.fn(function (this: any) {
    this.on = vi.fn();
    this.dispose = vi.fn();
    this.processOutput = vi.fn();
    this.removeSession = vi.fn();
  }),
}));

vi.mock('../src/session/pipeline-queue.js', () => ({
  PipelineQueue: vi.fn(function (this: any) {
    this.enqueue = vi.fn();
    this.dequeue = vi.fn();
    this.getAll = vi.fn().mockReturnValue([]);
    this.getPosition = vi.fn();
    this.triggerHandoff = vi.fn();
  }),
}));

vi.mock('../src/config/loader.js', () => ({
  configLoader: {
    load: vi.fn(),
    getCliTypes: vi.fn().mockReturnValue([]),
    getCliTypeEntry: vi.fn(),
    getBindings: vi.fn(),
  },
}));

vi.mock('../src/output/keyboard.js', () => ({
  keyboard: {},
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock all the setup* functions
vi.mock('../src/electron/ipc/session-handlers.js', () => ({
  setupSessionHandlers: vi.fn().mockReturnValue(vi.fn()),
}));
vi.mock('../src/electron/ipc/config-handlers.js', () => ({
  setupConfigHandlers: vi.fn(),
}));
vi.mock('../src/electron/ipc/profile-handlers.js', () => ({
  setupProfileHandlers: vi.fn(),
}));
vi.mock('../src/electron/ipc/tools-handlers.js', () => ({
  setupToolsHandlers: vi.fn(),
}));
vi.mock('../src/electron/ipc/keyboard-handlers.js', () => ({
  setupKeyboardHandlers: vi.fn(),
}));
vi.mock('../src/electron/ipc/system-handlers.js', () => ({
  setupSystemHandlers: vi.fn(),
}));
vi.mock('../src/electron/ipc/pty-handlers.js', () => ({
  setupPtyHandlers: vi.fn(),
  cancelAllPrompts: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

import { registerIPCHandlers } from '../src/electron/ipc/handlers.js';
import { logger } from '../src/utils/logger.js';

describe('registerIPCHandlers restore wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls restoreSessions() on startup', () => {
    registerIPCHandlers(() => null);
    expect(mockRestoreSessions).toHaveBeenCalledOnce();
  });

  it('calls startHealthCheck with 30s interval', () => {
    registerIPCHandlers(() => null);
    expect(mockStartHealthCheck).toHaveBeenCalledWith(30000);
  });

  it('logs restored session count', () => {
    mockRestoreSessions.mockReturnValueOnce([{ id: 's1' }, { id: 's2' }]);
    registerIPCHandlers(() => null);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Restored 2 session(s)'));
  });

  it('cleanup stops health check', () => {
    const { cleanup } = registerIPCHandlers(() => null);
    cleanup();
    expect(mockStopHealthCheck).toHaveBeenCalledOnce();
  });
});
