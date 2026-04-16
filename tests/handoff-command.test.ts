/**
 * Tests for configurable handoff command in pty-handlers state-change handler.
 *
 * Verifies that handoff writes the configured command from CliTypeConfig
 * instead of hardcoding 'go implement it\r'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock electron ipcMain and BrowserWindow
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

vi.mock('../src/session/initial-prompt.js', () => ({
  scheduleInitialPrompt: vi.fn(() => null),
}));

import { setupPtyHandlers } from '../src/electron/ipc/pty-handlers.js';
import type { SessionManager } from '../src/session/manager.js';
import type { ConfigLoader, CliTypeConfig } from '../src/config/loader.js';

/** Minimal PtyManager mock that is also an EventEmitter (for 'data', 'exit' events) */
class MockPtyManager extends EventEmitter {
  has = vi.fn().mockReturnValue(true);
  write = vi.fn();
  spawn = vi.fn();
  kill = vi.fn();
  killAll = vi.fn();
  resize = vi.fn();
  getPid = vi.fn();
  getSessionIds = vi.fn(() => []);
  on = vi.fn((event: string, listener: Function) => {
    super.on(event, listener);
    return this;
  });
}

/** Minimal StateDetector mock that is also an EventEmitter */
class MockStateDetector extends EventEmitter {
  processOutput = vi.fn();
  removeSession = vi.fn();
  dispose = vi.fn();
  markRestored = vi.fn();
  on = vi.fn((event: string, listener: Function) => {
    super.on(event, listener);
    return this;
  });
}

class MockPipelineQueue extends EventEmitter {
  triggerHandoff = vi.fn();
  enqueue = vi.fn();
  dequeue = vi.fn();
  getAll = vi.fn(() => []);
  getPosition = vi.fn(() => 0);
  has = vi.fn();
  clear = vi.fn();
}

function createMockSessionManager(sessions: Record<string, any> = {}): SessionManager {
  return {
    getSession: vi.fn((id: string) => sessions[id] ?? null),
    removeSession: vi.fn(),
    addSession: vi.fn(),
    getAllSessions: vi.fn(() => Object.values(sessions)),
    setActiveSession: vi.fn(),
    getActiveSession: vi.fn(),
    renameSession: vi.fn(),
    stopHealthCheck: vi.fn(),
    hasSession: vi.fn((id: string) => id in sessions),
  } as unknown as SessionManager;
}

function createMockConfigLoader(tools: Record<string, Partial<CliTypeConfig>> = {}): ConfigLoader {
  return {
    getCliTypeEntry: vi.fn((key: string) => tools[key] ?? null),
    getCliTypes: vi.fn(() => Object.keys(tools)),
    load: vi.fn(),
  } as unknown as ConfigLoader;
}

function createMockWindow() {
  return {
    isDestroyed: vi.fn(() => false),
    webContents: { send: vi.fn() },
  };
}

describe('Handoff command configuration', () => {
  let ptyManager: MockPtyManager;
  let stateDetector: MockStateDetector;
  let sessionManager: ReturnType<typeof createMockSessionManager>;
  let pipelineQueue: MockPipelineQueue;
  let configLoader: ReturnType<typeof createMockConfigLoader>;
  let mockWindow: ReturnType<typeof createMockWindow>;

  beforeEach(() => {
    handlers.clear();
    ptyManager = new MockPtyManager();
    stateDetector = new MockStateDetector();
    pipelineQueue = new MockPipelineQueue();
    mockWindow = createMockWindow();
  });

  function setup(
    sessions: Record<string, any>,
    tools: Record<string, Partial<CliTypeConfig>>,
  ) {
    sessionManager = createMockSessionManager(sessions);
    configLoader = createMockConfigLoader(tools);

    setupPtyHandlers(
      ptyManager as any,
      stateDetector as any,
      sessionManager,
      pipelineQueue as any,
      () => mockWindow as any,
      configLoader,
    );
  }

  function triggerHandoff(fromSessionId: string, toSessionId: string) {
    pipelineQueue.triggerHandoff.mockReturnValueOnce({
      fromSessionId,
      toSessionId,
    });

    // Emit state-change from the stateDetector to trigger the handoff logic
    stateDetector.emit('state-change', {
      sessionId: fromSessionId,
      previousState: 'implementing',
      newState: 'idle',
    });
  }

  it('writes configured handoffCommand when set in CLI type config', () => {
    setup(
      {
        'target-session': { id: 'target-session', name: 'Copilot', cliType: 'copilot-cli', processId: 100 },
        'source-session': { id: 'source-session', name: 'Claude', cliType: 'claude-code', processId: 200 },
      },
      {
        'copilot-cli': { name: 'Copilot', command: 'copilot', handoffCommand: 'please implement\r' },
        'claude-code': { name: 'Claude', command: 'claude' },
      },
    );

    triggerHandoff('source-session', 'target-session');

    expect(ptyManager.write).toHaveBeenCalledWith('target-session', 'please implement\r');
  });

  it('skips write when handoffCommand is not defined in CLI type config', () => {
    setup(
      {
        'target-session': { id: 'target-session', name: 'Terminal', cliType: 'generic-terminal', processId: 100 },
        'source-session': { id: 'source-session', name: 'Claude', cliType: 'claude-code', processId: 200 },
      },
      {
        'generic-terminal': { name: 'Terminal', command: 'bash' },
        'claude-code': { name: 'Claude', command: 'claude' },
      },
    );

    triggerHandoff('source-session', 'target-session');

    expect(ptyManager.write).not.toHaveBeenCalled();
  });

  it('backward compatibility: existing AI CLI configs without handoffCommand do NOT auto-inject', () => {
    setup(
      {
        'target-session': { id: 'target-session', name: 'Claude', cliType: 'claude-code', processId: 100 },
        'source-session': { id: 'source-session', name: 'Copilot', cliType: 'copilot-cli', processId: 200 },
      },
      {
        // Existing configs without handoffCommand
        'claude-code': { name: 'Claude Code', command: 'claude' },
        'copilot-cli': { name: 'Copilot', command: 'copilot' },
      },
    );

    triggerHandoff('source-session', 'target-session');

    // Should NOT write anything — no handoffCommand configured
    expect(ptyManager.write).not.toHaveBeenCalled();
  });

  it('still updates target session state to implementing when handoffCommand is set', () => {
    const targetSession = { id: 'target-session', name: 'Claude', cliType: 'claude-code', processId: 100 };
    setup(
      {
        'target-session': targetSession,
        'source-session': { id: 'source-session', name: 'Copilot', cliType: 'copilot-cli', processId: 200 },
      },
      {
        'claude-code': { name: 'Claude', command: 'claude', handoffCommand: 'go implement it\r' },
      },
    );

    triggerHandoff('source-session', 'target-session');

    expect(targetSession.state).toBe('implementing');
  });

  it('still emits pty:handoff event to renderer when handoffCommand is missing', () => {
    setup(
      {
        'target-session': { id: 'target-session', name: 'Terminal', cliType: 'generic-terminal', processId: 100 },
        'source-session': { id: 'source-session', name: 'Claude', cliType: 'claude-code', processId: 200 },
      },
      {
        'generic-terminal': { name: 'Terminal', command: 'bash' },
      },
    );

    triggerHandoff('source-session', 'target-session');

    // Handoff event should still be sent even without a command write
    expect(mockWindow.webContents.send).toHaveBeenCalledWith('pty:handoff', {
      fromSessionId: 'source-session',
      toSessionId: 'target-session',
    });
  });
});
