/**
 * Tests for session resume logic in pty:spawn handler.
 * Verifies resume command resolution, fallback chain, and initialPrompt skipping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

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

const mockScheduleInitialPrompt = vi.fn(() => null);
vi.mock('../src/session/initial-prompt.js', () => ({
  scheduleInitialPrompt: (...args: any[]) => mockScheduleInitialPrompt(...args),
}));

import { setupPtyHandlers } from '../src/electron/ipc/pty-handlers.js';
import type { SessionManager } from '../src/session/manager.js';
import type { ConfigLoader, CliTypeConfig } from '../src/config/loader.js';

class MockPtyManager extends EventEmitter {
  has = vi.fn().mockReturnValue(true);
  write = vi.fn();
  spawn = vi.fn().mockReturnValue({ pid: 1234 });
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

class MockStateDetector extends EventEmitter {
  processOutput = vi.fn();
  dispose = vi.fn();
  removeSession = vi.fn();
  on = vi.fn((event: string, listener: Function) => {
    super.on(event, listener);
    return this;
  });
}

class MockPipelineQueue {
  enqueue = vi.fn();
  dequeue = vi.fn();
  getAll = vi.fn().mockReturnValue([]);
  getPosition = vi.fn();
  triggerHandoff = vi.fn();
}

describe('pty:spawn resume logic', () => {
  let ptyManager: MockPtyManager;
  let sessionManager: Record<string, any>;
  let configLoader: Record<string, any>;
  let sessions: Map<string, any>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();

    ptyManager = new MockPtyManager();
    sessions = new Map();
    sessionManager = {
      addSession: vi.fn((info: any) => sessions.set(info.id, info)),
      getSession: vi.fn((id: string) => sessions.get(id) || null),
      hasSession: vi.fn((id: string) => sessions.has(id)),
      removeSession: vi.fn(),
      on: vi.fn(),
    };
    configLoader = {
      getCliTypeEntry: vi.fn(),
    };

    setupPtyHandlers(
      ptyManager as any,
      new MockStateDetector() as any,
      sessionManager as any,
      new MockPipelineQueue() as any,
      () => null,
      configLoader as any,
    );
  });

  it('uses resumeCommand when resumeSessionName is provided', async () => {
    configLoader.getCliTypeEntry.mockReturnValue({
      name: 'Claude Code',
      command: 'claude',
      resumeCommand: 'claude --resume "{cliSessionName}"',
      renameCommand: '/rename {cliSessionName}',
      initialPromptDelay: 100,
    } as CliTypeConfig);

    const handler = handlers.get('pty:spawn')!;
    await handler({}, 'sid-1', 'claude', [], '/work', 'claude-code', undefined, 'hub-sid-1');

    // Should spawn with resume command
    expect(ptyManager.spawn).toHaveBeenCalledWith({
      sessionId: 'sid-1',
      command: 'claude',
      args: ['--resume', '"hub-sid-1"'],
      cwd: '/work',
    });
  });

  it('falls back to continueCommand when no resumeCommand but has continueCommand', async () => {
    configLoader.getCliTypeEntry.mockReturnValue({
      name: 'Claude Code',
      command: 'claude',
      continueCommand: 'claude --continue',
      initialPromptDelay: 100,
    } as CliTypeConfig);

    const handler = handlers.get('pty:spawn')!;
    // resumeSessionName provided but no resumeCommand → falls back to continueCommand
    await handler({}, 'sid-1', 'claude', [], '/work', 'claude-code', undefined, 'hub-sid-1');

    expect(ptyManager.spawn).toHaveBeenCalledWith({
      sessionId: 'sid-1',
      command: 'claude',
      args: ['--continue'],
      cwd: '/work',
    });
  });

  it('falls back to base command when no resumeCommand and no continueCommand', async () => {
    configLoader.getCliTypeEntry.mockReturnValue({
      name: 'Generic',
      command: 'bash',
    } as CliTypeConfig);

    const handler = handlers.get('pty:spawn')!;
    await handler({}, 'sid-1', 'bash', ['-l'], '/work', 'generic', undefined, 'hub-sid-1');

    // Should use original command and args
    expect(ptyManager.spawn).toHaveBeenCalledWith({
      sessionId: 'sid-1',
      command: 'bash',
      args: ['-l'],
      cwd: '/work',
    });
  });

  it('skips initialPrompt on resume', async () => {
    configLoader.getCliTypeEntry.mockReturnValue({
      name: 'Claude Code',
      command: 'claude',
      resumeCommand: 'claude --resume "{cliSessionName}"',
      renameCommand: '/rename {cliSessionName}',
      initialPrompt: [{ label: 'Init', sequence: '/init{Enter}' }],
      initialPromptDelay: 2000,
    } as CliTypeConfig);

    const handler = handlers.get('pty:spawn')!;
    await handler({}, 'sid-1', 'claude', [], '/work', 'claude-code', undefined, 'hub-sid-1');

    // scheduleInitialPrompt should be called WITHOUT initialPrompt items
    expect(mockScheduleInitialPrompt).toHaveBeenCalledWith(
      'sid-1',
      expect.objectContaining({
        renameCommand: '/rename hub-sid-1',
      }),
      expect.any(Function),
    );
    // The config passed should NOT have initialPrompt
    const config = mockScheduleInitialPrompt.mock.calls[0][1];
    expect(config.initialPrompt).toBeUndefined();
  });

  it('skips contextText on resume', async () => {
    configLoader.getCliTypeEntry.mockReturnValue({
      name: 'Claude Code',
      command: 'claude',
      resumeCommand: 'claude --resume "{cliSessionName}"',
      initialPromptDelay: 100,
    } as CliTypeConfig);

    const handler = handlers.get('pty:spawn')!;
    await handler({}, 'sid-1', 'claude', [], '/work', 'claude-code', 'some context text', 'hub-sid-1');

    // Context text should not be written
    expect(ptyManager.write).not.toHaveBeenCalledWith('sid-1', 'some context text');
  });

  it('sends renameCommand on resume (via scheduleInitialPrompt)', async () => {
    configLoader.getCliTypeEntry.mockReturnValue({
      name: 'Claude Code',
      command: 'claude',
      resumeCommand: 'claude --resume "{cliSessionName}"',
      renameCommand: '/rename {cliSessionName}',
      initialPromptDelay: 2000,
    } as CliTypeConfig);

    const handler = handlers.get('pty:spawn')!;
    await handler({}, 'sid-1', 'claude', [], '/work', 'claude-code', undefined, 'hub-sid-1');

    expect(mockScheduleInitialPrompt).toHaveBeenCalledWith(
      'sid-1',
      expect.objectContaining({
        renameCommand: '/rename hub-sid-1',
        initialPromptDelay: 2000,
      }),
      expect.any(Function),
    );
  });

  it('sets cliSessionName on session for fresh spawn', async () => {
    configLoader.getCliTypeEntry.mockReturnValue({
      name: 'Claude Code',
      command: 'claude',
    } as CliTypeConfig);

    const handler = handlers.get('pty:spawn')!;
    await handler({}, 'sid-1', 'claude', [], '/work', 'claude-code');

    const session = sessions.get('sid-1');
    expect(session.cliSessionName).toBe('hub-sid-1');
  });

  it('preserves resumeSessionName as cliSessionName on resume', async () => {
    configLoader.getCliTypeEntry.mockReturnValue({
      name: 'Claude Code',
      command: 'claude',
      resumeCommand: 'claude --resume "{cliSessionName}"',
    } as CliTypeConfig);

    const handler = handlers.get('pty:spawn')!;
    await handler({}, 'sid-1', 'claude', [], '/work', 'claude-code', undefined, 'hub-original-session');

    const session = sessions.get('sid-1');
    expect(session.cliSessionName).toBe('hub-original-session');
  });
});
