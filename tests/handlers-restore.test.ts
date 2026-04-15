/**
 * Tests for session restore wiring in registerIPCHandlers.
 * Verifies restoreSessions() is called at startup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock the SessionManager class to verify method calls
const mockRestoreSessions = vi.fn().mockReturnValue([]);

vi.mock('../src/session/manager.js', () => ({
  SessionManager: vi.fn(function (this: any) {
    this.restoreSessions = mockRestoreSessions;
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

vi.mock('../src/session/notification-manager.js', () => ({
  NotificationManager: vi.fn(function (this: any) {
    this.dispose = vi.fn();
  }),
}));

vi.mock('../src/config/loader.js', () => ({
  configLoader: {
    load: vi.fn(),
    getCliTypes: vi.fn().mockReturnValue([]),
    getCliTypeEntry: vi.fn(),
    getBindings: vi.fn(),
    getTelegramConfig: vi.fn().mockReturnValue({
      enabled: false,
      botToken: '',
      chatId: 0,
      instanceName: 'test',
      allowedUserIds: [],
    }),
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
vi.mock('../src/electron/ipc/telegram-handlers.js', () => ({
  setupTelegramHandlers: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock('../src/telegram/bot.js', () => ({
  TelegramBotCore: vi.fn(function (this: any) {
    this.start = vi.fn();
    this.stop = vi.fn();
    this.isRunning = vi.fn().mockReturnValue(false);
    this.on = vi.fn();
    this.removeListener = vi.fn();
    this.emit = vi.fn();
  }),
}));
vi.mock('../src/telegram/topic-manager.js', () => ({
  TopicManager: vi.fn(function (this: any) {
    this.ensureTopic = vi.fn();
    this.ensureAllTopics = vi.fn().mockResolvedValue(undefined);
    this.setInstanceName = vi.fn();
  }),
}));
vi.mock('../src/telegram/notifier.js', () => ({
  TelegramNotifier: vi.fn(function (this: any) {
    this.handleStateChange = vi.fn();
    this.dispose = vi.fn();
  }),
}));

vi.mock('../src/telegram/orchestrator.js', () => ({
  initTelegramModules: vi.fn().mockReturnValue({
    textInput: {},
    outputSummarizer: {},
    terminalMirror: {},
    dashboard: { start: vi.fn().mockResolvedValue(undefined), dispose: vi.fn() },
    feedPtyOutput: vi.fn(),
    cleanup: vi.fn(),
  }),
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

  it('logs restored session count', () => {
    mockRestoreSessions.mockReturnValueOnce([{ id: 's1' }, { id: 's2' }]);
    registerIPCHandlers(() => null);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Restored 2 session(s)'));
  });
});
